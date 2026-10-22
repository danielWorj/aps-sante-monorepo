// src/lib/accesLaboratoire.js
// Contrôle d'accès à une fiche laboratoire — même patron que
// lib/accesAssurance.js : l'agent rattaché à la fiche (agent_laboratoire)
// ou l'administration (admin limité à son pays par lib/perimetrePays.js).

import prisma from "./prisma.js";

export function estAdminOuSuperadmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

/** Vrai si l'utilisateur est un agent rattaché à CETTE fiche (espaces multiples). */
export async function estAgentDuLaboratoire(utilisateur, laboratoireId) {
  if (!utilisateur || !laboratoireId) return false;
  const agent = await prisma.agentLaboratoire.findFirst({
    where: { utilisateur_id: utilisateur.utilisateur_id, laboratoire_id: laboratoireId },
    select: { agent_id: true },
  });
  return !!agent;
}

/** Agent de la fiche, ou admin / superadmin. */
export async function peutGererLaboratoire(utilisateur, laboratoireId) {
  if (!utilisateur) return false;
  if (estAdminOuSuperadmin(utilisateur)) return true;
  return estAgentDuLaboratoire(utilisateur, laboratoireId);
}

/**
 * Laboratoire géré par le compte connecté, ou null. Un compte peut en gérer
 * plusieurs : celui de l'espace actif (« laboratoire:<id> ») s'il lui est
 * rattaché, sinon le premier.
 */
export async function laboratoireDeLAgent(utilisateurId, espaceActif = null) {
  const prefixe = "laboratoire:";
  const prefere = typeof espaceActif === "string" && espaceActif.startsWith(prefixe)
    ? espaceActif.slice(prefixe.length)
    : null;
  const agents = await prisma.agentLaboratoire.findMany({
    where: { utilisateur_id: utilisateurId },
    select: { laboratoire_id: true },
    orderBy: { agent_id: "asc" },
  });
  return (agents.find((a) => a.laboratoire_id === prefere) ?? agents[0])?.laboratoire_id ?? null;
}
