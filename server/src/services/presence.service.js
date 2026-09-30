// src/services/presence.service.js
// Politique de fonds v2 §5 (étape 6) — enregistrement des FAITS de
// présence (`medecin_present_le`, `patient_present_le`). Jamais un
// « absent » stocké : l'absence se déduit de l'absence d'horodatage
// (politiqueFonds.determinerEvenementAbsence).
//
// Sources de présence :
//   - téléconsultation : entrée d'un occupant dans la room Jitsi (webhook
//     signé `muc-occupant-joined`, visio.controller.js) ;
//   - RDV physique : le scan du QR du patient par le médecin pose les DEUX
//     présences (patient scanné, médecin présent pour scanner) ; le passage
//     du médecin à « en_attente_presence » pose la sienne.
//
// Première entrée gagnante, idempotent : l'UPDATE est conditionnel
// (`champ IS NULL`), un rejeu du webhook ne réécrit rien. Seuls les RDV
// « confirme » / « en_attente_presence » enregistrent une présence : un RDV
// déjà traité (a_reprogrammer, non_honore, annulé…) n'est jamais modifié.

import prisma from "../lib/prisma.js";

const CHAMPS_PRESENCE = Object.freeze({
  medecin: "medecin_present_le",
  patient: "patient_present_le",
});

export const STATUTS_PRESENCE_ENREGISTRABLE = Object.freeze(["confirme", "en_attente_presence"]);

/**
 * @param {string} rdv_id
 * @param {"medecin"|"patient"} partie
 * @param {{ maintenant?: Date, db?: object }} [options]
 * @returns {Promise<{ enregistree: boolean }>} faux si déjà enregistrée ou RDV hors statut
 */
export async function enregistrerPresence(rdv_id, partie, { maintenant = new Date(), db = prisma } = {}) {
  const champ = CHAMPS_PRESENCE[partie];
  if (!champ) throw new Error(`Partie inconnue pour une présence : « ${partie} ».`);

  const { count } = await db.rendezVous.updateMany({
    where: { rdv_id, statut: { in: STATUTS_PRESENCE_ENREGISTRABLE }, [champ]: null },
    data: { [champ]: maintenant },
  });
  return { enregistree: count === 1 };
}
