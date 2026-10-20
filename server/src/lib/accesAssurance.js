// src/lib/accesAssurance.js
// Contrôle d'accès à une fiche d'assurance (guide abonnements assurances
// v3, §1.1.2). Extrait de assurance.controller.js pour être partagé avec
// les contrôleurs d'abonnement et de paiement d'abonnement.

import prisma from "./prisma.js";

export function estAdminOuSuperadmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

/** Vrai si l'utilisateur est l'agent rattaché à CETTE fiche (AgentAssurance.utilisateur_id est unique). */
export async function estAgentDuServiceAssurance(utilisateur, serviceAssuranceId) {
  if (!utilisateur) return false;
  // Un compte peut gérer plusieurs fiches (espaces multiples).
  const agent = await prisma.agentAssurance.findFirst({
    where: { utilisateur_id: utilisateur.utilisateur_id, service_assurance_id: serviceAssuranceId },
    select: { agent_id: true },
  });
  return !!agent;
}

/** Agent de la fiche, ou admin / superadmin. */
export async function peutGererServiceAssurance(utilisateur, serviceAssuranceId) {
  if (!utilisateur) return false;
  if (estAdminOuSuperadmin(utilisateur)) return true;
  return estAgentDuServiceAssurance(utilisateur, serviceAssuranceId);
}

/**
 * Fiche gérée par l'utilisateur connecté, ou null. Un compte peut en gérer
 * plusieurs : celle de l'espace actif de la session (« assurance:<id> »)
 * si elle lui est rattachée, sinon la première.
 */
export async function serviceAssuranceDeLAgent(utilisateurId, espaceActif = null) {
  const prefere = typeof espaceActif === "string" && espaceActif.startsWith("assurance:") ? espaceActif.slice(10) : null;
  const agents = await prisma.agentAssurance.findMany({
    where: { utilisateur_id: utilisateurId },
    select: { service_assurance_id: true },
    orderBy: { agent_id: "asc" },
  });
  return (agents.find((a) => a.service_assurance_id === prefere) ?? agents[0])?.service_assurance_id ?? null;
}
