// src/lib/campayService.js
// Seul point d'accès à l'API CamPay (même convention que stripeService.js pour Stripe).
// ✅ = confirmé par la doc CamPay (holder_info, mass_payout, mass_payout_status, erreurs ER***).
// ⚠️ = collect, get_payment_link, transaction, withdraw, balance : repris des SDK, à confirmer.

import jwt from "jsonwebtoken";

const BASE_URL = (process.env.CAMPAY_BASE_URL || "https://demo.campay.net/api").replace(/\/$/, "");
const TOKEN = process.env.CAMPAY_TOKEN;

if (!TOKEN) {
  throw new Error("CAMPAY_TOKEN manquant dans l'environnement.");
}

export const DEVISE_CAMPAY = "XAF";

const MESSAGES = {
  ER101: "Numéro de téléphone invalide. Utilisez le format 6XXXXXXXX.",
  ER102: "Opérateur non supporté : seuls MTN et Orange Mobile Money sont acceptés.",
  ER201: "Montant invalide.",
  ER301: "Solde CamPay insuffisant pour cette opération.",
};

export class CampayError extends Error {
  constructor(message, { status = 500, code = null, payload = null } = {}) {
    super(message);
    this.name = "CampayError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

/** Numéro saisi -> format CamPay 237XXXXXXXXX (mobile camerounais : 9 chiffres commençant par 6). */
export function normaliserNumeroCM(saisie) {
  const chiffres = String(saisie ?? "").replace(/[\s.\-()+]/g, "");
  if (/^6\d{8}$/.test(chiffres)) return `237${chiffres}`;
  if (/^2376\d{8}$/.test(chiffres)) return chiffres;
  throw new CampayError(MESSAGES.ER101, { status: 400, code: "ER101" });
}

async function appelCampay(chemin, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${chemin}`, {
      method,
      headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // réseau / timeout : 502 côté API, on ne sait pas si CamPay a reçu la demande
    throw new CampayError("CamPay est momentanément injoignable.", { status: 502, payload: String(err) });
  }

  const texte = await res.text();
  let data = null;
  try { data = texte ? JSON.parse(texte) : null; } catch { data = { brut: texte }; }

  if (!res.ok) {
    const code = JSON.stringify(data ?? {}).match(/ER\d{3}/)?.[0] ?? null;
    throw new CampayError(MESSAGES[code] ?? "Le paiement Mobile Money a été refusé.", {
      status: res.status, code, payload: data,
    });
  }
  return data;
}

/** POST /collect/ — l'opérateur envoie une demande de validation au téléphone du patient. */
export function initierCollecte({ montant, numero, description, external_reference }) {
  return appelCampay("/collect/", {
    method: "POST",
    body: {
      amount: String(Math.round(Number(montant))), // ER201 si décimales
      currency: DEVISE_CAMPAY,
      from: numero,
      description,
      external_reference,
    },
  }); // -> { reference, ussd_code, operator }
}

/** POST /get_payment_link/ — page hébergée CamPay (variante « lien », voir § 4.9). */
export function creerLienPaiement({ montant, description, external_reference, email, url_succes, url_echec }) {
  return appelCampay("/get_payment_link/", {
    method: "POST",
    body: {
      amount: String(Math.round(Number(montant))),
      currency: DEVISE_CAMPAY,
      description,
      external_reference,
      email,
      redirect_url: url_succes,
      failure_redirect_url: url_echec,
      payment_options: "MOMO,CARD",
    },
  }); // -> { link } — noms de champs à confirmer dans la doc Postman
}

/** GET /transaction/{reference}/ — la SEULE source de vérité pour le statut. */
export function obtenirStatutTransaction(reference) {
  return appelCampay(`/transaction/${encodeURIComponent(reference)}/`);
}

/** POST /withdraw/ — décaissement vers un numéro Mobile Money (remboursements, retraits médecins). */
export function retirerFonds({ montant, numero, description, external_reference }) {
  return appelCampay("/withdraw/", {
    method: "POST",
    body: {
      amount: String(Math.round(Number(montant))),
      to: numero,
      description,
      external_reference,
    },
  }); // -> { reference }
}

/** GET /balance/ — { total_balance, mtn_balance, orange_balance, currency } */
export function obtenirSoldeCampay() {
  return appelCampay("/balance/");
}

/**
 * ✅ GET /holder_info/?phone_number=237XXXXXXXXX -> { full_name }
 * Affiche le titulaire d'un numéro AVANT d'y envoyer de l'argent (remboursement, retrait).
 * Passer un numéro déjà normalisé (normaliserNumeroCM).
 */
export function obtenirTitulaireNumero(numero) {
  return appelCampay(`/holder_info/?phone_number=${encodeURIComponent(numero)}`);
}

/**
 * ✅ POST /mass_payout/ — versements vers plusieurs numéros en une requête.
 * mp_reference : votre référence de lot (optionnelle).
 * external_reference (par ligne, optionnelle) : renvoyée par le statut et par le callback.
 * -> { reference, status: "PENDING" }
 */
export function lancerPaiementGroupe({ comment = "", mp_reference, lignes }) {
  return appelCampay("/mass_payout/", {
    method: "POST",
    body: {
      comment,
      mp_reference,
      details: lignes.map((l) => ({
        phone_number: l.numero,
        amount: String(Math.round(Number(l.montant))), // pas de décimales (ER201)
        description: l.description,
        external_reference: l.external_reference,
      })),
    },
  });
}

/**
 * ✅ GET /mass_payout_status/{reference}/ — statut du lot : PENDING | PROCESSING | COMPLETED.
 * Chaque ligne de `details` contient sa `transaction` ({ reference, status, ... }).
 */
export function obtenirStatutPaiementGroupe(reference) {
  return appelCampay(`/mass_payout_status/${encodeURIComponent(reference)}/`);
}

/**
 * Vérifie la signature du callback (JWT signé avec la clé de webhook, d'après les SDK).
 * À confirmer en recette : voir CAMPAY_VERIFIER_SIGNATURE dans le controller.
 */
export function signatureCallbackValide(signature) {
  const cle = process.env.CAMPAY_WEBHOOK_KEY;
  if (!cle || !signature) return false;
  try {
    jwt.verify(signature, cle, { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}
