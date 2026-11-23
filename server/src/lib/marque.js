// src/lib/marque.js
//
// Nom de la marque et raison sociale utilisés dans les messages envoyés par
// le serveur (e-mails, SMS, notifications, libellés de paiement, réponses
// d'API). Source unique, variables d'environnement (.env racine) :
//   NOM_MARQUE      (défaut « ApSa »)
//   RAISON_SOCIALE  (défaut « AZA PROXI SANTÉ ASSURANCES »)
// Les mêmes variables alimentent le web, le back-office (VITE_NOM_MARQUE,
// VITE_RAISON_SOCIALE via docker-compose.yaml) et le mobile
// (--dart-define=NOM_MARQUE=… / RAISON_SOCIALE=…).

// Chargé ici aussi : les constantes ci-dessous sont lues à l'import du
// module, quel que soit l'ordre des imports du point d'entrée.
import "dotenv/config";

const lire = (valeur, defaut) => (typeof valeur === "string" && valeur.trim() ? valeur.trim() : defaut);

export const NOM_MARQUE = lire(process.env.NOM_MARQUE, "ApSa");

export const RAISON_SOCIALE = lire(process.env.RAISON_SOCIALE, "AZA PROXI SANTÉ ASSURANCES");

/**
 * NOM_MARQUE sans accents ni caractères hors ASCII imprimable, pour les
 * libellés des agrégateurs qui les refusent (descriptions CamPay).
 */
export const NOM_MARQUE_ASCII =
  NOM_MARQUE.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "").trim() || "ApSa";

/** « d'ApSa » devant une voyelle ou un h, « de … » sinon. */
export const DE_MARQUE = /^[aeiouyhàâäéèêëîïôöùûüœæ]/i.test(NOM_MARQUE) ? `d'${NOM_MARQUE}` : `de ${NOM_MARQUE}`;
