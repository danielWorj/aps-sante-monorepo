// src/controllers/parametreDureeTeleconsultation.controller.js
// Téléconsultation — API d'administration de la durée maximale d'un appel
// (minutes), par pays et versionnée. Logique dans
// dureeTeleconsultation.service.js ; sans paramètre actif, la valeur par
// défaut s'applique (DUREE_TELECONSULTATION_PAR_DEFAUT_MIN).

import {
  ErreurParametreDureeTeleconsultation,
  creerParametreDuree,
  listerParametresDuree,
  resoudreDureePays,
} from "../services/dureeTeleconsultation.service.js";
import {
  ALERTE_AVANT_FIN_MIN,
  DUREE_TELECONSULTATION_PAR_DEFAUT_MIN,
  MINUTES_MAX,
  MINUTES_MIN,
} from "../lib/dureeTeleconsultation.js";

function repondreErreur(err, res, next) {
  if (err instanceof ErreurParametreDureeTeleconsultation) {
    return res.status(err.status).json({ message: err.message, code: err.code });
  }
  // Index unique partiel « un seul actif par pays » : deux créations concurrentes.
  if (err?.code === "P2002") {
    return res.status(409).json({
      message: "Une autre modification du même paramètre vient d'avoir lieu. Réessayez.",
      code: "PARAMETRE_DUREE_TELECONSULTATION_CONFLIT",
    });
  }
  return next(err);
}

/** GET /api/parametres-duree-teleconsultation?pays_id=&actif= */
export async function listerParametresDureeCtrl(req, res, next) {
  try {
    const { pays_id, actif } = req.query;
    if (actif !== undefined && actif !== "true" && actif !== "false") {
      return res.status(400).json({ message: "actif invalide. Valeurs acceptées : true, false." });
    }
    const parametres = await listerParametresDuree({
      pays_id: pays_id || undefined,
      actif: actif === undefined ? undefined : actif === "true",
    });
    return res.status(200).json({
      parametres_duree_teleconsultation: parametres,
      minutes_par_defaut: DUREE_TELECONSULTATION_PAR_DEFAUT_MIN,
      minutes_min: MINUTES_MIN,
      minutes_max: MINUTES_MAX,
      alerte_avant_fin_minutes: ALERTE_AVANT_FIN_MIN,
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** GET /api/parametres-duree-teleconsultation/pays/:pays_id/actif */
export async function obtenirDureePaysCtrl(req, res, next) {
  try {
    return res.status(200).json({ duree_teleconsultation: await resoudreDureePays(req.params.pays_id) });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** POST /api/parametres-duree-teleconsultation — { pays_id, libelle, minutes } */
export async function creerParametreDureeCtrl(req, res, next) {
  try {
    const { pays_id, libelle, minutes } = req.body ?? {};
    const nouveau = await creerParametreDuree({ pays_id, libelle, minutes });
    return res.status(201).json({
      message:
        "Nouvelle durée de téléconsultation créée et activée. Elle s'applique aux appels qui commencent à partir de maintenant ; " +
        "les appels en cours gardent leur durée.",
      parametre_duree_teleconsultation: nouveau,
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}
