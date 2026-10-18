// src/services/modeleMessageWhatsapp.service.js
// WhatsApp — textes des notifications éditables au back-office (table
// modele_message_whatsapp), ex. publicité acceptée / rejetée / payée.
//
// Un texte contient des variables {nom} remplacées à l'envoi. Une variable
// inconnue est laissée telle quelle (l'admin la voit dans le journal).
//
// Envoi : passe TOUJOURS par whatsapp.service.js (point unique). Deux modes :
//   - nom_modele_meta vide : texte libre (délivré seulement dans les 24 h
//     qui suivent un message du destinataire — règle Meta) ;
//   - nom_modele_meta renseigné : modèle Meta approuvé dont le corps contient
//     UNE variable {{1}} (ex. « APS Santé : {{1}} ») ; le texte rendu y est
//     passé, aplati sur une ligne (Meta refuse les retours à la ligne dans
//     un paramètre). C'est le seul mode qui initie une conversation.

import prisma from "../lib/prisma.js";
import { journaliserAudit } from "../lib/audit.js";
import { envoyerWhatsapp, ErreurWhatsapp } from "./whatsapp.service.js";

const LONGUEUR_MAX_TEXTE = 1000; // marge sous la limite d'un paramètre de modèle Meta
const FORMAT_NOM_MODELE = /^[a-z0-9_]{1,512}$/;
const FORMAT_LANGUE = /^[a-z]{2,3}(_[A-Z]{2})?$/;

// Variables disponibles par modèle : affichées au back-office.
export const VARIABLES_MODELES = {
  publicite_acceptee: ["annonceur", "titre", "emplacement", "position", "date_debut", "date_fin", "montant", "date_limite_paiement", "lien_paiement"],
  publicite_rejetee: ["annonceur", "titre", "emplacement", "motif"],
  publicite_payee: ["annonceur", "titre", "emplacement", "position", "date_debut", "date_fin", "numero_facture", "montant_initial", "frais_agregateur", "total_paye", "recapitulatif", "lien_facture"],
};

export function listerModelesMessage(client = prisma) {
  return client.modeleMessageWhatsapp.findMany({ orderBy: { code: "asc" } });
}

/**
 * Modifie un modèle existant (les codes sont fixés par le code métier).
 * @throws {ErreurWhatsapp}
 */
export async function modifierModeleMessage(code, champs = {}, acteur_id = null) {
  const existant = await prisma.modeleMessageWhatsapp.findUnique({ where: { code } });
  if (!existant) throw new ErreurWhatsapp("Modèle de message introuvable.", 404, "MODELE_MESSAGE_INTROUVABLE");

  const data = {};
  if (champs.libelle !== undefined) {
    if (typeof champs.libelle !== "string" || !champs.libelle.trim()) throw new ErreurWhatsapp("libelle vide.");
    data.libelle = champs.libelle.trim().slice(0, 150);
  }
  if (champs.texte !== undefined) {
    if (typeof champs.texte !== "string" || !champs.texte.trim()) throw new ErreurWhatsapp("Le texte du message est vide.");
    if (champs.texte.length > LONGUEUR_MAX_TEXTE) {
      throw new ErreurWhatsapp(`Texte trop long (${LONGUEUR_MAX_TEXTE} caractères maximum).`);
    }
    data.texte = champs.texte.trim();
  }
  if (champs.nom_modele_meta !== undefined) {
    const nom = String(champs.nom_modele_meta ?? "").trim();
    if (nom && !FORMAT_NOM_MODELE.test(nom)) {
      throw new ErreurWhatsapp("Nom de modèle Meta invalide (minuscules, chiffres et « _ »).");
    }
    data.nom_modele_meta = nom || null;
  }
  if (champs.langue !== undefined) {
    if (!FORMAT_LANGUE.test(String(champs.langue))) throw new ErreurWhatsapp("Code langue invalide (ex. fr, en_US).");
    data.langue = champs.langue;
  }
  if (champs.actif !== undefined) data.actif = Boolean(champs.actif);
  if (!Object.keys(data).length) throw new ErreurWhatsapp("Aucune donnée à mettre à jour.");

  return prisma.$transaction(async (tx) => {
    const modele = await tx.modeleMessageWhatsapp.update({ where: { code }, data });
    await journaliserAudit(tx, {
      acteur_id,
      type: "MODELE_MESSAGE_WHATSAPP_MODIFIE",
      objet_type: "modele_message_whatsapp",
      details: { code, champs: Object.keys(data) },
    });
    return modele;
  });
}

/** Remplace les {variables} connues ; les autres restent visibles. */
export function rendreTexte(texte, variables = {}) {
  return String(texte).replace(/\{(\w+)\}/g, (tout, nom) =>
    variables[nom] === undefined || variables[nom] === null ? tout : String(variables[nom])
  );
}

/** Paramètre de modèle Meta : une ligne, pas de tabulation ni de suite de 4 espaces. */
export function aplatirPourMeta(texte) {
  return String(texte).replace(/\s*\n\s*/g, " — ").replace(/\t/g, " ").replace(/ {4,}/g, "   ").trim();
}

/**
 * Envoie le message `code` rendu avec `variables`. Jamais d'exception sur un
 * échec d'envoi (voir whatsapp.service.js) ; modèle absent ou désactivé :
 * { statut: "ignore" }.
 */
export async function envoyerMessageModele({ code, variables, destinataire, pays_iso2 = null, cle, utilisateur_id = null }) {
  const modele = await prisma.modeleMessageWhatsapp.findUnique({ where: { code } });
  if (!modele || !modele.actif) return { statut: "ignore", raison: modele ? "MODELE_DESACTIVE" : "MODELE_ABSENT" };

  const texte = rendreTexte(modele.texte, variables);
  const contenu = modele.nom_modele_meta
    ? { modele: { nom: modele.nom_modele_meta, langue: modele.langue, parametres: [aplatirPourMeta(texte)] } }
    : { texte };
  return envoyerWhatsapp({ destinataire, pays_iso2, origine: code, cle, utilisateur_id, ...contenu });
}
