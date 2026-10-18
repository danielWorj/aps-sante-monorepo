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
//     redémarrage de l'app — jamais dans SharedPreferences en clair ;
//   - le cookie du refresh token est lui aussi persisté, chiffré
//     (PersistCookieJar + StockageCookiesSecurise) : sans cela il était
//     perdu à la fermeture de l'app et la session ne survivait pas à
//     l'expiration de l'access token ;
//   - l'access token est renouvelé automatiquement avant expiration
//     (minuteur + retour au premier plan), un seul /refresh à la fois.
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
import 'dart:convert';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:riverpod/riverpod.dart';

import '../models/authentification_models.dart';
import '../repositories/authentification_repository.dart';
import '../utils/cookie_http_client.dart';
import '../utils/stockage_cookies_securise.dart';

/* =========================================================================
 * Dépendances
 * ========================================================================= */

/// Pot de cookies PERSISTANT (chiffré, voir stockage_cookies_securise.dart) :
/// le cookie httpOnly du refresh token survit ainsi aux redémarrages de
/// l'application. Avec l'ancien CookieJar en mémoire, il était perdu à
/// chaque fermeture et l'utilisateur devait se reconnecter dès que
/// l'access token (15 min) avait expiré.
final _potCookiesProvider = Provider<PersistCookieJar>((ref) {
  return PersistCookieJar(storage: const StockageCookiesSecurise());
});

/// Client HTTP dédié au module authentification : DOIT être un client
/// qui persiste les cookies entre appels (voir note ci-dessus). Fermé
/// automatiquement quand le provider est disposé.
///
/// ⚠️ Flutter Web : [CookieHttpClient] importe dart:io et ne compile
/// pas tel quel côté web. Sur une cible Web, remplacer cette
/// implémentation par `http.BrowserClient()..withCredentials = true`
/// (le navigateur gère alors les cookies lui-même).
final _authHttpClientProvider = Provider<http.Client>((ref) {
  final client = CookieHttpClient(pot: ref.watch(_potCookiesProvider));
  ref.onDispose(client.close);
  return client;
});

/// Repository ré-exposé ici pour que les widgets n'aient jamais besoin
/// d'importer authentification_repository.dart directement.
final authentificationRepositoryProvider =
Provider<AuthentificationRepository>((ref) {
  return AuthentificationRepository(ref.watch(_authHttpClientProvider));
});

/// Stockage sécurisé de l'access token et du dernier profil connu
/// (jamais le refresh token, qui vit dans le pot de cookies).
final _stockageSecuriseProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage();
});

const String _cleAccessTokenPersiste = 'auth.access_token';
// Dernier profil connu : permet d'ouvrir l'espace de l'utilisateur même
// si le serveur est injoignable au démarrage (réseau coupé).
const String _cleUtilisateurPersiste = 'auth.utilisateur';

/// L'access token est renouvelé un peu AVANT son expiration, pour que les
/// modules qui lisent [authTokenProvider] tel quel (sans
/// [SessionController.appelAuthentifie]) aient toujours un token valide.
const Duration _margeRafraichissement = Duration(minutes: 2);
const Duration _reessaiApresEchecReseau = Duration(seconds: 30);

/// Date d'expiration (`exp`) lue dans l'access token JWT, sans vérifier
/// la signature (le serveur reste seul juge) ; `null` si illisible.
DateTime? _expirationJwt(String token) {
  try {
    final parties = token.split('.');
    if (parties.length != 3) return null;
    final charge = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(parties[1]))),
    );
    final exp = charge is Map ? charge['exp'] : null;
    if (exp is! num) return null;
    return DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000);
  } catch (_) {
    return null;
  }
}

/// Code HTTP d'une erreur levée par un repository (chacun a son propre
/// ApiException, tous avec `statusCode`), ou `null` (réseau, inattendu).
int? _codeHttpDe(Object erreur) {
  if (erreur is ErreurAuthentification) {
    return erreur.codeHttp == 0 ? null : erreur.codeHttp;
  }
  try {
    final code = (erreur as dynamic).statusCode;
    return code is int ? code : null;
  } catch (_) {
    return null;
  }
}

/// Le serveur a REFUSÉ la session (refresh absent/révoqué/expiré, compte
/// suspendu) : il faut se reconnecter. Toute autre erreur (réseau, 5xx)
/// est passagère et ne doit jamais déconnecter l'utilisateur.
bool _estRejetDefinitif(Object erreur) {
  final code = _codeHttpDe(erreur);
  return code == 400 || code == 401 || code == 403;
}

/* =========================================================================
 * Session — source de vérité unique de l'authentification
 * ========================================================================= */

/// État de session applicatif. `null` = déconnecté.
///
/// [build] restaure la session persistée au démarrage : access token
/// renouvelé si besoin grâce au cookie de refresh persistant ; serveur
/// injoignable => session locale (dernier profil connu) plutôt que
/// l'écran de connexion. Seul un REFUS du serveur déconnecte.
class SessionController extends AsyncNotifier<SessionUtilisateur?> {
  Timer? _minuteur;
  // Un seul /auth/refresh à la fois : la rotation est à usage unique, deux
  // refresh simultanés avec le même cookie feraient échouer le second (et
  // déconnecteraient l'utilisateur à tort).
  Future<String>? _rafraichissementEnCours;

  @override
  Future<SessionUtilisateur?> build() {
    ref.onDispose(() => _minuteur?.cancel());
    return _restaurerSessionPersistee();
  }

  AuthentificationRepository get _repo =>
      ref.read(authentificationRepositoryProvider);

  // ───────────────────────────────────────────────────────────────
  // Restauration au démarrage
  // ───────────────────────────────────────────────────────────────
  Future<SessionUtilisateur?> _restaurerSessionPersistee() async {
    String? tokenPersiste;
    Utilisateur? utilisateurEnCache;
    try {
      final stockage = ref.read(_stockageSecuriseProvider);
      tokenPersiste = await stockage.read(key: _cleAccessTokenPersiste);
      utilisateurEnCache =
          _decoderUtilisateur(await stockage.read(key: _cleUtilisateurPersiste));
    } catch (_) {
      return null; // stockage illisible : démarrage déconnecté
    }
    if (tokenPersiste == null) return null;

    var token = tokenPersiste;
    try {
      if (_expireBientot(token)) token = await _rafraichirUneFois();
      Utilisateur utilisateur;
      try {
        utilisateur = (await _repo.profil(accessToken: token)).utilisateur;
      } on ErreurAuthentification catch (e) {
        if (e.codeHttp != 401) rethrow;
        token = await _rafraichirUneFois();
        utilisateur = (await _repo.profil(accessToken: token)).utilisateur;
      }
      await _persisterUtilisateur(utilisateur);
      _programmerRafraichissement(token);
      return SessionUtilisateur(accessToken: token, utilisateur: utilisateur);
    } catch (e) {
      if (_estRejetDefinitif(e)) {
        await _effacerPersistance();
        return null;
      }
      // Serveur injoignable : session locale, renouvellement retenté
      // en arrière-plan. Sans profil en cache (anciennes installations),
      // on garde les jetons pour le prochain lancement.
      if (utilisateurEnCache == null) return null;
      _programmerRafraichissement(token, delai: _reessaiApresEchecReseau);
      return SessionUtilisateur(accessToken: token, utilisateur: utilisateurEnCache);
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
      final resultat = await _repo.connecter(payload);

      if (resultat.sessionOuverte) {
        await _ouvrirSession(SessionUtilisateur(
          accessToken: resultat.accessToken!,
          utilisateur: resultat.utilisateur!,
        ));
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
      final resultat = await _repo.changerMotDePasseInitial(
        payload,
        tokenChangementMotDePasse: tokenChangementMotDePasse,
      );
      await _ouvrirSession(SessionUtilisateur(
        accessToken: resultat.accessToken,
        utilisateur: resultat.utilisateur,
      ));
      return resultat;
    } catch (e, pile) {
      state = AsyncError<SessionUtilisateur?>(e, pile);
      rethrow;
    }
  }

  // ───────────────────────────────────────────────────────────────
  // POST /api/auth/refresh
  // Rafraîchissement manuel (rarement utile : le renouvellement est
  // automatique avant expiration, et [appelAuthentifie] rejoue sur 401).
  // Déconnecte localement si le serveur refuse la session.
  // ───────────────────────────────────────────────────────────────
  Future<void> rafraichir() async {
    if (state.value == null) return; // Rien à rafraîchir si déconnecté.
    try {
      await _rafraichirEtAppliquer();
    } catch (e) {
      if (_estRejetDefinitif(e)) await _terminerSessionLocale();
      rethrow;
    }
  }

  /// À appeler au retour au premier plan (voir main.dart) : le minuteur
  /// ne tourne pas quand l'application est suspendue, le token a pu
  /// expirer entre-temps. Silencieux si le réseau est indisponible.
  Future<void> verifierFraicheur() async {
    final session = state.value;
    if (session == null || !_expireBientot(session.accessToken)) return;
    await _rafraichirEnArrierePlan();
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
        await _repo.deconnecter(accessToken: session.accessToken);
      } catch (e, pile) {
        erreurServeur = e;
        pileServeur = pile;
      }
    }

    await _terminerSessionLocale();

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
    if (state.value == null) return;
    try {
      final resultat = await appelAuthentifie(
        (token) => _repo.profil(accessToken: token),
      );
      await _persisterUtilisateur(resultat.utilisateur);
      final courante = state.value;
      if (courante != null) {
        state = AsyncData(courante.copyWith(utilisateur: resultat.utilisateur));
      }
    } catch (_) {
      // Profil non rechargé (réseau…) : on garde l'existant. Un refus du
      // serveur a déjà fermé la session dans appelAuthentifie.
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Aide : exécute un appel authentifié quelconque (pas forcément de
  // ce repository) avec l'access token de session courant :
  //   - token déjà expiré => renouvelé AVANT l'appel ;
  //   - réponse 401 => un /refresh (partagé) puis l'appel est rejoué une fois.
  // Les AUTRES controllers n'ont donc jamais à gérer le refresh :
  //   ref.read(sessionControllerProvider.notifier).appelAuthentifie(
  //     (token) => monRepository.maMethode(..., token: token),
  //   );
  // Relance l'erreur d'origine sinon ; si le serveur refuse la session,
  // elle est aussi fermée localement.
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

    var token = session.accessToken;
    if (_estExpire(token)) token = await _renouvelerPourAppel();

    try {
      return await appel(token);
    } catch (e) {
      if (_codeHttpDe(e) != 401) rethrow;
      token = await _renouvelerPourAppel();
      return appel(token);
    }
  }

  /// Refresh pour [appelAuthentifie] : en cas de refus, session fermée.
  Future<String> _renouvelerPourAppel() async {
    try {
      return await _rafraichirEtAppliquer();
    } catch (e) {
      if (_estRejetDefinitif(e)) await _terminerSessionLocale();
      rethrow;
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Internes — renouvellement
  // ───────────────────────────────────────────────────────────────

  bool _expireBientot(String token) {
    final exp = _expirationJwt(token);
    return exp == null || exp.difference(DateTime.now()) <= _margeRafraichissement;
  }

  bool _estExpire(String token) {
    final exp = _expirationJwt(token);
    return exp != null && !exp.isAfter(DateTime.now());
  }

  /// /auth/refresh dédoublonné : tous les appelants simultanés partagent
  /// la même requête. Persiste le nouvel access token.
  Future<String> _rafraichirUneFois() {
    return _rafraichissementEnCours ??= () async {
      try {
        final rafraichi = await _repo.rafraichirToken();
        await _persisterAccessToken(rafraichi.accessToken);
        return rafraichi.accessToken;
      } finally {
        _rafraichissementEnCours = null;
      }
    }();
  }

  /// Refresh + mise à jour de l'état + nouveau minuteur.
  Future<String> _rafraichirEtAppliquer() async {
    final token = await _rafraichirUneFois();
    final courante = state.value;
    if (courante != null && courante.accessToken != token) {
      state = AsyncData(courante.copyWith(accessToken: token));
    }
    _programmerRafraichissement(token);
    return token;
  }

  Future<void> _rafraichirEnArrierePlan() async {
    if (state.value == null) return;
    try {
      await _rafraichirEtAppliquer();
    } catch (e) {
      if (_estRejetDefinitif(e)) {
        await _terminerSessionLocale();
      } else {
        final session = state.value;
        if (session != null) {
          _programmerRafraichissement(session.accessToken, delai: _reessaiApresEchecReseau);
        }
      }
    }
  }

  void _programmerRafraichissement(String token, {Duration? delai}) {
    _minuteur?.cancel();
    var attente = delai;
    if (attente == null) {
      final exp = _expirationJwt(token);
      if (exp == null) return;
      attente = exp.difference(DateTime.now()) - _margeRafraichissement;
    }
    if (attente < const Duration(seconds: 5)) attente = const Duration(seconds: 5);
    _minuteur = Timer(attente, _rafraichirEnArrierePlan);
  }

  // ───────────────────────────────────────────────────────────────
  // Internes — persistance
  // ───────────────────────────────────────────────────────────────
  Future<void> _ouvrirSession(SessionUtilisateur session) async {
    await _persisterAccessToken(session.accessToken);
    await _persisterUtilisateur(session.utilisateur);
    _programmerRafraichissement(session.accessToken);
    state = AsyncData(session);
  }

  /// Ferme la session côté application : jetons, profil et cookies effacés.
  Future<void> _terminerSessionLocale() async {
    _minuteur?.cancel();
    await _effacerPersistance();
    state = const AsyncData(null);
  }

  Future<void> _persisterAccessToken(String accessToken) {
    return ref
        .read(_stockageSecuriseProvider)
        .write(key: _cleAccessTokenPersiste, value: accessToken);
  }

  Future<void> _persisterUtilisateur(Utilisateur utilisateur) async {
    try {
      await ref.read(_stockageSecuriseProvider).write(
        key: _cleUtilisateurPersiste,
        value: jsonEncode(utilisateur.toJson()),
      );
    } catch (_) {
      // Cache de confort seulement.
    }
  }

  Utilisateur? _decoderUtilisateur(String? brut) {
    if (brut == null) return null;
    try {
      return Utilisateur.fromJson(jsonDecode(brut) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> _effacerPersistance() async {
    final stockage = ref.read(_stockageSecuriseProvider);
    try {
      await stockage.delete(key: _cleAccessTokenPersiste);
      await stockage.delete(key: _cleUtilisateurPersiste);
      await ref.read(_potCookiesProvider).deleteAll();
    } catch (_) {
      // Rien de plus à faire : l'état est de toute façon « déconnecté ».
    }
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

/// Session courante une fois la restauration du démarrage TERMINÉE
/// (`null` si déconnecté). À utiliser avant toute décision « connecté ou
/// pas » prise hors d'un widget qui observe la session : lire
/// `sessionControllerProvider.value` pendant la restauration renverrait
/// `null` alors que l'utilisateur a une session valide.
Future<SessionUtilisateur?> attendreSession(ProviderContainer container) async {
  try {
    return await container.read(sessionControllerProvider.future);
  } catch (_) {
    return null;
  }
}

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