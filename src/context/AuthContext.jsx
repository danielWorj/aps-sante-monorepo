// src/context/AuthContext.jsx
//
// Contexte React qui garde en mémoire la session courante (utilisateur
// + statut) et expose les actions d'authentification (connecter,
// déconnecter, rafraîchir) à tout composant via useAuth(). Bâti
// entièrement sur authService.js (donc sur apiFetch/apiClient.js en
// dessous) — ce fichier n'appelle jamais fetch() directement.
//
// ⚠️ src/lib/apiClient.js n'a pas été fourni pour cette tâche. Ce
// fichier suppose qu'il exporte, en plus de `apiFetch` (déjà utilisé
// par authService.js) :
//   - setAccessToken(token)          : place l'access token en mémoire
//     pour les appels suivants (Authorization: Bearer …). On suppose
//     que `setAccessToken(null)` l'efface (déconnexion).
//   - setUnauthorizedHandler(fn)     : enregistre un callback appelé
//     par apiFetch quand un 401 survient et que le refresh silencieux
//     échoue aussi (session vraiment terminée, ex. refresh token
//     expiré/révoqué) — permet de resynchroniser l'état ici sans que
//     chaque service ait à s'en soucier.
// Si les noms réels diffèrent, seule la ligne d'import ci-dessous et
// les deux endroits qui les appellent sont à ajuster — le reste du
// fichier (état, actions exposées) n'a pas besoin de changer.
//
// Pourquoi un rafraîchissement au montage (restaurerSession) : l'access
// token ne vit qu'en mémoire (apiClient.js), donc il est perdu à
// chaque rechargement de page. Seul le refresh token (cookie httpOnly,
// posé par POST /auth/login) survit. authService.rafraichirToken() est
// explicitement documenté pour cet usage ("rafraîchissement explicite,
// ex. restauration de session au chargement de l'app").

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setAccessToken, setUnauthorizedHandler } from '../lib/apiClient';
import authService from '../services/authService';

const AuthContext = createContext(undefined);

/**
 * `status` :
 *   - 'loading'        : restauration de session en cours (au montage).
 *   - 'authenticated'   : utilisateur connu et connecté (`user` rempli).
 *   - 'unauthenticated' : personne connecté (`user` vaut null).
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  // Restauration de session au premier montage de l'app.
  useEffect(() => {
    let annule = false;

    async function restaurerSession() {
      try {
        const { access_token } = await authService.rafraichirToken();
        setAccessToken(access_token);
        const utilisateur = await authService.obtenirProfilCourant();
        if (annule) return;
        setUser(utilisateur);
        setStatus('authenticated');
      } catch {
        // Pas de session valide (jamais connecté, refresh token
        // absent/expiré/révoqué) : état de départ normal, pas une
        // erreur à afficher.
        if (annule) return;
        setAccessToken(null);
        setUser(null);
        setStatus('unauthenticated');
      }
    }

    restaurerSession();
    return () => {
      annule = true;
    };
  }, []);

  // Déconnexion forcée déclenchée depuis apiClient.js (401 non résolu
  // même après tentative de refresh silencieux, à tout moment de la
  // session) : on aligne l'état local. Pas de nouvel appel à
  // /auth/logout ici, la session est déjà invalide côté serveur.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAccessToken(null);
      setUser(null);
      setStatus('unauthenticated');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  /**
   * POST /auth/login puis mise à jour de la session locale. À utiliser
   * pour un formulaire de connexion classique, mais aussi juste après
   * une inscription (authService.inscrirePatient ne renvoie pas de
   * session à elle seule — voir ProfilMedecin.jsx pour un exemple
   * d'enchaînement inscription -> connecter).
   */
  const connecter = useCallback(async (email, mot_de_passe) => {
    const { access_token, utilisateur } = await authService.connecter(email, mot_de_passe);
    setAccessToken(access_token);
    setUser(utilisateur);
    setStatus('authenticated');
    return utilisateur;
  }, []);

  /**
   * POST /auth/logout puis nettoyage de la session locale, même si
   * l'appel réseau échoue (mieux vaut désynchroniser localement que
   * laisser l'utilisateur "connecté" côté UI alors que l'appel a
   * échoué pour une raison quelconque).
   */
  const deconnecter = useCallback(async () => {
    try {
      await authService.deconnecter();
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  /**
   * Recharge l'utilisateur courant depuis GET /auth/me sans toucher au
   * statut d'authentification — utile après une modification de
   * profil ailleurs dans l'app pour resynchroniser `user`.
   */
  const rafraichirUtilisateur = useCallback(async () => {
    const utilisateur = await authService.obtenirProfilCourant();
    setUser(utilisateur);
    return utilisateur;
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      connecter,
      deconnecter,
      rafraichirUtilisateur,
    }),
    [user, status, connecter, deconnecter, rafraichirUtilisateur]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook d'accès au contexte d'authentification. Lève une erreur
 * explicite si utilisé hors d'un <AuthProvider> — plus facile à
 * diagnostiquer qu'un `user` silencieusement undefined.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth() doit être utilisé à l\'intérieur d\'un <AuthProvider>.');
  }
  return ctx;
}

export default AuthContext;