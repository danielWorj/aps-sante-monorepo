// lib/repositories/offre_rdv_repository.dart
//
// RDV aléatoire (RDV sur offre) — miroir de server/src/routes/offreRdv.routes.js.
// Même patron que [NotificationRepository] : HTTP direct via `package:http`,
// aucun état applicatif, le [token] est fourni requête par requête (toutes
// les routes exigent une authentification).

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/offre_rdv_models.dart';
import '../utils/endpoint.dart';
import 'rendez_vous_repository.dart' show ApiException;

class OffreRdvRepository {
  static const Duration _timeout = Duration(seconds: 15);

  Map<String, String> _entetes(String token, {bool avecJson = false}) => {
        'Accept': 'application/json',
        if (avecJson) 'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      };

  /// Décode le corps et lève [ApiException] si le statut n'est pas 2xx.
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

  List<OffreRdv> _offres(dynamic donnees) {
    final brut = donnees is Map<String, dynamic> ? donnees['offres'] : null;
    return brut is List
        ? brut.whereType<Map<String, dynamic>>().map(OffreRdv.fromJson).toList()
        : const [];
  }

  Future<dynamic> _post(String url, String token, [Map<String, dynamic>? corps]) async {
    final reponse = await http
        .post(
          Uri.parse(url),
          headers: _entetes(token, avecJson: corps != null),
          body: corps == null ? null : jsonEncode(corps),
        )
        .timeout(_timeout);
    return _decoder(reponse);
  }

  /* ---------------------------- Patient ---------------------------- */

  /// POST /offres-rdv — renvoie le nombre de médecins prévenus.
  /// [jour] (« AAAA-MM-JJ ») et [heure] (« HH:mm ») sont ceux de la ville
  /// choisie : le serveur les convertit dans le fuseau de son pays.
  Future<int> publier({
    required String token,
    required String specialiteId,
    required String villeId,
    required TypeRdvOffre typeRdv,
    required String jour,
    required String heure,
    String? motif,
  }) async {
    final donnees = await _post(ApiRealEndpoints.offresRdv, token, {
      'specialite_id': specialiteId,
      'ville_id': villeId,
      'type_rdv': typeRdv.valeurApi,
      'jour': jour,
      'heure': heure,
      if (motif != null && motif.trim().isNotEmpty) 'motif': motif.trim(),
    });
    final n = donnees is Map<String, dynamic> ? donnees['medecins_notifies'] : null;
    return n is num ? n.toInt() : 0;
  }

  /// GET /offres-rdv/mes-offres — avec les médecins qui ont répondu.
  Future<List<OffreRdv>> listerMesOffres({required String token}) async {
    final reponse = await http
        .get(Uri.parse(ApiRealEndpoints.mesOffresRdv), headers: _entetes(token))
        .timeout(_timeout);
    return _offres(_decoder(reponse));
  }

  /// POST /offres-rdv/:id/annuler — tant qu'aucun médecin n'est validé.
  Future<void> annuler(String offreId, {required String token}) async {
    await _post(ApiRealEndpoints.annulerOffreRdv(offreId), token);
  }

  /// POST /offres-rdv/:id/reponses/:reponseId/valider — crée le RDV à payer.
  Future<ValidationOffre> validerMedecin(
    String offreId,
    String reponseId, {
    required String token,
  }) async {
    final donnees = await _post(ApiRealEndpoints.validerReponseOffreRdv(offreId, reponseId), token);
    return ValidationOffre.fromJson(
      donnees is Map<String, dynamic> ? donnees : const <String, dynamic>{},
    );
  }

  /* ---------------------------- Médecin ---------------------------- */

  /// GET /offres-rdv/medecin?vue=ouvertes|mes_reponses
  Future<OffresMedecin> listerPourMedecin({
    required String token,
    bool mesReponses = false,
  }) async {
    final uri = Uri.parse(ApiRealEndpoints.offresRdvMedecin)
        .replace(queryParameters: {'vue': mesReponses ? 'mes_reponses' : 'ouvertes'});
    final reponse = await http.get(uri, headers: _entetes(token)).timeout(_timeout);
    final donnees = _decoder(reponse);
    final raison = donnees is Map<String, dynamic> ? donnees['raison_ineligibilite'] : null;
    return OffresMedecin(offres: _offres(donnees), raison: raison is String ? raison : null);
  }

  /// POST /offres-rdv/:id/reponse — { message? }
  Future<void> repondre(String offreId, {required String token, String? message}) async {
    await _post(ApiRealEndpoints.reponseOffreRdv(offreId), token, {
      'message': (message != null && message.trim().isNotEmpty) ? message.trim() : null,
    });
  }

  /// DELETE /offres-rdv/:id/reponse
  Future<void> retirerReponse(String offreId, {required String token}) async {
    final reponse = await http
        .delete(Uri.parse(ApiRealEndpoints.reponseOffreRdv(offreId)), headers: _entetes(token))
        .timeout(_timeout);
    _decoder(reponse);
  }
}
