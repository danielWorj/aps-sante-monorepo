// src/controllers/contact.controller.js
// Formulaire public « Contactez-nous » (site web) et sa boîte de réception
// au back-office. Aucun service e-mail n'étant branché côté serveur, les
// messages sont conservés en base et traités par l'administration.

import prisma from "../lib/prisma.js";
import { obtenirNumeroWhatsappActif } from "../services/numeroWhatsapp.service.js";

export const PROFILS_CONTACT = ["patient", "professionnel", "structure", "pharmacie", "assurance", "annonceur", "autre"];
export const SUJETS_CONTACT = [
  "question", "rendez_vous", "paiement", "partenariat", "publicite", "technique", "donnees", "autre",
];
const STATUTS = ["nouveau", "en_cours", "traite"];

const LONGUEUR_MESSAGE_MIN = 10;
const LONGUEUR_MESSAGE_MAX = 3000;
const PAR_PAGE = 20;

const texte = (v) => (typeof v === "string" ? v.trim() : "");
const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEPHONE_VALIDE = /^\+?[\d\s.-]{8,20}$/;

/**
 * POST /api/contact — PUBLIQUE (compte facultatif).
 * Corps : { nom, email?, telephone?, profil, sujet, message, site_web? }
 * `site_web` est un champ piège invisible : rempli => robot, on répond 201
 * sans rien enregistrer.
 */
export async function envoyerMessageContact(req, res, next) {
  try {
    if (texte(req.body?.site_web)) {
      return res.status(201).json({ message: "Message bien reçu." });
    }

    const nom = texte(req.body?.nom);
    const email = texte(req.body?.email).toLowerCase();
    const telephone = texte(req.body?.telephone);
    const profil = texte(req.body?.profil);
    const sujet = texte(req.body?.sujet);
    const message = texte(req.body?.message);

    const erreurs = {};
    if (nom.length < 2 || nom.length > 150) erreurs.nom = "Indiquez votre nom (2 à 150 caractères).";
    if (!email && !telephone) erreurs.email = "Indiquez au moins un e-mail ou un numéro de téléphone.";
    if (email && (!EMAIL_VALIDE.test(email) || email.length > 255)) erreurs.email = "Adresse e-mail invalide.";
    if (telephone && !TELEPHONE_VALIDE.test(telephone)) erreurs.telephone = "Numéro de téléphone invalide.";
    if (!PROFILS_CONTACT.includes(profil)) erreurs.profil = "Choisissez votre profil.";
    if (!SUJETS_CONTACT.includes(sujet)) erreurs.sujet = "Choisissez l'objet de votre message.";
    if (message.length < LONGUEUR_MESSAGE_MIN || message.length > LONGUEUR_MESSAGE_MAX) {
      erreurs.message = `Votre message doit contenir entre ${LONGUEUR_MESSAGE_MIN} et ${LONGUEUR_MESSAGE_MAX} caractères.`;
    }
    if (Object.keys(erreurs).length) {
      return res.status(400).json({ message: "Certains champs sont à corriger.", erreurs });
    }

    const cree = await prisma.messageContact.create({
      data: {
        nom,
        email: email || null,
        telephone: telephone || null,
        profil,
        sujet,
        message,
        utilisateur_id: req.utilisateur?.utilisateur_id ?? null,
      },
      select: { message_contact_id: true, date_creation: true },
    });
    return res.status(201).json({
      message: "Message bien reçu. L'équipe ApSa vous répond sous 48 heures ouvrées.",
      reference: cree.message_contact_id.slice(0, 8).toUpperCase(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/contact/coordonnees — PUBLIQUE.
 * Canaux directs affichés sur la page Contact : numéro WhatsApp actif
 * (géré au back-office) ; e-mail et téléphone via l'environnement.
 */
export async function obtenirCoordonneesContact(_req, res, next) {
  try {
    const whatsapp = await obtenirNumeroWhatsappActif().catch(() => null);
    return res.status(200).json({
      whatsapp: whatsapp?.numero ?? null,
      email: process.env.CONTACT_EMAIL || null,
      telephone: process.env.CONTACT_TELEPHONE || null,
      adresse: process.env.CONTACT_ADRESSE || null,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/messages-contact?statut=&recherche=&page= — admin. */
export async function listerMessagesContact(req, res, next) {
  try {
    const statut = STATUTS.includes(req.query.statut) ? req.query.statut : undefined;
    const recherche = texte(req.query.recherche);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

    const where = {
      ...(statut ? { statut } : {}),
      ...(recherche
        ? {
            OR: [
              { nom: { contains: recherche, mode: "insensitive" } },
              { email: { contains: recherche, mode: "insensitive" } },
              { telephone: { contains: recherche } },
              { message: { contains: recherche, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [messages, total, compteurs] = await Promise.all([
      prisma.messageContact.findMany({
        where,
        orderBy: { date_creation: "desc" },
        skip: (page - 1) * PAR_PAGE,
        take: PAR_PAGE,
      }),
      prisma.messageContact.count({ where }),
      prisma.messageContact.groupBy({ by: ["statut"], _count: { _all: true } }),
    ]);

    const parStatut = Object.fromEntries(STATUTS.map((s) => [s, 0]));
    compteurs.forEach((c) => { parStatut[c.statut] = c._count._all; });

    return res.status(200).json({
      messages,
      pagination: { page, par_page: PAR_PAGE, total, pages: Math.max(1, Math.ceil(total / PAR_PAGE)) },
      par_statut: parStatut,
    });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/messages-contact/:id { statut?, note_interne? } — admin. */
export async function modifierMessageContact(req, res, next) {
  try {
    const donnees = {};
    if (req.body?.statut !== undefined) {
      if (!STATUTS.includes(req.body.statut)) return res.status(400).json({ message: "Statut invalide." });
      donnees.statut = req.body.statut;
      donnees.date_traitement = req.body.statut === "traite" ? new Date() : null;
      donnees.traite_par_id = req.body.statut === "nouveau" ? null : req.utilisateur.utilisateur_id;
    }
    if (req.body?.note_interne !== undefined) {
      donnees.note_interne = texte(req.body.note_interne).slice(0, 2000) || null;
    }
    if (!Object.keys(donnees).length) return res.status(400).json({ message: "Aucune modification fournie." });

    const existe = await prisma.messageContact.findUnique({
      where: { message_contact_id: req.params.id },
      select: { message_contact_id: true },
    });
    if (!existe) return res.status(404).json({ message: "Message introuvable." });

    const misAJour = await prisma.messageContact.update({
      where: { message_contact_id: req.params.id },
      data: donnees,
    });
    return res.status(200).json({ message: "Message mis à jour.", messageContact: misAJour });
  } catch (err) {
    next(err);
  }
}
