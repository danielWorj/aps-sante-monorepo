// src/lib/apiClient.js
//
// Client HTTP centralisé pour communiquer avec l'API back-office APS.
//
// Répartition des tokens (cf. src/utils/token.utils.js côté serveur) :
//  - le REFRESH TOKEN vit uniquement dans un cookie httpOnly posé par
//    le serveur (voir optionsCookieRefreshToken). On ne le lit ni ne
//    le manipule jamais en JS ici : `credentials: 'include'` suffit à
//    ce qu'il voyage automatiquement avec chaque requête vers
//    /api/auth/*.
//  - l'ACCESS TOKEN, lui, ne doit JAMAIS être persisté (localStorage /
//    sessionStorage l'exposerait au vol par XSS). Il vit uniquement en
//    mémoire JS, le temps de vie de l'onglet. Il est donc perdu à
//    chaque rechargement de page — c'est voulu : on le régénère au
//    démarrage via /api/auth/refresh (voir AuthContext.jsx).
//
// Stratégie 401 : un appel protégé qui échoue en 401 (access token
// expiré, courant après 15 min) déclenche UNE tentative de refresh
// silencieux puis rejoue la requête d'origine. Si le refresh échoue
// aussi (refresh token expiré/révoqué), l'appelant reçoit l'erreur et
// `onUnauthorized` est invoqué pour déconnecter proprement l'UI.

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

let accessToken = null;
let onUnauthorized = null; // injecté par AuthProvider

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

/** Permet à AuthProvider de s'abonner à une déconnexion forcée (401 non récupérable). */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

/**
 * Appelle POST /api/auth/refresh (cookie httpOnly envoyé
 * automatiquement) pour obtenir un nouvel access token.
 * Retourne le nouveau token, ou null si aucune session valide.
 */
export async function tenterRefresh() {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    setAccessToken(data.access_token);
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Wrapper autour de fetch() :
 *  - sérialise `body` en JSON et pose les bons en-têtes ;
 *  - ajoute automatiquement `Authorization: Bearer <access_token>` ;
 *  - envoie les cookies (`credentials: 'include'`) ;
 *  - sur 401, tente un refresh puis rejoue la requête une seule fois
 *    (sauf si `skipAuthRetry: true`, utilisé pour login/logout/refresh
 *    eux-mêmes afin d'éviter toute boucle).
 *
 * Lève une Error (avec `.status` et `.data`) si la réponse finale n'est
 * pas OK, pour un traitement simple par les appelants (try/catch).
 */
export async function apiFetch(path, { body, headers, skipAuthRetry = false, ...options } = {}) {
  const doFetch = (token) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch(accessToken);

  if (res.status === 401 && !skipAuthRetry) {
    const nouveauToken = await tenterRefresh();
    if (nouveauToken) {
      res = await doFetch(nouveauToken);
    } else if (onUnauthorized) {
      onUnauthorized();
    }
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // réponse sans corps JSON (ex: 204)
  }

  if (!res.ok) {
    const error = new Error(data?.message || `Erreur ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export { API_BASE_URL };