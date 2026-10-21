// components/visio/ConsultationRoom.jsx
//
// Salle de téléconsultation Jitsi. Récupère un token JWT à usage
// unique auprès de POST /api/visio/token (voir
// server/src/controllers/visio.controller.js), puis rend l'iframe
// Jitsi via @jitsi/react-sdk avec ce token.
//
// Conçu pour être embarqué dans un conteneur de taille contrainte
// (ex : la modale visio du portail médecin) : l'iframe se cale sur
// 100% du parent plutôt que sur 100vh.
//
// Utilise `apiFetch` (jamais axios / jamais de token en localStorage,
// voir lib/apiClient.js) — cohérent avec le reste du front.
//
// D8 : le serveur refuse (409 RDV_NON_PAYE) la visio d'un RDV non payé au
// médecin ; on affiche alors son message (« la visio sera accessible une fois
// le paiement confirmé ») plutôt qu'une erreur générique.

import { useEffect, useState } from "react";
import { JitsiMeeting } from "@jitsi/react-sdk";
import { apiFetch } from "../../lib/apiClient";
import { estErreurRdvNonPaye } from "../../utils/rdv";

// onApi(externalApi) : API Jitsi, pour raccrocher / terminer pour tous depuis
// l'habillage (fin de consultation). onParticipantLeft : l'autre participant
// est sorti (le patient vérifie alors si le médecin a clôturé).
function ConsultationRoom({ rdvId, onCallEnded, onReady, onApi, onParticipantLeft }) {
  const [visioData, setVisioData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let annule = false;

    setVisioData(null);
    setError(null);

    apiFetch("/visio/token", { method: "POST", body: { rdv_id: rdvId } })
      .then((data) => {
        if (!annule) setVisioData(data);
      })
      .catch((err) => {
        if (annule) return;
        setError(
          estErreurRdvNonPaye(err)
            ? err.data?.message ||
                "Ce rendez-vous n'est pas encore payé : la visio sera accessible une fois le paiement confirmé."
            : "Impossible de démarrer la consultation."
        );
      });

    return () => {
      annule = true;
    };
  }, [rdvId]);

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="tc-room-erreur mb-0">{error}</p>
      </div>
    );
  }

  if (!visioData) {
    return (
      <div className="p-4 text-center">
        <span className="spinner-border spinner-border-sm me-2"></span>
        Connexion à la salle de consultation…
      </div>
    );
  }

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <JitsiMeeting
        domain={visioData.domain}
        roomName={visioData.roomName}
        jwt={visioData.token}
        configOverwrite={{
          fileRecordingsEnabled: false,
          liveStreamingEnabled: false,
          prejoinPageEnabled: false,
          disableModeratorIndicator: true,
          // Titre lisible (« Téléconsultation avec Dr … ») au lieu du nom
          // technique de la salle (rdv-<uuid>) ; localSubject vaut pour
          // chacun, subject n'est appliqué que par le modérateur.
          subject: visioData.sujet || "Téléconsultation APS Santé",
          localSubject: visioData.sujet || "Téléconsultation APS Santé",
        }}
        interfaceConfigOverwrite={{
          TOOLBAR_BUTTONS: ["microphone", "camera", "hangup", "chat", "tileview"],
        }}
        getIFrameRef={(iframeRef) => {
          iframeRef.style.height = "100%";
          iframeRef.style.width = "100%";
          iframeRef.style.border = "0";
        }}
        onApiReady={(externalApi) => {
          onApi?.(externalApi);
          // Le SDK appelle onApiReady dès le chargement de l'iframe (avant
          // que le médecin ait rejoint le salon) ; on affine avec
          // videoConferenceJoined pour ne passer "en direct" qu'une fois
          // réellement connecté.
          externalApi.addEventListener("videoConferenceJoined", () => onReady?.(externalApi));
          externalApi.addEventListener("videoConferenceLeft", () => onCallEnded?.());
          externalApi.addEventListener("readyToClose", () => onCallEnded?.());
          externalApi.addEventListener("participantLeft", () => onParticipantLeft?.());
        }}
      />
    </div>
  );
}

export default ConsultationRoom;