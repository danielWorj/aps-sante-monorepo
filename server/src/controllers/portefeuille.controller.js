// src/controllers/portefeuille.controller.js
// Phase 1 — Portefeuille médecin & grand-livre.
//
// Le solde renvoyé est TOUJOURS recalculé à la demande (voir
// services/portefeuille.service.js) — jamais lu depuis une colonne
// stockée, conformément au principe directeur du plan d'implémentation.

import prisma from "../lib/prisma.js";
import { obtenirPortefeuille } from "../services/portefeuille.service.js";

function estAdmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

// GET /api/medecins/:id/portefeuille — le médecin propriétaire
// (utilisateur_id déduit du token) ou un admin/superadmin. Aucun autre
// rôle (patient, agent...) n'a accès au portefeuille d'un médecin.
export async function obtenirPortefeuilleMedecin(req, res, next) {
  try {
    const medecin = await prisma.medecin.findUnique({ where: { medecin_id: req.params.id } });
    if (!medecin) {
      return res.status(404).json({ message: "Médecin introuvable." });
    }

    if (!estAdmin(req.utilisateur) && req.utilisateur.utilisateur_id !== medecin.utilisateur_id) {
      return res.status(403).json({ message: "Accès refusé : ce portefeuille ne vous appartient pas." });
    }

    const { solde, mouvements } = await obtenirPortefeuille(medecin.medecin_id);

    return res.status(200).json({ medecin_id: medecin.medecin_id, solde, mouvements });
  } catch (err) {
    next(err);
  }
}