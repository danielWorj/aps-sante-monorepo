// src/lib/metriques.js
// Métriques Prometheus de l'API (prom-client) + journal d'accès HTTP.
//
// Les métriques sont servies sur un PORT SÉPARÉ (METRICS_PORT, 9464 par
// défaut), jamais publié par docker-compose : seul Prometheus, sur le réseau
// Docker interne, peut les lire. Les monter sur l'app principale les
// exposerait publiquement via nginx (api.azasante.com/metrics).
//
// Étiquette `route` : le MOTIF de la route Express (« /api/medecins/:id »),
// pas l'URL réelle, pour borner le nombre de séries (cardinalité). Une
// requête qui ne correspond à aucune route est étiquetée « non_trouvee ».

import http from "node:http";
import { randomUUID } from "node:crypto";
import client from "prom-client";
import { logger, executerDansContexte } from "./logger.js";

export const registre = new client.Registry();
registre.setDefaultLabels({ service: "api" });

// Métriques standard Node.js : CPU, mémoire, tas V8, latence de la boucle
// d'événements, ramasse-miettes, descripteurs de fichiers…
client.collectDefaultMetrics({ register: registre });

const dureeRequetes = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Durée des requêtes HTTP, par méthode, route et code de statut.",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [registre],
});

const requetesEnCours = new client.Gauge({
  name: "http_requests_in_flight",
  help: "Requêtes HTTP en cours de traitement.",
  registers: [registre],
});

function cheminRoute(route) {
  return Array.isArray(route.path) ? route.path.join("|") : String(route.path);
}

// Express affecte req.route quand une route correspond, puis remet
// req.baseUrl à zéro en sortant du routeur (ex. erreur transmise au
// gestionnaire global) : le motif complet est donc figé à l'affectation.
function capturerMotifRoute(req) {
  let route;
  Object.defineProperty(req, "route", {
    configurable: true,
    enumerable: true,
    get: () => route,
    set: (valeur) => {
      route = valeur;
      if (valeur) req._motifRoute = `${req.baseUrl || ""}${cheminRoute(valeur)}` || "/";
    },
  });
}

function motifRoute(req) {
  return req._motifRoute || "non_trouvee";
}

/**
 * Middleware à monter en tout premier : identifiant de requête (en-tête
 * X-Request-Id renvoyé au client, ajouté à tous les logs de la requête),
 * mesure de la durée et ligne de journal d'accès à la fin de la réponse.
 */
export function middlewareObservabilite(req, res, next) {
  const entrant = req.get("x-request-id");
  const requestId = entrant && /^[\w-]{8,64}$/.test(entrant) ? entrant : randomUUID();
  res.setHeader("X-Request-Id", requestId);
  capturerMotifRoute(req);

  const debut = process.hrtime.bigint();
  requetesEnCours.inc();

  res.on("finish", () => {
    requetesEnCours.dec();
    const duree = Number(process.hrtime.bigint() - debut) / 1e9;
    const route = motifRoute(req);
    const statut = res.statusCode;
    dureeRequetes.observe({ method: req.method, route, status_code: String(statut) }, duree);

    // Pas de query string (peut contenir des jetons), pas d'en-têtes, pas de corps.
    const ligne = {
      request_id: requestId,
      type: "acces",
      method: req.method,
      route,
      path: (req.originalUrl || req.url).split("?")[0],
      status: statut,
      duration_ms: Math.round(duree * 1000),
      ip: req.ip,
    };
    const niveau = statut >= 500 ? "error" : statut >= 400 ? "warn" : "info";
    logger[niveau](ligne, `${req.method} ${route} ${statut}`);
  });

  executerDansContexte(requestId, next);
}

/** Démarre le petit serveur HTTP interne qui expose GET /metrics. */
export function demarrerServeurMetriques() {
  const port = Number(process.env.METRICS_PORT || 9464);
  const serveur = http.createServer(async (req, res) => {
    if (req.url !== "/metrics") {
      res.writeHead(404).end();
      return;
    }
    try {
      res.writeHead(200, { "Content-Type": registre.contentType });
      res.end(await registre.metrics());
    } catch (err) {
      logger.error({ err }, "Échec de la collecte des métriques");
      res.writeHead(500).end();
    }
  });
  serveur.listen(port, () => logger.info(`Métriques Prometheus exposées sur :${port}/metrics`));
  serveur.on("error", (err) => logger.error({ err }, "Serveur de métriques indisponible"));
}
