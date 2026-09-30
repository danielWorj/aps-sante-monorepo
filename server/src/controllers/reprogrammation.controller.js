// src/controllers/reprogrammation.controller.js
// Politique de fonds v2 §5 (étape 6) — endpoints de reprogrammation d'un
// RDV « a_reprogrammer » (deux absents). Toute la règle vit dans
// reprogrammation.service.js ; ici : validation de forme et traduction en HTTP.
// Réservé au patient et au médecin du rendez-vous (un admin n'est pas une
// partie : voir partieDeUtilisateur).

import { accepterProposition, proposerNouvelleDate } from "../services/reprogrammation.service.js";

/**
 * POST /api/rendez-vous/:id/reprogrammation/proposer
 * Body : { nouvelle_date: "2026-10-08T14:30:00Z" }
 * Propose (ou remplace) une nouvelle date. Le délai de 48h n'est jamais
 * prolongé : `echeance_reprogrammation` est celle du passage à « a_reprogrammer ».
 */
export async function proposerReprogrammation(req, res, next) {
  try {
    const resultat = await proposerNouvelleDate(req.params.id, req.utilisateur, req.body?.nouvelle_date);
    if (resultat.erreur) return res.status(resultat.erreur.status).json({ message: resultat.erreur.message });

    return res.status(200).json({
      message: "Nouvelle date proposée : l'autre partie doit maintenant l'accepter.",
      rendez_vous: resultat.rdv,
      echeance_reprogrammation: resultat.echeance,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rendez-vous/:id/reprogrammation/accepter
 * Body (facultatif) : { nouvelle_date_proposee } — la date affichée au
 * client ; refusée (409) si la proposition a été remplacée entre-temps.
 * Réservé à l'AUTRE partie que l'auteur de la proposition.
 */
export async function accepterReprogrammation(req, res, next) {
  try {
    const resultat = await accepterProposition(req.params.id, req.utilisateur, {
      nouvelle_date_proposee: req.body?.nouvelle_date_proposee,
    });
    if (resultat.erreur) return res.status(resultat.erreur.status).json({ message: resultat.erreur.message });

    return res.status(200).json({
      message: "Nouvelle date acceptée : rendez-vous confirmé. Aucun nouveau paiement n'est nécessaire.",
      rendez_vous: resultat.rdv,
    });
  } catch (err) {
    next(err);
  }
}
