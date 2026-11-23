// src/controllers/connexionApplication.controller.js
// Connexion web validée depuis l'application mobile, configuration de la
// connexion (vérification du numéro active ou non), code PIN oublié et
// vérification du numéro d'un compte existant.
// Logique dans connexionApplication.service.js et pin.service.js.

import prisma from "../lib/prisma.js";
import { serialiserUtilisateur } from "../services/compte.service.js";
import {
  canauxVerification,
  reinitialisationPinDisponible,
  reinitialiserPin,
  verificationTelephoneActive,
  verifierTelephoneCompte,
} from "../services/pin.service.js";
import { consommerPreuveTelephone, demanderCodeVerification, whatsappInverseActif } from "../services/verificationTelephone.service.js";
import {
  appareilDeLaRequete,
  autreApplicationConnectee,
  faireConfianceAppareil,
  faireConfianceAppareilRequete,
  validationAppareilActive,
} from "../services/appareilConfiance.service.js";
import { estClientMobile } from "../utils/token.utils.js";
import { trouverEspace } from "../services/espaces.service.js";
import {
  demanderConnexionApplication,
  demanderValidationNouvelAppareil,
  demandesEnAttente,
  repondreDemandeConnexion,
  sonderConnexionApplication,
} from "../services/connexionApplication.service.js";
import { repondreErreurPin, reponseSession } from "./pin.controller.js";
import { NOM_MARQUE } from "../lib/marque.js";

/** GET /api/auth/configuration-connexion — ce que les écrans doivent proposer. */
export async function configurationConnexionCtrl(_req, res, next) {
  try {
    return res.status(200).json({
      // Preuve du numéro exigée à l'inscription / au changement de numéro.
      verification_telephone: verificationTelephoneActive(),
      // Moyens de prouver le numéro : « whatsapp_inverse » (l'utilisateur
      // envoie le code), « sms », « whatsapp » (code reçu).
      canaux: await canauxVerification(),
      whatsapp_inverse: await whatsappInverseActif(),
      pin_oublie: await reinitialisationPinDisponible(),
      validation_appareil: validationAppareilActive(),
      connexion_application: true,
    });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/auth/pin/reinitialiser   body: { telephone, pays_iso2?, preuve_telephone, nouveau_pin } */
export async function reinitialiserPinCtrl(req, res, next) {
  try {
    const { telephone, pays_iso2, preuve_telephone, nouveau_pin } = req.body ?? {};
    const utilisateur = await reinitialiserPin({ telephone, pays_iso2, preuve_telephone, nouveau_pin: nouveau_pin == null ? null : String(nouveau_pin) });
    // Numéro tout juste prouvé sur cet appareil : pas de seconde validation
    // à la connexion qui suit.
    await faireConfianceAppareilRequete(req, res, utilisateur.utilisateur_id, "pin_reinitialise");
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
      appareil_empreinte: appareilDeLaRequete(req, res),
      appareil_mobile: estClientMobile(req),
    });
    return res.status(201).json({
      message: `Ouvrez l'application ${NOM_MARQUE} sur votre téléphone et validez la connexion.`,
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
    // Validée depuis l'application connectée : cet appareil devient de confiance.
    await faireConfianceAppareil({
      utilisateur_id: utilisateur.utilisateur_id,
      empreinte: resultat.appareil_empreinte ?? appareilDeLaRequete(req, res),
      mobile: resultat.appareil_mobile ?? estClientMobile(req),
      libelle: req.headers["user-agent"] ?? null,
      valide_par: "application",
    });
    return reponseSession(
      req,
      res,
      utilisateur,
      resultat.objet === "nouvel_appareil" ? "Appareil confirmé. Connexion réussie." : "Connexion validée depuis votre téléphone."
    );
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

/* ------------------------- Validation d'un nouvel appareil ------------------------- */
// Routes protégées par exigerTokenValidationAppareil (token restreint rendu
// par la connexion quand l'appareil est inconnu).

async function revoquerJetonValidation(validation) {
  await prisma.jetonRevoque.upsert({
    where: { jti: validation.jti },
    update: {},
    create: {
      jti: validation.jti,
      utilisateur_id: validation.utilisateur_id,
      date_expiration_initiale: new Date((validation.exp ?? Date.now() / 1000 + 900) * 1000),
      motif: "deconnexion",
    },
  });
}

/**
 * POST /api/auth/appareil/application
 * Demande à l'application connectée sur un autre téléphone de confirmer.
 * Réponse : { demande_id, secret, code, expire_le } ; l'appareil sonde
 * ensuite POST /api/auth/connexion-application/:id/statut.
 */
export async function demanderValidationApplicationCtrl(req, res, next) {
  try {
    const { utilisateur_id, empreinte } = req.validationAppareil;
    if (!(await autreApplicationConnectee(utilisateur_id, empreinte))) {
      return res.status(409).json({
        code: "AUCUNE_APPLICATION",
        message: `Aucune application ${NOM_MARQUE} n'est connectée sur un autre téléphone. Confirmez par WhatsApp.`,
      });
    }
    const demande = await demanderValidationNouvelAppareil({
      utilisateur_id,
      user_agent: req.headers["user-agent"] ?? null,
      adresse_ip: req.ip ?? null,
      appareil_empreinte: empreinte,
      appareil_mobile: estClientMobile(req),
    });
    return res.status(201).json({
      message: `Ouvrez l'application ${NOM_MARQUE} sur votre autre téléphone et touchez le code affiché ici.`,
      ...demande,
    });
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}

/**
 * POST /api/auth/appareil/whatsapp
 * Lance la vérification WhatsApp inversée sur le numéro de connexion du
 * compte (inconnu du client en connexion par email). Réponse : code à
 * envoyer, lien wa.me, verification_id à sonder via
 * POST /api/verification-telephone/statut.
 */
export async function demanderValidationWhatsappCtrl(req, res, next) {
  try {
    const utilisateur = await prisma.utilisateur.findUnique({
      where: { utilisateur_id: req.validationAppareil.utilisateur_id },
      select: { telephone_connexion: true },
    });
    if (!utilisateur?.telephone_connexion) return res.status(404).json({ message: "Compte introuvable." });
    const r = await demanderCodeVerification({
      telephone: `+${utilisateur.telephone_connexion}`,
      objet: "connexion",
      canal: "whatsapp_inverse",
      adresse_ip: req.ip ?? null,
    });
    return res.status(200).json({
      message: "Envoyez ce code depuis votre WhatsApp pour confirmer cet appareil.",
      ...r,
    });
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}

/**
 * POST /api/auth/appareil/valider   body: { preuve_telephone }
 * Preuve de numéro obtenue par WhatsApp inversé (objet « connexion »,
 * numéro de connexion du compte) : l'appareil devient de confiance et la
 * session s'ouvre.
 */
export async function validerAppareilParPreuveCtrl(req, res, next) {
  try {
    const validation = req.validationAppareil;
    const utilisateur = await prisma.utilisateur.findUnique({ where: { utilisateur_id: validation.utilisateur_id }, include: { role: true } });
    if (!utilisateur?.telephone_connexion) {
      return res.status(404).json({ message: "Compte introuvable." });
    }
    if (utilisateur.statut_compte === "suspendu") return res.status(403).json({ message: "Compte suspendu." });

    await consommerPreuveTelephone({
      preuve: req.body?.preuve_telephone,
      objet: "connexion",
      telephone: `+${utilisateur.telephone_connexion}`,
    });
    await revoquerJetonValidation(validation);
    await faireConfianceAppareil({
      utilisateur_id: utilisateur.utilisateur_id,
      empreinte: validation.empreinte,
      mobile: estClientMobile(req),
      libelle: req.headers["user-agent"] ?? null,
      valide_par: "whatsapp",
    });
    const verifie = utilisateur.telephone_verifie
      ? utilisateur
      : await prisma.utilisateur.update({
        where: { utilisateur_id: utilisateur.utilisateur_id },
        data: { telephone_verifie: true },
        include: { role: true },
      });
    return reponseSession(req, res, verifie, "Appareil confirmé. Connexion réussie.", { pinVerifie: validation.pinVerifie });
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}
