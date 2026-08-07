// src/middlewares/auth.middleware.js
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { verifierAccessToken } from "../utils/token.utils.js";

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
    };

    next();
  } catch (err) {
    next(err);
  }
}