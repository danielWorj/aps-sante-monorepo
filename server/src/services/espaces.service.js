// src/services/espaces.service.js
// Espaces d'un compte (option A de la conception « sécurisation de la
// connexion », révision 3) : une personne = un compte, avec un ou plusieurs
// espaces (patient, médecin, chaque fiche gérée, publicités).
//
// Les espaces se DÉDUISENT des profils enregistrés (fiche patient, fiche
// médecin, rattachements d'agent, publicités), jamais d'un champ saisi.
//
// La session porte l'ESPACE ACTIF (claim `espace` du jeton) et le RÔLE de
// cet espace (claim `role`) : les gardes existantes (`autoriser(...)`)
// continuent de fonctionner, et les droits d'un espace ne se cumulent
// jamais avec ceux d'un autre.

import prisma from "../lib/prisma.js";

const STATUTS_FICHE = {
  publie: "Fiche publiée",
  en_cours: "Fiche en vérification",
  non_publie: "Fiche non publiée",
};

const libelleStatut = (statut) => STATUTS_FICHE[statut] ?? null;
const joindre = (...parties) => parties.filter(Boolean).join(" · ") || null;

/** Rôle porté par le jeton dans chaque type d'espace. */
export const ROLE_PAR_TYPE_ESPACE = {
  patient: "patient",
  medecin: "medecin",
  pharmacie: "agent_pharmacie",
  structure: "agent_structure_sante",
  assurance: "agent_assurance",
  ambulance: "agent_ambulance",
  pompes_funebres: "agent_pompes_funebres",
  publicites: "annonceur",
};

const ROLES_ADMIN = new Set(["admin", "superadmin"]);

export class ErreurEspace extends Error {
  constructor(message, status = 400, code = "ESPACE_INVALIDE") {
    super(message);
    this.name = "ErreurEspace";
    this.status = status;
    this.code = code;
  }
}

function espace(type, cle, libelle, detail, professionnel) {
  return { cle, type, role: ROLE_PAR_TYPE_ESPACE[type], libelle, detail, professionnel };
}

/**
 * Espaces du compte, le dernier utilisé en premier. Un administrateur n'a
 * pas d'espace (back-office, parcours email + mot de passe).
 * @returns {Promise<Array<{ cle, type, role, libelle, detail, professionnel, dernier }>>}
 */
export async function listerEspaces(utilisateur_id) {
  const u = await prisma.utilisateur.findUnique({
    where: { utilisateur_id },
    select: {
      dernier_espace: true,
      role: { select: { libelle: true } },
      patient: { select: { patient_id: true } },
      medecin: { select: { statut_verification: true, specialite: { select: { nom: true } } } },
      agents_pharmacie: { select: { pharmacie: { select: { pharmacie_id: true, nom: true, statut_verification: true } } } },
      agents_structure_sante: { select: { structure: { select: { structure_id: true, nom: true, statut_verification: true } } } },
      agents_assurance: { select: { service_assurance: { select: { service_assurance_id: true, nom: true, statut_verification: true } } } },
      agents_ambulance: { select: { service_ambulance_id: true } },
      agents_pompes_funebres: { select: { pompes_funebres_id: true } },
      _count: { select: { publicites: true } },
    },
  });
  if (!u || ROLES_ADMIN.has(u.role?.libelle)) return [];

  const role = u.role?.libelle;
  const espaces = [];

  if (u.medecin) {
    espaces.push(espace("medecin", "medecin", "Espace médecin",
      joindre(u.medecin.specialite?.nom, libelleStatut(u.medecin.statut_verification)), true));
  }
  if (u.patient || role === "patient") {
    espaces.push(espace("patient", "patient", "Espace patient", "Mes rendez-vous et ma santé", false));
  }
  for (const { pharmacie: p } of u.agents_pharmacie) {
    espaces.push(espace("pharmacie", `pharmacie:${p.pharmacie_id}`, p.nom, joindre("Pharmacie", libelleStatut(p.statut_verification)), true));
  }
  for (const { structure: s } of u.agents_structure_sante) {
    espaces.push(espace("structure", `structure:${s.structure_id}`, s.nom, joindre("Structure de santé", libelleStatut(s.statut_verification)), true));
  }
  for (const { service_assurance: a } of u.agents_assurance) {
    espaces.push(espace("assurance", `assurance:${a.service_assurance_id}`, a.nom, joindre("Assurance", libelleStatut(a.statut_verification)), true));
  }
  for (const a of u.agents_ambulance) {
    espaces.push(espace("ambulance", `ambulance:${a.service_ambulance_id}`, "Service d'ambulance", null, true));
  }
  for (const a of u.agents_pompes_funebres) {
    espaces.push(espace("pompes_funebres", `pompes_funebres:${a.pompes_funebres_id}`, "Pompes funèbres", null, true));
  }
  if (role === "annonceur" || u._count.publicites > 0) {
    espaces.push(espace("publicites", "publicites", "Mes publicités",
      u._count.publicites ? `${u._count.publicites} publicité${u._count.publicites > 1 ? "s" : ""}` : null, true));
  }

  const indexDernier = espaces.findIndex((e) => e.cle === u.dernier_espace);
  if (indexDernier > 0) espaces.unshift(...espaces.splice(indexDernier, 1));
  return espaces.map((e) => ({ ...e, dernier: e.cle === u.dernier_espace }));
}

/**
 * Espace ouvert à la connexion : le dernier utilisé s'il existe encore,
 * sinon celui du rôle principal du compte, sinon le premier. `null` pour
 * un administrateur ou un compte sans espace.
 */
export function espaceParDefaut(espaces, roleCompte) {
  return espaces.find((e) => e.dernier)
    ?? espaces.find((e) => e.role === roleCompte)
    ?? espaces[0]
    ?? null;
}

/** Espace du compte par sa clé, ou null s'il n'existe plus. */
export async function trouverEspace(utilisateur_id, cle) {
  if (!cle) return null;
  return (await listerEspaces(utilisateur_id)).find((e) => e.cle === cle) ?? null;
}

/** Retient le dernier espace utilisé (proposé en premier la prochaine fois). */
export async function memoriserEspace(utilisateur_id, cle) {
  await prisma.utilisateur.update({ where: { utilisateur_id }, data: { dernier_espace: cle } });
}

/**
 * Identifiant de la fiche de l'espace actif de la session, pour un type
 * donné (ex. « pharmacie:<id> » -> <id>), ou null.
 * @param {{ espace?: string|null }} utilisateurSession  req.utilisateur
 */
export function ficheEspaceActif(utilisateurSession, type) {
  const cle = utilisateurSession?.espace;
  if (typeof cle !== "string" || !cle.startsWith(`${type}:`)) return null;
  return cle.slice(type.length + 1) || null;
}
