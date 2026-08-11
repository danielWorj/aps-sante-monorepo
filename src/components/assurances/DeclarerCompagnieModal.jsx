// src/components/assurance/DeclarerCompagnieModal.jsx
//
// Pop-up "Déclarer une compagnie" — formulaire étape par étape pour
// POST /api/services-assurance (multipart/form-data). Ce formulaire
// crée à la fois la fiche annuaire ET le compte de l'agent responsable
// (voir assurance.controller.js / creerServiceAssurance) : un mot de
// passe temporaire est renvoyé une seule fois par le backend, à
// afficher immédiatement à l'utilisateur avant fermeture.

import { useState, useRef } from "react";
import { creerServiceAssurance } from "../../services/assuranceService";
import { listerPays, listerVilles } from "../../services/geoService";

const ETAPES = [
  { id: 1, label: "Identité" },
  { id: 2, label: "Coordonnées" },
  { id: 3, label: "Justificatif" },
  { id: 4, label: "Agent responsable" },
  { id: 5, label: "Récapitulatif" },
];

const ETAT_INITIAL = {
  type_acteur: "compagnie",
  nom: "",
  agrement: "",
  description: "",
  pays_id: "",
  ville_id: "",
  telephone: "",
  email: "",
  latitude: null,
  longitude: null,
  fonction: "",
  agent_nom: "",
  agent_prenom: "",
  agent_email: "",
  agent_telephone: "",
};

export default function DeclarerCompagnieModal({ open, onClose, onCreated }) {
  const [etape, setEtape] = useState(1);
  const [form, setForm] = useState(ETAT_INITIAL);
  const [fichierImage, setFichierImage] = useState(null);
  const [pays, setPays] = useState([]);
  const [villes, setVilles] = useState([]);
  const [geoStatus, setGeoStatus] = useState("idle"); // idle | loading | error | done
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null); // réponse serveur (fiche + agent)

  const paysCharges = useRef(false);

  if (!open) return null;

  const majChamp = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  const chargerPays = async () => {
    if (paysCharges.current || pays.length) return;
    paysCharges.current = true;
    try {
      const data = await listerPays();
      setPays(data.pays || []);
    } catch {
      // liste indisponible : le champ reste un simple texte libre plus bas
    }
  };

  const choisirPays = async (e) => {
    const pays_id = e.target.value;
    setForm((f) => ({ ...f, pays_id, ville_id: "" }));
    setVilles([]);
    if (!pays_id) return;
    try {
      const data = await listerVilles(pays_id);
      setVilles(data.villes || []);
    } catch {
      // liste indisponible
    }
  };

  const localiser = () => {
    if (!navigator.geolocation) {
      setGeoStatus("error");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }));
        setGeoStatus("done");
      },
      () => setGeoStatus("error")
    );
  };

  const validerEtape = () => {
    setErreur("");
    if (etape === 1) {
      if (!form.nom.trim() || !form.agrement.trim()) {
        setErreur("Dénomination et numéro d'agrément sont requis.");
        return false;
      }
    }
    if (etape === 2) {
      if (!form.pays_id || !form.ville_id || !form.telephone.trim() || !form.email.trim()) {
        setErreur("Pays, ville, téléphone et courriel sont requis.");
        return false;
      }
    }
    if (etape === 3) {
      if (!fichierImage) {
        setErreur("Le logo / la photo de la compagnie est requis.");
        return false;
      }
    }
    if (etape === 4) {
      if (
        !form.fonction.trim() ||
        !form.agent_nom.trim() ||
        !form.agent_prenom.trim() ||
        !form.agent_email.trim()
      ) {
        setErreur("Fonction, nom, prénom et courriel de l'agent responsable sont requis.");
        return false;
      }
    }
    return true;
  };

  const suivant = () => {
    if (!validerEtape()) return;
    if (etape === 1) chargerPays();
    setEtape((e) => Math.min(e + 1, ETAPES.length));
  };
  const precedent = () => {
    setErreur("");
    setEtape((e) => Math.max(e - 1, 1));
  };

  const soumettre = async () => {
    if (!validerEtape()) return;
    setEnvoi(true);
    setErreur("");
    try {
      const reponse = await creerServiceAssurance({
        ...form,
        latitude: form.latitude ?? undefined,
        longitude: form.longitude ?? undefined,
        image_assurance: fichierImage,
      });
      setResultat(reponse);
      onCreated?.(reponse.service_assurance);
    } catch (err) {
      setErreur(err.data?.message || err.message || "Échec de la création. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  };

  const fermerEtReinitialiser = () => {
    setForm(ETAT_INITIAL);
    setFichierImage(null);
    setResultat(null);
    setEtape(1);
    setErreur("");
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, .55)",
        zIndex: 1050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={fermerEtReinitialiser}
    >
      <div
        className="info-card"
        style={{ width: "100%", maxWidth: "640px", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {resultat ? (
          <>
            <h3>
              <i className="fa-solid fa-circle-check" /> Compagnie déclarée
            </h3>
            <p className="mt-2" style={{ fontSize: ".9rem" }}>{resultat.message}</p>
            <div className="banner-institutionnel mt-2">
              <i className="fa-solid fa-triangle-exclamation" />
              <span>
                Mot de passe temporaire de l'agent (affiché une seule fois — communiquez-le
                lui) : <strong>{resultat.agent?.mot_de_passe_temporaire}</strong>
              </span>
            </div>
            <p className="minimal-note mt-2 mb-0">
              <i className="fa-solid fa-circle-info" /> La fiche est soumise à vérification
              avant publication dans l'annuaire.
            </p>
            <button className="btn btn-primary btn-block-aps mt-3" onClick={fermerEtReinitialiser}>
              Fermer
            </button>
          </>
        ) : (
          <>
            <div className="d-flex justify-content-between align-items-start">
              <h3 style={{ marginBottom: "1rem" }}>
                <i className="fa-solid fa-building-shield" /> Déclarer une compagnie
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm-aps"
                onClick={fermerEtReinitialiser}
                aria-label="Fermer"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {/* Fil d'étapes */}
            <div className="d-flex gap-2 flex-wrap mb-3" style={{ fontSize: ".8rem" }}>
              {ETAPES.map((s) => (
                <span
                  key={s.id}
                  className={`chip ${s.id === etape ? "chip-premium" : "chip-complet"}`}
                >
                  {s.id}. {s.label}
                </span>
              ))}
            </div>

            {erreur && (
              <p className="minimal-note mb-2" style={{ color: "var(--danger, #c0392b)" }}>
                <i className="fa-solid fa-triangle-exclamation" /> {erreur}
              </p>
            )}

            {/* ÉTAPE 1 — Identité */}
            {etape === 1 && (
              <div>
                <div className="mb-2">
                  <label className="form-label-aps" htmlFor="da-type">Type d'acteur</label>
                  <select id="da-type" className="form-select" value={form.type_acteur} onChange={majChamp("type_acteur")}>
                    <option value="compagnie">Compagnie d'assurance</option>
                    <option value="courtier">Courtier</option>
                  </select>
                </div>
                <div className="mb-2">
                  <label className="form-label-aps" htmlFor="da-nom">Dénomination</label>
                  <input id="da-nom" className="form-control" value={form.nom} onChange={majChamp("nom")} required />
                </div>
                <div className="mb-2">
                  <label className="form-label-aps" htmlFor="da-agrement">Numéro d'agrément</label>
                  <input id="da-agrement" className="form-control" value={form.agrement} onChange={majChamp("agrement")} required />
                </div>
                <div className="mb-2">
                  <label className="form-label-aps" htmlFor="da-desc">Présentation (facultatif)</label>
                  <textarea id="da-desc" className="form-control" rows={3} value={form.description} onChange={majChamp("description")} />
                </div>
              </div>
            )}

            {/* ÉTAPE 2 — Coordonnées */}
            {etape === 2 && (
              <div>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="da-pays">Pays</label>
                    {pays.length ? (
                      <select id="da-pays" className="form-select" value={form.pays_id} onChange={choisirPays} required>
                        <option value="">Choisir…</option>
                        {pays.map((p) => (
                          <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="da-pays"
                        className="form-control"
                        placeholder="Identifiant pays"
                        value={form.pays_id}
                        onChange={majChamp("pays_id")}
                        required
                      />
                    )}
                  </div>
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="da-ville">Ville</label>
                    {villes.length ? (
                      <select id="da-ville" className="form-select" value={form.ville_id} onChange={majChamp("ville_id")} required>
                        <option value="">Choisir…</option>
                        {villes.map((v) => (
                          <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="da-ville"
                        className="form-control"
                        placeholder="Identifiant ville"
                        value={form.ville_id}
                        onChange={majChamp("ville_id")}
                        required
                      />
                    )}
                  </div>
                </div>
                <div className="mb-2 mt-2">
                  <label className="form-label-aps" htmlFor="da-tel">Téléphone</label>
                  <input id="da-tel" className="form-control" value={form.telephone} onChange={majChamp("telephone")} required />
                </div>
                <div className="mb-2">
                  <label className="form-label-aps" htmlFor="da-email">Courriel</label>
                  <input id="da-email" type="email" className="form-control" value={form.email} onChange={majChamp("email")} required />
                </div>
                <button type="button" className="btn btn-outline-primary btn-sm-aps mt-1" onClick={localiser}>
                  <i className="fa-solid fa-location-crosshairs" />{" "}
                  {geoStatus === "loading"
                    ? "Localisation en cours…"
                    : geoStatus === "done"
                    ? "Position enregistrée"
                    : "Géolocaliser le siège (facultatif)"}
                </button>
                {geoStatus === "error" && (
                  <p className="minimal-note mt-2 mb-0">
                    <i className="fa-solid fa-triangle-exclamation" /> Localisation indisponible ou refusée.
                  </p>
                )}
              </div>
            )}

            {/* ÉTAPE 3 — Justificatif */}
            {etape === 3 && (
              <div>
                <label className="form-label-aps" htmlFor="da-image">Logo / photo de la compagnie (obligatoire)</label>
                <input
                  id="da-image"
                  type="file"
                  accept="image/*"
                  className="form-control"
                  onChange={(e) => setFichierImage(e.target.files?.[0] ?? null)}
                  required
                />
                {fichierImage && (
                  <p className="minimal-note mt-2 mb-0">
                    <i className="fa-solid fa-circle-check" /> {fichierImage.name}
                  </p>
                )}
              </div>
            )}

            {/* ÉTAPE 4 — Agent responsable */}
            {etape === 4 && (
              <div>
                <p className="minimal-note mb-2">
                  <i className="fa-solid fa-circle-info" /> Un compte est créé pour cette
                  personne ; elle pourra ensuite gérer la fiche, les activités et les agences.
                </p>
                <div className="mb-2">
                  <label className="form-label-aps" htmlFor="da-fonction">Fonction</label>
                  <input id="da-fonction" className="form-control" value={form.fonction} onChange={majChamp("fonction")} required />
                </div>
                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="da-agent-nom">Nom</label>
                    <input id="da-agent-nom" className="form-control" value={form.agent_nom} onChange={majChamp("agent_nom")} required />
                  </div>
                  <div className="col-6">
                    <label className="form-label-aps" htmlFor="da-agent-prenom">Prénom</label>
                    <input id="da-agent-prenom" className="form-control" value={form.agent_prenom} onChange={majChamp("agent_prenom")} required />
                  </div>
                </div>
                <div className="mb-2 mt-2">
                  <label className="form-label-aps" htmlFor="da-agent-email">Courriel de l'agent</label>
                  <input id="da-agent-email" type="email" className="form-control" value={form.agent_email} onChange={majChamp("agent_email")} required />
                </div>
                <div className="mb-2">
                  <label className="form-label-aps" htmlFor="da-agent-tel">Téléphone de l'agent (facultatif)</label>
                  <input id="da-agent-tel" className="form-control" value={form.agent_telephone} onChange={majChamp("agent_telephone")} />
                </div>
              </div>
            )}

            {/* ÉTAPE 5 — Récapitulatif */}
            {etape === 5 && (
              <div>
                <table className="hours-table">
                  <tbody>
                    <tr><td>Type</td><td>{form.type_acteur === "compagnie" ? "Compagnie d'assurance" : "Courtier"}</td></tr>
                    <tr><td>Dénomination</td><td>{form.nom}</td></tr>
                    <tr><td>Agrément</td><td>{form.agrement}</td></tr>
                    <tr><td>Téléphone</td><td>{form.telephone}</td></tr>
                    <tr><td>Courriel</td><td>{form.email}</td></tr>
                    <tr><td>Justificatif</td><td>{fichierImage?.name || "—"}</td></tr>
                    <tr><td>Agent responsable</td><td>{form.agent_prenom} {form.agent_nom} — {form.fonction}</td></tr>
                    <tr><td>Courriel agent</td><td>{form.agent_email}</td></tr>
                  </tbody>
                </table>
                <p className="minimal-note mt-2 mb-0">
                  <i className="fa-solid fa-circle-info" /> La fiche sera soumise à
                  vérification avant publication dans l'annuaire.
                </p>
              </div>
            )}

            {/* Navigation */}
            <div className="d-flex justify-content-between mt-3">
              <button
                type="button"
                className="btn btn-outline-primary btn-sm-aps"
                onClick={precedent}
                disabled={etape === 1 || envoi}
                style={{ visibility: etape === 1 ? "hidden" : "visible" }}
              >
                <i className="fa-solid fa-arrow-left" /> Précédent
              </button>
              {etape < ETAPES.length ? (
                <button type="button" className="btn btn-primary btn-sm-aps" onClick={suivant}>
                  Suivant <i className="fa-solid fa-arrow-right" />
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm-aps" onClick={soumettre} disabled={envoi}>
                  {envoi ? "Envoi en cours…" : (
                    <>
                      <i className="fa-solid fa-paper-plane" /> Déclarer la compagnie
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}