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
  // Espaces du compte (patient, médecin, structure gérée, publicités…),
  // le dernier utilisé en premier. Voir « Choisir mon espace ».
  const [espaces, setEspaces] = useState([]);
  // Vrai après « Se déconnecter » (et jusqu'à la prochaine connexion) :
  // RequireAuth ne mémorise alors pas la page quittée comme page de retour,
  // sinon le compte suivant serait renvoyé vers l'espace du précédent.
  const [deconnexionVolontaire, setDeconnexionVolontaire] = useState(false);

  // Restauration de session au premier montage de l'app.
  useEffect(() => {
    let annule = false;

    async function restaurerSession() {
      try {
        const { access_token } = await authService.rafraichirToken();
        setAccessToken(access_token);
        const utilisateur = await authService.obtenirProfilCourant();
        const listeEspaces = await authService.listerEspaces().catch(() => []);
        if (annule) return;
        setUser(utilisateur);
        setEspaces(listeEspaces);
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
      setEspaces([]);
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
   *
   * ⚠️ Deux formes de réponse possibles (voir authService.connecter) :
   *  - session normale : { access_token, utilisateur } — la session
   *    locale est ouverte ici.
   *  - mot de passe temporaire détecté par le serveur :
   *    { mot_de_passe_a_changer: true, token_changement_mot_de_passe,
   *      ... } — AUCUNE session n'est ouverte (pas d'access_token ni
   *      d'utilisateur dans ce cas). On renvoie la réponse telle
   *      quelle sans toucher à `user`/`status`, à charge pour
   *      l'appelant (écran de login) de rediriger vers le changement
   *      de mot de passe forcé avec le token restreint.
   */
  const connecter = useCallback(async (email, mot_de_passe) => {
    const data = await authService.connecter(email, mot_de_passe);

    if (data?.mot_de_passe_a_changer) {
      return data;
    }

    setAccessToken(data.access_token);
    setUser(data.utilisateur);
    setEspaces(data.espaces ?? []);
    setStatus('authenticated');
    setDeconnexionVolontaire(false);
    return data;
  }, []);

  /**
   * POST /auth/login-pin : connexion numéro + code PIN. Même contrat que
   * connecter() : avec un PIN provisoire (pin_a_changer: true), aucune
   * session n'est ouverte et la réponse est renvoyée telle quelle.
   */
  const connecterParPin = useCallback(async (telephone, pays_iso2, pin) => {
    const data = await authService.connecterParPin(telephone, pays_iso2, pin);
    if (data?.pin_a_changer) return data;
    setAccessToken(data.access_token);
    setUser(data.utilisateur);
    setEspaces(data.espaces ?? []);
    setStatus('authenticated');
    setDeconnexionVolontaire(false);
    return data;
  }, []);

  /** POST /auth/changer-pin-initial : remplace le PIN provisoire et ouvre la session. */
  const changerPinInitial = useCallback(async (tokenChangementPin, nouveauPin) => {
    const data = await authService.changerPinInitial(tokenChangementPin, nouveauPin);
    setAccessToken(data.access_token);
    setUser(data.utilisateur);
    setEspaces(data.espaces ?? []);
    setStatus('authenticated');
    setDeconnexionVolontaire(false);
    return data;
  }, []);

  /** POST /auth/pin : choisir (ou changer) son numéro de connexion et son PIN. */
  const definirPin = useCallback(async (donnees) => {
    const data = await authService.definirPin(donnees);
    setUser(data.utilisateur);
    return data;
  }, []);

  /**
   * Ouvre l'espace choisi : le serveur émet une nouvelle session sur cet
   * espace (rôle de l'espace). Pour un espace professionnel, le code PIN
   * peut être demandé (GardePin, géré par apiClient).
   */
  const choisirEspace = useCallback(async (cle) => {
    const data = await authService.choisirEspace(cle);
    setAccessToken(data.access_token);
    setUser(data.utilisateur);
    setEspaces(data.espaces ?? []);
    return data.espace;
  }, []);

  /** Recharge la liste des espaces (ex. après la création d'une fiche). */
  const rafraichirEspaces = useCallback(async () => {
    const liste = await authService.listerEspaces().catch(() => null);
    if (liste) setEspaces(liste);
    return liste;
  }, []);

  /**
   * POST /auth/changer-mot-de-passe-initial : à appeler juste après un
   * connecter() ayant renvoyé mot_de_passe_a_changer: true, avec le
   * token restreint reçu à ce moment-là (PAS l'access token de
   * session, il n'y en a pas encore). En cas de succès, ouvre une
   * session complète exactement comme connecter() — on met donc à jour
   * l'état local de la même façon.
   */
  const changerMotDePasseInitial = useCallback(
    async (tokenChangementMotDePasse, nouveauMotDePasse) => {
      const { access_token, utilisateur } = await authService.changerMotDePasseInitial(
        tokenChangementMotDePasse,
        nouveauMotDePasse
      );
      setAccessToken(access_token);
      setUser(utilisateur);
      setEspaces(await authService.listerEspaces().catch(() => []));
      setStatus('authenticated');
      setDeconnexionVolontaire(false);
      return utilisateur;
    },
    []
  );

  /**
   * Adopte une session ouverte par le serveur hors du login (ex.
   * réservation publicitaire avec création de compte) : la réponse porte
   * déjà access_token + utilisateur, le refresh token est en cookie.
   */
  const ouvrirSession = useCallback(({ access_token, utilisateur }) => {
    setAccessToken(access_token);
    setUser(utilisateur);
    setStatus('authenticated');
    setDeconnexionVolontaire(false);
    authService.listerEspaces().then(setEspaces).catch(() => {});
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
      setEspaces([]);
      setDeconnexionVolontaire(true);
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
      espaces,
      isAuthenticated: status === 'authenticated',
      deconnexionVolontaire,
      connecter,
      connecterParPin,
      changerMotDePasseInitial,
      changerPinInitial,
      definirPin,
      choisirEspace,
      rafraichirEspaces,
      ouvrirSession,
      deconnecter,
      rafraichirUtilisateur,
    }),
    [user, status, espaces, deconnexionVolontaire, connecter, connecterParPin, changerMotDePasseInitial, changerPinInitial, definirPin,
      choisirEspace, rafraichirEspaces, ouvrirSession, deconnecter, rafraichirUtilisateur]
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