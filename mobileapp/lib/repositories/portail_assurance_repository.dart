// lib/repositories/portail_assurance_repository.dart
//
// Portail assurance — miroir de server/src/routes/portailAssurance.routes.js
// et des routes d'abonnement assurance utilisées par l'agent. Même patron
// que [OffreRdvRepository] : HTTP direct, aucun état, le [token] est fourni
// à chaque appel (toujours via SessionController.appelAuthentifie côté
// providers et écrans, pour le renouvellement automatique sur 401).
//
// La fiche, les activités, options et agences passent par
// [AssuranceRepository] (déjà existant).

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/portail_assurance_models.dart';
import '../utils/endpoint.dart';
import '../utils/multipart_utils.dart';
import 'assurance_repository.dart' show ApiException;

class PortailAssuranceRepository {
  static const Duration _timeout = Duration(seconds: 15);
  // Téléversement d'une vidéo (jusqu'à 50 Mo) sur réseau mobile.
  static const Duration _timeoutTeleversement = Duration(minutes: 4);

  Map<String, String> _entetes(String token, {bool avecJson = false}) => {
        'Accept': 'application/json',
        if (avecJson) 'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
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

  Future<dynamic> _get(String url, String token, [Map<String, String>? query]) async {
    var uri = Uri.parse(url);
    if (query != null && query.isNotEmpty) uri = uri.replace(queryParameters: query);
    final r = await http.get(uri, headers: _entetes(token)).timeout(_timeout);
    return _decoder(r);
  }

  Future<dynamic> _envoyer(String methode, String url, String token, [Map<String, dynamic>? corps]) async {
    final requete = http.Request(methode, Uri.parse(url))..headers.addAll(_entetes(token, avecJson: corps != null));
    if (corps != null) requete.body = jsonEncode(corps);
    final flux = await requete.send().timeout(_timeout);
    return _decoder(await http.Response.fromStream(flux));
  }

  /* ---------------------------- Fiche ---------------------------- */

  /// GET /services-assurance/mon-service — 404 si le compte n'est agent d'aucune fiche.
  Future<FicheAssuranceGeree> maFiche({required String token}) async {
    final d = _carte(await _get(ApiRealEndpoints.monServiceAssurance, token));
    return FicheAssuranceGeree.fromJson(_carte(d['service_assurance']));
  }

  /// GET /services-assurance/:id/gestion — vue propriétaire complète.
  Future<GestionAssurance> gestion(String id, {required String token}) async {
    return GestionAssurance.fromJson(_carte(await _get(ApiRealEndpoints.gestionServiceAssurance(id), token)));
  }

  /// GET /services-assurance/:id/tableau-de-bord?jours=
  Future<TableauDeBordAssurance> tableauDeBord(String id, {required String token, int jours = 30}) async {
    final d = await _get(ApiRealEndpoints.tableauDeBordAssurance(id), token, {'jours': '$jours'});
    return TableauDeBordAssurance.fromJson(_carte(d));
  }

  /* ---------------------------- Médiathèque ---------------------------- */

  Future<MediasGestion> medias(String id, {required String token}) async {
    return MediasGestion.fromJson(_carte(await _get(ApiRealEndpoints.mediasAssuranceGestion(id), token)));
  }

  /// POST multipart (champ « fichier », « titre » facultatif). Le serveur
  /// déduit photo / vidéo du type MIME (voir mediaTypeDepuisNom).
  Future<void> ajouterMedia(
    String id, {
    required String token,
    required List<int> octets,
    required String nomFichier,
    String? titre,
  }) async {
    final requete = http.MultipartRequest('POST', Uri.parse(ApiRealEndpoints.mediasAssurance(id)))
      ..headers['Authorization'] = 'Bearer $token'
      ..headers['Accept'] = 'application/json';
    if (titre != null && titre.trim().isNotEmpty) requete.fields['titre'] = titre.trim();
    requete.files.add(http.MultipartFile.fromBytes(
      'fichier',
      octets,
      filename: nomFichier,
      contentType: mediaTypeDepuisNom(nomFichier),
    ));
    final flux = await requete.send().timeout(_timeoutTeleversement);
    _decoder(await http.Response.fromStream(flux));
  }

  Future<void> modifierTitreMedia(String mediaId, String? titre, {required String token}) async {
    await _envoyer('PUT', ApiRealEndpoints.mediaAssurance(mediaId), token, {'titre': titre});
  }

  Future<void> supprimerMedia(String mediaId, {required String token}) async {
    await _envoyer('DELETE', ApiRealEndpoints.mediaAssurance(mediaId), token);
  }

  /// [ids] : TOUS les médias du [type], dans le nouvel ordre.
  Future<void> ordonnerMedias(String id, {required String token, required String type, required List<String> ids}) async {
    await _envoyer('PUT', ApiRealEndpoints.ordreMediasAssurance(id), token, {'type': type, 'ids': ids});
  }

  /* ---------------------------- Demandes ---------------------------- */

  Future<PageDemandes> demandes(
    String id, {
    required String token,
    String? statut,
    String? recherche,
    int page = 1,
    int limite = 20,
  }) async {
    final d = await _get(ApiRealEndpoints.misesEnRelationAssurance, token, {
      'service_assurance_id': id,
      'page': '$page',
      'limite': '$limite',
      if (statut != null && statut.isNotEmpty) 'statut': statut,
      if (recherche != null && recherche.trim().isNotEmpty) 'recherche': recherche.trim(),
    });
    return PageDemandes.fromJson(_carte(d));
  }

  /// PATCH { statut?, note_interne? } — exige le droit « suivi des demandes ».
  Future<DemandeAssurance> suivreDemande(String demandeId, {required String token, String? statut, String? noteInterne, bool majNote = false}) async {
    final d = _carte(await _envoyer('PATCH', ApiRealEndpoints.miseEnRelationAssurance(demandeId), token, {
      if (statut != null) 'statut': statut,
      if (majNote) 'note_interne': noteInterne,
    }));
    return DemandeAssurance.fromJson(_carte(d['mise_en_relation']));
  }

  Future<void> supprimerDemande(String demandeId, {required String token}) async {
    await _envoyer('DELETE', ApiRealEndpoints.miseEnRelationAssurance(demandeId), token);
  }

  /* ---------------------------- Abonnement ---------------------------- */

  Future<OffresAbonnementAssurance> offres(String id, {required String token}) async {
    final d = await _get(ApiRealEndpoints.offresAbonnementAssurance, token, {'service_assurance_id': id});
    return OffresAbonnementAssurance.fromJson(_carte(d));
  }

  /// POST /abonnements-assurance -> (abonnement_id, active). Le montant
  /// n'est JAMAIS envoyé : le serveur le calcule et le fige.
  Future<({String abonnementId, bool active})> creerBrouillon(
    String id, {
    required String token,
    required String niveauId,
    required int dureeMois,
  }) async {
    final d = _carte(await _envoyer('POST', ApiRealEndpoints.abonnementsAssurance, token, {
      'service_assurance_id': id,
      'niveau_id': niveauId,
      'duree_mois': dureeMois,
    }));
    return (abonnementId: _carte(d['abonnement'])['abonnement_id'] as String, active: d['active'] == true);
  }

  /// Carte bancaire : URL Stripe Checkout à ouvrir dans le navigateur.
  Future<String> urlPaiementCarte(String abonnementId, {required String token}) async {
    final d = _carte(await _envoyer('POST', ApiRealEndpoints.paiementAbonnementAssurance(abonnementId), token));
    return d['url'] as String;
  }

  Future<CollecteMobileMoney> payerMobileMoney(String abonnementId, {required String token, required String numero}) async {
    final d = await _envoyer('POST', ApiRealEndpoints.campayAbonnementAssurance(abonnementId), token, {'numero': numero});
    return CollecteMobileMoney.fromJson(d);
  }

  /// Statut de l'abonnement (polling) : en_attente_paiement | actif | annule…
  Future<String> statutAbonnement(String abonnementId, {required String token}) async {
    final d = _carte(await _get(ApiRealEndpoints.paiementAbonnementAssurance(abonnementId), token));
    return (d['statut_abonnement'] as String?) ?? 'en_attente_paiement';
  }

  Future<void> annulerPaiement(String abonnementId, {required String token}) async {
    await _envoyer('POST', ApiRealEndpoints.annulerPaiementAbonnementAssurance(abonnementId), token);
  }

  Future<InstructionsVirement> choisirVirement(String abonnementId, {required String token}) async {
    final d = await _envoyer('POST', ApiRealEndpoints.virementAbonnementAssurance(abonnementId), token);
    return InstructionsVirement.fromJson(d);
  }
}
