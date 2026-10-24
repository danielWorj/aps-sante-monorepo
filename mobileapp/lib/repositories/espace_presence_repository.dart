// lib/repositories/espace_presence_repository.dart
//
// Espaces pharmacie et centre de santé — miroir de
// server/src/routes/espacePresence.routes.js (fiche de l'espace actif,
// tableau de bord, horaires, photos, actualités, messages, gardes, avis,
// prestations), de la modification de la fiche (PUT /pharmacies/:id,
// PUT /centres-sante/:id) et des abonnements de présence
// (/abonnements-presence/...). Même patron que [LaboratoireRepository] :
// HTTP direct, aucun état, le [token] est fourni à chaque appel.
//
// Règle d'or des abonnements : le montant n'est JAMAIS envoyé — l'app
// transmet niveau + durée, le serveur calcule et fige le prix.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/espace_presence_models.dart';
import '../models/portail_assurance_models.dart' show CollecteMobileMoney, InstructionsVirement;
import '../utils/endpoint.dart';
import '../utils/identifiant_installation.dart';
import '../utils/multipart_utils.dart';
import 'assurance_repository.dart' show ApiException;

/// Fichier à envoyer en multipart.
class FichierPresence {
  final List<int> octets;
  final String nom;
  const FichierPresence(this.octets, this.nom);
}

class EspacePresenceRepository {
  static const Duration _timeout = Duration(seconds: 20);
  static const Duration _timeoutTeleversement = Duration(minutes: 2);
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

  Future<dynamic> _get(String chemin, String token, {Map<String, String>? query}) async {
    var uri = Uri.parse('$_base$chemin');
    if (query != null && query.isNotEmpty) uri = uri.replace(queryParameters: query);
    return _decoder(await http.get(uri, headers: _entetes(token)).timeout(_timeout));
  }

  Future<dynamic> _envoyer(String methode, String chemin, String token, [Map<String, dynamic>? corps]) async {
    final requete = http.Request(methode, Uri.parse('$_base$chemin'))..headers.addAll(_entetes(token, avecJson: corps != null));
    if (corps != null) requete.body = jsonEncode(corps);
    final flux = await requete.send().timeout(_timeout);
    return _decoder(await http.Response.fromStream(flux));
  }

  /// Multipart : les champs vides sont ENVOYÉS (une chaîne vide efface la
  /// valeur côté serveur, ex. adresse) ; seuls les champs absents de la
  /// carte sont laissés inchangés.
  Future<dynamic> _multipart(
    String methode,
    String chemin,
    String token, {
    required Map<String, String> champs,
    Map<String, FichierPresence?> fichiers = const {},
  }) async {
    final requete = http.MultipartRequest(methode, Uri.parse('$_base$chemin'))
      ..headers.addAll({'Authorization': 'Bearer $token', 'Accept': 'application/json', ...IdentifiantInstallation.entete})
      ..fields.addAll(champs);
    for (final e in fichiers.entries) {
      final f = e.value;
      if (f == null) continue;
      requete.files.add(http.MultipartFile.fromBytes(e.key, f.octets, filename: f.nom, contentType: mediaTypeDepuisNom(f.nom)));
    }
    final flux = await requete.send().timeout(_timeoutTeleversement);
    return _decoder(await http.Response.fromStream(flux));
  }

  /* ---------------------------- Fiche ---------------------------- */

  Future<FichePresence> maFiche(TypeEspacePresence type, {required String token}) async {
    return FichePresence.fromJson(type, _carte(await _get('${type.base}/mon-espace', token)));
  }

  /// Identité, coordonnées, présentation (repasse la fiche en vérification).
  Future<void> modifierFiche(TypeEspacePresence type, String id, {required String token, required Map<String, String> champs, FichierPresence? image}) async {
    final champImage = type == TypeEspacePresence.pharmacie ? 'image_pharmacie' : 'image_structure';
    await _multipart('PUT', '${type.base}/$id', token, champs: champs, fichiers: {champImage: image});
  }

  Future<TableauDeBordPresence> tableauDeBord(TypeEspacePresence type, String id, {required String token, int jours = 30}) async {
    return TableauDeBordPresence.fromJson(_carte(await _get('${type.base}/$id/tableau-de-bord', token, query: {'jours': '$jours'})));
  }

  /// [horaires] null : efface les horaires.
  Future<void> enregistrerHoraires(
    TypeEspacePresence type,
    String id, {
    required String token,
    required SemaineHoraires? horaires,
    String? note,
    bool? urgences24h,
  }) async {
    await _envoyer('PUT', '${type.base}/$id/horaires', token, {
      'horaires': horaires == null ? null : semaineVersJson(horaires),
      'horaires_note': ?note,
      'urgences_24h': ?urgences24h,
    });
  }

  /* ---------------------------- Photos ---------------------------- */

  Future<PhotosPresenceGestion> photos(TypeEspacePresence type, String id, {required String token}) async {
    return PhotosPresenceGestion.fromJson(_carte(await _get('${type.base}/$id/images/gestion', token)));
  }

  Future<void> ajouterPhoto(TypeEspacePresence type, String id, {required String token, required FichierPresence fichier, String? titre}) async {
    await _multipart('POST', '${type.base}/$id/images', token,
        champs: {if (titre != null && titre.trim().isNotEmpty) 'titre': titre.trim()}, fichiers: {'fichier': fichier});
  }

  Future<void> legendePhoto(String photoId, String? titre, {required String token}) =>
      _envoyer('PUT', '/photos-fiche/$photoId', token, {'titre': titre});

  Future<void> supprimerPhoto(String photoId, {required String token}) => _envoyer('DELETE', '/photos-fiche/$photoId', token);

  Future<void> ordonnerPhotos(TypeEspacePresence type, String id, {required String token, required List<String> ids}) =>
      _envoyer('PUT', '${type.base}/$id/images/ordre', token, {'ids': ids});

  /* ---------------------------- Actualités ---------------------------- */

  Future<ActualitesPresenceGestion> actualites(TypeEspacePresence type, String id, {required String token}) async {
    return ActualitesPresenceGestion.fromJson(_carte(await _get('${type.base}/$id/actualites/gestion', token)));
  }

  /// [actualiteId] null : création. [champs] : titre, contenu, publiee,
  /// date_publication, date_expiration (chaîne vide = sans date de fin).
  Future<void> enregistrerActualite(
    TypeEspacePresence type,
    String ficheId, {
    required String token,
    String? actualiteId,
    required Map<String, String> champs,
    FichierPresence? image,
    bool supprimerImage = false,
  }) async {
    final c = {...champs, if (supprimerImage) 'supprimer_image': 'true'};
    if (actualiteId == null) {
      await _multipart('POST', '${type.base}/$ficheId/actualites', token, champs: c, fichiers: {'image': image});
    } else {
      await _multipart('PUT', '/actualites-fiche/$actualiteId', token, champs: c, fichiers: {'image': image});
    }
  }

  Future<void> supprimerActualite(String actualiteId, {required String token}) => _envoyer('DELETE', '/actualites-fiche/$actualiteId', token);

  /* ---------------------------- Messages ---------------------------- */

  /// [statut] : non_lu | lu | archive (null : tous sauf archivés).
  Future<MessagesPresence> messages(TypeEspacePresence type, String id, {required String token, String? statut}) async {
    return MessagesPresence.fromJson(
        _carte(await _get('${type.base}/$id/messages/gestion', token, query: {'statut': ?statut})));
  }

  Future<void> changerStatutMessage(String messageId, String statut, {required String token}) =>
      _envoyer('PATCH', '/messages-fiche/$messageId', token, {'statut': statut});

  /* ---------------------------- Pharmacie ---------------------------- */

  Future<List<GardePresence>> gardes(String pharmacieId, {required String token, bool passees = false}) async {
    final d = _carte(await _get('/pharmacies/$pharmacieId/gardes/gestion', token, query: {'periode': passees ? 'passees' : 'a_venir'}));
    final liste = d['gardes'];
    return liste is List ? liste.whereType<Map<String, dynamic>>().map(GardePresence.fromJson).toList() : const [];
  }

  Future<AvisPresenceGestion> avis(String pharmacieId, {required String token}) async {
    return AvisPresenceGestion.fromJson(_carte(await _get('/pharmacies/$pharmacieId/avis/gestion', token)));
  }

  /* ---------------------------- Centre de santé ---------------------------- */

  Future<PrestationsGestion> prestations(String structureId, {required String token}) async {
    return PrestationsGestion.fromJson(_carte(await _get('/centres-sante/$structureId/prestations/gestion', token)));
  }

  Future<void> enregistrerPrestation({required String token, required String structureId, String? prestationId, required Map<String, dynamic> donnees}) async {
    if (prestationId == null) {
      await _envoyer('POST', '/centres-sante/$structureId/prestations', token, donnees);
    } else {
      await _envoyer('PUT', '/prestations-structure/$prestationId', token, donnees);
    }
  }

  Future<void> supprimerPrestation(String prestationId, {required String token}) => _envoyer('DELETE', '/prestations-structure/$prestationId', token);

  /* ---------------------------- Abonnement de présence ---------------------------- */

  Future<GestionAbonnementPresence> gestionAbonnement(TypeEspacePresence type, String id, {required String token}) async {
    return GestionAbonnementPresence.fromJson(_carte(await _get('/abonnements-presence/${type.api}/gestion', token, query: {'acteur_id': id})));
  }

  Future<OffresPresence> offres(TypeEspacePresence type, String id, {required String token}) async {
    return OffresPresence.fromJson(_carte(await _get('/abonnements-presence/${type.api}/offres', token, query: {'acteur_id': id})));
  }

  Future<({String abonnementId, bool active})> creerBrouillon(
    TypeEspacePresence type,
    String id, {
    required String token,
    required String niveauId,
    required int dureeMois,
  }) async {
    final d = _carte(await _envoyer('POST', '/abonnements-presence/${type.api}', token, {
      'acteur_id': id,
      'niveau_id': niveauId,
      'duree_mois': dureeMois,
    }));
    return (abonnementId: _carte(d['abonnement'])['abonnement_id'] as String, active: d['active'] == true);
  }

  Future<String> urlPaiementCarte(String abonnementId, {required String token}) async {
    final d = _carte(await _envoyer('POST', '/abonnements-presence/$abonnementId/paiement', token));
    return d['url'] as String;
  }

  Future<CollecteMobileMoney> payerMobileMoney(String abonnementId, {required String token, required String numero}) async {
    return CollecteMobileMoney.fromJson(await _envoyer('POST', '/abonnements-presence/$abonnementId/paiement-campay', token, {'numero': numero}));
  }

  /// en_attente_paiement | actif | annule…
  Future<String> statutAbonnement(String abonnementId, {required String token}) async {
    final d = _carte(await _get('/abonnements-presence/$abonnementId/paiement', token));
    return (d['statut_abonnement'] as String?) ?? 'en_attente_paiement';
  }

  Future<InstructionsVirement> choisirVirement(String abonnementId, {required String token}) async {
    return InstructionsVirement.fromJson(await _envoyer('POST', '/abonnements-presence/$abonnementId/virement', token));
  }
}
