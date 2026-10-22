// src/services/documentLegal.service.js
// Documents légaux (CGU, politique de confidentialité) : version en
// vigueur et enregistrement des acceptations à l'inscription.
//
// Les formulaires d'inscription (web et mobile) imposent la case « J'accepte
// les CGU et la politique de confidentialité » et envoient
// `accepte_cgu: true` : le serveur enregistre alors l'acceptation des
// versions publiées au moment de la création. `accepte_cgu` explicitement
// faux est refusé. Champ absent : création acceptée mais rien n'est
// enregistré — c'est le cas des anciennes versions de l'application
// mobile et des créations faites au back-office (qui passent par les
// mêmes routes, par exemple POST /medecins).

import prisma from "../lib/prisma.js";

export const TYPES_DOCUMENT_LEGAL = ["cgu", "confidentialite"];

export const LIBELLES_DOCUMENT_LEGAL = {
  cgu: "Conditions générales d'utilisation",
  confidentialite: "Politique de confidentialité",
};

export const MESSAGE_CGU_REFUSEES =
  "Vous devez accepter les conditions générales d'utilisation et la politique de confidentialité.";

/** Vrai si le corps de la requête refuse explicitement les CGU (JSON ou multipart). */
export function cguRefusees(body) {
  const v = body?.accepte_cgu;
  return v === false || v === "false" || v === "0" || v === 0;
}

/** Vrai si le corps de la requête accepte explicitement les CGU (JSON ou multipart). */
export function cguAcceptees(body) {
  const v = body?.accepte_cgu;
  return v === true || v === "true" || v === "1" || v === 1;
}

/** Version publiée (en vigueur) d'un type, ou null. */
export function obtenirVersionEnVigueur(type, client = prisma) {
  return client.versionDocumentLegal.findFirst({
    where: { type, statut: "publiee" },
    orderBy: { numero: "desc" },
  });
}

/**
 * Enregistre l'acceptation, par `utilisateurId`, des versions en vigueur
 * de chaque document légal, si la requête porte `accepte_cgu: true`.
 * Ne lève jamais : un incident ici ne doit pas faire échouer une
 * inscription déjà enregistrée (on journalise). Sans version publiée
 * (documents pas encore rédigés), rien n'est écrit.
 *
 * @param {{ utilisateurId: string, req: import("express").Request, contexte: string }} params
 */
export async function enregistrerAcceptationsLegales({ utilisateurId, req, contexte }) {
  if (!utilisateurId || !cguAcceptees(req?.body)) return;
  try {
    const versions = await prisma.versionDocumentLegal.findMany({
      where: { statut: "publiee" },
      select: { version_document_legal_id: true },
    });
    if (!versions.length) return;
    const adresse_ip = req?.ip ? String(req.ip).slice(0, 64) : null;
    const user_agent = req?.get?.("user-agent")?.slice(0, 300) || null;
    await prisma.acceptationDocumentLegal.createMany({
      data: versions.map((v) => ({
        utilisateur_id: utilisateurId,
        version_document_legal_id: v.version_document_legal_id,
        contexte: String(contexte).slice(0, 40),
        adresse_ip,
        user_agent,
      })),
      skipDuplicates: true,
    });
  } catch (err) {
    console.error("enregistrerAcceptationsLegales :", err);
  }
}

/**
 * Pour les fiches (pharmacie, structure, assurance, laboratoire) créées
 * par un compte connecté : c'est l'auteur de la soumission qui a coché la
 * case. Un admin qui saisit une fiche au back-office n'accepte rien pour
 * autrui : on n'enregistre rien dans ce cas.
 */
export function enregistrerAcceptationsAuteur(req, contexte) {
  const auteur = req.utilisateur;
  if (!auteur || ["admin", "superadmin"].includes(auteur.role)) return Promise.resolve();
  return enregistrerAcceptationsLegales({ utilisateurId: auteur.utilisateur_id, req, contexte });
}
