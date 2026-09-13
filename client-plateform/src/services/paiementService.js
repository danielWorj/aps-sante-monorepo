import { apiFetch } from '../lib/apiClient';

export async function demanderPaiementRdv(rdvId) {
  const data = await apiFetch(`/paiement/rendez-vous/${rdvId}/paiement`, { method: 'POST' });
  return data.url;
}

export async function obtenirStatutPaiementRdv(rdvId) {
  return apiFetch(`/paiement/rendez-vous/${rdvId}/paiement`);
}