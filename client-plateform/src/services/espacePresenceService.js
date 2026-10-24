// src/services/espacePresenceService.js
//
// Espaces pharmacie et centre de santé (portail du gestionnaire de la fiche) :
// fiche de l'espace actif, tableau de bord, horaires, photos, actualités,
// messages reçus, gardes et avis (pharmacie), prestations (centre de santé).
// `type` vaut "pharmacie" ou "structure" ; serveur :
// controllers/espacePresence.controller.js.
//
// La modification de la fiche elle-même passe par modifierPharmacie /
// modifierCentreSante, et l'abonnement par abonnementPresenceService.js.

import { apiFetch } from '../lib/apiClient';

/** Préfixe d'API et chemins du portail, par type d'espace. */
export const ESPACES_PRESENCE = {
  pharmacie: {
    api: '/pharmacies',
    portail: '/portail/pharmacie',
    espace: 'Espace pharmacie',
    libelle: 'pharmacie',
    titreFiche: 'Ma pharmacie',
    icone: 'fa-prescription-bottle-medical',
    fichePublique: (id) => `/pharmacie/${id}`,
    creation: '/pharmacie/creation',
  },
  structure: {
    api: '/centres-sante',
    portail: '/portail/structure',
    espace: 'Espace centre de santé',
    libelle: 'centre de santé',
    titreFiche: 'Mon centre de santé',
    icone: 'fa-hospital',
    fichePublique: (id) => `/structure-sante/${id}`,
    creation: '/structure-sante/creation',
  },
};

const enc = encodeURIComponent;
const base = (type) => ESPACES_PRESENCE[type].api;

/** -> { type_acteur, fiche, droits, statut_abonnement, equipe } (404 : aucune fiche dans cet espace). */
export function obtenirMaFiche(type) {
  return apiFetch(`${base(type)}/mon-espace`);
}

export function obtenirTableauDeBordPresence(type, id, jours = 30) {
  return apiFetch(`${base(type)}/${enc(id)}/tableau-de-bord?jours=${jours}`);
}

/** { horaires: {...} | null, horaires_note?, urgences_24h? } */
export function enregistrerHoraires(type, id, donnees) {
  return apiFetch(`${base(type)}/${enc(id)}/horaires`, { method: 'PUT', body: donnees });
}

/* ─── Photos ─── */

export function listerPhotosGestion(type, id) {
  return apiFetch(`${base(type)}/${enc(id)}/images/gestion`);
}

export function ajouterPhoto(type, id, fichier, titre) {
  const fd = new FormData();
  fd.append('fichier', fichier);
  if (titre?.trim()) fd.append('titre', titre.trim());
  return apiFetch(`${base(type)}/${enc(id)}/images`, { method: 'POST', body: fd });
}

export function modifierPhoto(mediaId, titre) {
  return apiFetch(`/photos-fiche/${enc(mediaId)}`, { method: 'PUT', body: { titre: titre ?? null } });
}

export function supprimerPhoto(mediaId) {
  return apiFetch(`/photos-fiche/${enc(mediaId)}`, { method: 'DELETE' });
}

export function ordonnerPhotos(type, id, ids) {
  return apiFetch(`${base(type)}/${enc(id)}/images/ordre`, { method: 'PUT', body: { ids } });
}

/* ─── Actualités ─── */

export function listerActualitesGestion(type, id) {
  return apiFetch(`${base(type)}/${enc(id)}/actualites/gestion`);
}

function formulaireActualite(champs, image, supprimerImage) {
  const fd = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) {
    if (valeur !== undefined) fd.append(cle, valeur === null ? '' : String(valeur));
  }
  if (image) fd.append('image', image);
  if (supprimerImage) fd.append('supprimer_image', 'true');
  return fd;
}

/** champs : { titre, contenu, publiee, date_publication, date_expiration } */
export function creerActualite(type, id, champs, image) {
  return apiFetch(`${base(type)}/${enc(id)}/actualites`, { method: 'POST', body: formulaireActualite(champs, image) });
}

export function modifierActualite(actualiteId, champs, { image, supprimerImage } = {}) {
  return apiFetch(`/actualites-fiche/${enc(actualiteId)}`, {
    method: 'PUT',
    body: formulaireActualite(champs, image, supprimerImage),
  });
}

export function supprimerActualite(actualiteId) {
  return apiFetch(`/actualites-fiche/${enc(actualiteId)}`, { method: 'DELETE' });
}

/* ─── Messages ─── */

/** statut : non_lu | lu | archive (défaut : tous sauf archivés). */
export function listerMessagesGestion(type, id, statut) {
  const qs = statut ? `?statut=${enc(statut)}` : '';
  return apiFetch(`${base(type)}/${enc(id)}/messages/gestion${qs}`);
}

export function changerStatutMessage(messageId, statut) {
  return apiFetch(`/messages-fiche/${enc(messageId)}`, { method: 'PATCH', body: { statut } });
}

/* ─── Pharmacie : gardes et avis ─── */

/** periode : a_venir | passees */
export function listerGardesGestion(id, periode = 'a_venir') {
  return apiFetch(`/pharmacies/${enc(id)}/gardes/gestion?periode=${enc(periode)}`);
}

export function listerAvisGestion(id) {
  return apiFetch(`/pharmacies/${enc(id)}/avis/gestion`);
}

/* ─── Centre de santé : prestations ─── */

export function listerPrestationsGestion(id) {
  return apiFetch(`/centres-sante/${enc(id)}/prestations/gestion`);
}

export function creerPrestation(id, donnees) {
  return apiFetch(`/centres-sante/${enc(id)}/prestations`, { method: 'POST', body: donnees });
}

export function modifierPrestation(prestationId, donnees) {
  return apiFetch(`/prestations-structure/${enc(prestationId)}`, { method: 'PUT', body: donnees });
}

export function supprimerPrestation(prestationId) {
  return apiFetch(`/prestations-structure/${enc(prestationId)}`, { method: 'DELETE' });
}

/* ─── Présentation ─── */

export const JOURS_SEMAINE = [
  ['lundi', 'Lundi'],
  ['mardi', 'Mardi'],
  ['mercredi', 'Mercredi'],
  ['jeudi', 'Jeudi'],
  ['vendredi', 'Vendredi'],
  ['samedi', 'Samedi'],
  ['dimanche', 'Dimanche'],
];

const NOM_JOUR = Object.fromEntries(JOURS_SEMAINE);

/** Plages d'un jour en texte : « 08:00 – 12:00, 14:00 – 19:00 », « Fermé », « 24 h/24 ». */
export function plagesEnTexte(plages) {
  if (!plages?.length) return 'Fermé';
  if (plages.length === 1 && plages[0].debut === '00:00' && plages[0].fin === '24:00') return '24 h/24';
  return plages.map((p) => `${p.debut} – ${p.fin}`).join(', ');
}

/** Libellé de l'état d'ouverture renvoyé par le serveur (`ouverture`). */
export function libelleOuverture(ouverture) {
  if (!ouverture) return null;
  if (ouverture.ouvert) return ouverture.jusqu_a ? `Ouvert · ferme à ${ouverture.jusqu_a}` : 'Ouvert 24 h/24';
  const p = ouverture.prochaine_ouverture;
  return p ? `Fermé · ouvre ${NOM_JOUR[p.jour]?.toLowerCase() ?? p.jour} à ${p.heure}` : 'Fermé';
}

export function formaterPrixPrestation(prix, devise) {
  if (prix === null || prix === undefined) return 'Sur demande';
  return `${Number(prix).toLocaleString('fr-FR')} ${devise ?? ''}`.trim();
}
