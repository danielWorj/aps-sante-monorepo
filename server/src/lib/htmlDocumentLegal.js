// src/lib/htmlDocumentLegal.js
// Nettoyage du HTML des documents légaux (CGU, confidentialité) produit
// par l'éditeur visuel du back-office. Seules les balises de STRUCTURE
// sont conservées : la mise en forme (couleurs, polices, tailles…) est
// l'affaire du site public, jamais du contenu. Tout attribut style,
// classe, script ou gestionnaire d'événement est supprimé.

import sanitizeHtml from "sanitize-html";

export const LONGUEUR_HTML_MAX = 300_000;

const OPTIONS = {
  allowedTags: [
    "h2", "h3", "h4", "p", "br", "strong", "em", "u", "s",
    "ul", "ol", "li", "blockquote", "a", "hr",
  ],
  allowedAttributes: {
    a: ["href"],
    ol: ["start"],
  },
  // Liens absolus http(s), e-mail, téléphone, ou relatifs au site (/contact).
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowProtocolRelative: false,
  // h1 est réservé au titre de la page publique.
  transformTags: {
    h1: "h2",
    h5: "h4",
    h6: "h4",
    b: "strong",
    i: "em",
    strike: "s",
    del: "s",
  },
  disallowedTagsMode: "discard",
};

/** HTML nettoyé (chaîne vide si l'entrée n'est pas une chaîne). */
export function nettoyerHtmlDocumentLegal(html) {
  if (typeof html !== "string") return "";
  return sanitizeHtml(html, OPTIONS).trim();
}

/** Texte brut (sans balises), pour les contrôles de contenu. */
export function texteBrut(html) {
  return sanitizeHtml(html || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
