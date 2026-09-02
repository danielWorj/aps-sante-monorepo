// lib/repositories/publicite_repository.dart
//
// Repository de consommation des APIs du module autonome "Présence,
// publicité & boost commercial" (diagramme 09_presence_publicite_boost) :
// EmplacementPublicitaire, ForfaitPublicitaire, LigneForfaitPublicitaire,
// Publicite — en miroir de publicite.routes.js et
// publicite.controller.js côté backend.
//
// Rappel métier (voir en-tête de publicite.controller.js) : ce module
// est AUTONOME depuis la v8 — une Publicite ne référence plus jamais
// pharmacie, structure_sante ni aucune autre fiche annuaire, seulement
// un utilisateur (auteur) et un pays (diffusion).
//
// Version "simple", dans le même esprit que medecin_repository.dart :
// ce fichier parle DIRECTEMENT en HTTP via le package `http`, sans
// passer par ApiClient ni par ApiEndpoints. Toutes les routes
// viennent de ApiRealEndpoints (endpoint.dart). Il ne porte AUCUN état
// applicatif (pas de cache, pas de notification UI) : il ne fait que
// parler HTTP et mapper JSON <-> modèles Dart (publicite_models.dart).
// La gestion d'état (chargement, erreurs, sélection courante)
// appartient à un futur PubliciteController, qui s'appuiera sur ce
// repository.
//
// Le token d'authentification est fourni requête par requête
// (paramètre `token`), jamais stocké ici.
//
// Ce repository est volontairement autonome (sa propre ApiException,
// son propre FichierMultipart) plutôt que de dépendre de
// medecin_repository.dart, pour ne créer aucun couplage entre modules
// qui n'en ont plus (voir en-tête de publicite.controller.js).

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/publicite_models.dart';
import '../utils/endpoint.dart';

/// Erreur levée quand une requête HTTP échoue (statut hors 2xx) ou
/// quand un appel est mal formé côté client (ex. rien à mettre à
/// jour).
class ApiException implements Exception {
  final String message;
  final int? statusCode;

  const ApiException(this.message, {this.statusCode});

  @override
  String toString() => message;
}

/// Description d'un fichier à envoyer en multipart (ici, uniquement le
/// visuel d'une publicité : champ "visuel", JPEG/PNG/WEBP — voir
/// upload.middleware.js).
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

/// Filtres optionnels pour GET /forfaits-publicitaires.
class ForfaitsPublicitairesFiltres {
  final String? emplacementPublicitaireId;

  const ForfaitsPublicitairesFiltres({this.emplacementPublicitaireId});

  Map<String, String> toQuery() => {
    if (emplacementPublicitaireId != null)
      'emplacement_publicitaire_id': emplacementPublicitaireId!,
  };
}

/// Filtres optionnels pour GET /publicites.
/// [statutModeration] n'est pris en compte côté backend que pour un
/// admin/superadmin authentifié : un visiteur public (ou tout autre
/// utilisateur) reçoit toujours uniquement les publicités "validee",
/// quel que soit ce filtre — voir listerPublicites côté contrôleur.
class PubliciteFiltres {
  final String? forfaitPublicitaireId;
  final String? emplacementPublicitaireId;
  final String? paysId;
  final StatutModerationPublicite? statutModeration;

  const PubliciteFiltres({
    this.forfaitPublicitaireId,
    this.emplacementPublicitaireId,
    this.paysId,
    this.statutModeration,
  });

  Map<String, String> toQuery() => {
    if (forfaitPublicitaireId != null)
      'forfait_publicitaire_id': forfaitPublicitaireId!,
    if (emplacementPublicitaireId != null)
      'emplacement_publicitaire_id': emplacementPublicitaireId!,
    if (paysId != null) 'pays_id': paysId!,
    if (statutModeration != null)
      'statut_moderation': statutModeration!.toApi(),
  };
}

/// Payload de modification partielle d'un EmplacementPublicitaire
/// (PUT /emplacements-publicitaires/:id). Tous les champs sont
/// optionnels ; seuls ceux fournis sont envoyés.
class ModifierEmplacementPublicitairePayload {
  final String? code;
  final String? libelle;
  final String? description;

  const ModifierEmplacementPublicitairePayload({
    this.code,
    this.libelle,
    this.description,
  });

  bool get estVide => code == null && libelle == null && description == null;

  Map<String, dynamic> toJson() => {
    if (code != null) 'code': code,
    if (libelle != null) 'libelle': libelle,
    if (description != null) 'description': description,
  };
}

/// Payload de modification partielle d'un ForfaitPublicitaire
/// (PUT /forfaits-publicitaires/:id). `lignes` n'est pas modifiable
/// ici : voir [PubliciteRepository.ajouterLigneForfait],
/// [PubliciteRepository.modifierLigneForfait] et
/// [PubliciteRepository.supprimerLigneForfait].
class ModifierForfaitPublicitairePayload {
  final String? emplacementPublicitaireId;
  final String? libelle;
  final String? prix;
  final int? dureeJours;

  const ModifierForfaitPublicitairePayload({
    this.emplacementPublicitaireId,
    this.libelle,
    this.prix,
    this.dureeJours,
  });

  bool get estVide =>
      emplacementPublicitaireId == null &&
          libelle == null &&
          prix == null &&
          dureeJours == null;

  Map<String, dynamic> toJson() => {
    if (emplacementPublicitaireId != null)
      'emplacement_publicitaire_id': emplacementPublicitaireId,
    if (libelle != null) 'libelle': libelle,
    if (prix != null) 'prix': prix,
    if (dureeJours != null) 'duree_jours': dureeJours,
  };
}

/// Payload de modification partielle d'une LigneForfaitPublicitaire
/// (PUT /lignes-forfait-publicitaire/:ligneId).
class ModifierLigneForfaitPayload {
  final String? libelleAvantage;
  final String? description;
  final int? ordreAffichage;

  const ModifierLigneForfaitPayload({
    this.libelleAvantage,
    this.description,
    this.ordreAffichage,
  });

  bool get estVide =>
      libelleAvantage == null && description == null && ordreAffichage == null;

  Map<String, dynamic> toJson() => {
    if (libelleAvantage != null) 'libelle_avantage': libelleAvantage,
    if (description != null) 'description': description,
    if (ordreAffichage != null) 'ordre_affichage': ordreAffichage,
  };
}

/// Payload texte de modification d'une Publicite
/// (PUT /publicites/:id, envoyé en multipart aux côtés d'un éventuel
/// nouveau visuel). [statutModeration] n'est effectif que si
/// l'appelant est admin/superadmin côté backend ; titre/dates ne sont
/// effectifs que si l'appelant est l'auteur ET que la publicité est
/// encore "en_attente" — voir modifierPublicite côté contrôleur.
class ModifierPubliciteTextePayload {
  final String? titre;
  final DateTime? dateDebut;
  final DateTime? dateFin;
  final StatutModerationPublicite? statutModeration;

  const ModifierPubliciteTextePayload({
    this.titre,
    this.dateDebut,
    this.dateFin,
    this.statutModeration,
  });

  Map<String, dynamic> toChamps() => {
    if (titre != null) 'titre': titre,
    if (dateDebut != null) 'date_debut': dateDebut!.toIso8601String(),
    if (dateFin != null) 'date_fin': dateFin!.toIso8601String(),
    if (statutModeration != null)
      'statut_moderation': statutModeration!.toApi(),
  };
}

/// Résultat de GET /publicites/par-page/:code : l'emplacement résolu
/// (utile pour son libellé/description à l'affichage) accompagné des
/// publicités qui lui sont rattachées et visibles par l'appelant.
class PublicitesParPageResultat {
  final EmplacementPublicitaire emplacement;
  final List<Publicite> publicites;

  const PublicitesParPageResultat({
    required this.emplacement,
    required this.publicites,
  });
}

class PubliciteRepository {
  static const Duration _timeout = Duration(seconds: 10);

  /* ===================================================================
   * Aides HTTP internes
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
   * Emplacements publicitaires (référentiel)
   * =================================================================== */
  // Même patron que Spécialités dans medecin_repository.dart : lecture
  // publique, écriture admin/superadmin, suppression superadmin.

  /// GET /emplacements-publicitaires
  /// Publique.
  Future<List<EmplacementPublicitaire>> listerEmplacementsPublicitaires() async {
    final donnees = await _get(ApiRealEndpoints.emplacementsPublicitaires);
    final liste = (donnees is Map && donnees['emplacements'] is List)
        ? donnees['emplacements'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => EmplacementPublicitaire.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /emplacements-publicitaires/:id
  /// Publique.
  Future<EmplacementPublicitaire> obtenirEmplacementPublicitaire(String id) async {
    final donnees = await _get(ApiRealEndpoints.emplacementPublicitaire(id));
    return EmplacementPublicitaire.fromJson(
        donnees['emplacement'] as Map<String, dynamic>);
  }

  /// POST /emplacements-publicitaires
  /// Réservé à admin/superadmin. `code` et `libelle` obligatoires ;
  /// `code` doit être unique (409 si déjà pris, remonté tel quel via
  /// [ApiException]).
  Future<EmplacementPublicitaire> creerEmplacementPublicitaire({
    required String code,
    required String libelle,
    String? description,
    required String token,
  }) async {
    final donnees = await _post(
      ApiRealEndpoints.emplacementsPublicitaires,
      body: {
        'code': code,
        'libelle': libelle,
        if (description != null) 'description': description,
      },
      token: token,
    );
    return EmplacementPublicitaire.fromJson(
        donnees['emplacement'] as Map<String, dynamic>);
  }

  /// PUT /emplacements-publicitaires/:id
  /// Réservé à admin/superadmin.
  Future<EmplacementPublicitaire> modifierEmplacementPublicitaire(
      String id, {
        required ModifierEmplacementPublicitairePayload payload,
        required String token,
      }) async {
    if (payload.estVide) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }
    final donnees = await _put(
      ApiRealEndpoints.emplacementPublicitaire(id),
      body: payload.toJson(),
      token: token,
    );
    return EmplacementPublicitaire.fromJson(
        donnees['emplacement'] as Map<String, dynamic>);
  }

  /// DELETE /emplacements-publicitaires/:id
  /// Réservé à superadmin. Échoue (via [ApiException], statusCode 409)
  /// si des forfaits référencent encore cet emplacement.
  Future<String> supprimerEmplacementPublicitaire(
      String id, {
        required String token,
      }) async {
    final donnees = await _delete(
        ApiRealEndpoints.emplacementPublicitaire(id),
        token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Emplacement supprimé.';
  }

  /* ===================================================================
   * Forfaits publicitaires
   * =================================================================== */

  /// GET /forfaits-publicitaires
  /// Publique. Le backend inclut systématiquement `lignes` (triées par
  /// ordre_affichage) dans chaque forfait renvoyé.
  Future<List<ForfaitPublicitaire>> listerForfaitsPublicitaires({
    ForfaitsPublicitairesFiltres? filtres,
  }) async {
    final donnees = await _get(
      ApiRealEndpoints.forfaitsPublicitaires,
      query: filtres?.toQuery(),
    );
    final liste = (donnees is Map && donnees['forfaits'] is List)
        ? donnees['forfaits'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => ForfaitPublicitaire.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /forfaits-publicitaires/:id
  /// Publique. `lignes` toujours incluse.
  Future<ForfaitPublicitaire> obtenirForfaitPublicitaire(String id) async {
    final donnees = await _get(ApiRealEndpoints.forfaitPublicitaire(id));
    return ForfaitPublicitaire.fromJson(
        donnees['forfait'] as Map<String, dynamic>);
  }

  /// POST /forfaits-publicitaires
  /// Réservé à admin/superadmin. `emplacementPublicitaireId`, `libelle`,
  /// `prix` et `dureeJours` obligatoires. `lignes` est optionnel : si
  /// fourni, chaque ligne est créée dans la même transaction que le
  /// forfait côté backend (voir creerForfaitPublicitaire).
  Future<ForfaitPublicitaire> creerForfaitPublicitaire({
    required String emplacementPublicitaireId,
    required String libelle,
    required String prix,
    required int dureeJours,
    List<LigneForfaitPublicitaire>? lignes,
    required String token,
  }) async {
    final donnees = await _post(
      ApiRealEndpoints.forfaitsPublicitaires,
      body: {
        'emplacement_publicitaire_id': emplacementPublicitaireId,
        'libelle': libelle,
        'prix': prix,
        'duree_jours': dureeJours,
        if (lignes != null)
          'lignes': lignes.map((l) => l.toCreatePayload()).toList(),
      },
      token: token,
    );
    return ForfaitPublicitaire.fromJson(
        donnees['forfait'] as Map<String, dynamic>);
  }

  /// PUT /forfaits-publicitaires/:id
  /// Réservé à admin/superadmin. Ne modifie jamais `lignes` — voir
  /// [ajouterLigneForfait], [modifierLigneForfait], [supprimerLigneForfait].
  Future<ForfaitPublicitaire> modifierForfaitPublicitaire(
      String id, {
        required ModifierForfaitPublicitairePayload payload,
        required String token,
      }) async {
    if (payload.estVide) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }
    final donnees = await _put(
      ApiRealEndpoints.forfaitPublicitaire(id),
      body: payload.toJson(),
      token: token,
    );
    return ForfaitPublicitaire.fromJson(
        donnees['forfait'] as Map<String, dynamic>);
  }

  /// DELETE /forfaits-publicitaires/:id
  /// Réservé à superadmin. Échoue (via [ApiException], statusCode 409)
  /// si des publicités référencent encore ce forfait. Les lignes
  /// rattachées sont supprimées côté backend dans la même transaction.
  Future<String> supprimerForfaitPublicitaire(
      String id, {
        required String token,
      }) async {
    final donnees =
    await _delete(ApiRealEndpoints.forfaitPublicitaire(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Forfait supprimé.';
  }

  /* ===================================================================
   * Lignes d'avantages (ligne_forfait_publicitaire)
   * =================================================================== */
  // Même autorisation que le forfait parent : admin/superadmin.
  // Préfixe DÉDIÉ pour PUT/DELETE (lignes-forfait-publicitaire), voir
  // en-tête de publicite.routes.js.

  /// POST /forfaits-publicitaires/:id/lignes
  /// Réservé à admin/superadmin. `libelleAvantage` obligatoire.
  Future<LigneForfaitPublicitaire> ajouterLigneForfait(
      String forfaitId, {
        required String libelleAvantage,
        String? description,
        int? ordreAffichage,
        required String token,
      }) async {
    final donnees = await _post(
      ApiRealEndpoints.ajouterLigneForfaitPublicitaire(forfaitId),
      body: {
        'libelle_avantage': libelleAvantage,
        if (description != null) 'description': description,
        if (ordreAffichage != null) 'ordre_affichage': ordreAffichage,
      },
      token: token,
    );
    return LigneForfaitPublicitaire.fromJson(
        donnees['ligne'] as Map<String, dynamic>);
  }

  /// PUT /lignes-forfait-publicitaire/:ligneId
  /// Réservé à admin/superadmin.
  Future<LigneForfaitPublicitaire> modifierLigneForfait(
      String ligneId, {
        required ModifierLigneForfaitPayload payload,
        required String token,
      }) async {
    if (payload.estVide) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }
    final donnees = await _put(
      ApiRealEndpoints.ligneForfaitPublicitaire(ligneId),
      body: payload.toJson(),
      token: token,
    );
    return LigneForfaitPublicitaire.fromJson(
        donnees['ligne'] as Map<String, dynamic>);
  }

  /// DELETE /lignes-forfait-publicitaire/:ligneId
  /// Réservé à admin/superadmin.
  Future<String> supprimerLigneForfait(
      String ligneId, {
        required String token,
      }) async {
    final donnees = await _delete(
        ApiRealEndpoints.ligneForfaitPublicitaire(ligneId),
        token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Ligne supprimée.';
  }

  /* ===================================================================
   * Publicités
   * =================================================================== */
  // Même patron de modération que Avis (avis_pharmacie) : toute
  // publicité est créée "en_attente" quel que soit le rôle de
  // l'auteur, et n'est visible publiquement qu'une fois "validee".

  /// GET /publicites
  /// Publique, authentification optionnelle : passer [token] pour
  /// qu'un admin/superadmin voie aussi les publicités non "validee"
  /// (selon [filtres.statutModeration]), ou pour qu'un auteur voie ses
  /// propres publicités en attente/rejetées via [obtenirPublicite].
  /// Sans [token], seules les publicités "validee" sont renvoyées, quel
  /// que soit `filtres.statutModeration` (voir listerPublicites côté
  /// contrôleur).
  Future<List<Publicite>> listerPublicites({
    PubliciteFiltres? filtres,
    String? token,
  }) async {
    final donnees = await _get(
      ApiRealEndpoints.publicites,
      token: token,
      query: filtres?.toQuery(),
    );
    final liste = (donnees is Map && donnees['publicites'] is List)
        ? donnees['publicites'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => Publicite.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /publicites/:id
  /// Publique, authentification optionnelle. Renvoie 404 (via
  /// [ApiException]) si la publicité n'est pas "validee" et que
  /// l'appelant n'est ni son auteur ni admin/superadmin — même 404
  /// qu'une publicité inexistante, pour ne pas révéler son existence
  /// (voir filtrerSelonVisibilite côté contrôleur).
  Future<Publicite> obtenirPublicite(String id, {String? token}) async {
    final donnees = await _get(ApiRealEndpoints.publicite(id), token: token);
    return Publicite.fromJson(donnees['publicite'] as Map<String, dynamic>);
  }

  /// GET /publicites/par-page/:code
  /// Publicités d'une PAGE identifiée par le CODE de son emplacement
  /// (ex. "PAGE_ACCUEIL", voir GET /emplacements-publicitaires),
  /// plutôt que par l'UUID technique de l'emplacement — pratique pour
  /// un écran qui connaît le code de la page où afficher l'encart mais
  /// pas l'ID interne. Voir rechercherPublicitesParCodePage côté
  /// contrôleur.
  ///
  /// [paysId] filtre en plus sur le pays de diffusion (query
  /// `?pays_id=...`).
  ///
  /// Même filtrage de visibilité que [listerPublicites] : un appel
  /// public (sans [token]) ou un [token] non admin/superadmin ne
  /// reçoit que les publicités "validee" ; un admin/superadmin voit
  /// tout, quel que soit `statut_moderation`.
  ///
  /// Lève [ApiException] (statusCode 404) si [codePage] ne correspond
  /// à aucun emplacement publicitaire connu.
  Future<PublicitesParPageResultat> listerPublicitesParCodePage(
      String codePage, {
        String? paysId,
        String? token,
      }) async {
    final donnees = await _get(
      ApiRealEndpoints.publicitesParCodePage(codePage),
      token: token,
      query: {if (paysId != null) 'pays_id': paysId},
    );

    final liste = (donnees is Map && donnees['publicites'] is List)
        ? donnees['publicites'] as List<dynamic>
        : const <dynamic>[];

    return PublicitesParPageResultat(
      emplacement: EmplacementPublicitaire.fromJson(
          donnees['emplacement'] as Map<String, dynamic>),
      publicites: liste
          .map((e) => Publicite.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  /// POST /publicites
  /// Ouvert à tout utilisateur authentifié, quel que soit son rôle.
  /// `visuelOctets`/`visuelNomFichier` sont obligatoires (JPEG/PNG/WEBP
  /// uniquement, voir upload.middleware.js) : le backend renvoie une
  /// erreur 400 sans fichier "visuel". La publicité créée est toujours
  /// "en_attente" côté backend, quelle que soit la valeur envoyée.
  Future<Publicite> creerPublicite({
    required String forfaitPublicitaireId,
    required String emplacementPublicitaireId,
    required String paysId,
    required String titre,
    required DateTime dateDebut,
    required DateTime dateFin,
    required List<int> visuelOctets,
    required String visuelNomFichier,
    required String token,
  }) async {
    final donnees = await _multipart(
      'POST',
      ApiRealEndpoints.publicites,
      champs: {
        'forfait_publicitaire_id': forfaitPublicitaireId,
        'emplacement_publicitaire_id': emplacementPublicitaireId,
        'pays_id': paysId,
        'titre': titre,
        'date_debut': dateDebut.toIso8601String(),
        'date_fin': dateFin.toIso8601String(),
      },
      fichiers: [
        FichierMultipart(
          champ: 'visuel',
          octets: visuelOctets,
          nomFichier: visuelNomFichier,
        ),
      ],
      token: token,
    );
    return Publicite.fromJson(donnees['publicite'] as Map<String, dynamic>);
  }

  /// PUT /publicites/:id
  /// - L'auteur peut corriger `payload` (titre/dates) et/ou remplacer
  ///   le visuel, uniquement tant que la publicité est encore
  ///   "en_attente" (409 sinon, via [ApiException]).
  /// - Un admin/superadmin peut à tout moment changer
  ///   `payload.statutModeration`, quel que soit le statut courant.
  /// `emplacementPublicitaireId` et `forfaitPublicitaireId` ne sont
  /// jamais modifiables ici (non exposés côté backend après création).
  /// Lève [ApiException] si ni [payload] ni aucun fichier n'est fourni.
  Future<Publicite> modifierPublicite({
    required String id,
    required String token,
    ModifierPubliciteTextePayload? payload,
    List<int>? visuelOctets,
    String? visuelNomFichier,
  }) async {
    final champs = payload?.toChamps() ?? const <String, dynamic>{};
    final fichiers = <FichierMultipart>[
      if (visuelOctets != null && visuelNomFichier != null)
        FichierMultipart(
          champ: 'visuel',
          octets: visuelOctets,
          nomFichier: visuelNomFichier,
        ),
    ];

    if (champs.isEmpty && fichiers.isEmpty) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }

    final donnees = await _multipart(
      'PUT',
      ApiRealEndpoints.publicite(id),
      champs: champs,
      fichiers: fichiers,
      token: token,
    );
    return Publicite.fromJson(donnees['publicite'] as Map<String, dynamic>);
  }

  /// DELETE /publicites/:id
  /// Réservé à l'auteur de la publicité (quel que soit son statut) ou
  /// à un admin/superadmin. Le visuel Cloudinary associé est nettoyé
  /// côté backend en best-effort après la suppression en base.
  Future<String> supprimerPublicite(String id, {required String token}) async {
    final donnees = await _delete(ApiRealEndpoints.publicite(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Publicité supprimée.';
  }
}