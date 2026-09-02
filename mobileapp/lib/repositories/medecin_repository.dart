// lib/repositories/medecin_repository.dart
//
// Repository de consommation des APIs du module "Gestion des
// médecins" — périmètre "fiche Annuaire" (Medecin, Specialite), en
// miroir de src/routes/medecin.routes.js et
// src/controllers/medecin.controller.js côté backend, et dans le même
// esprit que medecinService.js (version web de ce même module).
//
// Version "simple" : ce repository parle DIRECTEMENT en HTTP via le
// package `http`, sans passer par ApiClient (voir api_client.dart) ni
// par ApiEndpoints. Toutes les routes viennent de
// ApiRealEndpoints (endpoint.dart).
//
// Comme dans la version précédente, ce fichier ne porte AUCUN état
// applicatif (pas de cache, pas de notification UI) : il ne fait que
// parler HTTP et mapper JSON <-> modèles Dart (medecin_models.dart).
// La gestion d'état (chargement, erreurs, sélection courante)
// appartient à MedecinController (lib/controllers/medecin_controller.dart),
// qui s'appuie sur ce repository.
//
// Le token d'authentification est fourni requête par requête
// (paramètre `token`), jamais stocké ici.
//
// ⚠️ Périmètre volontairement limité à la fiche médecin elle-même +
// au référentiel Spécialités, en miroir de medecin_models.dart (voir
// son en-tête). Avis médecin, Abonnements médecin, Rendez-vous,
// Ordonnances, Agenda sont hors périmètre de ce fichier — à traiter
// dans des repositories dédiés suivant le même patron.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/medecin_models.dart';
import '../utils/endpoint.dart';

/// Erreur levée quand une requête HTTP échoue (statut hors 2xx) ou
/// quand un appel est mal formé côté client (ex. rien à mettre à
/// jour). Remplace l'ApiException de api_client.dart pour ce
/// repository, qui ne dépend plus de ce fichier.
class ApiException implements Exception {
  final String message;
  final int? statusCode;

  const ApiException(this.message, {this.statusCode});

  @override
  String toString() => message;
}

/// Description d'un fichier à envoyer en multipart (cni, attestation,
/// photo, cv, ...).
class FichierMultipart {
  final String champ;
  final List<int> octets;
  final String nomFichier;

  const FichierMultipart({
    required this.champ,
    required this.octets,
    required this.nomFichier,
  });
}

class MedecinRepository {
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

  Future<dynamic> _patch(String url, {String? token}) async {
    final reponse = await http
        .patch(Uri.parse(url), headers: _entetes(token: token, avecJson: false))
        .timeout(_timeout);
    return _decoder(reponse);
  }

  Future<dynamic> _delete(String url, {String? token}) async {
    final reponse = await http
        .delete(Uri.parse(url), headers: _entetes(token: token, avecJson: false))
        .timeout(_timeout);
    return _decoder(reponse);
  }

  Future<dynamic> _multipart(
      String methode,
      String url, {
        Map<String, dynamic> champs = const {},
        List<FichierMultipart> fichiers = const [],
        String? token,
      }) async {
    final requete = http.MultipartRequest(methode, Uri.parse(url));
    if (token != null) {
      requete.headers['Authorization'] = 'Bearer $token';
    }
    champs.forEach((cle, valeur) {
      if (valeur != null) requete.fields[cle] = valeur.toString();
    });
    for (final fichier in fichiers) {
      requete.files.add(http.MultipartFile.fromBytes(
        fichier.champ,
        fichier.octets,
        filename: fichier.nomFichier,
      ));
    }
    final flux = await requete.send().timeout(_timeout);
    final reponse = await http.Response.fromStream(flux);
    return _decoder(reponse);
  }

  /* ===================================================================
   * Médecins (fiche Annuaire)
   * =================================================================== */

  /// GET /medecins
  /// Publique, authentification optionnelle : passer [token] quand un
  /// utilisateur est connecté pour bénéficier de la vue enrichie
  /// (email/téléphone) si son rôle le permet côté backend.
  Future<List<Medecin>> listerMedecins({
    MedecinFiltres? filtres,
    String? token,
  }) async {
    final query = filtres?.toQuery();
    final donnees = await _get(
      ApiRealEndpoints.medecins,
      token: token,
      query: query?.map((cle, valeur) => MapEntry(cle, valeur.toString())),
    );
    final liste = (donnees is Map && donnees['medecins'] is List)
        ? donnees['medecins'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => Medecin.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /medecins/:id
  /// Publique, authentification optionnelle (même règle que
  /// [listerMedecins]).
  Future<Medecin> obtenirMedecin(String id, {String? token}) async {
    final donnees = await _get(ApiRealEndpoints.medecin(id), token: token);

    // Le backend renvoie parfois la fiche enveloppée sous la clé
    // "medecin" (ex: { "medecin": { ...champs... } }), parfois les
    // champs directement à la racine selon l'endpoint/la version.
    // On tolère les deux formes pour éviter que tous les champs
    // arrivent à `null` quand l'un des deux formats change.
    final medecinJson = (donnees is Map && donnees['medecin'] is Map<String, dynamic>)
        ? donnees['medecin'] as Map<String, dynamic>
        : donnees as Map<String, dynamic>;

    return Medecin.fromJson(medecinJson);
  }

  /// GET /medecins/mon-profil
  /// Authentifié — [token] obligatoire (le backend en déduit
  /// l'utilisateur_id, il n'y a pas d'id à fournir côté client).
  Future<MonProfilMedecin> obtenirMonProfil({required String token}) async {
    final donnees = await _get(ApiRealEndpoints.monProfilMedecin, token: token);
    return MonProfilMedecin.fromJson(donnees as Map<String, dynamic>);
  }

  /// POST /medecins (candidature médecin)
  /// Publique — aucune authentification. cni et attestation sont
  /// obligatoires côté backend ; photo est optionnelle. Le mot de passe
  /// temporaire renvoyé dans le résultat n'apparaît qu'une seule fois :
  /// à afficher immédiatement à l'appelant, ne jamais le restocker.
  Future<MedecinCreationResultat> creerMedecin({
    required CreerMedecinPayload payload,
    required List<int> cniOctets,
    required String cniNomFichier,
    required List<int> attestationOctets,
    required String attestationNomFichier,
    List<int>? photoOctets,
    String? photoNomFichier,
  }) async {
    final fichiers = <FichierMultipart>[
      FichierMultipart(
        champ: 'cni',
        octets: cniOctets,
        nomFichier: cniNomFichier,
      ),
      FichierMultipart(
        champ: 'attestation',
        octets: attestationOctets,
        nomFichier: attestationNomFichier,
      ),
      if (photoOctets != null && photoNomFichier != null)
        FichierMultipart(
          champ: 'photo',
          octets: photoOctets,
          nomFichier: photoNomFichier,
        ),
    ];

    final donnees = await _multipart(
      'POST',
      ApiRealEndpoints.medecins,
      champs: payload.toChamps(),
      fichiers: fichiers,
    );
    return MedecinCreationResultat.fromJson(donnees as Map<String, dynamic>);
  }

  /// PUT /medecins/:id
  /// Ouvert au médecin propriétaire ou à admin/superadmin (vérifié côté
  /// backend à partir de [token]). Tous les fichiers sont optionnels
  /// ici : ne fournir que ceux à remplacer. Lève [ApiException] si ni
  /// [payload] ni aucun fichier n'est fourni (rien à envoyer),
  /// symétrique du 400 "Aucune donnée valide à mettre à jour." renvoyé
  /// par le backend dans ce cas.
  Future<Medecin> modifierMedecin({
    required String id,
    required String token,
    ModifierMedecinPayload? payload,
    List<int>? cniOctets,
    String? cniNomFichier,
    List<int>? attestationOctets,
    String? attestationNomFichier,
    List<int>? photoOctets,
    String? photoNomFichier,
    List<int>? cvOctets,
    String? cvNomFichier,
  }) async {
    final champs = payload?.toChamps() ?? const <String, dynamic>{};
    final fichiers = <FichierMultipart>[
      if (cniOctets != null && cniNomFichier != null)
        FichierMultipart(
            champ: 'cni', octets: cniOctets, nomFichier: cniNomFichier),
      if (attestationOctets != null && attestationNomFichier != null)
        FichierMultipart(
            champ: 'attestation',
            octets: attestationOctets,
            nomFichier: attestationNomFichier),
      if (photoOctets != null && photoNomFichier != null)
        FichierMultipart(
            champ: 'photo', octets: photoOctets, nomFichier: photoNomFichier),
      if (cvOctets != null && cvNomFichier != null)
        FichierMultipart(
            champ: 'cv', octets: cvOctets, nomFichier: cvNomFichier),
    ];

    if (champs.isEmpty && fichiers.isEmpty) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }

    final donnees = await _multipart(
      'PUT',
      ApiRealEndpoints.medecin(id),
      champs: champs,
      fichiers: fichiers,
      token: token,
    );
    return Medecin.fromJson(donnees['medecin'] as Map<String, dynamic>);
  }

  /// DELETE /medecins/:id
  /// Réservé à superadmin côté backend. Échoue avec un message clair
  /// (via [ApiException]) si des avis/abonnements/rendez-vous/
  /// ordonnances référencent encore ce médecin.
  Future<String> supprimerMedecin(String id, {required String token}) async {
    final donnees = await _delete(ApiRealEndpoints.medecin(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Fiche médecin supprimée.';
  }

  /// PATCH /medecins/:id/publier
  /// Réservé à admin/superadmin. `medecin` est absent dans le résultat
  /// quand la fiche était déjà publiée (voir [MedecinActionResultat]).
  Future<MedecinActionResultat> publierMedecin(
      String id, {
        required String token,
      }) async {
    final donnees =
    await _patch(ApiRealEndpoints.publierMedecin(id), token: token);
    return MedecinActionResultat.fromJson(donnees as Map<String, dynamic>);
  }

  /// PATCH /medecins/:id/suspendre
  /// Réservé à admin/superadmin. Bloque le compte utilisateur lié ET
  /// retire la fiche de l'annuaire public en même temps (voir en-tête
  /// de suspendreMedecin côté contrôleur). Réversible via
  /// [reactiverMedecin].
  Future<MedecinActionResultat> suspendreMedecin(
      String id, {
        required String token,
      }) async {
    final donnees =
    await _patch(ApiRealEndpoints.suspendreMedecin(id), token: token);
    return MedecinActionResultat.fromJson(donnees as Map<String, dynamic>);
  }

  /// PATCH /medecins/:id/reactiver
  /// Réservé à admin/superadmin. Débloque le compte sans republier
  /// automatiquement la fiche — appeler [publierMedecin] ensuite si
  /// nécessaire. Le backend ne renvoie qu'un message ici, jamais de
  /// fiche medecin.
  Future<String> reactiverMedecin(String id, {required String token}) async {
    final donnees =
    await _patch(ApiRealEndpoints.reactiverMedecin(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Compte médecin réactivé.';
  }

  /// POST /medecins/verifier-ordre
  /// Publique — vérifie l'appartenance au Tableau de l'Ordre National
  /// des Médecins du Cameroun (ONMC), indépendamment de tout
  /// enregistrement local. Peut être appelée avant même la création
  /// d'un compte (pré-validation du numero_ordre). Lève [ApiException]
  /// avec statusCode 502 si l'ONMC est injoignable — ne pas
  /// interpréter cette erreur comme "n'appartient pas à l'ordre".
  Future<VerificationOrdreResultat> verifierAppartenanceOrdre(
      String numeroOrdre,
      ) async {
    final donnees = await _post(
      ApiRealEndpoints.verifierOrdreMedecin,
      body: {'numero_ordre': numeroOrdre},
    );
    return VerificationOrdreResultat.fromJson(donnees as Map<String, dynamic>);
  }

  /* ===================================================================
   * Spécialités médicales (référentiel)
   * =================================================================== */
  // Table de référence autonome (même patron que Langue/Devise/Pays/
  // Ville) : lecture publique, écriture réservée à admin/superadmin,
  // suppression réservée à superadmin.

  /// GET /specialites
  /// Publique. Filtre optionnel [recherche] (sur le nom).
  Future<List<Specialite>> listerSpecialites({String? recherche}) async {
    final donnees = await _get(
      ApiRealEndpoints.specialites,
      query: (recherche != null && recherche.trim().isNotEmpty)
          ? {'recherche': recherche}
          : null,
    );
    final liste = (donnees is Map && donnees['specialites'] is List)
        ? donnees['specialites'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => Specialite.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /specialites/:id
  /// Publique.
  Future<Specialite> obtenirSpecialite(String id) async {
    final donnees = await _get(ApiRealEndpoints.specialite(id));
    return Specialite.fromJson(donnees['specialite'] as Map<String, dynamic>);
  }

  /// POST /specialites
  /// Réservé à admin/superadmin. `nom` obligatoire et unique
  /// (409 si déjà pris — remonté tel quel via [ApiException]).
  Future<Specialite> creerSpecialite({
    required String nom,
    String? description,
    required String token,
  }) async {
    final donnees = await _post(
      ApiRealEndpoints.specialites,
      body: {
        'nom': nom,
        if (description != null) 'description': description,
      },
      token: token,
    );
    return Specialite.fromJson(donnees['specialite'] as Map<String, dynamic>);
  }

  /// PUT /specialites/:id
  /// Réservé à admin/superadmin.
  Future<Specialite> modifierSpecialite(
      String id, {
        required ModifierSpecialitePayload payload,
        required String token,
      }) async {
    if (payload.estVide) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }
    final donnees = await _put(
      ApiRealEndpoints.specialite(id),
      body: payload.toJson(),
      token: token,
    );
    return Specialite.fromJson(donnees['specialite'] as Map<String, dynamic>);
  }

  /// DELETE /specialites/:id
  /// Réservé à superadmin. Échoue (via [ApiException], statusCode 409)
  /// si des médecins référencent encore cette spécialité.
  Future<String> supprimerSpecialite(
      String id, {
        required String token,
      }) async {
    final donnees =
    await _delete(ApiRealEndpoints.specialite(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Spécialité supprimée.';
  }
}