// src/lib/scheduler.js
// Phase 4 — Point d'entrée unique pour tous les jobs planifiés du
// back-end : aucun scheduler n'existait avant cette phase. Réutilisé
// par les prochaines phases qui ont le même besoin d'un déclencheur qui
// n'est ni un utilisateur ni un webhook (Phase 6 : cycle de retrait
// automatique ; Phase 7 : réconciliation périodique Stripe).

import cron from "node-cron";
import { detecterCreneauxDepasses } from "../jobs/detecterCreneauxDepasses.job.js";

// Fréquence non précisée par le cahier des charges ni par le plan
// ("fréquence courte, ex. toutes les 15 min") — valeur par défaut
// reprise telle quelle du plan, réglable via variable d'environnement
// sans redéploiement de code.
const CRON_DETECTION_DEFAILLANCE = process.env.CRON_DETECTION_DEFAILLANCE || "*/15 * * * *";

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

  console.info(
    `[scheduler] Démarré — detecterCreneauxDepasses planifié (${CRON_DETECTION_DEFAILLANCE}).`
  );
}