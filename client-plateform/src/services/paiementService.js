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