// centresante_models.dart
// Modèles Dart pour le composant "annuaire — centre de santé"
// (structure_sante : cliniques, hôpitaux, centres médicaux,
// dispensaires, laboratoires).
//
// Aligné sur :
//   - schema.prisma            -> model StructureSante / AgentStructureSante
//   - centreSante.controller.js -> forme exacte des réponses JSON
//   - centreSante.routes.js     -> règles d'accès (GET public, POST/PUT
//                                  authentifié, DELETE superadmin)
//
// Notes de conception :
//   - Aucune dépendance externe (pas de json_serializable) : tout est
//     écrit à la main pour rester autonome dans ce seul fichier.
//   - Les enums Dart exposent une valeur "fil" (wire value) identique
//     aux enums Prisma (ex: "centre_medical"), car c'est ce que
//     l'API envoie/attend tel quel dans le JSON.
//   - CentreSante correspond au JSON déjà "enrichi" par le contrôleur
//     (enrichirCentreSante) : geolocalisation {latitude, longitude}
//     déjà résolue, et les *_url Cloudinary déjà reconstruites — le
//     front n'a jamais besoin de connaître la logique Cloudinary.
//   - Les requêtes de création / modification sont multipart/form-data
//     (3 pièces jointes) : les classes *Requete exposent les champs
//     texte via toChampsTexte() ; l'appel http.MultipartFile pour les
//     fichiers reste à la charge de l'appelant (voir les constantes de
//     noms de champs plus bas).

/// Lit une valeur potentiellement absente/nulle sans planter la
/// désérialisation d'une liste entière à cause d'un seul champ
/// manquant ou de type inattendu (voir même helper dans
/// referentiel_models.dart / medecin_models.dart).
T? _lire<T>(Map<String, dynamic> json, String cle) {
  final valeur = json[cle];
  if (valeur is T) return valeur;
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────

/// Type de structure de santé (enum Prisma `TypeStructure`).
enum TypeStructure {
  clinique,
  hopital,
  centreMedical,
  dispensaire,
  laboratoire;

  /// Valeur telle qu'envoyée/attendue par l'API (snake_case).
  String toApi() {
    switch (this) {
      case TypeStructure.clinique:
        return 'clinique';
      case TypeStructure.hopital:
        return 'hopital';
      case TypeStructure.centreMedical:
        return 'centre_medical';
      case TypeStructure.dispensaire:
        return 'dispensaire';
      case TypeStructure.laboratoire:
        return 'laboratoire';
    }
  }

  /// Libellé lisible pour l'UI (français).
  String get libelle {
    switch (this) {
      case TypeStructure.clinique:
        return 'Clinique';
      case TypeStructure.hopital:
        return 'Hôpital';
      case TypeStructure.centreMedical:
        return 'Centre médical';
      case TypeStructure.dispensaire:
        return 'Dispensaire';
      case TypeStructure.laboratoire:
        return 'Laboratoire';
    }
  }

  /// Tolérant : une valeur API inconnue ou absente retombe sur
  /// [TypeStructure.centreMedical] plutôt que de planter la
  /// désérialisation de toute une liste (même logique que
  /// `StatutActivationPays.fromApi` / `StatutVerificationMedecin.fromApi`).
  static TypeStructure fromApi(String? valeur) {
    return TypeStructure.values.firstWhere(
          (v) => v.toApi() == valeur,
      orElse: () => TypeStructure.centreMedical,
    );
  }
}

/// Statut de vérification/modération de la fiche
/// (enum Prisma `StatutVerificationStructure`).
///
/// Rappel des règles côté API (voir centreSante.controller.js) :
///   - à la création/modification, seul admin/superadmin peut choisir
///     librement cette valeur ;
///   - pour tout autre profil, elle est systématiquement forcée à
///     `enCours`, quelle que soit la valeur envoyée.
enum StatutVerificationStructure {
  nonPublie,
  enCours,
  publie;

  String toApi() {
    switch (this) {
      case StatutVerificationStructure.nonPublie:
        return 'non_publie';
      case StatutVerificationStructure.enCours:
        return 'en_cours';
      case StatutVerificationStructure.publie:
        return 'publie';
    }
  }

  String get libelle {
    switch (this) {
      case StatutVerificationStructure.nonPublie:
        return 'Non publié';
      case StatutVerificationStructure.enCours:
        return 'En cours de vérification';
      case StatutVerificationStructure.publie:
        return 'Publié';
    }
  }

  /// Tolérant : une valeur API inconnue ou absente retombe sur l'état
  /// le plus restrictif ([StatutVerificationStructure.nonPublie])
  /// plutôt que de planter la désérialisation de toute une liste
  /// (même logique que `StatutVerificationMedecin.fromApi` dans
  /// medecin_models.dart).
  static StatutVerificationStructure fromApi(String? valeur) {
    return StatutVerificationStructure.values.firstWhere(
          (v) => v.toApi() == valeur,
      orElse: () => StatutVerificationStructure.nonPublie,
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// Sous-modèles légers (référentiel géographique inclus par l'API)
// ─────────────────────────────────────────────────────────────────

/// Version allégée de `Pays`, telle qu'incluse par
/// `prisma.structureSante.findMany({ include: { pays: true } })`
/// (pas de devise/langue imbriquées côté centreSante.controller.js).
class PaysLite {
  final String paysId;
  final String codeIso2;
  final String nom;
  final String deviseId;
  final String langueId;
  final String statutActivation; // pilote | actif | inactif

  const PaysLite({
    required this.paysId,
    required this.codeIso2,
    required this.nom,
    required this.deviseId,
    required this.langueId,
    required this.statutActivation,
  });

  factory PaysLite.fromJson(Map<String, dynamic> json) {
    return PaysLite(
      paysId: json['pays_id'] as String,
      codeIso2: json['code_iso2'] as String,
      nom: json['nom'] as String,
      deviseId: json['devise_id'] as String,
      langueId: json['langue_id'] as String,
      statutActivation: json['statut_activation'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
    'pays_id': paysId,
    'code_iso2': codeIso2,
    'nom': nom,
    'devise_id': deviseId,
    'langue_id': langueId,
    'statut_activation': statutActivation,
  };

  @override
  String toString() => 'PaysLite($paysId, $nom)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is PaysLite && other.paysId == paysId);

  @override
  int get hashCode => paysId.hashCode;
}

/// Version allégée de `Ville`, telle qu'incluse par l'API.
class VilleLite {
  final String villeId;
  final String paysId;
  final String nom;
  final String? codePostal;

  const VilleLite({
    required this.villeId,
    required this.paysId,
    required this.nom,
    this.codePostal,
  });

  factory VilleLite.fromJson(Map<String, dynamic> json) {
    return VilleLite(
      villeId: json['ville_id'] as String,
      paysId: json['pays_id'] as String,
      nom: json['nom'] as String,
      codePostal: _lire<String>(json, 'code_postal'),
    );
  }

  Map<String, dynamic> toJson() => {
    'ville_id': villeId,
    'pays_id': paysId,
    'nom': nom,
    'code_postal': codePostal,
  };

  @override
  String toString() => 'VilleLite($villeId, $nom)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is VilleLite && other.villeId == villeId);

  @override
  int get hashCode => villeId.hashCode;
}

/// Coordonnées GPS résolues côté serveur depuis le champ PostGIS
/// `geolocalisation` (GEOGRAPHY(POINT,4326)) — voir
/// recupererGeolocalisation() dans le contrôleur. `null` si le centre
/// n'a pas encore de position renseignée.
class Geolocalisation {
  final double latitude;
  final double longitude;

  const Geolocalisation({required this.latitude, required this.longitude});

  factory Geolocalisation.fromJson(Map<String, dynamic> json) {
    return Geolocalisation(
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
    'latitude': latitude,
    'longitude': longitude,
  };

  @override
  String toString() => 'Geolocalisation($latitude, $longitude)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is Geolocalisation &&
              other.latitude == latitude &&
              other.longitude == longitude);

  @override
  int get hashCode => Object.hash(latitude, longitude);
}

// ─────────────────────────────────────────────────────────────────
// Modèle principal : CentreSante
// ─────────────────────────────────────────────────────────────────

/// Fiche annuaire d'un centre de santé, telle que renvoyée par
/// GET /api/centres-sante, GET /api/centres-sante/:id,
/// POST /api/centres-sante et PUT /api/centres-sante/:id
/// (champ `centreSante` / `centresSante` de la réponse, déjà enrichi
/// par enrichirCentreSante() : geolocalisation + URLs Cloudinary).
class CentreSante {
  final String structureId;
  final String nom;
  final String paysId;
  final String villeId;
  final String telephone;
  final StatutVerificationStructure statutVerification;
  final TypeStructure typeStructure;

  /// public_id Cloudinary (jamais l'URL) des 3 pièces justificatives.
  final String imageNom;
  final String pieceIdentiteNom;
  final String documentAgrementNom;

  /// URLs publiques reconstruites côté serveur — à utiliser
  /// directement dans un Image.network par ex.
  final String imageUrl;
  final String pieceIdentiteUrl;
  final String documentAgrementUrl;

  final Geolocalisation? geolocalisation;

  /// Présents dès lors que la réponse API a été construite avec
  /// `include: { pays: true, ville: true }` (c'est le cas sur toutes
  /// les routes de ce module).
  final PaysLite? pays;
  final VilleLite? ville;

  const CentreSante({
    required this.structureId,
    required this.nom,
    required this.paysId,
    required this.villeId,
    required this.telephone,
    required this.statutVerification,
    required this.typeStructure,
    required this.imageNom,
    required this.pieceIdentiteNom,
    required this.documentAgrementNom,
    required this.imageUrl,
    required this.pieceIdentiteUrl,
    required this.documentAgrementUrl,
    this.geolocalisation,
    this.pays,
    this.ville,
  });

  factory CentreSante.fromJson(Map<String, dynamic> json) {
    return CentreSante(
      structureId: json['structure_id'] as String,
      nom: json['nom'] as String,
      paysId: json['pays_id'] as String,
      villeId: json['ville_id'] as String,
      telephone: json['telephone'] as String,
      statutVerification: StatutVerificationStructure.fromApi(
        json['statut_verification'] as String?,
      ),
      typeStructure: TypeStructure.fromApi(
        json['type_structure'] as String?,
      ),
      imageNom: json['image_nom'] as String,
      pieceIdentiteNom: json['piece_identite_nom'] as String,
      documentAgrementNom: json['document_agrement_nom'] as String,
      imageUrl: json['image_url'] as String,
      pieceIdentiteUrl: json['piece_identite_url'] as String,
      documentAgrementUrl: json['document_agrement_url'] as String,
      geolocalisation: json['geolocalisation'] is Map<String, dynamic>
          ? Geolocalisation.fromJson(
          json['geolocalisation'] as Map<String, dynamic>)
          : null,
      pays: json['pays'] is Map<String, dynamic>
          ? PaysLite.fromJson(json['pays'] as Map<String, dynamic>)
          : null,
      ville: json['ville'] is Map<String, dynamic>
          ? VilleLite.fromJson(json['ville'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'structure_id': structureId,
    'nom': nom,
    'pays_id': paysId,
    'ville_id': villeId,
    'telephone': telephone,
    'statut_verification': statutVerification.toApi(),
    'type_structure': typeStructure.toApi(),
    'image_nom': imageNom,
    'piece_identite_nom': pieceIdentiteNom,
    'document_agrement_nom': documentAgrementNom,
    'image_url': imageUrl,
    'piece_identite_url': pieceIdentiteUrl,
    'document_agrement_url': documentAgrementUrl,
    'geolocalisation': geolocalisation?.toJson(),
    'pays': pays?.toJson(),
    'ville': ville?.toJson(),
  };

  CentreSante copyWith({
    String? structureId,
    String? nom,
    String? paysId,
    String? villeId,
    String? telephone,
    StatutVerificationStructure? statutVerification,
    TypeStructure? typeStructure,
    String? imageNom,
    String? pieceIdentiteNom,
    String? documentAgrementNom,
    String? imageUrl,
    String? pieceIdentiteUrl,
    String? documentAgrementUrl,
    Geolocalisation? geolocalisation,
    PaysLite? pays,
    VilleLite? ville,
  }) {
    return CentreSante(
      structureId: structureId ?? this.structureId,
      nom: nom ?? this.nom,
      paysId: paysId ?? this.paysId,
      villeId: villeId ?? this.villeId,
      telephone: telephone ?? this.telephone,
      statutVerification: statutVerification ?? this.statutVerification,
      typeStructure: typeStructure ?? this.typeStructure,
      imageNom: imageNom ?? this.imageNom,
      pieceIdentiteNom: pieceIdentiteNom ?? this.pieceIdentiteNom,
      documentAgrementNom: documentAgrementNom ?? this.documentAgrementNom,
      imageUrl: imageUrl ?? this.imageUrl,
      pieceIdentiteUrl: pieceIdentiteUrl ?? this.pieceIdentiteUrl,
      documentAgrementUrl: documentAgrementUrl ?? this.documentAgrementUrl,
      geolocalisation: geolocalisation ?? this.geolocalisation,
      pays: pays ?? this.pays,
      ville: ville ?? this.ville,
    );
  }

  @override
  String toString() => 'CentreSante($structureId, $nom)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is CentreSante && other.structureId == structureId);

  @override
  int get hashCode => structureId.hashCode;
}

// ─────────────────────────────────────────────────────────────────
// Agent rattaché au centre (créé dans la même transaction que le
// centre, uniquement présent dans la réponse de POST /centres-sante)
// ─────────────────────────────────────────────────────────────────

/// Identité minimale du compte utilisateur créé pour l'agent.
class AgentUtilisateurLite {
  final String utilisateurId;
  final String nom;
  final String prenom;
  final String email;

  const AgentUtilisateurLite({
    required this.utilisateurId,
    required this.nom,
    required this.prenom,
    required this.email,
  });

  factory AgentUtilisateurLite.fromJson(Map<String, dynamic> json) {
    return AgentUtilisateurLite(
      utilisateurId: json['utilisateur_id'] as String,
      nom: json['nom'] as String,
      prenom: json['prenom'] as String,
      email: json['email'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
    'utilisateur_id': utilisateurId,
    'nom': nom,
    'prenom': prenom,
    'email': email,
  };

  @override
  String toString() => 'AgentUtilisateurLite($utilisateurId, $email)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is AgentUtilisateurLite &&
              other.utilisateurId == utilisateurId);

  @override
  int get hashCode => utilisateurId.hashCode;
}

/// Fiche `agent_structure_sante` + compte associé, telle que renvoyée
/// (une seule fois) dans le champ `agent` de la réponse 201 de
/// POST /api/centres-sante.
///
/// ⚠️ `motDePasseTemporaire` est le mot de passe EN CLAIR, transmis
/// une unique fois par le serveur. Il doit être affiché à l'auteur de
/// la soumission puis communiqué à l'agent par un canal sûr — ne
/// jamais le journaliser ni le persister côté client au-delà de cet
/// écran.
class AgentCentreSante {
  final String agentId;
  final String fonction;
  final AgentUtilisateurLite utilisateur;
  final String motDePasseTemporaire;

  const AgentCentreSante({
    required this.agentId,
    required this.fonction,
    required this.utilisateur,
    required this.motDePasseTemporaire,
  });

  factory AgentCentreSante.fromJson(Map<String, dynamic> json) {
    return AgentCentreSante(
      agentId: json['agent_id'] as String,
      fonction: json['fonction'] as String,
      utilisateur: AgentUtilisateurLite.fromJson(
        json['utilisateur'] as Map<String, dynamic>,
      ),
      motDePasseTemporaire: json['mot_de_passe_temporaire'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
    'agent_id': agentId,
    'fonction': fonction,
    'utilisateur': utilisateur.toJson(),
    'mot_de_passe_temporaire': motDePasseTemporaire,
  };

  @override
  String toString() => 'AgentCentreSante($agentId, $fonction)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is AgentCentreSante && other.agentId == agentId);

  @override
  int get hashCode => agentId.hashCode;
}

// ─────────────────────────────────────────────────────────────────
// Enveloppes de réponse (forme exacte des payloads JSON du contrôleur)
// ─────────────────────────────────────────────────────────────────

/// GET /api/centres-sante -> { centresSante: [...] }
class CentresSanteListeReponse {
  final List<CentreSante> centresSante;

  const CentresSanteListeReponse({required this.centresSante});

  factory CentresSanteListeReponse.fromJson(Map<String, dynamic> json) {
    final liste = (json['centresSante'] as List<dynamic>? ?? [])
        .map((e) => CentreSante.fromJson(e as Map<String, dynamic>))
        .toList();
    return CentresSanteListeReponse(centresSante: liste);
  }
}

/// GET /api/centres-sante/:id -> { centreSante: {...} }
class CentreSanteDetailReponse {
  final CentreSante centreSante;

  const CentreSanteDetailReponse({required this.centreSante});

  factory CentreSanteDetailReponse.fromJson(Map<String, dynamic> json) {
    return CentreSanteDetailReponse(
      centreSante:
      CentreSante.fromJson(json['centreSante'] as Map<String, dynamic>),
    );
  }
}

/// 201 de POST /api/centres-sante ->
/// { message, centreSante, agent } (agent.mot_de_passe_temporaire
/// n'apparaît qu'ici, une seule fois).
class CentreSanteCreationReponse {
  final String message;
  final CentreSante centreSante;
  final AgentCentreSante agent;

  const CentreSanteCreationReponse({
    required this.message,
    required this.centreSante,
    required this.agent,
  });

  factory CentreSanteCreationReponse.fromJson(Map<String, dynamic> json) {
    return CentreSanteCreationReponse(
      message: json['message'] as String? ?? '',
      centreSante:
      CentreSante.fromJson(json['centreSante'] as Map<String, dynamic>),
      agent: AgentCentreSante.fromJson(json['agent'] as Map<String, dynamic>),
    );
  }
}

/// 200 de PUT /api/centres-sante/:id -> { message, centreSante }
class CentreSanteMiseAJourReponse {
  final String message;
  final CentreSante centreSante;

  const CentreSanteMiseAJourReponse({
    required this.message,
    required this.centreSante,
  });

  factory CentreSanteMiseAJourReponse.fromJson(Map<String, dynamic> json) {
    return CentreSanteMiseAJourReponse(
      message: json['message'] as String? ?? '',
      centreSante:
      CentreSante.fromJson(json['centreSante'] as Map<String, dynamic>),
    );
  }
}

/// Réponse générique { message } — utilisée par DELETE et par les cas
/// d'erreur (400/404/409) de toutes les routes du module.
class MessageReponse {
  final String message;

  const MessageReponse({required this.message});

  factory MessageReponse.fromJson(Map<String, dynamic> json) {
    return MessageReponse(message: json['message'] as String? ?? '');
  }
}

// ─────────────────────────────────────────────────────────────────
// Requêtes sortantes
// ─────────────────────────────────────────────────────────────────

/// Noms des 3 champs fichiers attendus en multipart/form-data,
/// identiques sur POST et PUT (voir upload.middleware.js /
/// centreSante.controller.js). À utiliser comme `field` lors de la
/// construction d'un http.MultipartFile.
class ChampsFichiersCentreSante {
  static const String imageStructure = 'image_structure';
  static const String pieceIdentite = 'piece_identite';
  static const String documentAgrement = 'document_agrement';
}

/// Filtres optionnels de GET /api/centres-sante
/// (?pays_id=&ville_id=&type_structure=&statut_verification=&recherche=).
class CentresSanteFiltre {
  final String? paysId;
  final String? villeId;
  final TypeStructure? typeStructure;
  final StatutVerificationStructure? statutVerification;

  /// Recherche insensible à la casse sur `nom` (SQL `contains`).
  final String? recherche;

  const CentresSanteFiltre({
    this.paysId,
    this.villeId,
    this.typeStructure,
    this.statutVerification,
    this.recherche,
  });

  /// À passer tel quel en `queryParameters` d'une requête Dio/http.
  Map<String, String> toQueryParameters() {
    final params = <String, String>{};
    if (paysId != null) params['pays_id'] = paysId!;
    if (villeId != null) params['ville_id'] = villeId!;
    if (typeStructure != null) {
      params['type_structure'] = typeStructure!.toApi();
    }
    if (statutVerification != null) {
      params['statut_verification'] = statutVerification!.toApi();
    }
    if (recherche != null && recherche!.trim().isNotEmpty) {
      params['recherche'] = recherche!.trim();
    }
    return params;
  }
}

/// Corps texte (hors fichiers) de POST /api/centres-sante.
///
/// Rappel métier :
///   - `statutVerification` n'a d'effet que si l'utilisateur connecté
///     est admin/superadmin ; sinon la fiche est forcée à "en_cours"
///     côté serveur, quelle que soit la valeur envoyée ici — inutile
///     de la pré-remplir pour un utilisateur non-admin.
///   - `fonction`, `agentNom`, `agentPrenom`, `agentEmail` sont
///     obligatoires : ils créent le COMPTE AGENT du centre (pas
///     forcément la personne connectée qui soumet le formulaire).
///   - `agentTelephone` est optionnel.
///   - Le pays du compte agent est repris automatiquement de `paysId`
///     par le serveur : aucun champ dédié à envoyer.
///   - Les 3 fichiers (image_structure, piece_identite,
///     document_agrement) sont attachés séparément par l'appelant via
///     http.MultipartFile, avec les noms de champs de
///     ChampsFichiersCentreSante.
class CentreSanteCreationRequete {
  final String nom;
  final String paysId;
  final String villeId;
  final String telephone;
  final StatutVerificationStructure statutVerification;
  final TypeStructure typeStructure;
  final double? latitude;
  final double? longitude;
  final String fonction;
  final String agentNom;
  final String agentPrenom;
  final String agentEmail;
  final String? agentTelephone;

  const CentreSanteCreationRequete({
    required this.nom,
    required this.paysId,
    required this.villeId,
    required this.telephone,
    required this.statutVerification,
    required this.typeStructure,
    this.latitude,
    this.longitude,
    required this.fonction,
    required this.agentNom,
    required this.agentPrenom,
    required this.agentEmail,
    this.agentTelephone,
  });

  /// Champs texte prêts à être ajoutés à un http.MultipartRequest.fields.
  Map<String, String> toChampsTexte() {
    final champs = <String, String>{
      'nom': nom,
      'pays_id': paysId,
      'ville_id': villeId,
      'telephone': telephone,
      'statut_verification': statutVerification.toApi(),
      'type_structure': typeStructure.toApi(),
      'fonction': fonction,
      'agent_nom': agentNom,
      'agent_prenom': agentPrenom,
      'agent_email': agentEmail,
    };
    if (latitude != null) champs['latitude'] = latitude!.toString();
    if (longitude != null) champs['longitude'] = longitude!.toString();
    if (agentTelephone != null && agentTelephone!.trim().isNotEmpty) {
      champs['agent_telephone'] = agentTelephone!;
    }
    return champs;
  }
}

/// Corps texte (hors fichiers) de PUT /api/centres-sante/:id.
///
/// Tous les champs sont optionnels : seuls ceux fournis sont modifiés
/// côté serveur (voir modifierCentreSante). Idem pour les 3 fichiers,
/// à joindre uniquement s'ils doivent être remplacés.
///
/// Cas particulier de la géolocalisation (voir
/// appliquerGeolocalisation côté serveur) :
///   - latitude ET longitude renseignées -> définit le point ;
///   - latitude ET longitude explicitement à `null` alors que
///     `effacerGeolocalisation` est `true` -> efface le point existant ;
///   - aucune des deux fournies -> ne touche pas au champ.
class CentreSanteMiseAJourRequete {
  final String? nom;
  final String? paysId;
  final String? villeId;
  final String? telephone;

  /// Ignoré côté serveur si l'utilisateur connecté n'est pas
  /// admin/superadmin (la fiche repasse alors en "en_cours").
  final StatutVerificationStructure? statutVerification;
  final TypeStructure? typeStructure;
  final double? latitude;
  final double? longitude;

  /// Si `true`, envoie explicitement `latitude`/`longitude` à `null`
  /// pour effacer la position existante (voir règle ci-dessus).
  final bool effacerGeolocalisation;

  const CentreSanteMiseAJourRequete({
    this.nom,
    this.paysId,
    this.villeId,
    this.telephone,
    this.statutVerification,
    this.typeStructure,
    this.latitude,
    this.longitude,
    this.effacerGeolocalisation = false,
  });

  Map<String, String> toChampsTexte() {
    final champs = <String, String>{};
    if (nom != null) champs['nom'] = nom!;
    if (paysId != null) champs['pays_id'] = paysId!;
    if (villeId != null) champs['ville_id'] = villeId!;
    if (telephone != null) champs['telephone'] = telephone!;
    if (statutVerification != null) {
      champs['statut_verification'] = statutVerification!.toApi();
    }
    if (typeStructure != null) {
      champs['type_structure'] = typeStructure!.toApi();
    }
    if (effacerGeolocalisation) {
      champs['latitude'] = 'null';
      champs['longitude'] = 'null';
    } else {
      if (latitude != null) champs['latitude'] = latitude!.toString();
      if (longitude != null) champs['longitude'] = longitude!.toString();
    }
    return champs;
  }
}