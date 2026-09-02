// lib/repositories/centresante_repository.dart
//
// Repository du composant "annuaire — centre de santé".
//
// Version "simple" (même patron que medecin_repository.dart) : ce
// repository parle DIRECTEMENT en HTTP via le package `http`, sans
// passer par ApiClient (voir api_client.dart) ni par ApiEndpoints.
// Toutes les routes viennent de ApiRealEndpoints (endpoint.dart).
//
// Responsabilités (et seulement celles-ci — la logique métier serveur
// reste côté API) :
//   - construire les requêtes HTTP vers /centres-sante (chemins,
//     query params, corps multipart) ;
//   - mapper les réponses JSON vers les modèles de
//     centresante_models.dart ;
//   - traduire toute ApiException en exception métier typée, pour que
//     la couche UI n'ait jamais à connaître un code HTTP.
//
// Alignement avec centreSante.routes.js :
//   - lister / obtenir  -> GET, PUBLIC (token optionnel, pas requis).
//   - creer             -> POST, authentifié (tout rôle), multipart,
//                          3 fichiers requis.
//   - modifier          -> PUT, authentifié (tout rôle), multipart,
//                          fichiers optionnels.
//   - supprimer         -> DELETE, authentifié + superadmin (contrôle
//                          de rôle fait côté serveur ; ce repository
//                          relaie un éventuel 401/403 sous forme
//                          d'exception).
//
// Comme dans la version précédente, ce fichier ne porte AUCUN état
// applicatif (pas de cache, pas de notification UI) : il ne fait que
// parler HTTP et mapper JSON <-> modèles Dart. La gestion d'état
// (chargement, erreurs, sélection courante) appartient à
// CentreSanteController (lib/controllers/centresante_controller.dart),
// qui s'appuie sur ce repository.
//
// Le token d'authentification est fourni requête par requête
// (paramètre `token`), jamais stocké ici.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/centresante_models.dart';
import '../utils/endpoint.dart';

// ─────────────────────────────────────────────────────────────────
// Aides HTTP internes (remplacent ApiClient)
// ─────────────────────────────────────────────────────────────────

/// Erreur levée quand une requête HTTP échoue (statut hors 2xx).
/// Remplace l'ApiException de api_client.dart pour ce repository,
/// qui ne dépend plus de ce fichier.
class ApiException implements Exception {
  final String message;
  final int? statusCode;

  const ApiException(this.message, {this.statusCode});

  @override
  String toString() => message;
}

/// Description d'un fichier à envoyer en multipart (image_structure,
/// piece_identite, document_agrement).
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

// ─────────────────────────────────────────────────────────────────
// Exceptions métier
// ─────────────────────────────────────────────────────────────────

/// Base commune à toutes les erreurs du module centre de santé.
/// L'UI peut faire un `switch` exhaustif sur les sous-types (classe
/// scellée) plutôt que d'inspecter un code HTTP.
sealed class CentreSanteException implements Exception {
  final String message;
  const CentreSanteException(this.message);

  @override
  String toString() => message;
}

/// 400 — payload invalide : champ manquant, pays_id/ville_id
/// incohérents (ville n'appartenant pas au pays), agent_email
/// invalide, géolocalisation incomplète (une seule des deux
/// coordonnées), etc. `message` reprend le message serveur, déjà
/// explicite pour l'utilisateur.
class CentreSanteValidationException extends CentreSanteException {
  const CentreSanteValidationException(super.message);
}

/// 404 — centre de santé introuvable (obtenir / modifier / supprimer
/// un `structureId` qui n'existe pas ou plus).
class CentreSanteIntrouvableException extends CentreSanteException {
  const CentreSanteIntrouvableException(super.message);
}

/// 409 — conflit métier : ex. le compte agent a déjà un centre de
/// santé à charge, ou suppression bloquée par des agents encore
/// rattachés à la structure.
class CentreSanteConflitException extends CentreSanteException {
  const CentreSanteConflitException(super.message);
}

/// 401/403 — non authentifié, ou rôle insuffisant (typiquement DELETE
/// hors superadmin).
class CentreSanteAccesRefuseException extends CentreSanteException {
  const CentreSanteAccesRefuseException(super.message);
}

/// 5xx, ou tout autre code HTTP non couvert ci-dessus.
class CentreSanteServeurException extends CentreSanteException {
  final int? statutCode;
  const CentreSanteServeurException(super.message, {this.statutCode});
}

/// Aucune réponse HTTP obtenue (réseau coupé, timeout, DNS...).
class CentreSanteReseauException extends CentreSanteException {
  const CentreSanteReseauException(super.message);
}

// ─────────────────────────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────────────────────────

class CentreSanteRepository {
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

  // ── Lecture (publique, token optionnel) ─────────────────────────

  /// GET /centres-sante — liste, filtrable via [filtre]
  /// (pays_id, ville_id, type_structure, statut_verification,
  /// recherche). [token] optionnel : voir authentifierOptionnel côté
  /// routes si un jour la liste s'enrichit pour un utilisateur connu.
  Future<List<CentreSante>> lister({
    CentresSanteFiltre? filtre,
    String? token,
  }) async {
    final query = filtre?.toQueryParameters();
    final donnees = await _executer(() => _get(
      ApiRealEndpoints.centresSante,
      token: token,
      query: query?.map((cle, valeur) => MapEntry(cle, valeur.toString())),
    ));
    return CentresSanteListeReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).centresSante;
  }

  /// GET /centres-sante/:id — détail d'une fiche.
  /// Lève [CentreSanteIntrouvableException] si l'id n'existe pas.
  Future<CentreSante> obtenir(String structureId, {String? token}) async {
    final donnees = await _executer(() => _get(
      ApiRealEndpoints.centreSante(structureId),
      token: token,
    ));
    return CentreSanteDetailReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).centreSante;
  }

  // ── Écriture (authentifiée) ─────────────────────────────────────

  /// POST /centres-sante — crée le centre ET l'agent qui en a la
  /// charge, dans la même transaction côté serveur. Ouvert à tout
  /// utilisateur authentifié, quel que soit son rôle. Les 3 pièces
  /// jointes sont obligatoires ; fournies en octets bruts pour rester
  /// compatible Flutter Web (voir [FichierMultipart]).
  ///
  /// ⚠️ La réponse contient
  /// `reponse.agent.motDePasseTemporaire` EN CLAIR, transmis une seule
  /// fois par le serveur : à afficher immédiatement à l'auteur de la
  /// soumission puis à ne jamais journaliser ni persister au-delà de
  /// cet écran.
  ///
  /// Erreurs possibles : [CentreSanteValidationException] (400 —
  /// champ manquant, pays/ville incohérents, email invalide),
  /// [CentreSanteConflitException] (409 — le compte agent a déjà un
  /// centre à charge), [CentreSanteAccesRefuseException] (pas
  /// authentifié).
  Future<CentreSanteCreationReponse> creer({
    required CentreSanteCreationRequete requete,
    required List<int> imageStructureOctets,
    required String imageStructureNomFichier,
    required List<int> pieceIdentiteOctets,
    required String pieceIdentiteNomFichier,
    required List<int> documentAgrementOctets,
    required String documentAgrementNomFichier,
    required String token,
  }) async {
    final fichiers = <FichierMultipart>[
      FichierMultipart(
        champ: ChampsFichiersCentreSante.imageStructure,
        octets: imageStructureOctets,
        nomFichier: imageStructureNomFichier,
      ),
      FichierMultipart(
        champ: ChampsFichiersCentreSante.pieceIdentite,
        octets: pieceIdentiteOctets,
        nomFichier: pieceIdentiteNomFichier,
      ),
      FichierMultipart(
        champ: ChampsFichiersCentreSante.documentAgrement,
        octets: documentAgrementOctets,
        nomFichier: documentAgrementNomFichier,
      ),
    ];

    final donnees = await _executer(() => _multipart(
      'POST',
      ApiRealEndpoints.centresSante,
      champs: requete.toChampsTexte(),
      fichiers: fichiers,
      token: token,
    ));

    return CentreSanteCreationReponse.fromJson(
      donnees as Map<String, dynamic>,
    );
  }

  /// PUT /centres-sante/:id — modification partielle. Tout
  /// utilisateur authentifié peut modifier n'importe quelle fiche
  /// (voir centreSante.routes.js) ; seuls admin/superadmin voient leur
  /// `requete.statutVerification` pris en compte tel quel côté
  /// serveur — pour tout autre profil la fiche repasse en
  /// `en_cours`.
  ///
  /// Les 3 fichiers sont optionnels : ne fournir que ceux à
  /// remplacer. `null` == ne pas toucher au document existant.
  Future<CentreSante> modifier({
    required String structureId,
    required CentreSanteMiseAJourRequete requete,
    required String token,
    List<int>? imageStructureOctets,
    String? imageStructureNomFichier,
    List<int>? pieceIdentiteOctets,
    String? pieceIdentiteNomFichier,
    List<int>? documentAgrementOctets,
    String? documentAgrementNomFichier,
  }) async {
    final fichiers = <FichierMultipart>[
      if (imageStructureOctets != null && imageStructureNomFichier != null)
        FichierMultipart(
          champ: ChampsFichiersCentreSante.imageStructure,
          octets: imageStructureOctets,
          nomFichier: imageStructureNomFichier,
        ),
      if (pieceIdentiteOctets != null && pieceIdentiteNomFichier != null)
        FichierMultipart(
          champ: ChampsFichiersCentreSante.pieceIdentite,
          octets: pieceIdentiteOctets,
          nomFichier: pieceIdentiteNomFichier,
        ),
      if (documentAgrementOctets != null && documentAgrementNomFichier != null)
        FichierMultipart(
          champ: ChampsFichiersCentreSante.documentAgrement,
          octets: documentAgrementOctets,
          nomFichier: documentAgrementNomFichier,
        ),
    ];

    final donnees = await _executer(() => _multipart(
      'PUT',
      ApiRealEndpoints.centreSante(structureId),
      champs: requete.toChampsTexte(),
      fichiers: fichiers,
      token: token,
    ));

    return CentreSanteMiseAJourReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).centreSante;
  }

  /// DELETE /centres-sante/:id — réservé à superadmin côté serveur ;
  /// tout autre appelant reçoit [CentreSanteAccesRefuseException].
  /// Retourne le message de confirmation serveur.
  Future<String> supprimer(String structureId, {required String token}) async {
    final donnees = await _executer(() => _delete(
      ApiRealEndpoints.centreSante(structureId),
      token: token,
    ));
    return MessageReponse.fromJson(donnees as Map<String, dynamic>).message;
  }

  // ── Aides internes ──────────────────────────────────────────────

  /// Exécute un appel HTTP et traduit toute [ApiException] en
  /// exception métier du module — point unique de mapping statut ->
  /// type, pour ne pas le dupliquer dans chaque méthode publique.
  Future<dynamic> _executer(Future<dynamic> Function() appel) async {
    try {
      return await appel();
    } on ApiException catch (e) {
      throw _traduire(e);
    }
  }

  CentreSanteException _traduire(ApiException e) {
    switch (e.statusCode) {
      case 400:
        return CentreSanteValidationException(e.message);
      case 401:
      case 403:
        return CentreSanteAccesRefuseException(e.message);
      case 404:
        return CentreSanteIntrouvableException(e.message);
      case 409:
        return CentreSanteConflitException(e.message);
      case null:
        return CentreSanteReseauException(e.message);
      default:
        return CentreSanteServeurException(e.message, statutCode: e.statusCode);
    }
  }
}