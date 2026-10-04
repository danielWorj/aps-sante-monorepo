// src/services/visibiliteRole.service.js
// D7 / D8 — Qui voit quoi. Service PUR (aucun accès base, aucun effet de
// bord) : les contrôleurs filtrent ICI les réponses qui exposent une
// décomposition de fonds ou un rendez-vous non payé. Les services métier
// (annulation, traitement de fonds) renvoient volontairement TOUT ; le
// filtrage par rôle est la responsabilité du contrôleur, via ce module.
//
// Vocabulaire : CM = commission MÉDECIN, CP = commission PATIENT.
//
// | rôle    | voit                                                              | ne voit jamais            |
// | patient | son remboursement, CP (conservée ou rendue), le motif            | CM, versement médecin     |
// | médecin | son versement (H − CM, avant amendes), CM, son amende            | CP, montants du patient   |
// | admin   | tout                                                              | —                         |

import { EVENEMENTS } from "./politiqueFonds.service.js";

export const ROLES_VISIBILITE = Object.freeze({
  PATIENT: "patient",
  MEDECIN: "medecin",
  ADMIN: "admin",
});

/** Vrai si l'événement de fonds désigne le médecin comme fautif (CP rendue au patient). */
export function estEvenementMedecinFautif(evenement) {
  return evenement === EVENEMENTS.ANNULATION_MEDECIN || evenement === EVENEMENTS.MEDECIN_ABSENT;
}

/**
 * Filtre le résultat de `traiterAnnulation` selon le rôle de CELUI QUI REÇOIT
 * la réponse (et non de celui qui annule : un admin qui annule voit tout, un
 * patient qui annule ne voit jamais CM).
 *
 * Rôle inconnu : vue minimale (événement et délai seulement) — on ne devine
 * jamais un niveau de visibilité.
 *
 * @param {object} resultat  retour de traiterAnnulation (sans `erreur`)
 * @param {string} role      une valeur de ROLES_VISIBILITE
 * @returns {object}
 */
export function filtrerResultatAnnulation(resultat, role) {
  const base = { evenement: resultat.evenement, tardif: resultat.tardif };

  if (role === ROLES_VISIBILITE.ADMIN) {
    return {
      ...base,
      remboursement: resultat.remboursement,
      versement_medecin: resultat.versement_medecin,
      commission_medecin: resultat.commission_medecin,
      commission_patient: resultat.commission_patient,
      commission_patient_rendue: resultat.commission_patient_rendue,
      commission_aps: resultat.commission_aps, // alias déprécié de commission_medecin
      amende: resultat.amende,
    };
  }

  if (role === ROLES_VISIBILITE.PATIENT) {
    return {
      ...base,
      remboursement: resultat.remboursement,
      // CP : conservée par APS sur son paiement, ou rendue (médecin fautif).
      commission_patient: resultat.commission_patient,
      commission_patient_rendue: resultat.commission_patient_rendue,
      medecin_fautif: estEvenementMedecinFautif(resultat.evenement),
    };
  }

  if (role === ROLES_VISIBILITE.MEDECIN) {
    const rem = resultat.remboursement;
    return {
      ...base,
      // Le remboursement du patient peut contenir CP (médecin fautif :
      // H + CP − F) : aucun montant n'est donné au médecin, seulement le fait.
      remboursement: rem ? { devise: rem.devise, motif: rem.motif, statut: rem.statut } : null,
      versement_medecin: resultat.versement_medecin,
      commission_medecin: resultat.commission_medecin,
      commission_aps: resultat.commission_medecin, // alias déprécié de commission_medecin
      amende: resultat.amende,
    };
  }

  return base;
}

/**
 * D8 — Projection minimale d'un RDV NON PAYÉ (« cree ») pour le médecin :
 * identifiant, créneau, statut et indicateur `non_paye`. Ni identité du
 * patient, ni motif, ni code, ni QR, ni lien de visio : un flou côté client
 * ne protège rien, les données doivent ne pas être dans le JSON.
 * @param {{ rdv_id: string, date_creneau: Date|string, statut: string }} rdv
 */
export function projeterRdvNonPayePourMedecin(rdv) {
  return {
    rdv_id: rdv.rdv_id,
    date_creneau: rdv.date_creneau,
    statut: rdv.statut,
    non_paye: true,
  };
}