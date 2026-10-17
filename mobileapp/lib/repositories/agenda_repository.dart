// lib/repositories/agenda_repository.dart
//
// Consommation de l'agenda d'un médecin, en miroir de agenda.controller.js
// côté backend :
//   - lecture PUBLIQUE des créneaux (grille de prise de rendez-vous,
//     reprogrammation), du référentiel horaire et du gabarit hebdomadaire ;
//   - gestion par le MÉDECIN propriétaire (token requis) : remplacement du
//     gabarit hebdomadaire, fermeture / réouverture d'un créneau précis.
//
// Même patron que [MedecinRepository] / [RendezVousRepository] : HTTP
// direct via `package:http` et [ApiRealEndpoints], aucun état applicatif.
//
// Le serveur reste seul juge (créneau libre, futur, sans autre RDV actif,
// droits du médecin) : ce repository ne fait que transmettre.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/agenda_models.dart';
import '../utils/endpoint.dart';
import 'rendez_vous_repository.dart' show ApiException;

class AgendaRepository {
  static const Duration _timeout = Duration(seconds: 15);

  Map<String, String> _entetes({String? token, bool avecJson = false}) => {
        'Accept': 'application/json',
        if (avecJson) 'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  /// Décode la réponse ; lève [ApiException] (message et corps du serveur)
  /// si le statut n'est pas 2xx.
  dynamic _decoder(http.Response reponse) {
    if (reponse.statusCode < 200 || reponse.statusCode >= 300) {
      var message = 'Erreur ${reponse.statusCode}';
      Map<String, dynamic>? donnees;
      try {
        final corps = jsonDecode(reponse.body);
        if (corps is Map<String, dynamic>) {
          donnees = corps;
          if (corps['message'] is String) message = corps['message'] as String;
        }
      } catch (_) {
        // Corps non JSON : on garde le message par défaut.
      }
      throw ApiException(message, statusCode: reponse.statusCode, donnees: donnees);
    }
    if (reponse.body.isEmpty) return null;
    return jsonDecode(reponse.body);
  }

  List<T> _liste<T>(dynamic donnees, String cle, T Function(Map<String, dynamic>) lire) {
    final brute = (donnees is Map && donnees[cle] is List) ? donnees[cle] as List<dynamic> : const <dynamic>[];
    final resultat = <T>[];
    for (final element in brute) {
      if (element is! Map<String, dynamic>) continue;
      try {
        resultat.add(lire(element));
      } catch (_) {
        // Élément illisible : ignoré plutôt que de faire échouer toute la liste.
      }
    }
    return resultat;
  }

  /// GET /medecins/:medecinId/agenda
  ///
  /// Renvoie les créneaux dans l'ordre du serveur (date puis heure). Un
  /// créneau sans heure de début exploitable est écarté.
  Future<List<CreneauAgenda>> listerCreneaux(
    String medecinId, {
    FiltresAgenda? filtres,
  }) async {
    var uri = Uri.parse(ApiRealEndpoints.agendaMedecin(medecinId));
    final query = filtres?.toQuery();
    if (query != null && query.isNotEmpty) {
      uri = uri.replace(queryParameters: {...uri.queryParameters, ...query});
    }
    final reponse = await http.get(uri, headers: _entetes()).timeout(_timeout);
    return _liste(_decoder(reponse), 'creneaux', CreneauAgenda.fromJson)
        .where((c) => c.estExploitable)
        .toList();
  }

  /// GET /horaires — référentiel des tranches (trié par heure de début).
  Future<List<HoraireAgenda>> listerHoraires() async {
    final reponse = await http
        .get(Uri.parse(ApiRealEndpoints.horaires), headers: _entetes())
        .timeout(_timeout);
    return _liste(_decoder(reponse), 'horaires', HoraireAgenda.fromJson);
  }

  /// GET /medecins/:medecinId/disponibilites — gabarit hebdomadaire.
  Future<List<DisponibiliteMedecin>> listerDisponibilites(String medecinId) async {
    final reponse = await http
        .get(Uri.parse(ApiRealEndpoints.disponibilitesMedecin(medecinId)), headers: _entetes())
        .timeout(_timeout);
    return _liste(_decoder(reponse), 'disponibilites', DisponibiliteMedecin.fromJson);
  }

  /// PUT /medecins/:medecinId/disponibilites — REMPLACE tout le gabarit.
  /// Le serveur republie aussitôt les créneaux des semaines à venir (les
  /// créneaux déjà réservés ne sont jamais retirés).
  Future<List<DisponibiliteMedecin>> remplacerDisponibilites({
    required String medecinId,
    required List<({String jourSemaine, String horaireId})> disponibilites,
    required String token,
  }) async {
    final reponse = await http
        .put(
          Uri.parse(ApiRealEndpoints.disponibilitesMedecin(medecinId)),
          headers: _entetes(token: token, avecJson: true),
          body: jsonEncode({
            'disponibilites': [
              for (final d in disponibilites) {'jour_semaine': d.jourSemaine, 'horaire_id': d.horaireId},
            ],
          }),
        )
        .timeout(_timeout);
    return _liste(_decoder(reponse), 'disponibilites', DisponibiliteMedecin.fromJson);
  }

  /// PUT /creneaux-agenda/:id { statut } — ferme (`bloque`) ou rouvre
  /// (`disponible`) un créneau précis. 409 si un rendez-vous l'occupe.
  Future<void> changerStatutCreneau({
    required String creneauId,
    required StatutCreneauAgenda statut,
    required String token,
  }) async {
    final reponse = await http
        .put(
          Uri.parse(ApiRealEndpoints.creneauAgenda(creneauId)),
          headers: _entetes(token: token, avecJson: true),
          body: jsonEncode({'statut': statut.toApi()}),
        )
        .timeout(_timeout);
    _decoder(reponse);
  }
}
