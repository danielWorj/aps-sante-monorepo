// src/services/espacePresence.service.js
// Espaces pharmacie et centre de santé : règles métier de ce que le
// gestionnaire (agent de la fiche) gère depuis son espace, en plus de la
// fiche elle-même et de son abonnement de présence :
//
//   1. PHOTOS : galerie de la fiche. Toujours conservées ; le public n'en
//      voit que si l'abonnement inclut les photos, dans la limite max_photos
//      du niveau (null = illimité), dans l'ordre choisi par l'agent.
//   2. ACTUALITÉS : informations pratiques (fermeture exceptionnelle,
//      campagne de vaccination…). Publiques avec le droit
//      description_enrichie, entre date_publication et date_expiration.
//   3. MESSAGES : formulaire de contact de la fiche publique, ouvert si
//      l'abonnement inclut le contact direct. Les agents sont notifiés.
//   4. PRESTATIONS (centres de santé) : actes et examens, publics avec le
//      droit description_enrichie.
//   5. TABLEAU DE BORD : complétude de la fiche.
//
// Les fonctions pures sont testées sans base (tests/espacePresence.test.js).

import prisma from "../lib/prisma.js";
import { construireUrl } from "../lib/cloudinaryService.js";
import { creerNotifications } from "./notification.service.js";

export const TYPES_ESPACE_PRESENCE = Object.freeze(["pharmacie", "structure"]);

const CONFIG = {
  pharmacie: { cle: "pharmacie_id", libelle: "pharmacie", lienEspace: "/portail/pharmacie-messages" },
  structure: { cle: "structure_id", libelle: "centre de santé", lienEspace: "/portail/structure-messages" },
};

function config(type) {
  const c = CONFIG[type];
  if (!c) throw new Error(`Type d'espace inconnu : ${type}`);
  return c;
}

/** Colonnes qui rattachent une ligne (photo, actualité, message) à sa fiche. */
export function rattachement(type, acteur_id) {
  return { type_acteur: type, [config(type).cle]: acteur_id };
}

/** Identifiant de la fiche portée par une ligne rattachée. */
export function acteurDeLaLigne(ligne) {
  return ligne.pharmacie_id ?? ligne.structure_id ?? null;
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const texte = (v) => (typeof v === "string" ? v.trim() : v === undefined || v === null ? v : String(v).trim());

/* ============================ Coordonnées de la fiche ============================ */

export const LIMITES_COORDONNEES = Object.freeze({ adresse: 255, email: 255 });

/**
 * Adresse lisible et e-mail de contact (création / modification de la
 * fiche). Champ absent : inchangé ; chaîne vide : effacé.
 * @returns {{ erreur?: string, data?: { adresse?: string|null, email?: string|null } }}
 */
export function normaliserCoordonnees({ adresse, email } = {}) {
  const data = {};
  if (adresse !== undefined) {
    const v = texte(adresse) || null;
    if (v && v.length > LIMITES_COORDONNEES.adresse) return { erreur: `Adresse trop longue (${LIMITES_COORDONNEES.adresse} caractères maximum).` };
    data.adresse = v;
  }
  if (email !== undefined) {
    const v = texte(email)?.toLowerCase() || null;
    if (v && (!REGEX_EMAIL.test(v) || v.length > LIMITES_COORDONNEES.email)) return { erreur: "Adresse e-mail de la fiche invalide." };
    data.email = v;
  }
  return { data };
}

/* ============================ Photos ============================ */

// Plafond de stockage (indépendant de l'abonnement, qui ne décide que de
// l'affichage public).
export const MAX_PHOTOS_STOCKEES = 30;
export const TITRE_PHOTO_MAX = 150;

const parOrdre = (a, b) => a.ordre - b.ordre || new Date(a.date_creation) - new Date(b.date_creation);

/** Photos visibles du PUBLIC selon les droits (les autres restent conservées). */
export function photosVisibles(medias, droits) {
  if (!droits?.photos) return [];
  const tries = [...medias].sort(parOrdre);
  const max = droits.max_photos;
  return max === null || max === undefined ? tries : tries.slice(0, Math.max(0, max));
}

/** @returns {null | { code: string, message: string }} */
export function refusAjoutPhoto(nbPhotos) {
  if (nbPhotos < MAX_PHOTOS_STOCKEES) return null;
  return { code: "QUOTA_PHOTOS_ATTEINT", message: `Vous avez atteint le nombre maximal de photos (${MAX_PHOTOS_STOCKEES}).` };
}

export function presenterPhoto(m) {
  const url = construireUrl(m.fichier_nom);
  // image_id / legende : noms attendus par les fiches publiques.
  return {
    media_id: m.media_id,
    image_id: m.media_id,
    titre: m.titre,
    legende: m.titre,
    ordre: m.ordre,
    taille_octets: m.taille_octets ?? null,
    date_creation: m.date_creation,
    url,
  };
}

export function listerPhotosDeLaFiche(type, acteur_id) {
  return prisma.mediaFichePresence.findMany({
    where: rattachement(type, acteur_id),
    orderBy: [{ ordre: "asc" }, { date_creation: "asc" }],
  });
}

/* ============================ Actualités ============================ */

export const LIMITES_ACTUALITE = Object.freeze({ titre: 150, contenu: 3000 });
export const MAX_ACTUALITES = 50;

function lireDate(valeur, champ) {
  if (valeur === null || valeur === "") return { valeur: null };
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return { erreur: `${champ} invalide (date ISO attendue).` };
  return { valeur: d };
}

/**
 * Valide la saisie d'une actualité. `partiel` (modification) : seuls les
 * champs fournis sont contrôlés. `existante` : valeurs actuelles, pour
 * vérifier l'ordre des dates en modification.
 * @returns {{ erreur?: string, data?: object }}
 */
export function normaliserActualite(corps = {}, { partiel = false, existante = null } = {}) {
  const data = {};
  for (const champ of ["titre", "contenu"]) {
    const v = texte(corps[champ]);
    if (partiel && v === undefined) continue;
    if (!v) return { erreur: champ === "titre" ? "Le titre est requis." : "Le texte de l'actualité est requis." };
    if (v.length > LIMITES_ACTUALITE[champ]) {
      return { erreur: `${champ === "titre" ? "Titre" : "Texte"} trop long (${LIMITES_ACTUALITE[champ]} caractères maximum).` };
    }
    data[champ] = v;
  }
  if (corps.publiee !== undefined) data.publiee = corps.publiee === true || corps.publiee === "true";
  if (corps.date_publication !== undefined && corps.date_publication !== null && corps.date_publication !== "") {
    const d = lireDate(corps.date_publication, "date_publication");
    if (d.erreur) return { erreur: d.erreur };
    data.date_publication = d.valeur;
  }
  if (corps.date_expiration !== undefined) {
    const d = lireDate(corps.date_expiration, "date_expiration");
    if (d.erreur) return { erreur: d.erreur };
    data.date_expiration = d.valeur;
  }
  const publication = data.date_publication ?? existante?.date_publication ?? new Date();
  const expiration = data.date_expiration !== undefined ? data.date_expiration : existante?.date_expiration ?? null;
  if (expiration && new Date(expiration) <= new Date(publication)) {
    return { erreur: "La date de fin doit suivre la date de publication." };
  }
  return { data };
}

/** En ligne sur la fiche publique à `maintenant` (hors droits d'abonnement). */
export function actualiteEnLigne(a, maintenant = new Date()) {
  return a.publiee
    && new Date(a.date_publication) <= maintenant
    && (!a.date_expiration || new Date(a.date_expiration) > maintenant);
}

/** Statut lisible pour le gestionnaire. */
export function statutActualite(a, maintenant = new Date()) {
  if (!a.publiee) return "brouillon";
  if (new Date(a.date_publication) > maintenant) return "programmee";
  if (a.date_expiration && new Date(a.date_expiration) <= maintenant) return "expiree";
  return "en_ligne";
}

export function presenterActualite(a, maintenant = new Date()) {
  return {
    actualite_id: a.actualite_id,
    // annonce_id / description : noms attendus par la fiche publique pharmacie.
    annonce_id: a.actualite_id,
    titre: a.titre,
    contenu: a.contenu,
    description: a.contenu,
    image_url: a.image_nom ? construireUrl(a.image_nom) : null,
    publiee: a.publiee,
    date_publication: a.date_publication,
    date_expiration: a.date_expiration,
    statut: statutActualite(a, maintenant),
    date_creation: a.date_creation,
  };
}

/* ============================ Messages ============================ */

export const LIMITES_MESSAGE = Object.freeze({ nom: 150, email: 255, telephone: 30, contenu: 3000, contenu_min: 5 });
export const STATUTS_MESSAGE = Object.freeze(["non_lu", "lu", "archive"]);
const REGEX_TELEPHONE = /^[+\d][\d\s.-]{5,29}$/;

/** @returns {{ erreur?: string, data?: { nom, email, telephone, contenu } }} */
export function normaliserMessage(corps = {}) {
  const nom = texte(corps.nom) || null;
  const email = texte(corps.email)?.toLowerCase();
  const telephone = texte(corps.telephone) || null;
  // « message » : nom du champ envoyé par les fiches publiques.
  const contenu = texte(corps.contenu ?? corps.message);
  if (!email || !REGEX_EMAIL.test(email) || email.length > LIMITES_MESSAGE.email) {
    return { erreur: "Adresse e-mail invalide." };
  }
  if (nom && nom.length > LIMITES_MESSAGE.nom) return { erreur: `Nom trop long (${LIMITES_MESSAGE.nom} caractères maximum).` };
  if (telephone && !REGEX_TELEPHONE.test(telephone)) return { erreur: "Numéro de téléphone invalide." };
  if (!contenu || contenu.length < LIMITES_MESSAGE.contenu_min) return { erreur: "Votre message est trop court." };
  if (contenu.length > LIMITES_MESSAGE.contenu) {
    return { erreur: `Message trop long (${LIMITES_MESSAGE.contenu} caractères maximum).` };
  }
  return { data: { nom, email, telephone, contenu } };
}

export function presenterMessage(m) {
  return {
    message_id: m.message_id,
    nom: m.nom,
    email: m.email,
    telephone: m.telephone,
    contenu: m.contenu,
    statut: m.statut,
    date_creation: m.date_creation,
    date_lecture: m.date_lecture,
    compte_aps: !!m.utilisateur_id,
  };
}

/**
 * Notifie les agents de la fiche d'un nouveau message (in-app + push). Ne
 * lève jamais : le message est déjà enregistré.
 */
export async function notifierMessageRecu({ type, acteur_id, nomFiche, message, agents }) {
  try {
    const { lienEspace } = config(type);
    await creerNotifications(agents.map((utilisateur_id) => ({
      utilisateur_id,
      type: "message_fiche_recu",
      titre: "Nouveau message",
      message: `${message.nom || message.email} vous a écrit depuis la fiche « ${nomFiche} ».`,
      donnees: { type_acteur: type, acteur_id, message_id: message.message_id, lien: lienEspace },
      cle: `message_fiche_recu:${message.message_id}:${utilisateur_id}`,
    })));
  } catch (err) {
    console.error(`[espace-presence] Notification du message ${message.message_id} non envoyée :`, err.message);
  }
}

/* ============================ Prestations ============================ */

export const LIMITES_PRESTATION = Object.freeze({ nom: 200, categorie: 100, description: 2000 });
export const MAX_PRESTATIONS = 300;

/** @returns {{ erreur?: string, data?: object }} */
export function normaliserPrestation(corps = {}, { partiel = false } = {}) {
  const data = {};
  const nom = texte(corps.nom);
  if (!partiel || nom !== undefined) {
    if (!nom) return { erreur: "Le nom de la prestation est requis." };
    if (nom.length > LIMITES_PRESTATION.nom) return { erreur: `Nom trop long (${LIMITES_PRESTATION.nom} caractères maximum).` };
    data.nom = nom;
  }
  for (const champ of ["categorie", "description"]) {
    const v = texte(corps[champ]);
    if (v === undefined) continue;
    if (v && v.length > LIMITES_PRESTATION[champ]) {
      return { erreur: `${champ === "categorie" ? "Catégorie" : "Description"} trop longue (${LIMITES_PRESTATION[champ]} caractères maximum).` };
    }
    data[champ] = v || null;
  }
  if (corps.prix !== undefined) {
    if (corps.prix === null || corps.prix === "") {
      data.prix = null;
    } else {
      const prix = Number(String(corps.prix).replace(",", "."));
      if (!Number.isFinite(prix) || prix < 0 || prix > 1e10) return { erreur: "Prix invalide." };
      data.prix = Math.round(prix * 100) / 100;
    }
  }
  if (corps.disponible !== undefined) data.disponible = corps.disponible === true || corps.disponible === "true";
  return { data };
}

export function presenterPrestation(p, devise = null) {
  return {
    prestation_id: p.prestation_id,
    // examen_id : nom attendu par la fiche publique (onglet « Examens »).
    examen_id: p.prestation_id,
    nom: p.nom,
    categorie: p.categorie,
    description: p.description,
    prix: p.prix === null || p.prix === undefined ? null : Number(p.prix),
    devise,
    disponible: p.disponible,
  };
}

/* ============================ Tableau de bord ============================ */

/** Ce qui rend une fiche utile au public, avec la rubrique où le compléter. */
export function completudeFiche(type, { fiche, nbPhotos, nbPrestations = 0, aGeolocalisation }) {
  const elements = [
    { cle: "adresse", libelle: "Adresse lisible (quartier, rue, repère)", rubrique: "fiche", ok: !!fiche.adresse?.trim() },
    { cle: "geolocalisation", libelle: "Position sur la carte", rubrique: "fiche", ok: aGeolocalisation },
    { cle: "horaires", libelle: "Horaires d'ouverture", rubrique: "horaires", ok: !!fiche.horaires },
    { cle: "email", libelle: "Adresse e-mail de contact", rubrique: "fiche", ok: !!fiche.email?.trim() },
    { cle: "photo", libelle: "Photo principale", rubrique: "fiche", ok: !!fiche.image_nom },
    { cle: "description", libelle: "Présentation", rubrique: "presentation", ok: !!fiche.description_enrichie?.trim() },
    type === "pharmacie"
      ? { cle: "services", libelle: "Services particuliers", rubrique: "presentation", ok: !!fiche.services_particuliers?.trim() }
      : { cle: "equipe", libelle: "Présentation de l'équipe", rubrique: "presentation", ok: !!fiche.presentation_equipe?.trim() },
    { cle: "photos", libelle: "Au moins une photo dans la galerie", rubrique: "photos", ok: nbPhotos > 0 },
  ];
  if (type === "structure") {
    elements.push({ cle: "prestations", libelle: "Au moins une prestation ou un examen", rubrique: "prestations", ok: nbPrestations > 0 });
  }
  const faits = elements.filter((e) => e.ok).length;
  return { score: Math.round((faits / elements.length) * 100), elements };
}
