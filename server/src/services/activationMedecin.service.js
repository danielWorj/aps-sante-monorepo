// src/services/activationMedecin.service.js
//
// E-mail envoyé au médecin quand son compte est activé (passage « non
// activé » -> « activé », voir lib/activationMedecin.js) : il est informé,
// invité à se connecter à son espace et reçoit les liens de téléchargement
// de l'application mobile.
//
// Jamais bloquant : l'activation est déjà enregistrée quand l'e-mail part
// (email.service.js journalise et relance les échecs).
//
// Variables d'environnement :
//   FRONTEND_URL     site public (bouton « Accéder à mon espace »)
//   API_PUBLIC_URL   adresse publique de l'API, pour le lien permanent de
//                    téléchargement de l'application (ex. https://api.azasante.com)
//   CONTACT_EMAIL    adresse d'aide affichée dans l'e-mail (facultatif)

import prisma from "../lib/prisma.js";
import { estMedecinActive } from "../lib/activationMedecin.js";
import { horsPerimetre } from "../lib/perimetrePays.js";
import { construireEmailHtml, envoyerEmail } from "./email.service.js";
import { NOM_MARQUE } from "../lib/marque.js";

const sansBarreFinale = (url) => String(url || "").replace(/\/+$/, "");

function liensApplication({ iosDisponible }) {
  const api = sansBarreFinale(process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`);
  return [
    { libelle: "Télécharger pour Android", url: `${api}/api/apks/telecharger/android` },
    ...(iosDisponible ? [{ libelle: "Télécharger pour iPhone", url: `${api}/api/apks/telecharger/ios` }] : []),
  ];
}

/**
 * Contenu de l'e-mail d'activation (sujet, texte, HTML).
 * @param {{ prenom: string, nom: string, email: string, telephone?: string|null,
 *   specialite?: string|null, ville?: string|null, numeroOrdre?: string|null, iosDisponible?: boolean }} p
 */
export function contenuEmailActivation({ prenom, nom, email, telephone, specialite, ville, numeroOrdre, iosDisponible = false }) {
  const site = sansBarreFinale(process.env.FRONTEND_URL || "http://localhost:5173");
  const lienConnexion = `${site}/login`;
  const applications = liensApplication({ iosDisponible });
  const contact = process.env.CONTACT_EMAIL || "";
  const nomComplet = `Dr ${[prenom, nom].filter(Boolean).join(" ")}`.trim();

  const sujet = `Votre compte médecin ${NOM_MARQUE} est activé`;
  const titre = "Votre compte est activé";
  const salutation = `Bonjour ${nomComplet},`;
  const paragraphes = [
    `Bonne nouvelle : l'équipe ${NOM_MARQUE} a vérifié votre dossier et activé votre compte médecin.`,
    `Votre fiche est désormais visible des patients sur le site et l'application mobile ${NOM_MARQUE}. Vous pouvez dès maintenant vous connecter à votre espace médecin.`,
  ];
  const details = [
    ["Médecin", nomComplet],
    ...(specialite ? [["Spécialité", specialite]] : []),
    ...(ville ? [["Ville d'exercice", ville]] : []),
    ...(numeroOrdre ? [["N° d'ordre", numeroOrdre]] : []),
    ["Identifiant de connexion", telephone || email],
  ];
  const etapes = [
    telephone
      ? "Connectez-vous avec votre numéro de téléphone et votre code PIN (ou votre e-mail et votre mot de passe)."
      : "Connectez-vous avec votre e-mail et votre mot de passe.",
    "Complétez votre profil : photo, présentation, tarifs et moyens de paiement.",
    "Ouvrez votre agenda pour recevoir vos premiers rendez-vous et téléconsultations.",
  ];
  const aide = contact ? `Une question ? Écrivez-nous à ${contact}, nous vous répondrons rapidement.` : "";

  const html = construireEmailHtml({
    titre,
    preentete: "Votre compte médecin est activé : connectez-vous à votre espace et téléchargez l'application.",
    salutation,
    paragraphes,
    details,
    etapes,
    bouton: { libelle: "Accéder à mon espace médecin", url: lienConnexion },
    secondaire: { titre: `Téléchargez l'application mobile ${NOM_MARQUE}`, boutons: applications },
    apresBouton: [aide],
    pied: `Vous recevez cet e-mail car votre compte médecin vient d'être activé sur ${NOM_MARQUE}.`,
  });

  const texte = [
    salutation,
    "",
    ...paragraphes,
    "",
    ...details.map(([k, v]) => `${k} : ${v}`),
    "",
    "Pour commencer :",
    ...etapes.map((e, i) => `${i + 1}. ${e}`),
    "",
    `Accéder à mon espace médecin : ${lienConnexion}`,
    "",
    `Téléchargez l'application mobile ${NOM_MARQUE} :`,
    ...applications.map((a) => `- ${a.libelle} : ${a.url}`),
    ...(aide ? ["", aide] : []),
    "",
    "Cordialement,",
    `L'équipe ${NOM_MARQUE}`,
  ].join("\n");

  return { sujet, texte, html };
}

/**
 * Envoie l'e-mail d'activation si le médecin est bien activé.
 * @param {string} medecinId
 * @param {{ cle?: string }} [options] clé d'idempotence (une par activation)
 * @returns {Promise<object|null>} résultat de envoyerEmail, ou null si rien à envoyer
 */
export async function envoyerEmailActivationMedecin(medecinId, { cle } = {}) {
  return horsPerimetre(async () => {
    const medecin = await prisma.medecin.findUnique({
      where: { medecin_id: medecinId },
      select: {
        medecin_id: true,
        numero_ordre: true,
        statut_verification: true,
        date_premiere_publication: true,
        utilisateur: { select: { utilisateur_id: true, nom: true, prenom: true, email: true, telephone: true, statut_compte: true } },
        specialite: { select: { nom: true } },
        ville_exercice: { select: { nom: true } },
      },
    });
    const u = medecin?.utilisateur;
    if (!medecin || !u?.email || !estMedecinActive(medecin, u.statut_compte)) return null;

    const iosDisponible = (await prisma.mobileApk.count({ where: { status: true, plateforme: "ios" } })) > 0;
    const { sujet, texte, html } = contenuEmailActivation({
      prenom: u.prenom,
      nom: u.nom,
      email: u.email,
      telephone: u.telephone,
      specialite: medecin.specialite?.nom,
      ville: medecin.ville_exercice?.nom,
      numeroOrdre: medecin.numero_ordre,
      iosDisponible,
    });

    return envoyerEmail({
      destinataire: u.email,
      sujet,
      texte,
      html,
      origine: "medecin_active",
      cle: cle ?? `medecin_active:${medecin.medecin_id}:${Date.now()}`,
      utilisateur_id: u.utilisateur_id,
    });
  });
}

/**
 * À appeler après une action qui peut activer un médecin (publication,
 * réactivation, modification admin) : envoie l'e-mail seulement si le
 * médecin N'ÉTAIT PAS activé avant l'action et l'est maintenant.
 * Ne lève jamais d'exception.
 * @param {string} medecinId
 * @param {boolean} etaitActive  état avant l'action (estMedecinActive)
 */
export function notifierActivationSiNecessaire(medecinId, etaitActive) {
  if (etaitActive) return;
  // Clé à la minute : un double clic ne renvoie pas l'e-mail, une
  // réactivation ultérieure (après suspension) en renvoie un nouveau.
  const cle = `medecin_active:${medecinId}:${new Date().toISOString().slice(0, 16)}`;
  envoyerEmailActivationMedecin(medecinId, { cle }).catch((err) => {
    console.error(`[activation] E-mail d'activation du médecin ${medecinId} impossible :`, err?.message || err);
  });
}
