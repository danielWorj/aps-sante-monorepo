// src/controllers/offreRdv.controller.js
// RDV aléatoire (RDV sur offre) — couche HTTP. Toutes les règles métier sont
// dans services/offreRdv.service.js ; ici : profil courant (patient ou
// médecin), traduction des refus métier en réponses HTTP.

import prisma from "../lib/prisma.js";
import { ROLES_VISIBILITE, projeterRdvPourRole } from "../services/visibiliteRole.service.js";
import {
  ErreurOffre,
  STATUTS_OFFRE,
  annulerOffre,
  annulerOffreAdmin,
  listerOffresAdmin,
  listerOffresMedecin,
  listerOffresPatient,
  obtenirOffrePatient,
  publierOffre,
  repondreOffre,
  retirerReponse,
  validerMedecin,
} from "../services/offreRdv.service.js";

function gererErreur(err, res, next) {
  if (err instanceof ErreurOffre) {
    return res.status(err.status).json({ message: err.message, ...(err.code ? { code: err.code } : {}) });
  }
  return next(err);
}

async function patientCourant(req, res) {
  const patient = await prisma.patient.findUnique({ where: { utilisateur_id: req.utilisateur.utilisateur_id } });
  if (!patient) res.status(403).json({ message: "Réservé aux comptes patient." });
  return patient;
}

async function medecinCourant(req, res) {
  const medecin = await prisma.medecin.findUnique({ where: { utilisateur_id: req.utilisateur.utilisateur_id } });
  if (!medecin) res.status(403).json({ message: "Réservé aux comptes médecin." });
  return medecin;
}

/* ---------------------------- Patient ---------------------------- */

/** POST /api/offres-rdv — { specialite_id, ville_id, type_rdv, date_souhaitee, motif? } */
export async function creerOffre(req, res, next) {
  try {
    const patient = await patientCourant(req, res);
    if (!patient) return;
    const { offre, medecins_notifies } = await publierOffre(patient, req.body);
    return res.status(201).json({ message: "Demande publiée.", offre, medecins_notifies });
  } catch (err) {
    return gererErreur(err, res, next);
  }
}

/** GET /api/offres-rdv/mes-offres?statut= */
export async function listerMesOffres(req, res, next) {
  try {
    const patient = await patientCourant(req, res);
    if (!patient) return;
    const { statut } = req.query;
    if (statut && !STATUTS_OFFRE.includes(statut)) {
      return res.status(400).json({ message: `statut invalide. Valeurs acceptées : ${STATUTS_OFFRE.join(", ")}.` });
    }
    return res.status(200).json({ offres: await listerOffresPatient(patient, { statut }) });
  } catch (err) {
    return gererErreur(err, res, next);
  }
}

/** GET /api/offres-rdv/mes-offres/:id */
export async function obtenirMonOffre(req, res, next) {
  try {
    const patient = await patientCourant(req, res);
    if (!patient) return;
    return res.status(200).json({ offre: await obtenirOffrePatient(patient, req.params.id) });
  } catch (err) {
    return gererErreur(err, res, next);
  }
}

/** POST /api/offres-rdv/:id/annuler */
export async function annulerMonOffre(req, res, next) {
  try {
    const patient = await patientCourant(req, res);
    if (!patient) return;
    await annulerOffre(patient, req.params.id);
    return res.status(200).json({ message: "Demande annulée." });
  } catch (err) {
    return gererErreur(err, res, next);
  }
}

/**
 * POST /api/offres-rdv/:id/reponses/:reponseId/valider — « Valider ce médecin ».
 * Crée le RDV (« cree ») : même réponse que POST /rendez-vous, le client
 * enchaîne sur le paiement.
 */
export async function validerReponse(req, res, next) {
  try {
    const patient = await patientCourant(req, res);
    if (!patient) return;
    const { rdv, delai, echeance } = await validerMedecin(patient, req.params.id, req.params.reponseId);
    return res.status(201).json({
      message: "Médecin validé : rendez-vous créé. Procédez au paiement pour le confirmer.",
      rendez_vous: projeterRdvPourRole(rdv, ROLES_VISIBILITE.PATIENT),
      delai_confirmation_heures: delai.heures,
      echeance_confirmation: echeance.toISOString(),
    });
  } catch (err) {
    return gererErreur(err, res, next);
  }
}

/* ---------------------------- Médecin ---------------------------- */

/** GET /api/offres-rdv/medecin?vue=ouvertes|mes_reponses */
export async function listerOffresPourMedecin(req, res, next) {
  try {
    const medecin = await medecinCourant(req, res);
    if (!medecin) return;
    const vue = req.query.vue === "mes_reponses" ? "mes_reponses" : "ouvertes";
    return res.status(200).json({ offres: await listerOffresMedecin(medecin, { vue }) });
  } catch (err) {
    return gererErreur(err, res, next);
  }
}

/** POST /api/offres-rdv/:id/reponse — { message? } */
export async function repondre(req, res, next) {
  try {
    const medecin = await medecinCourant(req, res);
    if (!medecin) return;
    const reponse = await repondreOffre(medecin, req.params.id, req.body ?? {});
    return res.status(201).json({ message: "Réponse envoyée au patient.", reponse });
  } catch (err) {
    return gererErreur(err, res, next);
  }
}

/** DELETE /api/offres-rdv/:id/reponse */
export async function retirer(req, res, next) {
  try {
    const medecin = await medecinCourant(req, res);
    if (!medecin) return;
    await retirerReponse(medecin, req.params.id);
    return res.status(200).json({ message: "Réponse retirée." });
  } catch (err) {
    return gererErreur(err, res, next);
  }
}

/* ------------------------ Administration ------------------------- */

/** GET /api/offres-rdv/admin?statut=&pays_id=&page=&limite= (admin, superadmin) */
export async function listerOffresPourAdmin(req, res, next) {
  try {
    const { statut, pays_id, page, limite } = req.query;
    if (statut && !STATUTS_OFFRE.includes(statut)) {
      return res.status(400).json({ message: `statut invalide. Valeurs acceptées : ${STATUTS_OFFRE.join(", ")}.` });
    }
    return res.status(200).json(await listerOffresAdmin({ statut, pays_id: pays_id || undefined, page, limite }));
  } catch (err) {
    return gererErreur(err, res, next);
  }
}

/** POST /api/offres-rdv/:id/retirer (admin, superadmin) — modération d'une offre ouverte. */
export async function retirerOffreAdmin(req, res, next) {
  try {
    await annulerOffreAdmin(req.params.id);
    return res.status(200).json({ message: "Demande retirée." });
  } catch (err) {
    return gererErreur(err, res, next);
  }
}
