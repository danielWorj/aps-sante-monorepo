// src/services/retraitService.js
//
// Miroir front-end de server/src/routes/retrait.routes.js (côté admin / superadmin).
// S'appuie sur `apiFetch` (token en mémoire, refresh automatique) : les chemins
// commencent directement par "/retraits…" (API_BASE_URL inclut déjà "/api").

import { apiFetch } from '../lib/apiClient';

/** GET /retraits?statut= -> [{ demande_retrait_id, montant, numero, statut, titulaire_declare,
 *  titulaire_campay, titulaire_concordant, campay_reference, motif_rejet, derniere_erreur,
 *  date_creation, date_envoi, date_cloture, medecin: { utilisateur: { nom, prenom, email, telephone } } }] */
export function listerRetraits(statut) {
  const q = statut ? `?statut=${encodeURIComponent(statut)}` : '';
  return apiFetch(`/retraits${q}`);
}

/** GET /retraits/solde-campay -> { total, mtn, orange, devise } */
export function obtenirSoldeCampay() {
  return apiFetch('/retraits/solde-campay');
}

/** Approuve et envoie le retrait à CamPay -> { demande, incertain } */
export function approuverRetrait(id) {
  return apiFetch(`/retraits/${id}/approuver`, { method: 'POST' });
}

/** Rejette (motif obligatoire) ; le montant est recrédité au médecin. */
export function rejeterRetrait(id, motif) {
  return apiFetch(`/retraits/${id}/rejeter`, { method: 'POST', body: { motif } });
}

/** Issue incertaine : rattache la référence trouvée dans le tableau de bord CamPay. */
export function rattacherReference(id, reference) {
  return apiFetch(`/retraits/${id}/rattacher-reference`, { method: 'POST', body: { reference } });
}

/** Issue incertaine sans référence : constate que rien n'est parti (recrédit). */
export function marquerEchoue(id, motif) {
  return apiFetch(`/retraits/${id}/marquer-echoue`, { method: 'POST', body: { motif } });
}