// src/middlewares/limiteurCampay.js
// Limiteur anti-spam des demandes de paiement Mobile Money : chaque appel
// déclenche une demande USSD sur le téléphone du payeur. Partagé par le
// paiement des RDV et des abonnements assurance (extrait de
// paiement.routes.js sans changement de comportement).
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export const limiteurCampay = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  // Compteur par utilisateur authentifié (le limiteur est placé après
  // `authentifier`), avec repli sur l'IP : évite qu'un patient en
  // bloque un autre derrière le même NAT / réseau mobile.
  keyGenerator: (req) => req.utilisateur?.utilisateur_id ?? ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives de paiement, réessayez dans quelques minutes." },
});
