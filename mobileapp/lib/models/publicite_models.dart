// lib/models/publicite_models.dart
//
// Modèles du module autonome "Présence, publicité & boost commercial"
// (diagramme 09_presence_publicite_boost) côté client Flutter, en
// miroir des modèles Prisma : EmplacementPublicitaire,
// ForfaitPublicitaire, LigneForfaitPublicitaire, Publicite.
//
// Rappel métier (voir publicite.controller.js) : ce module est
// AUTONOME — une Publicite ne référence jamais pharmacie,
// structure_sante ni aucune autre fiche annuaire, seulement un
// utilisateur (auteur) et un pays (diffusion).
//
// Chaque modèle expose :
//   - un constructeur `fromJson` tolérant (accepte les objets/tableaux
//     imbriqués renvoyés par le backend via `include`, ex:
//     ForfaitPublicitaire.lignes)
//   - une méthode `toJson` pour la relecture d'état local
//   - `toCreatePayload` pour les payloads d'écriture (POST/PUT) —
//     Publicite n'en expose pas : sa création/modification passe par
//     multipart/form-data (champ fichier "visuel"), à construire côté
//     controller/service, pas ici
//   - `copyWith` pour les mises à jour immuables côté état (controllers)

/// Statuts de modération d'une publicité.
/// Miroir de l'enum Prisma `StatutModerationPublicite`.
///
/// Même patron que `StatutModerationAvis` : une publicité déposée est
/// toujours créée "en_attente", quel que soit le rôle de l'auteur, et
/// n'est diffusée publiquement qu'après validation par un
/// admin/superadmin.
enum StatutModerationPublicite {
  enAttente,
  validee,
  rejetee;

  static StatutModerationPublicite fromApi(String? valeur) {
    switch (valeur) {
      case 'validee':
        return StatutModerationPublicite.validee;
      case 'rejetee':
        return StatutModerationPublicite.rejetee;
      case 'en_attente':
      default:
        return StatutModerationPublicite.enAttente;
    }
  }

  String toApi() {
    switch (this) {
      case StatutModerationPublicite.validee:
        return 'validee';
      case StatutModerationPublicite.rejetee:
        return 'rejetee';
      case StatutModerationPublicite.enAttente:
        return 'en_attente';
    }
  }
}

/// Aide générique pour lire une valeur potentiellement absente/nulle
/// sans planter la désérialisation d'une liste entière à cause d'un
/// seul champ manquant.
T? _lire<T>(Map<String, dynamic> json, String cle) {
  final valeur = json[cle];
  if (valeur is T) return valeur;
  return null;
}

/// Lit une date/heure ISO potentiellement absente sans planter la
/// désérialisation (ex: `date_debut` / `date_fin`, toujours présentes
/// côté API mais on reste tolérant comme le reste du fichier).
DateTime? _lireDate(Map<String, dynamic> json, String cle) {
  final valeur = json[cle];
  if (valeur is String) return DateTime.tryParse(valeur);
  return null;
}

/// ─────────────────────────────────────────────────────────────────
/// EmplacementPublicitaire
/// ─────────────────────────────────────────────────────────────────
/// Référentiel transverse pur (même patron que Langue/Devise/Pays/Ville
/// dans referentiel_models.dart) : les zones publicitaires possibles
/// (accueil, résultats de recherche, fiche pharmacie...) sont des
/// LIGNES de cette table, pas des valeurs figées côté client.
class EmplacementPublicitaire {
  final String emplacementPublicitaireId;
  final String code;
  final String libelle;
  final String? description;

  const EmplacementPublicitaire({
    required this.emplacementPublicitaireId,
    required this.code,
    required this.libelle,
    this.description,
  });

  factory EmplacementPublicitaire.fromJson(Map<String, dynamic> json) {
    return EmplacementPublicitaire(
      emplacementPublicitaireId: json['emplacement_publicitaire_id'] as String,
      code: json['code'] as String,
      libelle: json['libelle'] as String,
      description: _lire<String>(json, 'description'),
    );
  }

  Map<String, dynamic> toJson() => {
    'emplacement_publicitaire_id': emplacementPublicitaireId,
    'code': code,
    'libelle': libelle,
    'description': description,
  };

  /// Payload minimal pour une création/modification (POST/PUT).
  Map<String, dynamic> toCreatePayload() => {
    'code': code,
    'libelle': libelle,
    if (description != null) 'description': description,
  };

  EmplacementPublicitaire copyWith({
    String? emplacementPublicitaireId,
    String? code,
    String? libelle,
    String? description,
  }) {
    return EmplacementPublicitaire(
      emplacementPublicitaireId:
      emplacementPublicitaireId ?? this.emplacementPublicitaireId,
      code: code ?? this.code,
      libelle: libelle ?? this.libelle,
      description: description ?? this.description,
    );
  }

  @override
  String toString() => 'EmplacementPublicitaire($emplacementPublicitaireId, $code, $libelle)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is EmplacementPublicitaire &&
              other.emplacementPublicitaireId == emplacementPublicitaireId);

  @override
  int get hashCode => emplacementPublicitaireId.hashCode;
}

/// ─────────────────────────────────────────────────────────────────
/// LigneForfaitPublicitaire
/// ─────────────────────────────────────────────────────────────────
/// Avantage inclus dans un forfait publicitaire, contenu éditorial
/// affiché tel quel côté front (même patron que
/// LigneAbonnementPharmacie / LigneAbonnementMedecin).
class LigneForfaitPublicitaire {
  final String ligneId;
  final String forfaitPublicitaireId;
  final String libelleAvantage;
  final String? description;
  final int ordreAffichage;

  const LigneForfaitPublicitaire({
    required this.ligneId,
    required this.forfaitPublicitaireId,
    required this.libelleAvantage,
    this.description,
    required this.ordreAffichage,
  });

  factory LigneForfaitPublicitaire.fromJson(Map<String, dynamic> json) {
    return LigneForfaitPublicitaire(
      ligneId: json['ligne_id'] as String,
      forfaitPublicitaireId: json['forfait_publicitaire_id'] as String,
      libelleAvantage: json['libelle_avantage'] as String,
      description: _lire<String>(json, 'description'),
      ordreAffichage: (json['ordre_affichage'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
    'ligne_id': ligneId,
    'forfait_publicitaire_id': forfaitPublicitaireId,
    'libelle_avantage': libelleAvantage,
    'description': description,
    'ordre_affichage': ordreAffichage,
  };

  Map<String, dynamic> toCreatePayload() => {
    'libelle_avantage': libelleAvantage,
    if (description != null) 'description': description,
    'ordre_affichage': ordreAffichage,
  };

  LigneForfaitPublicitaire copyWith({
    String? ligneId,
    String? forfaitPublicitaireId,
    String? libelleAvantage,
    String? description,
    int? ordreAffichage,
  }) {
    return LigneForfaitPublicitaire(
      ligneId: ligneId ?? this.ligneId,
      forfaitPublicitaireId: forfaitPublicitaireId ?? this.forfaitPublicitaireId,
      libelleAvantage: libelleAvantage ?? this.libelleAvantage,
      description: description ?? this.description,
      ordreAffichage: ordreAffichage ?? this.ordreAffichage,
    );
  }

  @override
  String toString() => 'LigneForfaitPublicitaire($ligneId, $libelleAvantage)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is LigneForfaitPublicitaire && other.ligneId == ligneId);

  @override
  int get hashCode => ligneId.hashCode;
}

/// ─────────────────────────────────────────────────────────────────
/// ForfaitPublicitaire
/// ─────────────────────────────────────────────────────────────────
/// `prix` est un Decimal côté Prisma, sérialisé en chaîne par le
/// backend : conservé en `String` ici (et non parsé en `double`) pour
/// ne perdre aucune précision monétaire, à l'image de la donnée telle
/// qu'elle transite sur le réseau.
///
/// `lignes` est peuplé quand le backend l'inclut (`include: { lignes }`,
/// systématique sur listerForfaitsPublicitaires/obtenirForfaitPublicitaire
/// — voir publicite.controller.js), mais le modèle reste utilisable
/// sans.
class ForfaitPublicitaire {
  final String forfaitPublicitaireId;
  final String emplacementPublicitaireId;
  final String libelle;
  final String prix;
  final int dureeJours;
  final List<LigneForfaitPublicitaire>? lignes;

  const ForfaitPublicitaire({
    required this.forfaitPublicitaireId,
    required this.emplacementPublicitaireId,
    required this.libelle,
    required this.prix,
    required this.dureeJours,
    this.lignes,
  });

  factory ForfaitPublicitaire.fromJson(Map<String, dynamic> json) {
    return ForfaitPublicitaire(
      forfaitPublicitaireId: json['forfait_publicitaire_id'] as String,
      emplacementPublicitaireId: json['emplacement_publicitaire_id'] as String,
      libelle: json['libelle'] as String,
      prix: json['prix'].toString(),
      dureeJours: (json['duree_jours'] as num).toInt(),
      lignes: json['lignes'] is List
          ? (json['lignes'] as List)
          .whereType<Map<String, dynamic>>()
          .map(LigneForfaitPublicitaire.fromJson)
          .toList()
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'forfait_publicitaire_id': forfaitPublicitaireId,
    'emplacement_publicitaire_id': emplacementPublicitaireId,
    'libelle': libelle,
    'prix': prix,
    'duree_jours': dureeJours,
    if (lignes != null) 'lignes': lignes!.map((l) => l.toJson()).toList(),
  };

  Map<String, dynamic> toCreatePayload() => {
    'emplacement_publicitaire_id': emplacementPublicitaireId,
    'libelle': libelle,
    'prix': prix,
    'duree_jours': dureeJours,
  };

  ForfaitPublicitaire copyWith({
    String? forfaitPublicitaireId,
    String? emplacementPublicitaireId,
    String? libelle,
    String? prix,
    int? dureeJours,
    List<LigneForfaitPublicitaire>? lignes,
  }) {
    return ForfaitPublicitaire(
      forfaitPublicitaireId: forfaitPublicitaireId ?? this.forfaitPublicitaireId,
      emplacementPublicitaireId:
      emplacementPublicitaireId ?? this.emplacementPublicitaireId,
      libelle: libelle ?? this.libelle,
      prix: prix ?? this.prix,
      dureeJours: dureeJours ?? this.dureeJours,
      lignes: lignes ?? this.lignes,
    );
  }

  @override
  String toString() => 'ForfaitPublicitaire($forfaitPublicitaireId, $libelle, $prix)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is ForfaitPublicitaire &&
              other.forfaitPublicitaireId == forfaitPublicitaireId);

  @override
  int get hashCode => forfaitPublicitaireId.hashCode;
}

/// ─────────────────────────────────────────────────────────────────
/// Publicite
/// ─────────────────────────────────────────────────────────────────
/// Encart effectivement soumis par un utilisateur pour diffusion.
///
/// Rappels métier (voir publicite.controller.js) :
///   - `statutModeration` est toujours forcé à `enAttente` côté
///     serveur à la création, quelle que soit la valeur envoyée.
///   - `visuelUrl` n'est jamais saisie librement par le client : à la
///     création/modification, le visuel est envoyé en
///     multipart/form-data (champ "visuel", hors de ce modèle) et
///     c'est le backend qui pose ici l'URL Cloudinary construite
///     (`avecUrlVisuel`), déjà prête à l'emploi pour un `<Image>`.
///   - `emplacementPublicitaireId` et `forfaitPublicitaireId` ne sont
///     plus modifiables après création (voir modifierPublicite).
class Publicite {
  final String publiciteId;
  final String forfaitPublicitaireId;
  final String emplacementPublicitaireId;
  final String utilisateurId;
  final String paysId;
  final String titre;
  final String visuelUrl;
  final DateTime dateDebut;
  final DateTime dateFin;
  final StatutModerationPublicite statutModeration;

  const Publicite({
    required this.publiciteId,
    required this.forfaitPublicitaireId,
    required this.emplacementPublicitaireId,
    required this.utilisateurId,
    required this.paysId,
    required this.titre,
    required this.visuelUrl,
    required this.dateDebut,
    required this.dateFin,
    required this.statutModeration,
  });

  factory Publicite.fromJson(Map<String, dynamic> json) {
    return Publicite(
      publiciteId: json['publicite_id'] as String,
      forfaitPublicitaireId: json['forfait_publicitaire_id'] as String,
      emplacementPublicitaireId: json['emplacement_publicitaire_id'] as String,
      utilisateurId: json['utilisateur_id'] as String,
      paysId: json['pays_id'] as String,
      titre: json['titre'] as String,
      visuelUrl: json['visuel_url'] as String,
      dateDebut: _lireDate(json, 'date_debut') ?? DateTime.now(),
      dateFin: _lireDate(json, 'date_fin') ?? DateTime.now(),
      statutModeration:
      StatutModerationPublicite.fromApi(json['statut_moderation'] as String?),
    );
  }

  Map<String, dynamic> toJson() => {
    'publicite_id': publiciteId,
    'forfait_publicitaire_id': forfaitPublicitaireId,
    'emplacement_publicitaire_id': emplacementPublicitaireId,
    'utilisateur_id': utilisateurId,
    'pays_id': paysId,
    'titre': titre,
    'visuel_url': visuelUrl,
    'date_debut': dateDebut.toIso8601String(),
    'date_fin': dateFin.toIso8601String(),
    'statut_moderation': statutModeration.toApi(),
  };

  /// Payload texte minimal pour la création (POST /api/publicites) :
  /// à assembler avec le fichier "visuel" dans le multipart/form-data
  /// côté service HTTP — ce modèle ne porte pas le fichier lui-même.
  Map<String, dynamic> toCreatePayload() => {
    'forfait_publicitaire_id': forfaitPublicitaireId,
    'emplacement_publicitaire_id': emplacementPublicitaireId,
    'pays_id': paysId,
    'titre': titre,
    'date_debut': dateDebut.toIso8601String(),
    'date_fin': dateFin.toIso8601String(),
  };

  Publicite copyWith({
    String? publiciteId,
    String? forfaitPublicitaireId,
    String? emplacementPublicitaireId,
    String? utilisateurId,
    String? paysId,
    String? titre,
    String? visuelUrl,
    DateTime? dateDebut,
    DateTime? dateFin,
    StatutModerationPublicite? statutModeration,
  }) {
    return Publicite(
      publiciteId: publiciteId ?? this.publiciteId,
      forfaitPublicitaireId: forfaitPublicitaireId ?? this.forfaitPublicitaireId,
      emplacementPublicitaireId:
      emplacementPublicitaireId ?? this.emplacementPublicitaireId,
      utilisateurId: utilisateurId ?? this.utilisateurId,
      paysId: paysId ?? this.paysId,
      titre: titre ?? this.titre,
      visuelUrl: visuelUrl ?? this.visuelUrl,
      dateDebut: dateDebut ?? this.dateDebut,
      dateFin: dateFin ?? this.dateFin,
      statutModeration: statutModeration ?? this.statutModeration,
    );
  }

  @override
  String toString() => 'Publicite($publiciteId, $titre, ${statutModeration.toApi()})';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is Publicite && other.publiciteId == publiciteId);

  @override
  int get hashCode => publiciteId.hashCode;
}