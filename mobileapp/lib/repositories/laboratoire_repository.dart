// lib/repositories/laboratoire_repository.dart
//
// Module « Laboratoires d'analyses » — miroir de
// server/src/routes/laboratoire.routes.js. Même patron que
// [PortailAssuranceRepository] : HTTP direct, aucun état, le [token] est
// fourni à chaque appel (facultatif sur les lectures publiques, pour que le
// gérant ne compte pas de vue et voie sa fiche non publiée).

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/laboratoire_models.dart';
import '../utils/endpoint.dart';
import '../utils/identifiant_installation.dart';
import '../utils/multipart_utils.dart';
import 'assurance_repository.dart' show ApiException;

/// Fichier à envoyer en multipart.
class FichierLaboratoire {
  final List<int> octets;
  final String nom;
  const FichierLaboratoire(this.octets, this.nom);
}

class LaboratoireRepository {
  static const Duration _timeout = Duration(seconds: 20);
  static const Duration _timeoutTeleversement = Duration(minutes: 4);
  static const String _base = ApiRealEndpoints.baseUrl;

  Map<String, String> _entetes(String? token, {bool avecJson = false}) => {
        'Accept': 'application/json',
        ...IdentifiantInstallation.entete,
        if (avecJson) 'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  dynamic _decoder(http.Response reponse) {
    if (reponse.statusCode < 200 || reponse.statusCode >= 300) {
      var message = 'Erreur ${reponse.statusCode}';
      String? code;
      try {
        final corps = jsonDecode(reponse.body);
        if (corps is Map) {
          if (corps['message'] is String) message = corps['message'] as String;
          if (corps['code'] is String) code = corps['code'] as String;
        }
      } catch (_) {
        // Corps non JSON : message par défaut.
      }
      throw ApiException(message, statusCode: reponse.statusCode, code: code);
    }
    if (reponse.body.isEmpty) return null;
    return jsonDecode(reponse.body);
  }

  Map<String, dynamic> _carte(dynamic d) => d is Map<String, dynamic> ? d : <String, dynamic>{};
  List<Map<String, dynamic>> _liste(dynamic d) => d is List ? d.whereType<Map<String, dynamic>>().toList() : const [];

  Future<dynamic> _get(String chemin, {String? token, Map<String, String>? query}) async {
    var uri = Uri.parse('$_base$chemin');
    if (query != null && query.isNotEmpty) uri = uri.replace(queryParameters: query);
    return _decoder(await http.get(uri, headers: _entetes(token)).timeout(_timeout));
  }

  Future<dynamic> _envoyer(String methode, String chemin, {required String? token, Map<String, dynamic>? corps}) async {
    final requete = http.Request(methode, Uri.parse('$_base$chemin'))..headers.addAll(_entetes(token, avecJson: corps != null));
    if (corps != null) requete.body = jsonEncode(corps);
    final flux = await requete.send().timeout(_timeout);
    return _decoder(await http.Response.fromStream(flux));
  }

  Future<dynamic> _multipart(
    String methode,
    String chemin, {
    required String token,
    required Map<String, String> champs,
    required Map<String, FichierLaboratoire?> fichiers,
  }) async {
    final requete = http.MultipartRequest(methode, Uri.parse('$_base$chemin'))
      ..headers.addAll({'Authorization': 'Bearer $token', 'Accept': 'application/json'})
      ..fields.addAll(champs..removeWhere((_, v) => v.isEmpty));
    for (final e in fichiers.entries) {
      final f = e.value;
      if (f == null) continue;
      requete.files.add(http.MultipartFile.fromBytes(e.key, f.octets, filename: f.nom, contentType: mediaTypeDepuisNom(f.nom)));
    }
    final flux = await requete.send().timeout(_timeoutTeleversement);
    return _decoder(await http.Response.fromStream(flux));
  }

  /* ---------------------------- Annuaire ---------------------------- */

  Future<List<Laboratoire>> lister({FiltresLaboratoires filtres = const FiltresLaboratoires(), double? lat, double? lng, double? rayonKm}) async {
    final d = _carte(await _get('/laboratoires', query: {
      if (filtres.paysId != null) 'pays_id': filtres.paysId!,
      if (filtres.villeId != null) 'ville_id': filtres.villeId!,
      if (filtres.examen != null && filtres.examen!.trim().isNotEmpty) 'examen': filtres.examen!.trim(),
      if (lat != null && lng != null) ...{'lat': '$lat', 'lng': '$lng', 'rayon_km': '${rayonKm ?? 10}'},
    }));
    return _liste(d['laboratoires']).map(Laboratoire.fromJson).toList();
  }

  Future<Laboratoire> obtenir(String id, {String? token}) async {
    final d = _carte(await _get('/laboratoires/$id', token: token));
    return Laboratoire.fromJson(_carte(d['laboratoire']));
  }

  Future<({List<ExamenLaboratoire> examens, List<String> categories})> examens(String id, {String? token}) async {
    final d = _carte(await _get('/laboratoires/$id/examens', token: token));
    return (
      examens: _liste(d['examens']).map(ExamenLaboratoire.fromJson).toList(),
      categories: (d['categories'] is List ? (d['categories'] as List).whereType<String>().toList() : <String>[]),
    );
  }

  Future<List<CentreLaboratoire>> centres(String id, {String? token}) async {
    final d = _carte(await _get('/laboratoires/$id/centres', token: token));
    return _liste(d['centres']).map(CentreLaboratoire.fromJson).toList();
  }

  Future<List<MediaLaboratoire>> mediasPublics(String id) async {
    final d = _carte(await _get('/laboratoires/$id/medias'));
    return _liste(d['medias']).map(MediaLaboratoire.fromJson).toList();
  }

  Future<PageAvisLaboratoire> avis(String id, {String? token, int page = 1, int limite = 5}) async {
    final d = _carte(await _get('/laboratoires/$id/avis', token: token, query: {'page': '$page', 'limite': '$limite'}));
    return PageAvisLaboratoire.fromJson(d);
  }

  Future<String> deposerAvis(String id, {required String token, required int note, String? commentaire}) async {
    final d = _carte(await _envoyer('POST', '/laboratoires/$id/avis', token: token, corps: {'note': note, 'commentaire': commentaire ?? ''}));
    return (d['message'] as String?) ?? 'Avis envoyé.';
  }

  /// Engagement sur la fiche publique — silencieux (une statistique ne doit
  /// jamais gêner le visiteur).
  Future<void> signalerEngagement(String id, String type, {String? token}) async {
    try {
      await _envoyer('POST', '/laboratoires/$id/engagements', token: token, corps: {'type': type});
    } catch (_) {
      // Ignoré.
    }
  }

  /* ---------------------------- Création ---------------------------- */

  Future<LaboratoireCreationResultat> creer({
    required String token,
    required Map<String, String> champs,
    required FichierLaboratoire image,
    required FichierLaboratoire pieceIdentite,
    required FichierLaboratoire documentAgrement,
  }) async {
    final d = await _multipart('POST', '/laboratoires', token: token, champs: champs, fichiers: {
      'image_laboratoire': image,
      'piece_identite': pieceIdentite,
      'document_agrement': documentAgrement,
    });
    return LaboratoireCreationResultat.fromJson(_carte(d));
  }

  /* ---------------------------- Portail ---------------------------- */

  Future<Laboratoire> monLaboratoire({required String token}) async {
    final d = _carte(await _get('/laboratoires/mon-laboratoire', token: token));
    return Laboratoire.fromJson(_carte(d['laboratoire']));
  }

  Future<GestionLaboratoire> gestion(String id, {required String token}) async {
    return GestionLaboratoire.fromJson(_carte(await _get('/laboratoires/$id/gestion', token: token)));
  }

  Future<TableauDeBordLaboratoire> tableauDeBord(String id, {required String token, int jours = 30}) async {
    return TableauDeBordLaboratoire.fromJson(
        _carte(await _get('/laboratoires/$id/tableau-de-bord', token: token, query: {'jours': '$jours'})));
  }

  Future<void> modifierFiche(String id, {required String token, required Map<String, String> champs, FichierLaboratoire? image}) async {
    await _multipart('PUT', '/laboratoires/$id', token: token, champs: champs, fichiers: {'image_laboratoire': image});
  }

  Future<void> enregistrerExamen({required String token, required String laboratoireId, String? examenId, required Map<String, dynamic> donnees}) async {
    if (examenId == null) {
      await _envoyer('POST', '/laboratoires/$laboratoireId/examens', token: token, corps: donnees);
    } else {
      await _envoyer('PUT', '/examens-laboratoire/$examenId', token: token, corps: donnees);
    }
  }

  Future<void> supprimerExamen(String examenId, {required String token}) =>
      _envoyer('DELETE', '/examens-laboratoire/$examenId', token: token);

  Future<void> enregistrerCentre({required String token, required String laboratoireId, String? centreId, required Map<String, dynamic> donnees}) async {
    if (centreId == null) {
      await _envoyer('POST', '/laboratoires/$laboratoireId/centres', token: token, corps: donnees);
    } else {
      await _envoyer('PUT', '/centres-laboratoire/$centreId', token: token, corps: donnees);
    }
  }

  Future<void> supprimerCentre(String centreId, {required String token}) =>
      _envoyer('DELETE', '/centres-laboratoire/$centreId', token: token);

  Future<MediasLaboratoireGestion> mediasGestion(String id, {required String token}) async {
    return MediasLaboratoireGestion.fromJson(_carte(await _get('/laboratoires/$id/medias/gestion', token: token)));
  }

  Future<void> ajouterMedia(String id, {required String token, required FichierLaboratoire fichier, String? titre}) async {
    await _multipart('POST', '/laboratoires/$id/medias', token: token,
        champs: {'titre': titre?.trim() ?? ''}, fichiers: {'fichier': fichier});
  }

  Future<void> modifierTitreMedia(String mediaId, String? titre, {required String token}) =>
      _envoyer('PUT', '/medias-laboratoire/$mediaId', token: token, corps: {'titre': titre});

  Future<void> supprimerMedia(String mediaId, {required String token}) =>
      _envoyer('DELETE', '/medias-laboratoire/$mediaId', token: token);

  Future<void> ordonnerMedias(String id, {required String token, required String type, required List<String> ids}) =>
      _envoyer('PUT', '/laboratoires/$id/medias/ordre', token: token, corps: {'type': type, 'ids': ids});
}
