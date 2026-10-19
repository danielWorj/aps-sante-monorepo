// src/services/publicite.service.js
// Réservation d'espace publicitaire (v9) — règles métier du cycle :
//
//   en_moderation ──accepter──▶ en_attente_paiement ──payer──▶ payee
//        │                         │        │
//        └──rejeter──▶ rejetee ◀───┘        └─délai dépassé─▶ expiree ──accepter──▶ …
//   en_moderation / en_attente_paiement ──annuler (annonceur)──▶ annulee
//
// Règles :
//   - un emplacement (page ou groupe de pages) offre `nombre_places` rangs ;
//     un rang est EXCLUSIF : une seule publicité par (emplacement, pays,
//     rang) sur une période donnée ;
//   - une soumission ne bloque rien ; l'acceptation bloque la place jusqu'à
//     date_limite_paiement (DELAI_PAIEMENT_H, au plus tard la fin du premier
//     jour de diffusion) ; le paiement la bloque pour toute la période ;
//   - la disponibilité est contrôlée sous verrou de l'emplacement
//     (acceptation, paiement) : deux acceptations concurrentes ne peuvent
//     pas obtenir la même place ;
//   - les dates sont des jours UTC ; date_fin est EXCLUE ;
//   - les messages WhatsApp partent APRÈS la transaction métier.

import prisma from "../lib/prisma.js";
import { journaliserAudit } from "../lib/audit.js";
import { construireUrl } from "../lib/cloudinaryService.js";
import { envoyerMessageModele } from "./modeleMessageWhatsapp.service.js";

export const DELAI_PAIEMENT_H = Number(process.env.PUBLICITE_DELAI_PAIEMENT_H ?? 72);
const JOUR_MS = 86_400_000;

/** Erreur métier attendue : traduite en réponse HTTP par repondreSiErreurPublicite. */
export class ErreurPublicite extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "ErreurPublicite";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function repondreSiErreurPublicite(err, res) {
  if (!(err instanceof ErreurPublicite)) return false;
  res.status(err.status).json({ code: err.code, message: err.message, ...(err.details && { details: err.details }) });
  return true;
}

/* ===================================================================
 * Dates et formats
 * =================================================================== */

export function jourUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** "AAAA-MM-JJ" -> Date (minuit UTC), sinon null. */
export function lireJour(valeur) {
  if (valeur instanceof Date) return Number.isNaN(valeur.getTime()) ? null : jourUtc(valeur);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valeur ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 ? d : null;
}

export const ajouterJours = (d, n) => new Date(d.getTime() + n * JOUR_MS);
export const versJourIso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export function formaterDate(d) {
  if (!d) return "";
  const x = new Date(d);
  return `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`;
}

export function formaterMontant(montant, devise) {
  const code = String(devise ?? "xaf").toUpperCase();
  if (code === "XAF" || code === "XOF") {
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(montant))} FCFA`;
  }
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: code }).format(Number(montant));
}

/** Date limite de paiement fixée à l'acceptation. */
export function calculerDateLimitePaiement(maintenant, debut) {
  const delai = new Date(maintenant.getTime() + DELAI_PAIEMENT_H * 3_600_000);
  const finPremierJour = ajouterJours(debut, 1);
  return delai < finPremierJour ? delai : finPremierJour;
}

/* ===================================================================
 * Disponibilité des rangs
 * =================================================================== */

/** Publicités qui occupent une place à l'instant `maintenant`. */
export function filtreOccupation(maintenant = new Date()) {
  return {
    OR: [
      { statut: "payee" },
      { statut: "en_attente_paiement", date_limite_paiement: { gt: maintenant } },
    ],
  };
}

/** Verrou de l'emplacement pour la transaction `tx` (sérialise les réservations). */
export async function verrouillerEmplacement(tx, emplacement_publicitaire_id) {
  await tx.$queryRaw`SELECT 1 FROM emplacement_publicitaire WHERE emplacement_publicitaire_id = ${emplacement_publicitaire_id}::uuid FOR UPDATE`;
}

/**
 * Publicité qui occupe déjà (emplacement, pays, rang) sur [debut, fin), ou null.
 */
export function trouverConflit(client, { emplacement_publicitaire_id, pays_id, rang, debut, fin, exclure_id = null, maintenant = new Date() }) {
  return client.publicite.findFirst({
    where: {
      emplacement_publicitaire_id,
      pays_id,
      rang,
      ...(exclure_id && { publicite_id: { not: exclure_id } }),
      date_debut: { lt: fin },
      date_fin: { gt: debut },
      ...filtreOccupation(maintenant),
    },
    select: { publicite_id: true, date_debut: true, date_fin: true },
  });
}

/** Périodes occupées d'une place à partir de `depuis`, triées. */
export async function periodesOccupees(client, { emplacement_publicitaire_id, pays_id, rang, depuis, maintenant = new Date() }) {
  const lignes = await client.publicite.findMany({
    where: { emplacement_publicitaire_id, pays_id, rang, date_fin: { gt: depuis }, ...filtreOccupation(maintenant) },
    select: { date_debut: true, date_fin: true },
    orderBy: { date_debut: "asc" },
  });
  return lignes.map((l) => ({ debut: jourUtc(l.date_debut), fin: jourUtc(l.date_fin) }));
}

/** Premier jour >= depuis où `duree_jours` consécutifs sont libres. */
export function prochaineDateLibre(periodes, duree_jours, depuis) {
  let candidat = depuis;
  for (const p of periodes) {
    if (ajouterJours(candidat, duree_jours) <= p.debut) break;
    if (p.fin > candidat) candidat = p.fin;
  }
  return candidat;
}

/** Premier jour réservable : demain (le temps de la modération). */
export const premierJourReservable = (maintenant = new Date()) => ajouterJours(jourUtc(maintenant), 1);

/**
 * Forfait vendable en ligne (actif, rattaché à un pays, rang compris dans
 * le slider de son emplacement actif), sinon ErreurPublicite.
 */
export async function chargerForfaitVendable(client, forfait_publicitaire_id) {
  const forfait = await client.forfaitPublicitaire.findUnique({
    where: { forfait_publicitaire_id },
    include: { emplacement_publicitaire: true, pays: { select: { pays_id: true, nom: true, code_iso2: true } } },
  });
  if (!forfait) throw new ErreurPublicite(404, "FORFAIT_INTROUVABLE", "Forfait publicitaire introuvable.");
  const emp = forfait.emplacement_publicitaire;
  if (!forfait.actif || !forfait.pays_id || !emp.actif || forfait.rang > emp.nombre_places) {
    throw new ErreurPublicite(409, "FORFAIT_NON_VENDABLE", "Ce forfait n'est pas proposé à la réservation.");
  }
  return forfait;
}

/** Disponibilité d'un forfait : périodes prises et prochaine date libre. */
export async function disponibiliteForfait(forfait_publicitaire_id, maintenant = new Date()) {
  const forfait = await chargerForfaitVendable(prisma, forfait_publicitaire_id);
  const depuis = premierJourReservable(maintenant);
  const periodes = await periodesOccupees(prisma, {
    emplacement_publicitaire_id: forfait.emplacement_publicitaire_id,
    pays_id: forfait.pays_id,
    rang: forfait.rang,
    depuis,
    maintenant,
  });
  return {
    forfait_publicitaire_id,
    rang: forfait.rang,
    duree_jours: forfait.duree_jours,
    premier_jour_reservable: versJourIso(depuis),
    prochaine_date_libre: versJourIso(prochaineDateLibre(periodes, forfait.duree_jours, depuis)),
    periodes_occupees: periodes.map((p) => ({ debut: versJourIso(p.debut), fin_exclue: versJourIso(p.fin) })),
  };
}

/* ===================================================================
 * Soumission
 * =================================================================== */

const LIMITES = {
  titre: 150, description: 1000, telephone_contact: 30, email_contact: 150, localisation: 255,
  annonceur_nom: 150, annonceur_entreprise: 150, annonceur_telephone: 30, annonceur_email: 150,
};
const FORMAT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMAT_TELEPHONE = /^\+?[\d\s.\-()]{6,30}$/;

const REQUIS = ["titre", "description", "telephone_contact", "annonceur_nom", "annonceur_telephone"];

/**
 * Contrôle les champs texte du formulaire de réservation.
 * `partiel` (modification) : seuls les champs présents dans `corps` sont
 * contrôlés et renvoyés ; un champ requis présent ne peut pas être vidé.
 * @returns {object} champs nettoyés
 * @throws {ErreurPublicite}
 */
export function validerChampsReservation(corps = {}, { partiel = false } = {}) {
  const champs = {};
  for (const [cle, max] of Object.entries(LIMITES)) {
    if (partiel && corps[cle] === undefined) continue;
    const v = typeof corps[cle] === "string" ? corps[cle].trim() : "";
    if (v.length > max) throw new ErreurPublicite(400, "CHAMP_TROP_LONG", `${cle} : ${max} caractères maximum.`);
    champs[cle] = v || null;
  }
  const manquants = REQUIS.filter((c) => c in champs && !champs[c]).concat(partiel ? [] : REQUIS.filter((c) => !(c in champs)));
  if (manquants.length) {
    throw new ErreurPublicite(400, "CHAMPS_REQUIS", `Champs requis manquants : ${manquants.join(", ")}.`);
  }
  for (const c of ["telephone_contact", "annonceur_telephone"]) {
    if (champs[c] && !FORMAT_TELEPHONE.test(champs[c])) throw new ErreurPublicite(400, "TELEPHONE_INVALIDE", `${c} invalide.`);
  }
  for (const c of ["email_contact", "annonceur_email"]) {
    if (champs[c] && !FORMAT_EMAIL.test(champs[c])) throw new ErreurPublicite(400, "EMAIL_INVALIDE", `${c} invalide.`);
  }
  return champs;
}

/**
 * Contrôles préalables à la soumission (aucune écriture) : forfait vendable,
 * date de début valide, place libre à ce jour (la place n'est PAS bloquée).
 * @returns {{ forfait, debut, fin }}
 */
export async function preparerSoumission({ forfait_publicitaire_id, date_debut, maintenant = new Date() }) {
  if (!forfait_publicitaire_id) throw new ErreurPublicite(400, "CHAMPS_REQUIS", "Champ requis manquant : forfait_publicitaire_id.");
  const forfait = await chargerForfaitVendable(prisma, forfait_publicitaire_id);
  const debut = lireJour(date_debut);
  if (!debut) throw new ErreurPublicite(400, "DATE_INVALIDE", "date_debut invalide (format AAAA-MM-JJ).");
  if (debut < premierJourReservable(maintenant)) {
    throw new ErreurPublicite(400, "DATE_TROP_PROCHE", "La diffusion peut commencer au plus tôt demain.");
  }
  const fin = ajouterJours(debut, forfait.duree_jours);
  const conflit = await trouverConflit(prisma, {
    emplacement_publicitaire_id: forfait.emplacement_publicitaire_id, pays_id: forfait.pays_id, rang: forfait.rang, debut, fin, maintenant,
  });
  if (conflit) {
    const dispo = await disponibiliteForfait(forfait_publicitaire_id, maintenant);
    throw new ErreurPublicite(409, "PLACE_INDISPONIBLE", "Cette position est déjà réservée sur la période choisie.", {
      prochaine_date_libre: dispo.prochaine_date_libre,
    });
  }
  return { forfait, debut, fin };
}

/* ===================================================================
 * Modération (administration)
 * =================================================================== */

async function chargerPourModeration(tx, publicite_id) {
  const pub = await tx.publicite.findUnique({ where: { publicite_id }, include: { forfait_publicitaire: true } });
  if (!pub) throw new ErreurPublicite(404, "PUBLICITE_INTROUVABLE", "Publicité introuvable.");
  return pub;
}

async function exigerAucunPaiementEnCours(tx, publicite_id) {
  const enCours = await tx.transactionPaiement.findFirst({ where: { publicite_id_cible: publicite_id, statut: "en_attente" } });
  if (enCours) {
    throw new ErreurPublicite(409, "PAIEMENT_EN_COURS", "Un paiement est en cours pour cette publicité : attendez son issue.");
  }
}

/**
 * Accepte une publicité en modération (ou relance une publicité expirée).
 * `date_debut` (facultatif) déplace la période, par ex. si la date
 * demandée est passée ou prise.
 */
export async function accepterPublicite({ publicite_id, admin_id, date_debut = undefined, maintenant = new Date() }) {
  const pub = await prisma.$transaction(async (tx) => {
    const avant = await chargerPourModeration(tx, publicite_id);
    await verrouillerEmplacement(tx, avant.emplacement_publicitaire_id);
    const p = await chargerPourModeration(tx, publicite_id);
    if (!["en_moderation", "expiree"].includes(p.statut)) {
      throw new ErreurPublicite(409, "STATUT_INCOMPATIBLE", `Cette publicité ne peut pas être acceptée (statut : ${p.statut}).`);
    }

    let debut = jourUtc(p.date_debut);
    if (date_debut !== undefined && date_debut !== null && date_debut !== "") {
      debut = lireJour(date_debut);
      if (!debut) throw new ErreurPublicite(400, "DATE_INVALIDE", "date_debut invalide (format AAAA-MM-JJ).");
    }
    if (debut < jourUtc(maintenant)) {
      throw new ErreurPublicite(409, "DATE_PASSEE", "La date de début est passée : indiquez une nouvelle date de début.");
    }
    const duree = Math.round((jourUtc(p.date_fin) - jourUtc(p.date_debut)) / JOUR_MS);
    const fin = ajouterJours(debut, duree);

    const conflit = await trouverConflit(tx, {
      emplacement_publicitaire_id: p.emplacement_publicitaire_id, pays_id: p.pays_id, rang: p.rang, debut, fin, exclure_id: p.publicite_id, maintenant,
    });
    if (conflit) {
      const periodes = await periodesOccupees(tx, {
        emplacement_publicitaire_id: p.emplacement_publicitaire_id, pays_id: p.pays_id, rang: p.rang, depuis: jourUtc(maintenant), maintenant,
      });
      throw new ErreurPublicite(409, "PLACE_INDISPONIBLE", "Cette position est déjà prise sur la période : choisissez une autre date de début.", {
        prochaine_date_libre: versJourIso(prochaineDateLibre(periodes, duree, jourUtc(maintenant))),
      });
    }

    const maj = await tx.publicite.update({
      where: { publicite_id },
      data: {
        statut: "en_attente_paiement",
        statut_moderation: "validee",
        date_debut: debut,
        date_fin: fin,
        motif_rejet: null,
        date_moderation: maintenant,
        moderateur_id: admin_id,
        date_limite_paiement: calculerDateLimitePaiement(maintenant, debut),
      },
    });
    await journaliserAudit(tx, {
      acteur_id: admin_id, type: "PUBLICITE_ACCEPTEE", objet_type: "publicite", objet_id: publicite_id,
      details: { date_debut: versJourIso(debut), date_fin: versJourIso(fin), relance: p.statut === "expiree" },
    });
    return maj;
  });

  await notifierPublicite("publicite_acceptee", pub.publicite_id);
  return pub;
}

export async function rejeterPublicite({ publicite_id, admin_id, motif, maintenant = new Date() }) {
  const texte = typeof motif === "string" ? motif.trim() : "";
  if (!texte) throw new ErreurPublicite(400, "MOTIF_REQUIS", "Le motif du rejet est obligatoire.");
  if (texte.length > 500) throw new ErreurPublicite(400, "MOTIF_TROP_LONG", "Motif : 500 caractères maximum.");

  const pub = await prisma.$transaction(async (tx) => {
    const p = await chargerPourModeration(tx, publicite_id);
    if (!["en_moderation", "en_attente_paiement"].includes(p.statut)) {
      throw new ErreurPublicite(409, "STATUT_INCOMPATIBLE", `Cette publicité ne peut pas être rejetée (statut : ${p.statut}).`);
    }
    await exigerAucunPaiementEnCours(tx, publicite_id);
    const maj = await tx.publicite.update({
      where: { publicite_id },
      data: {
        statut: "rejetee", statut_moderation: "rejetee", motif_rejet: texte,
        date_moderation: maintenant, moderateur_id: admin_id, date_limite_paiement: null,
      },
    });
    await journaliserAudit(tx, {
      acteur_id: admin_id, type: "PUBLICITE_REJETEE", objet_type: "publicite", objet_id: publicite_id, details: { motif: texte },
    });
    return maj;
  });

  await notifierPublicite("publicite_rejetee", pub.publicite_id);
  return pub;
}

/** Retrait par l'annonceur avant paiement. */
export async function annulerPublicite({ publicite_id, utilisateur_id }) {
  return prisma.$transaction(async (tx) => {
    const p = await chargerPourModeration(tx, publicite_id);
    if (p.utilisateur_id !== utilisateur_id) throw new ErreurPublicite(403, "ACCES_REFUSE", "Cette publicité ne vous appartient pas.");
    if (!["en_moderation", "en_attente_paiement"].includes(p.statut)) {
      throw new ErreurPublicite(409, "STATUT_INCOMPATIBLE", `Cette publicité ne peut plus être annulée (statut : ${p.statut}).`);
    }
    await exigerAucunPaiementEnCours(tx, publicite_id);
    const maj = await tx.publicite.update({ where: { publicite_id }, data: { statut: "annulee", date_limite_paiement: null } });
    await journaliserAudit(tx, { acteur_id: utilisateur_id, type: "PUBLICITE_ANNULEE", objet_type: "publicite", objet_id: publicite_id });
    return maj;
  });
}

/** Job : libère les places acceptées mais non payées à temps. */
export async function expirerPublicitesNonPayees(maintenant = new Date()) {
  const { count } = await prisma.publicite.updateMany({
    where: { statut: "en_attente_paiement", date_limite_paiement: { lte: maintenant } },
    data: { statut: "expiree" },
  });
  if (count) console.info(`[publicite] ${count} publicité(s) acceptée(s) non payée(s) à temps : place libérée.`);
  return count;
}

/* ===================================================================
 * Diffusion publique
 * =================================================================== */

export function avecUrlVisuel(publicite) {
  return { ...publicite, visuel_url: construireUrl(publicite.visuel_url) };
}

/** Champs publics d'une publicité diffusée (jamais les informations de l'annonceur). */
export function vuePublique(p) {
  return {
    publicite_id: p.publicite_id,
    titre: p.titre,
    description: p.description,
    visuel_url: construireUrl(p.visuel_url),
    telephone_contact: p.telephone_contact,
    email_contact: p.email_contact,
    localisation: p.localisation,
    rang: p.rang,
    date_debut: p.date_debut,
    date_fin: p.date_fin,
  };
}

/** Emplacement d'une page : par son code, ou par un groupe qui contient ce code de page. */
export function trouverEmplacementDePage(client, code) {
  return client.emplacementPublicitaire.findFirst({
    where: { OR: [{ code }, { pages: { has: code } }] },
    orderBy: { code: "asc" },
  });
}

/**
 * Publicités diffusées aujourd'hui sur la page `code` (slider), par rang.
 * Sans pays : une par rang au plus quand même (la plus ancienne).
 */
export async function publicitesDiffusees({ code, pays_id = null, maintenant = new Date() }) {
  const emplacement = await trouverEmplacementDePage(prisma, code);
  if (!emplacement) return null;
  const aujourdhui = jourUtc(maintenant);
  const lignes = await prisma.publicite.findMany({
    where: {
      emplacement_publicitaire_id: emplacement.emplacement_publicitaire_id,
      statut: "payee",
      date_debut: { lte: aujourdhui },
      date_fin: { gt: aujourdhui },
      ...(pays_id && { pays_id }),
    },
    orderBy: [{ rang: "asc" }, { date_debut: "asc" }],
  });
  const parRang = new Map();
  for (const l of lignes) if (!parRang.has(l.rang)) parRang.set(l.rang, l);
  const publicites = [...parRang.values()].slice(0, emplacement.nombre_places).map(vuePublique);

  const forfaits = emplacement.actif
    ? await prisma.forfaitPublicitaire.count({
        where: {
          emplacement_publicitaire_id: emplacement.emplacement_publicitaire_id, actif: true, pays_id: pays_id ?? { not: null },
          rang: { lte: emplacement.nombre_places },
        },
      })
    : 0;

  return {
    emplacement: {
      emplacement_publicitaire_id: emplacement.emplacement_publicitaire_id,
      code: emplacement.code,
      libelle: emplacement.libelle,
      nombre_places: emplacement.nombre_places,
    },
    publicites,
    reservation_possible: forfaits > 0,
  };
}

/* ===================================================================
 * Notifications WhatsApp
 * =================================================================== */

const baseFrontend = () => process.env.FRONTEND_URL || "http://localhost:5173";
export const lienPaiementPublicite = (id) => `${baseFrontend()}/publicite/${id}/paiement`;
export const lienPortailPublicite = (id) => `${baseFrontend()}/portail/annonceur/publicites/${id}`;

/**
 * Envoie le message `code` (publicite_soumise | publicite_acceptee |
 * publicite_rejetee | publicite_payee) au téléphone de l'annonceur. Ne lève jamais : un échec
 * d'envoi est journalisé (table message_whatsapp) et relancé par le job.
 */
export async function notifierPublicite(code, publicite_id) {
  try {
    const p = await prisma.publicite.findUnique({
      where: { publicite_id },
      include: {
        emplacement_publicitaire: { select: { libelle: true } },
        pays: { select: { code_iso2: true } },
        utilisateur: { select: { prenom: true, nom: true, telephone: true } },
        facture: true,
      },
    });
    if (!p) return { statut: "ignore", raison: "PUBLICITE_INTROUVABLE" };
    const destinataire = p.annonceur_telephone || p.utilisateur?.telephone;
    if (!destinataire) return { statut: "ignore", raison: "SANS_TELEPHONE" };

    const variables = {
      annonceur: p.annonceur_nom || [p.utilisateur?.prenom, p.utilisateur?.nom].filter(Boolean).join(" "),
      titre: p.titre,
      emplacement: p.emplacement_publicitaire.libelle,
      position: p.rang,
      date_debut: formaterDate(p.date_debut),
      // date_fin est exclue : on affiche le dernier jour de diffusion.
      date_fin: formaterDate(ajouterJours(jourUtc(p.date_fin), -1)),
      montant: formaterMontant(p.montant ?? 0, p.devise),
      motif: p.motif_rejet,
      date_limite_paiement: p.date_limite_paiement
        ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(p.date_limite_paiement) + " (UTC)"
        : "",
      lien_paiement: lienPaiementPublicite(p.publicite_id),
      lien_facture: lienPortailPublicite(p.publicite_id),
    };
    if (p.facture) {
      const s = p.facture.snapshot;
      variables.numero_facture = p.facture.numero;
      variables.montant_initial = formaterMontant(s.sous_total, s.devise);
      variables.frais_agregateur = formaterMontant(s.frais_agregateur, s.devise);
      variables.total_paye = formaterMontant(s.total, s.devise);
      variables.recapitulatif = `montant initial ${variables.montant_initial}, frais agrégateur ${variables.frais_agregateur}, total payé ${variables.total_paye}`;
    }

    // L'acceptation peut se répéter (relance après expiration) : une clé par décision.
    const suffixe = code === "publicite_acceptee" ? `:${p.date_moderation?.getTime() ?? 0}` : "";
    return await envoyerMessageModele({
      code,
      variables,
      destinataire,
      pays_iso2: p.pays?.code_iso2 ?? null,
      cle: `${code}:${p.publicite_id}${suffixe}`,
      utilisateur_id: p.utilisateur_id,
    });
  } catch (err) {
    console.error(`[publicite] Notification WhatsApp ${code} impossible (${publicite_id}) :`, err.message);
    return { statut: "echec", erreur: err.message };
  }
}
