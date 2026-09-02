// lib/models/medecin_models.dart
//
// Modèles du module transverse "Gestion des médecins", partie fiche
// Annuaire (Medecin, Specialite) et sous-ressources associées, en
// miroir de src/routes/medecin.routes.js et
// src/controllers/medecin.controller.js côté backend (voir aussi
// schema.prisma, model Medecin / Specialite).
//
// ⚠️ Périmètre volontairement limité à la fiche médecin elle-même
// (création/lecture/modification/publication/suspension, vérification
// ONMC) + au référentiel Spécialités qui lui est directement lié
// (specialite_id). Les autres sous-modules du fichier de routes backend
// (Avis médecin, Abonnements médecin, Rendez-vous, Ordonnances, Agenda/
// Horaire/Disponibilité/Créneau) sont des domaines à part entière :
// à modéliser dans des fichiers dédiés (ex: avis_medecin_models.dart,
// rendez_vous_models.dart, agenda_models.dart) suivant le même patron.
//
// Chaque modèle "de lecture" (renvoyé par l'API) expose :
//   - un constructeur `fromJson` tolérant (accepte les vues "publique"
//     ou "admin" du champ utilisateur imbriqué, voir
//     selectionUtilisateurSelonRole côté backend)
//   - une méthode `toJson` (miroir complet)
//   - `copyWith` pour les mises à jour immuables côté état (controller)
//
// Chaque modèle "d'écriture" (filtres de liste, payloads de
// création/modification) expose une méthode `toQuery`/`toChamps`/
// `toJson` qui ne construit QUE les paires clé-valeur effectivement
// renseignées, pour coller à la sémantique "champ absent = ne pas
// toucher" utilisée par le backend (voir CHAMPS_MODIFIABLES_MEDECIN /
// CHAMPS_MODIFIABLES_UTILISATEUR côté contrôleur).

/// Lit une valeur potentiellement absente/nulle sans planter la
/// désérialisation à cause d'un champ manquant (vue "publique" vs
/// "admin" du même endpoint, par exemple).
T? _lire<T>(Map<String, dynamic> json, String cle) {
  final valeur = json[cle];
  if (valeur is T) return valeur;
  return null;
}

/// Lit un champ censé être une String obligatoire, sans jamais planter :
/// si la valeur est absente/`null`/d'un autre type, renvoie [repli] (par
/// défaut chaîne vide) et log un avertissement en debug pour repérer
/// facilement quel champ backend est en cause (ex: un `numero_ordre` ou
/// un `pays_exercice_id` non renseigné en base pour cette fiche).
String _lireStr(Map<String, dynamic> json, String cle, {String repli = ''}) {
  final valeur = json[cle];
  if (valeur is String) return valeur;
  // ignore: avoid_print
  print(
      '[medecin_models] Champ "$cle" attendu en String mais reçu: '
          '${valeur == null ? 'null' : '${valeur.runtimeType} ($valeur)'} '
          '— valeur de repli "$repli" utilisée.');
  return repli;
}

/// Miroir de l'enum Prisma `StatutVerificationMedecin`.
enum StatutVerificationMedecin {
  nonPublie,
  enCours,
  publie;

  static StatutVerificationMedecin fromApi(String? valeur) {
    switch (valeur) {
      case 'en_cours':
        return StatutVerificationMedecin.enCours;
      case 'publie':
        return StatutVerificationMedecin.publie;
      case 'non_publie':
      default:
        return StatutVerificationMedecin.nonPublie;
    }
  }

  String toApi() {
    switch (this) {
      case StatutVerificationMedecin.enCours:
        return 'en_cours';
      case StatutVerificationMedecin.publie:
        return 'publie';
      case StatutVerificationMedecin.nonPublie:
        return 'non_publie';
    }
  }
}

/// Miroir de l'enum Prisma `StatutCompte` (porté par `utilisateur`, pas
/// par `medecin` lui-même — exposé ici pour lire le champ
/// `statut_compte` renvoyé par GET /medecins/mon-profil).
enum StatutCompteUtilisateur {
  actif,
  suspendu;

  static StatutCompteUtilisateur fromApi(String? valeur) {
    return StatutCompteUtilisateur.values.firstWhere(
          (e) => e.name == valeur,
      orElse: () => StatutCompteUtilisateur.actif,
    );
  }

  String toApi() => name;
}

/// ─────────────────────────────────────────────────────────────────
/// Specialite (référentiel — GET/POST/PUT/DELETE /specialites)
/// ─────────────────────────────────────────────────────────────────
/// `description` n'est renvoyée que par les endpoints dédiés
/// (/specialites, /specialites/:id) : la vue imbriquée sur une fiche
/// medecin (medecin.specialite) ne sélectionne que id + nom côté
/// backend (SELECTION_SPECIALITE_PUBLIC) — `description` reste alors
/// `null`, ce qui est normal et sans danger ici.
class Specialite {
  final String specialiteId;
  final String nom;
  final String? description;

  const Specialite({
    required this.specialiteId,
    required this.nom,
    this.description,
  });

  factory Specialite.fromJson(Map<String, dynamic> json) {
    return Specialite(
      specialiteId: _lireStr(json, 'specialite_id'),
      nom: _lireStr(json, 'nom'),
      description: _lire<String>(json, 'description'),
    );
  }

  Map<String, dynamic> toJson() => {
    'specialite_id': specialiteId,
    'nom': nom,
    'description': description,
  };

  /// Payload pour POST /specialites.
  Map<String, dynamic> toCreatePayload() => {
    'nom': nom,
    if (description != null) 'description': description,
  };

  Specialite copyWith({
    String? specialiteId,
    String? nom,
    String? description,
  }) {
    return Specialite(
      specialiteId: specialiteId ?? this.specialiteId,
      nom: nom ?? this.nom,
      description: description ?? this.description,
    );
  }

  @override
  String toString() => 'Specialite($specialiteId, $nom)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is Specialite && other.specialiteId == specialiteId);

  @override
  int get hashCode => specialiteId.hashCode;
}

/// Payload pour PUT /specialites/:id.
/// Réservé à admin/superadmin côté backend. Seuls les champs fournis
/// (non `null` au constructeur) sont envoyés — miroir de la logique
/// "Object.keys(donnees).length === 0" du contrôleur, qui renvoie une
/// erreur 400 si rien n'est à mettre à jour (voir [estVide]).
class ModifierSpecialitePayload {
  final String? nom;
  final String? description;

  const ModifierSpecialitePayload({this.nom, this.description});

  bool get estVide => nom == null && description == null;

  Map<String, dynamic> toJson() => {
    if (nom != null) 'nom': nom,
    if (description != null) 'description': description,
  };
}

/// ─────────────────────────────────────────────────────────────────
/// Références légères ville/pays d'exercice.
/// ─────────────────────────────────────────────────────────────────
/// Le module médecin n'inclut que { id, nom } (SELECTION_VILLE_PUBLIC /
/// SELECTION_PAYS_PUBLIC côté backend) — pas les champs complets du
/// référentiel géographique (voir referentiel_models.dart pour la
/// fiche Pays/Ville complète, exposée par le module référentiel).
class VilleExerciceRef {
  final String villeId;
  final String nom;

  const VilleExerciceRef({required this.villeId, required this.nom});

  factory VilleExerciceRef.fromJson(Map<String, dynamic> json) {
    return VilleExerciceRef(
      villeId: _lireStr(json, 'ville_id'),
      nom: _lireStr(json, 'nom'),
    );
  }

  Map<String, dynamic> toJson() => {'ville_id': villeId, 'nom': nom};

  @override
  String toString() => 'VilleExerciceRef($villeId, $nom)';
}

class PaysExerciceRef {
  final String paysId;
  final String nom;

  const PaysExerciceRef({required this.paysId, required this.nom});

  factory PaysExerciceRef.fromJson(Map<String, dynamic> json) {
    return PaysExerciceRef(
      paysId: _lireStr(json, 'pays_id'),
      nom: _lireStr(json, 'nom'),
    );
  }

  Map<String, dynamic> toJson() => {'pays_id': paysId, 'nom': nom};

  @override
  String toString() => 'PaysExerciceRef($paysId, $nom)';
}

/// ─────────────────────────────────────────────────────────────────
/// UtilisateurMedecin — vue du compte utilisateur lié à une fiche
/// medecin, telle qu'imbriquée par l'API.
/// ─────────────────────────────────────────────────────────────────
/// Selon l'endpoint et le rôle de l'appelant, le backend renvoie l'une
/// de ces trois vues (voir selectionUtilisateurSelonRole côté
/// contrôleur) — tous les champs autres que nom/prenom sont donc
/// nullables ici :
///   - visiteur anonyme (GET /medecins, GET /medecins/:id)  : nom, prenom
///   - admin/superadmin (mêmes routes, connecté)             : + email, telephone
///   - propriétaire ou admin (PUT/PATCH .../:id)              : + email, telephone
///   - profil complet (GET /medecins/mon-profil)              : + utilisateur_id,
///     pays_id, statut_compte
class UtilisateurMedecin {
  final String? utilisateurId;
  final String nom;
  final String prenom;
  final String? email;
  final String? telephone;
  final String? paysId;
  final StatutCompteUtilisateur? statutCompte;

  const UtilisateurMedecin({
    this.utilisateurId,
    required this.nom,
    required this.prenom,
    this.email,
    this.telephone,
    this.paysId,
    this.statutCompte,
  });

  factory UtilisateurMedecin.fromJson(Map<String, dynamic> json) {
    return UtilisateurMedecin(
      utilisateurId: _lire<String>(json, 'utilisateur_id'),
      nom: _lireStr(json, 'nom'),
      prenom: _lireStr(json, 'prenom'),
      email: _lire<String>(json, 'email'),
      telephone: _lire<String>(json, 'telephone'),
      paysId: _lire<String>(json, 'pays_id'),
      statutCompte: json['statut_compte'] is String
          ? StatutCompteUtilisateur.fromApi(json['statut_compte'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    if (utilisateurId != null) 'utilisateur_id': utilisateurId,
    'nom': nom,
    'prenom': prenom,
    if (email != null) 'email': email,
    if (telephone != null) 'telephone': telephone,
    if (paysId != null) 'pays_id': paysId,
    if (statutCompte != null) 'statut_compte': statutCompte!.toApi(),
  };

  @override
  String toString() => 'UtilisateurMedecin($nom, $prenom)';
}

/// Vue du compte utilisateur renvoyée UNE SEULE FOIS par POST
/// /medecins (création) : porte le mot de passe temporaire en clair,
/// à afficher immédiatement à l'appelant et ne jamais restocker.
class UtilisateurCreeMedecin {
  final String utilisateurId;
  final String nom;
  final String prenom;
  final String email;
  final String motDePasseTemporaire;

  const UtilisateurCreeMedecin({
    required this.utilisateurId,
    required this.nom,
    required this.prenom,
    required this.email,
    required this.motDePasseTemporaire,
  });

  factory UtilisateurCreeMedecin.fromJson(Map<String, dynamic> json) {
    return UtilisateurCreeMedecin(
      utilisateurId: json['utilisateur_id'] as String,
      nom: json['nom'] as String,
      prenom: json['prenom'] as String,
      email: json['email'] as String,
      motDePasseTemporaire: json['mot_de_passe_temporaire'] as String,
    );
  }

  @override
  String toString() => 'UtilisateurCreeMedecin($email)';
}

/// ─────────────────────────────────────────────────────────────────
/// Filtres pour GET /medecins (query params).
/// ─────────────────────────────────────────────────────────────────
/// Miroir exact des query params lus par listerMedecins côté backend :
///   - [specialiteId] : filtre exact sur la FK specialite_id.
///   - [specialite]   : recherche par NOM de spécialité (relation),
///     ignoré côté backend si [specialiteId] est également fourni
///     (specialite_id prend le pas — voir le contrôleur).
///   - [villeExerciceId], [paysExerciceId] : filtres exacts sur les FK
///     d'exercice.
///   - [recherche] : recherche insensible à la casse sur nom/prenom de
///     l'utilisateur lié.
class MedecinFiltres {
  final String? specialiteId;
  final String? specialite;
  final String? villeExerciceId;
  final String? paysExerciceId;
  final String? recherche;

  const MedecinFiltres({
    this.specialiteId,
    this.specialite,
    this.villeExerciceId,
    this.paysExerciceId,
    this.recherche,
  });

  Map<String, dynamic>? toQuery() {
    final query = <String, dynamic>{
      if (specialiteId != null && specialiteId!.isNotEmpty)
        'specialite_id': specialiteId,
      if (specialite != null && specialite!.trim().isNotEmpty)
        'specialite': specialite,
      if (villeExerciceId != null && villeExerciceId!.isNotEmpty)
        'ville_exercice_id': villeExerciceId,
      if (paysExerciceId != null && paysExerciceId!.isNotEmpty)
        'pays_exercice_id': paysExerciceId,
      if (recherche != null && recherche!.trim().isNotEmpty)
        'recherche': recherche,
    };
    return query.isEmpty ? null : query;
  }

  MedecinFiltres copyWith({
    String? specialiteId,
    String? specialite,
    String? villeExerciceId,
    String? paysExerciceId,
    String? recherche,
  }) {
    return MedecinFiltres(
      specialiteId: specialiteId ?? this.specialiteId,
      specialite: specialite ?? this.specialite,
      villeExerciceId: villeExerciceId ?? this.villeExerciceId,
      paysExerciceId: paysExerciceId ?? this.paysExerciceId,
      recherche: recherche ?? this.recherche,
    );
  }
}

/// Payload pour POST /medecins (candidature médecin — route publique).
/// Tous les champs listés ici sont obligatoires côté backend (voir
/// `champsManquants` dans creerMedecin) à l'exception de [telephone].
/// Les fichiers (cni, attestation, photo?) sont fournis séparément à
/// [MedecinRepository.creerMedecin], pas dans ce payload.
class CreerMedecinPayload {
  final String nom;
  final String prenom;
  final String email;
  final String? telephone;
  final String paysId;
  final String specialiteId;
  final String numeroOrdre;
  final String paysExerciceId;
  final String villeExerciceId;
  final bool teleconsultationActivee;
  final double tarifIndicatif;
  final String biographie;

  const CreerMedecinPayload({
    required this.nom,
    required this.prenom,
    required this.email,
    this.telephone,
    required this.paysId,
    required this.specialiteId,
    required this.numeroOrdre,
    required this.paysExerciceId,
    required this.villeExerciceId,
    required this.teleconsultationActivee,
    required this.tarifIndicatif,
    required this.biographie,
  });

  /// Champs texte du multipart/form-data (hors fichiers). Les valeurs
  /// non-String (bool, double) sont converties par
  /// [ApiClient._envoyerMultipart] au moment de l'envoi.
  Map<String, dynamic> toChamps() => {
    'nom': nom,
    'prenom': prenom,
    'email': email,
    if (telephone != null && telephone!.isNotEmpty) 'telephone': telephone,
    'pays_id': paysId,
    'specialite_id': specialiteId,
    'numero_ordre': numeroOrdre,
    'pays_exercice_id': paysExerciceId,
    'ville_exercice_id': villeExerciceId,
    'teleconsultation_activee': teleconsultationActivee,
    'tarif_indicatif': tarifIndicatif,
    'biographie': biographie,
  };
}

/// Payload pour PUT /medecins/:id.
/// Ouvert au médecin propriétaire ou à admin/superadmin. Seuls les
/// champs non `null` sont envoyés (voir [toChamps]) — miroir de la
/// boucle `CHAMPS_MODIFIABLES_MEDECIN`/`CHAMPS_MODIFIABLES_UTILISATEUR`
/// côté contrôleur, qui n'écrit que les clés présentes dans le corps.
///
/// Cas particuliers :
///   - [statutVerification] n'est réellement pris en compte par le
///     backend que si l'appelant est admin/superadmin (sinon la fiche
///     repasse automatiquement à `en_cours` dès qu'un autre champ est
///     modifié) — ne le fournir que depuis un écran back-office.
///   - [linkedInUrl] : passer une chaîne vide `''` pour retirer le lien
///     existant (le backend traite `'' || null` comme `null`) ; ne pas
///     fournir le champ (laisser `null` ici) pour ne pas y toucher.
class ModifierMedecinPayload {
  final String? nom;
  final String? prenom;
  final String? telephone;
  final String? specialiteId;
  final String? numeroOrdre;
  final String? paysExerciceId;
  final String? villeExerciceId;
  final bool? teleconsultationActivee;
  final double? tarifIndicatif;
  final String? biographie;
  final String? linkedInUrl;
  final StatutVerificationMedecin? statutVerification;

  const ModifierMedecinPayload({
    this.nom,
    this.prenom,
    this.telephone,
    this.specialiteId,
    this.numeroOrdre,
    this.paysExerciceId,
    this.villeExerciceId,
    this.teleconsultationActivee,
    this.tarifIndicatif,
    this.biographie,
    this.linkedInUrl,
    this.statutVerification,
  });

  bool get estVide =>
      nom == null &&
          prenom == null &&
          telephone == null &&
          specialiteId == null &&
          numeroOrdre == null &&
          paysExerciceId == null &&
          villeExerciceId == null &&
          teleconsultationActivee == null &&
          tarifIndicatif == null &&
          biographie == null &&
          linkedInUrl == null &&
          statutVerification == null;

  Map<String, dynamic> toChamps() => {
    if (nom != null) 'nom': nom,
    if (prenom != null) 'prenom': prenom,
    if (telephone != null) 'telephone': telephone,
    if (specialiteId != null) 'specialite_id': specialiteId,
    if (numeroOrdre != null) 'numero_ordre': numeroOrdre,
    if (paysExerciceId != null) 'pays_exercice_id': paysExerciceId,
    if (villeExerciceId != null) 'ville_exercice_id': villeExerciceId,
    if (teleconsultationActivee != null)
      'teleconsultation_activee': teleconsultationActivee,
    if (tarifIndicatif != null) 'tarif_indicatif': tarifIndicatif,
    if (biographie != null) 'biographie': biographie,
    if (linkedInUrl != null) 'linkedInUrl': linkedInUrl,
    if (statutVerification != null)
      'statut_verification': statutVerification!.toApi(),
  };
}

/// ─────────────────────────────────────────────────────────────────
/// Medecin — fiche Annuaire.
/// ─────────────────────────────────────────────────────────────────
/// `utilisateur`, `specialite`, `villeExercice`, `paysExercice` sont
/// nullables en théorie (JSON minimal), mais systématiquement inclus
/// par le backend sur tous les endpoints de lecture/écriture de ce
/// module — voir les `include` de listerMedecins/obtenirMedecin/
/// modifierMedecin/publierMedecin/suspendreMedecin.
///
/// `cniUrl` / `attestationUrl` / `photoUrl` / `cvUrl` sont déjà des URLs
/// Cloudinary COMPLÈTES à ce stade (le backend applique
/// `avecUrlsFichiersMedecin` avant toute réponse contenant une fiche
/// medecin) — jamais de simple `public_id` à reconstruire côté client.
class Medecin {
  final String medecinId;
  final String utilisateurId;
  final String specialiteId;
  final String numeroOrdre;
  final StatutVerificationMedecin statutVerification;
  final String paysExerciceId;
  final String villeExerciceId;
  final bool teleconsultationActivee;
  final double tarifIndicatif;
  final String biographie;
  final String? linkedInUrl;
  final String cniUrl;
  final String attestationUrl;
  final String? cvUrl;
  final String? photoUrl;
  final DateTime? dateCreation;

  final UtilisateurMedecin? utilisateur;
  final Specialite? specialite;
  final VilleExerciceRef? villeExercice;
  final PaysExerciceRef? paysExercice;

  const Medecin({
    required this.medecinId,
    required this.utilisateurId,
    required this.specialiteId,
    required this.numeroOrdre,
    required this.statutVerification,
    required this.paysExerciceId,
    required this.villeExerciceId,
    required this.teleconsultationActivee,
    required this.tarifIndicatif,
    required this.biographie,
    this.linkedInUrl,
    required this.cniUrl,
    required this.attestationUrl,
    this.cvUrl,
    this.photoUrl,
    this.dateCreation,
    this.utilisateur,
    this.specialite,
    this.villeExercice,
    this.paysExercice,
  });

  bool get estPublie => statutVerification == StatutVerificationMedecin.publie;

  bool get compteSuspendu =>
      utilisateur?.statutCompte == StatutCompteUtilisateur.suspendu;

  factory Medecin.fromJson(Map<String, dynamic> json) {
    return Medecin(
      medecinId: _lireStr(json, 'medecin_id'),
      utilisateurId: _lireStr(json, 'utilisateur_id'),
      specialiteId: _lireStr(json, 'specialite_id'),
      numeroOrdre: _lireStr(json, 'numero_ordre'),
      statutVerification:
      StatutVerificationMedecin.fromApi(json['statut_verification'] as String?),
      paysExerciceId: _lireStr(json, 'pays_exercice_id'),
      villeExerciceId: _lireStr(json, 'ville_exercice_id'),
      teleconsultationActivee: json['teleconsultation_activee'] == true,
      tarifIndicatif: _lireDecimal(json['tarif_indicatif']),
      biographie: json['biographie'] as String? ?? '',
      linkedInUrl: _lire<String>(json, 'linkedInUrl'),
      cniUrl: _lireStr(json, 'cni_url'),
      attestationUrl: _lireStr(json, 'attestation_url'),
      cvUrl: _lire<String>(json, 'cv_url'),
      photoUrl: _lire<String>(json, 'photo_url'),
      dateCreation: json['date_creation'] is String
          ? DateTime.tryParse(json['date_creation'] as String)
          : null,
      utilisateur: json['utilisateur'] is Map<String, dynamic>
          ? UtilisateurMedecin.fromJson(json['utilisateur'] as Map<String, dynamic>)
          : null,
      specialite: json['specialite'] is Map<String, dynamic>
          ? Specialite.fromJson(json['specialite'] as Map<String, dynamic>)
          : null,
      villeExercice: json['ville_exercice'] is Map<String, dynamic>
          ? VilleExerciceRef.fromJson(json['ville_exercice'] as Map<String, dynamic>)
          : null,
      paysExercice: json['pays_exercice'] is Map<String, dynamic>
          ? PaysExerciceRef.fromJson(json['pays_exercice'] as Map<String, dynamic>)
          : null,
    );
  }

  /// `tarif_indicatif` arrive en JSON tantôt en nombre, tantôt en
  /// chaîne (Decimal Prisma sérialisé) — tolère les deux.
  static double _lireDecimal(dynamic valeur) {
    if (valeur is num) return valeur.toDouble();
    if (valeur is String) return double.tryParse(valeur) ?? 0;
    return 0;
  }

  Map<String, dynamic> toJson() => {
    'medecin_id': medecinId,
    'utilisateur_id': utilisateurId,
    'specialite_id': specialiteId,
    'numero_ordre': numeroOrdre,
    'statut_verification': statutVerification.toApi(),
    'pays_exercice_id': paysExerciceId,
    'ville_exercice_id': villeExerciceId,
    'teleconsultation_activee': teleconsultationActivee,
    'tarif_indicatif': tarifIndicatif,
    'biographie': biographie,
    'linkedInUrl': linkedInUrl,
    'cni_url': cniUrl,
    'attestation_url': attestationUrl,
    'cv_url': cvUrl,
    'photo_url': photoUrl,
    if (dateCreation != null) 'date_creation': dateCreation!.toIso8601String(),
    if (utilisateur != null) 'utilisateur': utilisateur!.toJson(),
    if (specialite != null) 'specialite': specialite!.toJson(),
    if (villeExercice != null) 'ville_exercice': villeExercice!.toJson(),
    if (paysExercice != null) 'pays_exercice': paysExercice!.toJson(),
  };

  Medecin copyWith({
    String? medecinId,
    String? utilisateurId,
    String? specialiteId,
    String? numeroOrdre,
    StatutVerificationMedecin? statutVerification,
    String? paysExerciceId,
    String? villeExerciceId,
    bool? teleconsultationActivee,
    double? tarifIndicatif,
    String? biographie,
    String? linkedInUrl,
    String? cniUrl,
    String? attestationUrl,
    String? cvUrl,
    String? photoUrl,
    DateTime? dateCreation,
    UtilisateurMedecin? utilisateur,
    Specialite? specialite,
    VilleExerciceRef? villeExercice,
    PaysExerciceRef? paysExercice,
  }) {
    return Medecin(
      medecinId: medecinId ?? this.medecinId,
      utilisateurId: utilisateurId ?? this.utilisateurId,
      specialiteId: specialiteId ?? this.specialiteId,
      numeroOrdre: numeroOrdre ?? this.numeroOrdre,
      statutVerification: statutVerification ?? this.statutVerification,
      paysExerciceId: paysExerciceId ?? this.paysExerciceId,
      villeExerciceId: villeExerciceId ?? this.villeExerciceId,
      teleconsultationActivee:
      teleconsultationActivee ?? this.teleconsultationActivee,
      tarifIndicatif: tarifIndicatif ?? this.tarifIndicatif,
      biographie: biographie ?? this.biographie,
      linkedInUrl: linkedInUrl ?? this.linkedInUrl,
      cniUrl: cniUrl ?? this.cniUrl,
      attestationUrl: attestationUrl ?? this.attestationUrl,
      cvUrl: cvUrl ?? this.cvUrl,
      photoUrl: photoUrl ?? this.photoUrl,
      dateCreation: dateCreation ?? this.dateCreation,
      utilisateur: utilisateur ?? this.utilisateur,
      specialite: specialite ?? this.specialite,
      villeExercice: villeExercice ?? this.villeExercice,
      paysExercice: paysExercice ?? this.paysExercice,
    );
  }

  @override
  String toString() => 'Medecin($medecinId, ${utilisateur?.nom ?? ''})';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is Medecin && other.medecinId == medecinId);

  @override
  int get hashCode => medecinId.hashCode;
}

/// Réponse complète de POST /medecins : la fiche créée + le compte
/// utilisateur (avec mot de passe temporaire, à afficher une seule
/// fois).
class MedecinCreationResultat {
  final String message;
  final Medecin medecin;
  final UtilisateurCreeMedecin utilisateur;

  const MedecinCreationResultat({
    required this.message,
    required this.medecin,
    required this.utilisateur,
  });

  factory MedecinCreationResultat.fromJson(Map<String, dynamic> json) {
    return MedecinCreationResultat(
      message: json['message'] as String? ?? '',
      medecin: Medecin.fromJson(json['medecin'] as Map<String, dynamic>),
      utilisateur: UtilisateurCreeMedecin.fromJson(
          json['utilisateur'] as Map<String, dynamic>),
    );
  }
}

/// Réponse commune à PATCH /medecins/:id/publier,
/// PATCH /medecins/:id/suspendre et PATCH /medecins/:id/reactiver.
/// `medecin` est présent dans quasiment tous les cas de publierMedecin
/// et suspendreMedecin (voir contrôleur), sauf réponse "déjà suspendu"
/// de suspendreMedecin, qui ne renvoie qu'un message — d'où la
/// nullabilité de [medecin] ici. reactiverMedecin, lui, ne renvoie
/// JAMAIS de fiche (il ne touche que utilisateur.statut_compte) : après
/// un appel réussi, se fier uniquement à [message] et, si besoin
/// d'afficher la fiche à jour, republier explicitement via
/// PATCH /medecins/:id/publier ou recharger la fiche. Plus généralement,
/// utiliser [medecin] si présent pour rafraîchir l'état local, sinon se
/// fier au seul [message] (rien n'a changé côté serveur).
class MedecinActionResultat {
  final String message;
  final Medecin? medecin;

  const MedecinActionResultat({required this.message, this.medecin});

  factory MedecinActionResultat.fromJson(Map<String, dynamic> json) {
    return MedecinActionResultat(
      message: json['message'] as String? ?? '',
      medecin: json['medecin'] is Map<String, dynamic>
          ? Medecin.fromJson(json['medecin'] as Map<String, dynamic>)
          : null,
    );
  }
}

/// Statistiques d'avis publiés, telles que calculées et renvoyées par
/// GET /medecins/mon-profil (note_moyenne arrondie à 1 décimale,
/// `null` si aucun avis publié).
class StatistiquesAvisMedecin {
  final int totalAvis;
  final double? noteMoyenne;

  const StatistiquesAvisMedecin({
    required this.totalAvis,
    this.noteMoyenne,
  });

  factory StatistiquesAvisMedecin.fromJson(Map<String, dynamic> json) {
    final note = json['note_moyenne'];
    return StatistiquesAvisMedecin(
      totalAvis: json['total_avis'] as int? ?? 0,
      noteMoyenne: note is num ? note.toDouble() : null,
    );
  }
}

/// Réponse de GET /medecins/mon-profil : profil complet du médecin
/// connecté + statistiques d'avis.
///
/// ⚠️ Le backend inclut aussi `mobile_moneys`, `comptes_bancaires` et
/// `forfaits_abonnement` (modules "Moyens de paiement" et "Abonnements
/// médecin"), volontairement non modélisés ici (hors périmètre de ce
/// fichier — voir en-tête). Ils restent accessibles bruts via
/// [donneesBrutes] en attendant des modèles dédiés.
class MonProfilMedecin {
  final Medecin medecin;
  final StatistiquesAvisMedecin statistiques;
  final Map<String, dynamic> donneesBrutes;

  const MonProfilMedecin({
    required this.medecin,
    required this.statistiques,
    required this.donneesBrutes,
  });

  factory MonProfilMedecin.fromJson(Map<String, dynamic> json) {
    return MonProfilMedecin(
      medecin: Medecin.fromJson(json['medecin'] as Map<String, dynamic>),
      statistiques: StatistiquesAvisMedecin.fromJson(
          json['statistiques'] as Map<String, dynamic>? ?? const {}),
      donneesBrutes: (json['medecin'] as Map<String, dynamic>? ?? const {}),
    );
  }
}

/// Réponse de POST /medecins/verifier-ordre (Tableau de l'Ordre
/// National des Médecins du Cameroun — ONMC). `nomComplet` et
/// `numeroOrdreOnmc` ne sont présents que si [appartientOrdre] est
/// vrai.
class VerificationOrdreResultat {
  final String numeroOrdre;
  final bool appartientOrdre;
  final String? nomComplet;
  final String? numeroOrdreOnmc;

  const VerificationOrdreResultat({
    required this.numeroOrdre,
    required this.appartientOrdre,
    this.nomComplet,
    this.numeroOrdreOnmc,
  });

  factory VerificationOrdreResultat.fromJson(Map<String, dynamic> json) {
    return VerificationOrdreResultat(
      numeroOrdre: json['numero_ordre'] as String,
      appartientOrdre: json['appartient_ordre'] == true,
      nomComplet: _lire<String>(json, 'nom_complet'),
      numeroOrdreOnmc: _lire<String>(json, 'numero_ordre_onmc'),
    );
  }
}