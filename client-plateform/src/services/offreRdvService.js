// src/services/offreRdvService.js
// RDV aléatoire (RDV sur offre) — voir server/src/routes/offreRdv.routes.js.
//   Patient : publie une demande (spécialité, ville, jour + heure, type,
//             motif), voit les médecins qui ont répondu, valide l'un d'eux
//             (le RDV est créé, il reste à le payer).
//   Médecin : voit les demandes de sa spécialité dans sa ville, répond avec
//             son profil (mot facultatif), peut retirer sa réponse.
// Erreurs : normalisées par apiFetch (.message, .status, .code éventuel).

import { apiFetch } from '../lib/apiClient';

export const STATUTS_OFFRE = {
  ouverte: { label: 'En attente de réponses', chip: 'chip-st-attente', icone: 'fa-bullhorn' },
  attribuee: { label: 'Médecin validé', chip: 'chip-st-confirme', icone: 'fa-user-check' },
  expiree: { label: 'Expirée', chip: 'chip-st-annule', icone: 'fa-hourglass-end' },
  annulee: { label: 'Annulée', chip: 'chip-st-annule', icone: 'fa-ban' },
};

/**
 * « mardi 20 octobre à 10:00 » : jour et heure choisis par le patient, dans
 * le fuseau du pays de la demande (`date_murale`, calculée par le serveur).
 * Jamais convertie dans le fuseau du navigateur : patient et médecins lisent
 * la même heure, où qu'ils se trouvent.
 */
export function dateOffreLisible(offre) {
  const m = offre?.date_murale;
  if (!m) return offre?.date_souhaitee ? new Date(offre.date_souhaitee).toLocaleString('fr-FR') : '';
  const [a, mo, j] = m.jour.split('-').map(Number);
  const jour = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(a, mo - 1, j)));
  return `${jour} à ${m.heure}`;
}

/**
 * Morceaux de la date de l'offre pour un bloc date (« lun. / 19 / oct. »),
 * dans le fuseau du pays de la demande (`date_murale`). Null si absente.
 */
export function partiesDateOffre(offre) {
  const m = offre?.date_murale;
  if (!m) return null;
  const [a, mo, j] = m.jour.split('-').map(Number);
  const d = new Date(Date.UTC(a, mo - 1, j));
  const fmt = (opts) => new Intl.DateTimeFormat('fr-FR', { ...opts, timeZone: 'UTC' }).format(d);
  return {
    jourSemaine: fmt({ weekday: 'short' }),
    jour: j,
    mois: fmt({ month: 'short' }).replace('.', ''),
    heure: m.heure,
  };
}

/* ---------------------------- Patient ---------------------------- */

/**
 * POST /offres-rdv — { specialite_id, ville_id, type_rdv, jour (AAAA-MM-JJ),
 * heure (HH:mm), motif? }. Jour et heure sont ceux de la ville choisie.
 */
export function publierOffre(donnees) {
  return apiFetch('/offres-rdv', { method: 'POST', body: donnees });
}

/** GET /offres-rdv/mes-offres — offres du patient avec les médecins qui ont répondu. */
export async function listerMesOffres() {
  const data = await apiFetch('/offres-rdv/mes-offres');
  return data.offres || [];
}

/** POST /offres-rdv/:id/annuler — seulement tant qu'aucun médecin n'est validé. */
export function annulerOffre(offreId) {
  return apiFetch(`/offres-rdv/${offreId}/annuler`, { method: 'POST' });
}

/**
 * POST /offres-rdv/:id/reponses/:reponseId/valider — « Valider ce médecin ».
 * @returns {Promise<{ rendez_vous, delai_confirmation_heures, echeance_confirmation }>}
 */
export function validerMedecin(offreId, reponseId) {
  return apiFetch(`/offres-rdv/${offreId}/reponses/${reponseId}/valider`, { method: 'POST' });
}

/* ---------------------------- Médecin ---------------------------- */

/**
 * GET /offres-rdv/medecin?vue=ouvertes|mes_reponses
 * @returns {Promise<{ offres: Array, raison: string|null }>} `raison` : pourquoi
 *   le médecin ne reçoit aucune demande (fiche non publiée, abonnement…).
 */
export async function listerOffresMedecin(vue = 'ouvertes') {
  const data = await apiFetch(`/offres-rdv/medecin?vue=${encodeURIComponent(vue)}`);
  return { offres: data.offres || [], raison: data.raison_ineligibilite || null };
}

/** POST /offres-rdv/:id/reponse — { message? } */
export function repondreOffre(offreId, message) {
  return apiFetch(`/offres-rdv/${offreId}/reponse`, { method: 'POST', body: { message: message || null } });
}

/** DELETE /offres-rdv/:id/reponse */
export function retirerReponse(offreId) {
  return apiFetch(`/offres-rdv/${offreId}/reponse`, { method: 'DELETE' });
}
