import { apiFetch } from '../lib/apiClient';

// Retraits des honoraires du médecin (décaissement Mobile Money via CamPay).
// Le numéro de destination n'est JAMAIS saisi librement : on envoie l'id d'une fiche
// Mobile Money du médecin, et le serveur valide le montant et le solde.

/** -> { solde, retraits: [...], limites: { montant_min, montant_max, devise } } */
export async function listerMesRetraits(medecinId) {
  return apiFetch(`/medecins/${medecinId}/retraits`);
}

/** -> demande créée { demande_retrait_id, montant, numero, statut, ... } */
export async function demanderRetrait(medecinId, { mobileMoneyId, montant }) {
  return apiFetch(`/medecins/${medecinId}/retraits`, {
    method: 'POST',
    body: { mobile_money_id: mobileMoneyId, montant },
  });
}