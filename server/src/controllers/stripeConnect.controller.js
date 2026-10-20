// src/controllers/stripeConnect.controller.js
// Réception des paiements par carte / compte bancaire (Stripe Connect) et
// vue d'ensemble des moyens de paiement des médecins pour le back-office.
// La logique Stripe vit dans services/stripeConnect.service.js.

import prisma from "../lib/prisma.js";
import {
  StripeConnectError,
  creerLienInscription,
  creerLienTableauDeBord,
  dissocierCompte,
  obtenirCompte,
} from "../services/stripeConnect.service.js";

function estAdmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

/**
 * Charge le médecin de l'URL et vérifie l'accès. Renvoie null (réponse déjà
 * envoyée) si refusé. `adminAutorise` : l'administration peut consulter ou
 * dissocier, mais seule la personne titulaire s'inscrit chez Stripe.
 */
async function chargerMedecin(req, res, { adminAutorise }) {
  const medecin = await prisma.medecin.findUnique({
    where: { medecin_id: req.params.medecin_id },
    select: {
      medecin_id: true,
      utilisateur_id: true,
      utilisateur: { select: { email: true, prenom: true, nom: true } },
    },
  });
  if (!medecin) {
    res.status(404).json({ message: "Médecin introuvable." });
    return null;
  }
  const proprietaire = req.utilisateur?.utilisateur_id === medecin.utilisateur_id;
  if (!proprietaire && !(adminAutorise && estAdmin(req.utilisateur))) {
    res.status(403).json({ message: "Accès refusé." });
    return null;
  }
  return medecin;
}

function transmettre(err, res, next) {
  if (err instanceof StripeConnectError) return res.status(err.status).json({ message: err.message });
  return next(err);
}

/** GET /api/medecins/:medecin_id/stripe-connect — propriétaire ou admin. */
export async function consulterCompteStripe(req, res, next) {
  try {
    const medecin = await chargerMedecin(req, res, { adminAutorise: true });
    if (!medecin) return;
    const compte = await obtenirCompte(medecin.medecin_id);
    return res.status(200).json({ compteStripe: compte });
  } catch (err) {
    transmettre(err, res, next);
  }
}

/** POST /api/medecins/:medecin_id/stripe-connect/inscription — propriétaire uniquement. */
export async function lienInscriptionStripe(req, res, next) {
  try {
    const medecin = await chargerMedecin(req, res, { adminAutorise: false });
    if (!medecin) return;
    const url = await creerLienInscription(medecin);
    return res.status(200).json({ url });
  } catch (err) {
    transmettre(err, res, next);
  }
}

/** POST /api/medecins/:medecin_id/stripe-connect/tableau-de-bord — propriétaire uniquement. */
export async function lienTableauDeBordStripe(req, res, next) {
  try {
    const medecin = await chargerMedecin(req, res, { adminAutorise: false });
    if (!medecin) return;
    const url = await creerLienTableauDeBord(medecin.medecin_id);
    return res.status(200).json({ url });
  } catch (err) {
    transmettre(err, res, next);
  }
}

/** DELETE /api/medecins/:medecin_id/stripe-connect — propriétaire ou admin. */
export async function dissocierCompteStripe(req, res, next) {
  try {
    const medecin = await chargerMedecin(req, res, { adminAutorise: true });
    if (!medecin) return;
    await dissocierCompte(medecin.medecin_id);
    return res.status(200).json({ message: "Compte Stripe dissocié de votre profil." });
  } catch (err) {
    transmettre(err, res, next);
  }
}

/**
 * GET /api/admin/moyens-paiement?recherche=&filtre=
 * Admin : tous les médecins ayant au moins un moyen de paiement, avec
 * leurs numéros Mobile Money (actif en tête) et l'état Stripe connu en
 * base (pas d'appel Stripe ici : la liste peut être longue).
 * filtre : "mobile_money" | "stripe" | "sans_actif" (Mobile Money sans numéro actif)
 */
export async function vueEnsembleMoyensPaiement(req, res, next) {
  try {
    const recherche = String(req.query.recherche || "").trim();
    const filtre = String(req.query.filtre || "");

    const conditions = [];
    if (filtre === "mobile_money") conditions.push({ mobile_moneys: { some: {} } });
    else if (filtre === "stripe") conditions.push({ compte_stripe: { isNot: null } });
    else if (filtre === "sans_actif") {
      conditions.push({ mobile_moneys: { some: {} } }, { mobile_moneys: { none: { actif: true } } });
    } else {
      conditions.push({ OR: [{ mobile_moneys: { some: {} } }, { compte_stripe: { isNot: null } }] });
    }
    if (recherche) {
      conditions.push({
        OR: [
          { numero_ordre: { contains: recherche, mode: "insensitive" } },
          { utilisateur: { nom: { contains: recherche, mode: "insensitive" } } },
          { utilisateur: { prenom: { contains: recherche, mode: "insensitive" } } },
          { utilisateur: { telephone: { contains: recherche } } },
          { mobile_moneys: { some: { numero: { contains: recherche } } } },
        ],
      });
    }

    const medecins = await prisma.medecin.findMany({
      where: { AND: conditions },
      select: {
        medecin_id: true,
        numero_ordre: true,
        utilisateur: { select: { nom: true, prenom: true, telephone: true, email: true } },
        specialite: { select: { nom: true } },
        mobile_moneys: {
          include: { type_mobile_money: { select: { libelle: true, pays: { select: { nom: true } } } } },
          orderBy: [{ actif: "desc" }, { date_creation: "desc" }],
        },
        compte_stripe: true,
      },
      orderBy: { utilisateur: { nom: "asc" } },
      take: 500,
    });

    return res.status(200).json({ medecins });
  } catch (err) {
    next(err);
  }
}
