// lib/models/referentiel_models.dart
//
// Modèles du composant "référentiels" côté client Flutter, en miroir
// des modèles Prisma : Langue, Devise, Pays, Ville, Role.
//
// Chaque modèle expose :
//   - un constructeur `fromJson` tolérant (accepte les objets imbriqués
//     renvoyés par le backend via `include`, ex: Pays.devise / Pays.langue)
//   - une méthode `toJson` pour les payloads d'écriture (POST/PUT)
//   - `copyWith` pour les mises à jour immuables côté état (controllers)

/// Statuts d'activation d'un pays dans la plateforme.
/// Miroir de l'enum Prisma `StatutActivationPays`.
enum StatutActivationPays {
  pilote,
  actif,
  inactif;

  static StatutActivationPays fromApi(String? valeur) {
    return StatutActivationPays.values.firstWhere(
          (e) => e.name == valeur,
      orElse: () => StatutActivationPays.inactif,
    );
  }

  String toApi() => name;
}

/// Aide générique pour lire une valeur potentiellement absente/nulle
/// sans planter la désérialisation d'une liste entière à cause d'un
/// seul champ manquant.
T? _lire<T>(Map<String, dynamic> json, String cle) {
  final valeur = json[cle];
  if (valeur is T) return valeur;
  return null;
}

/// ─────────────────────────────────────────────────────────────────
/// Langue
/// ─────────────────────────────────────────────────────────────────
class Langue {
  final String langueId;
  final String nom;

  const Langue({
    required this.langueId,
    required this.nom,
  });

  factory Langue.fromJson(Map<String, dynamic> json) {
    return Langue(
      langueId: json['langue_id'] as String,
      nom: json['nom'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
    'langue_id': langueId,
    'nom': nom,
  };

  /// Payload minimal pour une création/modification (POST/PUT).
  Map<String, dynamic> toCreatePayload() => {'nom': nom};

  Langue copyWith({String? langueId, String? nom}) {
    return Langue(
      langueId: langueId ?? this.langueId,
      nom: nom ?? this.nom,
    );
  }

  @override
  String toString() => 'Langue($langueId, $nom)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is Langue && other.langueId == langueId);

  @override
  int get hashCode => langueId.hashCode;
}

/// ─────────────────────────────────────────────────────────────────
/// Devise
/// ─────────────────────────────────────────────────────────────────
class Devise {
  final String deviseId;
  final String libelle;

  const Devise({
    required this.deviseId,
    required this.libelle,
  });

  factory Devise.fromJson(Map<String, dynamic> json) {
    return Devise(
      deviseId: json['devise_id'] as String,
      libelle: json['libelle'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
    'devise_id': deviseId,
    'libelle': libelle,
  };

  Map<String, dynamic> toCreatePayload() => {'libelle': libelle};

  Devise copyWith({String? deviseId, String? libelle}) {
    return Devise(
      deviseId: deviseId ?? this.deviseId,
      libelle: libelle ?? this.libelle,
    );
  }

  @override
  String toString() => 'Devise($deviseId, $libelle)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is Devise && other.deviseId == deviseId);

  @override
  int get hashCode => deviseId.hashCode;
}

/// ─────────────────────────────────────────────────────────────────
/// Pays
/// ─────────────────────────────────────────────────────────────────
/// `devise` et `langue` sont nullables : présents quand le backend les
/// inclut (`include: { devise: true, langue: true }`, systématique sur
/// listerPays/obtenirPays), mais le modèle reste utilisable même sans.
/// `villes` n'est peuplé que par `obtenirPays` (détail d'un pays).
class Pays {
  final String paysId;
  final String codeIso2;
  final String nom;
  final String deviseId;
  final String langueId;
  final StatutActivationPays statutActivation;
  final Devise? devise;
  final Langue? langue;
  final List<Ville>? villes;

  const Pays({
    required this.paysId,
    required this.codeIso2,
    required this.nom,
    required this.deviseId,
    required this.langueId,
    required this.statutActivation,
    this.devise,
    this.langue,
    this.villes,
  });

  factory Pays.fromJson(Map<String, dynamic> json) {
    return Pays(
      paysId: json['pays_id'] as String,
      codeIso2: json['code_iso2'] as String,
      nom: json['nom'] as String,
      deviseId: json['devise_id'] as String,
      langueId: json['langue_id'] as String,
      statutActivation:
      StatutActivationPays.fromApi(json['statut_activation'] as String?),
      devise: json['devise'] is Map<String, dynamic>
          ? Devise.fromJson(json['devise'] as Map<String, dynamic>)
          : null,
      langue: json['langue'] is Map<String, dynamic>
          ? Langue.fromJson(json['langue'] as Map<String, dynamic>)
          : null,
      villes: json['villes'] is List
          ? (json['villes'] as List)
          .whereType<Map<String, dynamic>>()
          .map(Ville.fromJson)
          .toList()
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'pays_id': paysId,
    'code_iso2': codeIso2,
    'nom': nom,
    'devise_id': deviseId,
    'langue_id': langueId,
    'statut_activation': statutActivation.toApi(),
    if (devise != null) 'devise': devise!.toJson(),
    if (langue != null) 'langue': langue!.toJson(),
    if (villes != null) 'villes': villes!.map((v) => v.toJson()).toList(),
  };

  Map<String, dynamic> toCreatePayload() => {
    'code_iso2': codeIso2,
    'nom': nom,
    'devise_id': deviseId,
    'langue_id': langueId,
    'statut_activation': statutActivation.toApi(),
  };

  Pays copyWith({
    String? paysId,
    String? codeIso2,
    String? nom,
    String? deviseId,
    String? langueId,
    StatutActivationPays? statutActivation,
    Devise? devise,
    Langue? langue,
    List<Ville>? villes,
  }) {
    return Pays(
      paysId: paysId ?? this.paysId,
      codeIso2: codeIso2 ?? this.codeIso2,
      nom: nom ?? this.nom,
      deviseId: deviseId ?? this.deviseId,
      langueId: langueId ?? this.langueId,
      statutActivation: statutActivation ?? this.statutActivation,
      devise: devise ?? this.devise,
      langue: langue ?? this.langue,
      villes: villes ?? this.villes,
    );
  }

  @override
  String toString() => 'Pays($paysId, $codeIso2, $nom)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is Pays && other.paysId == paysId);

  @override
  int get hashCode => paysId.hashCode;
}

/// ─────────────────────────────────────────────────────────────────
/// Ville
/// ─────────────────────────────────────────────────────────────────
/// `pays` est nullable : présent quand le backend l'inclut
/// (`include: { pays: true }`, systématique sur listerVilles/obtenirVille).
class Ville {
  final String villeId;
  final String paysId;
  final String nom;
  final String? codePostal;
  final Pays? pays;

  const Ville({
    required this.villeId,
    required this.paysId,
    required this.nom,
    this.codePostal,
    this.pays,
  });

  factory Ville.fromJson(Map<String, dynamic> json) {
    return Ville(
      villeId: json['ville_id'] as String,
      paysId: json['pays_id'] as String,
      nom: json['nom'] as String,
      codePostal: _lire<String>(json, 'code_postal'),
      pays: json['pays'] is Map<String, dynamic>
          ? Pays.fromJson(json['pays'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'ville_id': villeId,
    'pays_id': paysId,
    'nom': nom,
    'code_postal': codePostal,
    if (pays != null) 'pays': pays!.toJson(),
  };

  Map<String, dynamic> toCreatePayload() => {
    'pays_id': paysId,
    'nom': nom,
    if (codePostal != null) 'code_postal': codePostal,
  };

  Ville copyWith({
    String? villeId,
    String? paysId,
    String? nom,
    String? codePostal,
    Pays? pays,
  }) {
    return Ville(
      villeId: villeId ?? this.villeId,
      paysId: paysId ?? this.paysId,
      nom: nom ?? this.nom,
      codePostal: codePostal ?? this.codePostal,
      pays: pays ?? this.pays,
    );
  }

  @override
  String toString() => 'Ville($villeId, $nom)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is Ville && other.villeId == villeId);

  @override
  int get hashCode => villeId.hashCode;
}

/// ─────────────────────────────────────────────────────────────────
/// Role (IAM) — lecture réservée aux utilisateurs authentifiés.
/// ─────────────────────────────────────────────────────────────────
class Role {
  final String roleId;
  final String libelle;
  final String? description;

  const Role({
    required this.roleId,
    required this.libelle,
    this.description,
  });

  factory Role.fromJson(Map<String, dynamic> json) {
    return Role(
      roleId: json['role_id'] as String,
      libelle: json['libelle'] as String,
      description: _lire<String>(json, 'description'),
    );
  }

  Map<String, dynamic> toJson() => {
    'role_id': roleId,
    'libelle': libelle,
    'description': description,
  };

  Map<String, dynamic> toCreatePayload() => {'libelle': libelle};

  Role copyWith({String? roleId, String? libelle, String? description}) {
    return Role(
      roleId: roleId ?? this.roleId,
      libelle: libelle ?? this.libelle,
      description: description ?? this.description,
    );
  }

  @override
  String toString() => 'Role($roleId, $libelle)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is Role && other.roleId == roleId);

  @override
  int get hashCode => roleId.hashCode;
}