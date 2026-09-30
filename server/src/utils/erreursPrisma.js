// src/utils/erreursPrisma.js
// Politique de fonds v2 §6 — reconnaissance de la violation de l'index
// unique PARTIEL « un seul rendez-vous actif par (médecin, créneau) »
// (rendez_vous_medecin_creneau_actif_key, créé par SQL dans la
// migration : Prisma ne le connaît pas).
//
// Prisma remonte une violation d'unicité sous le code P2002, mais le
// détail de la cible varie selon le pilote (meta.target, ou détail de
// l'adaptateur pg) : on cherche le nom de l'index / des colonnes dans
// tout ce que l'erreur expose, pour ne PAS confondre avec un autre
// unique (ex. code_unique).

const NOM_INDEX_CRENEAU = "rendez_vous_medecin_creneau_actif_key";

export function estViolationCreneauActif(err) {
  if (!err || err.code !== "P2002") return false;
  let detail = "";
  try {
    detail = `${err.message ?? ""} ${JSON.stringify(err.meta ?? {})}`;
  } catch {
    detail = String(err.message ?? "");
  }
  return (
    detail.includes(NOM_INDEX_CRENEAU) ||
    (detail.includes("medecin_id") && detail.includes("date_creneau"))
  );
}

export const MESSAGE_CRENEAU_PRIS =
  "Ce créneau n'est plus disponible : un rendez-vous est déjà réservé pour ce médecin à cette date et heure. " +
  "Veuillez choisir un autre créneau.";
