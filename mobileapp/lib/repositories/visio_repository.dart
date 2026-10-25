// lib/repositories/visio_repository.dart
//
// Miroir de visio.controller.js côté backend : une seule route,
// authentifiée, token requis (pas optionnel), comme RendezVousRepository.
//
// Version "simple" : ce repository parle DIRECTEMENT en HTTP via le
// package `http`, sans passer par ApiClient (voir api_client.dart) ni
// par ApiEndpoints — même patron que medecin_repository.dart /
// pharmacie_repository.dart / assurance_repository.dart. La route
// vient de ApiRealEndpoints (endpoint.dart).
//
// Comme dans la version précédente, ce fichier ne porte AUCUN état
// applicatif : il ne fait que parler HTTP et mapper JSON <-> modèle
// (visio_models.dart). La gestion d'état (chargement, erreurs) reste
// dans VisioController (lib/controllers/visio_controller.dart).
//
// Le token d'authentification est fourni requête par requête
// (paramètre `token`), jamais stocké ici.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/visio_models.dart';
import '../utils/endpoint.dart';

/// Erreur levée quand une requête HTTP échoue (statut hors 2xx) ou
/// quand un appel est mal formé côté client. Remplace l'ApiException
/// de api_client.dart pour ce repository, qui ne dépend plus de ce
/// fichier — même patron que dans medecin_repository.dart.
class ApiException implements Exception {
  final String message;
  final int? statusCode;

  /// Code applicatif éventuel renvoyé par le serveur dans le corps JSON
  /// (ex. `RDV_NON_PAYE`).
  final String? code;

  const ApiException(this.message, {this.statusCode, this.code});

  /// Vrai si l'échec vient d'une absence/expiration d'authentification.
  bool get estNonAutorise => statusCode == 401 || statusCode == 403;

  /// D8 : le serveur refuse (409 `RDV_NON_PAYE`) une action du médecin sur
  /// un rendez-vous non payé.
  bool get estRdvNonPaye => statusCode == 409 && code == 'RDV_NON_PAYE';

  @override
  String toString() => message;
}

class VisioRepository {
  static const Duration _timeout = Duration(seconds: 10);

  /* ===================================================================
   * Aides HTTP internes (remplacent ApiClient)
   * =================================================================== */

  Map<String, String> _entetes({String? token, bool avecJson = true}) {
    final entetes = <String, String>{};
    if (avecJson) entetes['Content-Type'] = 'application/json';
    if (token != null) entetes['Authorization'] = 'Bearer $token';
    return entetes;
  }

  /// Décode le corps de la réponse et lève [ApiException] si le
  /// statut n'est pas un succès (2xx).
  dynamic _decoder(http.Response reponse) {
    if (reponse.statusCode < 200 || reponse.statusCode >= 300) {
      String message = 'Erreur ${reponse.statusCode}: ${reponse.body}';
      String? code;
      try {
        final corps = jsonDecode(reponse.body);
        if (corps is Map && corps['message'] is String) {
          message = corps['message'] as String;
        }
        if (corps is Map && corps['code'] is String) {
          code = corps['code'] as String;
        }
      } catch (_) {
        // Corps non-JSON : on garde le message par défaut.
      }
      throw ApiException(message, statusCode: reponse.statusCode, code: code);
    }
    if (reponse.body.isEmpty) return null;
    return jsonDecode(reponse.body);
  }

  Future<dynamic> _post(
      String url, {
        Map<String, dynamic>? body,
        String? token,
      }) async {
    final reponse = await http
        .post(
      Uri.parse(url),
      headers: _entetes(token: token),
      body: jsonEncode(body ?? const {}),
    )
        .timeout(_timeout);
    return _decoder(reponse);
  }

  /* ===================================================================
   * Visio (téléconsultation Jitsi)
   * =================================================================== */

  /// POST /visio/token — récupère le JWT Jitsi (à usage unique) pour
  /// rejoindre la téléconsultation d'un rendez-vous donné.
  Future<VisioSession> obtenirTokenVisio({
    required String rdvId,
    required String token,
  }) async {
    final donnees = await _post(
      ApiRealEndpoints.visioToken,
      body: {'rdv_id': rdvId},
      token: token,
    );
    return VisioSession.fromJson(donnees as Map<String, dynamic>);
  }

  /// POST /visio/:id/cloture — fin d'appel de l'utilisateur courant.
  /// Médecin : clôt la consultation. Patient : bilan seul.
  Future<BilanClotureVisio> cloturer({
    required String rdvId,
    required String token,
  }) async {
    final donnees = await _post(ApiRealEndpoints.visioCloture(rdvId), token: token);
    return BilanClotureVisio.fromJson(donnees as Map<String, dynamic>);
  }

  /// POST /visio/:id/presence — l'utilisateur est entré dans la salle
  /// (doublon volontaire du webhook Prosody, qui peut manquer : sans
  /// présences, la fin de consultation n'est pas constatée).
  Future<void> signalerPresence({
    required String rdvId,
    required String token,
  }) async {
    await _post(ApiRealEndpoints.visioPresence(rdvId), token: token);
  }

  /// GET /visio/:id/cloture — bilan sans effet (le patient attend la
  /// clôture par le médecin).
  Future<BilanClotureVisio> obtenirBilan({
    required String rdvId,
    required String token,
  }) async {
    final reponse = await http
        .get(Uri.parse(ApiRealEndpoints.visioCloture(rdvId)),
            headers: _entetes(token: token, avecJson: false))
        .timeout(_timeout);
    return BilanClotureVisio.fromJson(_decoder(reponse) as Map<String, dynamic>);
  }
}
