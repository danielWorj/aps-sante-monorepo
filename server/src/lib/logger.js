// src/lib/logger.js
// Journalisation structurée (JSON sur la sortie standard) : collectée par
// Grafana Alloy depuis Docker puis stockée dans Loki (voir observabilite/).
//
// - Une ligne JSON par événement : { level, time, service, request_id, msg, ... }.
// - Les appels console.* existants sont redirigés vers ce logger
//   (redirigerConsole) : pas besoin de réécrire les 200+ appels du code.
// - request_id : posé par le middleware de requête (metriques.js) dans un
//   AsyncLocalStorage, il est ajouté automatiquement à toute ligne écrite
//   pendant la requête, ce qui permet de relier une erreur à son accès HTTP.
//
// Données de santé : ne JAMAIS journaliser les corps de requête, en-têtes
// d'authentification, cookies, PIN, mots de passe ou jetons. Les chemins
// sensibles ci-dessous sont masqués au cas où un objet en contiendrait.

import pino from "pino";
import { AsyncLocalStorage } from "node:async_hooks";
import { format } from "node:util";

const contexteRequete = new AsyncLocalStorage();

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "api" },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Niveau en texte (« info », « error ») plutôt qu'en nombre : plus simple
  // à filtrer dans Loki (| json | level="error").
  formatters: { level: (label) => ({ level: label }) },
  messageKey: "msg",
  mixin() {
    const ctx = contexteRequete.getStore();
    return ctx ? { request_id: ctx.requestId } : {};
  },
  redact: {
    paths: [
      "password", "mot_de_passe", "pin", "token", "access_token", "refresh_token",
      "*.password", "*.mot_de_passe", "*.pin", "*.token", "*.access_token", "*.refresh_token",
      "headers.authorization", "headers.cookie", "req.headers.authorization", "req.headers.cookie",
    ],
    censor: "[masqué]",
  },
});

/** Exécute `suite` dans le contexte d'une requête (request_id ajouté aux logs). */
export function executerDansContexte(requestId, suite) {
  return contexteRequete.run({ requestId }, suite);
}

/**
 * Redirige console.log/info/warn/error/debug vers le logger. Les arguments
 * sont mis en forme comme le ferait console (util.format) ; une Error passée
 * en argument est aussi sérialisée (message + pile) dans le champ `err`.
 */
export function redirigerConsole() {
  const niveaux = { log: "info", info: "info", warn: "warn", error: "error", debug: "debug" };
  for (const [methode, niveau] of Object.entries(niveaux)) {
    console[methode] = (...args) => {
      const erreur = args.find((a) => a instanceof Error);
      // La pile est déjà dans `err` : seul le message de l'Error va dans `msg`.
      const msg = format(...args.map((a) => (a instanceof Error ? a.message : a)));
      if (erreur) logger[niveau]({ err: erreur }, msg);
      else logger[niveau](msg);
    };
  }
}

// Appliquée dès l'import : index.js importe ce module juste après dotenv,
// avant tout autre module susceptible d'écrire dans la console.
if (process.env.LOG_CONSOLE_NATIF !== "true") redirigerConsole();
