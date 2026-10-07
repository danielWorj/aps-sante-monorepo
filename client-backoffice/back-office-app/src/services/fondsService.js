// src/services/fondsService.js
//
// Miroir front-end des routes « politique de fonds v2 » côté admin :
//   /frais-agregateur, /parametres-amende, /lignes-tarifaires,
//   /parametres-delai-liberation (T), /remboursements-campay, PATCH /rendez-vous/:id/statut (annulation),
//   POST /rendez-vous/:id/forcer-liberation, GET /paiement/rendez-vous/:id/facture.
//
// Vocabulaire : CM = commission MÉDECIN (type_frais « commission », retenue sur
// le médecin à la libération) ; CP = commission PATIENT (type_frais
// « commission_patient », ajoutée au total payé par le patient).
// Chemins relatifs : API_BASE_URL inclut déjà « /api ».

import { apiFetch } from '../lib/apiClient';

const qs = (filtres = {}) => {
  const p = new URLSearchParams();
  Object.entries(filtres).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};

/* ── Frais d'agrégateur ─────────────────────────────────────────── */
/** GET /frais-agregateur?agregateur=&type_frais=&actif=
 *  -> [{ frais_agregateur_id, agregateur, type_frais, libelle, taux, montant_fixe, actif, date_debut_validite }]
 *  (taux / montant_fixe arrivent en chaîne : Decimal Prisma -> Number()). */
export const listerFraisAgregateur = (filtres) =>
  apiFetch(`/frais-agregateur${qs(filtres)}`).then((d) => d.frais_agregateur);

/** POST /frais-agregateur { agregateur, type_frais, libelle, taux?, montant_fixe? } (nouvelle version active) */
export const creerFraisAgregateur = (body) => apiFetch('/frais-agregateur', { method: 'POST', body });

/* ── Amende médecin (par pays) ──────────────────────────────────── */
/** GET /parametres-amende -> [{ pays_id, libelle, taux, actif, date_debut_validite, pays }] */
export const listerParametresAmende = (filtres) =>
  apiFetch(`/parametres-amende${qs(filtres)}`).then((d) => d.parametres_amende);

/** POST /parametres-amende { pays_id, libelle, taux } */
export const creerParametreAmende = (body) => apiFetch('/parametres-amende', { method: 'POST', body });

/* ── Délai de libération des fonds T (par pays, en heures) ─────── */
/** GET /parametres-delai-liberation (admin + superadmin ; ?pays_id=&actif=)
 *  -> [{ parametre_delai_id, pays_id, libelle, heures, actif, date_debut_validite, pays }]
 *  Historique inclus par défaut : une seule ligne `actif` par pays. */
export const listerParametresDelaiLiberation = (filtres) =>
  apiFetch(`/parametres-delai-liberation${qs(filtres)}`).then((d) => d.parametres_delai_liberation);

/** POST /parametres-delai-liberation { pays_id, libelle, heures }  (SUPERADMIN uniquement)
 *  `heures` : entier 0..720. Crée une nouvelle version active et désactive l'ancienne ;
 *  ne s'applique qu'aux consultations terminées ensuite (T est figé sur chaque RDV). */
export const creerParametreDelaiLiberation = (body) =>
  apiFetch('/parametres-delai-liberation', { method: 'POST', body });

/* ── Commissions APS (lignes tarifaires : CM et CP) ─────────────── */
/** Valeurs de `type_frais` gérées par cet écran. `commission` reste la part
 *  médecin (CM) : l'identifiant n'a pas été renommé (zéro risque pour les données). */
export const TYPE_COMMISSION_MEDECIN = 'commission'; // CM
export const TYPE_COMMISSION_PATIENT = 'commission_patient'; // CP

/** GET /lignes-tarifaires?type_frais=commission|commission_patient
 *  -> [{ pays_id, type_frais, libelle, taux, actif, date_debut_validite, pays }] */
export const listerLignesTarifaires = (filtres) =>
  apiFetch(`/lignes-tarifaires${qs(filtres)}`).then((d) => d.lignes_tarifaires);

/** POST /lignes-tarifaires { pays_id, type_frais, libelle, taux } (nouvelle version active) */
export const creerLigneTarifaire = (body) => apiFetch('/lignes-tarifaires', { method: 'POST', body });

/** Commission médecin (CM) : lister / créer. */
export const listerCommissionsMedecin = () => listerLignesTarifaires({ type_frais: TYPE_COMMISSION_MEDECIN });
export const creerCommissionMedecin = (body) => creerLigneTarifaire({ ...body, type_frais: TYPE_COMMISSION_MEDECIN });

/** Commission patient (CP) : lister / créer. Un taux de 0 est valide ;
 *  seule l'ABSENCE de ligne active bloque les paiements du pays. */
export const listerCommissionsPatient = () => listerLignesTarifaires({ type_frais: TYPE_COMMISSION_PATIENT });
export const creerCommissionPatient = (body) => creerLigneTarifaire({ ...body, type_frais: TYPE_COMMISSION_PATIENT });

/* ── Remboursements CamPay ──────────────────────────────────────── */
/** GET /remboursements-campay?statut=a_traiter|traite
 *  -> [{ remboursement_id, transaction_id, motif, statut, montant_brut, devise, numero_payeur,
 *        frais_reels, net_verse, date_creation, estimation: { frais_estimes, net_estime } | null,
 *        estimation_erreur }] */
export const listerRemboursementsCampay = (statut = 'a_traiter') =>
  apiFetch(`/remboursements-campay${qs({ statut })}`).then((d) => d.remboursements);

/** POST /remboursements-campay/:id/cloturer { frais_reels } (entier XAF >= 0) -> { message, remboursement } */
export const cloturerRemboursementCampay = (id, frais_reels) =>
  apiFetch(`/remboursements-campay/${id}/cloturer`, { method: 'POST', body: { frais_reels } });

/* ── Rendez-vous (annulation admin, libération forcée) ─────────── */
/** Annulation par un admin : `initiateur` ('patient'|'medecin') OBLIGATOIRE
 *  (« medecin » refusé par le serveur sur un RDV non payé : 409 RDV_NON_PAYE).
 *  Retourne la réponse complète, non filtrée pour un admin :
 *  { rendez_vous, evenement, tardif, remboursement, versement_medecin,
 *    commission_medecin (CM), commission_patient (CP conservée par APS),
 *    commission_patient_rendue (CP rendue au patient), commission_aps (alias déprécié de CM), amende }. */
export const annulerRendezVousAdmin = (id, { motif, commentaire, initiateur }) =>
  apiFetch(`/rendez-vous/${id}/statut`, {
    method: 'PATCH',
    body: {
      statut: 'annule',
      motif_annulation: motif,
      initiateur,
      ...(commentaire ? { commentaire_annulation: commentaire } : {}),
    },
  });

/** Arbitrage admin : RDV « les deux présents mais jamais clôturé ». POST /rendez-vous/:id/forcer-liberation */
export const forcerLiberation = (id) => apiFetch(`/rendez-vous/${id}/forcer-liberation`, { method: 'POST' });

/* ── Facture / décomposition d'un RDV payé (vue admin) ─────────── */
/** GET /paiement/rendez-vous/:id/facture -> facture du patient
 *  { numero, date, devise, agregateur, entete, lignes:[{code,libelle,base,taux,montant_fixe,montant}], total, minimale,
 *    detail_admin: { commission_patient, commission_medecin, net_medecin } | null }.
 *  Pour l'admin, `detail_admin` ajoute CM et le net médecin (null pour une transaction pré-v2).
 *  Retourne null si le RDV n'a pas de paiement (404 « non payé »). */
export const obtenirFactureRendezVous = async (rdvId) => {
  try {
    return await apiFetch(`/paiement/rendez-vous/${rdvId}/facture`);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
};