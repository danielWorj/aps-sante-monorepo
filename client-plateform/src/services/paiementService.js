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

// Devis AVANT paiement (politique de fonds v2) : honoraires (H) + frais d'envoi de
// l'agrégateur choisi + commission APS patient (CP) = total.
// -> { agregateur, devise, honoraires, frais_envoi, commission_patient, total,
// remboursement_estime, remboursement_indicatif }. 503 si le barème n'est pas encore saisi
// (aucune ligne de frais ou de commission patient active pour le pays du médecin).
// Le montant n'est jamais envoyé : le serveur recalcule tout.
export async function obtenirDevisPaiement(rdvId, agregateur) {
  return apiFetch(`/paiement/rendez-vous/${rdvId}/devis?agregateur=${encodeURIComponent(agregateur)}`);
}

// Facture récapitulative (JSON uniquement : aucun PDF côté serveur, le téléchargement se
// fait par l'impression du navigateur, voir FactureRecapitulative.jsx).
//   - RDV payé     : facture du paiement abouti (type « facture », numéro FAC-…) ; `agregateur`
//                    est ignoré. Facture « minimale » (une seule ligne) pour une transaction
//                    antérieure à la v2.
//   - RDV non payé : aperçu AVANT paiement (type « devis »), `agregateur` ('stripe' | 'campay')
//                    obligatoire, réservé au patient propriétaire du RDV.
// -> { type, numero, date, devise, agregateur, statut_paiement,
//      entete: { medecin, specialite, pays, ville, rdv_id, date_creneau },
//      lignes: [{ code, libelle, base, taux, montant_fixe, montant }],
//      total, minimale, raison_minimale }
// Le médecin concerné ne reçoit que la consultation (H) ; 409 RDV_NON_PAYE s'il n'est pas payé.
export async function obtenirFacture(rdvId, agregateur) {
  const requete = agregateur ? `?agregateur=${encodeURIComponent(agregateur)}` : '';
  return apiFetch(`/paiement/rendez-vous/${rdvId}/facture${requete}`);
}

// Un paiement `en_attente` récent bloque un nouveau paiement (409, code PAIEMENT_EN_COURS) :
// le patient peut alors l'ANNULER puis repayer. Un paiement abouti n'est jamais annulé.
export function estPaiementEnCours(err) {
  return err?.status === 409 && err?.data?.code === 'PAIEMENT_EN_COURS';
}

// Annule le(s) paiement(s) en cours du RDV (Carte / Mobile Money) -> { annulees }.
export async function annulerPaiementEnCours(rdvId) {
  return apiFetch(`/paiement/rendez-vous/${rdvId}/paiement/annuler`, { method: 'POST' });
}