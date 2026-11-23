// src/services/connexionApplication.service.js
// Connexion web validée depuis l'application mobile (« Validez sur votre
// téléphone »), sans mot de passe ni code PIN saisi sur l'ordinateur.
//
//   1. Le navigateur demande une connexion pour un numéro : il reçoit un
//      identifiant, un SECRET (pour sonder) et un code à 2 chiffres affiché.
//   2. L'application déjà connectée sur ce numéro voit la demande et
//      propose 3 codes : l'utilisateur choisit celui affiché à l'écran
//      (empêche une validation par réflexe d'une demande d'un tiers).
//   3. Le navigateur sonde avec son secret ; une fois la demande approuvée,
//      il reçoit la session UNE seule fois.
//
// Numéro inconnu, sans PIN ou administrateur : une demande « leurre » est
// créée quand même (même réponse, pas d'énumération des comptes).
//
// Même mécanisme pour valider un NOUVEL APPAREIL (objet « nouvel_appareil ») :
// le PIN a déjà été vérifié sur l'appareil inconnu, l'application connectée
// ailleurs confirme ; l'appareil devient appareil de confiance
// (appareilConfiance.service.js).

import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { normaliserNumeroInternational } from "../lib/telephone.js";
import { ErreurPin, ROLES_SANS_PIN } from "./pin.service.js";

export const DUREE_DEMANDE_S = 120;

const hacher = (secret) => crypto.createHash("sha256").update(secret).digest("hex");
const deuxChiffres = () => String(crypto.randomInt(10, 100));

function codesProposes(bon) {
  const codes = new Set([bon]);
  while (codes.size < 3) codes.add(deuxChiffres());
  const liste = [...codes];
  for (let i = liste.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [liste[i], liste[j]] = [liste[j], liste[i]];
  }
  return liste.join(",");
}

/**
 * Le navigateur demande une connexion pour un numéro.
 * @returns {Promise<{ demande_id: string, secret: string, code: string, expire_le: Date }>}
 */
export async function demanderConnexionApplication({ telephone, pays_iso2 = null, user_agent = null, adresse_ip = null, appareil_empreinte = null, appareil_mobile = false }) {
  const numero = normaliserNumeroInternational(telephone, pays_iso2);
  if (!numero) throw new ErreurPin("Numéro de téléphone invalide.", 400, "TELEPHONE_INVALIDE");

  const compte = await prisma.utilisateur.findUnique({
    where: { telephone_connexion: numero },
    select: { utilisateur_id: true, pin_hash: true, statut_compte: true, role: { select: { libelle: true } } },
  });
  const valide = compte && compte.pin_hash && compte.statut_compte !== "suspendu" && !ROLES_SANS_PIN.has(compte.role?.libelle);
  return creerDemande({
    utilisateur_id: valide ? compte.utilisateur_id : null,
    objet: "connexion_web",
    user_agent, adresse_ip, appareil_empreinte, appareil_mobile,
  });
}

/**
 * Validation d'un nouvel appareil (identifiants déjà vérifiés sur cet appareil).
 * @returns {Promise<{ demande_id: string, secret: string, code: string, expire_le: Date }>}
 */
export function demanderValidationNouvelAppareil({ utilisateur_id, user_agent = null, adresse_ip = null, appareil_empreinte, appareil_mobile = false }) {
  return creerDemande({ utilisateur_id, objet: "nouvel_appareil", user_agent, adresse_ip, appareil_empreinte, appareil_mobile });
}

async function creerDemande({ utilisateur_id, objet, user_agent, adresse_ip, appareil_empreinte, appareil_mobile }) {
  const secret = crypto.randomBytes(32).toString("hex");
  const code = deuxChiffres();
  const expire_le = new Date(Date.now() + DUREE_DEMANDE_S * 1000);
  const demande = await prisma.demandeConnexionWeb.create({
    data: {
      utilisateur_id,
      objet,
      appareil_empreinte: appareil_empreinte ?? null,
      appareil_mobile: Boolean(appareil_mobile),
      secret_hache: hacher(secret),
      code_correspondance: code,
      codes_proposes: codesProposes(code),
      user_agent: user_agent?.slice(0, 255) ?? null,
      adresse_ip,
      expire_le,
    },
  });
  return { demande_id: demande.demande_connexion_id, secret, code, expire_le };
}

/**
 * Sondage du navigateur. Une demande approuvée est CONSOMMÉE ici (passage
 * atomique approuvee -> consommee) : la session n'est remise qu'une fois.
 * @returns {Promise<{ statut: "en_attente"|"refusee"|"expiree"|"approuvee", utilisateur_id?: string, objet?: string, appareil_empreinte?: string|null, appareil_mobile?: boolean }>}
 */
export async function sonderConnexionApplication({ demande_id, secret }) {
  const demande = typeof demande_id === "string" && /^[0-9a-f-]{36}$/i.test(demande_id)
    ? await prisma.demandeConnexionWeb.findUnique({ where: { demande_connexion_id: demande_id } })
    : null;
  if (!demande || typeof secret !== "string" || hacher(secret) !== demande.secret_hache) {
    throw new ErreurPin("Demande de connexion introuvable.", 404, "DEMANDE_INTROUVABLE");
  }
  if (demande.statut === "refusee") return { statut: "refusee" };
  if (demande.statut === "consommee") return { statut: "expiree" };
  if (demande.expire_le < new Date() && demande.statut === "en_attente") return { statut: "expiree" };
  if (demande.statut === "en_attente") return { statut: "en_attente" };

  const { count } = await prisma.demandeConnexionWeb.updateMany({
    where: { demande_connexion_id: demande.demande_connexion_id, statut: "approuvee" },
    data: { statut: "consommee" },
  });
  if (count !== 1 || !demande.utilisateur_id) return { statut: "expiree" };
  return {
    statut: "approuvee",
    utilisateur_id: demande.utilisateur_id,
    objet: demande.objet,
    appareil_empreinte: demande.appareil_empreinte,
    appareil_mobile: demande.appareil_mobile,
  };
}

/** Demandes en attente pour le compte connecté (application mobile). */
export async function demandesEnAttente(utilisateur_id) {
  const demandes = await prisma.demandeConnexionWeb.findMany({
    where: { utilisateur_id, statut: "en_attente", expire_le: { gt: new Date() } },
    orderBy: { date_creation: "desc" },
    take: 3,
  });
  return demandes.map((d) => ({
    demande_id: d.demande_connexion_id,
    // « nouvel_appareil » : code PIN déjà saisi sur un autre téléphone ou ordinateur.
    objet: d.objet,
    appareil_mobile: d.appareil_mobile,
    codes: d.codes_proposes.split(","),
    navigateur: d.user_agent,
    adresse_ip: d.adresse_ip,
    date_creation: d.date_creation,
    expire_le: d.expire_le,
  }));
}

/**
 * Réponse de l'application : accepter avec le code choisi, ou refuser.
 * Un mauvais code refuse la demande (elle ne peut plus être approuvée).
 * @returns {Promise<"approuvee"|"refusee">}
 */
export async function repondreDemandeConnexion({ utilisateur_id, demande_id, accepter, code }) {
  const demande = await prisma.demandeConnexionWeb.findFirst({
    where: { demande_connexion_id: demande_id, utilisateur_id, statut: "en_attente", expire_le: { gt: new Date() } },
  });
  if (!demande) throw new ErreurPin("Cette demande a expiré.", 404, "DEMANDE_INTROUVABLE");

  const statut = accepter === true && String(code) === demande.code_correspondance ? "approuvee" : "refusee";
  await prisma.demandeConnexionWeb.updateMany({
    where: { demande_connexion_id: demande_id, statut: "en_attente" },
    data: { statut, date_decision: new Date() },
  });
  if (accepter === true && statut === "refusee") {
    throw new ErreurPin("Ce n'est pas le code affiché sur l'ordinateur : la connexion est refusée.", 400, "CODE_DIFFERENT");
  }
  return statut;
}

/** Job : supprime les demandes de plus d'un jour. */
export async function purgerDemandesConnexion() {
  const { count } = await prisma.demandeConnexionWeb.deleteMany({
    where: { date_creation: { lt: new Date(Date.now() - 86_400_000) } },
  });
  return count;
}
