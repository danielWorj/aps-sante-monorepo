// src/context/AuthContext.jsx
//
// Source de vérité unique pour l'état d'authentification côté front.
// Expose `useAuth()` : { user, status, isAuthenticated, login, logout }.
//
// `status` :
//  - 'loading'         → vérification de session en cours (montage de
//                         l'app / rechargement de page). Ne JAMAIS
//                         rediriger vers /login tant qu'on est dans cet
//                         état, sous peine de déconnecter à tort un
//                         utilisateur dont la session est valide.
//  - 'authenticated'   → session valide, `user` renseigné.
//  - 'unauthenticated' → pas de session (ou expirée/révoquée) → les
//                         routes privées redirigent vers /login.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, setAccessToken, setUnauthorizedHandler, tenterRefresh } from '../lib/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  const deconnecterLocalement = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  // apiClient invoque ce handler si un 401 survient et que le refresh
  // silencieux échoue également (session définitivement expirée).
  useEffect(() => {
    setUnauthorizedHandler(deconnecterLocalement);
  }, [deconnecterLocalement]);

  // Restauration de session au montage de l'application : le refresh
  // token (cookie httpOnly, invisible en JS) est envoyé automatiquement
  // par le navigateur. S'il est valide, on récupère un access token
  // puis le profil courant. Aucune redirection ici : RequireAuth se
  // charge d'agir une fois `status` stabilisé.
  useEffect(() => {
    let annule = false;

    (async () => {
      const token = await tenterRefresh();
      if (annule) return;

      if (!token) {
        setStatus('unauthenticated');
        return;
      }

      try {
        const data = await apiFetch('/auth/me');
        if (annule) return;
        setUser(data.utilisateur);
        setStatus('authenticated');
      } catch {
        if (!annule) deconnecterLocalement();
      }
    })();

    return () => {
      annule = true;
    };
  }, [deconnecterLocalement]);

  const login = useCallback(async (email, mot_de_passe) => {
    // skipAuthRetry: une tentative de login échouée (401 identifiants
    // invalides) ne doit jamais déclencher un refresh — ce n'est pas
    // un token expiré, ce sont des identifiants faux.
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email, mot_de_passe },
      skipAuthRetry: true,
    });
    setAccessToken(data.access_token);
    setUser(data.utilisateur);
    setStatus('authenticated');
    return data.utilisateur;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST', skipAuthRetry: true });
    } catch {
      // Même si l'appel serveur échoue (réseau, etc.), on nettoie
      // quand même l'état local : l'utilisateur doit pouvoir se
      // déconnecter côté UI dans tous les cas.
    } finally {
      deconnecterLocalement();
    }
  }, [deconnecterLocalement]);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      login,
      logout,
    }),
    [user, status, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() doit être appelé à l\'intérieur d\'un <AuthProvider>.');
  }
  return ctx;
}