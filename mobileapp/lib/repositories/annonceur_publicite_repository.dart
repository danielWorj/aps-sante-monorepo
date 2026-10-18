// lib/repositories/annonceur_publicite_repository.dart
//
// Publicité v9 côté visiteur et annonceur : carrousel d'une page, suivi des
// affichages / clics, réservation d'un espace (multipart avec le flyer),
// portail annonceur, paiement de la publicité acceptée.
//
// Le montant n'est JAMAIS envoyé : le client choisit un forfait, le serveur
// fige le prix. Le token est passé à chaque appel par l'appelant
// (SessionController.appelAuthentifie, voir annonceur_publicite_controller.dart).
// Les erreurs HTTP lèvent [ApiException] (publicite_repository.dart).

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/annonceur_publicite_models.dart';
import '../utils/endpoint.dart';
import '../utils/multipart_utils.dart';
import 'publicite_repository.dart' show ApiException;

class AnnonceurPubliciteRepository {
  static const Duration _timeout = Duration(seconds: 15);
  static const String _base = '${ApiRealEndpoints.baseUrl}/publicites';

  Map<String, String> _entetes(String? token, {bool json = true}) => {
        if (json) 'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  dynamic _decoder(http.Response r) {
    if (r.statusCode < 200 || r.statusCode >= 300) {
      var message = 'Erreur ${r.statusCode}';
      try {
        final corps = jsonDecode(r.body);
        if (corps is Map && corps['message'] is String) {
          message = corps['message'] as String;
          final libre = (corps['details'] as Map?)?['prochaine_date_libre'];
          if (libre is String) message = '$message Prochaine date libre : ${jourLisible(DateTime.tryParse('${libre}T00:00:00Z'))}.';
        }
      } catch (_) {
        // Corps non JSON : message par défaut.
      }
      throw ApiException(message, statusCode: r.statusCode);
    }
    return r.body.isEmpty ? null : jsonDecode(r.body);
  }

  Future<dynamic> _get(String url, {String? token, Map<String, String>? query}) async {
    final uri = Uri.parse(url).replace(queryParameters: (query == null || query.isEmpty) ? null : query);
    return _decoder(await http.get(uri, headers: _entetes(token, json: false)).timeout(_timeout));
  }

  Future<dynamic> _post(String url, {String? token, Map<String, dynamic>? body}) async {
    return _decoder(await http
        .post(Uri.parse(url), headers: _entetes(token), body: jsonEncode(body ?? const {}))
        .timeout(_timeout));
  }

  /* ----------------------------- Diffusion ----------------------------- */

  /// Carrousel de la page ; null si aucun emplacement n'existe pour ce code.
  Future<SliderPage?> sliderPage(String code, {String? paysId}) async {
    try {
      final d = await _get('$_base/par-page/${Uri.encodeComponent(code)}', query: {'pays_id': ?paysId});
      return SliderPage.fromJson((d as Map).cast<String, dynamic>());
    } on ApiException catch (e) {
      if (e.statusCode == 404) return null;
      rethrow;
    }
  }

  /// Affichage ou clic ; ne lève jamais (un suivi ne gêne pas l'affichage).
  Future<void> signalerEvenement(String type, List<String> ids) async {
    if (ids.isEmpty) return;
    try {
      await _post('$_base/evenements', body: {'type': type, 'publicite_ids': ids});
    } catch (_) {
      // Ignoré.
    }
  }

  /* ----------------------------- Réservation ----------------------------- */

  Future<List<ForfaitReservable>> forfaitsPage(String codePage, {String? paysId, String? token}) async {
    final d = await _get('${ApiRealEndpoints.baseUrl}/forfaits-publicitaires',
        token: token, query: {'code_page': codePage, 'pays_id': ?paysId});
    return ((d['forfaits'] as List?) ?? const [])
        .map((e) => ForfaitReservable.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<DisponibiliteForfait> disponibilites(String forfaitId, {required String token}) async {
    final d = await _get('$_base/disponibilites', token: token, query: {'forfait_publicitaire_id': forfaitId});
    return DisponibiliteForfait.fromJson((d as Map).cast<String, dynamic>());
  }

  Future<ProfilAnnonceur> profilAnnonceur({required String token}) async {
    final d = await _get('$_base/profil-annonceur', token: token);
    return ProfilAnnonceur.fromJson((d as Map).cast<String, dynamic>());
  }

  /// POST /publicites (multipart) -> publicité créée, « en_moderation ».
  Future<MaPublicite> reserver({
    required Map<String, String> champs,
    required List<int> visuelOctets,
    required String visuelNomFichier,
    required String token,
  }) async {
    final requete = http.MultipartRequest('POST', Uri.parse(_base))
      ..headers['Authorization'] = 'Bearer $token';
    champs.forEach((k, v) {
      if (v.trim().isNotEmpty) requete.fields[k] = v.trim();
    });
    requete.files.add(http.MultipartFile.fromBytes('visuel', visuelOctets,
        filename: visuelNomFichier, contentType: mediaTypeDepuisNom(visuelNomFichier)));
    final reponse = await http.Response.fromStream(await requete.send().timeout(const Duration(seconds: 60)));
    final d = _decoder(reponse);
    return MaPublicite.fromJson((d['publicite'] as Map).cast<String, dynamic>());
  }

  /* ----------------------------- Portail annonceur ----------------------------- */

  Future<MesPublicites> mesPublicites({required String token}) async {
    final d = await _get('$_base/mes-publicites', token: token);
    return MesPublicites(
      ((d['publicites'] as List?) ?? const []).map((e) => MaPublicite.fromJson((e as Map).cast<String, dynamic>())).toList(),
      ResumeAnnonceur.fromJson((d['resume'] as Map).cast<String, dynamic>()),
    );
  }

  Future<MaPublicite> publicite(String id, {required String token}) async {
    final d = await _get('$_base/$id', token: token);
    return MaPublicite.fromJson((d['publicite'] as Map).cast<String, dynamic>());
  }

  Future<StatistiquesPublicite> statistiques(String id, {required String token}) async {
    final d = await _get('$_base/$id/statistiques', token: token);
    return StatistiquesPublicite.fromJson((d as Map).cast<String, dynamic>());
  }

  Future<void> annulerDemande(String id, {required String token}) => _post('$_base/$id/annuler', token: token);

  /* ----------------------------- Paiement ----------------------------- */

  Future<DevisPublicite> devis(String id, String agregateur, {required String token}) async {
    final d = await _get('$_base/$id/devis', token: token, query: {'agregateur': agregateur});
    return DevisPublicite.fromJson((d as Map).cast<String, dynamic>());
  }

  /// URL Stripe Checkout (ouverte dans le navigateur).
  Future<String> urlPaiementCarte(String id, {required String token}) async {
    final d = await _post('$_base/$id/paiement', token: token);
    return d['url'] as String;
  }

  Future<CollectePublicite> payerMobileMoney(String id, {required String numero, required String token}) async {
    final d = await _post('$_base/$id/paiement-campay', token: token, body: {'numero': numero});
    return CollectePublicite(reference: d['reference'] as String?, ussdCode: d['ussd_code'] as String?);
  }

  /// Statut de la publicité après synchronisation des paiements en cours
  /// (« payee » une fois le paiement confirmé) et dernière tentative CamPay.
  Future<({String statut, String? tentativeCampay})> statutPaiement(String id, {required String token}) async {
    final d = await _get('$_base/$id/paiement', token: token);
    return (
      statut: (d['statut_publicite'] as String?) ?? '',
      tentativeCampay: (d['tentative_campay'] as Map?)?['statut'] as String?,
    );
  }
}
