// src/context/AuthContext.jsx (VERSION COMPLÈTE)
//
// Source de vérité unique pour l'état d'authentification côté front.
// Expose `useAuth()` : { user, status, isAuthenticated, login, logout }.
//
// Objet `user` retourné par `/auth/me` :
// {
//   utilisateur_id: "uuid",
//   prenom: "Yves",              ← utilisé par Dashboard
//   nom: "Michel",
//   email: "yves.michel@aps.cm",
//   avatar: "https://...",
//   role: {
//     role_id: "uuid",
//     nom: "admin",              ← nom technique (admin, superadmin, moderateur)
//     libelle: "Administrateur"
//   },
//   droits: ["read:users", "write:validations", ...],
//   derniere_connexion: "2026-07-03T14:22:00Z",
//   compte_actif: true
// }
//
// `status` :
//  - 'loading'         → vérification de session en cours (montage de l'app).
//                        Ne JAMAIS rediriger vers /login dans cet état.
//  - 'authenticated'   → session valide, `user` renseigné.
//  - 'unauthenticated' → pas de session → rediriger vers /login.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  apiFetch,
  setAccessToken,
  setUnauthorizedHandler,
  tenterRefresh,
} from '../lib/apiClient';
import { estAdministrateur, MESSAGE_ACCES_REFUSE } from '../utils/roles';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  // Déconnexion locale complète
  const deconnecterLocalement = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
    setError(null);
  }, []);

  // Gestionnaire global des 401 (session expirée)
  useEffect(() => {
    setUnauthorizedHandler(deconnecterLocalement);
  }, [deconnecterLocalement]);

  // ===================== RESTAURATION DE SESSION ======================
  // Au montage de l'app : tenter de restaurer la session avec le refresh token.
  // Le refresh token est stocké en cookie httpOnly (invisible en JS, envoyé auto).
  useEffect(() => {
    let annule = false;

    (async () => {
      try {
        // Essayer de rafraîchir le token avec le refresh token en cookie
        const token = await tenterRefresh();
        if (annule) return;

        if (!token) {
          // Pas de refresh token valide → session expiée
          setStatus('unauthenticated');
          return;
        }

        // Token restauré → récupérer le profil complet
        try {
          const data = await apiFetch('/auth/me');
          if (annule) return;

          // Session valide mais pas administrateur (ex. patient connecté
          // sur la plateforme) : on ne l'adopte pas. Pas d'appel à
          // /auth/logout : cela fermerait aussi sa session sur la
          // plateforme publique.
          if (!estAdministrateur(data.utilisateur)) {
            setAccessToken(null);
            setUser(null);
            setStatus('unauthenticated');
            return;
          }

          setUser(data.utilisateur);
          setStatus('authenticated');
          setError(null);
        } catch (err) {
          // Profil impossible à récupérer → déconnecter
          if (!annule) {
            setError(
              err.message || 'Impossible de récupérer le profil utilisateur'
            );
            deconnecterLocalement();
          }
        }
      } catch (err) {
        if (!annule) {
          console.error('Erreur restauration session :', err);
          setStatus('unauthenticated');
        }
      }
    })();

    return () => {
      annule = true;
    };
  }, [deconnecterLocalement]);

  // Adopte la session renvoyée par /auth/login ou par le changement de
  // mot de passe initial — seulement pour un compte administrateur.
  const adopterSession = useCallback(async (data) => {
    if (!estAdministrateur(data.utilisateur)) {
      // La session vient d'être ouverte côté serveur pour ce compte non
      // administrateur : on la révoque aussitôt.
      setAccessToken(data.access_token);
      try {
        await apiFetch('/auth/logout', { method: 'POST', skipAuthRetry: true });
      } catch {
        // Révocation au mieux : l'accès reste refusé localement.
      }
      setAccessToken(null);
      throw Object.assign(new Error(MESSAGE_ACCES_REFUSE), {
        status: 403,
        data: { message: MESSAGE_ACCES_REFUSE },
      });
    }

    setAccessToken(data.access_token);
    // Le login ne renvoie pas le pays : /auth/me le fournit (périmètre affiché).
    let utilisateur = data.utilisateur;
    try {
      const moi = await apiFetch('/auth/me', { skipAuthRetry: true });
      if (moi?.utilisateur) utilisateur = moi.utilisateur;
    } catch {
      // Profil enrichi indisponible : on garde celui du login.
    }
    setUser(utilisateur);
    setStatus('authenticated');
    return utilisateur;
  }, []);

  // ===================== LOGIN ======================
  const login = useCallback(async (email, mot_de_passe) => {
    setError(null);

    try {
      // skipAuthRetry: un 401 au login n'est pas une expiration,
      // c'est des identifiants invalides — ne pas retry le refresh.
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: { email, mot_de_passe },
        skipAuthRetry: true,
      });

      // Mot de passe temporaire (compte créé ou réinitialisé par un
      // superadmin) : le serveur n'ouvre pas de session mais renvoie un
      // token restreint, consommé par changerMotDePasseInitial.
      if (data?.mot_de_passe_a_changer) {
        throw Object.assign(new Error('Changement de mot de passe requis'), {
          code: 'MOT_DE_PASSE_A_CHANGER',
          token: data.token_changement_mot_de_passe,
          data: { message: 'Votre mot de passe est temporaire : choisissez-en un nouveau pour continuer.' },
        });
      }

      return await adopterSession(data);
    } catch (err) {
      const message = err.data?.message || err.message || 'Connexion échouée';
      setError(message);
      throw err;
    }
  }, [adopterSession]);

  // Remplace le mot de passe temporaire puis ouvre la session.
  const changerMotDePasseInitial = useCallback(async (token, nouveau_mot_de_passe) => {
    const data = await apiFetch('/auth/changer-mot-de-passe-initial', {
      method: 'POST',
      body: { nouveau_mot_de_passe },
      headers: { Authorization: `Bearer ${token}` },
      skipAuthRetry: true,
    });
    return adopterSession(data);
  }, [adopterSession]);

  // ===================== LOGOUT ======================
  const logout = useCallback(async () => {
    try {
      // Notifier le serveur de la déconnexion (optionnel)
      await apiFetch('/auth/logout', {
        method: 'POST',
        skipAuthRetry: true,
      });
    } catch (err) {
      // Même si l'appel serveur échoue, on nettoie l'état local.
      // L'utilisateur doit pouvoir se déconnecter côté UI de toute façon.
      console.warn('Erreur logout serveur :', err);
    } finally {
      deconnecterLocalement();
    }
  }, [deconnecterLocalement]);

  // ===================== VALUE MÉMOÏSÉE ======================
  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      error,
      login,
      logout,
      changerMotDePasseInitial,
    }),
    [user, status, error, login, logout, changerMotDePasseInitial]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

// ===================== HOOK D'UTILISATION ======================
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error(
      'useAuth() doit être appelé à l\'intérieur d\'un <AuthProvider>.'
    );
  }
  return ctx;
}

// ===================== HELPER : EXTRAIRE LE NOM DE RÔLE ======================
// Utile pour les composants qui ont besoin de vérifier les droits
// sans dépendre d'une structure exacte de `user.role`.
export function extraireNomRole(user) {
  if (!user || typeof user !== 'object') return null;

  const candidats = [
    user.role?.nom,              // Structure complète
    user.role_nom,               // Format plat
    user.type_compte,            // Alternative
    typeof user.role === 'string' ? user.role : null,
  ];

  for (const candidat of candidats) {
    if (typeof candidat === 'string' && candidat.trim()) {
      return candidat.trim().toLowerCase();
    }
  }

  return null;
}

// ===================== HELPER : VÉRIFIER UN DROIT ======================
export function aLeDroit(user, droit) {
  if (!user || !Array.isArray(user.droits)) return false;
  return user.droits.includes(droit);
}

// ===================== HELPER : VÉRIFIER LE RÔLE ======================
export function estRole(user, ...roles) {
  const nomRole = extraireNomRole(user);
  return nomRole && roles.map((r) => r.toLowerCase()).includes(nomRole);
}

// ===================== EXEMPLE D'UTILISATION DANS UN COMPOSANT ======================
/*
import { useAuth, extraireNomRole, estRole } from '../context/AuthContext';

export default function MonComposant() {
  const { user, status, isAuthenticated, login, logout } = useAuth();

  // Afficher le prénom
  const prenom = user?.prenom || 'Utilisateur';

  // Vérifier le rôle
  const estAdmin = estRole(user, 'admin', 'superadmin');

  // Vérifier un droit spécifique
  const peutValider = user?.droits?.includes('write:validations');

  return (
    <>
      <h1>Bienvenue, {prenom}</h1>
      {estAdmin && <p>Vous êtes administrateur</p>}
      {peutValider && <button>Valider</button>}
    </>
  );
}
*/