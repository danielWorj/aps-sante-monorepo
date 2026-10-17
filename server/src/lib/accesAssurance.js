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
  const agent = await prisma.agentAssurance.findUnique({
    where: { utilisateur_id: utilisateur.utilisateur_id },
  });
  return !!agent && agent.service_assurance_id === serviceAssuranceId;
}

/** Agent de la fiche, ou admin / superadmin. */
export async function peutGererServiceAssurance(utilisateur, serviceAssuranceId) {
  if (!utilisateur) return false;
  if (estAdminOuSuperadmin(utilisateur)) return true;
  return estAgentDuServiceAssurance(utilisateur, serviceAssuranceId);
}

/** Fiche gérée par l'utilisateur connecté (un agent = une fiche), ou null. */
export async function serviceAssuranceDeLAgent(utilisateurId) {
  const agent = await prisma.agentAssurance.findUnique({
    where: { utilisateur_id: utilisateurId },
    select: { service_assurance_id: true },
  });
  return agent?.service_assurance_id ?? null;
}
