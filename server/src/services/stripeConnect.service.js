// src/services/stripeConnect.service.js
// Réception des paiements par carte bancaire / compte bancaire d'un
// médecin via Stripe Connect (comptes « Express »).
//
// Principe : ApSa ne voit ni ne stocke JAMAIS de numéro de carte ou
// d'IBAN (obligation PCI-DSS). Le médecin saisit ses coordonnées sur la
// page d'inscription hébergée par Stripe (Account Link) ; on conserve
// uniquement l'identifiant du compte (acct_…) et un résumé affichable
// (marque, 4 derniers chiffres, statut), resynchronisé depuis Stripe.
//
// Variables d'environnement (facultatives) :
//   STRIPE_CONNECT_PAYS               code ISO2 imposé à la création du compte
//                                     (sinon : pays de la plateforme Stripe)
//   STRIPE_CONNECT_ACCORD_SERVICE     "full" (défaut) | "recipient" — à mettre à
//                                     "recipient" pour des comptes hors du pays
//                                     de la plateforme (virements transfrontaliers)
//   FRONTEND_URL                      base des URL de retour (déjà utilisée ailleurs)

import prisma from "../lib/prisma.js";
import { stripe } from "../lib/stripeService.js";

export class StripeConnectError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "StripeConnectError";
    this.status = status;
  }
}

const baseFrontend = () => process.env.FRONTEND_URL || "http://localhost:5173";
const CHEMIN_PAGE = "/portail/medecin-paiements";

/** Message lisible pour une erreur de l'API Stripe (détail dans les logs). */
function traduireErreurStripe(err, contexte) {
  console.error(`[stripe-connect] ${contexte} :`, err?.message);
  if (err?.type === "StripeInvalidRequestError" && /connect/i.test(err?.message || "")) {
    return new StripeConnectError(
      "Stripe Connect n'est pas activé sur le compte Stripe d'ApSa. Contactez l'administration.",
      503
    );
  }
  return new StripeConnectError("Stripe est momentanément indisponible. Réessayez dans quelques instants.", 502);
}

/** Copie en base l'état du compte Stripe (drapeaux + résumé du moyen de réception). */
export async function synchroniserCompte(compte) {
  let compteStripe;
  try {
    compteStripe = await stripe.accounts.retrieve(compte.stripe_account_id);
  } catch (err) {
    throw traduireErreurStripe(err, `lecture du compte ${compte.stripe_account_id}`);
  }

  let externe = compteStripe.external_accounts?.data?.[0] ?? null;
  if (!externe) {
    try {
      const liste = await stripe.accounts.listExternalAccounts(compte.stripe_account_id, { limit: 1 });
      externe = liste.data?.[0] ?? null;
    } catch {
      externe = null; // lecture non autorisée selon le type de compte : résumé laissé vide
    }
  }

  return prisma.compteStripeConnect.update({
    where: { id: compte.id },
    data: {
      details_soumis: Boolean(compteStripe.details_submitted),
      paiements_actives: Boolean(compteStripe.charges_enabled),
      virements_actives: Boolean(compteStripe.payouts_enabled),
      exigences_en_attente: compteStripe.requirements?.currently_due?.length ?? 0,
      type_externe: externe?.object ?? null,
      marque_externe: externe ? (externe.object === "card" ? externe.brand : externe.bank_name) ?? null : null,
      derniers_chiffres: externe?.last4 ?? null,
      devise: (externe?.currency || compteStripe.default_currency || "").toUpperCase() || null,
      pays: compteStripe.country ?? null,
      date_synchro: new Date(),
    },
  });
}

/** Compte Connect du médecin, resynchronisé si possible (une panne Stripe renvoie l'état connu). */
export async function obtenirCompte(medecin_id) {
  const compte = await prisma.compteStripeConnect.findUnique({ where: { medecin_id } });
  if (!compte) return null;
  try {
    return await synchroniserCompte(compte);
  } catch {
    return compte;
  }
}

/**
 * Lien d'inscription Stripe (création du compte Express au premier appel).
 * @param {object} medecin { medecin_id, utilisateur: { email, prenom, nom } }
 * @returns {Promise<string>} URL de la page Stripe (valable quelques minutes)
 */
export async function creerLienInscription(medecin) {
  let compte = await prisma.compteStripeConnect.findUnique({ where: { medecin_id: medecin.medecin_id } });

  if (!compte) {
    const accord = process.env.STRIPE_CONNECT_ACCORD_SERVICE === "recipient" ? "recipient" : null;
    let compteStripe;
    try {
      compteStripe = await stripe.accounts.create({
        type: "express",
        ...(process.env.STRIPE_CONNECT_PAYS ? { country: process.env.STRIPE_CONNECT_PAYS } : {}),
        ...(medecin.utilisateur?.email ? { email: medecin.utilisateur.email } : {}),
        business_type: "individual",
        capabilities: { transfers: { requested: true } },
        ...(accord ? { tos_acceptance: { service_agreement: accord } } : {}),
        business_profile: {
          mcc: "8011", // médecins
          product_description: "Consultations médicales réservées via ApSa",
        },
        metadata: { medecin_id: medecin.medecin_id },
      });
    } catch (err) {
      throw traduireErreurStripe(err, `création du compte (médecin ${medecin.medecin_id})`);
    }
    compte = await prisma.compteStripeConnect.create({
      data: { medecin_id: medecin.medecin_id, stripe_account_id: compteStripe.id, pays: compteStripe.country ?? null },
    });
  }

  try {
    const lien = await stripe.accountLinks.create({
      account: compte.stripe_account_id,
      type: "account_onboarding",
      refresh_url: `${baseFrontend()}${CHEMIN_PAGE}?stripe=relancer`,
      return_url: `${baseFrontend()}${CHEMIN_PAGE}?stripe=retour`,
    });
    return lien.url;
  } catch (err) {
    throw traduireErreurStripe(err, `lien d'inscription ${compte.stripe_account_id}`);
  }
}

/** Lien vers le tableau de bord Stripe Express (modifier la carte / le compte de réception). */
export async function creerLienTableauDeBord(medecin_id) {
  const compte = await prisma.compteStripeConnect.findUnique({ where: { medecin_id } });
  if (!compte) throw new StripeConnectError("Aucun compte Stripe n'est encore associé.", 404);
  if (!compte.details_soumis) {
    throw new StripeConnectError("Terminez d'abord votre inscription Stripe.", 409);
  }
  try {
    const lien = await stripe.accounts.createLoginLink(compte.stripe_account_id);
    return lien.url;
  } catch (err) {
    throw traduireErreurStripe(err, `lien tableau de bord ${compte.stripe_account_id}`);
  }
}

/** Dissocie le compte Stripe du profil (le compte reste chez Stripe, sans suppression). */
export async function dissocierCompte(medecin_id) {
  const { count } = await prisma.compteStripeConnect.deleteMany({ where: { medecin_id } });
  if (count === 0) throw new StripeConnectError("Aucun compte Stripe n'est associé.", 404);
}
