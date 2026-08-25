// components/portails/components/visio-modal.jsx
//
// Grande modale de téléconsultation, dans le style du portail médecin
// (mêmes tokens que portail-medecin.css : couleurs, radius, ombres,
// typographies). Volontairement une modale et non une page dédiée :
// le médecin reste dans son contexte "Rendez-vous" en arrière-plan.
//
// La visio elle-même (WebRTC / Jitsi) est déléguée à ConsultationRoom,
// inchangée dans sa logique métier — seul son habillage change pour
// remplir le conteneur de la modale au lieu du viewport entier.

import React, { useCallback, useEffect, useRef, useState } from "react";
import ConsultationRoom from "./../../visio/ConsultationRoom";

function extraireInitiales(nom) {
  if (!nom) return "?";
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

function formaterDuree(secondes) {
  const m = Math.floor(secondes / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(secondes % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * @param {object} props
 * @param {{ rdv_id: string|number }} props.rdv - Le rendez-vous concerné.
 * @param {string} props.patientNom - Nom affiché du patient.
 * @param {() => void} props.onClose - Appelé à la fermeture de la modale.
 */
const VisioModal = ({ rdv, patientNom, onClose }) => {
  const [enDirect, setEnDirect] = useState(false);
  const [duree, setDuree] = useState(0);
  const timerRef = useRef(null);

  // Chronomètre de la consultation, démarré une fois réellement connecté.
  useEffect(() => {
    if (!enDirect) return undefined;
    timerRef.current = setInterval(() => setDuree((d) => d + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [enDirect]);

  const demanderFermeture = useCallback(() => {
    if (enDirect) {
      const confirme = window.confirm("Quitter la consultation en cours ?");
      if (!confirme) return;
    }
    onClose();
  }, [enDirect, onClose]);

  // Échap pour fermer, avec confirmation si un appel est en cours.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") demanderFermeture();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [demanderFermeture]);

  const initials = extraireInitiales(patientNom);

  return (
    <div className="visio-modal-overlay" onClick={demanderFermeture}>
      <div
        className="visio-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="visio-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="visio-modal-head">
          <div className="visio-modal-who">
            <div className="visio-modal-avatar">{initials}</div>
            <div className="visio-modal-heading">
              <h3 id="visio-modal-title">{patientNom}</h3>
              <span className={`visio-status ${enDirect ? "is-live" : "is-connecting"}`}>
                <span className="visio-status-dot" aria-hidden="true"></span>
                {enDirect ? `En direct · ${formaterDuree(duree)}` : "Connexion en cours…"}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="visio-modal-close"
            onClick={demanderFermeture}
            aria-label="Fermer la téléconsultation"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </header>

        <div className="visio-stage">
          <ConsultationRoom
            rdvId={rdv.rdv_id}
            onReady={() => setEnDirect(true)}
            onCallEnded={onClose}
          />
        </div>

        <footer className="visio-modal-foot">
          <span>
            <i className="fa-solid fa-lock"></i>
            Connexion chiffrée — la consultation n'est ni enregistrée ni diffusée.
          </span>
        </footer>
      </div>
    </div>
  );
};

export default VisioModal;