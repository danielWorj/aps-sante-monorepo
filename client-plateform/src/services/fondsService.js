// src/services/fondsService.js
//
// Miroir front-end des routes « politique de fonds v2 » côté patient/médecin :
// annulation (résultat financier complet), reprogrammation, notifications,
// portefeuille. Chemins relatifs : API_BASE_URL inclut déjà « /api ».
import { apiFetch } from '../lib/apiClient';

/** Annulation avec le résultat financier complet (annulerRendezVous de medecinService
 *  ne renvoie que le RDV). Motif obligatoire ; `initiateur` est déduit du token côté serveur.
 *  La réponse est FILTRÉE par rôle côté serveur (D7) :
 *   - patient : { rendez_vous, evenement, tardif, remboursement, commission_patient,
 *                 commission_patient_rendue, medecin_fautif } — jamais la part médecin (CM) ;
 *   - médecin : { rendez_vous, evenement, tardif, remboursement (sans montant),
 *                 versement_medecin, commission_medecin, amende } — jamais CP.
 *  409 { code: 'RDV_NON_PAYE' } : le médecin ne peut pas annuler un RDV non payé (D8). */
export function annulerRendezVousDetaille(id, { motif, commentaire } = {}) {
  const body = { statut: 'annule', motif_annulation: motif };
  const texte = typeof commentaire === 'string' ? commentaire.trim() : '';
  if (texte) body.commentaire_annulation = texte;
  return apiFetch(`/rendez-vous/${id}/statut`, { method: 'PATCH', body });
}

/** PATCH /rendez-vous/:id/statut { statut: 'conteste' } — le PATIENT conteste une consultation
 *  terminée pendant le délai T : le RDV passe « conteste », le cron de libération l'ignore et les
 *  fonds restent en séquestre. Irréversible côté patient (aucune transition sortante).
 *  Erreurs : 403 (transition refusée / pas le patient du RDV), 400 (déjà contesté). */
export function contesterRendezVous(id) {
  return apiFetch(`/rendez-vous/${id}/statut`, { method: 'PATCH', body: { statut: 'conteste' } });
}

/** Propose (ou remplace) une nouvelle date. `nouvelleDateISO` : ISO 8601 d'un créneau libre. */
export function proposerReprogrammation(rdvId, nouvelleDateISO) {
  return apiFetch(`/rendez-vous/${rdvId}/reprogrammation/proposer`, {
    method: 'POST',
    body: { nouvelle_date: nouvelleDateISO },
  });
}

/** Accepte la proposition de l'AUTRE partie. On renvoie la date affichée : refus 409 si elle a changé. */
export function accepterReprogrammation(rdvId, nouvelleDateProposee) {
  return apiFetch(`/rendez-vous/${rdvId}/reprogrammation/accepter`, {
    method: 'POST',
    body: { nouvelle_date_proposee: nouvelleDateProposee },
  });
}

/** GET /notifications?non_lues=true&limit= -> { notifications: [{ notification_id, type, rdv_id, titre,
 *  message, donnees, lue_le, date_creation }], non_lues } */
export function listerNotifications({ nonLues = false, limit = 30 } = {}) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (nonLues) q.set('non_lues', 'true');
  return apiFetch(`/notifications?${q.toString()}`);
}
export const marquerNotificationLue = (id) => apiFetch(`/notifications/${id}/lue`, { method: 'PATCH' });
export const marquerToutesLues = () => apiFetch('/notifications/lues', { method: 'POST' });

/** GET /medecins/:id/portefeuille -> { solde, mouvements: [{ mouvement_id, type, montant, date_creation, rdv_id }],
 *  amendes_en_attente: [{ amende_id, rdv_id, taux_applique, statut, date_creation }] } */
export const obtenirPortefeuille = (medecinId) => apiFetch(`/medecins/${medecinId}/portefeuille`);