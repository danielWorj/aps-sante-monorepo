// components/visio/ConsultationRoom.jsx
//
// Salle de téléconsultation Jitsi. Récupère un token JWT à usage
// unique auprès de POST /api/visio/token (voir
// server/src/controllers/visio.controller.js), puis rend l'iframe
// Jitsi via @jitsi/react-sdk avec ce token.
//
// Utilise `apiFetch` (jamais axios / jamais de token en localStorage,
// voir lib/apiClient.js) — cohérent avec le reste du front.

import { useEffect, useState } from "react";
import { JitsiMeeting } from "@jitsi/react-sdk";
import { apiFetch } from "../../lib/apiClient";

function ConsultationRoom({ rdvId, onCallEnded }) {
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
      .catch(() => {
        if (!annule) setError("Impossible de démarrer la consultation.");
      });

    return () => {
      annule = true;
    };
  }, [rdvId]);

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-danger mb-0">{error}</p>
      </div>
    );
  }

  if (!visioData) {
    return (
      <div className="p-4 text-center">
        <span className="spinner-border spinner-border-sm me-2"></span>
        Chargement de la consultation...
      </div>
    );
  }

  return (
    <JitsiMeeting
      domain={visioData.domain}
      roomName={visioData.roomName}
      jwt={visioData.token}
      configOverwrite={{
        fileRecordingsEnabled: false,
        liveStreamingEnabled: false,
        prejoinPageEnabled: false,
        disableModeratorIndicator: true,
      }}
      interfaceConfigOverwrite={{
        TOOLBAR_BUTTONS: ["microphone", "camera", "hangup", "chat", "tileview"],
      }}
      getIFrameRef={(iframeRef) => {
        iframeRef.style.height = "100vh";
        iframeRef.style.width = "100%";
        iframeRef.style.border = "0";
      }}
      onApiReady={(externalApi) => {
        externalApi.addEventListener("videoConferenceLeft", () => onCallEnded?.());
        externalApi.addEventListener("readyToClose", () => onCallEnded?.());
      }}
    />
  );
}

export default ConsultationRoom;
