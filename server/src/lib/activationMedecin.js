// src/lib/activationMedecin.js
//
// « Médecin activé » : règle unique, utilisée pour
//   - la visibilité publique (annuaire web, application mobile, fiche) ;
//   - l'accès à l'espace médecin (connexion, choix d'espace, renouvellement) ;
//   - l'e-mail d'activation (envoyé au passage non activé -> activé).
//
// Un médecin est activé quand :
//   - son compte utilisateur est actif (pas suspendu), ET
//   - sa fiche a été activée par l'équipe APS Santé : statut "publie", ou
//     "en_cours" après une première activation (le médecin a modifié sa
//     fiche, qui repasse en vérification : il garde sa visibilité et son
//     accès pendant la modération, comme ses droits d'abonnement — voir
//     lib/acteursPresence.js).

import { NOM_MARQUE } from "./marque.js";

export const MESSAGE_COMPTE_NON_ACTIVE =
  `Votre compte médecin n'est pas encore activé. L'équipe ${NOM_MARQUE} vérifie votre dossier : vous recevrez un e-mail dès son activation.`;

/**
 * @param {{ statut_verification?: string, date_premiere_publication?: Date|null }} medecin
 * @param {string} [statutCompte] statut_compte du compte lié (si connu)
 */
export function estMedecinActive(medecin, statutCompte) {
  if (!medecin) return false;
  if (statutCompte !== undefined && statutCompte !== "actif") return false;
  if (medecin.statut_verification === "publie") return true;
  return medecin.statut_verification === "en_cours" && Boolean(medecin.date_premiere_publication);
}

/** Filtre Prisma (modèle Medecin) des médecins activés. */
export function filtreMedecinsActives() {
  return {
    utilisateur: { statut_compte: "actif" },
    OR: [
      { statut_verification: "publie" },
      { statut_verification: "en_cours", date_premiere_publication: { not: null } },
    ],
  };
}
