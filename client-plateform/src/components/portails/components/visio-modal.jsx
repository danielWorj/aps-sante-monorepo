// components/portails/components/visio-modal.jsx
//
// Grande modale de téléconsultation (portails médecin et patient), habillée
// en bleu santé (tokens --bleu-sante-* de style.css). Volontairement une
// modale et non une page dédiée : chacun reste dans son contexte
// « Rendez-vous » en arrière-plan.
//
// La visio elle-même (Jitsi) est déléguée à ConsultationRoom. Cette modale
// gère la FIN DE CONSULTATION :
//   - MÉDECIN : « Terminer la consultation » (ou raccrocher dans Jitsi)
//     termine l'appel pour tous (commande Jitsi endConference, il est
//     modérateur), puis la carte de clôture le remercie et lui indique
//     quand il sera payé (POST /visio/:id/cloture) ;
//   - PATIENT : quand le médecin sort, on vérifie si la consultation est
//     clôturée et, si oui, on raccroche proprement ; la carte de clôture
//     propose alors de noter le médecin, laisser un avis ou déclarer un
//     litige. Une vérification périodique couvre un événement Jitsi manqué.

import { useCallback, useEffect, useRef, useState } from "react";
import ConsultationRoom from "./../../visio/ConsultationRoom";
import ClotureConsultation from "./../../visio/ClotureConsultation";
import { cloturerVisio, obtenirBilanVisio } from "../../../services/visioService";
import { useConfirmation } from "../../feedback";

// Filet de sécurité côté patient : relecture du bilan pendant l'appel.
const INTERVALLE_VERIFICATION_MS = 20_000;
// Après la sortie d'un participant : la clôture du médecin peut arriver une
// fraction de seconde après son départ de la salle, on relit donc à nouveau.
const RELECTURES_APRES_SORTIE_MS = [0, 3_000, 8_000];

function extraireInitiales(nom) {
  if (!nom) return "?";
  return nom
    .replace(/^Dr\.?\s+/i, "")
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
 * @param {{ rdv_id: string }} props.rdv - Le rendez-vous concerné.
 * @param {string} props.patientNom - Nom affiché de l'interlocuteur (patient ou « Dr … »).
 * @param {"medecin"|"patient"} [props.role]
 * @param {() => void} props.onClose - Appelé à la fermeture de la modale.
 */
const VisioModal = ({ rdv, patientNom, role = "medecin", onClose }) => {
  const confirmer = useConfirmation();
  const estMedecin = role === "medecin";

  // 'appel' | 'cloture'
  const [phase, setPhase] = useState("appel");
  const [enDirect, setEnDirect] = useState(false);
  const [duree, setDuree] = useState(0);
  const [cleSalle, setCleSalle] = useState(0); // « Rejoindre à nouveau » remonte la salle
  const apiRef = useRef(null);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Chronomètre de la consultation, démarré une fois réellement connecté.
  useEffect(() => {
    if (!enDirect || phase !== "appel") return undefined;
    const t = setInterval(() => setDuree((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [enDirect, phase]);

  /** Fin d'appel (raccroché, expulsé, fin pour tous) : une seule fois. */
  const surFinAppel = useCallback(() => {
    if (phaseRef.current !== "appel") return;
    phaseRef.current = "cloture";
    apiRef.current = null;
    setEnDirect(false);
    setPhase("cloture");
  }, []);

  const raccrocher = useCallback(async (pourTous) => {
    // Médecin : signale la fin AVANT de quitter, pour que le patient soit
    // raccroché dès qu'il voit le médecin sortir (idempotent, renvoyé par la
    // carte de clôture ensuite).
    if (pourTous) await cloturerVisio(rdv.rdv_id).catch(() => {});
    const api = apiRef.current;
    if (!api) {
      surFinAppel();
      return;
    }
    try {
      // endConference : expulse tous les participants (réservé au modérateur).
      if (pourTous) api.executeCommand("endConference");
    } catch {
      // Commande indisponible sur ce serveur Jitsi : simple raccroché ci-dessous.
    }
    try {
      api.executeCommand("hangup");
    } catch {
      surFinAppel();
    }
    // Si Jitsi n'émet aucun événement de sortie, on clôt quand même.
    setTimeout(surFinAppel, 2500);
  }, [rdv.rdv_id, surFinAppel]);

  // PATIENT : le médecin a-t-il terminé l'appel ? Si oui, on quitte proprement
  // (même si la consultation n'est pas encore validée pour le paiement).
  const verifierClotureMedecin = useCallback(async () => {
    if (estMedecin || phaseRef.current !== "appel") return;
    try {
      const bilan = await obtenirBilanVisio(rdv.rdv_id);
      if ((bilan.visio_cloturee || bilan.termine) && phaseRef.current === "appel") raccrocher(false);
    } catch {
      // Silencieux : on réessaiera au prochain événement / passage.
    }
  }, [estMedecin, rdv.rdv_id, raccrocher]);

  const surSortieParticipant = useCallback(() => {
    if (estMedecin) return;
    RELECTURES_APRES_SORTIE_MS.forEach((delai) => setTimeout(verifierClotureMedecin, delai));
  }, [estMedecin, verifierClotureMedecin]);

  useEffect(() => {
    if (estMedecin || phase !== "appel" || !enDirect) return undefined;
    const t = setInterval(verifierClotureMedecin, INTERVALLE_VERIFICATION_MS);
    return () => clearInterval(t);
  }, [estMedecin, phase, enDirect, verifierClotureMedecin]);

  const terminerConsultation = useCallback(async () => {
    const confirme = await confirmer({
      titre: "Terminer la consultation",
      message: "L'appel sera terminé pour vous et votre patient, et la consultation sera clôturée.",
      labelConfirmer: "Terminer",
      labelAnnuler: "Continuer",
      variante: "danger",
      icone: "fa-phone-slash",
    });
    if (confirme) raccrocher(true);
  }, [confirmer, raccrocher]);

  const demanderFermeture = useCallback(async () => {
    if (phase === "cloture") {
      onClose();
      return;
    }
    if (enDirect) {
      if (estMedecin) {
        terminerConsultation();
        return;
      }
      const confirme = await confirmer({
        titre: "Quitter la consultation",
        message: "La consultation vidéo est en cours. Voulez-vous vraiment la quitter ?",
        labelConfirmer: "Quitter",
        labelAnnuler: "Rester",
        variante: "danger",
        icone: "fa-phone-slash",
      });
      if (confirme) raccrocher(false);
      return;
    }
    onClose();
  }, [phase, enDirect, estMedecin, terminerConsultation, confirmer, raccrocher, onClose]);

  // Échap pour fermer, avec confirmation si un appel est en cours.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") demanderFermeture();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [demanderFermeture]);

  const rejoindre = () => {
    setDuree(0);
    setCleSalle((k) => k + 1);
    setPhase("appel");
  };

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
            <div className="visio-modal-avatar">
              {initials}
              <span className="visio-modal-avatar-badge" aria-hidden="true">
                <i className="fa-solid fa-video" />
              </span>
            </div>
            <div className="visio-modal-heading">
              <span className="visio-modal-surtitre">Téléconsultation</span>
              <h3 id="visio-modal-title">{patientNom}</h3>
            </div>
          </div>
          <div className="visio-modal-outils">
            {phase === "appel" && (
              <span className={`visio-status ${enDirect ? "is-live" : "is-connecting"}`}>
                <span className="visio-status-dot" aria-hidden="true"></span>
                {enDirect ? `En direct · ${formaterDuree(duree)}` : "Connexion…"}
              </span>
            )}
            {phase === "appel" && estMedecin && enDirect && (
              <button type="button" className="visio-btn-terminer" onClick={terminerConsultation}>
                <i className="fa-solid fa-phone-slash" />
                <span>Terminer la consultation</span>
              </button>
            )}
            <button
              type="button"
              className="visio-modal-close"
              onClick={demanderFermeture}
              aria-label="Fermer la téléconsultation"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </header>

        <div className="visio-stage">
          {phase === "appel" ? (
            <ConsultationRoom
              key={cleSalle}
              rdvId={rdv.rdv_id}
              onApi={(api) => {
                apiRef.current = api;
              }}
              onReady={() => setEnDirect(true)}
              onCallEnded={surFinAppel}
              onParticipantLeft={surSortieParticipant}
            />
          ) : (
            <ClotureConsultation
              rdvId={rdv.rdv_id}
              role={role}
              onFermer={onClose}
              onRejoindre={estMedecin ? undefined : rejoindre}
            />
          )}
        </div>

        <footer className="visio-modal-foot">
          <span>
            <i className="fa-solid fa-shield-halved"></i>
            Connexion chiffrée de bout en bout — la consultation n&apos;est ni enregistrée ni diffusée.
          </span>
        </footer>
      </div>
    </div>
  );
};

export default VisioModal;
