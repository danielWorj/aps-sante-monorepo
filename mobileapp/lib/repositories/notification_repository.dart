// lib/repositories/notification_repository.dart
//
// Notifications in-app (politique de fonds v2, phase 6) — miroir de
// server/src/controllers/notification.controller.js. Même patron que
// [RetraitRepository] / [RendezVousRepository] : HTTP direct via
// `package:http`, aucun état applicatif, le [token] est fourni requête par
// requête.
//
// Le serveur scope toujours les notifications à l'utilisateur connecté : le
// client ne transmet jamais d'identifiant d'utilisateur.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/rendez_vous_models.dart';
import '../utils/endpoint.dart';
import 'rendez_vous_repository.dart' show ApiException;

class NotificationRepository {
  static const Duration _timeout = Duration(seconds: 15);

  Map<String, String> _entetes(String token) => {
        'Accept': 'application/json',
        'Authorization': 'Bearer $token',
      };

  /// Décode le corps et lève [ApiException] si le statut n'est pas 2xx.
  dynamic _decoder(http.Response reponse) {
    if (reponse.statusCode < 200 || reponse.statusCode >= 300) {
      var message = 'Erreur ${reponse.statusCode}';
      try {
        final corps = jsonDecode(reponse.body);
        if (corps is Map && corps['message'] is String) {
          message = corps['message'] as String;
        }
      } catch (_) {
        // Corps non JSON : on garde le message par défaut.
      }
      throw ApiException(message, statusCode: reponse.statusCode);
    }
    if (reponse.body.isEmpty) return null;
    return jsonDecode(reponse.body);
  }

  /// GET /notifications?non_lues=true&limit=
  ///
  /// Plus récentes d'abord. `non_lues` doit valoir exactement « true » côté
  /// serveur : on n'envoie donc le paramètre que s'il est demandé. Le
  /// compteur [ListeNotifications.nonLues] est GLOBAL (il ignore le filtre
  /// et la limite).
  Future<ListeNotifications> lister({
    required String token,
    bool nonLuesSeulement = false,
    int limite = 30,
  }) async {
    final uri = Uri.parse(ApiRealEndpoints.notifications).replace(
      queryParameters: {
        if (nonLuesSeulement) 'non_lues': 'true',
        'limit': '$limite',
      },
    );
    final reponse =
        await http.get(uri, headers: _entetes(token)).timeout(_timeout);
    final donnees = _decoder(reponse);
    if (donnees is! Map<String, dynamic>) {
      return const ListeNotifications(notifications: [], nonLues: 0);
    }
    return ListeNotifications.fromJson(donnees);
  }

  /// PATCH /notifications/:id/lue — idempotent (404 si introuvable).
  Future<void> marquerLue(String notificationId, {required String token}) async {
    final reponse = await http
        .patch(
          Uri.parse(ApiRealEndpoints.notificationLue(notificationId)),
          headers: _entetes(token),
        )
        .timeout(_timeout);
    _decoder(reponse);
  }

  /// POST /notifications/lues — marque toutes les non lues.
  Future<void> marquerToutesLues({required String token}) async {
    final reponse = await http
        .post(
          Uri.parse(ApiRealEndpoints.notificationsToutesLues),
          headers: _entetes(token),
        )
        .timeout(_timeout);
    _decoder(reponse);
  }
}