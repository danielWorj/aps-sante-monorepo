// src/utils/token.utils.js
// Génération/validation des access tokens JWT (stateless, signés en
// RS256/ES256 via une paire de clés asymétriques) et gestion des
// refresh tokens opaques (stockés hashés côté serveur).

import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const ACCESS_TOKEN_ALGORITHM = process.env.JWT_ACCESS_ALGORITHM || "ES256";
const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
const REFRESH_TOKEN_EXPIRES_IN_MS =
  Number(process.env.REFRESH_TOKEN_EXPIRES_IN_MS) || 30 * 24 * 60 * 60 * 1000; // 30 jours

// ─── Cookie httpOnly du refresh token ─────────────────────────
// Le refresh token n'est plus jamais renvoyé dans le corps JSON : il
// est posé par le serveur dans un cookie httpOnly, illisible en
// JavaScript côté navigateur (protection XSS). `path` restreint le
// cookie aux routes /api/auth (il n'a rien à faire ailleurs), ce qui
// limite aussi sa portée en cas de fuite.
export const NOM_COOKIE_REFRESH_TOKEN = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/auth";

/**
 * Options du cookie httpOnly portant le refresh token.
 * - httpOnly : invisible pour document.cookie / localStorage (anti-XSS).
 * - secure   : cookie envoyé uniquement en HTTPS (désactivé en dev pour
 *              ne pas bloquer le travail en http://localhost).
 * - sameSite : "lax" suffit pour un front et une API sur le même site
 *              (même eTLD+1, ex. app.aps.com / api.aps.com, ou
 *              localhost:5173 / localhost:3000) et protège contre le
 *              CSRF sur les requêtes cross-site. Si un jour le front
 *              est servi depuis un domaine totalement différent, il
 *              faudra passer à "none" + secure obligatoire.
 */
export function optionsCookieRefreshToken(date_expiration) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    expires: date_expiration,
  };
}

/**
 * Options utilisées pour effacer le cookie à la déconnexion : doivent
 * être strictement identiques (hors expires/maxAge) à celles utilisées
 * pour le poser, sinon le navigateur ne le reconnaît pas et ne le
 * supprime pas.
 */
export function optionsClearCookieRefreshToken() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
  };
}

const ALGORITHMES_VALIDES = ["RS256", "ES256"];
if (!ALGORITHMES_VALIDES.includes(ACCESS_TOKEN_ALGORITHM)) {
  throw new Error(
    `JWT_ACCESS_ALGORITHM invalide : "${ACCESS_TOKEN_ALGORITHM}". Valeurs acceptées : ${ALGORITHMES_VALIDES.join(
      ", "
    )}.`
  );
}

/**
 * Charge une clé PEM soit depuis un chemin de fichier
 * (JWT_ACCESS_PRIVATE_KEY_PATH / JWT_ACCESS_PUBLIC_KEY_PATH), soit
 * directement depuis une variable d'environnement contenant le PEM
 * inline (JWT_ACCESS_PRIVATE_KEY / JWT_ACCESS_PUBLIC_KEY, avec les
 * sauts de ligne échappés en "\n").
 */
function chargerCle(nomVarChemin, nomVarInline) {
  const chemin = process.env[nomVarChemin];
  if (chemin) {
    return fs.readFileSync(path.resolve(chemin), "utf8");
  }

  const inline = process.env[nomVarInline];
  if (inline) {
    return inline.replace(/\\n/g, "\n");
  }

  return null;
}

const ACCESS_TOKEN_PRIVATE_KEY = chargerCle(
  "JWT_ACCESS_PRIVATE_KEY_PATH",
  "JWT_ACCESS_PRIVATE_KEY"
);
const ACCESS_TOKEN_PUBLIC_KEY = chargerCle(
  "JWT_ACCESS_PUBLIC_KEY_PATH",
  "JWT_ACCESS_PUBLIC_KEY"
);

if (!ACCESS_TOKEN_PRIVATE_KEY || !ACCESS_TOKEN_PUBLIC_KEY) {
  // On échoue au démarrage plutôt que de laisser l'application tourner
  // dans un état cassé qui ne se révèlerait qu'au premier login.
  throw new Error(
    "Clé privée/publique JWT manquante. Définissez JWT_ACCESS_PRIVATE_KEY_PATH " +
      "et JWT_ACCESS_PUBLIC_KEY_PATH (ou leurs équivalents inline) dans les variables d'environnement."
  );
}

/**
 * Génère un access token JWT signé (RS256/ES256), avec un identifiant
 * unique (jti) permettant de le révoquer via la table jeton_revoque.
 */
export function genererAccessToken(utilisateur) {
  const jti = crypto.randomUUID();

  const token = jwt.sign(
    {
      sub: utilisateur.utilisateur_id,
      role: utilisateur.role,
      pays_id: utilisateur.pays_id,
      jti,
    },
    ACCESS_TOKEN_PRIVATE_KEY,
    { algorithm: ACCESS_TOKEN_ALGORITHM, expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );

  const decoded = jwt.decode(token);

  return {
    token,
    jti,
    date_expiration: new Date(decoded.exp * 1000),
  };
}

/**
 * Vérifie et décode un access token. Lève une erreur si invalide/expiré.
 * L'algorithme est explicitement restreint pour éviter toute attaque
 * par confusion d'algorithme (ex : un token signé en HS256 avec la clé
 * publique comme "secret" ne doit jamais être accepté).
 */
export function verifierAccessToken(token) {
  return jwt.verify(token, ACCESS_TOKEN_PUBLIC_KEY, {
    algorithms: [ACCESS_TOKEN_ALGORITHM],
  });
}

// ─── Token restreint : changement de mot de passe temporaire ─────
// Émis à la place d'une session complète lorsque `connecter()` détecte
// un compte avec mot_de_passe_temporaire=true. Signé avec la même
// paire de clés que l'access token classique (même vérificateur,
// verifierAccessToken), mais porte un claim `scope` dédié et n'a NI
// `role` NI `pays_id` : il est structurellement incapable de passer
// autoriser("...") et le middleware `authentifier` le rejette
// explicitement pour toute route standard (voir auth.middleware.js).
// Il ne donne accès qu'à POST /auth/changer-mot-de-passe-initial, via
// le middleware dédié `exigerTokenChangementMotDePasse`.
export const SCOPE_CHANGEMENT_MOT_DE_PASSE = "changement_mot_de_passe_oblige";

const CHANGEMENT_MOT_DE_PASSE_TOKEN_EXPIRES_IN =
  process.env.JWT_CHANGEMENT_MDP_EXPIRES_IN || "15m";

/**
 * Génère le token restreint remis à la place d'une session lorsque
 * l'utilisateur se connecte avec un mot de passe temporaire. Sa durée
 * de vie courte (15 min par défaut) est indépendante de la deadline
 * fonctionnelle des 24h portée par `utilisateur.mot_de_passe_expire_le` :
 * cette dernière autorise la reconnexion pour obtenir un nouveau token
 * de ce type pendant 24h, tandis que chaque token individuel expire
 * bien plus vite pour limiter la fenêtre d'exploitation en cas de fuite.
 */
export function genererTokenChangementMotDePasse(utilisateur) {
  const jti = crypto.randomUUID();

  const token = jwt.sign(
    {
      sub: utilisateur.utilisateur_id,
      scope: SCOPE_CHANGEMENT_MOT_DE_PASSE,
      jti,
    },
    ACCESS_TOKEN_PRIVATE_KEY,
    {
      algorithm: ACCESS_TOKEN_ALGORITHM,
      expiresIn: CHANGEMENT_MOT_DE_PASSE_TOKEN_EXPIRES_IN,
    }
  );

  const decoded = jwt.decode(token);

  return {
    token,
    jti,
    date_expiration: new Date(decoded.exp * 1000),
  };
}

/**
 * Génère un refresh token opaque (aléatoire) ainsi que son hash SHA-256,
 * qui seul est persisté en base (le token en clair n'est jamais stocké).
 */
export function genererRefreshToken() {
  const token = crypto.randomBytes(64).toString("hex");
  const token_hash = hasherToken(token);
  const date_expiration = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN_MS);

  return { token, token_hash, date_expiration };
}

export function hasherToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}