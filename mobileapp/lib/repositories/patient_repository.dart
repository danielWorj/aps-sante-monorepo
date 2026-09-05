// lib/repositories/patient_repository.dart
//
// Repository de consommation des APIs du module transverse "Gestion
// des médecins" — périmètre "fiche patient" (Patient), en miroir de
// src/routes/patient.routes.js et src/controllers/patient.controller.js
// côté backend, et dans le même esprit que medecin_repository.dart
// (version "annuaire médecin" de ce même module).
//
// Version "simple" : comme [MedecinRepository], ce repository parle
// DIRECTEMENT en HTTP via le package `http`, sans passer par ApiClient
// (voir api_client.dart) ni par ApiEndpoints. Toutes les routes
// viennent de ApiRealEndpoints (endpoint.dart).
//
// Comme [MedecinRepository], ce fichier ne porte AUCUN état applicatif
// (pas de cache, pas de notification UI) : il ne fait que parler HTTP
// et mapper JSON <-> modèles Dart (patient_models.dart). La gestion
// d'état (chargement, erreurs, sélection courante) appartient à un
// PatientController dédié, qui s'appuie sur ce repository.
//
// Le token d'authentification est fourni requête par requête
// (paramètre `token`, toujours `required` ici — voir juste en dessous),
// jamais stocké dans ce fichier.
//
// ⚠️ Contrairement à [MedecinRepository] (dont certaines routes de
// l'annuaire public acceptent un `token` optionnel), la fiche patient
// est une donnée PRIVÉE : TOUTES les routes de patient.routes.js
// exigent déjà "authentifier" côté backend. [token] est donc `required`
// sur chacune des méthodes ci-dessous, jamais optionnel.
//
// Rappel des règles d'accès (voir autorisationSurPatient dans
// patient.controller.js — reprises ici pour que chaque méthode
// documente qui peut légitimement l'appeler ; la vérification
// effective reste faite côté serveur, ce repository ne fait aucun
// contrôle d'autorisation lui-même) :
//   - obtenirMonProfil        : le titulaire du compte patient
//                                uniquement (déduit du token).
//   - obtenirPatient           : le patient concerné, admin/superadmin
//                                (vue complète, coordonnées incluses),
//                                ou un médecin ayant au moins un
//                                rendez-vous avec ce patient (vue
//                                restreinte : nom/prénom uniquement).
//   - listerRendezVousPatient : mêmes règles ; pour un médecin tiers,
//                                seuls SES PROPRES rendez-vous avec ce
//                                patient sont renvoyés (jamais le
//                                dossier complet).
//
// Toute erreur (HTTP >= 400, réseau, parsing) remonte sous forme
// d'[ApiException]. Un patient/médecin non autorisé reçoit un 404 (et
// non un 403) côté backend, pour ne pas révéler l'existence de la
// fiche — ce repository se contente de relayer ce statut tel quel.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/patient_models.dart';
import '../utils/endpoint.dart';

/// Erreur levée quand une requête HTTP échoue (statut hors 2xx) ou
/// quand un appel est mal formé côté client (ex. statut invalide).
/// Même rôle que l'ApiException de medecin_repository.dart ; redéfinie
/// ici pour que ce fichier reste autonome (aucune dépendance vers
/// api_client.dart), même patron que dans MedecinRepository.
class ApiException implements Exception {
  final String message;
  final int? statusCode;

  const ApiException(this.message, {this.statusCode});

  @override
  String toString() => message;
}

/// Statuts de rendez-vous acceptés en filtre par
/// [PatientRepository.listerRendezVousPatient] — même liste que
/// STATUTS_RDV dans patient.controller.js (voir StatutRendezVous dans
/// patient_models.dart, qui porte la même énumération côté modèle).
const List<StatutRendezVous> _statutsRdvValides = StatutRendezVous.values;

class PatientRepository {
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
      try {
        final corps = jsonDecode(reponse.body);
        if (corps is Map && corps['message'] is String) {
          message = corps['message'] as String;
        }
      } catch (_) {
        // Corps non-JSON : on garde le message par défaut.
      }
      throw ApiException(message, statusCode: reponse.statusCode);
    }
    if (reponse.body.isEmpty) return null;
    return jsonDecode(reponse.body);
  }

  Future<dynamic> _get(
      String url, {
        String? token,
        Map<String, String>? query,
      }) async {
    var uri = Uri.parse(url);
    if (query != null && query.isNotEmpty) {
      uri = uri.replace(queryParameters: {...uri.queryParameters, ...query});
    }
    final reponse = await http
        .get(uri, headers: _entetes(token: token, avecJson: false))
        .timeout(_timeout);
    return _decoder(reponse);
  }

  /* ===================================================================
   * Fiche patient
   * =================================================================== */

  /// GET /patients/mon-profil
  /// Réservé au titulaire du compte patient (déduit de [token]).
  /// Retourne la fiche patient complète (utilisateur inclus, vue
  /// "complète") accompagnée des statistiques d'activité (nombre de
  /// rendez-vous, prochain rendez-vous à venir, nombre d'ordonnances)
  /// — dédié à l'écran "Mon profil" du patient. Lève [ApiException]
  /// avec statusCode 404 si aucun profil patient n'est associé au
  /// compte connecté (ex. compte médecin/admin sans fiche patient).
  Future<MonProfilPatientResponse> obtenirMonProfil({
    required String token,
  }) async {
    final donnees =
    await _get(ApiRealEndpoints.monProfilPatient, token: token);
    return MonProfilPatientResponse.fromJson(donnees as Map<String, dynamic>);
  }

  /// GET /patients/:id
  /// Ouvert au patient concerné, à admin/superadmin (vue complète,
  /// coordonnées incluses), ou à un médecin ayant au moins un
  /// rendez-vous avec ce patient (vue restreinte : nom/prénom
  /// uniquement — voir [UtilisateurPatient.estVueComplete] pour
  /// détecter laquelle des deux vues a été reçue). Lève
  /// [ApiException] avec statusCode 404 si le patient n'existe pas OU
  /// si l'appelant n'est pas autorisé à le consulter (le backend ne
  /// distingue volontairement pas les deux cas, pour ne pas révéler
  /// l'existence de la fiche à un tiers non autorisé).
  Future<Patient> obtenirPatient(
      String id, {
        required String token,
      }) async {
    final donnees =
    await _get(ApiRealEndpoints.patient(id), token: token);
    return Patient.fromJson(
      (donnees as Map<String, dynamic>)['patient'] as Map<String, dynamic>,
    );
  }

  /// GET /patients/:id/rendez-vous
  /// Liste des rendez-vous du patient [id], du plus récent au plus
  /// ancien. Filtre optionnel [statut] (voir [StatutRendezVous]) —
  /// lève [ApiException] (statusCode 400) si le backend le rejette
  /// comme invalide, en toute rigueur inatteignable ici puisque
  /// [statut] est déjà typé par l'énumération Dart.
  /// Mêmes règles d'accès que [obtenirPatient] ; pour un médecin
  /// tiers autorisé (vue restreinte), seuls SES PROPRES rendez-vous
  /// avec ce patient sont renvoyés — jamais ceux pris avec d'autres
  /// médecins, pour ne pas exposer le dossier complet du patient.
  Future<List<RendezVousPatient>> listerRendezVousPatient(
      String id, {
        required String token,
        StatutRendezVous? statut,
      }) async {
    assert(
    statut == null || _statutsRdvValides.contains(statut),
    'Statut de rendez-vous inconnu : $statut',
    );
    final donnees = await _get(
      ApiRealEndpoints.rendezVousPatient(id),
      token: token,
      query: statut != null ? {'statut': statut.toJson()} : null,
    );
    final liste = (donnees is Map && donnees['rendez_vous'] is List)
        ? donnees['rendez_vous'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => RendezVousPatient.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}