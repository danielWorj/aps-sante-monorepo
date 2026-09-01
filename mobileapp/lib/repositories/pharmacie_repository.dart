// lib/repositories/pharmacie_repository.dart
//
// Repository de consommation des APIs du module "annuaire — pharmacie"
// ET de son sous-module "Gardes officielles" (planning_garde /
// garde_pharmacie), en miroir de src/routes/pharmacie.routes.js et
// src/controllers/pharmacie.controller.js côté backend, et dans le
// même esprit que medecin_repository.dart (voir son en-tête).
//
// Comme [MedecinRepository], ce fichier ne porte AUCUN état applicatif
// (pas de cache, pas de notification UI) : il ne fait que parler HTTP
// et mapper JSON <-> modèles Dart (pharmacie_models.dart). La gestion
// d'état (chargement, erreurs, sélection courante) appartient à un
// éventuel PharmacieController, qui s'appuie sur ce repository.
//
// Le token d'authentification suit la même règle que [MedecinRepository] :
// fourni requête par requête (paramètre `token`), jamais stocké ici.
// Les 3 routes de lecture (GET pharmacies, GET plannings-garde, GET
// gardes-pharmacie) sont PUBLIQUES côté backend, sans authentification
// ni enrichissement conditionnel (contrairement à listerMedecins/
// obtenirMedecin) — [token] n'est donc pas un paramètre de ces méthodes
// ici.
//
// ⚠️ Périmètre : fiche Pharmacie + Plannings de garde + Gardes
// (pharmacie <-> créneau), en miroir de pharmacie_models.dart. La
// gestion des agents (agent_pharmacie) hors création initiale de la
// pharmacie est hors périmètre de ce fichier (aucune route dédiée
// exposée par pharmacie.routes.js pour l'instant).

import '../models/pharmacie_models.dart';
import '../utils/api_client.dart';

/// ─────────────────────────────────────────────────────────────────
/// PharmacieCreationResultat
/// ─────────────────────────────────────────────────────────────────
/// Miroir de la réponse 201 de POST /api/pharmacies (voir
/// creerPharmacie côté contrôleur) : la fiche pharmacie créée ET le
/// bloc agent (compte utilisateur + mot de passe temporaire EN CLAIR,
/// à communiquer à l'agent puis à ne plus jamais redemander). N'existe
/// pas dans pharmacie_models.dart (ce fichier ne combine que Pharmacie
/// et AgentPharmacieCree séparément) : ce type de résultat, propre à
/// cet appel précis, vit donc ici plutôt que dans les modèles.
class PharmacieCreationResultat {
  final String message;
  final Pharmacie pharmacie;
  final AgentPharmacieCree agent;

  const PharmacieCreationResultat({
    required this.message,
    required this.pharmacie,
    required this.agent,
  });

  factory PharmacieCreationResultat.fromJson(Map<String, dynamic> json) {
    return PharmacieCreationResultat(
      message: json['message'] as String,
      pharmacie: Pharmacie.fromJson(json['pharmacie'] as Map<String, dynamic>),
      agent: AgentPharmacieCree.fromJson(json['agent'] as Map<String, dynamic>),
    );
  }

  @override
  String toString() => 'PharmacieCreationResultat(${pharmacie.pharmacieId})';
}

class PharmacieRepository {
  final ApiClient _client;

  PharmacieRepository(this._client);

  /* ===================================================================
   * Pharmacies (fiche Annuaire)
   * =================================================================== */

  /// GET /pharmacies
  /// Publique, sans authentification. Filtres optionnels : pays_id,
  /// ville_id, statut_verification, recherche (sur le nom, insensible
  /// à la casse).
  Future<List<Pharmacie>> listerPharmacies({
    String? paysId,
    String? villeId,
    StatutVerificationPharmacie? statutVerification,
    String? recherche,
  }) async {
    final donnees = await _client.get(
      ApiEndpoints.pharmacies,
      query: {
        if (paysId != null) 'pays_id': paysId,
        if (villeId != null) 'ville_id': villeId,
        if (statutVerification != null)
          'statut_verification': statutVerification.toApi(),
        if (recherche != null && recherche.trim().isNotEmpty)
          'recherche': recherche,
      },
    );
    final liste = (donnees is Map && donnees['pharmacies'] is List)
        ? donnees['pharmacies'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => Pharmacie.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /pharmacies/:id
  /// Publique, sans authentification.
  Future<Pharmacie> obtenirPharmacie(String id) async {
    final donnees = await _client.get(ApiEndpoints.pharmacie(id));
    return Pharmacie.fromJson(donnees['pharmacie'] as Map<String, dynamic>);
  }

  /// POST /pharmacies
  /// Ouvert à tout utilisateur authentifié, quel que soit son rôle
  /// (voir pharmacie.routes.js) — [token] obligatoire. cni/piece
  /// d'identité/agrément sont les 3 fichiers obligatoires
  /// (image_pharmacie, piece_identite, document_agrement).
  ///
  /// Le même appel crée AUSSI, dans la même transaction côté backend,
  /// le compte de l'agent qui aura la charge de la pharmacie (PAS
  /// forcément l'appelant) : [fonction], [agentNom], [agentPrenom] et
  /// [agentEmail] sont donc obligatoires ; [agentTelephone] est
  /// optionnel. Le mot de passe temporaire renvoyé dans le résultat
  /// n'apparaît qu'une seule fois : à afficher immédiatement à
  /// l'appelant, ne jamais le restocker (voir [PharmacieCreationResultat]).
  ///
  /// [statutVerification] est toujours requis côté validation backend,
  /// mais n'est réellement appliqué que si l'appelant est
  /// admin/superadmin ; pour tout autre profil, le backend le force à
  /// `en_cours` quoi qu'il soit envoyé.
  ///
  /// [latitude]/[longitude] sont optionnelles mais doivent être
  /// fournies ensemble ou pas du tout (voir appliquerGeolocalisation
  /// côté contrôleur) : lève [ApiException] côté client si une seule
  /// des deux est fournie, pour échouer vite sans appel réseau inutile.
  Future<PharmacieCreationResultat> creerPharmacie({
    required String token,
    required String nom,
    required String paysId,
    required String villeId,
    required String telephone,
    required StatutVerificationPharmacie statutVerification,
    required String numeroOrdreTitulaire,
    required List<int> imageOctets,
    required String imageNomFichier,
    required List<int> pieceIdentiteOctets,
    required String pieceIdentiteNomFichier,
    required List<int> documentAgrementOctets,
    required String documentAgrementNomFichier,
    required String fonction,
    required String agentNom,
    required String agentPrenom,
    required String agentEmail,
    String? agentTelephone,
    double? latitude,
    double? longitude,
  }) async {
    if ((latitude == null) != (longitude == null)) {
      throw const ApiException(
          'latitude et longitude doivent être fournies ensemble.');
    }

    final champs = <String, dynamic>{
      'nom': nom,
      'pays_id': paysId,
      'ville_id': villeId,
      'telephone': telephone,
      'statut_verification': statutVerification.toApi(),
      'numero_ordre_titulaire': numeroOrdreTitulaire,
      'fonction': fonction,
      'agent_nom': agentNom,
      'agent_prenom': agentPrenom,
      'agent_email': agentEmail,
      if (agentTelephone != null) 'agent_telephone': agentTelephone,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
    };

    final fichiers = <FichierMultipart>[
      FichierMultipart(
        champ: 'image_pharmacie',
        octets: imageOctets,
        nomFichier: imageNomFichier,
      ),
      FichierMultipart(
        champ: 'piece_identite',
        octets: pieceIdentiteOctets,
        nomFichier: pieceIdentiteNomFichier,
      ),
      FichierMultipart(
        champ: 'document_agrement',
        octets: documentAgrementOctets,
        nomFichier: documentAgrementNomFichier,
      ),
    ];

    final donnees = await _client.postMultipart(
      ApiEndpoints.pharmacies,
      champs: champs,
      fichiers: fichiers,
      token: token,
    );
    return PharmacieCreationResultat.fromJson(donnees as Map<String, dynamic>);
  }

  /// PUT /pharmacies/:id
  /// Ouvert à tout utilisateur authentifié — [token] obligatoire (même
  /// logique que la création). Ne touche jamais au compte agent (déjà
  /// créé une fois pour toutes à la création de la pharmacie).
  ///
  /// Tous les champs texte sont optionnels : ne fournir que ceux à
  /// modifier. Les 3 fichiers sont optionnels ici aussi : ne fournir
  /// que ceux à remplacer. Lève [ApiException] si ni un champ, ni un
  /// fichier n'est fourni (rien à envoyer), symétrique du 400
  /// "Aucune donnée valide à mettre à jour." que d'autres endpoints du
  /// backend renvoient dans ce cas (voir modifierMedecin côté
  /// medecin_repository.dart pour le même garde-fou).
  ///
  /// Rappel modération : pour tout appelant non admin/superadmin, la
  /// fiche repasse systématiquement en `en_cours` côté backend dès
  /// qu'elle est modifiée, quelle que soit la valeur envoyée dans
  /// [statutVerification].
  ///
  /// [latitude]/[longitude] : mêmes règles que sur la création. Passer
  /// les deux à la fois pour définir/déplacer le point ; ce repository
  /// ne prend pas en charge l'effacement du point (les deux à `null`
  /// côté backend) car cela dépend de la façon dont
  /// upload.middleware.js (non fourni) coerce les champs multipart en
  /// valeurs nulles — à ajouter si ce besoin se confirme.
  Future<Pharmacie> modifierPharmacie({
    required String id,
    required String token,
    String? nom,
    String? paysId,
    String? villeId,
    String? telephone,
    StatutVerificationPharmacie? statutVerification,
    String? numeroOrdreTitulaire,
    double? latitude,
    double? longitude,
    List<int>? imageOctets,
    String? imageNomFichier,
    List<int>? pieceIdentiteOctets,
    String? pieceIdentiteNomFichier,
    List<int>? documentAgrementOctets,
    String? documentAgrementNomFichier,
  }) async {
    if ((latitude == null) != (longitude == null)) {
      throw const ApiException(
          'latitude et longitude doivent être fournies ensemble.');
    }

    final champs = <String, dynamic>{
      if (nom != null) 'nom': nom,
      if (paysId != null) 'pays_id': paysId,
      if (villeId != null) 'ville_id': villeId,
      if (telephone != null) 'telephone': telephone,
      if (statutVerification != null)
        'statut_verification': statutVerification.toApi(),
      if (numeroOrdreTitulaire != null)
        'numero_ordre_titulaire': numeroOrdreTitulaire,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
    };

    final fichiers = <FichierMultipart>[
      if (imageOctets != null && imageNomFichier != null)
        FichierMultipart(
            champ: 'image_pharmacie',
            octets: imageOctets,
            nomFichier: imageNomFichier),
      if (pieceIdentiteOctets != null && pieceIdentiteNomFichier != null)
        FichierMultipart(
            champ: 'piece_identite',
            octets: pieceIdentiteOctets,
            nomFichier: pieceIdentiteNomFichier),
      if (documentAgrementOctets != null && documentAgrementNomFichier != null)
        FichierMultipart(
            champ: 'document_agrement',
            octets: documentAgrementOctets,
            nomFichier: documentAgrementNomFichier),
    ];

    if (champs.isEmpty && fichiers.isEmpty) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }

    final donnees = await _client.putMultipart(
      ApiEndpoints.pharmacie(id),
      champs: champs,
      fichiers: fichiers,
      token: token,
    );
    return Pharmacie.fromJson(donnees['pharmacie'] as Map<String, dynamic>);
  }

  /// DELETE /pharmacies/:id
  /// Réservé à superadmin côté backend. Échoue avec un message clair
  /// (via [ApiException], statusCode 409) si des agents sont encore
  /// rattachés à cette pharmacie.
  Future<String> supprimerPharmacie(String id, {required String token}) async {
    final donnees = await _client.delete(ApiEndpoints.pharmacie(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Pharmacie supprimée.';
  }

  /* ===================================================================
   * Plannings de garde
   * =================================================================== */
  // Calendrier de garde d'un pays. Lecture publique ; écriture et
  // suppression réservées à admin/superadmin (voir en-tête "Gardes
  // officielles" de pharmacie.controller.js).

  /// GET /plannings-garde
  /// Publique. Filtres optionnels : pays_id, statut.
  Future<List<PlanningGarde>> listerPlanningsGarde({
    String? paysId,
    StatutPlanningGarde? statut,
  }) async {
    final donnees = await _client.get(
      ApiEndpoints.planningsGarde,
      query: {
        if (paysId != null) 'pays_id': paysId,
        if (statut != null) 'statut': statut.toApi(),
      },
    );
    final liste = (donnees is Map && donnees['plannings'] is List)
        ? donnees['plannings'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => PlanningGarde.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /plannings-garde/:id
  /// Publique. `gardes` n'est peuplé que par cet appel de détail
  /// (`include: { gardes: true }` côté backend) — voir PlanningGarde.
  Future<PlanningGarde> obtenirPlanningGarde(String id) async {
    final donnees = await _client.get(ApiEndpoints.planningGarde(id));
    return PlanningGarde.fromJson(donnees['planning'] as Map<String, dynamic>);
  }

  /// POST /plannings-garde
  /// Réservé à admin/superadmin — [token] obligatoire (403 côté
  /// backend sinon, voir [ApiException.estNonAutorise]).
  Future<PlanningGarde> creerPlanningGarde({
    required String token,
    required String paysId,
    required StatutPlanningGarde statut,
    required DateTime periodeDebut,
    required DateTime periodeFin,
  }) async {
    final donnees = await _client.post(
      ApiEndpoints.planningsGarde,
      body: {
        'pays_id': paysId,
        'statut': statut.toApi(),
        'periode_debut': periodeDebut.toIso8601String(),
        'periode_fin': periodeFin.toIso8601String(),
      },
      token: token,
    );
    return PlanningGarde.fromJson(donnees['planning'] as Map<String, dynamic>);
  }

  /// PUT /plannings-garde/:id
  /// Réservé à admin/superadmin. Tous les champs sont optionnels :
  /// seuls ceux fournis sont appliqués.
  Future<PlanningGarde> modifierPlanningGarde({
    required String id,
    required String token,
    StatutPlanningGarde? statut,
    DateTime? periodeDebut,
    DateTime? periodeFin,
  }) async {
    final body = <String, dynamic>{
      if (statut != null) 'statut': statut.toApi(),
      if (periodeDebut != null)
        'periode_debut': periodeDebut.toIso8601String(),
      if (periodeFin != null) 'periode_fin': periodeFin.toIso8601String(),
    };
    if (body.isEmpty) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }

    final donnees = await _client.put(
      ApiEndpoints.planningGarde(id),
      body: body,
      token: token,
    );
    return PlanningGarde.fromJson(donnees['planning'] as Map<String, dynamic>);
  }

  /// DELETE /plannings-garde/:id
  /// Réservé à admin/superadmin. Échoue avec un message clair (via
  /// [ApiException], statusCode 409) si des gardes sont encore
  /// rattachées à ce planning.
  Future<String> supprimerPlanningGarde(String id,
      {required String token}) async {
    final donnees =
    await _client.delete(ApiEndpoints.planningGarde(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Planning de garde supprimé.';
  }

  /* ===================================================================
   * Gardes (pharmacie <-> créneau)
   * =================================================================== */
  // Lecture publique ; écriture et suppression réservées à
  // admin/superadmin.

  /// GET /gardes-pharmacie
  /// Publique. Filtres optionnels : ville_id, planning_garde_id,
  /// pharmacie_id, et [instant] (cas d'usage "pharmacie de garde
  /// maintenant" : retourne les gardes actives à cet instant précis,
  /// date_debut <= instant <= date_fin — voir listerGardesPharmacie
  /// côté contrôleur).
  Future<List<GardePharmacie>> listerGardesPharmacie({
    String? villeId,
    String? planningGardeId,
    String? pharmacieId,
    DateTime? instant,
  }) async {
    final donnees = await _client.get(
      ApiEndpoints.gardesPharmacie,
      query: {
        if (villeId != null) 'ville_id': villeId,
        if (planningGardeId != null) 'planning_garde_id': planningGardeId,
        if (pharmacieId != null) 'pharmacie_id': pharmacieId,
        if (instant != null) 'date': instant.toIso8601String(),
      },
    );
    final liste = (donnees is Map && donnees['gardes'] is List)
        ? donnees['gardes'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => GardePharmacie.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /gardes-pharmacie/:id
  /// Publique.
  Future<GardePharmacie> obtenirGardePharmacie(String id) async {
    final donnees = await _client.get(ApiEndpoints.gardePharmacie(id));
    return GardePharmacie.fromJson(donnees['garde'] as Map<String, dynamic>);
  }

  /// POST /gardes-pharmacie
  /// Réservé à admin/superadmin — [token] obligatoire. [dateDebut] doit
  /// être strictement antérieure à [dateFin] (validé aussi côté
  /// backend).
  Future<GardePharmacie> creerGardePharmacie({
    required String token,
    required String planningGardeId,
    required String pharmacieId,
    required String villeId,
    required DateTime dateDebut,
    required DateTime dateFin,
  }) async {
    if (!dateDebut.isBefore(dateFin)) {
      throw const ApiException('date_debut doit être antérieure à date_fin.');
    }

    final donnees = await _client.post(
      ApiEndpoints.gardesPharmacie,
      body: {
        'planning_garde_id': planningGardeId,
        'pharmacie_id': pharmacieId,
        'ville_id': villeId,
        'date_debut': dateDebut.toIso8601String(),
        'date_fin': dateFin.toIso8601String(),
      },
      token: token,
    );
    return GardePharmacie.fromJson(donnees['garde'] as Map<String, dynamic>);
  }

  /// PUT /gardes-pharmacie/:id
  /// Réservé à admin/superadmin. Tous les champs sont optionnels :
  /// seuls ceux fournis sont appliqués.
  Future<GardePharmacie> modifierGardePharmacie({
    required String id,
    required String token,
    String? pharmacieId,
    String? villeId,
    DateTime? dateDebut,
    DateTime? dateFin,
  }) async {
    final body = <String, dynamic>{
      if (pharmacieId != null) 'pharmacie_id': pharmacieId,
      if (villeId != null) 'ville_id': villeId,
      if (dateDebut != null) 'date_debut': dateDebut.toIso8601String(),
      if (dateFin != null) 'date_fin': dateFin.toIso8601String(),
    };
    if (body.isEmpty) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }

    final donnees = await _client.put(
      ApiEndpoints.gardePharmacie(id),
      body: body,
      token: token,
    );
    return GardePharmacie.fromJson(donnees['garde'] as Map<String, dynamic>);
  }

  /// DELETE /gardes-pharmacie/:id
  /// Réservé à admin/superadmin.
  Future<String> supprimerGardePharmacie(String id,
      {required String token}) async {
    final donnees =
    await _client.delete(ApiEndpoints.gardePharmacie(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Garde supprimée.';
  }
}