// src/controllers/pin.controller.js
// Connexion numéro + code PIN, choix et changement du PIN, vérification du
// PIN (actions sensibles, déverrouillage), espaces du compte. L'email + mot
// de passe reste disponible (authentification.controller.js).
// Logique dans pin.service.js et espaces.service.js.

import prisma from "../lib/prisma.js";
import { genererAccessToken, genererTokenChangementPin, hasherToken, NOM_COOKIE_REFRESH_TOKEN } from "../utils/token.utils.js";
import { ouvrirSessionEspace, serialiserUtilisateur } from "../services/compte.service.js";
import { definirPin, ErreurPin, remplacerPinProvisoire, verifierNumeroEtPin, verifierPinCompte } from "../services/pin.service.js";
import { ErreurEspace, listerEspaces, memoriserEspace, trouverEspace } from "../services/espaces.service.js";
import { pinRecent } from "../middlewares/pin.middleware.js";

export function repondreErreurPin(err, res, next) {
  if (err instanceof ErreurPin || err instanceof ErreurEspace || err?.name === "ErreurSms") {
    return res.status(err.status).json({
      message: err.message,
      code: err.code,
      ...(err.essais_restants !== undefined && { essais_restants: err.essais_restants }),
      ...(err.minutes_restantes !== undefined && { minutes_restantes: err.minutes_restantes }),
      ...(err.attente_s !== undefined && { attente_s: err.attente_s }),
      ...(err.tentatives_restantes !== undefined && { tentatives_restantes: err.tentatives_restantes }),
    });
  }
  return next(err);
}

/** Réponse d'une connexion réussie : même forme que POST /auth/login, plus les espaces. */
export async function reponseSession(req, res, utilisateur, message, options = {}) {
  const { accessToken, espace, espaces } = await ouvrirSessionEspace(req, res, utilisateur, options);
  return res.status(200).json({
    message,
    access_token: accessToken,
    utilisateur: serialiserUtilisateur(utilisateur, espace),
    espaces,
  });
}

/**
 * POST /api/auth/login-pin   body: { telephone, pays_iso2?, pin }
 * Session complète (PIN tout juste vérifié), ou, pour un PIN provisoire,
 * un token restreint servant uniquement à choisir son PIN (pin_a_changer).
 */
export async function connecterParPinCtrl(req, res, next) {
  try {
    const { telephone, pays_iso2, pin } = req.body ?? {};
    const utilisateur = await verifierNumeroEtPin({ telephone, pays_iso2, pin: pin == null ? pin : String(pin) });

    if (utilisateur.pin_provisoire) {
      const { token, date_expiration } = genererTokenChangementPin(utilisateur);
      return res.status(200).json({
        message: "Code PIN provisoire : choisissez votre code PIN personnel pour continuer.",
        pin_a_changer: true,
        token_changement_pin: token,
        token_changement_pin_expire_le: date_expiration,
      });
    }

    return reponseSession(req, res, utilisateur, "Connexion réussie.", { pinVerifie: true });
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}

/**
 * POST /api/auth/changer-pin-initial   body: { nouveau_pin }
 * Protégée par exigerTokenChangementPin. Ouvre directement la session.
 */
export async function changerPinInitialCtrl(req, res, next) {
  try {
    const utilisateur = await remplacerPinProvisoire({
      utilisateur_id: req.utilisateurTemp.utilisateur_id,
      pin: req.body?.nouveau_pin == null ? null : String(req.body.nouveau_pin),
    });

    // Token restreint à usage unique.
    await prisma.jetonRevoque.upsert({
      where: { jti: req.utilisateurTemp.jti },
      update: {},
      create: {
        jti: req.utilisateurTemp.jti,
        utilisateur_id: utilisateur.utilisateur_id,
        date_expiration_initiale: req.utilisateurTemp.exp
          ? new Date(req.utilisateurTemp.exp * 1000)
          : new Date(Date.now() + 15 * 60 * 1000),
        motif: "changement_mdp",
      },
    });

    if (utilisateur.statut_compte === "suspendu") {
      return res.status(403).json({ message: "Compte suspendu." });
    }
    return reponseSession(req, res, utilisateur, "Code PIN enregistré. Connexion réussie.", { pinVerifie: true });
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}

/**
 * POST /api/auth/pin   body: { telephone?, pays_iso2?, pin, ancien_pin?, preuve_telephone? }
 * Choisir (ou changer) son numéro de connexion et son code PIN, depuis une
 * session ouverte (ex. après une connexion par email + mot de passe).
 */
export async function definirPinCtrl(req, res, next) {
  try {
    const { telephone, pays_iso2, pin, ancien_pin, preuve_telephone } = req.body ?? {};
    const utilisateur = await definirPin({
      utilisateur_id: req.utilisateur.utilisateur_id,
      telephone,
      pays_iso2,
      pin: pin == null ? pin : String(pin),
      ancien_pin: ancien_pin == null ? null : String(ancien_pin),
      preuve_telephone: preuve_telephone ?? null,
    });
    const espace = await trouverEspace(utilisateur.utilisateur_id, req.utilisateur.espace);
    return res.status(200).json({
      message: "Code PIN enregistré. Vous pouvez désormais vous connecter avec votre numéro et ce code.",
      utilisateur: serialiserUtilisateur(utilisateur, espace),
    });
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}

/** Jeton d'accès pour la session courante, avec un PIN tout juste vérifié. */
function jetonAvecPin(req, utilisateur) {
  return genererAccessToken({
    ...utilisateur,
    role: req.utilisateur.role,
    espace: req.utilisateur.espace,
    pin_le: Math.floor(Date.now() / 1000),
  }).token;
}

/**
 * POST /api/auth/pin/verifier   body: { pin }
 * Confirme le PIN (actions sensibles, déverrouillage de l'application) :
 * renvoie un nouveau jeton d'accès valable pour les actions sensibles
 * pendant 5 minutes. Même limite d'essais que la connexion.
 */
export async function verifierPinCtrl(req, res, next) {
  try {
    const utilisateur = await verifierPinCompte(req.utilisateur.utilisateur_id, req.body?.pin == null ? null : String(req.body.pin));
    return res.status(200).json({ message: "Code PIN confirmé.", access_token: jetonAvecPin(req, utilisateur) });
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}

/** GET /api/auth/espaces */
export async function listerEspacesCtrl(req, res, next) {
  try {
    const espaces = await listerEspaces(req.utilisateur.utilisateur_id);
    return res.status(200).json({ espaces, espace_actif: req.utilisateur.espace });
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}

/**
 * POST /api/auth/espaces/choisir   body: { cle, pin? }
 * Ouvre une nouvelle session sur l'espace choisi (rôle de cet espace).
 * Entrer dans un espace PROFESSIONNEL depuis un autre espace redemande le
 * code PIN (sauf s'il vient d'être saisi, ou si le compte n'a pas encore
 * de PIN) : sinon 403 { code: "PIN_REQUIS" }.
 */
export async function choisirEspaceCtrl(req, res, next) {
  try {
    const { utilisateur_id } = req.utilisateur;
    const cle = String(req.body?.cle ?? "");
    const espace = await trouverEspace(utilisateur_id, cle);
    if (!espace) throw new ErreurEspace("Cet espace n'est pas rattaché à votre compte.", 400, "ESPACE_INCONNU");

    let utilisateur = await prisma.utilisateur.findUnique({ where: { utilisateur_id }, include: { role: true } });
    let pinVerifie = pinRecent(req.utilisateur);
    const changement = espace.cle !== req.utilisateur.espace;
    if (changement && espace.professionnel && utilisateur.pin_hash && !pinVerifie) {
      if (req.body?.pin == null || req.body.pin === "") {
        return res.status(403).json({ code: "PIN_REQUIS", message: "Saisissez votre code PIN pour ouvrir cet espace." });
      }
      utilisateur = await verifierPinCompte(utilisateur_id, String(req.body.pin));
      pinVerifie = true;
    }

    await memoriserEspace(utilisateur_id, espace.cle);
    utilisateur = { ...utilisateur, dernier_espace: espace.cle };

    // L'ancienne session (cookie de renouvellement + jeton d'accès) est
    // remplacée par une session sur le nouvel espace.
    const ancien = req.cookies?.[NOM_COOKIE_REFRESH_TOKEN];
    if (ancien) {
      await prisma.refreshToken.updateMany({
        where: { token_hash: hasherToken(ancien), statut: "actif" },
        data: { statut: "revoque", date_revocation: new Date() },
      });
    }
    await prisma.jetonRevoque.upsert({
      where: { jti: req.utilisateur.jti },
      update: {},
      create: {
        jti: req.utilisateur.jti,
        utilisateur_id,
        date_expiration_initiale: new Date((req.utilisateur.exp ?? Date.now() / 1000 + 900) * 1000),
        motif: "deconnexion",
      },
    });

    const { accessToken, espaces } = await ouvrirSessionEspace(req, res, utilisateur, { espace: { ...espace, dernier: true }, pinVerifie });
    return res.status(200).json({
      access_token: accessToken,
      utilisateur: serialiserUtilisateur(utilisateur, espace),
      espace: { ...espace, dernier: true },
      espaces,
    });
  } catch (err) {
    return repondreErreurPin(err, res, next);
  }
}
