// lib/repositories/authentification_repository.dart
//
// Repository du module "authentification".
// Construit les appels API, effectue le mapping JSON <-> modèles
// (authentification_models.dart) et normalise les erreurs en
// [ErreurAuthentification], en s'appuyant sur [ApiClient]
// (utils/api_client.dart) pour le transport HTTP.
//
// ─────────────────────────────────────────────────────────────────
// ⚠️ DISPOSITION RÉELLE DU BACKEND — refresh token en cookie httpOnly
// ─────────────────────────────────────────────────────────────────
// Le backend (authentification.controller.js) ne renvoie JAMAIS le
// refresh token dans le corps JSON : il est posé par le serveur via
// `res.cookie(NOM_COOKIE_REFRESH_TOKEN, ..., { httpOnly: true, ... })`
// sur /login, /changer-mot-de-passe-initial et /refresh, et effacé via
// `res.clearCookie(...)` sur /logout. Conséquences pour ce repository
// et pour l'[ApiClient] qui lui est injecté :
//
//  1. Ce fichier ne lit, ne stocke ni ne transmet JAMAIS de refresh
//     token explicitement : c'est physiquement impossible (httpOnly =
//     invisible pour le JS/Dart, y compris côté web) et ce serait de
//     toute façon une régression de sécurité de tenter de le faire.
//     Seul le navigateur / moteur HTTP porte ce cookie.
//
//  2. Pour que /refresh et /logout fonctionnent, l'[ApiClient] fourni
//     au constructeur DOIT reposer sur un client HTTP qui PERSISTE et
//     RENVOIE les cookies entre deux requêtes vers le même hôte :
//       - Flutter Web : `package:http`'s `BrowserClient` doit être
//         utilisé avec `withCredentials = true` si l'API est sur une
//         autre origine que le front (cross-site), sinon les cookies
//         same-origin partent déjà automatiquement.
//       - Mobile/Desktop (dart:io) : `http.Client()` standard NE
//         PERSISTE PAS les cookies d'un appel à l'autre. Il faut
//         l'envelopper avec un pot de cookies, p.ex.
//         `package:cookie_jar` + `package:http/io_client.dart`
//         (ou construire l'`ApiClient` avec un `http.Client` basé sur
//         `dart:io HttpClient` + un `CookieJar` persistant sur disque
//         pour survivre au redémarrage de l'app).
//     Sans cela, /refresh renverra systématiquement 400
//     ("refresh_token requis.") car le cookie n'aura jamais quitté le
//     serveur d'origine.
//
//  3. L'access token, lui, n'est PAS httpOnly : il revient dans le
//     JSON (`access_token`) et doit être conservé par la couche
//     supérieure (ex: AuthController/provider de session), typiquement
//     en mémoire + un stockage sécurisé (flutter_secure_storage) pour
//     survivre à un redémarrage — jamais dans du SharedPreferences en
//     clair. Ce repository reste volontairement STATELESS vis-à-vis de
//     la session : chaque appel authentifié reçoit son token en
//     paramètre, exactement comme [ApiClient] le fait déjà pour le
//     transport (voir sa doc en tête de fichier).
//
//  4. Rotation : chaque /refresh RÉVOQUE l'ancien refresh token et en
//     repose un nouveau dans le même cookie. Il ne faut donc jamais
//     appeler /refresh deux fois en parallèle avec la même session
//     (l'un des deux appels échouera avec 401 "Refresh token
//     invalide.") — voir [executerAvecRafraichissement] plus bas qui
//     sérialise ce cas.
// ─────────────────────────────────────────────────────────────────

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/authentification_models.dart';
import '../utils/api_client.dart';

/// Repository du composant authentification. Ne détient aucun état de
/// session (voir note en tête de fichier) : uniquement le transport
/// HTTP + le mapping JSON <-> modèles + la normalisation des erreurs.
class AuthentificationRepository {
  final ApiClient _client;

  const AuthentificationRepository(this._client);

  // ───────────────────────────────────────────────────────────────
  // POST /api/auth/register — inscription publique (rôle "patient"
  // forcé côté serveur quoi qu'on envoie).
  // ───────────────────────────────────────────────────────────────
  Future<InscriptionResultat> inscrire(InscriptionPayload payload) {
    return _executer(() async {
      final json = await _client.post(
        ApiEndpoints.inscription,
        body: payload.toJson(),
      );
      return InscriptionResultat.fromJson(_carte(json));
    });
  }

  // ───────────────────────────────────────────────────────────────
  // POST /api/auth/login
  // Le refresh token (si émis) part dans le cookie httpOnly, hors de
  // portée de ce repository — voir [ConnexionResultat.sessionOuverte]
  // pour distinguer session complète vs mot de passe temporaire.
  // ───────────────────────────────────────────────────────────────
  Future<ConnexionResultat> connecter(ConnexionPayload payload) {
    return _executer(() async {
      final json = await _client.post(
        ApiEndpoints.connexion,
        body: payload.toJson(),
      );
      return ConnexionResultat.fromJson(_carte(json));
    });
  }

  // ───────────────────────────────────────────────────────────────
  // POST /api/auth/changer-mot-de-passe-initial
  // Protégée par `exigerTokenChangementMotDePasse` (PAS par
  // `authentifier`) : le token à transmettre est le
  // `tokenChangementMotDePasse` renvoyé par connecter() lorsque
  // `motDePasseAChanger` est vrai — pas un access token classique.
  // Réutilise le paramètre `token` de [ApiClient.post], qui pose déjà
  // `Authorization: Bearer <token>`, ce qui correspond exactement à ce
  // qu'attend le middleware côté serveur.
  // ───────────────────────────────────────────────────────────────
  Future<ChangementMotDePasseInitialResultat> changerMotDePasseInitial(
      ChangementMotDePasseInitialPayload payload, {
        required String tokenChangementMotDePasse,
      }) {
    return _executer(() async {
      final json = await _client.post(
        ApiEndpoints.changementMotDePasseInitial,
        body: payload.toJson(),
        token: tokenChangementMotDePasse,
      );
      return ChangementMotDePasseInitialResultat.fromJson(_carte(json));
    });
  }

  // ───────────────────────────────────────────────────────────────
  // POST /api/auth/refresh
  // Aucun payload et aucun token Bearer à fournir : le refresh token
  // voyage uniquement via le cookie httpOnly (voir note en tête de
  // fichier sur les prérequis du client HTTP sous-jacent). Le nouveau
  // refresh token est reposé dans le même cookie côté serveur ; seul
  // le nouvel access token revient ici.
  // ───────────────────────────────────────────────────────────────
  Future<RafraichissementResultat> rafraichirToken() {
    return _executer(() async {
      final json = await _client.post(ApiEndpoints.rafraichissement);
      return RafraichissementResultat.fromJson(_carte(json));
    });
  }

  // ───────────────────────────────────────────────────────────────
  // POST /api/auth/logout
  // Authentifiée : nécessite l'access token courant (pour mettre son
  // jti en denylist). Révoque aussi le refresh token porté par le
  // cookie et demande son effacement — géré côté serveur via
  // `res.clearCookie`, rien à faire ici pour ça.
  // ───────────────────────────────────────────────────────────────
  Future<MessageResultat> deconnecter({required String accessToken}) {
    return _executer(() async {
      final json = await _client.post(
        ApiEndpoints.deconnexion,
        token: accessToken,
      );
      return MessageResultat.fromJson(_carte(json));
    });
  }

  // ───────────────────────────────────────────────────────────────
  // GET /api/auth/me
  // ───────────────────────────────────────────────────────────────
  Future<ProfilResultat> profil({required String accessToken}) {
    return _executer(() async {
      final json = await _client.get(
        ApiEndpoints.profilCourant,
        token: accessToken,
      );
      return ProfilResultat.fromJson(_carte(json));
    });
  }

  // ───────────────────────────────────────────────────────────────
  // POST /api/auth/comptes
  // Réservée à un appelant authentifié admin/superadmin. La matrice
  // fine des rôles créables (ROLES_CREABLES_PAR côté serveur) n'est
  // pas dupliquée ici : seule la validation locale des champs requis
  // pour un rôle agent_xxx ([CreerCompteAdministrePayload.valide]) est
  // vérifiée avant l'appel réseau, pour échouer vite sans round-trip
  // inutile. Le serveur reste la source de vérité pour l'autorisation
  // (peut renvoyer 403 même si `valide` est vrai).
  // ───────────────────────────────────────────────────────────────
  Future<InscriptionResultat> creerCompteAdministre(
      CreerCompteAdministrePayload payload, {
        required String accessToken,
      }) {
    if (!payload.valide) {
      throw const ErreurAuthentification(
        codeHttp: 422,
        message:
        'reference_id et fonction sont requis pour créer un compte agent_xxx.',
      );
    }
    return _executer(() async {
      final json = await _client.post(
        ApiEndpoints.comptes,
        body: payload.toJson(),
        token: accessToken,
      );
      return InscriptionResultat.fromJson(_carte(json));
    });
  }

  // ───────────────────────────────────────────────────────────────
  // POST /api/auth/bootstrap-superadmin
  // Route publique mais verrouillée par l'en-tête `X-Setup-Token`
  // ([AmorcageSuperAdminPayload.toHeaders]) — pas un Authorization
  // Bearer. [ApiClient] ne sait poser que des en-têtes Authorization,
  // d'où l'appel HTTP dédié ci-dessous plutôt qu'un passage par
  // `_client.post`. Se désactive d'elle-même côté serveur dès qu'un
  // superadmin existe déjà (403) : à n'utiliser qu'à l'amorçage d'un
  // environnement, jamais depuis un écran exposé aux utilisateurs
  // finaux.
  // ───────────────────────────────────────────────────────────────
  Future<InscriptionResultat> amorcerSuperAdmin(
      AmorcageSuperAdminPayload payload,
      ) {
    return _executer(() async {
      final json = await _posterAvecEntetesPersonnalisees(
        ApiEndpoints.amorcageSuperAdmin, // voir note dans ApiEndpoints
        corps: payload.toJson(),
        entetesSupplementaires: payload.toHeaders(),
      );
      return InscriptionResultat.fromJson(_carte(json));
    });
  }

  // ───────────────────────────────────────────────────────────────
  // Aide optionnelle : encapsule le pattern "appel authentifié qui
  // retente une fois après un /refresh en cas de 401 pour access
  // token expiré". Ne s'applique PAS à /refresh lui-même (rotation à
  // usage unique : le retenter en cas d'échec re-signerait un
  // problème plus profond, ex. session révoquée, pas un simple
  // expiry).
  //
  // `surNouveauToken` permet à l'appelant (AuthController) de
  // persister le nouvel access token dès qu'il est émis, avant même
  // que l'appel initial n'ait fini de rejouer.
  // ───────────────────────────────────────────────────────────────
  Future<T> executerAvecRafraichissement<T>(
      Future<T> Function(String accessToken) appel, {
        required String accessToken,
        required Future<void> Function(String nouveauAccessToken)
        surNouveauToken,
      }) async {
    try {
      return await appel(accessToken);
    } on ErreurAuthentification catch (e) {
      if (e.codeHttp != 401) rethrow;

      final rafraichi = await rafraichirToken();
      await surNouveauToken(rafraichi.accessToken);
      return appel(rafraichi.accessToken);
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Internes
  // ───────────────────────────────────────────────────────────────

  /// Convertit toute [ApiException] levée par [ApiClient] en
  /// [ErreurAuthentification] (typée, exploitable côté UI via
  /// `compteSuspendu` / `identifiantsInvalides` / `emailDejaUtilise`),
  /// pour que les repositories/controllers appelants n'aient qu'un
  /// seul type d'erreur à gérer pour tout ce module.
  Future<T> _executer<T>(Future<T> Function() appel) async {
    try {
      return await appel();
    } on ApiException catch (e) {
      throw ErreurAuthentification(
        codeHttp: e.statusCode ?? 0,
        message: e.message,
      );
    }
  }

  /// Le backend renvoie toujours un objet JSON en cas de succès sur
  /// ce module (jamais une liste nue) : ce garde-fou transforme une
  /// réponse inattendue (null, liste, etc.) en erreur explicite plutôt
  /// qu'en `TypeError` opaque au moment du `fromJson`.
  Map<String, dynamic> _carte(dynamic json) {
    if (json is Map<String, dynamic>) return json;
    throw const ErreurAuthentification(
      codeHttp: 0,
      message: 'Réponse du serveur inattendue (format invalide).',
    );
  }

  /// Appel POST JSON avec en-têtes personnalisés, pour les cas hors du
  /// périmètre d'[ApiClient] (ici : `X-Setup-Token`). Reproduit
  /// volontairement la même politique d'erreur que
  /// `ApiClient._traiter` pour rester homogène avec le reste du
  /// transport, sans avoir à modifier [ApiClient] pour un unique
  /// endpoint d'amorçage.
  Future<dynamic> _posterAvecEntetesPersonnalisees(
      String chemin, {
        required Map<String, dynamic> corps,
        required Map<String, String> entetesSupplementaires,
      }) async {
    final base = _client.baseUrl.endsWith('/')
        ? _client.baseUrl.substring(0, _client.baseUrl.length - 1)
        : _client.baseUrl;
    final chemin_ = chemin.startsWith('/') ? chemin : '/$chemin';
    final uri = Uri.parse('$base$chemin_');

    final entetes = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...entetesSupplementaires,
    };

    late final http.Response reponse;
    try {
      reponse = await http
          .post(uri, headers: entetes, body: jsonEncode(corps))
          .timeout(_client.timeout);
    } catch (e) {
      throw ApiException('Erreur inattendue : $e');
    }

    dynamic decode;
    try {
      decode = reponse.body.isNotEmpty ? jsonDecode(reponse.body) : null;
    } on FormatException {
      decode = null;
    }

    if (reponse.statusCode >= 200 && reponse.statusCode < 300) {
      return decode;
    }

    final message = (decode is Map && decode['message'] is String)
        ? decode['message'] as String
        : 'Erreur ${reponse.statusCode} lors de l\'appel à l\'API.';
    throw ApiException(message, statusCode: reponse.statusCode);
  }
}