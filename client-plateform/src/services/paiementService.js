import { apiFetch } from '../lib/apiClient';

export async function demanderPaiementRdv(rdvId) {
  const data = await apiFetch(`/paiement/rendez-vous/${rdvId}/paiement`, { method: 'POST' });
  return data.url;
}

export async function obtenirStatutPaiementRdv(rdvId) {
  return apiFetch(`/paiement/rendez-vous/${rdvId}/paiement`);
}

// Mobile Money (CamPay) : envoie une demande de validation au téléphone du
// patient. Ne confirme RIEN : la confirmation se lit via obtenirStatutPaiementRdv.
// Le montant n'est jamais envoyé, le serveur le recalcule.
export async function demanderPaiementCampay(rdvId, numero) {
  return apiFetch(`/paiement/rendez-vous/${rdvId}/paiement-campay`, {
    method: 'POST',
    body: { numero },
  }); // -> { reference, ussd_code, operateur }
}
// Devis AVANT paiement (politique de fonds v2 §1) : honoraires + frais d'envoi de
// l'agrégateur choisi = total. -> { agregateur, devise, honoraires, frais_envoi, total,
// remboursement_estime, remboursement_indicatif }. 503 si le barème n'est pas encore saisi.
export async function obtenirDevisPaiement(rdvId, agregateur) {
  return apiFetch(`/paiement/rendez-vous/${rdvId}/devis?agregateur=${encodeURIComponent(agregateur)}`);
}
