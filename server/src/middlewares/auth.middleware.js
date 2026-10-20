// src/middlewares/auth.middleware.js
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import {
  verifierAccessToken,
  SCOPE_CHANGEMENT_MOT_DE_PASSE,
  SCOPE_CHANGEMENT_PIN,
} from "../utils/token.utils.js";

/**
 * Vérifie la présence et la validité de l'access token JWT (header
 * Authorization: Bearer <token>), puis s'assure que son jti ne figure
 * pas dans la denylist (jeton_revoque) — ex : déconnexion, changement
 * de mot de passe, révocation admin.
 *
 * NB : le middleware de contrôle d'accès par rôle ("autoriser") vit
 * désormais uniquement dans autorisation.middleware.js — il existait
 * auparavant une implémentation dupliquée ici, non utilisée par les
 * routes mais source de dérive potentielle si modifiée séparément.
 */
export async function authentifier(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token d'authentification manquant." });
    }

    const token = header.slice("Bearer ".length);

    let payload;
    try {
      payload = verifierAccessToken(token);
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return res.status(401).json({ message: "Token expiré." });
      }
      return res.status(401).json({ message: "Token invalide." });
    }

    // Le token restreint émis à la place d'une session lors d'une
    // connexion avec mot de passe temporaire (voir
    // genererTokenChangementMotDePasse) ne porte ni role ni pays_id et
    // ne doit JAMAIS être accepté sur les routes standard — seul
    // POST /auth/changer-mot-de-passe-initial (protégé par
    // exigerTokenChangementMotDePasse) peut le consommer.
    if (payload.scope === SCOPE_CHANGEMENT_MOT_DE_PASSE) {
      return res.status(403).json({
        message:
          "Vous devez d'abord changer votre mot de passe temporaire avant d'accéder à cette ressource.",
      });
    }
    // Idem pour le token restreint du PIN provisoire, et par prudence pour
    // tout futur token restreint : seul un access token de session passe.
    if (payload.scope) {
      return res.status(403).json({
        message:
          payload.scope === SCOPE_CHANGEMENT_PIN
            ? "Vous devez d'abord choisir votre code PIN avant d'accéder à cette ressource."
            : "Ce token ne permet pas d'accéder à cette ressource.",
      });
    }

    const revoque = await prisma.jetonRevoque.findUnique({
      where: { jti: payload.jti },
    });

    if (revoque) {
      return res.status(401).json({ message: "Token révoqué." });
    }

    req.utilisateur = {
      utilisateur_id: payload.sub,
      role: payload.role,
      pays_id: payload.pays_id,
      jti: payload.jti,
      exp: payload.exp, // timestamp Unix (secondes) — utile pour dater précisément une révocation
      espace: payload.espace ?? null, // espace actif (voir espaces.service.js)
      pin_le: payload.pin_le ?? null, // dernier code PIN vérifié (secondes)
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Symétrique de `authentifier`, mais pour le seul endpoint
 * POST /auth/changer-mot-de-passe-initial : n'accepte QUE le token
 * restreint émis par `genererTokenChangementMotDePasse` (claim
 * scope === SCOPE_CHANGEMENT_MOT_DE_PASSE). Un access token de session
 * classique (sans ce claim) est donc rejeté ici, tout comme l'inverse
 * est vrai dans `authentifier` — les deux mondes ne se recoupent pas.
 *
 * jti vérifié contre jeton_revoque comme pour un access token normal :
 * une fois consommé par le contrôleur (changement effectif du mot de
 * passe), ce jti est ajouté à la denylist pour empêcher toute réémission.
 */
export async function exigerTokenChangementMotDePasse(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Token de changement de mot de passe manquant." });
    }

    const token = header.slice("Bearer ".length);

    let payload;
    try {
      payload = verifierAccessToken(token);
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return res.status(401).json({
          message:
            "Ce lien de changement de mot de passe a expiré. Reconnectez-vous avec votre mot de passe temporaire.",
        });
      }
      return res.status(401).json({ message: "Token invalide." });
    }

    if (payload.scope !== SCOPE_CHANGEMENT_MOT_DE_PASSE) {
      return res.status(403).json({
        message: "Ce token ne permet pas d'effectuer cette action.",
      });
    }

    const revoque = await prisma.jetonRevoque.findUnique({
      where: { jti: payload.jti },
    });

    if (revoque) {
      return res.status(401).json({
        message: "Ce lien de changement de mot de passe a déjà été utilisé.",
      });
    }

    req.utilisateurTemp = {
      utilisateur_id: payload.sub,
      jti: payload.jti,
      exp: payload.exp,
    };

    next();
  } catch (err) {
    next(err);
  }
}
/**
 * Équivalent de exigerTokenChangementMotDePasse pour le PIN provisoire :
 * n'accepte QUE le token restreint de scope SCOPE_CHANGEMENT_PIN, émis par
 * POST /auth/login-pin pour un compte au PIN provisoire.
 */
export async function exigerTokenChangementPin(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token de changement de code PIN manquant." });
    }

    let payload;
    try {
      payload = verifierAccessToken(header.slice("Bearer ".length));
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return res.status(401).json({
          message: "Le délai pour choisir votre code PIN a expiré. Reconnectez-vous avec votre code provisoire.",
        });
      }
      return res.status(401).json({ message: "Token invalide." });
    }

    if (payload.scope !== SCOPE_CHANGEMENT_PIN) {
      return res.status(403).json({ message: "Ce token ne permet pas d'effectuer cette action." });
    }

    const revoque = await prisma.jetonRevoque.findUnique({ where: { jti: payload.jti } });
    if (revoque) {
      return res.status(401).json({ message: "Ce code PIN a déjà été choisi. Reconnectez-vous." });
    }

    req.utilisateurTemp = { utilisateur_id: payload.sub, jti: payload.jti, exp: payload.exp };
    next();
  } catch (err) {
    next(err);
  }
}
