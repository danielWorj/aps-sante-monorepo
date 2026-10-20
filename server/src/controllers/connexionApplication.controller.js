// src/controllers/connexionApplication.controller.js
// Connexion web validée depuis l'application mobile, configuration de la
// connexion (vérification du numéro active ou non), code PIN oublié et
// vérification du numéro d'un compte existant.
// Logique dans connexionApplication.service.js et pin.service.js.

import prisma from "../lib/prisma.js";
import { serialiserUtilisateur } from "../services/compte.service.js";
import { canauxVerification, reinitialiserPin, verificationTelephoneActive, verifierTelephoneCompte } from "../services/pin.service.js";
import { trouverEspace } from "../services/espaces.service.js";
import {
  demanderConnexionApplication,
  demandesEnAttente,
  repondreDemandeConnexion,
  sonderConnexionApplication,
} from "../services/connexionApplication.service.js";
import { repondreErreurPin, reponseSession } from "./pin.controller.js";

/** GET /api/auth/configuration-connexion — ce que les écrans doivent proposer. */
export function configurationConnexionCtrl(_req, res) {
  return res.status(200).json({
    verification_telephone: verificationTelephoneActive(),
    canaux: canauxVerification(),
    connexion_application: true,
  });
}

/** POST /api/auth/pin/reinitialiser   body: { telephone, pays_iso2?, preuve_telephone, nouveau_pin } */
export async function reinitialiserPinCtrl(req, res, next) {
  try {
    const { telephone, pays_iso2, preuve_telephone, nouveau_pin } = req.body ?? {};
    await reinitialiserPin({ telephone, pays_iso2, preuve_telephone, nouveau_pin: nouveau_pin == null ? null : String(nouveau_pin) });
    return res.status(200).json({ message: "Code PIN modifié. Connectez-vous avec votre numéro et ce nouveau code." });
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}

/** POST /api/auth/telephone/verifier   body: { preuve_telephone } */
export async function verifierTelephoneCtrl(req, res, next) {
  try {
    const utilisateur = await verifierTelephoneCompte({
      utilisateur_id: req.utilisateur.utilisateur_id,
      preuve_telephone: req.body?.preuve_telephone ?? null,
    });
    const espace = await trouverEspace(utilisateur.utilisateur_id, req.utilisateur.espace);
    return res.status(200).json({ message: "Numéro vérifié.", utilisateur: serialiserUtilisateur(utilisateur, espace) });
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}

/* ------------------- Connexion web validée par l'application ------------------- */

/** POST /api/auth/connexion-application   body: { telephone, pays_iso2? } (navigateur) */
export async function demanderConnexionApplicationCtrl(req, res, next) {
  try {
    const { telephone, pays_iso2 } = req.body ?? {};
    const demande = await demanderConnexionApplication({
      telephone,
      pays_iso2,
      user_agent: req.headers["user-agent"] ?? null,
      adresse_ip: req.ip ?? null,
    });
    return res.status(201).json({
      message: "Ouvrez l'application APS Santé sur votre téléphone et validez la connexion.",
      ...demande,
    });
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}

/** POST /api/auth/connexion-application/:id/statut   body: { secret } (navigateur, sondage) */
export async function sonderConnexionApplicationCtrl(req, res, next) {
  try {
    const resultat = await sonderConnexionApplication({ demande_id: req.params.id, secret: req.body?.secret });
    if (resultat.statut !== "approuvee") return res.status(200).json({ statut: resultat.statut });

    const utilisateur = await prisma.utilisateur.findUnique({ where: { utilisateur_id: resultat.utilisateur_id }, include: { role: true } });
    if (!utilisateur || utilisateur.statut_compte === "suspendu") return res.status(200).json({ statut: "refusee" });
    return reponseSession(req, res, utilisateur, "Connexion validée depuis votre téléphone.");
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}

/** GET /api/auth/connexion-application/demandes (application mobile connectée) */
export async function demandesConnexionCtrl(req, res, next) {
  try {
    return res.status(200).json({ demandes: await demandesEnAttente(req.utilisateur.utilisateur_id) });
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}

/** POST /api/auth/connexion-application/demandes/:id/repondre   body: { accepter, code } */
export async function repondreDemandeConnexionCtrl(req, res, next) {
  try {
    const statut = await repondreDemandeConnexion({
      utilisateur_id: req.utilisateur.utilisateur_id,
      demande_id: req.params.id,
      accepter: req.body?.accepter === true,
      code: req.body?.code,
    });
    return res.status(200).json({
      statut,
      message: statut === "approuvee" ? "Connexion autorisée sur l'ordinateur." : "Connexion refusée.",
    });
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}
