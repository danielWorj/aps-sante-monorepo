// src/controllers/remboursement.controller.js
// Politique de fonds v2 §2 — Administration des remboursements CamPay
// (liste des lignes « a_traiter », clôture avec les frais réels du retrait).
// Routes réservées admin/superadmin (voir remboursement.routes.js).

import {
  cloturerRemboursementCampay,
  listerRemboursementsCampay,
} from "../services/remboursementCampay.service.js";

/** GET /api/remboursements-campay?statut=a_traiter|traite */
export async function listerRemboursements(req, res, next) {
  try {
    const statut = req.query.statut ?? "a_traiter";
    if (!["a_traiter", "traite"].includes(statut)) {
      return res.status(400).json({ message: "statut invalide. Valeurs acceptées : a_traiter, traite." });
    }
    const remboursements = await listerRemboursementsCampay({ statut });
    return res.status(200).json({ remboursements });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/remboursements-campay/:id/cloturer
 * Body : { frais_reels: <entier XAF ≥ 0> } — frais réels constatés sur le
 * retrait Mobile Money. Net versé au patient = brut − frais_reels (≥ 0).
 */
export async function cloturerRemboursement(req, res, next) {
  try {
    const resultat = await cloturerRemboursementCampay({
      remboursement_id: req.params.id,
      frais_reels: req.body?.frais_reels,
    });
    if (resultat.erreur) return res.status(resultat.erreur.status).json({ message: resultat.erreur.message });
    return res.status(200).json({
      message: resultat.deja_cloture ? "Remboursement déjà clôturé." : "Remboursement clôturé.",
      remboursement: resultat,
    });
  } catch (err) {
    next(err);
  }
}