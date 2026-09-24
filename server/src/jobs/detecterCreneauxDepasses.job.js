// src/jobs/detecterCreneauxDepasses.job.js
// Phase 4 — Détection des rendez-vous "défaillants" (voir politique de
// gestion des fonds §3) : personne n'appelle jamais l'API quand un
// médecin ne se présente pas, ce job comble ce vide en scrutant
// périodiquement (voir lib/scheduler.js) les rendez-vous dont le
// créneau est dépassé sans qu'aucune transition n'ait eu lieu.

import prisma from "../lib/prisma.js";
import { traiterDefaillancePro } from "../services/defaillancePro.service.js";

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
 * @returns {Promise<{ traites: number, echecs: number }>}
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

  for (const rdv of rdvsEligibles) {
    try {
      const resultat = await traiterDefaillancePro(rdv);
      if (!resultat.deja_traite) traites += 1;
    } catch (err) {
      // Log et passage au suivant — voir en-tête. Le rendez-vous reste
      // dans son statut actuel, il sera donc resélectionné et retenté
      // au prochain passage du cron.
      echecs += 1;
      console.error(
        `[defaillancePro] Échec du traitement du rdv ${rdv.rdv_id} (retenté au prochain passage) :`,
        err
      );
    }
  }

  if (rdvsEligibles.length > 0) {
    console.info(
      `[defaillancePro] Créneaux dépassés traités : ${traites} réussi(s), ${echecs} échec(s) ` +
      `sur ${rdvsEligibles.length} candidat(s) (délai de grâce : ${DELAI_GRACE_MINUTES} min).`
    );
  }

  return { traites, echecs };
}