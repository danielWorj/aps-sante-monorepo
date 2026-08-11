// src/services/geoService.js
//
// Consomme les routes génériques du composant "référentiels"
// (src/routes/referentiels.routes.js) pour les tables Pays / Ville
// (schema.prisma), partagées par tous les modules annuaire (centres
// de santé, pharmacies, assurances, inscription utilisateur...).
//
// Montées dans index.js sous /api/referentiels (cf.
// app.use("/api/referentiels", referentielsRoutes)), donc les
// chemins réels sont /api/referentiels/pays et
// /api/referentiels/villes. Le préfixe /api étant déjà géré par
// apiClient.js, on appelle ici /referentiels/pays et /referentiels/villes.
//
// Lecture (GET /referentiels/pays, GET /referentiels/pays/:id,
// GET /referentiels/villes, GET /referentiels/villes/:id) :
// PUBLIQUE, aucun `authentifier` requis côté back — utilisable avant
// inscription (ex : peupler un champ `pays_id` dans un formulaire
// public).
//
// Écriture (POST/PUT) : réservée aux comptes admin/superadmin côté
// back (`autoriser("admin","superadmin")`). Suppression (DELETE) :
// superadmin uniquement (impact transverse via FK sur les autres
// modules). Ces fonctions renverront 401/403 si appelées par un
// utilisateur non habilité — à réserver aux écrans d'administration.

import { apiFetch } from "../lib/apiClient";

// ─── Pays ─────────────────────────────────────────────────────

/** @returns {Promise<{ pays: { pays_id: string, nom: string, code_iso2: string }[] }>} */
export function listerPays() {
  return apiFetch("/referentiels/pays");
}

/** @returns {Promise<{ pays: { pays_id: string, nom: string, code_iso2: string } }>} */
export function obtenirPays(paysId) {
  return apiFetch(`/referentiels/pays/${paysId}`);
}

/** Admin/superadmin uniquement. */
export function creerPays(data) {
  return apiFetch("/referentiels/pays", { method: "POST", body: data });
}

/** Admin/superadmin uniquement. */
export function modifierPays(paysId, data) {
  return apiFetch(`/referentiels/pays/${paysId}`, { method: "PUT", body: data });
}

/** Superadmin uniquement. */
export function supprimerPays(paysId) {
  return apiFetch(`/referentiels/pays/${paysId}`, { method: "DELETE" });
}

// ─── Villes ───────────────────────────────────────────────────

/** @returns {Promise<{ villes: { ville_id: string, nom: string, pays_id: string }[] }>} */
export function listerVilles(paysId) {
  const qs = paysId ? `?pays_id=${paysId}` : "";
  return apiFetch(`/referentiels/villes${qs}`);
}

/** @returns {Promise<{ ville: { ville_id: string, nom: string, pays_id: string } }>} */
export function obtenirVille(villeId) {
  return apiFetch(`/referentiels/villes/${villeId}`);
}

/** Admin/superadmin uniquement. */
export function creerVille(data) {
  return apiFetch("/referentiels/villes", { method: "POST", body: data });
}

/** Admin/superadmin uniquement. */
export function modifierVille(villeId, data) {
  return apiFetch(`/referentiels/villes/${villeId}`, { method: "PUT", body: data });
}

/** Superadmin uniquement. */
export function supprimerVille(villeId) {
  return apiFetch(`/referentiels/villes/${villeId}`, { method: "DELETE" });
}