// lib/repositories/reputation_medecin_repository.dart
//
// Réputation du médecin — miroir des routes de reputationMedecin.controller.js
// et du dépôt d'avis (avis.controller.js). Même patron que
// [PortailAssuranceRepository] : HTTP direct, sans état ; le [token] est
// fourni à chaque appel authentifié (via SessionController.appelAuthentifie
// côté providers, pour le renouvellement automatique sur 401).

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/reputation_medecin_models.dart';
import '../utils/endpoint.dart';
import '../utils/identifiant_installation.dart';
import 'assurance_repository.dart' show ApiException;

class ReputationMedecinRepository {
  static const Duration _timeout = Duration(seconds: 15);

  Map<String, String> _entetes(String? token, {bool avecJson = false}) => {
        'Accept': 'application/json',
        if (avecJson) 'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  dynamic _decoder(http.Response r) {
    if (r.statusCode < 200 || r.statusCode >= 300) {
      var message = 'Erreur ${r.statusCode}';
      String? code;
      try {
        final corps = jsonDecode(r.body);
        if (corps is Map) {
          if (corps['message'] is String) message = corps['message'] as String;
          if (corps['code'] is String) code = corps['code'] as String;
        }
      } catch (_) {
        // Corps non JSON : message par défaut.
      }
      throw ApiException(message, statusCode: r.statusCode, code: code);
    }
    if (r.body.isEmpty) return null;
    return jsonDecode(r.body);
  }

  Map<String, dynamic> _carte(dynamic d) => d is Map<String, dynamic> ? d : <String, dynamic>{};

  Future<dynamic> _get(String url, {String? token, Map<String, String> query = const {}}) async {
    final params = {for (final e in query.entries) if (e.value.isNotEmpty) e.key: e.value};
    var uri = Uri.parse(url);
    if (params.isNotEmpty) uri = uri.replace(queryParameters: params);
    return _decoder(await http.get(uri, headers: _entetes(token)).timeout(_timeout));
  }

  Future<dynamic> _envoyer(String methode, String url, {String? token, Map<String, dynamic>? corps, Map<String, String> extra = const {}}) async {
    final req = http.Request(methode, Uri.parse(url))
      ..headers.addAll({..._entetes(token, avecJson: corps != null), ...extra});
    if (corps != null) req.body = jsonEncode(corps);
    final flux = await req.send().timeout(_timeout);
    return _decoder(await http.Response.fromStream(flux));
  }

  /* ------------------------------ Médecin ------------------------------ */

  /// GET /medecins/mon-espace/tableau-de-bord?du&au&granularite
  Future<TableauDeBordMedecin> tableauDeBord({
    required String token,
    required String du,
    required String au,
    required String granularite,
  }) async {
    final d = await _get(ApiRealEndpoints.tableauDeBordMedecin,
        token: token, query: {'du': du, 'au': au, 'granularite': granularite});
    return TableauDeBordMedecin.fromJson(_carte(d));
  }

  /// GET /medecins/mon-espace/avis?note&reponse&commentaire&tri&page
  Future<PageAvis> mesAvis({
    required String token,
    int? note,
    String reponse = '',
    bool avecCommentaire = false,
    String tri = 'recent',
    int page = 1,
  }) async {
    final d = await _get(ApiRealEndpoints.mesAvisMedecin, token: token, query: {
      'note': note?.toString() ?? '',
      'reponse': reponse,
      'commentaire': avecCommentaire ? 'avec' : '',
      'tri': tri,
      'page': '$page',
    });
    return PageAvis.fromJson(_carte(d));
  }

  /// PUT /avis-medecin/:id/reponse — renvoie l'avis à jour.
  Future<AvisPublic> repondre(String avisId, String reponse, {required String token}) async {
    final d = _carte(await _envoyer('PUT', ApiRealEndpoints.reponseAvisMedecin(avisId),
        token: token, corps: {'reponse': reponse}));
    return AvisPublic.fromJson(_carte(d['avis']));
  }

  /// DELETE /avis-medecin/:id/reponse
  Future<void> supprimerReponse(String avisId, {required String token}) async {
    await _envoyer('DELETE', ApiRealEndpoints.reponseAvisMedecin(avisId), token: token);
  }

  /// POST /avis-medecin/:id/signaler — renvoie le message du serveur.
  Future<String> signaler(String avisId, String motif, {required String token}) async {
    final d = _carte(await _envoyer('POST', ApiRealEndpoints.signalerAvisMedecin(avisId),
        token: token, corps: {'motif': motif}));
    return d['message'] as String? ?? 'Avis signalé.';
  }

  /* ------------------------------- Public ------------------------------- */

  /// GET /medecins/:id/avis — public, pages de 5.
  Future<PageAvis> avisPublics(String medecinId, {int? note, String tri = 'recent', int page = 1, int parPage = 5}) async {
    final d = await _get(ApiRealEndpoints.avisPublicsMedecin(medecinId), query: {
      'note': note?.toString() ?? '',
      'tri': tri,
      'page': '$page',
      'par_page': '$parPage',
    });
    return PageAvis.fromJson(_carte(d));
  }

  /// POST /medecins/:id/engagements — statistique « fire and forget » :
  /// ne lève jamais (une mesure d'audience ne doit pas gêner la navigation).
  Future<void> signalerEngagement(String medecinId, String type, {String? token}) async {
    try {
      await _envoyer('POST', ApiRealEndpoints.engagementsMedecin(medecinId),
          token: token, corps: {'type': type}, extra: IdentifiantInstallation.entete);
    } catch (_) {
      // Ignoré volontairement.
    }
  }

  /* ------------------------------- Patient ------------------------------- */

  /// GET /avis-medecin/a-donner
  Future<List<ConsultationANoter>> consultationsANoter({required String token}) async {
    final d = _carte(await _get(ApiRealEndpoints.consultationsANoter, token: token));
    final l = d['consultations'];
    return l is List ? l.map((e) => ConsultationANoter.fromJson(_carte(e))).toList() : const [];
  }

  /// POST /avis-medecin — renvoie le message du serveur.
  Future<String> deposerAvis(Map<String, dynamic> donnees, {required String token}) async {
    final d = _carte(await _envoyer('POST', ApiRealEndpoints.avisMedecin, token: token, corps: donnees));
    return d['message'] as String? ?? 'Merci pour votre avis !';
  }
}
