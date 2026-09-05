// lib/controllers/authentification_controller.dart
//
// Gestion d'état (Riverpod) du module "authentification", en miroir de
// authentification_repository.dart (voir son en-tête, notamment la
// section sur le refresh token en cookie httpOnly) et de
// authentification_models.dart.
//
// ─────────────────────────────────────────────────────────────────
// Rôle particulier de ce fichier
// ─────────────────────────────────────────────────────────────────
// Contrairement à medecin_controller.dart / rendez_vous_controller.dart,
// qui *reçoivent* un token en paramètre en renvoyant vers "un
// AuthController / authTokenProvider global déjà présent ailleurs dans
// l'app", CE fichier EST cet AuthController. [SessionController] est
// la source de vérité unique de la session utilisateur ; les autres
// modules sont censés lire [authTokenProvider] /
// [authUtilisateurProvider] plutôt que de gérer leur propre état de
// connexion.
//
// Règle du token (identique à ApiClient / AuthentificationRepository) :
//   - le refresh token n'est JAMAIS manipulé ici : il voyage
//     uniquement via le cookie httpOnly posé par le serveur (voir
//     l'en-tête du repository). Aucune méthode de ce fichier ne prend
//     ni ne renvoie de refresh token.
//   - l'access token est gardé en mémoire (état d'[AsyncNotifier]) et
//     dupliqué dans [FlutterSecureStorage] pour survivre à un
//     redémarrage de l'app — jamais dans SharedPreferences en clair.
//     Si `flutter_secure_storage` n'est pas souhaité dans le projet,
//     supprimer [_StockageSession] et se contenter de l'état mémoire
//     (perte de session au redémarrage).
//
// ⚠️ Ce module NE réutilise PAS `apiClientProvider` (api_client.dart) :
// [AuthentificationRepository] a été refactorisé pour parler HTTP
// directement (voir son en-tête) et attend un `http.Client`, alors
// que `apiClientProvider` fournit un `ApiClient` — deux types
// distincts et incompatibles (c'était la source de l'erreur de
// compilation "ApiClient can't be assigned to Client?"). De plus,
// [AuthentificationRepository] a un besoin STRUCTUREL que ApiClient
// ne couvre pas : un client HTTP qui PERSISTE les cookies d'un appel
// à l'autre, pour que le cookie httpOnly du refresh token survive
// entre POST /auth/login et POST /auth/refresh (voir la note en tête
// de authentification_repository.dart). D'où [_authHttpClientProvider]
// ci-dessous, dédié à ce module.

import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:riverpod/riverpod.dart';

import '../models/authentification_models.dart';
import '../repositories/authentification_repository.dart';
import '../utils/cookie_http_client.dart';

/* =========================================================================
 * Dépendances
 * ========================================================================= */

/// Client HTTP dédié au module authentification : DOIT être un client
/// qui persiste les cookies entre appels (voir note ci-dessus). Fermé
/// automatiquement quand le provider est disposé.
///
/// ⚠️ Flutter Web : [CookieHttpClient] importe dart:io et ne compile
/// pas tel quel côté web. Sur une cible Web, remplacer cette
/// implémentation par `http.BrowserClient()..withCredentials = true`
/// (le navigateur gère alors les cookies lui-même).
final _authHttpClientProvider = Provider<http.Client>((ref) {
  final client = CookieHttpClient();
  ref.onDispose(client.close);
  return client;
});

/// Repository ré-exposé ici pour que les widgets n'aient jamais besoin
/// d'importer authentification_repository.dart directement.
final authentificationRepositoryProvider =
Provider<AuthentificationRepository>((ref) {
  return AuthentificationRepository(ref.watch(_authHttpClientProvider));
});

/// Stockage sécurisé de l'access token uniquement (jamais le refresh
/// token — voir en-tête du fichier et du repository).
final _stockageSecuriseProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage();
});

const String _cleAccessTokenPersiste = 'auth.access_token';

/* =========================================================================
 * Session — source de vérité unique de l'authentification
 * ========================================================================= */

/// État de session applicatif. `null` = déconnecté.
///
/// [build] tente de restaurer une session existante au démarrage à
/// partir de l'access token persisté (silencieusement : un échec de
/// restauration ne doit jamais planter l'app, juste renvoyer `null`
/// comme si l'utilisateur n'était pas connecté).
class SessionController extends AsyncNotifier<SessionUtilisateur?> {
  @override
  Future<SessionUtilisateur?> build() {
    return _restaurerSessionPersistee();
  }

  // ───────────────────────────────────────────────────────────────
  // Restauration au démarrage
  // ───────────────────────────────────────────────────────────────
  Future<SessionUtilisateur?> _restaurerSessionPersistee() async {
    final tokenPersiste = await ref
        .read(_stockageSecuriseProvider)
        .read(key: _cleAccessTokenPersiste);
    if (tokenPersiste == null) return null;

    final repo = ref.read(authentificationRepositoryProvider);
    try {
      final resultat = await repo.profil(accessToken: tokenPersiste);
      return SessionUtilisateur(
        accessToken: tokenPersiste,
        utilisateur: resultat.utilisateur,
      );
    } on ErreurAuthentification catch (e) {
      if (e.codeHttp != 401) {
        // Erreur autre qu'un access token expiré (réseau, 500, compte
        // suspendu…) : on n'efface pas le token persisté (il redeviendra
        // peut-être valide, ex: coupure réseau ponctuelle), on démarre
        // juste déconnecté pour cet essai.
        return null;
      }
      // Access token expiré : le cookie de refresh httpOnly a peut-être
      // survécu (session encore valide côté serveur) — on tente une
      // reprise silencieuse avant d'abandonner.
      try {
        final rafraichi = await repo.rafraichirToken();
        final profil = await repo.profil(accessToken: rafraichi.accessToken);
        await _persisterAccessToken(rafraichi.accessToken);
        return SessionUtilisateur(
          accessToken: rafraichi.accessToken,
          utilisateur: profil.utilisateur,
        );
      } on ErreurAuthentification {
        await _effacerAccessTokenPersiste();
        return null;
      }
    }
  }

  // ───────────────────────────────────────────────────────────────
  // POST /api/auth/login
  // ───────────────────────────────────────────────────────────────
  /// Retourne le [ConnexionResultat] brut : à l'appelant (écran de
  /// login) de tester `resultat.motDePasseAChanger` pour savoir s'il
  /// doit rediriger vers l'écran de changement de mot de passe initial
  /// (auquel cas AUCUNE session n'est ouverte ici) ou si
  /// `resultat.sessionOuverte` est vraie (session ouverte, état déjà
  /// mis à jour).
  Future<ConnexionResultat> connecter(ConnexionPayload payload) async {
    state = const AsyncLoading<SessionUtilisateur?>();
    try {
      final resultat = await ref
          .read(authentificationRepositoryProvider)
          .connecter(payload);

      if (resultat.sessionOuverte) {
        final session = SessionUtilisateur(
          accessToken: resultat.accessToken!,
          utilisateur: resultat.utilisateur!,
        );
        await _persisterAccessToken(session.accessToken);
        state = AsyncData(session);
      } else {
        // Mot de passe temporaire : pas de session, on repasse l'état
        // précédent (déconnecté) tel quel.
        state = AsyncData(state.value);
      }
      return resultat;
    } catch (e, pile) {
      state = AsyncError<SessionUtilisateur?>(e, pile);
      rethrow;
    }
  }

  // ───────────────────────────────────────────────────────────────
  // POST /api/auth/changer-mot-de-passe-initial
  // Ouvre directement une session complète en cas de succès, comme un
  // login classique.
  // ───────────────────────────────────────────────────────────────
  Future<ChangementMotDePasseInitialResultat> changerMotDePasseInitial(
      ChangementMotDePasseInitialPayload payload, {
        required String tokenChangementMotDePasse,
      }) async {
    state = const AsyncLoading<SessionUtilisateur?>();
    try {
      final resultat = await ref
          .read(authentificationRepositoryProvider)
          .changerMotDePasseInitial(
        payload,
        tokenChangementMotDePasse: tokenChangementMotDePasse,
      );

      final session = SessionUtilisateur(
        accessToken: resultat.accessToken,
        utilisateur: resultat.utilisateur,
      );
      await _persisterAccessToken(session.accessToken);
      state = AsyncData(session);
      return resultat;
    } catch (e, pile) {
      state = AsyncError<SessionUtilisateur?>(e, pile);
      rethrow;
    }
  }

  // ───────────────────────────────────────────────────────────────
  // POST /api/auth/refresh
  // Rafraîchissement manuel (rarement nécessaire à appeler
  // directement depuis un widget : préférer [appelAuthentifie], qui
  // s'en charge automatiquement sur 401). Exposé quand même pour les
  // cas type "réveil de l'app en arrière-plan".
  // ───────────────────────────────────────────────────────────────
  Future<void> rafraichir() async {
    final session = state.value;
    if (session == null) return; // Rien à rafraîchir si déconnecté.

    try {
      final rafraichi =
      await ref.read(authentificationRepositoryProvider).rafraichirToken();
      final nouvelleSession = session.copyWith(
        accessToken: rafraichi.accessToken,
      );
      await _persisterAccessToken(nouvelleSession.accessToken);
      state = AsyncData(nouvelleSession);
    } on ErreurAuthentification {
      // Refresh token invalide/révoqué (rotation à usage unique déjà
      // consommée, session expirée côté serveur, etc.) : la session
      // n'est plus valide, on déconnecte proprement.
      await _effacerAccessTokenPersiste();
      state = const AsyncData(null);
      rethrow;
    }
  }

  // ───────────────────────────────────────────────────────────────
  // POST /api/auth/logout
  // ───────────────────────────────────────────────────────────────
  /// Déconnecte localement même si l'appel serveur échoue (token déjà
  /// expiré, réseau coupé…) : l'important côté UX est que l'app
  /// considère l'utilisateur déconnecté. L'erreur réseau éventuelle est
  /// tout de même relancée pour que l'appelant puisse informer
  /// l'utilisateur si besoin, mais l'état local est déjà nettoyé avant.
  Future<void> deconnecter() async {
    final session = state.value;
    state = const AsyncLoading<SessionUtilisateur?>();

    Object? erreurServeur;
    StackTrace? pileServeur;
    if (session != null) {
      try {
        await ref
            .read(authentificationRepositoryProvider)
            .deconnecter(accessToken: session.accessToken);
      } catch (e, pile) {
        erreurServeur = e;
        pileServeur = pile;
      }
    }

    await _effacerAccessTokenPersiste();
    state = const AsyncData(null);

    if (erreurServeur != null) {
      Error.throwWithStackTrace(erreurServeur, pileServeur!);
    }
  }

  // ───────────────────────────────────────────────────────────────
  // GET /api/auth/me
  // Recharge le profil de l'utilisateur courant (ex: après
  // modification de son propre profil ailleurs dans l'app) sans
  // changer l'access token en cours.
  // ───────────────────────────────────────────────────────────────
  Future<void> rechargerProfil() async {
    final session = state.value;
    if (session == null) return;

    state = const AsyncLoading<SessionUtilisateur?>();
    state = await AsyncValue.guard(() async {
      final resultat = await appelAuthentifie(
            (token) => ref.read(authentificationRepositoryProvider).profil(
          accessToken: token,
        ),
      );
      return session.copyWith(utilisateur: resultat.utilisateur);
    });
  }

  // ───────────────────────────────────────────────────────────────
  // Aide : exécute un appel authentifié quelconque (pas forcément de
  // ce repository) avec l'access token de session courant, en
  // rejouant automatiquement une fois après un /refresh silencieux si
  // le serveur répond 401 (access token expiré) — encapsule
  // [AuthentificationRepository.executerAvecRafraichissement] pour que
  // les AUTRES controllers (medecin, rendez-vous…) n'aient jamais à
  // gérer eux-mêmes la logique de refresh : il leur suffit d'appeler
  //   ref.read(sessionControllerProvider.notifier).appelAuthentifie(
  //     (token) => monRepository.maMethode(..., token: token),
  //   );
  // plutôt que de lire [authTokenProvider] et de le passer tel quel.
  //
  // Lève [ErreurAuthentification] (non catchée en 401 après une tentative
  // de refresh infructueuse) si aucune session n'est ouverte, ou si le
  // refresh échoue — dans ce dernier cas la session est aussi effacée
  // localement, comme dans [rafraichir].
  // ───────────────────────────────────────────────────────────────
  Future<T> appelAuthentifie<T>(
      Future<T> Function(String accessToken) appel,
      ) async {
    final session = state.value;
    if (session == null) {
      throw const ErreurAuthentification(
        codeHttp: 401,
        message: 'Aucune session active.',
      );
    }

    try {
      return await ref
          .read(authentificationRepositoryProvider)
          .executerAvecRafraichissement<T>(
        appel,
        accessToken: session.accessToken,
        surNouveauToken: (nouveauAccessToken) async {
          await _persisterAccessToken(nouveauAccessToken);
          final courante = state.value;
          if (courante != null) {
            state =
                AsyncData(courante.copyWith(accessToken: nouveauAccessToken));
          }
        },
      );
    } on ErreurAuthentification catch (e) {
      if (e.codeHttp == 401) {
        // Le refresh interne à executerAvecRafraichissement a lui-même
        // échoué (rethrow du 401 initial) : session définitivement
        // invalide côté serveur, on nettoie localement.
        unawaited(_effacerAccessTokenPersiste());
        state = const AsyncData(null);
      }
      rethrow;
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Internes — persistance de l'access token
  // ───────────────────────────────────────────────────────────────
  Future<void> _persisterAccessToken(String accessToken) {
    return ref
        .read(_stockageSecuriseProvider)
        .write(key: _cleAccessTokenPersiste, value: accessToken);
  }

  Future<void> _effacerAccessTokenPersiste() {
    return ref
        .read(_stockageSecuriseProvider)
        .delete(key: _cleAccessTokenPersiste);
  }
}

final sessionControllerProvider =
AsyncNotifierProvider<SessionController, SessionUtilisateur?>(
  SessionController.new,
);

/* =========================================================================
 * Sélecteurs pratiques — à utiliser par les AUTRES modules plutôt que
 * de lire sessionControllerProvider.value.accessToken directement.
 * ========================================================================= */

/// Access token courant, ou `null` si déconnecté / session en cours de
/// résolution / erreur. À passer aux repositories des autres modules
/// pour un appel simple et unique ; pour un appel qui doit survivre à
/// un access token expiré, préférer
/// `ref.read(sessionControllerProvider.notifier).appelAuthentifie(...)`.
final authTokenProvider = Provider<String?>((ref) {
  return ref.watch(sessionControllerProvider).value?.accessToken;
});

/// Utilisateur courant, ou `null` si déconnecté.
final authUtilisateurProvider = Provider<Utilisateur?>((ref) {
  return ref.watch(sessionControllerProvider).value?.utilisateur;
});

/// true si une session est ouverte. Pratique pour les gardes de routage
/// (redirection vers /login) — attention : reste `false` tant que la
/// restauration au démarrage ([SessionController.build]) n'est pas
/// terminée ; utiliser `ref.watch(sessionControllerProvider).isLoading`
/// pour afficher un écran de chargement le temps de cette résolution
/// initiale plutôt que de rediriger prématurément vers /login.
final estConnecteProvider = Provider<bool>((ref) {
  return ref.watch(sessionControllerProvider).value != null;
});

/// Rôle de l'utilisateur courant, ou `null` si déconnecté. Pratique
/// pour l'affichage conditionnel / les gardes de routage par rôle.
final roleUtilisateurCourantProvider = Provider<RoleUtilisateur?>((ref) {
  return ref.watch(authUtilisateurProvider)?.role;
});

/* =========================================================================
 * Inscription publique — POST /api/auth/register
 * N'affecte JAMAIS la session (le backend ne renvoie pas de token sur
 * cette route, voir authentification.controller.js#inscrire) : état
 * strictement local à l'écran d'inscription.
 * ========================================================================= */

class InscriptionController extends AsyncNotifier<InscriptionResultat?> {
  @override
  InscriptionResultat? build() => null;

  Future<void> soumettre(InscriptionPayload payload) async {
    state = const AsyncLoading<InscriptionResultat?>();
    state = await AsyncValue.guard(
          () => ref.read(authentificationRepositoryProvider).inscrire(payload),
    );
  }

  void reinitialiser() => state = const AsyncData(null);
}

final inscriptionControllerProvider =
AsyncNotifierProvider<InscriptionController, InscriptionResultat?>(
  InscriptionController.new,
);

/* =========================================================================
 * Comptes administrés — POST /api/auth/comptes
 * Réservé à un appelant authentifié admin/superadmin : consomme
 * systématiquement [SessionController.appelAuthentifie] pour bénéficier
 * du refresh automatique, plutôt que de lire authTokenProvider en brut.
 * ========================================================================= */

class CreationCompteAdministreController
    extends AsyncNotifier<InscriptionResultat?> {
  @override
  InscriptionResultat? build() => null;

  Future<void> soumettre(CreerCompteAdministrePayload payload) async {
    state = const AsyncLoading<InscriptionResultat?>();
    state = await AsyncValue.guard(
          () => ref.read(sessionControllerProvider.notifier).appelAuthentifie(
            (token) => ref
            .read(authentificationRepositoryProvider)
            .creerCompteAdministre(payload, accessToken: token),
      ),
    );
  }

  void reinitialiser() => state = const AsyncData(null);
}

final creationCompteAdministreControllerProvider = AsyncNotifierProvider<
    CreationCompteAdministreController, InscriptionResultat?>(
  CreationCompteAdministreController.new,
);

/* =========================================================================
 * Amorçage superadmin — POST /api/auth/bootstrap-superadmin
 * Route publique verrouillée par X-Setup-Token (voir
 * AmorcageSuperAdminPayload.toHeaders côté modèles). N'affecte pas la
 * session courante : à n'utiliser que depuis un écran d'amorçage
 * d'environnement, jamais un écran accessible aux utilisateurs finaux.
 * ========================================================================= */

class AmorcageSuperAdminController extends AsyncNotifier<InscriptionResultat?> {
  @override
  InscriptionResultat? build() => null;

  Future<void> soumettre(AmorcageSuperAdminPayload payload) async {
    state = const AsyncLoading<InscriptionResultat?>();
    state = await AsyncValue.guard(
          () => ref.read(authentificationRepositoryProvider).amorcerSuperAdmin(payload),
    );
  }

  void reinitialiser() => state = const AsyncData(null);
}

final amorcageSuperAdminControllerProvider =
AsyncNotifierProvider<AmorcageSuperAdminController, InscriptionResultat?>(
  AmorcageSuperAdminController.new,
);