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
let onTokenRefreshed = null; // injecté par AuthProvider

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
 * Permet à AuthProvider de s'abonner à l'obtention d'un nouvel access
 * token via tenterRefresh() — que ce refresh ait été déclenché
 * explicitement (restauration de session, refresh proactif planifié
 * côté AuthProvider) ou implicitement par le filet de sécurité réactif
 * d'apiFetch (retry sur 401, voir plus bas). Ainsi AuthProvider peut
 * reprogrammer son timer de refresh proactif à partir de CE token,
 * quel que soit le chemin par lequel il a été obtenu — sans ça, un
 * refresh déclenché uniquement par le filet réactif laissait le timer
 * proactif désynchronisé (toujours calé sur l'expiration de l'ancien
 * token plutôt que du nouveau).
 */
export function setTokenRefreshedHandler(handler) {
  onTokenRefreshed = handler;
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
    onTokenRefreshed?.(data.access_token);
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
  // Un FormData (upload multipart, ex. création/modification de centre
  // de santé avec fichiers) ne doit JAMAIS être passé à JSON.stringify
  // (il n'a pas de propriétés énumérables : on obtiendrait "{}", donc
  // tous les champs perdus) ni accompagné d'un Content-Type manuel — le
  // navigateur doit poser lui-même "multipart/form-data; boundary=...".
  // Pour tout le reste (objets JS classiques), on garde le comportement
  // JSON existant.
  const estFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const doFetch = (token) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(estFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : estFormData ? body : JSON.stringify(body),
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

/**
 * Variante de apiFetch dédiée aux téléversements de fichiers (FormData)
 * dont on veut suivre la progression (ex. upload d'un APK).
 *
 * `fetch()` ne donne aucun moyen fiable et multi-navigateurs de suivre
 * la progression d'un ENVOI (contrairement à la réception, via
 * ReadableStream) : on utilise donc XMLHttpRequest, seule API du
 * navigateur exposant `upload.onprogress`.
 *
 * Reprend les mêmes garanties que apiFetch :
 *  - Authorization: Bearer <access_token> ajouté automatiquement ;
 *  - cookies envoyés (xhr.withCredentials, équivalent de
 *    credentials: 'include') ;
 *  - sur 401, tente un refresh puis rejoue la requête une seule fois
 *    (sauf skipAuthRetry) ;
 *  - lève une Error (.status, .data) si la réponse finale n'est pas OK.
 *
 * @param {string} path - chemin relatif (ex. '/apks')
 * @param {Object} options
 * @param {'POST'|'PUT'|'PATCH'} [options.method='POST']
 * @param {FormData} options.body - corps multipart (obligatoire)
 * @param {Object} [options.headers] - en-têtes additionnels
 * @param {(pourcentage: number, evenement: ProgressEvent) => void} [options.onProgress]
 *   - appelé à chaque évènement de progression avec un pourcentage
 *   entier (0-100). N'est appelé que si `evenement.lengthComputable`
 *   est vrai (toujours le cas pour un FormData contenant un File).
 * @param {boolean} [options.skipAuthRetry=false]
 * @returns {Promise<any>} le corps JSON de la réponse
 */
export function apiFetchUpload(
  path,
  { method = 'POST', body, headers = {}, onProgress, skipAuthRetry = false } = {}
) {
  const estFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (!estFormData) {
    return Promise.reject(new Error('apiFetchUpload attend un FormData en body.'));
  }

  // Exécute une tentative de requête via XHR et résout avec un objet
  // { status, ok, data } — jamais un rejet pour un statut HTTP d'erreur,
  // afin de pouvoir décider ici (retry 401) comme le fait apiFetch.
  const executer = (token) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, `${API_BASE_URL}${path}`);
      xhr.withCredentials = true; // équivalent de credentials: 'include'

      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      Object.entries(headers).forEach(([cle, valeur]) => xhr.setRequestHeader(cle, valeur));

      if (xhr.upload && typeof onProgress === 'function') {
        xhr.upload.onprogress = (evenement) => {
          if (evenement.lengthComputable) {
            const pourcentage = Math.round((evenement.loaded / evenement.total) * 100);
            onProgress(pourcentage, evenement);
          }
        };
      }

      xhr.onload = () => {
        let data = null;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          // réponse sans corps JSON (ex: 204)
        }
        resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, data });
      };

      xhr.onerror = () => reject(new Error('Erreur réseau lors du téléversement.'));
      xhr.onabort = () => reject(new Error('Téléversement annulé.'));

      xhr.send(body);
    });

  return (async () => {
    let reponse = await executer(accessToken);

    if (reponse.status === 401 && !skipAuthRetry) {
      const nouveauToken = await tenterRefresh();
      if (nouveauToken) {
        reponse = await executer(nouveauToken);
      } else if (onUnauthorized) {
        onUnauthorized();
      }
    }

    if (!reponse.ok) {
      const error = new Error(reponse.data?.message || `Erreur ${reponse.status}`);
      error.status = reponse.status;
      error.data = reponse.data;
      throw error;
    }

    return reponse.data;
  })();
}

export { API_BASE_URL };