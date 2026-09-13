import { apiFetch } from '../lib/apiClient';

export async function demanderPaiementRdv(rdvId) {
  const data = await apiFetch(`/rendez-vous/${rdvId}/paiement`, { method: 'POST' });
  return data.url;
}

export async function obtenirStatutPaiementRdv(rdvId) {
  return apiFetch(`/rendez-vous/${rdvId}/paiement`);
}