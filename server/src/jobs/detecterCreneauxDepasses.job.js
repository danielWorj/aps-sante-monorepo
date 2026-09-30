// src/jobs/detecterCreneauxDepasses.job.js
// Phase 4 / politique de fonds v2 §5 — Détection des rendez-vous dont le
// créneau est dépassé sans clôture : personne n'appelle l'API quand une
// partie ne se présente pas, ce job comble ce vide en scrutant
// périodiquement (voir lib/scheduler.js). Il délègue à traiterAbsence
// (absence.service.js), qui déduit l'événement des présences enregistrées.
// Étape 5 : ne traite QUE les statuts confirme / en_attente_presence ;
// l'expiration des 48h (a_reprogrammer) et l'enregistrement des présences
// sont ajoutés à l'étape 6.

import prisma from "../lib/prisma.js";
import { traiterAbsence } from "../services/absence.service.js";

// Délai de grâce après `date_creneau` avant de considérer un rendez-vous
// comme défaillant — non précisé par le cahier des charges ni par le
// plan ("délai de grâce paramétrable"). Valeur par défaut raisonnable
// proposée : 2h, le temps qu'un médecin en léger retard scanne encore
// le QR code ou clôture la visio ; réglable via variable d'environnement
// sans redéploiement de code, en attendant validation métier.
const DELAI_GRACE_MINUTES = Number(process.env.DELAI_GRACE_DEFAILLANCE_MINUTES ?? 120);

const STATUTS_ELIGIBLES = ["confirme", "en_attente_presence"];

/**
 * Sélectionne les rendez-vous dont le créneau est dépassé du délai de
 * grâce sans transition vers "honore"/"annule", et traite chacun
 * indépendamment (une erreur sur l'un n'interrompt pas les autres —
 * elle sera simplement retentée au prochain passage, le rendez-vous en
 * échec restant dans un statut éligible tant qu'il n'a pas été traité
 * avec succès).
 *
 * @returns {Promise<{ traites: number, echecs: number, arbitrages: number }>}
 */
export async function detecterCreneauxDepasses() {
  const seuil = new Date(Date.now() - DELAI_GRACE_MINUTES * 60 * 1000);

  const rdvsEligibles = await prisma.rendezVous.findMany({
    where: {
      statut: { in: STATUTS_ELIGIBLES },
      date_creneau: { lt: seuil },
    },
    select: { rdv_id: true, medecin_id: true, date_creneau: true, statut: true },
  });

  let traites = 0;
  let echecs = 0;
  let arbitrages = 0;

  for (const rdv of rdvsEligibles) {
    try {
      const resultat = await traiterAbsence(rdv);
      if (resultat.arbitrage_admin) {
        // Les deux parties présentes mais RDV jamais clôturé : pas de
        // décision automatique (§5) — à arbitrer via forcer-liberation.
        arbitrages += 1;
        console.warn(
          `[absence] rdv ${rdv.rdv_id} : les deux parties étaient présentes mais le rendez-vous n'a pas été clôturé — ` +
          `arbitrage administrateur requis (POST .../forcer-liberation).`
        );
      } else if (!resultat.deja_traite) {
        traites += 1;
      }
    } catch (err) {
      // Log et passage au suivant — voir en-tête. Le rendez-vous reste
      // dans son statut actuel, il sera donc resélectionné et retenté
      // au prochain passage du cron.
      echecs += 1;
      console.error(
        `[absence] Échec du traitement du rdv ${rdv.rdv_id} (retenté au prochain passage) :`,
        err
      );
    }
  }

  if (rdvsEligibles.length > 0) {
    console.info(
      `[absence] Créneaux dépassés traités : ${traites} réussi(s), ${echecs} échec(s), ` +
      `${arbitrages} à arbitrer, sur ${rdvsEligibles.length} candidat(s) (délai de grâce : ${DELAI_GRACE_MINUTES} min).`
    );
  }

  return { traites, echecs, arbitrages };
}