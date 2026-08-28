// lib/utils/api_client.dart
//
// Client HTTP central de l'application.
// - Porte l'URL de base de l'API + la définition des endpoints.
// - Centralise la construction des requêtes (headers, token, timeout).
// - Transforme toute erreur HTTP/réseau en [ApiException] exploitable
//   par les repositories/controllers.
//
// Ce fichier ne contient AUCUNE logique métier : il ne fait que parler
// HTTP. Le mapping JSON -> modèles se fait dans les repositories.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

/// Regroupe tous les chemins d'API exposés par le backend Express.
/// Garder les endpoints ici évite de disperser des chaînes de
/// caractères "en dur" dans les repositories.
class ApiEndpoints {
  ApiEndpoints._();

  // ─── Référentiel géographique (lecture publique) ────────────────
  static const String langues = '/referentiels/langues';
  static String langue(String id) => '/referentiels/langues/$id';

  static const String devises = '/referentiels/devises';
  static String devise(String id) => '/referentiels/devises/$id';

  static const String pays = '/referentiels/pays';
  static String unPays(String id) => '/referentiels/pays/$id';

  static const String villes = '/referentiels/villes';
  static String uneVille(String id) => '/referentiels/villes/$id';

  // ─── Rôles (IAM) — nécessite une authentification ────────────────
  static const String roles = '/referentiels/roles';
  static String role(String id) => '/referentiels/roles/$id';
}

/// Exception métier levée par [ApiClient] pour toute réponse en échec
/// (statut HTTP >= 400) ou tout problème réseau/format. Porte le
/// message renvoyé par le backend (`{ "message": "..." }`) quand il
/// est disponible, ce qui permet de l'afficher tel quel côté UI.
class ApiException implements Exception {
  final int? statusCode;
  final String message;

  const ApiException(this.message, {this.statusCode});

  /// Vrai si l'échec vient d'une absence/expiration d'authentification.
  bool get estNonAutorise => statusCode == 401 || statusCode == 403;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// Client HTTP minimal, sans dépendance à un état global : le token
/// d'authentification est fourni requête par requête (via [token])
/// plutôt que stocké ici, pour que ce fichier reste un simple
/// transport et que la gestion de session reste au niveau supérieur
/// (ex: un AuthController / middleware d'auth).
class ApiClient {
  /// URL de base de l'API, sans slash final.
  /// Ex: http://localhost:3000/api
  final String baseUrl;

  final http.Client _httpClient;
  final Duration timeout;

  ApiClient({
    required this.baseUrl,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 15),
  }) : _httpClient = httpClient ?? http.Client();

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final cleanBase = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    final cleanPath = path.startsWith('/') ? path : '/$path';

    // On ne garde que les paramètres non nuls, convertis en String.
    final Map<String, String>? queryParameters = query == null
        ? null
        : {
      for (final entry in query.entries)
        if (entry.value != null) entry.key: entry.value.toString(),
    };

    return Uri.parse('$cleanBase$cleanPath').replace(
      queryParameters:
      (queryParameters != null && queryParameters.isNotEmpty)
          ? queryParameters
          : null,
    );
  }

  Map<String, String> _headers({String? token, bool withBody = false}) {
    return {
      'Accept': 'application/json',
      if (withBody) 'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  /// GET, avec query params optionnels et token optionnel.
  Future<dynamic> get(
      String path, {
        Map<String, dynamic>? query,
        String? token,
      }) {
    return _envoyer(() => _httpClient
        .get(_uri(path, query), headers: _headers(token: token))
        .timeout(timeout));
  }

  /// POST avec corps JSON.
  Future<dynamic> post(
      String path, {
        Map<String, dynamic>? body,
        String? token,
      }) {
    return _envoyer(() => _httpClient
        .post(
      _uri(path),
      headers: _headers(token: token, withBody: true),
      body: jsonEncode(body ?? {}),
    )
        .timeout(timeout));
  }

  /// PUT avec corps JSON.
  Future<dynamic> put(
      String path, {
        Map<String, dynamic>? body,
        String? token,
      }) {
    return _envoyer(() => _httpClient
        .put(
      _uri(path),
      headers: _headers(token: token, withBody: true),
      body: jsonEncode(body ?? {}),
    )
        .timeout(timeout));
  }

  /// DELETE.
  Future<dynamic> delete(String path, {String? token}) {
    return _envoyer(() => _httpClient
        .delete(_uri(path), headers: _headers(token: token))
        .timeout(timeout));
  }

  /// Exécute la requête, décode la réponse JSON et lève une
  /// [ApiException] homogène en cas d'erreur (HTTP, réseau, parsing).
  Future<dynamic> _envoyer(Future<http.Response> Function() requete) async {
    try {
      final reponse = await requete();
      return _traiter(reponse);
    } on TimeoutException {
      throw const ApiException('Le serveur met trop de temps à répondre.');
    } on SocketException {
      throw const ApiException('Impossible de joindre le serveur.');
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException('Erreur inattendue : $e');
    }
  }

  dynamic _traiter(http.Response reponse) {
    dynamic corps;
    try {
      corps = reponse.body.isNotEmpty ? jsonDecode(reponse.body) : null;
    } on FormatException {
      corps = null;
    }

    if (reponse.statusCode >= 200 && reponse.statusCode < 300) {
      return corps;
    }

    final message = (corps is Map && corps['message'] is String)
        ? corps['message'] as String
        : 'Erreur ${reponse.statusCode} lors de l\'appel à l\'API.';

    throw ApiException(message, statusCode: reponse.statusCode);
  }

  void close() => _httpClient.close();
}