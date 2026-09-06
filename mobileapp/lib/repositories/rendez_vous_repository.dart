// lib/repositories/rendez_vous_repository.dart
//
// Repository de consommation des APIs du module transverse "Gestion
// des médecins" — périmètre Rendez-vous + Ordonnance, en miroir de
// src/controllers/rendezVous.controller.js et des routes déclarées
// dans src/routes/medecin.routes.js côté backend.
//
// Version "simple" : comme [MedecinRepository]/[PatientRepository],
// ce repository parle DIRECTEMENT en HTTP via le package `http`, sans
// passer par ApiClient (utils/api_client.dart, supprimé — il pointait
// vers un serveur de développement local différent de celui utilisé
// par l'authentification et par les autres repositories, ce qui
// causait des 401 "Token invalide" ici : le token émis par
// api.azasante.com était envoyé à un tout autre serveur qui ne
// pouvait pas le vérifier). Toutes les routes viennent désormais de
// [ApiRealEndpoints] (endpoint.dart), la SEULE source de vérité pour
// l'URL de base de l'API dans l'app.
//
// Comme [MedecinRepository], ce fichier ne porte AUCUN état applicatif
// (pas de cache, pas de notification UI) : il ne fait que parler HTTP
// et mapper JSON <-> modèles Dart (rendez_vous_models.dart). La
// gestion d'état (chargement, erreurs, sélection courante) appartient
// à un RendezVousController dédié (rendez_vous_controller.dart).
//
// ⚠️ Donnée privée patient/médecin, jamais publique : TOUTES les
// routes de ce module exigent déjà "authentifier" côté backend —
// [token] est donc `required` partout ici, jamais optionnel. Le token
// est fourni requête par requête, jamais stocké dans ce fichier.
//
// Filtrage par medecin_id/patient_id (listerRendezVous/listerOrdonnances) :
// le backend ne tient compte de ces filtres que si l'appelant est
// admin/superadmin — pour un patient ou un médecin standard, la liste
// est de toute façon scopée côté serveur à son propre profil, quels
// que soient les filtres envoyés (voir RendezVousFiltres/
// OrdonnanceFiltres dans rendez_vous_models.dart).

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/rendez_vous_models.dart';
import '../utils/endpoint.dart';

/// Erreur levée quand une requête HTTP échoue (statut hors 2xx) ou
/// quand un appel est mal formé côté client (ex. rien à mettre à
/// jour). Remplace l'ApiException de l'ancien api_client.dart pour ce
/// repository, qui n'en dépend plus — même patron que
/// medecin_repository.dart / patient_repository.dart.
class ApiException implements Exception {
  final String message;
  final int? statusCode;

  const ApiException(this.message, {this.statusCode});

  /// Vrai si l'échec vient d'une absence/expiration d'authentification.
  bool get estNonAutorise => statusCode == 401 || statusCode == 403;

  @override
  String toString() => message;
}

class RendezVousRepository {
  static const Duration _timeout = Duration(seconds: 15);

  /* ===================================================================
   * Aides HTTP internes (même patron que MedecinRepository)
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

  Future<dynamic> _put(
      String url, {
        Map<String, dynamic>? body,
        String? token,
      }) async {
    final reponse = await http
        .put(
      Uri.parse(url),
      headers: _entetes(token: token),
      body: jsonEncode(body ?? const {}),
    )
        .timeout(_timeout);
    return _decoder(reponse);
  }

  Future<dynamic> _patch(
      String url, {
        Map<String, dynamic>? body,
        String? token,
      }) async {
    final reponse = await http
        .patch(
      Uri.parse(url),
      headers: _entetes(token: token),
      body: jsonEncode(body ?? const {}),
    )
        .timeout(_timeout);
    return _decoder(reponse);
  }

  Future<dynamic> _delete(String url, {String? token}) async {
    final reponse = await http
        .delete(Uri.parse(url), headers: _entetes(token: token, avecJson: false))
        .timeout(_timeout);
    return _decoder(reponse);
  }

  /* ===================================================================
   * Rendez-vous
   * =================================================================== */

  /// GET /rendez-vous
  /// Authentifié — scopé au patient/médecin courant sauf pour
  /// admin/superadmin, qui peut consulter l'ensemble et utiliser
  /// librement [filtres].
  Future<List<RendezVous>> listerRendezVous({
    RendezVousFiltres? filtres,
    required String token,
  }) async {
    final query = filtres?.toQuery();
    final donnees = await _get(
      ApiRealEndpoints.rendezVous,
      token: token,
      query: query?.map((cle, valeur) => MapEntry(cle, valeur.toString())),
    );
    final liste = (donnees is Map && donnees['rendez_vous'] is List)
        ? donnees['rendez_vous'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => RendezVous.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /rendez-vous/:id
  /// Ouvert au patient concerné, au médecin concerné, ou à
  /// admin/superadmin — 404 (et non 403) si l'appelant n'est pas
  /// autorisé, pour ne pas révéler l'existence du rendez-vous (voir
  /// estAutoriseSurRdv côté contrôleur).
  Future<RendezVous> obtenirRendezVous(String id, {required String token}) async {
    final donnees =
    await _get(ApiRealEndpoints.unRendezVous(id), token: token);
    return RendezVous.fromJson(donnees['rendez_vous'] as Map<String, dynamic>);
  }

  /// POST /rendez-vous
  /// Réservé à un compte patient (patient_id déduit du token, jamais
  /// saisi par le client). [payload.typeRdv] "teleconsultation" exige
  /// que le médecin ait activé teleconsultation_activee ; le backend
  /// lève une [ApiException] (statusCode 400) si ce n'est pas le cas,
  /// ou si medecin_id/structure_id est introuvable.
  Future<RendezVous> creerRendezVous({
    required CreerRendezVousPayload payload,
    required String token,
  }) async {
    final donnees = await _post(
      ApiRealEndpoints.rendezVous,
      body: payload.toJson(),
      token: token,
    );
    return RendezVous.fromJson(donnees['rendez_vous'] as Map<String, dynamic>);
  }

  /// PUT /rendez-vous/:id
  /// Ouvert au patient concerné, au médecin concerné, ou à
  /// admin/superadmin. Accepte [payload.statut] SANS contrôle de
  /// transition (à réserver aux écrans back-office/admin) — pour un
  /// changement de statut initié par un patient ou un médecin,
  /// préférer [changerStatutRendezVous]. Lève [ApiException] si
  /// [payload] est vide, symétrique du 400 "Aucune donnée valide à
  /// mettre à jour." renvoyé par le backend dans ce cas.
  Future<RendezVous> modifierRendezVous({
    required String id,
    required ModifierRendezVousPayload payload,
    required String token,
  }) async {
    if (payload.estVide) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }
    final donnees = await _put(
      ApiRealEndpoints.unRendezVous(id),
      body: payload.toJson(),
      token: token,
    );
    return RendezVous.fromJson(donnees['rendez_vous'] as Map<String, dynamic>);
  }

  /// PATCH /rendez-vous/:id/statut
  /// Action dédiée au changement de statut (même patron que
  /// publier/suspendre/reactiver sur medecin) : contrairement à
  /// [modifierRendezVous], le backend vérifie que la transition
  /// demandée est cohérente avec le rôle de l'appelant et le statut
  /// actuel du rdv (voir TRANSITIONS_AUTORISEES et la documentation de
  /// [ChangerStatutRendezVousPayload]). Lève [ApiException] avec
  /// statusCode 403 si la transition n'est pas autorisée pour le rôle
  /// de l'appelant, ou 400 si le rdv a déjà ce statut.
  Future<RendezVous> changerStatutRendezVous({
    required String id,
    required ChangerStatutRendezVousPayload payload,
    required String token,
  }) async {
    final donnees = await _patch(
      ApiRealEndpoints.statutRendezVous(id),
      body: payload.toJson(),
      token: token,
    );
    return RendezVous.fromJson(donnees['rendez_vous'] as Map<String, dynamic>);
  }

  /// DELETE /rendez-vous/:id
  /// Réservé à admin/superadmin côté backend — un rendez-vous s'annule
  /// via [changerStatutRendezVous]/[modifierRendezVous] (statut
  /// "annule"), il ne se supprime physiquement qu'en dernier recours
  /// administratif. Lève [ApiException] (statusCode 409) si une
  /// ordonnance est encore rattachée à ce rendez-vous.
  Future<String> supprimerRendezVous(String id, {required String token}) async {
    final donnees =
    await _delete(ApiRealEndpoints.unRendezVous(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Rendez-vous supprimé.';
  }

  /* ===================================================================
   * Ordonnances
   * =================================================================== */

  /// GET /ordonnances
  /// Authentifié — scopée au patient/médecin courant sauf pour
  /// admin/superadmin, qui peut consulter l'ensemble et utiliser
  /// librement [filtres].
  Future<List<Ordonnance>> listerOrdonnances({
    OrdonnanceFiltres? filtres,
    required String token,
  }) async {
    final query = filtres?.toQuery();
    final donnees = await _get(
      ApiRealEndpoints.ordonnances,
      token: token,
      query: query?.map((cle, valeur) => MapEntry(cle, valeur.toString())),
    );
    final liste = (donnees is Map && donnees['ordonnances'] is List)
        ? donnees['ordonnances'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => Ordonnance.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /ordonnances/:id
  /// Le médecin auteur, le patient concerné, ou admin/superadmin —
  /// 404 (et non 403) si l'appelant n'est pas autorisé, même règle de
  /// confidentialité que [obtenirRendezVous].
  Future<Ordonnance> obtenirOrdonnance(String id, {required String token}) async {
    final donnees =
    await _get(ApiRealEndpoints.uneOrdonnance(id), token: token);
    return Ordonnance.fromJson(donnees['ordonnance'] as Map<String, dynamic>);
  }

  /// POST /ordonnances
  /// Réservé au médecin du rendez-vous concerné, déduit de
  /// [payload.rdvId] côté backend (jamais un autre médecin, même
  /// admin ne peut créer une ordonnance à la place du médecin — pièce
  /// médicale nominative). [payload] ne porte pas d'identifiant_unique :
  /// généré côté serveur. Lève [ApiException] (statusCode 403) si
  /// l'appelant n'est pas le médecin du rendez-vous, ou 400 si
  /// rdv_id/pays_emission_id est introuvable.
  Future<Ordonnance> creerOrdonnance({
    required CreerOrdonnancePayload payload,
    required String token,
  }) async {
    final donnees = await _post(
      ApiRealEndpoints.ordonnances,
      body: payload.toJson(),
      token: token,
    );
    return Ordonnance.fromJson(donnees['ordonnance'] as Map<String, dynamic>);
  }

  /// PUT /ordonnances/:id
  /// Le médecin auteur ou admin/superadmin — seuls
  /// [payload.contenu]/[payload.paysEmissionId] sont modifiables ;
  /// rdv_id, medecin_id, patient_id et identifiant_unique sont
  /// immuables après émission. Lève [ApiException] si [payload] est
  /// vide, symétrique du 400 "Aucune donnée valide à mettre à jour."
  /// renvoyé par le backend dans ce cas.
  Future<Ordonnance> modifierOrdonnance({
    required String id,
    required ModifierOrdonnancePayload payload,
    required String token,
  }) async {
    if (payload.estVide) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }
    final donnees = await _put(
      ApiRealEndpoints.uneOrdonnance(id),
      body: payload.toJson(),
      token: token,
    );
    return Ordonnance.fromJson(donnees['ordonnance'] as Map<String, dynamic>);
  }

  /// DELETE /ordonnances/:id
  /// Réservé à admin/superadmin côté backend — pièce médicale, jamais
  /// supprimée par un médecin après émission.
  Future<String> supprimerOrdonnance(String id, {required String token}) async {
    final donnees =
    await _delete(ApiRealEndpoints.uneOrdonnance(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Ordonnance supprimée.';
  }
}