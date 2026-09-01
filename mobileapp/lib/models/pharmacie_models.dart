// lib/models/pharmacie_models.dart
//
// Modèles du composant "annuaire — pharmacie" côté client Flutter, en
// miroir des modèles Prisma : Pharmacie, PlanningGarde, GardePharmacie,
// ainsi que la réponse de création du compte agent (voir
// pharmacie.controller.js, creerPharmacie).
//
// Chaque modèle expose :
//   - un constructeur `fromJson` tolérant (accepte les objets imbriqués
//     renvoyés par le backend via `include`, ex: Pharmacie.pays /
//     Pharmacie.ville, GardePharmacie.pharmacie)
//   - une méthode `toJson` pour la relecture / le cache local
//   - `toCreatePayload` / `toUpdatePayload` pour les payloads d'écriture
//   - `copyWith` pour les mises à jour immuables côté état (controllers)
//
// Dépend de referentiel_models.dart pour Pays et Ville.

import 'referentiel_models.dart';

/// Aide générique pour lire une valeur potentiellement absente/nulle
/// sans planter la désérialisation à cause d'un seul champ manquant.
T? _lire<T>(Map<String, dynamic> json, String cle) {
  final valeur = json[cle];
  if (valeur is T) return valeur;
  return null;
}

DateTime? _lireDate(Map<String, dynamic> json, String cle) {
  final valeur = json[cle];
  if (valeur is String && valeur.isNotEmpty) return DateTime.tryParse(valeur);
  return null;
}

/// ─────────────────────────────────────────────────────────────────
/// StatutVerificationPharmacie
/// ─────────────────────────────────────────────────────────────────
/// Miroir de l'enum Prisma `StatutVerificationPharmacie`.
/// Circuit de modération : une fiche créée/modifiée par un utilisateur
/// non admin/superadmin repasse systématiquement en `enCours` côté
/// backend, quelle que soit la valeur envoyée (voir creerPharmacie /
/// modifierPharmacie).
enum StatutVerificationPharmacie {
  nonPublie,
  enCours,
  publie;

  static StatutVerificationPharmacie fromApi(String? valeur) {
    switch (valeur) {
      case 'non_publie':
        return StatutVerificationPharmacie.nonPublie;
      case 'publie':
        return StatutVerificationPharmacie.publie;
      case 'en_cours':
      default:
        return StatutVerificationPharmacie.enCours;
    }
  }

  String toApi() {
    switch (this) {
      case StatutVerificationPharmacie.nonPublie:
        return 'non_publie';
      case StatutVerificationPharmacie.enCours:
        return 'en_cours';
      case StatutVerificationPharmacie.publie:
        return 'publie';
    }
  }
}

/// ─────────────────────────────────────────────────────────────────
/// StatutPlanningGarde
/// ─────────────────────────────────────────────────────────────────
/// Miroir de l'enum Prisma `StatutPlanningGarde`.
enum StatutPlanningGarde {
  brouillon,
  publie,
  expire,
  annule;

  static StatutPlanningGarde fromApi(String? valeur) {
    return StatutPlanningGarde.values.firstWhere(
          (e) => e.name == valeur,
      orElse: () => StatutPlanningGarde.brouillon,
    );
  }

  String toApi() => name;
}

/// ─────────────────────────────────────────────────────────────────
/// Geolocalisation
/// ─────────────────────────────────────────────────────────────────
/// Miroir du point `geography(Point, 4326)` non supporté nativement par
/// Prisma Client : le backend le lit/écrit via SQL brut et le renvoie
/// comme `{ latitude, longitude }` sur la fiche pharmacie enrichie (voir
/// enrichirPharmacie / avecGeolocalisation). `null` tant qu'aucun point
/// n'a été défini.
class Geolocalisation {
  final double latitude;
  final double longitude;

  const Geolocalisation({
    required this.latitude,
    required this.longitude,
  });

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
}

/// ─────────────────────────────────────────────────────────────────
/// Pharmacie
/// ─────────────────────────────────────────────────────────────────
/// `pays` et `ville` sont nullables : présents quand le backend les
/// inclut (`include: { pays: true, ville: true }`, systématique sur
/// listerPharmacies/obtenirPharmacie/creerPharmacie/modifierPharmacie).
///
/// Les 3 pièces justificatives (`image_nom`, `piece_identite_nom`,
/// `document_agrement_nom`) sont les public_id Cloudinary bruts ; les
/// champs `*_url` correspondants sont reconstruits côté backend
/// (avecUrlsFichiers) et ne sont jamais envoyés en écriture.
class Pharmacie {
  final String pharmacieId;
  final String nom;
  final String paysId;
  final String villeId;
  final Geolocalisation? geolocalisation;
  final String telephone;
  final StatutVerificationPharmacie statutVerification;
  final String numeroOrdreTitulaire;
  final String imageNom;
  final String pieceIdentiteNom;
  final String documentAgrementNom;
  final String? imageUrl;
  final String? pieceIdentiteUrl;
  final String? documentAgrementUrl;
  final Pays? pays;
  final Ville? ville;

  const Pharmacie({
    required this.pharmacieId,
    required this.nom,
    required this.paysId,
    required this.villeId,
    this.geolocalisation,
    required this.telephone,
    required this.statutVerification,
    required this.numeroOrdreTitulaire,
    required this.imageNom,
    required this.pieceIdentiteNom,
    required this.documentAgrementNom,
    this.imageUrl,
    this.pieceIdentiteUrl,
    this.documentAgrementUrl,
    this.pays,
    this.ville,
  });

  factory Pharmacie.fromJson(Map<String, dynamic> json) {
    return Pharmacie(
      pharmacieId: json['pharmacie_id'] as String,
      nom: json['nom'] as String,
      paysId: json['pays_id'] as String,
      villeId: json['ville_id'] as String,
      geolocalisation: json['geolocalisation'] is Map<String, dynamic>
          ? Geolocalisation.fromJson(
          json['geolocalisation'] as Map<String, dynamic>)
          : null,
      telephone: json['telephone'] as String,
      statutVerification:
      StatutVerificationPharmacie.fromApi(json['statut_verification'] as String?),
      numeroOrdreTitulaire: json['numero_ordre_titulaire'] as String,
      imageNom: json['image_nom'] as String,
      pieceIdentiteNom: json['piece_identite_nom'] as String,
      documentAgrementNom: json['document_agrement_nom'] as String,
      imageUrl: _lire<String>(json, 'image_url'),
      pieceIdentiteUrl: _lire<String>(json, 'piece_identite_url'),
      documentAgrementUrl: _lire<String>(json, 'document_agrement_url'),
      pays: json['pays'] is Map<String, dynamic>
          ? Pays.fromJson(json['pays'] as Map<String, dynamic>)
          : null,
      ville: json['ville'] is Map<String, dynamic>
          ? Ville.fromJson(json['ville'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'pharmacie_id': pharmacieId,
    'nom': nom,
    'pays_id': paysId,
    'ville_id': villeId,
    if (geolocalisation != null) 'geolocalisation': geolocalisation!.toJson(),
    'telephone': telephone,
    'statut_verification': statutVerification.toApi(),
    'numero_ordre_titulaire': numeroOrdreTitulaire,
    'image_nom': imageNom,
    'piece_identite_nom': pieceIdentiteNom,
    'document_agrement_nom': documentAgrementNom,
    if (imageUrl != null) 'image_url': imageUrl,
    if (pieceIdentiteUrl != null) 'piece_identite_url': pieceIdentiteUrl,
    if (documentAgrementUrl != null) 'document_agrement_url': documentAgrementUrl,
    if (pays != null) 'pays': pays!.toJson(),
    if (ville != null) 'ville': ville!.toJson(),
  };

  /// Champs texte pour un POST multipart/form-data (voir creerPharmacie).
  /// Les 3 fichiers (image_pharmacie, piece_identite, document_agrement)
  /// et les champs de l'agent (fonction, agent_nom, agent_prenom,
  /// agent_email, agent_telephone) sont ajoutés séparément par l'appelant
  /// au MultipartRequest, tout comme latitude/longitude si fournies.
  Map<String, String> toCreatePayload() => {
    'nom': nom,
    'pays_id': paysId,
    'ville_id': villeId,
    'telephone': telephone,
    'statut_verification': statutVerification.toApi(),
    'numero_ordre_titulaire': numeroOrdreTitulaire,
  };

  /// Champs texte pour un PUT multipart/form-data (voir modifierPharmacie).
  /// Tous les champs sont optionnels côté backend : seuls ceux fournis
  /// sont appliqués. Les 3 fichiers restent optionnels et gérés à part
  /// par l'appelant.
  Map<String, String> toUpdatePayload({
    String? nom,
    String? paysId,
    String? villeId,
    String? telephone,
    StatutVerificationPharmacie? statutVerification,
    String? numeroOrdreTitulaire,
  }) {
    final payload = <String, String>{};
    if (nom != null) payload['nom'] = nom;
    if (paysId != null) payload['pays_id'] = paysId;
    if (villeId != null) payload['ville_id'] = villeId;
    if (telephone != null) payload['telephone'] = telephone;
    if (statutVerification != null) {
      payload['statut_verification'] = statutVerification.toApi();
    }
    if (numeroOrdreTitulaire != null) {
      payload['numero_ordre_titulaire'] = numeroOrdreTitulaire;
    }
    return payload;
  }

  Pharmacie copyWith({
    String? pharmacieId,
    String? nom,
    String? paysId,
    String? villeId,
    Geolocalisation? geolocalisation,
    String? telephone,
    StatutVerificationPharmacie? statutVerification,
    String? numeroOrdreTitulaire,
    String? imageNom,
    String? pieceIdentiteNom,
    String? documentAgrementNom,
    String? imageUrl,
    String? pieceIdentiteUrl,
    String? documentAgrementUrl,
    Pays? pays,
    Ville? ville,
  }) {
    return Pharmacie(
      pharmacieId: pharmacieId ?? this.pharmacieId,
      nom: nom ?? this.nom,
      paysId: paysId ?? this.paysId,
      villeId: villeId ?? this.villeId,
      geolocalisation: geolocalisation ?? this.geolocalisation,
      telephone: telephone ?? this.telephone,
      statutVerification: statutVerification ?? this.statutVerification,
      numeroOrdreTitulaire: numeroOrdreTitulaire ?? this.numeroOrdreTitulaire,
      imageNom: imageNom ?? this.imageNom,
      pieceIdentiteNom: pieceIdentiteNom ?? this.pieceIdentiteNom,
      documentAgrementNom: documentAgrementNom ?? this.documentAgrementNom,
      imageUrl: imageUrl ?? this.imageUrl,
      pieceIdentiteUrl: pieceIdentiteUrl ?? this.pieceIdentiteUrl,
      documentAgrementUrl: documentAgrementUrl ?? this.documentAgrementUrl,
      pays: pays ?? this.pays,
      ville: ville ?? this.ville,
    );
  }

  @override
  String toString() => 'Pharmacie($pharmacieId, $nom)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is Pharmacie && other.pharmacieId == pharmacieId);

  @override
  int get hashCode => pharmacieId.hashCode;
}

/// ─────────────────────────────────────────────────────────────────
/// UtilisateurAgentResume
/// ─────────────────────────────────────────────────────────────────
/// Identité minimale du compte agent renvoyée par creerPharmacie
/// (jamais la fiche Utilisateur complète — pas de rôle, pas de statut).
class UtilisateurAgentResume {
  final String utilisateurId;
  final String nom;
  final String prenom;
  final String email;

  const UtilisateurAgentResume({
    required this.utilisateurId,
    required this.nom,
    required this.prenom,
    required this.email,
  });

  factory UtilisateurAgentResume.fromJson(Map<String, dynamic> json) {
    return UtilisateurAgentResume(
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
  String toString() => 'UtilisateurAgentResume($utilisateurId, $email)';
}

/// ─────────────────────────────────────────────────────────────────
/// AgentPharmacieCree
/// ─────────────────────────────────────────────────────────────────
/// Miroir du bloc `agent` renvoyé UNE SEULE FOIS par POST
/// /api/pharmacies (voir creerPharmacie, reponseAgent) : le compte
/// utilisateur de l'agent, la fiche agent_pharmacie qui le rattache, et
/// le mot de passe temporaire EN CLAIR à communiquer à l'agent — jamais
/// stocké ni renvoyé ailleurs. `motDePasseTemporaire` est nullable ici
/// car ce modèle est réutilisé pour relire une réponse déjà persistée
/// côté client (auquel cas ce champ ne doit plus exister).
class AgentPharmacieCree {
  final String agentId;
  final String fonction;
  final UtilisateurAgentResume utilisateur;
  final String? motDePasseTemporaire;

  const AgentPharmacieCree({
    required this.agentId,
    required this.fonction,
    required this.utilisateur,
    this.motDePasseTemporaire,
  });

  factory AgentPharmacieCree.fromJson(Map<String, dynamic> json) {
    return AgentPharmacieCree(
      agentId: json['agent_id'] as String,
      fonction: json['fonction'] as String,
      utilisateur: UtilisateurAgentResume.fromJson(
          json['utilisateur'] as Map<String, dynamic>),
      motDePasseTemporaire: _lire<String>(json, 'mot_de_passe_temporaire'),
    );
  }

  Map<String, dynamic> toJson() => {
    'agent_id': agentId,
    'fonction': fonction,
    'utilisateur': utilisateur.toJson(),
    if (motDePasseTemporaire != null)
      'mot_de_passe_temporaire': motDePasseTemporaire,
  };

  @override
  String toString() => 'AgentPharmacieCree($agentId, ${utilisateur.email})';
}

/// ─────────────────────────────────────────────────────────────────
/// PlanningGarde
/// ─────────────────────────────────────────────────────────────────
/// Calendrier de garde d'un pays. `gardes` n'est peuplé que par
/// `obtenirPlanningGarde` (détail d'un planning, `include: { gardes: true }`).
/// Lecture publique ; écriture réservée à admin/superadmin.
class PlanningGarde {
  final String planningGardeId;
  final String paysId;
  final StatutPlanningGarde statut;
  final DateTime periodeDebut;
  final DateTime periodeFin;
  final List<GardePharmacie>? gardes;

  const PlanningGarde({
    required this.planningGardeId,
    required this.paysId,
    required this.statut,
    required this.periodeDebut,
    required this.periodeFin,
    this.gardes,
  });

  factory PlanningGarde.fromJson(Map<String, dynamic> json) {
    return PlanningGarde(
      planningGardeId: json['planning_garde_id'] as String,
      paysId: json['pays_id'] as String,
      statut: StatutPlanningGarde.fromApi(json['statut'] as String?),
      periodeDebut: DateTime.parse(json['periode_debut'] as String),
      periodeFin: DateTime.parse(json['periode_fin'] as String),
      gardes: json['gardes'] is List
          ? (json['gardes'] as List)
          .whereType<Map<String, dynamic>>()
          .map(GardePharmacie.fromJson)
          .toList()
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'planning_garde_id': planningGardeId,
    'pays_id': paysId,
    'statut': statut.toApi(),
    'periode_debut': periodeDebut.toIso8601String(),
    'periode_fin': periodeFin.toIso8601String(),
    if (gardes != null) 'gardes': gardes!.map((g) => g.toJson()).toList(),
  };

  /// Payload pour POST /api/plannings-garde (admin/superadmin).
  Map<String, dynamic> toCreatePayload() => {
    'pays_id': paysId,
    'statut': statut.toApi(),
    'periode_debut': periodeDebut.toIso8601String(),
    'periode_fin': periodeFin.toIso8601String(),
  };

  PlanningGarde copyWith({
    String? planningGardeId,
    String? paysId,
    StatutPlanningGarde? statut,
    DateTime? periodeDebut,
    DateTime? periodeFin,
    List<GardePharmacie>? gardes,
  }) {
    return PlanningGarde(
      planningGardeId: planningGardeId ?? this.planningGardeId,
      paysId: paysId ?? this.paysId,
      statut: statut ?? this.statut,
      periodeDebut: periodeDebut ?? this.periodeDebut,
      periodeFin: periodeFin ?? this.periodeFin,
      gardes: gardes ?? this.gardes,
    );
  }

  @override
  String toString() => 'PlanningGarde($planningGardeId, ${statut.name})';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is PlanningGarde && other.planningGardeId == planningGardeId);

  @override
  int get hashCode => planningGardeId.hashCode;
}

/// ─────────────────────────────────────────────────────────────────
/// GardePharmacie
/// ─────────────────────────────────────────────────────────────────
/// Affectation d'une pharmacie précise à une plage horaire d'un
/// planning de garde, dans une ville donnée. `pharmacie` est nullable :
/// présent quand le backend l'inclut (`include: { pharmacie: true }`,
/// systématique sur listerGardesPharmacie/obtenirGardePharmacie/
/// creerGardePharmacie/modifierGardePharmacie). `ville` n'est pas
/// incluse par le backend actuellement, mais reste tolérée ici si un
/// futur `include` l'ajoute.
/// Lecture publique ; écriture réservée à admin/superadmin.
class GardePharmacie {
  final String gardeId;
  final String planningGardeId;
  final String pharmacieId;
  final String villeId;
  final DateTime dateDebut;
  final DateTime dateFin;
  final Pharmacie? pharmacie;
  final Ville? ville;

  const GardePharmacie({
    required this.gardeId,
    required this.planningGardeId,
    required this.pharmacieId,
    required this.villeId,
    required this.dateDebut,
    required this.dateFin,
    this.pharmacie,
    this.ville,
  });

  factory GardePharmacie.fromJson(Map<String, dynamic> json) {
    return GardePharmacie(
      gardeId: json['garde_id'] as String,
      planningGardeId: json['planning_garde_id'] as String,
      pharmacieId: json['pharmacie_id'] as String,
      villeId: json['ville_id'] as String,
      dateDebut: DateTime.parse(json['date_debut'] as String),
      dateFin: DateTime.parse(json['date_fin'] as String),
      pharmacie: json['pharmacie'] is Map<String, dynamic>
          ? Pharmacie.fromJson(json['pharmacie'] as Map<String, dynamic>)
          : null,
      ville: json['ville'] is Map<String, dynamic>
          ? Ville.fromJson(json['ville'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'garde_id': gardeId,
    'planning_garde_id': planningGardeId,
    'pharmacie_id': pharmacieId,
    'ville_id': villeId,
    'date_debut': dateDebut.toIso8601String(),
    'date_fin': dateFin.toIso8601String(),
    if (pharmacie != null) 'pharmacie': pharmacie!.toJson(),
    if (ville != null) 'ville': ville!.toJson(),
  };

  /// Payload pour POST /api/gardes-pharmacie (admin/superadmin).
  Map<String, dynamic> toCreatePayload() => {
    'planning_garde_id': planningGardeId,
    'pharmacie_id': pharmacieId,
    'ville_id': villeId,
    'date_debut': dateDebut.toIso8601String(),
    'date_fin': dateFin.toIso8601String(),
  };

  GardePharmacie copyWith({
    String? gardeId,
    String? planningGardeId,
    String? pharmacieId,
    String? villeId,
    DateTime? dateDebut,
    DateTime? dateFin,
    Pharmacie? pharmacie,
    Ville? ville,
  }) {
    return GardePharmacie(
      gardeId: gardeId ?? this.gardeId,
      planningGardeId: planningGardeId ?? this.planningGardeId,
      pharmacieId: pharmacieId ?? this.pharmacieId,
      villeId: villeId ?? this.villeId,
      dateDebut: dateDebut ?? this.dateDebut,
      dateFin: dateFin ?? this.dateFin,
      pharmacie: pharmacie ?? this.pharmacie,
      ville: ville ?? this.ville,
    );
  }

  @override
  String toString() => 'GardePharmacie($gardeId, $pharmacieId)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is GardePharmacie && other.gardeId == gardeId);

  @override
  int get hashCode => gardeId.hashCode;
}