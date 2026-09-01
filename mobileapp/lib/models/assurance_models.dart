// assurance_models.dart
// Modèles Dart pour le composant "annuaire — assurance"
// (diagramme 08_annuaire_assurances : service_assurance, mise_en_relation,
// catalogue activite / option_activite, agence).
//
// Aligné sur :
//   - schema.prisma           -> model ServiceAssurance / AgentAssurance /
//                                 MiseEnRelation / Activite / OptionActivite /
//                                 Agence
//   - assurance.controller.js -> forme exacte des réponses JSON
//   - assurance.routes.js     -> règles d'accès (voir rappel ci-dessous)
//
// Rappel des règles d'accès (voir assurance.routes.js) :
//   - service_assurance   : GET publique ; POST/PUT tout utilisateur
//                            authentifié (quel que soit son rôle) ; DELETE
//                            superadmin uniquement.
//   - mise_en_relation    : POST tout utilisateur authentifié ; GET/DELETE
//                            agent du service_assurance concerné, ou
//                            admin/superadmin.
//   - activite / option_activite / agence : GET publique ; écriture réservée
//                            à l'agent du service_assurance concerné (déduit
//                            directement, ou via l'activité parente pour
//                            option_activite), ou admin/superadmin.
//
// Notes de conception (mêmes choix que centresante_models.dart) :
//   - Aucune dépendance externe (pas de json_serializable) : tout est écrit
//     à la main pour rester autonome dans ce seul fichier.
//   - Les enums Dart exposent une valeur "fil" (wire value) identique aux
//     enums Prisma (ex: "en_cours"), car c'est ce que l'API envoie/attend
//     tel quel dans le JSON.
//   - ServiceAssurance et Agence correspondent au JSON déjà "enrichi" par le
//     contrôleur (enrichirServiceAssurance / enrichirAgence) :
//     geolocalisation/gps déjà résolues en SQL brut, et image_url déjà
//     reconstruite (Cloudinary) — le front n'a jamais besoin de connaître
//     cette logique.
//   - service_assurance est multipart/form-data (1 fichier obligatoire à la
//     création, optionnel en modification) : ServiceAssuranceCreationRequete
//     / ServiceAssuranceMiseAJourRequete exposent les champs texte via
//     toChampsTexte() ; l'appel http.MultipartFile pour le fichier reste à
//     la charge de l'appelant (voir ChampsFichiersAssurance). Les autres
//     écritures (activite, option_activite, agence, mise_en_relation) sont
//     de simples requêtes JSON : leurs classes *Requete exposent toJson().

/// Lit une valeur potentiellement absente/nulle sans planter la
/// désérialisation d'une liste entière à cause d'un seul champ manquant ou
/// de type inattendu (même helper que referentiel_models.dart /
/// centresante_models.dart).
T? _lire<T>(Map<String, dynamic> json, String cle) {
  final valeur = json[cle];
  if (valeur is T) return valeur;
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────

/// Type d'acteur du service d'assurance (enum applicatif TypeActeurAssurance
/// côté serveur : ["compagnie", "courtier"]).
enum TypeActeurAssurance {
  compagnie,
  courtier;

  /// Valeur telle qu'envoyée/attendue par l'API.
  String toApi() {
    switch (this) {
      case TypeActeurAssurance.compagnie:
        return 'compagnie';
      case TypeActeurAssurance.courtier:
        return 'courtier';
    }
  }

  /// Libellé lisible pour l'UI (français).
  String get libelle {
    switch (this) {
      case TypeActeurAssurance.compagnie:
        return 'Compagnie';
      case TypeActeurAssurance.courtier:
        return 'Courtier';
    }
  }

  /// Tolérant : une valeur API inconnue ou absente retombe sur
  /// [TypeActeurAssurance.compagnie] plutôt que de planter la
  /// désérialisation de toute une liste (même logique que
  /// `TypeStructure.fromApi` dans centresante_models.dart).
  static TypeActeurAssurance fromApi(String? valeur) {
    return TypeActeurAssurance.values.firstWhere(
          (v) => v.toApi() == valeur,
      orElse: () => TypeActeurAssurance.compagnie,
    );
  }
}

/// Statut de vérification/modération de la fiche service_assurance
/// (enum applicatif STATUTS_VERIFICATION_ASSURANCE côté serveur :
/// ["non_publie", "en_cours", "publie"]).
///
/// Rappel des règles côté API (voir assurance.controller.js) :
///   - à la création/modification, seul admin/superadmin peut choisir
///     librement cette valeur ;
///   - pour tout autre profil, elle est systématiquement forcée à
///     `enCours`, quelle que soit la valeur envoyée.
enum StatutVerificationAssurance {
  nonPublie,
  enCours,
  publie;

  String toApi() {
    switch (this) {
      case StatutVerificationAssurance.nonPublie:
        return 'non_publie';
      case StatutVerificationAssurance.enCours:
        return 'en_cours';
      case StatutVerificationAssurance.publie:
        return 'publie';
    }
  }

  String get libelle {
    switch (this) {
      case StatutVerificationAssurance.nonPublie:
        return 'Non publié';
      case StatutVerificationAssurance.enCours:
        return 'En cours de vérification';
      case StatutVerificationAssurance.publie:
        return 'Publié';
    }
  }

  /// Tolérant : une valeur API inconnue ou absente retombe sur l'état le
  /// plus restrictif ([StatutVerificationAssurance.nonPublie]) plutôt que
  /// de planter la désérialisation de toute une liste.
  static StatutVerificationAssurance fromApi(String? valeur) {
    return StatutVerificationAssurance.values.firstWhere(
          (v) => v.toApi() == valeur,
      orElse: () => StatutVerificationAssurance.nonPublie,
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// Sous-modèles légers (référentiel géographique inclus par l'API)
// ─────────────────────────────────────────────────────────────────

/// Version allégée de `Pays`, telle qu'incluse par
/// `prisma.serviceAssurance.findMany({ include: { pays: true } })`
/// (pas de devise/langue imbriquées côté assurance.controller.js).
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
      identical(this, other) || (other is VilleLite && other.villeId == villeId);

  @override
  int get hashCode => villeId.hashCode;
}

/// Coordonnées GPS résolues côté serveur depuis un champ PostGIS
/// `GEOGRAPHY(POINT,4326)` — voir recupererGeolocalisation() /
/// recupererGpsAgence() dans le contrôleur. `null` si la fiche n'a pas
/// encore de position renseignée. Utilisée pour
/// ServiceAssurance.geolocalisation ET Agence.gps (même forme JSON
/// `{ latitude, longitude }` dans les deux cas).
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
// Modèle principal : ServiceAssurance
// ─────────────────────────────────────────────────────────────────

/// Fiche annuaire d'un service d'assurance (compagnie ou courtier), telle
/// que renvoyée par GET /api/services-assurance, GET
/// /api/services-assurance/:id, POST /api/services-assurance et PUT
/// /api/services-assurance/:id (champ `service_assurance` /
/// `services_assurance` de la réponse, déjà enrichi par
/// enrichirServiceAssurance() : geolocalisation résolue + image_url
/// Cloudinary reconstruite).
class ServiceAssurance {
  final String serviceAssuranceId;
  final String nom;
  final String paysId;
  final String villeId;
  final String telephone;
  final String email;
  final String agrement;
  final String? description;
  final StatutVerificationAssurance statutVerification;
  final TypeActeurAssurance typeActeur;

  /// public_id Cloudinary (jamais l'URL) de l'image compagnie/courtier.
  /// Nom de champ trompeur hérité du schéma (voir commentaire d'en-tête du
  /// contrôleur) : c'est bien un nom Cloudinary, pas une URL.
  final String fileUrl;

  /// URL publique reconstruite côté serveur — à utiliser directement dans
  /// un Image.network par ex.
  final String imageUrl;

  final Geolocalisation? geolocalisation;

  /// Présents dès lors que la réponse API a été construite avec
  /// `include: { pays: true, ville: true }` (c'est le cas sur toutes les
  /// routes de ce module).
  final PaysLite? pays;
  final VilleLite? ville;

  const ServiceAssurance({
    required this.serviceAssuranceId,
    required this.nom,
    required this.paysId,
    required this.villeId,
    required this.telephone,
    required this.email,
    required this.agrement,
    this.description,
    required this.statutVerification,
    required this.typeActeur,
    required this.fileUrl,
    required this.imageUrl,
    this.geolocalisation,
    this.pays,
    this.ville,
  });

  factory ServiceAssurance.fromJson(Map<String, dynamic> json) {
    return ServiceAssurance(
      serviceAssuranceId: json['service_assurance_id'] as String,
      nom: json['nom'] as String,
      paysId: json['pays_id'] as String,
      villeId: json['ville_id'] as String,
      telephone: json['telephone'] as String,
      email: json['email'] as String,
      agrement: json['agrement'] as String,
      description: _lire<String>(json, 'description'),
      statutVerification: StatutVerificationAssurance.fromApi(
        json['statut_verification'] as String?,
      ),
      typeActeur: TypeActeurAssurance.fromApi(json['type_acteur'] as String?),
      fileUrl: json['file_url'] as String,
      imageUrl: json['image_url'] as String,
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
    'service_assurance_id': serviceAssuranceId,
    'nom': nom,
    'pays_id': paysId,
    'ville_id': villeId,
    'telephone': telephone,
    'email': email,
    'agrement': agrement,
    'description': description,
    'statut_verification': statutVerification.toApi(),
    'type_acteur': typeActeur.toApi(),
    'file_url': fileUrl,
    'image_url': imageUrl,
    'geolocalisation': geolocalisation?.toJson(),
    'pays': pays?.toJson(),
    'ville': ville?.toJson(),
  };

  ServiceAssurance copyWith({
    String? serviceAssuranceId,
    String? nom,
    String? paysId,
    String? villeId,
    String? telephone,
    String? email,
    String? agrement,
    String? description,
    StatutVerificationAssurance? statutVerification,
    TypeActeurAssurance? typeActeur,
    String? fileUrl,
    String? imageUrl,
    Geolocalisation? geolocalisation,
    PaysLite? pays,
    VilleLite? ville,
  }) {
    return ServiceAssurance(
      serviceAssuranceId: serviceAssuranceId ?? this.serviceAssuranceId,
      nom: nom ?? this.nom,
      paysId: paysId ?? this.paysId,
      villeId: villeId ?? this.villeId,
      telephone: telephone ?? this.telephone,
      email: email ?? this.email,
      agrement: agrement ?? this.agrement,
      description: description ?? this.description,
      statutVerification: statutVerification ?? this.statutVerification,
      typeActeur: typeActeur ?? this.typeActeur,
      fileUrl: fileUrl ?? this.fileUrl,
      imageUrl: imageUrl ?? this.imageUrl,
      geolocalisation: geolocalisation ?? this.geolocalisation,
      pays: pays ?? this.pays,
      ville: ville ?? this.ville,
    );
  }

  @override
  String toString() => 'ServiceAssurance($serviceAssuranceId, $nom)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is ServiceAssurance &&
              other.serviceAssuranceId == serviceAssuranceId);

  @override
  int get hashCode => serviceAssuranceId.hashCode;
}

// ─────────────────────────────────────────────────────────────────
// Agent rattaché au service (créé dans la même transaction que le
// service, uniquement présent dans la réponse de POST /services-assurance)
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

/// Fiche `agent_assurance` + compte associé, telle que renvoyée (une seule
/// fois) dans le champ `agent` de la réponse 201 de POST
/// /api/services-assurance.
///
/// ⚠️ `motDePasseTemporaire` est le mot de passe EN CLAIR, transmis une
/// unique fois par le serveur. Il doit être affiché à l'auteur de la
/// soumission puis communiqué à l'agent par un canal sûr — ne jamais le
/// journaliser ni le persister côté client au-delà de cet écran.
class AgentServiceAssurance {
  final String agentId;
  final String fonction;
  final AgentUtilisateurLite utilisateur;
  final String motDePasseTemporaire;

  const AgentServiceAssurance({
    required this.agentId,
    required this.fonction,
    required this.utilisateur,
    required this.motDePasseTemporaire,
  });

  factory AgentServiceAssurance.fromJson(Map<String, dynamic> json) {
    return AgentServiceAssurance(
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
  String toString() => 'AgentServiceAssurance($agentId, $fonction)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is AgentServiceAssurance && other.agentId == agentId);

  @override
  int get hashCode => agentId.hashCode;
}

// ─────────────────────────────────────────────────────────────────
// Catalogue : Activite / OptionActivite
// ─────────────────────────────────────────────────────────────────

/// Option rattachée à une activité (ex. "Hospitalisation", "Maternité").
/// Lecture publique ; écriture réservée à l'agent du service_assurance
/// propriétaire de l'activité parente, ou à admin/superadmin (déduit
/// indirectement côté serveur — voir obtenirServiceAssuranceIdDeLActivite).
class OptionActivite {
  final String optionActiviteId;
  final String activiteId;
  final String libelle;
  final String? description;

  const OptionActivite({
    required this.optionActiviteId,
    required this.activiteId,
    required this.libelle,
    this.description,
  });

  factory OptionActivite.fromJson(Map<String, dynamic> json) {
    return OptionActivite(
      optionActiviteId: json['option_activite_id'] as String,
      activiteId: json['activite_id'] as String,
      libelle: json['libelle'] as String,
      description: _lire<String>(json, 'description'),
    );
  }

  Map<String, dynamic> toJson() => {
    'option_activite_id': optionActiviteId,
    'activite_id': activiteId,
    'libelle': libelle,
    'description': description,
  };

  OptionActivite copyWith({
    String? optionActiviteId,
    String? activiteId,
    String? libelle,
    String? description,
  }) {
    return OptionActivite(
      optionActiviteId: optionActiviteId ?? this.optionActiviteId,
      activiteId: activiteId ?? this.activiteId,
      libelle: libelle ?? this.libelle,
      description: description ?? this.description,
    );
  }

  @override
  String toString() => 'OptionActivite($optionActiviteId, $libelle)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is OptionActivite &&
              other.optionActiviteId == optionActiviteId);

  @override
  int get hashCode => optionActiviteId.hashCode;
}

/// Activité du catalogue produits d'un service d'assurance (ex. "Activa
/// Santé Individuelle" / public_cible "Particuliers et familles"). Lecture
/// publique ; écriture réservée à l'agent du service_assurance concerné, ou
/// à admin/superadmin.
///
/// `options` n'est peuplé que lorsque le backend l'inclut
/// (`include: { options: true }`, systématique sur listerActivites /
/// obtenirActivite), mais le modèle reste utilisable même sans.
class Activite {
  final String activiteId;
  final String serviceAssuranceId;
  final String titre;
  final String publicCible;
  final String? description;
  final List<OptionActivite>? options;

  const Activite({
    required this.activiteId,
    required this.serviceAssuranceId,
    required this.titre,
    required this.publicCible,
    this.description,
    this.options,
  });

  factory Activite.fromJson(Map<String, dynamic> json) {
    return Activite(
      activiteId: json['activite_id'] as String,
      serviceAssuranceId: json['service_assurance_id'] as String,
      titre: json['titre'] as String,
      publicCible: json['public_cible'] as String,
      description: _lire<String>(json, 'description'),
      options: json['options'] is List
          ? (json['options'] as List)
          .whereType<Map<String, dynamic>>()
          .map(OptionActivite.fromJson)
          .toList()
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'activite_id': activiteId,
    'service_assurance_id': serviceAssuranceId,
    'titre': titre,
    'public_cible': publicCible,
    'description': description,
    if (options != null) 'options': options!.map((o) => o.toJson()).toList(),
  };

  Activite copyWith({
    String? activiteId,
    String? serviceAssuranceId,
    String? titre,
    String? publicCible,
    String? description,
    List<OptionActivite>? options,
  }) {
    return Activite(
      activiteId: activiteId ?? this.activiteId,
      serviceAssuranceId: serviceAssuranceId ?? this.serviceAssuranceId,
      titre: titre ?? this.titre,
      publicCible: publicCible ?? this.publicCible,
      description: description ?? this.description,
      options: options ?? this.options,
    );
  }

  @override
  String toString() => 'Activite($activiteId, $titre)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is Activite && other.activiteId == activiteId);

  @override
  int get hashCode => activiteId.hashCode;
}

// ─────────────────────────────────────────────────────────────────
// Agence (implantation physique d'un service d'assurance)
// ─────────────────────────────────────────────────────────────────

/// Implantation physique d'un service d'assurance (ex. "Agence Douala —
/// Akwa (Siège)"). Lecture publique ; écriture réservée à l'agent du
/// service_assurance concerné, ou à admin/superadmin. `gps` suit le même
/// patron que ServiceAssurance.geolocalisation (résolu en SQL brut côté
/// serveur, voir enrichirAgence()).
class Agence {
  final String agenceId;
  final String serviceAssuranceId;
  final String libelle;
  final String localisation;
  final String contact;
  final Geolocalisation? gps;

  const Agence({
    required this.agenceId,
    required this.serviceAssuranceId,
    required this.libelle,
    required this.localisation,
    required this.contact,
    this.gps,
  });

  factory Agence.fromJson(Map<String, dynamic> json) {
    return Agence(
      agenceId: json['agence_id'] as String,
      serviceAssuranceId: json['service_assurance_id'] as String,
      libelle: json['libelle'] as String,
      localisation: json['localisation'] as String,
      contact: json['contact'] as String,
      gps: json['gps'] is Map<String, dynamic>
          ? Geolocalisation.fromJson(json['gps'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'agence_id': agenceId,
    'service_assurance_id': serviceAssuranceId,
    'libelle': libelle,
    'localisation': localisation,
    'contact': contact,
    'gps': gps?.toJson(),
  };

  Agence copyWith({
    String? agenceId,
    String? serviceAssuranceId,
    String? libelle,
    String? localisation,
    String? contact,
    Geolocalisation? gps,
  }) {
    return Agence(
      agenceId: agenceId ?? this.agenceId,
      serviceAssuranceId: serviceAssuranceId ?? this.serviceAssuranceId,
      libelle: libelle ?? this.libelle,
      localisation: localisation ?? this.localisation,
      contact: contact ?? this.contact,
      gps: gps ?? this.gps,
    );
  }

  @override
  String toString() => 'Agence($agenceId, $libelle)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is Agence && other.agenceId == agenceId);

  @override
  int get hashCode => agenceId.hashCode;
}

// ─────────────────────────────────────────────────────────────────
// Mise en relation
// ─────────────────────────────────────────────────────────────────

/// Identité minimale de l'auteur d'une mise en relation, telle qu'incluse
/// par `include: { utilisateur: { select: { nom, prenom, email,
/// telephone } } }` (voir listerMisesEnRelationAssurance).
class MiseEnRelationUtilisateurLite {
  final String nom;
  final String prenom;
  final String email;
  final String? telephone;

  const MiseEnRelationUtilisateurLite({
    required this.nom,
    required this.prenom,
    required this.email,
    this.telephone,
  });

  factory MiseEnRelationUtilisateurLite.fromJson(Map<String, dynamic> json) {
    return MiseEnRelationUtilisateurLite(
      nom: json['nom'] as String,
      prenom: json['prenom'] as String,
      email: json['email'] as String,
      telephone: _lire<String>(json, 'telephone'),
    );
  }

  Map<String, dynamic> toJson() => {
    'nom': nom,
    'prenom': prenom,
    'email': email,
    'telephone': telephone,
  };

  @override
  String toString() => 'MiseEnRelationUtilisateurLite($nom, $prenom)';
}

/// Sollicitation d'un service d'assurance par un utilisateur authentifié
/// (n'importe quel rôle — remplace l'ancien "contact_prospect_assurance"
/// restreint au rôle patient). Donnée commerciale privée : lecture/
/// suppression réservées à l'agent du service_assurance concerné, ou à
/// admin/superadmin. `utilisateur` n'est peuplé que sur
/// listerMisesEnRelationAssurance (include ciblé) ; absent de la réponse de
/// création.
class MiseEnRelation {
  final String miseEnRelationId;
  final String utilisateurId;
  final String serviceAssuranceId;
  final String message;
  final DateTime? dateCreation;
  final MiseEnRelationUtilisateurLite? utilisateur;

  const MiseEnRelation({
    required this.miseEnRelationId,
    required this.utilisateurId,
    required this.serviceAssuranceId,
    required this.message,
    this.dateCreation,
    this.utilisateur,
  });

  factory MiseEnRelation.fromJson(Map<String, dynamic> json) {
    final dateBrute = _lire<String>(json, 'date_creation');
    return MiseEnRelation(
      miseEnRelationId: json['mise_en_relation_id'] as String,
      utilisateurId: json['utilisateur_id'] as String,
      serviceAssuranceId: json['service_assurance_id'] as String,
      message: json['message'] as String,
      dateCreation: dateBrute != null ? DateTime.tryParse(dateBrute) : null,
      utilisateur: json['utilisateur'] is Map<String, dynamic>
          ? MiseEnRelationUtilisateurLite.fromJson(
          json['utilisateur'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'mise_en_relation_id': miseEnRelationId,
    'utilisateur_id': utilisateurId,
    'service_assurance_id': serviceAssuranceId,
    'message': message,
    'date_creation': dateCreation?.toIso8601String(),
    if (utilisateur != null) 'utilisateur': utilisateur!.toJson(),
  };

  @override
  String toString() => 'MiseEnRelation($miseEnRelationId)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is MiseEnRelation &&
              other.miseEnRelationId == miseEnRelationId);

  @override
  int get hashCode => miseEnRelationId.hashCode;
}

// ─────────────────────────────────────────────────────────────────
// Enveloppes de réponse (forme exacte des payloads JSON du contrôleur)
// ─────────────────────────────────────────────────────────────────

/// GET /api/services-assurance -> { services_assurance: [...] }
class ServicesAssuranceListeReponse {
  final List<ServiceAssurance> servicesAssurance;

  const ServicesAssuranceListeReponse({required this.servicesAssurance});

  factory ServicesAssuranceListeReponse.fromJson(Map<String, dynamic> json) {
    final liste = (json['services_assurance'] as List<dynamic>? ?? [])
        .map((e) => ServiceAssurance.fromJson(e as Map<String, dynamic>))
        .toList();
    return ServicesAssuranceListeReponse(servicesAssurance: liste);
  }
}

/// GET /api/services-assurance/:id -> { service_assurance: {...} }
class ServiceAssuranceDetailReponse {
  final ServiceAssurance serviceAssurance;

  const ServiceAssuranceDetailReponse({required this.serviceAssurance});

  factory ServiceAssuranceDetailReponse.fromJson(Map<String, dynamic> json) {
    return ServiceAssuranceDetailReponse(
      serviceAssurance: ServiceAssurance.fromJson(
        json['service_assurance'] as Map<String, dynamic>,
      ),
    );
  }
}

/// 201 de POST /api/services-assurance ->
/// { message, service_assurance, agent } (agent.mot_de_passe_temporaire
/// n'apparaît qu'ici, une seule fois).
class ServiceAssuranceCreationReponse {
  final String message;
  final ServiceAssurance serviceAssurance;
  final AgentServiceAssurance agent;

  const ServiceAssuranceCreationReponse({
    required this.message,
    required this.serviceAssurance,
    required this.agent,
  });

  factory ServiceAssuranceCreationReponse.fromJson(Map<String, dynamic> json) {
    return ServiceAssuranceCreationReponse(
      message: json['message'] as String? ?? '',
      serviceAssurance: ServiceAssurance.fromJson(
        json['service_assurance'] as Map<String, dynamic>,
      ),
      agent: AgentServiceAssurance.fromJson(
        json['agent'] as Map<String, dynamic>,
      ),
    );
  }
}

/// 200 de PUT /api/services-assurance/:id -> { message, service_assurance }
class ServiceAssuranceMiseAJourReponse {
  final String message;
  final ServiceAssurance serviceAssurance;

  const ServiceAssuranceMiseAJourReponse({
    required this.message,
    required this.serviceAssurance,
  });

  factory ServiceAssuranceMiseAJourReponse.fromJson(
      Map<String, dynamic> json) {
    return ServiceAssuranceMiseAJourReponse(
      message: json['message'] as String? ?? '',
      serviceAssurance: ServiceAssurance.fromJson(
        json['service_assurance'] as Map<String, dynamic>,
      ),
    );
  }
}

/// GET /api/activites -> { activites: [...] }
class ActivitesListeReponse {
  final List<Activite> activites;

  const ActivitesListeReponse({required this.activites});

  factory ActivitesListeReponse.fromJson(Map<String, dynamic> json) {
    final liste = (json['activites'] as List<dynamic>? ?? [])
        .map((e) => Activite.fromJson(e as Map<String, dynamic>))
        .toList();
    return ActivitesListeReponse(activites: liste);
  }
}

/// GET /api/activites/:id -> { activite: {...} }
class ActiviteDetailReponse {
  final Activite activite;

  const ActiviteDetailReponse({required this.activite});

  factory ActiviteDetailReponse.fromJson(Map<String, dynamic> json) {
    return ActiviteDetailReponse(
      activite: Activite.fromJson(json['activite'] as Map<String, dynamic>),
    );
  }
}

/// 201 de POST /api/activites -> { message, activite }
/// 200 de PUT /api/activites/:id -> { message, activite }
class ActiviteEcritureReponse {
  final String message;
  final Activite activite;

  const ActiviteEcritureReponse({required this.message, required this.activite});

  factory ActiviteEcritureReponse.fromJson(Map<String, dynamic> json) {
    return ActiviteEcritureReponse(
      message: json['message'] as String? ?? '',
      activite: Activite.fromJson(json['activite'] as Map<String, dynamic>),
    );
  }
}

/// GET /api/options-activite -> { options_activite: [...] }
class OptionsActiviteListeReponse {
  final List<OptionActivite> optionsActivite;

  const OptionsActiviteListeReponse({required this.optionsActivite});

  factory OptionsActiviteListeReponse.fromJson(Map<String, dynamic> json) {
    final liste = (json['options_activite'] as List<dynamic>? ?? [])
        .map((e) => OptionActivite.fromJson(e as Map<String, dynamic>))
        .toList();
    return OptionsActiviteListeReponse(optionsActivite: liste);
  }
}

/// GET /api/options-activite/:id -> { option_activite: {...} }
class OptionActiviteDetailReponse {
  final OptionActivite optionActivite;

  const OptionActiviteDetailReponse({required this.optionActivite});

  factory OptionActiviteDetailReponse.fromJson(Map<String, dynamic> json) {
    return OptionActiviteDetailReponse(
      optionActivite: OptionActivite.fromJson(
        json['option_activite'] as Map<String, dynamic>,
      ),
    );
  }
}

/// 201 de POST /api/options-activite -> { message, option_activite }
/// 200 de PUT /api/options-activite/:id -> { message, option_activite }
class OptionActiviteEcritureReponse {
  final String message;
  final OptionActivite optionActivite;

  const OptionActiviteEcritureReponse({
    required this.message,
    required this.optionActivite,
  });

  factory OptionActiviteEcritureReponse.fromJson(Map<String, dynamic> json) {
    return OptionActiviteEcritureReponse(
      message: json['message'] as String? ?? '',
      optionActivite: OptionActivite.fromJson(
        json['option_activite'] as Map<String, dynamic>,
      ),
    );
  }
}

/// GET /api/agences -> { agences: [...] }
class AgencesListeReponse {
  final List<Agence> agences;

  const AgencesListeReponse({required this.agences});

  factory AgencesListeReponse.fromJson(Map<String, dynamic> json) {
    final liste = (json['agences'] as List<dynamic>? ?? [])
        .map((e) => Agence.fromJson(e as Map<String, dynamic>))
        .toList();
    return AgencesListeReponse(agences: liste);
  }
}

/// GET /api/agences/:id -> { agence: {...} }
class AgenceDetailReponse {
  final Agence agence;

  const AgenceDetailReponse({required this.agence});

  factory AgenceDetailReponse.fromJson(Map<String, dynamic> json) {
    return AgenceDetailReponse(
      agence: Agence.fromJson(json['agence'] as Map<String, dynamic>),
    );
  }
}

/// 201 de POST /api/agences -> { message, agence }
/// 200 de PUT /api/agences/:id -> { message, agence }
class AgenceEcritureReponse {
  final String message;
  final Agence agence;

  const AgenceEcritureReponse({required this.message, required this.agence});

  factory AgenceEcritureReponse.fromJson(Map<String, dynamic> json) {
    return AgenceEcritureReponse(
      message: json['message'] as String? ?? '',
      agence: Agence.fromJson(json['agence'] as Map<String, dynamic>),
    );
  }
}

/// GET /api/mises-en-relation-assurance -> { mises_en_relation: [...] }
class MisesEnRelationListeReponse {
  final List<MiseEnRelation> misesEnRelation;

  const MisesEnRelationListeReponse({required this.misesEnRelation});

  factory MisesEnRelationListeReponse.fromJson(Map<String, dynamic> json) {
    final liste = (json['mises_en_relation'] as List<dynamic>? ?? [])
        .map((e) => MiseEnRelation.fromJson(e as Map<String, dynamic>))
        .toList();
    return MisesEnRelationListeReponse(misesEnRelation: liste);
  }
}

/// 201 de POST /api/mises-en-relation-assurance ->
/// { message, mise_en_relation }
class MiseEnRelationCreationReponse {
  final String message;
  final MiseEnRelation miseEnRelation;

  const MiseEnRelationCreationReponse({
    required this.message,
    required this.miseEnRelation,
  });

  factory MiseEnRelationCreationReponse.fromJson(Map<String, dynamic> json) {
    return MiseEnRelationCreationReponse(
      message: json['message'] as String? ?? '',
      miseEnRelation: MiseEnRelation.fromJson(
        json['mise_en_relation'] as Map<String, dynamic>,
      ),
    );
  }
}

/// Réponse générique { message } — utilisée par DELETE et par les cas
/// d'erreur (400/403/404/409) de toutes les routes du module.
class MessageReponse {
  final String message;

  const MessageReponse({required this.message});

  factory MessageReponse.fromJson(Map<String, dynamic> json) {
    return MessageReponse(message: json['message'] as String? ?? '');
  }
}

// ─────────────────────────────────────────────────────────────────
// Requêtes sortantes — service_assurance (multipart/form-data)
// ─────────────────────────────────────────────────────────────────

/// Nom du champ fichier attendu en multipart/form-data (POST : obligatoire ;
/// PUT : optionnel — voir upload.middleware.js / assurance.controller.js).
/// À utiliser comme `field` lors de la construction d'un
/// http.MultipartFile.
class ChampsFichiersAssurance {
  static const String imageAssurance = 'image_assurance';
}

/// Filtres optionnels de GET /api/services-assurance
/// (?pays_id=&ville_id=&type_acteur=&statut_verification=&recherche=).
class ServicesAssuranceFiltre {
  final String? paysId;
  final String? villeId;
  final TypeActeurAssurance? typeActeur;
  final StatutVerificationAssurance? statutVerification;

  /// Recherche insensible à la casse sur `nom` (SQL `contains`).
  final String? recherche;

  const ServicesAssuranceFiltre({
    this.paysId,
    this.villeId,
    this.typeActeur,
    this.statutVerification,
    this.recherche,
  });

  /// À passer tel quel en `queryParameters` d'une requête Dio/http.
  Map<String, String> toQueryParameters() {
    final params = <String, String>{};
    if (paysId != null) params['pays_id'] = paysId!;
    if (villeId != null) params['ville_id'] = villeId!;
    if (typeActeur != null) params['type_acteur'] = typeActeur!.toApi();
    if (statutVerification != null) {
      params['statut_verification'] = statutVerification!.toApi();
    }
    if (recherche != null && recherche!.trim().isNotEmpty) {
      params['recherche'] = recherche!.trim();
    }
    return params;
  }
}

/// Corps texte (hors fichier) de POST /api/services-assurance.
///
/// Rappel métier :
///   - `statutVerification` n'a d'effet que si l'utilisateur connecté est
///     admin/superadmin ; sinon la fiche est forcée à "en_cours" côté
///     serveur, quelle que soit la valeur envoyée ici.
///   - `fonction`, `agentNom`, `agentPrenom`, `agentEmail` sont
///     obligatoires : ils créent le COMPTE AGENT du service (pas
///     forcément la personne connectée qui soumet le formulaire).
///   - `agentTelephone` est optionnel.
///   - Le pays du compte agent est repris automatiquement de `paysId` par
///     le serveur : aucun champ dédié à envoyer.
///   - Le fichier (image_assurance) est attaché séparément par l'appelant
///     via http.MultipartFile, avec le nom de champ de
///     ChampsFichiersAssurance.imageAssurance.
class ServiceAssuranceCreationRequete {
  final String nom;
  final String paysId;
  final String villeId;
  final String telephone;
  final String email;
  final String agrement;
  final String? description;
  final StatutVerificationAssurance statutVerification;
  final TypeActeurAssurance typeActeur;
  final double? latitude;
  final double? longitude;
  final String fonction;
  final String agentNom;
  final String agentPrenom;
  final String agentEmail;
  final String? agentTelephone;

  const ServiceAssuranceCreationRequete({
    required this.nom,
    required this.paysId,
    required this.villeId,
    required this.telephone,
    required this.email,
    required this.agrement,
    this.description,
    required this.statutVerification,
    required this.typeActeur,
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
      'email': email,
      'agrement': agrement,
      'statut_verification': statutVerification.toApi(),
      'type_acteur': typeActeur.toApi(),
      'fonction': fonction,
      'agent_nom': agentNom,
      'agent_prenom': agentPrenom,
      'agent_email': agentEmail,
    };
    if (description != null && description!.trim().isNotEmpty) {
      champs['description'] = description!;
    }
    if (latitude != null) champs['latitude'] = latitude!.toString();
    if (longitude != null) champs['longitude'] = longitude!.toString();
    if (agentTelephone != null && agentTelephone!.trim().isNotEmpty) {
      champs['agent_telephone'] = agentTelephone!;
    }
    return champs;
  }
}

/// Corps texte (hors fichier) de PUT /api/services-assurance/:id.
///
/// Tous les champs sont optionnels : seuls ceux fournis sont modifiés côté
/// serveur (voir modifierServiceAssurance). Idem pour le fichier, à joindre
/// uniquement s'il doit être remplacé. Ne touche jamais au compte agent
/// (déjà créé une fois pour toutes à la création du service).
///
/// Cas particulier de la géolocalisation (voir appliquerGeolocalisation
/// côté serveur) :
///   - latitude ET longitude renseignées -> définit le point ;
///   - `effacerGeolocalisation` à `true` -> envoie explicitement
///     latitude/longitude à `null` pour effacer le point existant ;
///   - aucune des deux fournies -> ne touche pas au champ.
class ServiceAssuranceMiseAJourRequete {
  final String? nom;
  final String? paysId;
  final String? villeId;
  final String? telephone;
  final String? email;
  final String? agrement;
  final String? description;

  /// Ignoré côté serveur si l'utilisateur connecté n'est pas
  /// admin/superadmin (la fiche repasse alors en "en_cours").
  final StatutVerificationAssurance? statutVerification;
  final TypeActeurAssurance? typeActeur;
  final double? latitude;
  final double? longitude;

  /// Si `true`, envoie explicitement `latitude`/`longitude` à `null` pour
  /// effacer la position existante (voir règle ci-dessus).
  final bool effacerGeolocalisation;

  const ServiceAssuranceMiseAJourRequete({
    this.nom,
    this.paysId,
    this.villeId,
    this.telephone,
    this.email,
    this.agrement,
    this.description,
    this.statutVerification,
    this.typeActeur,
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
    if (email != null) champs['email'] = email!;
    if (agrement != null) champs['agrement'] = agrement!;
    if (description != null) champs['description'] = description!;
    if (statutVerification != null) {
      champs['statut_verification'] = statutVerification!.toApi();
    }
    if (typeActeur != null) champs['type_acteur'] = typeActeur!.toApi();
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

// ─────────────────────────────────────────────────────────────────
// Requêtes sortantes — activite / option_activite / agence / mise_en_relation
// (JSON, pas de fichiers)
// ─────────────────────────────────────────────────────────────────

/// Filtre optionnel de GET /api/activites (?service_assurance_id=...).
/// Sans filtre, l'API retourne l'ensemble du catalogue.
class ActivitesFiltre {
  final String? serviceAssuranceId;

  const ActivitesFiltre({this.serviceAssuranceId});

  Map<String, String> toQueryParameters() {
    final params = <String, String>{};
    if (serviceAssuranceId != null) {
      params['service_assurance_id'] = serviceAssuranceId!;
    }
    return params;
  }
}

/// Corps JSON de POST /api/activites.
class ActiviteCreationRequete {
  final String serviceAssuranceId;
  final String titre;
  final String publicCible;
  final String? description;

  const ActiviteCreationRequete({
    required this.serviceAssuranceId,
    required this.titre,
    required this.publicCible,
    this.description,
  });

  Map<String, dynamic> toJson() => {
    'service_assurance_id': serviceAssuranceId,
    'titre': titre,
    'public_cible': publicCible,
    if (description != null && description!.trim().isNotEmpty)
      'description': description,
  };
}

/// Corps JSON de PUT /api/activites/:id. Tous les champs sont optionnels ;
/// ne permet pas de déplacer l'activité vers un autre
/// service_assurance_id (non modifiable côté serveur).
class ActiviteMiseAJourRequete {
  final String? titre;
  final String? publicCible;
  final String? description;

  const ActiviteMiseAJourRequete({
    this.titre,
    this.publicCible,
    this.description,
  });

  Map<String, dynamic> toJson() {
    final corps = <String, dynamic>{};
    if (titre != null) corps['titre'] = titre;
    if (publicCible != null) corps['public_cible'] = publicCible;
    if (description != null) corps['description'] = description;
    return corps;
  }
}

/// Corps JSON de POST /api/options-activite.
class OptionActiviteCreationRequete {
  final String activiteId;
  final String libelle;
  final String? description;

  const OptionActiviteCreationRequete({
    required this.activiteId,
    required this.libelle,
    this.description,
  });

  Map<String, dynamic> toJson() => {
    'activite_id': activiteId,
    'libelle': libelle,
    if (description != null && description!.trim().isNotEmpty)
      'description': description,
  };
}

/// Corps JSON de PUT /api/options-activite/:id. Tous les champs sont
/// optionnels ; ne permet pas de déplacer l'option vers une autre
/// activité.
class OptionActiviteMiseAJourRequete {
  final String? libelle;
  final String? description;

  const OptionActiviteMiseAJourRequete({this.libelle, this.description});

  Map<String, dynamic> toJson() {
    final corps = <String, dynamic>{};
    if (libelle != null) corps['libelle'] = libelle;
    if (description != null) corps['description'] = description;
    return corps;
  }
}

/// Filtre optionnel de GET /api/agences (?service_assurance_id=...).
class AgencesFiltre {
  final String? serviceAssuranceId;

  const AgencesFiltre({this.serviceAssuranceId});

  Map<String, String> toQueryParameters() {
    final params = <String, String>{};
    if (serviceAssuranceId != null) {
      params['service_assurance_id'] = serviceAssuranceId!;
    }
    return params;
  }
}

/// Corps JSON de POST /api/agences.
class AgenceCreationRequete {
  final String serviceAssuranceId;
  final String libelle;
  final String localisation;
  final String contact;
  final double? latitude;
  final double? longitude;

  const AgenceCreationRequete({
    required this.serviceAssuranceId,
    required this.libelle,
    required this.localisation,
    required this.contact,
    this.latitude,
    this.longitude,
  });

  Map<String, dynamic> toJson() => {
    'service_assurance_id': serviceAssuranceId,
    'libelle': libelle,
    'localisation': localisation,
    'contact': contact,
    if (latitude != null) 'latitude': latitude,
    if (longitude != null) 'longitude': longitude,
  };
}

/// Corps JSON de PUT /api/agences/:id. Tous les champs sont optionnels ; ne
/// permet pas de déplacer l'agence vers un autre service_assurance_id.
///
/// Même règle de géolocalisation que ServiceAssuranceMiseAJourRequete
/// (voir appliquerGpsAgence côté serveur) : `effacerGps` à `true` envoie
/// explicitement latitude/longitude à `null`.
class AgenceMiseAJourRequete {
  final String? libelle;
  final String? localisation;
  final String? contact;
  final double? latitude;
  final double? longitude;
  final bool effacerGps;

  const AgenceMiseAJourRequete({
    this.libelle,
    this.localisation,
    this.contact,
    this.latitude,
    this.longitude,
    this.effacerGps = false,
  });

  Map<String, dynamic> toJson() {
    final corps = <String, dynamic>{};
    if (libelle != null) corps['libelle'] = libelle;
    if (localisation != null) corps['localisation'] = localisation;
    if (contact != null) corps['contact'] = contact;
    if (effacerGps) {
      corps['latitude'] = null;
      corps['longitude'] = null;
    } else {
      if (latitude != null) corps['latitude'] = latitude;
      if (longitude != null) corps['longitude'] = longitude;
    }
    return corps;
  }
}

/// Filtre requis de GET /api/mises-en-relation-assurance
/// (?service_assurance_id=...) — pas de liste globale non filtrée côté
/// serveur.
class MisesEnRelationFiltre {
  final String serviceAssuranceId;

  const MisesEnRelationFiltre({required this.serviceAssuranceId});

  Map<String, String> toQueryParameters() => {
    'service_assurance_id': serviceAssuranceId,
  };
}

/// Corps JSON de POST /api/mises-en-relation-assurance.
/// `utilisateur_id` n'est jamais envoyé : déduit côté serveur du compte
/// authentifié.
class MiseEnRelationCreationRequete {
  final String serviceAssuranceId;
  final String message;

  const MiseEnRelationCreationRequete({
    required this.serviceAssuranceId,
    required this.message,
  });

  Map<String, dynamic> toJson() => {
    'service_assurance_id': serviceAssuranceId,
    'message': message,
  };
}