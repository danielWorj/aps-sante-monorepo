// lib/repositories/agenda_repository.dart
//
// Consommation de l'agenda d'un médecin (créneaux), en miroir de
// agenda.controller.js côté backend. Utilisé par la reprogrammation
// « deux absents » (politique de fonds v2, phase 5) pour proposer un
// créneau LIBRE.
//
// Même patron que [MedecinRepository] / [RendezVousRepository] : HTTP
// direct via `package:http` et [ApiRealEndpoints], aucun état applicatif.
// La route de lecture est PUBLIQUE : aucun token n'est nécessaire.
//
// Le serveur reste seul juge (créneau libre, futur, sans autre RDV actif) :
// ce repository ne fait que lire.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/agenda_models.dart';
import '../utils/endpoint.dart';
import 'rendez_vous_repository.dart' show ApiException;

class AgendaRepository {
  static const Duration _timeout = Duration(seconds: 15);

  /// GET /medecins/:medecinId/agenda
  ///
  /// Renvoie les créneaux dans l'ordre du serveur (date puis heure). Un
  /// élément illisible est ignoré plutôt que de faire échouer toute la
  /// liste ; un créneau sans heure de début est écarté, car il ne pourrait
  /// pas être proposé.
  ///
  /// Lève [ApiException] avec le message du serveur en cas d'échec (400
  /// statut invalide, etc.).
  Future<List<CreneauAgenda>> listerCreneaux(
    String medecinId, {
    FiltresAgenda? filtres,
  }) async {
    var uri = Uri.parse(ApiRealEndpoints.agendaMedecin(medecinId));
    final query = filtres?.toQuery();
    if (query != null && query.isNotEmpty) {
      uri = uri.replace(queryParameters: {...uri.queryParameters, ...query});
    }

    final reponse = await http
        .get(uri, headers: const {'Accept': 'application/json'})
        .timeout(_timeout);

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

    if (reponse.body.isEmpty) return const <CreneauAgenda>[];
    final donnees = jsonDecode(reponse.body);
    final liste = (donnees is Map && donnees['creneaux'] is List)
        ? donnees['creneaux'] as List<dynamic>
        : const <dynamic>[];

    final resultat = <CreneauAgenda>[];
    for (final brut in liste) {
      if (brut is! Map<String, dynamic>) continue;
      try {
        final creneau = CreneauAgenda.fromJson(brut);
        if (creneau.estExploitable) resultat.add(creneau);
      } catch (_) {
        // Créneau illisible : ignoré.
      }
    }
    return resultat;
  }
}
