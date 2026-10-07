// src/controllers/parametreDelaiLiberation.controller.js
// Libération différée des fonds — Phase 4 : API d'administration du délai T
// (heures) pendant lequel les fonds d'un RDV terminé restent en séquestre.
//
// Même patron que parametreAmende.controller.js. Toute la logique métier
// (validation, désactivation de l'actif + création dans UNE transaction,
// bornes 0..720 h) vit dans parametreDelaiLiberation.service.js : ce
// contrôleur ne fait que traduire HTTP <-> service.
//
// AUCUNE valeur par défaut ni seed : tant qu'aucun T actif n'existe pour un
// pays, la fin de consultation des médecins de ce pays échoue (409
// PARAMETRE_DELAI_ABSENT). Jamais d'UPDATE : modifier T = nouvelle version ;
// les RDV déjà terminés gardent le T figé (rendez_vous.delai_liberation_heures).

import {
  ErreurParametreDelai,
  listerParametresDelai,
  creerParametreDelai,
  obtenirParametreDelaiActif,
} from "../services/parametreDelaiLiberation.service.js";

function repondreErreur(err, res, next) {
  if (err instanceof ErreurParametreDelai) {
    return res.status(err.status).json({ message: err.message, code: err.code });
  }
  // Violation de l'index unique partiel « un seul actif par pays » : deux
  // créations concurrentes pour le même pays.
  if (err?.code === "P2002") {
    return res.status(409).json({
      message: "Une autre modification du même paramètre vient d'avoir lieu. Réessayez.",
      code: "PARAMETRE_DELAI_CONFLIT",
    });
  }
  return next(err);
}

/**
 * GET /api/parametres-delai-liberation
 * Filtrable par ?pays_id=... et ?actif=true|false (historique inclus par défaut).
 */
export async function listerParametresDelaiLiberation(req, res, next) {
  try {
    const { pays_id, actif } = req.query;
    if (actif !== undefined && actif !== "true" && actif !== "false") {
      return res.status(400).json({ message: "actif invalide. Valeurs acceptées : true, false." });
    }

    const parametres = await listerParametresDelai({
      pays_id: pays_id || undefined,
      actif: actif === undefined ? undefined : actif === "true",
    });

    return res.status(200).json({ parametres_delai_liberation: parametres });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/**
 * GET /api/parametres-delai-liberation/pays/:pays_id/actif
 * Paramètre T actif d'un pays. 409 PARAMETRE_DELAI_ABSENT si rien n'a été saisi
 * (permet au back-office d'afficher « délai non configuré »).
 */
export async function obtenirParametreDelaiLiberationActif(req, res, next) {
  try {
    const parametre = await obtenirParametreDelaiActif(req.params.pays_id);
    return res.status(200).json({ parametre_delai_liberation: parametre });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/**
 * POST /api/parametres-delai-liberation
 * Body : { pays_id, libelle, heures }
 * Désactive le paramètre actif du pays puis crée le nouveau (transaction).
 */
export async function creerParametreDelaiLiberation(req, res, next) {
  try {
    const { pays_id, libelle, heures } = req.body ?? {};
    const nouveau = await creerParametreDelai({ pays_id, libelle, heures });

    return res.status(201).json({
      message: "Nouveau délai de libération des fonds créé et activé. Il ne s'applique qu'aux consultations terminées à partir de maintenant.",
      parametre_delai_liberation: nouveau,
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}