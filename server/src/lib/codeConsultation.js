// src/lib/codeConsultation.js
// Libération différée des fonds — Phase 2 : saisie du code de consultation
// par le médecin (RendezVous.code_unique) et protection anti force-brute.
//
// Module SANS dépendance Prisma : testable sans base. Il ne décide que de
// « que faire de cette tentative » ; l'écriture en base (compteur, verrou)
// est faite par finConsultation.service.js, dans une transaction qui
// verrouille la ligne du RDV pour sérialiser les tentatives concurrentes.
//
// Politique (réglable sans redéploiement de code) :
//   - MAX_TENTATIVES échecs CONSÉCUTIFS => verrou de DUREE_VERROU_MINUTES ;
//   - au déclenchement du verrou, le compteur repart à 0 : à l'expiration
//     le médecin dispose d'une nouvelle série de MAX_TENTATIVES essais ;
//   - une saisie correcte remet compteur et verrou à zéro.
// Avec les valeurs par défaut (5 essais / 15 min) un attaquant ne peut pas
// dépasser ~480 essais par jour et par RDV, sur un espace de 32^6 (~1,07
// milliard) codes pour les RDV créés depuis la libération différée.
//
// Format du code : 6 caractères tirés d'un alphabet de 32 symboles SANS
// caractères ambigus (ni 0/O, ni 1/I) — le patient dicte son code à voix
// haute. Les RDV antérieurs gardent leur code de 8 caractères
// (code_unique reste VarChar(8)) : la comparaison ci-dessous accepte les deux.

import crypto from "crypto";

function entierPositifEnv(nom, defaut) {
  const brut = process.env[nom];
  if (brut === undefined || brut === "") return defaut;
  const n = Number(brut);
  return Number.isInteger(n) && n > 0 ? n : defaut;
}

// Génération d'un code de consultation (secret du PATIENT, jamais renvoyé au
// médecin par l'API). Tirage CSPRNG sans biais (crypto.randomInt).
export const LONGUEUR_CODE = 6;
export const ALPHABET_CODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Un code de consultation brut (sans test d'unicité : la contrainte @unique
 * de la base et la boucle de genererCodeUnique du contrôleur s'en chargent).
 * @param {(max: number) => number} [tirage] injectable pour les tests
 * @returns {string}
 */
export function genererCodeConsultation(tirage = (max) => crypto.randomInt(max)) {
  let code = "";
  for (let i = 0; i < LONGUEUR_CODE; i += 1) {
    code += ALPHABET_CODE[tirage(ALPHABET_CODE.length)];
  }
  return code;
}

export const MAX_TENTATIVES = entierPositifEnv("CODE_CONSULTATION_MAX_TENTATIVES", 5);
export const DUREE_VERROU_MINUTES = entierPositifEnv("CODE_CONSULTATION_VERROU_MINUTES", 15);

/**
 * Forme canonique d'un code saisi : espaces retirés, majuscules. Tolère la
 * saisie « ab12 cd34 » ou en minuscules sur mobile ; ne modifie jamais le
 * code stocké. Une valeur non textuelle donne une chaîne vide (jamais valide).
 * @param {unknown} code
 * @returns {string}
 */
export function normaliserCode(code) {
  if (typeof code !== "string") return "";
  return code.replace(/\s+/g, "").toUpperCase();
}

/**
 * Comparaison en temps constant du code saisi et du code du RDV (même motif
 * que comparerQrTokenSecret du contrôleur de RDV) : une mesure de timing
 * ne renseigne pas sur le nombre de caractères corrects. Un code saisi vide
 * ne correspond jamais.
 * @param {unknown} saisi
 * @param {string} attendu code_unique du RDV
 * @returns {boolean}
 */
export function codeCorrespond(saisi, attendu) {
  const a = Buffer.from(normaliserCode(saisi));
  const b = Buffer.from(normaliserCode(attendu));
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Le RDV est-il actuellement verrouillé pour la saisie du code ?
 * Borne exclusive : à l'instant exact de `code_verrouille_jusqu_a`, le
 * verrou est levé.
 * @param {{ code_verrouille_jusqu_a?: Date|string|null }} rdv
 * @param {Date} [maintenant]
 * @returns {{ verrouille: boolean, reessayer_dans_secondes: number }}
 */
export function etatVerrou(rdv, maintenant = new Date()) {
  if (!rdv?.code_verrouille_jusqu_a) return { verrouille: false, reessayer_dans_secondes: 0 };
  const restantMs = new Date(rdv.code_verrouille_jusqu_a).getTime() - maintenant.getTime();
  if (!(restantMs > 0)) return { verrouille: false, reessayer_dans_secondes: 0 };
  return { verrouille: true, reessayer_dans_secondes: Math.ceil(restantMs / 1000) };
}

/**
 * Conséquence d'un ÉCHEC de saisie sur les colonnes anti force-brute.
 * Pure : renvoie les nouvelles valeurs à écrire, sans rien écrire.
 *
 * @param {{ tentatives_code_echouees?: number|null }} rdv état AVANT l'échec
 * @param {Date} [maintenant]
 * @param {{ maxTentatives?: number, dureeVerrouMinutes?: number }} [options]
 * @returns {{ donnees: { tentatives_code_echouees: number, code_verrouille_jusqu_a: Date|null },
 *   verrouille: boolean, tentatives_restantes: number, reessayer_dans_secondes: number }}
 */
export function appliquerEchecCode(
  rdv,
  maintenant = new Date(),
  { maxTentatives = MAX_TENTATIVES, dureeVerrouMinutes = DUREE_VERROU_MINUTES } = {}
) {
  const tentatives = (rdv?.tentatives_code_echouees ?? 0) + 1;

  if (tentatives >= maxTentatives) {
    const jusqua = new Date(maintenant.getTime() + dureeVerrouMinutes * 60 * 1000);
    return {
      donnees: { tentatives_code_echouees: 0, code_verrouille_jusqu_a: jusqua },
      verrouille: true,
      tentatives_restantes: 0,
      reessayer_dans_secondes: dureeVerrouMinutes * 60,
    };
  }

  return {
    donnees: { tentatives_code_echouees: tentatives, code_verrouille_jusqu_a: null },
    verrouille: false,
    tentatives_restantes: maxTentatives - tentatives,
    reessayer_dans_secondes: 0,
  };
}

/** Colonnes à écrire après une saisie correcte : compteur et verrou remis à zéro. */
export const DONNEES_CODE_REINITIALISE = Object.freeze({
  tentatives_code_echouees: 0,
  code_verrouille_jusqu_a: null,
});