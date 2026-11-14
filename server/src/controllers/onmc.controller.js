// src/controllers/onmc.controller.js
// Tableau de l'Ordre National des Médecins du Cameroun (ONMC) : vérification
// d'un numéro d'ordre, synchronisation du registre, consultation de la copie
// locale. Logique dans services/onmc.service.js.

import {
  ErreurOnmc,
  demarrerSynchronisationOnmc,
  etatRegistreOnmc,
  rechercherDansRegistre,
  verifierEtMettreAJourMedecin,
  verifierNumeroOrdre,
} from "../services/onmc.service.js";

const MESSAGE_ONMC_INDISPONIBLE =
  "Impossible de vérifier ce numéro auprès du Tableau de l'Ordre (ONMC) pour le moment. Réessayez plus tard.";

function repondreErreur(err, res, next) {
  if (err instanceof ErreurOnmc) {
    // Jamais converti en « non inscrit » : la vérification n'a pas eu lieu.
    return res.status(502).json({ message: MESSAGE_ONMC_INDISPONIBLE });
  }
  if (err?.status && err.status < 500) {
    return res.status(err.status).json({ message: err.message });
  }
  return next(err);
}

/**
 * GET /api/onmc/verifier?numero_ordre=6979/2014&nom=Ayuk Edwin
 * POST /api/medecins/verifier-ordre  { numero_ordre, nom? }   (compatibilité)
 * PUBLIQUE (limitée en débit).
 * 200 : { numero_ordre, numero_normalise, appartient_ordre, nom_complet?,
 *         numero_ordre_onmc?, nom_correspond?, correspondances[], source,
 *         registre_synchronise_le, verification_directe_indisponible? }
 * 400 : numéro absent ou invalide. 502 : ONMC injoignable sans copie locale.
 */
export async function verifierOrdre(req, res, next) {
  try {
    const source = req.method === "GET" ? req.query : req.body || {};
    const numeroOrdre = String(source.numero_ordre ?? "").trim();
    if (!numeroOrdre) {
      return res.status(400).json({ message: "Le champ numero_ordre est obligatoire." });
    }
    const nom = String(source.nom ?? "").trim().slice(0, 200);
    const resultat = await verifierNumeroOrdre({ numeroOrdre, nom });
    return res.status(200).json(resultat);
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/**
 * POST /api/medecins/:id/verifier-ordre   (admin, superadmin)
 * Vérifie la fiche en direct sur le site de l'ONMC et enregistre son statut.
 */
export async function verifierOrdreMedecin(req, res, next) {
  try {
    const { medecin, verification } = await verifierEtMettreAJourMedecin(req.params.id, { direct: true });
    return res.status(200).json({ medecin, verification });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** GET /api/onmc/etat   (admin, superadmin) */
export async function obtenirEtatOnmc(req, res, next) {
  try {
    return res.status(200).json(await etatRegistreOnmc());
  } catch (err) {
    return next(err);
  }
}

/** POST /api/onmc/synchroniser   (admin, superadmin) — 202, tâche de fond. */
export async function lancerSynchronisationOnmc(req, res, next) {
  try {
    await demarrerSynchronisationOnmc({ declencheePar: req.utilisateur?.utilisateur_id || "inconnu" });
    return res.status(202).json({ message: "Synchronisation du registre ONMC lancée." });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** GET /api/onmc/registre?recherche=&page=&par_page=   (admin, superadmin) */
export async function listerRegistreOnmc(req, res, next) {
  try {
    const { recherche, page, par_page } = req.query;
    return res.status(200).json(await rechercherDansRegistre({ recherche, page, parPage: par_page }));
  } catch (err) {
    return next(err);
  }
}
