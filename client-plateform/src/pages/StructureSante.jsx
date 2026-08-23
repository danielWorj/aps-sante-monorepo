import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import structure1 from "../assets/img/structure1.jpg";
import pub6 from "../assets/img/ads/pub6.jpg";
import "./../assets/styles/StructureSante.css";
// Services réels — voir src/services/structureSanteService.js (annuaire
// "structure_sante" : cliniques, hôpitaux, centres médicaux,
// dispensaires, laboratoires) et src/services/geoService.js
// (référentiels Pays / Ville, partagés par tous les modules annuaire).
import {
  TYPES_STRUCTURE,
  STATUTS_VERIFICATION_STRUCTURE,
  listerCentresSante,
  creerCentreSante,
} from "../services/structureSanteService";
import { listerPays, listerVilles } from "../services/geoService";

// Page "Structures de santé" — annuaire des hôpitaux, cliniques et
// centres de santé, avec leurs services et l'itinéraire.
const RESULTATS_PAR_PAGE = 10;

// Photo par défaut si le centre n'a pas (encore) d'image_url exploitable.
const PHOTO_PAR_DEFAUT = structure1;

// Habillage visuel (icône + couleur du badge) par type_structure — ces
// infos ne viennent pas du serveur (TYPES_STRUCTURE ne fournit que
// valeur/libelle), on les mappe donc localement.
const TYPE_META = {
  clinique: { cls: "is-clinique", icon: "fa-hospital" },
  hopital: { cls: "is-general", icon: "fa-hospital" },
  centre_medical: { cls: "is-centre", icon: "fa-house-medical" },
  dispensaire: { cls: "is-district", icon: "fa-briefcase-medical" },
  laboratoire: { cls: "is-chu", icon: "fa-flask" },
};

// Libellé lisible pour une valeur de TYPES_STRUCTURE (fallback : la
// valeur brute, au cas où le serveur renverrait un type inconnu du front).
function libelleType(valeur) {
  return TYPES_STRUCTURE.find((t) => t.valeur === valeur)?.libelle || valeur;
}

// Champs par défaut du formulaire "Ajouter une structure". Reflète
// exactement les champs attendus par POST /centres-sante (voir
// structureSanteService.js : creerCentreSante) — la création crée en
// une seule transaction le centre ET le compte de l'agent qui en aura
// la charge.
const FORMULAIRE_VIDE = {
  nom: "",
  telephone: "",
  pays_id: "",
  ville_id: "",
  type_structure: "",
  fonction: "",
  agent_nom: "",
  agent_prenom: "",
  agent_email: "",
  agent_telephone: "",
};

// Étapes du pop-up de création — même logique visuelle que la page
// Médecin : 1 (identité de la structure) -> 2 (identité du responsable)
// -> 3 (pièces justificatives) -> 4 (confirmation).
const ETAPES_MODAL = [
  { id: 1, libelle: "Structure" },
  { id: 2, libelle: "Responsable" },
  { id: 3, libelle: "Justificatifs" },
  { id: 4, libelle: "Confirmation" },
];

/* =====================================================================
   Carte résultat de l'annuaire
===================================================================== */
function StructureCard({ structure }) {
  const meta = TYPE_META[structure.type_structure] || { cls: "is-centre", icon: "fa-hospital" };
  const ville = structure.ville?.nom;
  const pays = structure.pays?.nom;

  return (
    <div className="structure-card">
      <div className="structure-photo">
        <img src={structure.image_url || PHOTO_PAR_DEFAUT} alt={structure.nom} />
      </div>
      <div>
        <div className="structure-card-top">
          <span className={`structure-type ${meta.cls}`}>
            <i className={`fa-solid ${meta.icon}`} /> {libelleType(structure.type_structure)}
          </span>
          {structure.statut_verification === "publie" && (
            <span className="chip chip-verifie">
              <i className="fa-solid fa-circle" /> Structure vérifiée
            </span>
          )}
        </div>
        <h3>{structure.nom}</h3>
        <div className="practitioner-meta">
          {(ville || pays) && (
            <span>
              <i className="fa-solid fa-location-dot" /> {[ville, pays].filter(Boolean).join(" — ")}
            </span>
          )}
        </div>
      </div>
      <div className="practitioner-actions" style={{ marginLeft: "auto" }}>
        {structure.telephone && (
          <a href={`tel:${structure.telephone}`} className="btn btn-urgence btn-sm-aps">
            <i className="fa-solid fa-phone" /> Appeler
          </a>
        )}
        <a
          href={
            structure.latitude && structure.longitude
              ? `https://www.google.com/maps/dir/?api=1&destination=${structure.latitude},${structure.longitude}`
              : "#"
          }
          target="_blank"
          rel="noreferrer"
          className="btn btn-outline-primary btn-sm-aps"
        >
          <i className="fa-solid fa-diamond-turn-right" /> Itinéraire
        </a>
      </div>
    </div>
  );
}

/* =====================================================================
   Barre d'étapes du pop-up — cercle vert plein (étape active / faite),
   cercle grisé (à venir), lignes de liaison entre les étapes.
===================================================================== */
function Stepper({ etape }) {
  return (
    <div className="dm-stepper" aria-label="Progression du formulaire">
      {ETAPES_MODAL.map((e, i) => (
        <Fragment key={e.id}>
          <div
            className={`dm-step ${etape === e.id ? "is-active" : ""} ${etape > e.id ? "is-done" : ""}`}
          >
            <span className="dm-step-dot">
              {etape > e.id ? <i className="fa-solid fa-check" /> : e.id}
            </span>
            <span className="dm-step-label">{e.libelle}</span>
          </div>
          {i < ETAPES_MODAL.length - 1 && (
            <div className={`dm-step-line ${etape > e.id ? "is-done" : ""}`} />
          )}
        </Fragment>
      ))}
    </div>
  );
}

/* =====================================================================
   Zone d'upload élégante — pointillés, icône à gauche, texte centré
   (même composant que sur la page Médecin).
===================================================================== */
function Dropzone({ id, label, icone, accept, fichier, onFichier, optionnel }) {
  const [survol, setSurvol] = useState(false);
  const inputRef = useRef(null);

  return (
    <div className="mb-3">
      <label className="form-label-aps" htmlFor={id}>
        {label}
        {!optionnel && <span className="dm-star" title="Obligatoire">*</span>}
      </label>
      <div
        className={`dropzone ${fichier ? "has-file" : ""} ${survol ? "is-dragover" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFichier(f);
        }}
      >
        <i className={`fa-solid ${icone} dropzone-icon`} />
        {fichier ? (
          <>
            <strong className="dropzone-title">{fichier.name}</strong>
            <span className="dropzone-hint">
              <i className="fa-solid fa-circle-check" /> Fichier prêt pour l'envoi
            </span>
          </>
        ) : (
          <>
            <strong className="dropzone-title">Glissez le fichier ici</strong>
            <span className="dropzone-hint">PDF, JPG — 5 Mo max</span>
          </>
        )}
        <button
          type="button"
          className="dropzone-remove"
          aria-label="Retirer le fichier"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (inputRef.current) inputRef.current.value = "";
            onFichier(null);
          }}
        >
          <i className="fa-solid fa-xmark" />
        </button>
        <input
          ref={inputRef}
          type="file"
          id={id}
          accept={accept}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onFichier(e.target.files?.[0] || null)}
        />
      </div>
    </div>
  );
}

/* =====================================================================
   Pop-up "Ajouter une structure" — formulaire en 4 étapes :
   1 Structure / 2 Responsable / 3 Justificatifs / 4 Confirmation.
   La création crée EN MÊME TEMPS le centre ET le compte de l'agent
   qui en aura la charge. 3 pièces justificatives obligatoires.
===================================================================== */
function AjouterStructureModal({ pays, onFermer }) {
  const [form, setForm] = useState(FORMULAIRE_VIDE);
  const [villes, setVilles] = useState([]);
  const [fichiers, setFichiers] = useState({
    image_structure: null,
    piece_identite: null,
    document_agrement: null,
  });
  const [etape, setEtape] = useState(1);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [resultat, setResultat] = useState(null); // { centreSante, agent } après succès

  useEffect(() => {
    if (!form.pays_id) {
      setVilles([]);
      return;
    }
    listerVilles(form.pays_id)
      .then((donnees) => setVilles(donnees.villes || []))
      .catch(() => setVilles([]));
  }, [form.pays_id]);

  function majChamp(champ, valeur) {
    setForm((f) => ({ ...f, [champ]: valeur }));
  }

  /* Validation manuelle étape par étape (pas de `required` natif :
     les champs des autres étapes ne sont pas montés). */
  function validerEtape(num) {
    if (num === 1) {
      if (
        !form.nom.trim() || !form.type_structure || !form.telephone.trim() ||
        !form.pays_id || !form.ville_id
      ) {
        return "Veuillez renseigner tous les champs de la structure (nom, type, téléphone, pays, ville).";
      }
    }
    if (num === 2) {
      if (
        !form.agent_nom.trim() || !form.agent_prenom.trim() ||
        !form.agent_email.trim() || !form.fonction.trim()
      ) {
        return "Veuillez renseigner le nom, le prénom, l'email et la fonction de l'agent responsable.";
      }
      if (!/^\S+@\S+\.\S+$/.test(form.agent_email)) {
        return "L'email de l'agent est invalide.";
      }
    }
    if (num === 3) {
      if (!fichiers.image_structure || !fichiers.piece_identite || !fichiers.document_agrement) {
        return "La photo de la structure, la pièce d'identité et le document d'agrément sont obligatoires.";
      }
    }
    return null;
  }

  function etapeSuivante() {
    const err = validerEtape(etape);
    if (err) { setErreur(err); return; }
    setErreur(null);
    setEtape((e) => Math.min(4, e + 1));
  }

  function etapePrecedente() {
    setErreur(null);
    setEtape((e) => Math.max(1, e - 1));
  }

  async function soumettre(e) {
    e.preventDefault();
    setErreur(null);
    // Garde-fou : revalide tout avant envoi et renvoie vers la 1ère étape en erreur.
    for (const num of [1, 2, 3]) {
      const err = validerEtape(num);
      if (err) { setErreur(err); setEtape(num); return; }
    }
    setEnvoi(true);
    try {
      const donnees = await creerCentreSante(form, fichiers);
      setResultat(donnees);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  const villeNom = villes.find((v) => v.ville_id === form.ville_id)?.nom;
  const paysNom = pays.find((p) => p.pays_id === form.pays_id)?.nom;

  return (
    <div className="dm-overlay" role="dialog" aria-modal="true" onClick={onFermer}>
      <div className="dm-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* ---------- En-tête ---------- */}
        <div className="dm-modal-head">
          <div className="dm-head-icon">
            <i className="fa-solid fa-hospital" />
          </div>
          <div className="dm-head-text">
            <h3>Ajouter une structure</h3>
            <p>Référencez votre hôpital, clinique ou centre de santé sur APS.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm-aps" onClick={onFermer} aria-label="Fermer">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {resultat ? (
          <div className="form-done">
            <div className="form-done-check">
              <i className="fa-solid fa-check" />
            </div>
            <p>
              Fiche structure créée avec succès pour <strong>{resultat.centreSante?.nom}</strong>.
              Elle sera visible dès la fin de la vérification.
            </p>
            <p className="dm-password-note">
              Mot de passe temporaire du compte agent (à communiquer une seule
              fois, non récupérable ensuite) : <code>{resultat.agent?.mot_de_passe_temporaire}</code>
            </p>
            <button type="button" className="btn btn-primary" onClick={onFermer}>
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={soumettre}>
            <Stepper etape={etape} />

            {/* ========== ÉTAPE 1 — Identité de la structure ========== */}
            {etape === 1 && (
              <>
                <div className="dm-section">Identité de la structure</div>
                <div className="row g-2">
                  <div className="col-12">
                    <label className="form-label-aps" htmlFor="as-nom">Nom de la structure</label>
                    {/* form-control : input texte SANS chevron */}
                    <input
                      className="form-control"
                      id="as-nom"
                      value={form.nom}
                      placeholder="Ex. Hôpital Général de Yaoundé"
                      onChange={(e) => majChamp("nom", e.target.value)}
                    />
                  </div>
                </div>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="as-type">Type de structure</label>
                    <select
                      className="form-select"
                      id="as-type"
                      value={form.type_structure}
                      onChange={(e) => majChamp("type_structure", e.target.value)}
                    >
                      <option value="">Sélectionner...</option>
                      {TYPES_STRUCTURE.map((t) => (
                        <option key={t.valeur} value={t.valeur}>{t.libelle}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="as-telephone">Téléphone</label>
                    <input
                      className="form-control"
                      id="as-telephone"
                      value={form.telephone}
                      placeholder="+237 2 XX XX XX XX"
                      onChange={(e) => majChamp("telephone", e.target.value)}
                    />
                  </div>
                </div>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="as-pays">Pays</label>
                    <select
                      className="form-select"
                      id="as-pays"
                      value={form.pays_id}
                      onChange={(e) => {
                        majChamp("pays_id", e.target.value);
                        majChamp("ville_id", "");
                      }}
                    >
                      <option value="">Sélectionner...</option>
                      {pays.map((p) => (
                        <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="as-ville">Ville</label>
                    <select
                      className="form-select"
                      id="as-ville"
                      value={form.ville_id}
                      onChange={(e) => majChamp("ville_id", e.target.value)}
                      disabled={!form.pays_id}
                    >
                      <option value="">Sélectionner...</option>
                      {villes.map((v) => (
                        <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* ========== ÉTAPE 2 — Identité du responsable ========== */}
            {etape === 2 && (
              <>
                <div className="dm-section">Agent responsable (son compte sera créé automatiquement)</div>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="as-agent-nom">Nom</label>
                    <input
                      className="form-control"
                      id="as-agent-nom"
                      value={form.agent_nom}
                      onChange={(e) => majChamp("agent_nom", e.target.value)}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="as-agent-prenom">Prénom</label>
                    <input
                      className="form-control"
                      id="as-agent-prenom"
                      value={form.agent_prenom}
                      onChange={(e) => majChamp("agent_prenom", e.target.value)}
                    />
                  </div>
                </div>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="as-agent-email">Email de l'agent</label>
                    <input
                      type="email"
                      className="form-control"
                      id="as-agent-email"
                      value={form.agent_email}
                      placeholder="agent@structure.cm"
                      onChange={(e) => majChamp("agent_email", e.target.value)}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="as-agent-telephone">Téléphone de l'agent (optionnel)</label>
                    <input
                      className="form-control"
                      id="as-agent-telephone"
                      value={form.agent_telephone}
                      onChange={(e) => majChamp("agent_telephone", e.target.value)}
                    />
                  </div>
                </div>
                <div className="row g-2">
                  <div className="col-12">
                    <label className="form-label-aps" htmlFor="as-fonction">Fonction de l'agent au sein de la structure</label>
                    <input
                      className="form-control"
                      id="as-fonction"
                      value={form.fonction}
                      placeholder="Ex. Gérant, Directeur médical"
                      onChange={(e) => majChamp("fonction", e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {/* ========== ÉTAPE 3 — Pièces justificatives ========== */}
            {etape === 3 && (
              <>
                <div className="dm-section">Documents justificatifs</div>
                <Dropzone
                  id="as-image"
                  label="Photo de la structure"
                  icone="fa-image"
                  accept="image/*"
                  fichier={fichiers.image_structure}
                  onFichier={(f) => setFichiers((s) => ({ ...s, image_structure: f }))}
                />
                <Dropzone
                  id="as-piece-identite"
                  label="Pièce d'identité"
                  icone="fa-id-card"
                  accept="image/*,.pdf"
                  fichier={fichiers.piece_identite}
                  onFichier={(f) => setFichiers((s) => ({ ...s, piece_identite: f }))}
                />
                <Dropzone
                  id="as-agrement"
                  label="Document d'agrément"
                  icone="fa-file-shield"
                  accept="image/*,.pdf"
                  fichier={fichiers.document_agrement}
                  onFichier={(f) => setFichiers((s) => ({ ...s, document_agrement: f }))}
                />
              </>
            )}

            {/* ========== ÉTAPE 4 — Confirmation (récapitulatif) ========== */}
            {etape === 4 && (
              <>
                <div className="dm-section">Récapitulatif avant création</div>
                <div className="dm-recap">
                  <div className="dm-recap-row">
                    <span>Structure</span>
                    <strong>{form.nom} — {libelleType(form.type_structure)}</strong>
                  </div>
                  <div className="dm-recap-row">
                    <span>Localisation</span>
                    <strong>{[villeNom, paysNom].filter(Boolean).join(" — ")}</strong>
                  </div>
                  <div className="dm-recap-row">
                    <span>Téléphone</span>
                    <strong>{form.telephone}</strong>
                  </div>
                  <div className="dm-recap-row">
                    <span>Agent responsable</span>
                    <strong>{form.agent_prenom} {form.agent_nom}</strong>
                  </div>
                  <div className="dm-recap-row">
                    <span>Email agent</span>
                    <strong>{form.agent_email}</strong>
                  </div>
                  {form.agent_telephone && (
                    <div className="dm-recap-row">
                      <span>Téléphone agent</span>
                      <strong>{form.agent_telephone}</strong>
                    </div>
                  )}
                  <div className="dm-recap-row">
                    <span>Fonction</span>
                    <strong>{form.fonction}</strong>
                  </div>
                  <div className="dm-recap-row">
                    <span>Pièces fournies</span>
                    <strong>
                      <i className="fa-solid fa-paperclip" />{" "}
                      {[
                        fichiers.image_structure?.name,
                        fichiers.piece_identite?.name,
                        fichiers.document_agrement?.name,
                      ].filter(Boolean).join(", ")}
                    </strong>
                  </div>
                </div>
              </>
            )}

            {erreur && (
              <div className="dm-error">
                <i className="fa-solid fa-triangle-exclamation" /> {erreur}
              </div>
            )}

            {/* ---------- Pied : navigation entre étapes ---------- */}
            <div className="dm-footer">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={envoi}
                onClick={etape > 1 ? etapePrecedente : onFermer}
              >
                {etape > 1 ? (<><i className="fa-solid fa-arrow-left" /> Précédent</>) : "Annuler"}
              </button>

              {etape < 4 ? (
                <button type="button" className="btn btn-primary" onClick={etapeSuivante}>
                  Continuer <i className="fa-solid fa-arrow-right" />
                </button>
              ) : (
                <button type="submit" className="btn btn-primary" disabled={envoi}>
                  {envoi ? (
                    <><i className="fa-solid fa-circle-notch fa-spin" /> Envoi...</>
                  ) : (
                    <><i className="fa-solid fa-paper-plane" /> Créer la fiche structure</>
                  )}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   Page principale
===================================================================== */
export default function StructureSante() {
  const [page, setPage] = useState(1);
  const [structures, setStructures] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [pays, setPays] = useState([]);
  const [villesFiltre, setVillesFiltre] = useState([]);
  const [filtres, setFiltres] = useState({
    pays_id: "",
    ville_id: "",
    type_structure: "",
    recherche: "",
  });
  const [popupOuvert, setPopupOuvert] = useState(false);

  /* Référentiels (pays) au montage — route publique. */
  useEffect(() => {
    listerPays()
      .then((donnees) => setPays(donnees.pays || []))
      .catch(() => setPays([]));
  }, []);

  /* Villes du filtre — dépendantes du pays sélectionné. */
  useEffect(() => {
    if (!filtres.pays_id) {
      setVillesFiltre([]);
      return;
    }
    listerVilles(filtres.pays_id)
      .then((donnees) => setVillesFiltre(donnees.villes || []))
      .catch(() => setVillesFiltre([]));
  }, [filtres.pays_id]);

  /* Chargement des structures — relancé à chaque changement de filtre. */
  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    listerCentresSante(filtres)
      .then((donnees) => {
        if (!annule) {
          setStructures(donnees || []);
          setPage(1);
        }
      })
      .catch((err) => {
        if (!annule) setErreur(err.message || "Impossible de charger l'annuaire des structures de santé.");
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, [filtres]);

  function soumettreFiltres(e) {
    e.preventDefault();
    // La recherche se relance automatiquement via le useEffect ci-dessus.
  }

  const totalPages = Math.max(1, Math.ceil(structures.length / RESULTATS_PAR_PAGE));
  const structuresPage = useMemo(
    () => structures.slice((page - 1) * RESULTATS_PAR_PAGE, page * RESULTATS_PAR_PAGE),
    [structures, page]
  );

  return (
    <>
      {/* ============================ EN-TÊTE PAGE ============================ */}
      <section style={{ padding: "2.5rem 0 0" }}>
        <div className="container-aps">
          <span className="eyebrow">Annuaire</span>
          <h1 style={{ fontSize: "1.9rem", marginTop: ".5rem" }}>
            Trouver une structure de santé
          </h1>
          <p className="mt-2" style={{ maxWidth: 620 }}>
            Hôpitaux, cliniques et centres de santé près de chez vous, avec
            leurs coordonnées, l'appel direct et l'itinéraire.
          </p>
        </div>
      </section>

      {/* ============================ FILTRES + RÉSULTATS + PUBLICITÉ ============================ */}
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
                    <label className="form-label-aps" htmlFor="f-type">Type de structure</label>
                    <select
                      className="form-select"
                      id="f-type"
                      value={filtres.type_structure}
                      onChange={(e) => setFiltres((f) => ({ ...f, type_structure: e.target.value }))}
                    >
                      <option value="">Tous les types</option>
                      {TYPES_STRUCTURE.map((t) => (
                        <option key={t.valeur} value={t.valeur}>{t.libelle}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-pays">Pays</label>
                    <select
                      className="form-select"
                      id="f-pays"
                      value={filtres.pays_id}
                      onChange={(e) => setFiltres((f) => ({ ...f, pays_id: e.target.value, ville_id: "" }))}
                    >
                      <option value="">Tous les pays</option>
                      {pays.map((p) => (
                        <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-ville">Ville</label>
                    <select
                      className="form-select"
                      id="f-ville"
                      value={filtres.ville_id}
                      onChange={(e) => setFiltres((f) => ({ ...f, ville_id: e.target.value }))}
                      disabled={!filtres.pays_id}
                    >
                      <option value="">Toutes les villes</option>
                      {villesFiltre.map((v) => (
                        <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label-aps" htmlFor="f-recherche">Nom de la structure</label>
                    {/* form-control : input texte SANS chevron */}
                    <input
                      type="text"
                      className="form-control"
                      id="f-recherche"
                      placeholder="Ex. Hôpital Général"
                      value={filtres.recherche}
                      onChange={(e) => setFiltres((f) => ({ ...f, recherche: e.target.value }))}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-block-aps">
                    <i className="fa-solid fa-magnifying-glass" /> Rechercher
                  </button>
                </form>
              </div>
            </div>

            {/* Colonne résultats */}
            <div className="col-md-6">
              <div className="d-flex justify-content-end mb-3">
                <button type="button" className="btn btn-primary" onClick={() => setPopupOuvert(true)}>
                  <i className="fa-solid fa-hospital" /> Ajouter une structure
                </button>
              </div>
              <div className="results-toolbar" style={{ marginTop: 0 }}>
                <span className="text-muted-soft" style={{ fontSize: ".9rem" }}>
                  <strong style={{ color: "var(--ink)" }}>{structures.length}</strong>{" "}
                  structures trouvées
                </span>
              </div>
              {chargement && (
                <div className="info-card" style={{ padding: "2rem", textAlign: "center" }}>
                  Chargement de l&apos;annuaire...
                </div>
              )}
              {!chargement && erreur && (
                <div className="info-card" style={{ padding: "2rem", textAlign: "center", color: "var(--danger, #c0392b)" }}>
                  {erreur}
                </div>
              )}
              {!chargement && !erreur && structures.length === 0 && (
                <div className="info-card" style={{ padding: "2rem", textAlign: "center" }}>
                  Aucune structure ne correspond à ces critères.
                </div>
              )}
              {!chargement && !erreur && structures.length > 0 && (
                <div>
                  {structuresPage.map((s) => (
                    <StructureCard key={s.structure_sante_id || s.id} structure={s} />
                  ))}
                  {totalPages > 1 && (
                    <nav aria-label="Pagination des résultats" className="mt-4">
                      <ul className="pagination justify-content-center">
                        <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                          <button type="button" className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                            Précédent
                          </button>
                        </li>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                          <li className={`page-item ${page === n ? "active" : ""}`} key={n}>
                            <button type="button" className="page-link" onClick={() => setPage(n)}>
                              {n}
                            </button>
                          </li>
                        ))}
                        <li className={`page-item ${page === totalPages ? "disabled" : ""}`}>
                          <button
                            type="button"
                            className="page-link"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          >
                            Suivant
                          </button>
                        </li>
                      </ul>
                    </nav>
                  )}
                </div>
              )}
            </div>

            {/* Colonne publicité */}
            <div className="col-md-3">
              <div className="ad-col">
                <div className="ad-card">
                  <div className="ad-label">
                    <span>Publicité</span>
                    <i className="fa-solid fa-circle-info" title="Emplacement commercial APS" />
                  </div>
                  <a href="#" aria-label="Tourisme Médical — Soignez-vous, voyagez, revivez">
                    <img src={pub6} alt="Tourisme Médical — Soignez-vous, voyagez, revivez" />
                  </a>
                  <div className="ad-card-body">
                    <h4>Tourisme Médical</h4>
                    <p>
                      Accédez à des soins de qualité à l'étranger : voyage,
                      hébergement et suivi post-soins inclus, jusqu'à -50%
                      moins cher qu'en Europe.
                    </p>
                    <a href="#" className="btn btn-outline-primary btn-sm-aps btn-block-aps">
                      <i className="fa-solid fa-plane" /> En savoir plus
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

      {popupOuvert && <AjouterStructureModal pays={pays} onFermer={() => setPopupOuvert(false)} />}
    </>
  );
}