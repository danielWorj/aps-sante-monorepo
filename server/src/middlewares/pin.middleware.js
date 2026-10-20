// src/middlewares/pin.middleware.js
// Actions sensibles (retraits, moyens de paiement…) : code PIN vérifié
// depuis moins de 5 minutes (claim `pin_le` du jeton, posé par la
// connexion numéro + PIN ou par POST /auth/pin/verifier).
//
// Sinon : 403 { code: "PIN_REQUIS" } — le client demande le PIN, appelle
// POST /auth/pin/verifier (nouveau jeton) puis rejoue la requête.
//
// Transition : un compte qui n'a PAS encore de PIN (connexion par email
// uniquement) passe, pour ne pas bloquer les parcours existants ; dès qu'il
// crée son PIN, la garde s'applique.

import prisma from "../lib/prisma.js";

export const FRAICHEUR_PIN_S = 5 * 60;

/** true si la session porte un code PIN vérifié il y a moins de 5 minutes. */
export function pinRecent(utilisateurSession) {
  const le = Number(utilisateurSession?.pin_le);
  return Number.isFinite(le) && le > 0 && Date.now() / 1000 - le <= FRAICHEUR_PIN_S;
}

export async function exigerPinRecent(req, res, next) {
  try {
    if (pinRecent(req.utilisateur)) return next();
    const compte = await prisma.utilisateur.findUnique({
      where: { utilisateur_id: req.utilisateur.utilisateur_id },
      select: { pin_hash: true },
    });
    if (!compte?.pin_hash) return next();
    return res.status(403).json({
      code: "PIN_REQUIS",
      message: "Confirmez cette opération avec votre code PIN.",
    });
  } catch (err) {
    return next(err);
  }
}
