import { useEffect, useMemo, useState } from "react";

import pharmaPlaceholder from "../assets/img/pharma1.jpg";
import pub5 from "../assets/img/ads/pub5.jpg";

import {
  listerPharmacies,
  listerGardesPharmacie,
  creerPharmacie,
} from "../services/pharmacieService";
import { listerPays, listerVilles } from "../services/geoService";

// Page "Pharmacies" — annuaire des pharmacies, alimenté par l'API
// (module pharmacie) : liste publique + repérage des pharmacies de
// garde à l'instant présent, et formulaire de déclaration d'une
// nouvelle pharmacie (crée la fiche + le compte de l'agent qui en a
// la charge, voir pharmacieService.creerPharmacie).

const STATUT_PUBLIC = "publie"; // seules les fiches validées sont montrées au public

/* ===================================================================
 * Carte pharmacie
 * =================================================================== */

function PharmacyCard({ pharmacy, enGarde }) {
  const ville = pharmacy.ville?.nom;
  const pays = pharmacy.pays?.nom;
  const localisation = [ville, pays].filter(Boolean).join(" — ");

  return (
    <div className="pharmacy-card">
      <div className="pharmacy-photo">
        <img src={pharmacy.image_url || pharmaPlaceholder} alt={pharmacy.nom} />
      </div>
      <div>
        <span className={`pharmacy-status ${enGarde ? "is-garde" : "is-open"}`}>
          <i className={enGarde ? "fa-solid fa-moon" : "fa-solid fa-circle-check"} />{" "}
          {enGarde ? "De garde en ce moment" : "Fiche vérifiée"}
        </span>
        <h3>{pharmacy.nom}</h3>
        <div className="practitioner-meta">
          {localisation && (
            <>
              <span>
                <i className="fa-solid fa-location-dot" /> {localisation}
              </span>
              <span>&middot;</span>
            </>
          )}
          <span>
            <i className="fa-solid fa-id-card" /> N° ordre {pharmacy.numero_ordre_titulaire}
          </span>
        </div>
      </div>
      <div className="practitioner-actions" style={{ marginLeft: "auto" }}>
        <a href={`tel:${pharmacy.telephone}`} className="btn btn-urgence btn-sm-aps">
          <i className="fa-solid fa-phone" /> Appeler
        </a>
        <a href="#" className="btn btn-outline-primary btn-sm-aps">
          <i className="fa-solid fa-diamond-turn-right" /> Itinéraire
        </a>
      </div>
    </div>
  );
}

/* ===================================================================
 * Popup "Déclarer une pharmacie" — formulaire étape par étape
 * =================================================================== */

const ETAPES_DECLARATION = [
  { id: "pharmacie", titre: "La pharmacie" },
  { id: "localisation", titre: "Localisation" },
  { id: "agent", titre: "Agent responsable" },
  { id: "documents", titre: "Pièces justificatives" },
];

const CHAMPS_INITIAUX = {
  nom: "",
  telephone: "",
  pays_id: "",
  ville_id: "",
  numero_ordre_titulaire: "",
  latitude: "",
  longitude: "",
  fonction: "",
  agent_nom: "",
  agent_prenom: "",
  agent_email: "",
  agent_telephone: "",
};

function DeclarerPharmacieModal({ paysListe, onClose, onCreated }) {
  const [etape, setEtape] = useState(0);
  const [champs, setChamps] = useState(CHAMPS_INITIAUX);
  const [villesModal, setVillesModal] = useState([]);
  const [fichiers, setFichiers] = useState({
    image_pharmacie: null,
    piece_identite: null,
    document_agrement: null,
  });
  const [erreur, setErreur] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [resultat, setResultat] = useState(null); // réponse serveur après succès

  useEffect(() => {
    if (!champs.pays_id) {
      setVillesModal([]);
      return;
    }
    let annule = false;
    listerVilles(champs.pays_id)
      .then((data) => {
        if (!annule) setVillesModal(data.villes || []);
      })
      .catch(() => {
        if (!annule) setVillesModal([]);
      });
    return () => {
      annule = true;
    };
  }, [champs.pays_id]);

  function majChamp(nom, valeur) {
    setChamps((prev) => ({ ...prev, [nom]: valeur }));
  }

  function majFichier(nom, fichier) {
    setFichiers((prev) => ({ ...prev, [nom]: fichier }));
  }

  function validerEtape(indexEtape) {
    if (indexEtape === 0) {
      if (!champs.nom.trim() || !champs.telephone.trim() || !champs.numero_ordre_titulaire.trim()) {
        return "Merci de renseigner le nom, le téléphone et le numéro d'ordre du titulaire.";
      }
      if (!champs.pays_id || !champs.ville_id) {
        return "Merci de sélectionner le pays et la ville.";
      }
    }
    if (indexEtape === 1) {
      const latRenseignee = champs.latitude !== "";
      const lngRenseignee = champs.longitude !== "";
      if (latRenseignee !== lngRenseignee) {
        return "Latitude et longitude doivent être renseignées ensemble (ou laissées vides toutes les deux).";
      }
    }
    if (indexEtape === 2) {
      if (
        !champs.fonction.trim() ||
        !champs.agent_nom.trim() ||
        !champs.agent_prenom.trim() ||
        !champs.agent_email.trim()
      ) {
        return "Merci de renseigner la fonction et l'identité complète de l'agent responsable.";
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(champs.agent_email.trim())) {
        return "L'email de l'agent n'est pas valide.";
      }
    }
    if (indexEtape === 3) {
      if (!fichiers.image_pharmacie || !fichiers.piece_identite || !fichiers.document_agrement) {
        return "Les 3 pièces (photo, pièce d'identité, agrément) sont obligatoires.";
      }
    }
    return "";
  }

  function suivant() {
    const messageErreur = validerEtape(etape);
    if (messageErreur) {
      setErreur(messageErreur);
      return;
    }
    setErreur("");
    setEtape((e) => Math.min(e + 1, ETAPES_DECLARATION.length - 1));
  }

  function precedent() {
    setErreur("");
    setEtape((e) => Math.max(e - 1, 0));
  }

  async function envoyer() {
    const messageErreur = validerEtape(3);
    if (messageErreur) {
      setErreur(messageErreur);
      return;
    }
    setErreur("");
    setEnvoiEnCours(true);
    try {
      const reponse = await creerPharmacie({
        nom: champs.nom.trim(),
        telephone: champs.telephone.trim(),
        pays_id: champs.pays_id,
        ville_id: champs.ville_id,
        numero_ordre_titulaire: champs.numero_ordre_titulaire.trim(),
        latitude: champs.latitude === "" ? undefined : Number(champs.latitude),
        longitude: champs.longitude === "" ? undefined : Number(champs.longitude),
        fonction: champs.fonction.trim(),
        agent_nom: champs.agent_nom.trim(),
        agent_prenom: champs.agent_prenom.trim(),
        agent_email: champs.agent_email.trim(),
        agent_telephone: champs.agent_telephone.trim() || undefined,
        image_pharmacie: fichiers.image_pharmacie,
        piece_identite: fichiers.piece_identite,
        document_agrement: fichiers.document_agrement,
      });
      setResultat(reponse);
      onCreated?.();
    } catch (err) {
      setErreur(err?.message || "Une erreur est survenue lors de l'envoi. Merci de réessayer.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  // ─── Écran de confirmation (après succès) ────────────────────────
  if (resultat) {
    const motDePasse = resultat.agent?.mot_de_passe_temporaire;
    return (
      <ModalShell onClose={onClose} titre="Pharmacie déclarée">
        <div className="text-center" style={{ padding: "1rem 0" }}>
          <i
            className="fa-solid fa-circle-check"
            style={{ fontSize: "2.5rem", color: "var(--success, #2e7d32)" }}
          />
          <p style={{ marginTop: "1rem" }}>{resultat.message}</p>
        </div>

        {motDePasse && (
          <div
            className="alert-aps"
            style={{
              background: "#FFF7E6",
              border: "1px solid #F0C36D",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            <strong>Mot de passe temporaire de l'agent :</strong>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: "1.1rem",
                margin: ".5rem 0",
                userSelect: "all",
              }}
            >
              {motDePasse}
            </div>
            <p style={{ marginBottom: 0, fontSize: ".85rem" }}>
              Ce mot de passe ne sera plus jamais affiché : transmettez-le
              dès maintenant à l'agent responsable ({champs.agent_email}) par
              un canal sûr. Il devra le changer à sa première connexion.
            </p>
          </div>
        )}

        <p className="text-muted-soft" style={{ marginTop: "1rem", fontSize: ".9rem" }}>
          Votre fiche sera visible dans l'annuaire après vérification par un
          administrateur.
        </p>

        <button type="button" className="btn btn-primary btn-block-aps" onClick={onClose}>
          Fermer
        </button>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} titre="Déclarer une pharmacie">
      {/* Fil d'étapes */}
      <div className="d-flex justify-content-between mb-3" style={{ gap: ".5rem" }}>
        {ETAPES_DECLARATION.map((e, index) => (
          <div
            key={e.id}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: ".8rem",
              paddingBottom: ".5rem",
              borderBottom: index <= etape ? "3px solid var(--primary, #1c7c54)" : "3px solid #e5e5e5",
              color: index === etape ? "var(--ink)" : "var(--text-muted, #888)",
              fontWeight: index === etape ? 600 : 400,
            }}
          >
            {index + 1}. {e.titre}
          </div>
        ))}
      </div>

      {erreur && (
        <div
          className="alert-aps"
          style={{
            background: "#FDECEA",
            border: "1px solid #F5C6C1",
            borderRadius: 8,
            padding: ".75rem 1rem",
            marginBottom: "1rem",
            fontSize: ".9rem",
          }}
        >
          <i className="fa-solid fa-triangle-exclamation" /> {erreur}
        </div>
      )}

      {/* Étape 1 — informations de la pharmacie */}
      {etape === 0 && (
        <div className="d-flex flex-column gap-3">
          <div>
            <label className="form-label-aps" htmlFor="d-nom">
              Nom de la pharmacie
            </label>
            <input
              id="d-nom"
              className="form-control"
              value={champs.nom}
              onChange={(e) => majChamp("nom", e.target.value)}
              placeholder="Ex. Pharmacie du Centre"
            />
          </div>
          <div>
            <label className="form-label-aps" htmlFor="d-telephone">
              Téléphone
            </label>
            <input
              id="d-telephone"
              className="form-control"
              value={champs.telephone}
              onChange={(e) => majChamp("telephone", e.target.value)}
              placeholder="+237600000000"
            />
          </div>
          <div className="row g-3">
            <div className="col-6">
              <label className="form-label-aps" htmlFor="d-pays">
                Pays
              </label>
              <select
                id="d-pays"
                className="form-select"
                value={champs.pays_id}
                onChange={(e) => {
                  majChamp("pays_id", e.target.value);
                  majChamp("ville_id", "");
                }}
              >
                <option value="">Sélectionner…</option>
                {paysListe.map((p) => (
                  <option key={p.pays_id} value={p.pays_id}>
                    {p.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6">
              <label className="form-label-aps" htmlFor="d-ville">
                Ville
              </label>
              <select
                id="d-ville"
                className="form-select"
                value={champs.ville_id}
                onChange={(e) => majChamp("ville_id", e.target.value)}
                disabled={!champs.pays_id}
              >
                <option value="">Sélectionner…</option>
                {villesModal.map((v) => (
                  <option key={v.ville_id} value={v.ville_id}>
                    {v.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label-aps" htmlFor="d-ordre">
              Numéro d'ordre du titulaire
            </label>
            <input
              id="d-ordre"
              className="form-control"
              value={champs.numero_ordre_titulaire}
              onChange={(e) => majChamp("numero_ordre_titulaire", e.target.value)}
              placeholder="Numéro délivré par l'ordre des pharmaciens"
            />
          </div>
        </div>
      )}

      {/* Étape 2 — localisation (optionnelle) */}
      {etape === 1 && (
        <div className="d-flex flex-column gap-3">
          <p className="text-muted-soft" style={{ fontSize: ".9rem" }}>
            Facultatif : renseignez les coordonnées GPS pour que la
            pharmacie apparaisse précisément sur la carte. Vous pouvez
            passer cette étape.
          </p>
          <div className="row g-3">
            <div className="col-6">
              <label className="form-label-aps" htmlFor="d-lat">
                Latitude
              </label>
              <input
                id="d-lat"
                type="number"
                step="any"
                className="form-control"
                value={champs.latitude}
                onChange={(e) => majChamp("latitude", e.target.value)}
                placeholder="4.0511"
              />
            </div>
            <div className="col-6">
              <label className="form-label-aps" htmlFor="d-lng">
                Longitude
              </label>
              <input
                id="d-lng"
                type="number"
                step="any"
                className="form-control"
                value={champs.longitude}
                onChange={(e) => majChamp("longitude", e.target.value)}
                placeholder="9.7679"
              />
            </div>
          </div>
        </div>
      )}

      {/* Étape 3 — agent responsable */}
      {etape === 2 && (
        <div className="d-flex flex-column gap-3">
          <p className="text-muted-soft" style={{ fontSize: ".9rem" }}>
            Un compte est créé pour la personne qui aura la charge de cette
            pharmacie (pas forcément vous). Un mot de passe temporaire lui
            sera communiqué.
          </p>
          <div>
            <label className="form-label-aps" htmlFor="d-fonction">
              Fonction de l'agent
            </label>
            <input
              id="d-fonction"
              className="form-control"
              value={champs.fonction}
              onChange={(e) => majChamp("fonction", e.target.value)}
              placeholder="Ex. Titulaire, Pharmacien assistant"
            />
          </div>
          <div className="row g-3">
            <div className="col-6">
              <label className="form-label-aps" htmlFor="d-agent-nom">
                Nom
              </label>
              <input
                id="d-agent-nom"
                className="form-control"
                value={champs.agent_nom}
                onChange={(e) => majChamp("agent_nom", e.target.value)}
              />
            </div>
            <div className="col-6">
              <label className="form-label-aps" htmlFor="d-agent-prenom">
                Prénom
              </label>
              <input
                id="d-agent-prenom"
                className="form-control"
                value={champs.agent_prenom}
                onChange={(e) => majChamp("agent_prenom", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="form-label-aps" htmlFor="d-agent-email">
              Email
            </label>
            <input
              id="d-agent-email"
              type="email"
              className="form-control"
              value={champs.agent_email}
              onChange={(e) => majChamp("agent_email", e.target.value)}
            />
          </div>
          <div>
            <label className="form-label-aps" htmlFor="d-agent-telephone">
              Téléphone (facultatif)
            </label>
            <input
              id="d-agent-telephone"
              className="form-control"
              value={champs.agent_telephone}
              onChange={(e) => majChamp("agent_telephone", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Étape 4 — documents */}
      {etape === 3 && (
        <div className="d-flex flex-column gap-3">
          <p className="text-muted-soft" style={{ fontSize: ".9rem" }}>
            Les 3 pièces suivantes sont obligatoires. Votre fiche restera en
            attente de vérification tant qu'un administrateur ne l'a pas
            validée.
          </p>
          <ChampFichier
            id="d-image"
            label="Photo de la pharmacie"
            fichier={fichiers.image_pharmacie}
            onChange={(f) => majFichier("image_pharmacie", f)}
          />
          <ChampFichier
            id="d-piece-identite"
            label="Pièce d'identité du titulaire/responsable"
            fichier={fichiers.piece_identite}
            onChange={(f) => majFichier("piece_identite", f)}
          />
          <ChampFichier
            id="d-agrement"
            label="Agrément officiel d'exercice"
            fichier={fichiers.document_agrement}
            onChange={(f) => majFichier("document_agrement", f)}
          />
        </div>
      )}

      {/* Navigation */}
      <div className="d-flex justify-content-between mt-4">
        <button
          type="button"
          className="btn btn-outline-primary btn-sm-aps"
          onClick={etape === 0 ? onClose : precedent}
          disabled={envoiEnCours}
        >
          {etape === 0 ? "Annuler" : "Précédent"}
        </button>

        {etape < ETAPES_DECLARATION.length - 1 ? (
          <button type="button" className="btn btn-primary btn-sm-aps" onClick={suivant}>
            Suivant
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm-aps"
            onClick={envoyer}
            disabled={envoiEnCours}
          >
            {envoiEnCours ? "Envoi en cours…" : "Envoyer la demande"}
          </button>
        )}
      </div>
    </ModalShell>
  );
}

function ChampFichier({ id, label, fichier, onChange }) {
  return (
    <div>
      <label className="form-label-aps" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="file"
        className="form-control"
        accept="image/*,application/pdf"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
      {fichier && (
        <span className="text-muted-soft" style={{ fontSize: ".8rem" }}>
          <i className="fa-solid fa-paperclip" /> {fichier.name}
        </span>
      )}
    </div>
  );
}

function ModalShell({ titre, onClose, children }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.5)",
        zIndex: 1050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          maxWidth: 560,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "1.5rem",
        }}
      >
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h3 style={{ margin: 0, fontSize: "1.25rem" }}>{titre}</h3>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer" }}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ===================================================================
 * Page principale
 * =================================================================== */

export default function Pharmacie() {
  const [pharmacies, setPharmacies] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState("");

  const [paysListe, setPaysListe] = useState([]);
  const [villesListe, setVillesListe] = useState([]);

  const [paysId, setPaysId] = useState("");
  const [villeId, setVilleId] = useState("");
  const [recherche, setRecherche] = useState("");
  const [rechercheSaisie, setRechercheSaisie] = useState("");
  const [gardeOnly, setGardeOnly] = useState(false);

  const [gardePharmacieIds, setGardePharmacieIds] = useState(new Set());

  const [afficherModal, setAfficherModal] = useState(false);

  // Référentiel Pays (une fois)
  useEffect(() => {
    listerPays()
      .then((data) => setPaysListe(data.pays || []))
      .catch(() => setPaysListe([]));
  }, []);

  // Référentiel Villes (dépend du pays sélectionné dans les filtres)
  useEffect(() => {
    if (!paysId) {
      setVillesListe([]);
      setVilleId("");
      return;
    }
    let annule = false;
    listerVilles(paysId)
      .then((data) => {
        if (!annule) setVillesListe(data.villes || []);
      })
      .catch(() => {
        if (!annule) setVillesListe([]);
      });
    return () => {
      annule = true;
    };
  }, [paysId]);

  // Liste des pharmacies (fiches publiées uniquement)
  function chargerPharmacies() {
    setChargement(true);
    setErreurChargement("");
    listerPharmacies({
      pays_id: paysId || undefined,
      ville_id: villeId || undefined,
      recherche: recherche || undefined,
      statut_verification: STATUT_PUBLIC,
    })
      .then((data) => setPharmacies(data.pharmacies || []))
      .catch(() =>
        setErreurChargement("Impossible de charger les pharmacies pour le moment.")
      )
      .finally(() => setChargement(false));
  }

  useEffect(() => {
    chargerPharmacies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paysId, villeId, recherche]);

  // Pharmacies de garde à l'instant présent (pour le badge + le filtre)
  useEffect(() => {
    listerGardesPharmacie({ ville_id: villeId || undefined, date: new Date().toISOString() })
      .then((data) => {
        const ids = new Set((data.gardes || []).map((g) => g.pharmacie_id));
        setGardePharmacieIds(ids);
      })
      .catch(() => setGardePharmacieIds(new Set()));
  }, [villeId, pharmacies]);

  const listeAffichee = useMemo(() => {
    return gardeOnly
      ? pharmacies.filter((p) => gardePharmacieIds.has(p.pharmacie_id))
      : pharmacies;
  }, [pharmacies, gardeOnly, gardePharmacieIds]);

  function soumettreFiltres(e) {
    e.preventDefault();
    setRecherche(rechercheSaisie.trim());
  }

  return (
    <>
      {/* ============================ EN-TÊTE PAGE ============================ */}
      <section style={{ padding: "2.5rem 0 0" }}>
        <div className="container-aps">
          <span className="eyebrow">Annuaire</span>
          <h1 style={{ fontSize: "1.9rem", marginTop: ".5rem" }}>
            Trouver une pharmacie
          </h1>
          <p className="mt-2" style={{ maxWidth: 620 }}>
            Pharmacies vérifiées et pharmacies de garde près de chez vous,
            avec appel direct et itinéraire.
          </p>
        </div>
      </section>

      {/* ============================ FILTRES + RESULTATS + PUBLICITE ============================ */}
      <section style={{ paddingTop: "1.5rem" }}>
        <div className="container-aps">
          <div className="row g-4">
            {/* Colonne filtres */}
            <div className="col-md-3">
              <div className="filter-bar filter-sidebar">
                <h3 style={{ marginBottom: "1rem" }}>
                  <i className="fa-solid fa-sliders" /> Filtrer
                </h3>
                <form onSubmit={soumettreFiltres}>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-recherche">
                      Nom
                    </label>
                    <input
                      id="f-recherche"
                      className="form-control"
                      value={rechercheSaisie}
                      onChange={(e) => setRechercheSaisie(e.target.value)}
                      placeholder="Rechercher une pharmacie"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-pays">
                      Pays
                    </label>
                    <select
                      className="form-select"
                      id="f-pays"
                      value={paysId}
                      onChange={(e) => setPaysId(e.target.value)}
                    >
                      <option value="">Tous les pays</option>
                      {paysListe.map((p) => (
                        <option key={p.pays_id} value={p.pays_id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-ville">
                      Ville / Quartier
                    </label>
                    <select
                      className="form-select"
                      id="f-ville"
                      value={villeId}
                      onChange={(e) => setVilleId(e.target.value)}
                      disabled={!paysId}
                    >
                      <option value="">Toutes les villes</option>
                      {villesListe.map((v) => (
                        <option key={v.ville_id} value={v.ville_id}>
                          {v.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="d-flex flex-column gap-2 mb-3">
                    <label className="chip chip-verifie" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={gardeOnly}
                        onChange={(e) => setGardeOnly(e.target.checked)}
                        style={{ marginRight: ".35rem" }}
                      />
                      <i className="fa-solid fa-circle" /> Pharmacies de garde
                      uniquement
                    </label>
                  </div>
                  <button type="submit" className="btn btn-primary btn-block-aps">
                    <i className="fa-solid fa-magnifying-glass" /> Rechercher
                  </button>
                </form>
              </div>
            </div>

            {/* Colonne résultats */}
            <div className="col-md-6">
              <button
                type="button"
                className="btn btn-primary btn-block-aps mb-3"
                onClick={() => setAfficherModal(true)}
              >
                <i className="fa-solid fa-plus" /> Déclarer une pharmacie
              </button>

              <div className="results-toolbar" style={{ marginTop: 0 }}>
                <span className="text-muted-soft" style={{ fontSize: ".9rem" }}>
                  <strong style={{ color: "var(--ink)" }}>{listeAffichee.length}</strong>{" "}
                  pharmacies trouvées
                </span>
              </div>

              {chargement && <p className="text-muted-soft">Chargement des pharmacies…</p>}

              {!chargement && erreurChargement && (
                <p className="text-muted-soft">{erreurChargement}</p>
              )}

              {!chargement && !erreurChargement && listeAffichee.length === 0 && (
                <p className="text-muted-soft">Aucune pharmacie ne correspond à ces critères.</p>
              )}

              {!chargement &&
                !erreurChargement &&
                listeAffichee.map((p) => (
                  <PharmacyCard
                    key={p.pharmacie_id}
                    pharmacy={p}
                    enGarde={gardePharmacieIds.has(p.pharmacie_id)}
                  />
                ))}
            </div>

            {/* Colonne publicité */}
            <div className="col-md-3">
              <div className="ad-col">
                <div className="ad-card">
                  <div className="ad-label">
                    <span>Publicité</span>
                    <i className="fa-solid fa-circle-info" title="Emplacement commercial APS" />
                  </div>
                  <a href="#" aria-label="Nourishka Greenlife — Collagène">
                    <img src={pub5} alt="Nourishka Greenlife — Collagène" />
                  </a>
                  <div className="ad-card-body">
                    <h4>Nourishka Greenlife</h4>
                    <p>
                      Collagène : peau, cheveux, os, articulations. Disponible
                      chez Nourishka Greenlife, Akwa Carrefour Paris Dancing.
                    </p>
                    <a
                      href="https://wa.me/237699007730"
                      className="btn btn-outline-primary btn-sm-aps btn-block-aps"
                    >
                      <i className="fa-brands fa-whatsapp" /> Contacter
                    </a>
                  </div>
                </div>

                <div className="ad-slot-empty">
                  <i className="fa-solid fa-bullhorn" />
                  <p>
                    Cet emplacement est disponible pour les annonceurs
                    partenaires d'APS.
                  </p>
                  <a href="#" className="btn btn-primary btn-sm-aps btn-block-aps">
                    Réserver cet espace
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {afficherModal && (
        <DeclarerPharmacieModal
          paysListe={paysListe}
          onClose={() => setAfficherModal(false)}
          onCreated={chargerPharmacies}
        />
      )}
    </>
  );
}