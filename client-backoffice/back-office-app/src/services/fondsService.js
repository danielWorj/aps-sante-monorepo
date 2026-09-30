// src/services/fondsService.js
//
// Miroir front-end des routes « politique de fonds v2 » côté admin :
//   /frais-agregateur, /parametres-amende, /lignes-tarifaires,
//   /remboursements-campay, PATCH /rendez-vous/:id/statut (annulation),
//   POST /rendez-vous/:id/forcer-liberation.
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

/* ── Commission APS (lignes tarifaires, type « commission ») ───── */
/** GET /lignes-tarifaires?type_frais=commission -> [{ pays_id, type_frais, libelle, taux, actif, date_debut_validite, pays }] */
export const listerLignesTarifaires = (filtres) =>
  apiFetch(`/lignes-tarifaires${qs(filtres)}`).then((d) => d.lignes_tarifaires);

/** POST /lignes-tarifaires { pays_id, type_frais:'commission', libelle, taux } */
export const creerLigneTarifaire = (body) => apiFetch('/lignes-tarifaires', { method: 'POST', body });

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
/** Annulation par un admin : `initiateur` ('patient'|'medecin') OBLIGATOIRE.
 *  Retourne la réponse complète { rendez_vous, tardif, remboursement, versement_medecin, commission_aps, amende }. */
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
