// src/services/agendaService.js
//
// Miroir front-end des routes d'administration de l'agenda :
//   /parametres-delai-confirmation (délai H, par pays, en heures).
// Chemins relatifs : API_BASE_URL inclut déjà « /api ».

import { apiFetch } from '../lib/apiClient';

/** GET /parametres-delai-confirmation (admin + superadmin)
 *  -> { parametres_delai_confirmation: [{ parametre_delai_confirmation_id, pays_id, libelle, heures,
 *       actif, date_debut_validite, pays }], heures_par_defaut, heures_min, heures_max }
 *  Historique inclus : une seule ligne `actif` par pays. */
export const listerParametresDelaiConfirmation = () => apiFetch('/parametres-delai-confirmation');

/** POST /parametres-delai-confirmation { pays_id, libelle, heures } (admin + superadmin)
 *  `heures` : entier 1..720. Crée une nouvelle version active et désactive l'ancienne ;
 *  ne s'applique qu'aux rendez-vous demandés ensuite (H est figé sur chaque RDV). */
export const creerParametreDelaiConfirmation = (body) =>
  apiFetch('/parametres-delai-confirmation', { method: 'POST', body });
