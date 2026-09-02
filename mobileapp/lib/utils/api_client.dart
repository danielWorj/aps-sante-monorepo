// lib/utils/api_client.dart
//
// Client HTTP central de l'application.
// - Porte l'URL de base de l'API + la définition des endpoints.
// - Centralise la construction des requêtes (headers, token, timeout).
// - Transforme toute erreur HTTP/réseau en [ApiException] exploitable
//   par les repositories/controllers.
//
// Ce fichier ne contient AUCUNE logique métier : il ne fait que parler
// HTTP. Le mapping JSON -> modèles se fait dans les repositories.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:riverpod/riverpod.dart';

/// Regroupe tous les chemins d'API exposés par le backend Express.
/// Garder les endpoints ici évite de disperser des chaînes de
/// caractères "en dur" dans les repositories.
class ApiEndpoints {
  ApiEndpoints._();
  // ─── Authentification (module transverse "authentification") ────
  // Voir authentification.routes.js / authentification.controller.js.
  //   - register, login, refresh                : publiques.
  //   - changer-mot-de-passe-initial             : publique au sens
  //     où elle ne passe pas par `authentifier`, mais verrouillée par
  //     `exigerTokenChangementMotDePasse` (token restreint renvoyé par
  //     /login en Authorization: Bearer, PAS un access token normal).
  //   - logout, me                               : authentifié (tout
  //     rôle).
  //   - comptes                                  : authentifié,
  //     réservé à admin/superadmin (matrice fine appliquée côté
  //     contrôleur, cf. ROLES_CREABLES_PAR).
  //   - bootstrap-superadmin                     : publique mais
  //     verrouillée par l'en-tête `X-Setup-Token` (PAS Authorization),
  //     et désactivée dès qu'un superadmin existe déjà. Voir
  //     AmorcageSuperAdminPayload.toHeaders() côté modèles : ApiClient
  //     ne sachant poser que Authorization: Bearer, cette route passe
  //     par un appel HTTP dédié dans le repository plutôt que par
  //     post()/get() ci-dessous.
  //   - Le refresh token n'apparaît jamais dans un payload/endpoint
  //     ici : il voyage uniquement via un cookie httpOnly posé par le
  //     serveur (voir authentification_repository.dart pour les
  //     prérequis côté client HTTP).
  static const String inscription = '/auth/register';
  static const String connexion = '/auth/login';
  static const String changementMotDePasseInitial =
      '/auth/changer-mot-de-passe-initial';
  static const String rafraichissement = '/auth/refresh';
  static const String deconnexion = '/auth/logout';
  static const String profilCourant = '/auth/me';
  static const String comptes = '/auth/comptes';
  static const String amorcageSuperAdmin = '/auth/bootstrap-superadmin';

  // ─── Référentiel géographique (lecture publique) ────────────────
  static const String langues = '/referentiels/langues';
  static String langue(String id) => '/referentiels/langues/$id';

  static const String devises = '/referentiels/devises';
  static String devise(String id) => '/referentiels/devises/$id';

  static const String pays = '/referentiels/pays';
  static String unPays(String id) => '/referentiels/pays/$id';

  static const String villes = '/referentiels/villes';
  static String uneVille(String id) => '/referentiels/villes/$id';

  // ─── Rôles (IAM) — nécessite une authentification ────────────────
  static const String roles = '/referentiels/roles';
  static String role(String id) => '/referentiels/roles/$id';

  // ─── Médecins (module transverse "Gestion des médecins") ─────────
  // Fiche annuaire — voir medecin.routes.js.
  static const String medecins = '/medecins';
  static String medecin(String id) => '/medecins/$id';
  static const String monProfilMedecin = '/medecins/mon-profil';
  static String publierMedecin(String id) => '/medecins/$id/publier';
  static String suspendreMedecin(String id) => '/medecins/$id/suspendre';
  static String reactiverMedecin(String id) => '/medecins/$id/reactiver';
  static const String verifierOrdreMedecin = '/medecins/verifier-ordre';

  // Spécialités médicales (référentiel autonome, lecture publique).
  static const String specialites = '/specialites';
  static String specialite(String id) => '/specialites/$id';

  // ─── Rendez-vous (module transverse "Gestion des médecins") ──────
  // Voir rendezVous.controller.js / medecin.routes.js (lignes
  // 296-310) : toutes les routes exigent "authentifier" — aucune
  // n'est publique. Suppression physique réservée à admin/superadmin.
  static const String rendezVous = '/rendez-vous';
  static String unRendezVous(String id) => '/rendez-vous/$id';
  static String statutRendezVous(String id) => '/rendez-vous/$id/statut';

  // ─── Ordonnances (module transverse "Gestion des médecins") ──────
  // Voir rendezVous.controller.js / medecin.routes.js (lignes
  // 316-328) : toutes authentifiées. Création réservée au médecin du
  // rendez-vous concerné ; suppression réservée à admin/superadmin.
  static const String ordonnances = '/ordonnances';
  static String uneOrdonnance(String id) => '/ordonnances/$id';

  // ─── Centres de santé (module "annuaire — centre de santé") ──────
  // Voir centreSante.routes.js :
  //   - GET liste/détail : publiques, pas de jeton requis.
  //   - POST création    : authentifié (tout rôle), multipart,
  //                        3 fichiers requis (image_structure,
  //                        piece_identite, document_agrement).
  //   - PUT modification : authentifié (tout rôle), multipart,
  //                        fichiers optionnels.
  //   - DELETE suppression : authentifié + superadmin uniquement.
  static const String centresSante = '/centres-sante';
  static String centreSante(String id) => '/centres-sante/$id';

  // ─── Assurance (module "annuaire — assurance") ────────────────────
  // Voir assurance.routes.js :
  //   - services-assurance : GET publique ; POST/PUT authentifié (tout
  //     rôle), multipart (1 fichier "image_assurance" obligatoire à la
  //     création, optionnel en modification) ; DELETE superadmin.
  //   - mises-en-relation-assurance : POST authentifié (tout rôle) ;
  //     GET/DELETE réservés à l'agent du service concerné ou à un admin.
  //   - activites / options-activite / agences : GET publique ; écriture
  //     réservée à l'agent du service_assurance concerné ou à un admin.
  static const String servicesAssurance = '/services-assurance';
  static String serviceAssurance(String id) => '/services-assurance/$id';

  static const String misesEnRelationAssurance =
      '/mises-en-relation-assurance';
  static String miseEnRelationAssurance(String id) =>
      '/mises-en-relation-assurance/$id';

  static const String activites = '/activites';
  static String activite(String id) => '/activites/$id';

  static const String optionsActivite = '/options-activite';
  static String optionActivite(String id) => '/options-activite/$id';

  static const String agences = '/agences';
  static String agence(String id) => '/agences/$id';

  // ─── Pharmacies (module "annuaire — pharmacie" + sous-module
  // "Gardes officielles") ────────────────────────────────────────────
  // Voir pharmacie.routes.js :
  //   - GET pharmacies / plannings-garde / gardes-pharmacie : PUBLIQUES,
  //     sans authentification (recherche d'une pharmacie ou d'une garde
  //     avant même la création d'un compte).
  //   - POST/PUT pharmacies : authentifié (tout rôle, patient inclus),
  //     multipart, 3 fichiers requis à la création (image_pharmacie,
  //     piece_identite, document_agrement) + champs de création du
  //     compte agent (fonction, agent_nom, agent_prenom, agent_email,
  //     agent_telephone) — voir creerPharmacie côté contrôleur.
  //   - DELETE pharmacies : authentifié + superadmin uniquement.
  //   - POST/PUT/DELETE plannings-garde et gardes-pharmacie : admin ou
  //     superadmin uniquement — planification réglementaire centralisée,
  //     jamais soumise par les pharmacies elles-mêmes.
  static const String pharmacies = '/pharmacies';
  static String pharmacie(String id) => '/pharmacies/$id';

  static const String planningsGarde = '/plannings-garde';
  static String planningGarde(String id) => '/plannings-garde/$id';

  static const String gardesPharmacie = '/gardes-pharmacie';
  static String gardePharmacie(String id) => '/gardes-pharmacie/$id';
}

/// Exception métier levée par [ApiClient] pour toute réponse en échec
/// (statut HTTP >= 400) ou tout problème réseau/format. Porte le
/// message renvoyé par le backend (`{ "message": "..." }`) quand il
/// est disponible, ce qui permet de l'afficher tel quel côté UI.
class ApiException implements Exception {
  final int? statusCode;
  final String message;

  const ApiException(this.message, {this.statusCode});

  /// Vrai si l'échec vient d'une absence/expiration d'authentification.
  bool get estNonAutorise => statusCode == 401 || statusCode == 403;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// Décrit un fichier à téléverser en multipart (ex: cni, attestation,
/// photo, cv d'un médecin ; image_structure, piece_identite,
/// document_agrement d'un centre de santé). On travaille en octets
/// bruts (`Uint8List` obtenu via `XFile.readAsBytes()`/`image_picker`/
/// `file_picker`) plutôt qu'en `dart:io File`, pour rester compatible
/// Flutter Web.
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

/// Regroupe la configuration réseau (URL de base de l'API).
/// Centraliser cette valeur ici évite de la dupliquer/hardcoder dans
/// plusieurs fichiers (repositories, main.dart, tests...).
///
/// ⚠️ Adapte cette valeur à ton environnement :
///   - Émulateur Android : http://10.0.2.2:3000
///   - Simulateur iOS / Web / Desktop : http://localhost:3000
///   - Appareil physique (ou émulateur qui ne route pas 10.0.2.2) :
///     http://<IP_DE_TA_MACHINE_SUR_LE_RESEAU_LOCAL>:3000
///
/// 10.0.2.2 est un alias spécial UNIQUEMENT valable depuis un
/// émulateur Android standard (AVD) — il pointe vers le localhost de
/// la machine hôte. Sur un appareil physique (ou tout environnement
/// qui n'est pas cet émulateur précis), cette adresse n'est pas
/// joignable : chaque requête échoue silencieusement en
/// SocketException/timeout, capturée et transformée en [ApiException]
/// par [ApiClient._envoyer] — d'où l'impression que "ApiClient bug"
/// alors que c'est simplement la mauvaise adresse réseau.
///
/// Ici on utilise l'IP réelle de la machine hôte sur le réseau local
/// (celle avec laquelle l'appel direct http.get() fonctionnait).
class ApiConfig {
  ApiConfig._();

  /// URL de base du serveur Express, SANS slash final et SANS le
  /// préfixe des routes (les chemins dans [ApiEndpoints] commencent
  /// déjà par '/', ex: '/auth/login').
  static const String baseUrl = 'http://10.0.2.2:3000/api';
}

/// Client HTTP minimal, sans dépendance à un état global : le token
/// d'authentification est fourni requête par requête (via [token])
/// plutôt que stocké ici, pour que ce fichier reste un simple
/// transport et que la gestion de session reste au niveau supérieur
/// (ex: un AuthController / middleware d'auth).
class ApiClient {
  /// URL de base de l'API, sans slash final.
  /// Ex: http://localhost:3000
  final String baseUrl;

  final Duration timeout;

  /// Client HTTP optionnel (tests/mock). Quand il est fourni, TOUTES les
  /// requêtes (y compris multipart) passent par lui. Quand il est
  /// `null` (cas normal en prod), les requêtes get/post/put/delete/
  /// patch utilisent les fonctions de package `http.get()`, `http.post()`,
  /// etc. — EXACTEMENT comme l'appel qui fonctionne dans
  /// `listerMedecins()`. Ces fonctions de package gèrent elles-mêmes la
  /// création/fermeture d'un client par requête ; elles ne passent PAS
  /// par un `http.Client()` explicite. Seul le multipart, qui n'a pas
  /// d'équivalent au niveau package, crée encore un `http.Client()` à la
  /// volée (voir [_envoyerMultipart]).
  final http.Client? _httpClientInjecte;

  ApiClient({
    this.baseUrl = ApiConfig.baseUrl,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 15),
  }) : _httpClientInjecte = httpClient;

  http.Client _creerClient() => _httpClientInjecte ?? http.Client();

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final cleanBase = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    final cleanPath = path.startsWith('/') ? path : '/$path';

    // On ne garde que les paramètres non nuls, convertis en String.
    final Map<String, String>? queryParameters = query == null
        ? null
        : {
      for (final entry in query.entries)
        if (entry.value != null) entry.key: entry.value.toString(),
    };

    return Uri.parse('$cleanBase$cleanPath').replace(
      queryParameters:
      (queryParameters != null && queryParameters.isNotEmpty)
          ? queryParameters
          : null,
    );
  }

  Map<String, String> _headers({String? token, bool withBody = false}) {
    return {
      'Accept': 'application/json',
      if (withBody) 'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  /// GET, avec query params optionnels et token optionnel.
  Future<dynamic> get(
      String path, {
        Map<String, dynamic>? query,
        String? token,
      }) {
    final uri = _uri(path, query);
    final headers = _headers(token: token);
    return _envoyer(() => _httpClientInjecte != null
        ? _httpClientInjecte.get(uri, headers: headers).timeout(timeout)
        : http.get(uri, headers: headers).timeout(timeout));
  }

  /// POST avec corps JSON.
  Future<dynamic> post(
      String path, {
        Map<String, dynamic>? body,
        String? token,
      }) {
    final uri = _uri(path);
    final headers = _headers(token: token, withBody: true);
    final corps = jsonEncode(body ?? {});
    return _envoyer(() => _httpClientInjecte != null
        ? _httpClientInjecte
        .post(uri, headers: headers, body: corps)
        .timeout(timeout)
        : http.post(uri, headers: headers, body: corps).timeout(timeout));
  }

  /// PUT avec corps JSON.
  Future<dynamic> put(
      String path, {
        Map<String, dynamic>? body,
        String? token,
      }) {
    final uri = _uri(path);
    final headers = _headers(token: token, withBody: true);
    final corps = jsonEncode(body ?? {});
    return _envoyer(() => _httpClientInjecte != null
        ? _httpClientInjecte
        .put(uri, headers: headers, body: corps)
        .timeout(timeout)
        : http.put(uri, headers: headers, body: corps).timeout(timeout));
  }

  /// DELETE.
  Future<dynamic> delete(String path, {String? token}) {
    final uri = _uri(path);
    final headers = _headers(token: token);
    return _envoyer(() => _httpClientInjecte != null
        ? _httpClientInjecte.delete(uri, headers: headers).timeout(timeout)
        : http.delete(uri, headers: headers).timeout(timeout));
  }

  /// PATCH avec corps JSON optionnel (ex: changements de statut ciblés
  /// comme /medecins/:id/publier, /rendez-vous/:id/statut).
  Future<dynamic> patch(
      String path, {
        Map<String, dynamic>? body,
        String? token,
      }) {
    final uri = _uri(path);
    final headers = _headers(token: token, withBody: true);
    final corps = jsonEncode(body ?? {});
    return _envoyer(() => _httpClientInjecte != null
        ? _httpClientInjecte
        .patch(uri, headers: headers, body: corps)
        .timeout(timeout)
        : http.patch(uri, headers: headers, body: corps).timeout(timeout));
  }

  /// POST multipart/form-data (champs texte/bool + fichiers). Utilisé
  /// pour les endpoints qui téléversent des pièces jointes (ex: POST
  /// /medecins : cni/attestation/photo ; POST /centres-sante :
  /// image_structure/piece_identite/document_agrement).
  Future<dynamic> postMultipart(
      String path, {
        Map<String, dynamic>? champs,
        List<FichierMultipart>? fichiers,
        String? token,
      }) {
    return _envoyerMultipart('POST', path,
        champs: champs, fichiers: fichiers, token: token);
  }

  /// PUT multipart/form-data — même règle que [postMultipart], pour le
  /// remplacement optionnel de pièces jointes existantes (ex: PUT
  /// /medecins/:id, PUT /centres-sante/:id).
  Future<dynamic> putMultipart(
      String path, {
        Map<String, dynamic>? champs,
        List<FichierMultipart>? fichiers,
        String? token,
      }) {
    return _envoyerMultipart('PUT', path,
        champs: champs, fichiers: fichiers, token: token);
  }

  Future<dynamic> _envoyerMultipart(
      String methode,
      String path, {
        Map<String, dynamic>? champs,
        List<FichierMultipart>? fichiers,
        String? token,
      }) async {
    final client = _creerClient();
    try {
      final requete = http.MultipartRequest(methode, _uri(path));
      requete.headers.addAll(_headers(token: token));

      champs?.forEach((cle, valeur) {
        if (valeur == null) return;
        requete.fields[cle] =
        valeur is bool ? valeur.toString() : valeur.toString();
      });

      for (final fichier in fichiers ?? const <FichierMultipart>[]) {
        requete.files.add(http.MultipartFile.fromBytes(
          fichier.champ,
          fichier.octets,
          filename: fichier.nomFichier,
        ));
      }

      final flux = await client.send(requete).timeout(timeout);
      final reponse = await http.Response.fromStream(flux);
      return _traiter(reponse);
    } on TimeoutException {
      throw const ApiException('Le serveur met trop de temps à répondre.');
    } on SocketException {
      throw const ApiException('Impossible de joindre le serveur.');
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException('Erreur inattendue : $e');
    } finally {
      client.close();
    }
  }

  /// Exécute la requête, décode la réponse JSON et lève une
  /// [ApiException] homogène en cas d'erreur (HTTP, réseau, parsing).
  ///
  /// [requete] appelle directement une fonction de package (`http.get()`,
  /// `http.post()`, etc.) — comme [listerMedecins] côté repository — ou
  /// le client injecté en test. Il n'y a plus de `http.Client()` créé et
  /// fermé manuellement ici pour les appels JSON simples : c'était
  /// suspecté d'être la source des `SocketException` observées sur
  /// certains appareils/réseaux alors que l'appel direct fonctionnait.
  Future<dynamic> _envoyer(
      Future<http.Response> Function() requete) async {
    try {
      final reponse = await requete();
      return _traiter(reponse);
    } on TimeoutException {
      throw const ApiException('Le serveur met trop de temps à répondre.');
    } on SocketException {
      throw const ApiException('Impossible de joindre le serveur.');
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException('Erreur inattendue : $e');
    }
  }

  dynamic _traiter(http.Response reponse) {
    dynamic corps;
    try {
      corps = reponse.body.isNotEmpty ? jsonDecode(reponse.body) : null;
    } on FormatException {
      corps = null;
    }

    if (reponse.statusCode >= 200 && reponse.statusCode < 300) {
      return corps;
    }

    final message = (corps is Map && corps['message'] is String)
        ? corps['message'] as String
        : 'Erreur ${reponse.statusCode} lors de l\'appel à l\'API.';

    throw ApiException(message, statusCode: reponse.statusCode);
  }

  /// Ne fait plus rien : il n'y a plus de client HTTP persistant à
  /// fermer, chaque requête crée puis ferme le sien (voir
  /// [_creerClient]). Conservée pour ne pas casser un éventuel appel
  /// existant (`apiClient.close()`) ailleurs dans l'app.
  void close() {}
}

/// Instance unique d'[ApiClient] partagée par tous les modules qui en
/// ont besoin (Authentification, Rendez-vous, ...). Déclarée ici — au
/// même endroit que la classe [ApiClient] — plutôt que dans l'un des
/// controllers, pour que ceux-ci n'aient pas à se pointer les uns vers
/// les autres : chacun importe simplement `api_client.dart`.
///
/// ⚠️ [MedecinRepository] (medecin_repository.dart) ne dépend PAS de ce
/// provider : il parle HTTP directement via `package:http`, sans passer
/// par [ApiClient]. Ce provider ne sert donc qu'aux modules qui, comme
/// [AuthentificationRepository] et [RendezVousRepository], prennent
/// encore un [ApiClient] en paramètre de leur constructeur.
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());