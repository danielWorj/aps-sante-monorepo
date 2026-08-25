// src/services/jitsi.service.js
//
// Génère les JWT consommés par Jitsi Meet (jitsi-host/, docker-jitsi-meet
// avec AUTH_TYPE=jwt). Système HS256 à secret partagé, totalement
// INDÉPENDANT des access tokens ES256 de l'app (voir utils/token.utils.js
// et auth.middleware.js) — ne jamais mélanger les deux : celui-ci ne sert
// qu'à autoriser l'entrée dans une room Jitsi, jamais à authentifier une
// requête sur notre propre API.

import jwt from "jsonwebtoken";

const JITSI_APP_ID = process.env.JITSI_APP_ID;
const JITSI_APP_SECRET = process.env.JITSI_APP_SECRET;

if (!JITSI_APP_ID || !JITSI_APP_SECRET) {
  throw new Error(
    "JITSI_APP_ID / JITSI_APP_SECRET manquants dans les variables d'environnement (.env racine du monorepo)."
  );
}

const DUREE_VALIDITE_SECONDES = 60 * 60; // 1h — largement suffisant pour une téléconsultation

/**
 * @param {{ nom: string, prenom: string, email: string, estModerateur: boolean }} participant
 * @param {string} roomName
 * @returns {string} JWT signé HS256, à transmettre tel quel au client Jitsi
 */
export function genererJitsiToken(participant, roomName) {
  const maintenant = Math.floor(Date.now() / 1000);

  const payload = {
    context: {
      user: {
        name: `${participant.prenom} ${participant.nom}`,
        email: participant.email,
        moderator: participant.estModerateur,
      },
    },
    aud: JITSI_APP_ID,
    iss: JITSI_APP_ID,
    // "*" en dev/local (voir jitsi-host/.env, ENABLE_GUESTS=0, AUTH_TYPE=jwt) ;
    // à remplacer par le vrai domaine public en prod (cf. guide §5).
    sub: "*",
    room: roomName,
    iat: maintenant,
    exp: maintenant + DUREE_VALIDITE_SECONDES,
  };

  return jwt.sign(payload, JITSI_APP_SECRET, { algorithm: "HS256" });
}
