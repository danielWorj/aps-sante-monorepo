// src/lib/scheduler.js
// Phase 4 — Point d'entrée unique pour tous les jobs planifiés du
// back-end : aucun scheduler n'existait avant cette phase. Réutilisé
// par les prochaines phases qui ont le même besoin d'un déclencheur qui
// n'est ni un utilisateur ni un webhook (Phase 6 : cycle de retrait
// automatique ; Phase 7 : réconciliation périodique Stripe).

import cron from "node-cron";
import { detecterCreneauxDepasses } from "../jobs/detecterCreneauxDepasses.job.js";
import { traiterReprogrammations } from "../jobs/traiterReprogrammations.job.js";
import { reconcilierCampayEnAttente } from "../services/paiementCampay.service.js";
import { reconcilierRetraitsEnCours } from "../services/retrait.service.js";

// Fréquence non précisée par le cahier des charges ni par le plan
// ("fréquence courte, ex. toutes les 15 min") — valeur par défaut
// reprise telle quelle du plan, réglable via variable d'environnement
// sans redéploiement de code.
const CRON_DETECTION_DEFAILLANCE = process.env.CRON_DETECTION_DEFAILLANCE || "*/15 * * * *";

// Politique de fonds v2 §5 (étape 6) : expiration des 48h de reprogrammation
// (deux absents) et rattrapage des notifications. Non précisé par la spec :
// même fréquence que la détection des créneaux dépassés (l'échéance est donc
// traitée avec au plus ~15 min de retard), réglable sans redéploiement.
const CRON_REPROGRAMMATIONS = process.env.CRON_REPROGRAMMATIONS || "*/15 * * * *";

// Filet de sécurité CamPay : callbacks perdus, serveur redémarré, etc. (chaque minute par défaut).
const CRON_RECONCILIATION_CAMPAY = process.env.CRON_RECONCILIATION_CAMPAY || "* * * * *";

// Phase 6 : retraits médecins envoyés à CamPay dont le résultat n'est pas encore connu (callback perdu…).
const CRON_RECONCILIATION_RETRAITS = process.env.CRON_RECONCILIATION_RETRAITS || "*/2 * * * *";

/**
 * Démarre tous les jobs planifiés du back-end. Appelé une seule fois,
 * après app.listen() (voir index.js) — pas de raison de bloquer le
 * démarrage HTTP en attendant que le scheduler soit prêt.
 */
export function demarrerScheduler() {
  cron.schedule(CRON_DETECTION_DEFAILLANCE, () => {
    detecterCreneauxDepasses().catch((err) => {
      // Filet de sécurité : detecterCreneauxDepasses gère déjà ses
      // erreurs par rendez-vous individuellement (voir ce fichier) et
      // ne devrait donc jamais rejeter — mais un job planifié ne doit
      // JAMAIS faire planter le process sur une erreur inattendue
      // (ex. base de données injoignable le temps d'un passage).
      console.error("[scheduler] Échec inattendu du job detecterCreneauxDepasses :", err);
    });
  });

  cron.schedule(CRON_REPROGRAMMATIONS, () => {
    traiterReprogrammations().catch((err) => {
      console.error("[scheduler] Échec inattendu du job traiterReprogrammations :", err);
    });
  });

  cron.schedule(CRON_RECONCILIATION_CAMPAY, () => {
    reconcilierCampayEnAttente().catch((err) => {
      console.error("[scheduler] Échec réconciliation CamPay :", err);
    });
  });

  cron.schedule(CRON_RECONCILIATION_RETRAITS, () => {
    reconcilierRetraitsEnCours().catch((err) => {
      console.error("[scheduler] Échec réconciliation des retraits :", err);
    });
  });

  console.info(
    `[scheduler] Démarré — detecterCreneauxDepasses planifié (${CRON_DETECTION_DEFAILLANCE}), traiterReprogrammations planifié (${CRON_REPROGRAMMATIONS}), reconcilierCampayEnAttente planifié (${CRON_RECONCILIATION_CAMPAY}), reconcilierRetraitsEnCours planifié (${CRON_RECONCILIATION_RETRAITS}).`
  );
}