// src/services/rattachementAgent.service.js
// Création d'une fiche (pharmacie, structure de santé, assurance) par son
// propre responsable : la fiche est rattachée au COMPTE CONNECTÉ (nouvel
// espace dans « Choisir mon espace »), sans créer de second compte ni de
// mot de passe temporaire. Option A de la conception « sécurisation de la
// connexion » (une personne = un compte, plusieurs espaces).
//
// Sans `responsable_moi`, l'ancien parcours reste : compte agent dédié créé
// pour une autre personne, avec un mot de passe temporaire.

const ROLES_ADMIN = new Set(["admin", "superadmin"]);

/** true si l'auteur (connecté, non administrateur) déclare être le responsable. */
export function estResponsableMoi(req) {
  const valeur = req.body?.responsable_moi;
  return Boolean(req.utilisateur?.utilisateur_id)
    && !ROLES_ADMIN.has(req.utilisateur.role)
    && (valeur === true || valeur === "true");
}

/**
 * Rattache le compte connecté à la fiche créée. À appeler dans la
 * transaction de création (`tx`). Même forme de retour que les fonctions
 * creerCompteAgentPourXxx (sans mot de passe temporaire).
 */
export async function rattacherCompteConnecte(tx, { modele, fk, id, utilisateur_id, fonction }) {
  const utilisateur = await tx.utilisateur.findUnique({ where: { utilisateur_id } });
  const agent = await tx[modele].create({
    data: { utilisateur_id, [fk]: id, fonction: fonction?.trim() || "Responsable" },
  });
  return { utilisateur, agent, motDePasseTemporaire: null };
}
