// src/lib/scheduler.js
// Phase 4 — Point d'entrée unique pour tous les jobs planifiés du
// back-end : aucun scheduler n'existait avant cette phase. Réutilisé
// par les prochaines phases qui ont le même besoin d'un déclencheur qui
// n'est ni un utilisateur ni un webhook (Phase 6 : cycle de retrait
// automatique ; Phase 7 : réconciliation périodique Stripe).

import cron from "node-cron";
import { detecterCreneauxDepasses } from "../jobs/detecterCreneauxDepasses.job.js";
import { traiterReprogrammations } from "../jobs/traiterReprogrammations.job.js";
import { libererFondsEchusJob } from "../jobs/libererFondsEchus.job.js";
import { expirerOffresRdvJob, expirerRdvNonConfirmesJob, synchroniserAgendasJob } from "../jobs/agenda.job.js";
import { reconcilierCampayEnAttente } from "../services/paiementCampay.service.js";
import { reconcilierRetraitsEnCours } from "../services/retrait.service.js";
import {
  expirerAbonnementsEchus,
  envoyerRappelsEcheance,
  annulerBrouillonsPerimes,
} from "../services/cycleAbonnementAssurance.service.js";
import {
  expirerAbonnementsPresenceEchus,
  envoyerRappelsEcheancePresence,
  annulerBrouillonsPresencePerimes,
} from "../services/cycleAbonnementPresence.service.js";
import { purgerVisiteursVuesFiche } from "../services/vuesFiche.service.js";
import { purgerVisiteursEngagement } from "../services/engagementMedecin.service.js";
import { relancerMessagesWhatsapp } from "../services/whatsapp.service.js";
import { relancerMessagesSms } from "../services/sms.service.js";
import { purgerCodesVerification } from "../services/verificationTelephone.service.js";
import { expirerPublicitesNonPayees } from "../services/publicite.service.js";

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

// Libération différée des fonds (phase 3) : libère les escrows dont
// termine_le + T est échu. Précision de libération ≈ la fréquence du cron
// (5 min par défaut), réglable sans redéploiement de code.
const CRON_LIBERATION_FONDS = process.env.CRON_LIBERATION_FONDS || "*/5 * * * *";

// Agenda : annulation des RDV non confirmés dans le délai du pays (précision
// ≈ la fréquence du cron, 5 min par défaut) et prolongation nocturne de
// l'horizon des cases générées depuis le gabarit (00h40 UTC par défaut ; un
// passage a aussi lieu au démarrage).
const CRON_EXPIRATION_CONFIRMATION = process.env.CRON_EXPIRATION_CONFIRMATION || "*/5 * * * *";
const CRON_SYNCHRO_AGENDAS = process.env.CRON_SYNCHRO_AGENDAS || "40 0 * * *";

// Abonnements assurance (guide v3, §1.4.4) : expiration après grâce et
// rappels d'échéance une fois par jour (00h10 UTC par défaut, dates en
// jours UTC) ; brouillons périmés (> 24 h) chaque heure.
const CRON_CYCLE_ABONNEMENTS_ASSURANCE = process.env.CRON_CYCLE_ABONNEMENTS_ASSURANCE || "10 0 * * *";
const CRON_BROUILLONS_ABONNEMENTS_ASSURANCE = process.env.CRON_BROUILLONS_ABONNEMENTS_ASSURANCE || "25 * * * *";

// Abonnements de présence (pharmacies, centres de santé, médecins) : même
// rythme que les assurances, décalé de quelques minutes.
const CRON_CYCLE_ABONNEMENTS_PRESENCE = process.env.CRON_CYCLE_ABONNEMENTS_PRESENCE || "15 0 * * *";
const CRON_BROUILLONS_ABONNEMENTS_PRESENCE = process.env.CRON_BROUILLONS_ABONNEMENTS_PRESENCE || "35 * * * *";

// WhatsApp : relance des envois en échec transitoire (débit Meta, réseau,
// aucun numéro actif au moment de l'envoi) toutes les 10 min par défaut.
const CRON_RELANCE_WHATSAPP = process.env.CRON_RELANCE_WHATSAPP || "*/10 * * * *";
// SMS : relance des échecs transitoires (hors codes de vérification) et
// purge quotidienne des codes de plus de 30 jours.
const CRON_RELANCE_SMS = process.env.CRON_RELANCE_SMS || "*/10 * * * *";
const CRON_PURGE_CODES_VERIFICATION = process.env.CRON_PURGE_CODES_VERIFICATION || "50 3 * * *";

// Publicités acceptées non payées dans le délai : place libérée (toutes les 5 min).
const CRON_EXPIRATION_PUBLICITES = process.env.CRON_EXPIRATION_PUBLICITES || "*/5 * * * *";

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

  cron.schedule(CRON_LIBERATION_FONDS, () => {
    libererFondsEchusJob().catch((err) => {
      console.error("[scheduler] Échec libération différée des fonds :", err);
    });
  });

  cron.schedule(CRON_EXPIRATION_CONFIRMATION, () => {
    expirerRdvNonConfirmesJob().catch((err) => {
      console.error("[scheduler] Échec expiration des RDV non confirmés :", err);
    });
    // RDV aléatoire : même rythme que l'expiration des RDV non confirmés.
    expirerOffresRdvJob().catch((err) => {
      console.error("[scheduler] Échec expiration des offres de RDV :", err);
    });
  });

  const synchroniserAgendas = () =>
    synchroniserAgendasJob().catch((err) => {
      console.error("[scheduler] Échec synchronisation des agendas :", err);
    });
  cron.schedule(CRON_SYNCHRO_AGENDAS, synchroniserAgendas, { timezone: "UTC" });
  synchroniserAgendas();

  cron.schedule(
    CRON_CYCLE_ABONNEMENTS_ASSURANCE,
    async () => {
      try {
        await expirerAbonnementsEchus();
      } catch (err) {
        console.error("[scheduler] Échec expiration des abonnements assurance :", err);
      }
      try {
        await envoyerRappelsEcheance();
      } catch (err) {
        console.error("[scheduler] Échec rappels d'échéance des abonnements assurance :", err);
      }
    },
    { timezone: "UTC" }
  );

  cron.schedule(CRON_BROUILLONS_ABONNEMENTS_ASSURANCE, () => {
    annulerBrouillonsPerimes().catch((err) => {
      console.error("[scheduler] Échec annulation des brouillons d'abonnement assurance :", err);
    });
  });

  cron.schedule(
    CRON_CYCLE_ABONNEMENTS_PRESENCE,
    async () => {
      try {
        await expirerAbonnementsPresenceEchus();
      } catch (err) {
        console.error("[scheduler] Échec expiration des abonnements de présence :", err);
      }
      try {
        await envoyerRappelsEcheancePresence();
      } catch (err) {
        console.error("[scheduler] Échec rappels d'échéance des abonnements de présence :", err);
      }
      // Compteur de vues : seules les empreintes de la veille sont gardées.
      try {
        await purgerVisiteursVuesFiche();
      } catch (err) {
        console.error("[scheduler] Échec purge des empreintes de vues de fiche :", err);
      }
      // Engagements sur les fiches médecin : même règle de conservation.
      try {
        await purgerVisiteursEngagement();
      } catch (err) {
        console.error("[scheduler] Échec purge des empreintes d'engagement médecin :", err);
      }
    },
    { timezone: "UTC" }
  );

  cron.schedule(CRON_BROUILLONS_ABONNEMENTS_PRESENCE, () => {
    annulerBrouillonsPresencePerimes().catch((err) => {
      console.error("[scheduler] Échec annulation des brouillons d'abonnement de présence :", err);
    });
  });

  cron.schedule(CRON_RELANCE_WHATSAPP, () => {
    relancerMessagesWhatsapp().catch((err) => {
      console.error("[scheduler] Échec relance des messages WhatsApp :", err);
    });
  });

  cron.schedule(CRON_RELANCE_SMS, () => {
    relancerMessagesSms().catch((err) => {
      console.error("[scheduler] Échec relance des SMS :", err);
    });
  });

  cron.schedule(
    CRON_PURGE_CODES_VERIFICATION,
    () => {
      purgerCodesVerification().catch((err) => {
        console.error("[scheduler] Échec purge des codes de vérification :", err);
      });
    },
    { timezone: "UTC" }
  );

  cron.schedule(CRON_EXPIRATION_PUBLICITES, () => {
    expirerPublicitesNonPayees().catch((err) => {
      console.error("[scheduler] Échec expiration des publicités non payées :", err);
    });
  });

  console.info(
    `[scheduler] Démarré — detecterCreneauxDepasses planifié (${CRON_DETECTION_DEFAILLANCE}), traiterReprogrammations planifié (${CRON_REPROGRAMMATIONS}), reconcilierCampayEnAttente planifié (${CRON_RECONCILIATION_CAMPAY}), reconcilierRetraitsEnCours planifié (${CRON_RECONCILIATION_RETRAITS}), libererFondsEchus planifié (${CRON_LIBERATION_FONDS}), expiration RDV non confirmés (${CRON_EXPIRATION_CONFIRMATION}), synchronisation agendas (${CRON_SYNCHRO_AGENDAS}), cycle abonnements assurance (${CRON_CYCLE_ABONNEMENTS_ASSURANCE}), brouillons abonnements assurance (${CRON_BROUILLONS_ABONNEMENTS_ASSURANCE}), cycle abonnements de présence (${CRON_CYCLE_ABONNEMENTS_PRESENCE}), brouillons abonnements de présence (${CRON_BROUILLONS_ABONNEMENTS_PRESENCE}), relance WhatsApp (${CRON_RELANCE_WHATSAPP}), relance SMS (${CRON_RELANCE_SMS}), purge des codes de vérification (${CRON_PURGE_CODES_VERIFICATION}), expiration des publicités non payées (${CRON_EXPIRATION_PUBLICITES}).`
  );
}