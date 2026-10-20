// lib/repositories/annonce_repository.dart
//
// Annonces — miroir de GET /annonces (route publique, annonce.routes.js).
// HTTP direct, sans état, comme reputation_medecin_repository.dart.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/annonce_models.dart';
import '../utils/endpoint.dart';
import 'assurance_repository.dart' show ApiException;

class AnnonceRepository {
  static const Duration _timeout = Duration(seconds: 15);

  /// GET /annonces?statut=true (annonces non désactivées, expirées
  /// comprises) ou ?actives=true (ni désactivées ni expirées).
  Future<List<Annonce>> lister({bool seulementEnCours = false}) async {
    final uri = Uri.parse(ApiRealEndpoints.annonces).replace(
      queryParameters: seulementEnCours ? {'actives': 'true'} : {'statut': 'true'},
    );
    final r = await http.get(uri, headers: const {'Accept': 'application/json'}).timeout(_timeout);
    if (r.statusCode < 200 || r.statusCode >= 300) {
      var message = 'Erreur ${r.statusCode}';
      try {
        final corps = jsonDecode(r.body);
        if (corps is Map && corps['message'] is String) message = corps['message'] as String;
      } catch (_) {
        // Corps non JSON : message par défaut.
      }
      throw ApiException(message, statusCode: r.statusCode);
    }
    final corps = jsonDecode(r.body);
    final liste = corps is Map ? corps['annonces'] : null;
    if (liste is! List) return const [];
    return [for (final a in liste) if (a is Map<String, dynamic>) Annonce.fromJson(a)];
  }
}
