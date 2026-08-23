// src/middlewares/authOptionnel.middleware.js
//
// Variante de "authentifier" (voir auth.middleware.js) pour les
// endpoints PUBLICS qui doivent néanmoins adapter leur réponse si un
// utilisateur authentifié est présent — ex : avis-pharmacie et
// publicites-pharmacie, dont la lecture est ouverte à tous, mais où
// l'auteur/l'agent-propriétaire/admin doit voir davantage que le
// grand public (voir avisPharmacie.controller.js et
// publicitePharmacie.controller.js).
//
// Contrairement à "authentifier" :
//   - un token absent n'est PAS une erreur : req.utilisateur reste
//     simplement undefined, et la requête continue normalement ;
//   - un token présent mais invalide/expiré/révoqué est traité de la
//     même façon (silencieusement ignoré) plutôt que rejeté en 401 —
//     l'endpoint reste public, on ne pénalise jamais l'accès public
//     pour un jeton défaillant.

import prisma from "../lib/prisma.js";
import { verifierAccessToken } from "../utils/token.utils.js";

export async function authentifierOptionnel(req, _res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return next();
    }

    const token = header.slice("Bearer ".length);

    let payload;
    try {
      payload = verifierAccessToken(token);
    } catch {
      return next(); // token invalide/expiré : on continue en visiteur anonyme
    }

    const revoque = await prisma.jetonRevoque.findUnique({ where: { jti: payload.jti } });
    if (revoque) {
      return next(); // token révoqué : idem, on continue en visiteur anonyme
    }

    req.utilisateur = {
      utilisateur_id: payload.sub,
      role: payload.role,
      pays_id: payload.pays_id,
      jti: payload.jti,
      exp: payload.exp,
    };

    next();
  } catch (err) {
    next(err);
  }
}