// src/services/compte.service.js
//
// Utilitaires de compte partagés entre l'authentification et les parcours
// qui créent un compte à la volée (réservation publicitaire sans compte) :
// validation de l'email et du mot de passe, sérialisation de l'utilisateur
// et ouverture d'une session complète (access token + refresh token en
// cookie httpOnly), exactement comme un login réussi.
import prisma from "../lib/prisma.js";
import { espaceParDefaut, listerEspaces } from "./espaces.service.js";
import {
  genererAccessToken,
  estClientMobile,
  genererRefreshToken,
  NOM_COOKIE_REFRESH_TOKEN,
  optionsCookieRefreshToken,
} from "../utils/token.utils.js";

export const SALT_ROUNDS = 10;
const MOT_DE_PASSE_LONGUEUR_MIN = 8;

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliserEmail(email) {
  return String(email).trim().toLowerCase();
}

/**
 * Validation serveur du mot de passe. Le champ minlength="8" côté
 * HTML n'est qu'une aide UX : sans ce contrôle serveur, n'importe quel
 * appel direct à l'API pouvait créer un compte avec un mot de passe
 * d'un seul caractère.
 */
export function validerMotDePasse(mot_de_passe) {
  if (typeof mot_de_passe !== "string" || mot_de_passe.length < MOT_DE_PASSE_LONGUEUR_MIN) {
    return `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_LONGUEUR_MIN} caractères.`;
  }
  return null;
}

/**
 * Retire les champs sensibles avant de renvoyer l'utilisateur au client,
 * et expose le rôle sous forme de libellé lisible plutôt que role_id.
 */
export function serialiserUtilisateur(utilisateur, espace = null) {
  const {
    mot_de_passe_hash, role_id, role,
    pin_hash, pin_echecs, pin_bloque_jusqu_au, pin_nb_blocages,
    ...reste
  } = utilisateur;
  return {
    ...reste,
    // Rôle de l'espace actif quand il y en a un (c'est lui que vérifient
    // les gardes), sinon le rôle principal du compte.
    role: espace?.role ?? role?.libelle ?? null,
    role_compte: role?.libelle ?? null,
    espace_actif: espace?.cle ?? null,
    // Connexion numéro + PIN : on dit seulement si un PIN existe.
    pin_defini: Boolean(pin_hash),
  };
}

/**
 * Ouvre une session complète pour `utilisateur` (chargé avec `role`) :
 * enregistre le refresh token hashé, le pose en cookie httpOnly et
 * renvoie l'access token à transmettre dans le corps de la réponse.
 */
export async function ouvrirSession(req, res, utilisateur, options = {}) {
  return (await ouvrirSessionEspace(req, res, utilisateur, options)).accessToken;
}

/**
 * Comme ouvrirSession, en précisant l'espace ouvert (par défaut : dernier
 * utilisé, sinon celui du rôle principal) et si un code PIN vient d'être
 * vérifié (`pinVerifie`, pour les actions sensibles).
 * @returns {Promise<{ accessToken: string, espace: object|null, espaces: object[] }>}
 */
export async function ouvrirSessionEspace(req, res, utilisateur, { espace, pinVerifie = false } = {}) {
  const espaces = await listerEspaces(utilisateur.utilisateur_id);
  const actif = espace === undefined ? espaceParDefaut(espaces, utilisateur.role.libelle) : espace;

  // Le token porte le libellé du rôle de l'espace actif (ex: "patient",
  // "agent_pharmacie"), pas l'UUID role_id, pour rester exploitable par
  // les middlewares d'autorisation existants.
  const { token: accessToken } = genererAccessToken({
    ...utilisateur,
    role: actif?.role ?? utilisateur.role.libelle,
    espace: actif?.cle ?? null,
    pin_le: pinVerifie ? Math.floor(Date.now() / 1000) : null,
  });
  const { token: refreshToken, token_hash, date_expiration } = genererRefreshToken({ mobile: estClientMobile(req) });

  await prisma.refreshToken.create({
    data: {
      utilisateur_id: utilisateur.utilisateur_id,
      token_hash,
      date_expiration,
      user_agent: req.headers["user-agent"]?.slice(0, 255),
      ip_creation: req.ip,
      statut: "actif",
      espace: actif?.cle ?? null,
    },
  });

  res.cookie(NOM_COOKIE_REFRESH_TOKEN, refreshToken, optionsCookieRefreshToken(date_expiration));
  return { accessToken, espace: actif, espaces };
}
