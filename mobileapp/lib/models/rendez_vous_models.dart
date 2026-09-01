// lib/models/rendez_vous_models.dart
//
// Modèles du module transverse "Gestion des médecins", partie
// Rendez-vous + Ordonnance, en miroir de
// src/controllers/rendezVous.controller.js et src/routes/medecin.routes.js
// côté backend (voir aussi schema.prisma, model RendezVous / Ordonnance).
//
// Donnée privée patient/médecin, jamais publique : tous les endpoints
// exigent déjà "authentifier" côté backend — ces modèles ne portent donc
// pas de notion de vue "publique" allégée (contrairement à
// UtilisateurMedecin dans medecin_models.dart).
//
// Chaque modèle "de lecture" (renvoyé par l'API) expose :
//   - un constructeur `fromJson` tolérant (accepte l'objet imbriqué
//     medecin.utilisateur / patient.utilisateur renvoyé via
//     INCLUSION_NOMS_RDV côté backend)
//   - une méthode `toJson` (miroir complet)
//   - `copyWith` pour les mises à jour immuables côté état (controller)
//
// Chaque modèle "d'écriture" (filtres de liste, payloads de
// création/modification) expose une méthode `toQuery`/`toChamps` qui ne
// construit QUE les paires clé-valeur effectivement renseignées, pour
// coller à la sémantique "champ absent = ne pas toucher" utilisée par le
// backend (voir "donnees" dans modifierRendezVous/modifierOrdonnance).

/// Lit une valeur potentiellement absente/nulle sans planter la
/// désérialisation à cause d'un champ manquant.
T? _lire<T>(Map<String, dynamic> json, String cle) {
  final valeur = json[cle];
  if (valeur is T) return valeur;
  return null;
}

/// Miroir de l'enum Prisma `TypeRdv`.
enum TypeRdv {
  physique,
  teleconsultation;

  static TypeRdv fromApi(String? valeur) {
    return TypeRdv.values.firstWhere(
          (e) => e.name == valeur,
      orElse: () => TypeRdv.physique,
    );
  }

  String toApi() => name;
}

/// Miroir de l'enum Prisma `StatutRendezVous`.
/// Ordre identique à STATUTS_RDV côté contrôleur (cycle de vie, du dépôt
/// initial jusqu'à l'issue ou la contestation).
enum StatutRendezVous {
  cree,
  confirme,
  enAttentePresence,
  honore,
  nonHonore,
  annule,
  conteste;

  static StatutRendezVous fromApi(String? valeur) {
    switch (valeur) {
      case 'confirme':
        return StatutRendezVous.confirme;
      case 'en_attente_presence':
        return StatutRendezVous.enAttentePresence;
      case 'honore':
        return StatutRendezVous.honore;
      case 'non_honore':
        return StatutRendezVous.nonHonore;
      case 'annule':
        return StatutRendezVous.annule;
      case 'conteste':
        return StatutRendezVous.conteste;
      case 'cree':
      default:
        return StatutRendezVous.cree;
    }
  }

  String toApi() {
    switch (this) {
      case StatutRendezVous.cree:
        return 'cree';
      case StatutRendezVous.confirme:
        return 'confirme';
      case StatutRendezVous.enAttentePresence:
        return 'en_attente_presence';
      case StatutRendezVous.honore:
        return 'honore';
      case StatutRendezVous.nonHonore:
        return 'non_honore';
      case StatutRendezVous.annule:
        return 'annule';
      case StatutRendezVous.conteste:
        return 'conteste';
    }
  }
}

/// ─────────────────────────────────────────────────────────────────
/// Référence légère utilisateur/médecin/patient telle qu'imbriquée par
/// INCLUSION_NOMS_RDV côté backend (uniquement nom + prenom, jamais
/// email/telephone sur ce module).
/// ─────────────────────────────────────────────────────────────────
class UtilisateurRdvRef {
  final String nom;
  final String prenom;

  const UtilisateurRdvRef({required this.nom, required this.prenom});

  factory UtilisateurRdvRef.fromJson(Map<String, dynamic> json) {
    return UtilisateurRdvRef(
      nom: json['nom'] as String,
      prenom: json['prenom'] as String,
    );
  }

  Map<String, dynamic> toJson() => {'nom': nom, 'prenom': prenom};

  @override
  String toString() => 'UtilisateurRdvRef($nom, $prenom)';
}

/// `medecin.utilisateur.{nom,prenom}` — voir INCLUSION_NOMS_RDV.
class MedecinRdvRef {
  final String medecinId;
  final UtilisateurRdvRef? utilisateur;

  const MedecinRdvRef({required this.medecinId, this.utilisateur});

  factory MedecinRdvRef.fromJson(Map<String, dynamic> json) {
    return MedecinRdvRef(
      medecinId: json['medecin_id'] as String,
      utilisateur: json['utilisateur'] is Map<String, dynamic>
          ? UtilisateurRdvRef.fromJson(json['utilisateur'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'medecin_id': medecinId,
    if (utilisateur != null) 'utilisateur': utilisateur!.toJson(),
  };

  @override
  String toString() => 'MedecinRdvRef($medecinId, ${utilisateur?.nom ?? ''})';
}

/// `patient.utilisateur.{nom,prenom}` — voir INCLUSION_NOMS_RDV.
/// ⚠️ Hypothèse reprise du contrôleur backend : le modèle `patient`
/// porte une relation `utilisateur` du même type que `medecin.utilisateur`
/// — à ajuster si le nom de la relation diffère côté API.
class PatientRdvRef {
  final String patientId;
  final UtilisateurRdvRef? utilisateur;

  const PatientRdvRef({required this.patientId, this.utilisateur});

  factory PatientRdvRef.fromJson(Map<String, dynamic> json) {
    return PatientRdvRef(
      patientId: json['patient_id'] as String,
      utilisateur: json['utilisateur'] is Map<String, dynamic>
          ? UtilisateurRdvRef.fromJson(json['utilisateur'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'patient_id': patientId,
    if (utilisateur != null) 'utilisateur': utilisateur!.toJson(),
  };

  @override
  String toString() => 'PatientRdvRef($patientId, ${utilisateur?.nom ?? ''})';
}

/// ─────────────────────────────────────────────────────────────────
/// RendezVous
/// ─────────────────────────────────────────────────────────────────
/// `medecin` et `patient` sont nullables en théorie (JSON minimal), mais
/// systématiquement inclus par le backend sur tous les endpoints de
/// lecture/écriture de ce module (INCLUSION_NOMS_RDV).
///
/// `code_unique` et `qr_token_secret` servent au contrôle de présence à
/// l'accueil (scan/QR) : générés côté serveur à la création, jamais
/// saisis par le client — [qrTokenSecret] est donc à traiter comme une
/// donnée sensible côté app (ne jamais l'afficher en clair à l'écran,
/// ne l'utiliser que pour générer/vérifier le QR).
class RendezVous {
  final String rdvId;
  final String patientId;
  final String medecinId;
  final String? structureId;
  final TypeRdv typeRdv;
  final DateTime dateCreneau;
  final StatutRendezVous statut;
  final String? motif;
  final String codeUnique;
  final String qrTokenSecret;

  final MedecinRdvRef? medecin;
  final PatientRdvRef? patient;

  const RendezVous({
    required this.rdvId,
    required this.patientId,
    required this.medecinId,
    this.structureId,
    required this.typeRdv,
    required this.dateCreneau,
    required this.statut,
    this.motif,
    required this.codeUnique,
    required this.qrTokenSecret,
    this.medecin,
    this.patient,
  });

  bool get estAnnule => statut == StatutRendezVous.annule;
  bool get estConteste => statut == StatutRendezVous.conteste;
  bool get estTeleconsultation => typeRdv == TypeRdv.teleconsultation;

  factory RendezVous.fromJson(Map<String, dynamic> json) {
    return RendezVous(
      rdvId: json['rdv_id'] as String,
      patientId: json['patient_id'] as String,
      medecinId: json['medecin_id'] as String,
      structureId: _lire<String>(json, 'structure_id'),
      typeRdv: TypeRdv.fromApi(json['type_rdv'] as String?),
      dateCreneau: DateTime.parse(json['date_creneau'] as String),
      statut: StatutRendezVous.fromApi(json['statut'] as String?),
      motif: _lire<String>(json, 'motif'),
      codeUnique: json['code_unique'] as String,
      qrTokenSecret: json['qr_token_secret'] as String,
      medecin: json['medecin'] is Map<String, dynamic>
          ? MedecinRdvRef.fromJson(json['medecin'] as Map<String, dynamic>)
          : null,
      patient: json['patient'] is Map<String, dynamic>
          ? PatientRdvRef.fromJson(json['patient'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'rdv_id': rdvId,
    'patient_id': patientId,
    'medecin_id': medecinId,
    'structure_id': structureId,
    'type_rdv': typeRdv.toApi(),
    'date_creneau': dateCreneau.toIso8601String(),
    'statut': statut.toApi(),
    'motif': motif,
    'code_unique': codeUnique,
    'qr_token_secret': qrTokenSecret,
    if (medecin != null) 'medecin': medecin!.toJson(),
    if (patient != null) 'patient': patient!.toJson(),
  };

  RendezVous copyWith({
    String? rdvId,
    String? patientId,
    String? medecinId,
    String? structureId,
    TypeRdv? typeRdv,
    DateTime? dateCreneau,
    StatutRendezVous? statut,
    String? motif,
    String? codeUnique,
    String? qrTokenSecret,
    MedecinRdvRef? medecin,
    PatientRdvRef? patient,
  }) {
    return RendezVous(
      rdvId: rdvId ?? this.rdvId,
      patientId: patientId ?? this.patientId,
      medecinId: medecinId ?? this.medecinId,
      structureId: structureId ?? this.structureId,
      typeRdv: typeRdv ?? this.typeRdv,
      dateCreneau: dateCreneau ?? this.dateCreneau,
      statut: statut ?? this.statut,
      motif: motif ?? this.motif,
      codeUnique: codeUnique ?? this.codeUnique,
      qrTokenSecret: qrTokenSecret ?? this.qrTokenSecret,
      medecin: medecin ?? this.medecin,
      patient: patient ?? this.patient,
    );
  }

  @override
  String toString() => 'RendezVous($rdvId, ${statut.toApi()}, $dateCreneau)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is RendezVous && other.rdvId == rdvId);

  @override
  int get hashCode => rdvId.hashCode;
}

/// ─────────────────────────────────────────────────────────────────
/// Filtres pour GET /rendez-vous (query params).
/// ─────────────────────────────────────────────────────────────────
/// Miroir des query params lus par listerRendezVous côté backend.
/// ⚠️ [medecinId]/[patientId] ne sont réellement pris en compte par le
/// backend que si l'appelant est admin/superadmin : pour un patient ou
/// un médecin standard, la liste est de toute façon scopée côté serveur
/// à son propre profil, quels que soient les filtres envoyés.
class RendezVousFiltres {
  final StatutRendezVous? statut;
  final String? medecinId;
  final String? patientId;

  const RendezVousFiltres({this.statut, this.medecinId, this.patientId});

  Map<String, dynamic>? toQuery() {
    final query = <String, dynamic>{
      if (statut != null) 'statut': statut!.toApi(),
      if (medecinId != null && medecinId!.isNotEmpty) 'medecin_id': medecinId,
      if (patientId != null && patientId!.isNotEmpty) 'patient_id': patientId,
    };
    return query.isEmpty ? null : query;
  }

  RendezVousFiltres copyWith({
    StatutRendezVous? statut,
    String? medecinId,
    String? patientId,
  }) {
    return RendezVousFiltres(
      statut: statut ?? this.statut,
      medecinId: medecinId ?? this.medecinId,
      patientId: patientId ?? this.patientId,
    );
  }
}

/// Payload pour POST /rendez-vous.
/// Réservé au patient qui réserve le créneau (patient_id déduit du
/// token côté backend, jamais saisi ici). [typeRdv] "teleconsultation"
/// exige que le médecin ait activé teleconsultation_activee (voir
/// Medecin.teleconsultationActivee dans medecin_models.dart) ;
/// [structureId] n'a de sens que pour un rdv "physique" (sinon cabinet
/// libéral, à laisser `null`).
class CreerRendezVousPayload {
  final String medecinId;
  final String? structureId;
  final TypeRdv typeRdv;
  final DateTime dateCreneau;
  final String? motif;

  const CreerRendezVousPayload({
    required this.medecinId,
    this.structureId,
    required this.typeRdv,
    required this.dateCreneau,
    this.motif,
  });

  Map<String, dynamic> toJson() => {
    'medecin_id': medecinId,
    if (structureId != null) 'structure_id': structureId,
    'type_rdv': typeRdv.toApi(),
    'date_creneau': dateCreneau.toIso8601String(),
    if (motif != null && motif!.isNotEmpty) 'motif': motif,
  };
}

/// Payload pour PUT /rendez-vous/:id.
/// Ouvert au patient concerné, au médecin concerné, ou à
/// admin/superadmin. Seuls les champs non `null` sont envoyés — miroir
/// de la logique "Object.keys(donnees).length === 0" du contrôleur, qui
/// renvoie une erreur 400 si rien n'est à mettre à jour (voir [estVide]).
///
/// ⚠️ Ce endpoint accepte [statut] SANS contrôle de transition (à la
/// différence de PATCH /rendez-vous/:id/statut, voir
/// [ChangerStatutRendezVousPayload]) — à réserver aux écrans
/// back-office/admin ; pour un changement de statut initié par un
/// patient ou un médecin, préférer [ChangerStatutRendezVousPayload].
///
/// Cas particuliers :
///   - [structureId] : passer une chaîne vide `''` pour retirer la
///     structure existante (le backend traite toute valeur falsy comme
///     `null`) ; ne pas fournir le champ (laisser `null` ici) pour ne
///     pas y toucher.
///   - [motif] : passer une chaîne vide `''` ou explicitement effacer
///     pour vider le motif ; ne pas fournir le champ pour ne pas y
///     toucher.
class ModifierRendezVousPayload {
  final StatutRendezVous? statut;
  final DateTime? dateCreneau;
  final String? structureId;
  final String? motif;

  const ModifierRendezVousPayload({
    this.statut,
    this.dateCreneau,
    this.structureId,
    this.motif,
  });

  bool get estVide =>
      statut == null &&
          dateCreneau == null &&
          structureId == null &&
          motif == null;

  Map<String, dynamic> toJson() => {
    if (statut != null) 'statut': statut!.toApi(),
    if (dateCreneau != null) 'date_creneau': dateCreneau!.toIso8601String(),
    if (structureId != null) 'structure_id': structureId,
    if (motif != null) 'motif': motif,
  };
}

/// Payload pour PATCH /rendez-vous/:id/statut.
/// Contrairement à [ModifierRendezVousPayload], ce endpoint vérifie côté
/// backend que la transition demandée est cohérente avec le rôle de
/// l'appelant et le statut actuel du rdv (voir TRANSITIONS_AUTORISEES) :
///   - patient concerné : cree→annule, confirme→annule,
///     honore/non_honore→conteste.
///   - médecin concerné : cree→confirme/annule,
///     confirme→en_attente_presence/annule,
///     en_attente_presence→honore/non_honore.
///   - admin/superadmin : toute transition vers un statut différent.
/// À privilégier sur [ModifierRendezVousPayload] pour tout changement de
/// statut initié depuis un écran patient ou médecin.
class ChangerStatutRendezVousPayload {
  final StatutRendezVous statut;

  const ChangerStatutRendezVousPayload({required this.statut});

  Map<String, dynamic> toJson() => {'statut': statut.toApi()};
}

/// ─────────────────────────────────────────────────────────────────
/// Ordonnance
/// ─────────────────────────────────────────────────────────────────
/// Pièce médicale nominative : jamais d'`include` côté backend sur ce
/// module (listerOrdonnances/obtenirOrdonnance renvoient les FK brutes
/// rdv_id/medecin_id/patient_id, pas d'objets imbriqués) — pour
/// afficher un nom de médecin/patient associé à une ordonnance, croiser
/// avec [RendezVous] (même rdv_id) ou une fiche [Medecin]/patient
/// chargée séparément.
class Ordonnance {
  final String ordonnanceId;
  final String rdvId;
  final String medecinId;
  final String patientId;
  final String identifiantUnique;
  final String paysEmissionId;
  final String contenu;
  final DateTime? dateEmission;

  const Ordonnance({
    required this.ordonnanceId,
    required this.rdvId,
    required this.medecinId,
    required this.patientId,
    required this.identifiantUnique,
    required this.paysEmissionId,
    required this.contenu,
    this.dateEmission,
  });

  factory Ordonnance.fromJson(Map<String, dynamic> json) {
    return Ordonnance(
      ordonnanceId: json['ordonnance_id'] as String,
      rdvId: json['rdv_id'] as String,
      medecinId: json['medecin_id'] as String,
      patientId: json['patient_id'] as String,
      identifiantUnique: json['identifiant_unique'] as String,
      paysEmissionId: json['pays_emission_id'] as String,
      contenu: json['contenu'] as String,
      dateEmission: json['date_emission'] is String
          ? DateTime.tryParse(json['date_emission'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'ordonnance_id': ordonnanceId,
    'rdv_id': rdvId,
    'medecin_id': medecinId,
    'patient_id': patientId,
    'identifiant_unique': identifiantUnique,
    'pays_emission_id': paysEmissionId,
    'contenu': contenu,
    if (dateEmission != null) 'date_emission': dateEmission!.toIso8601String(),
  };

  Ordonnance copyWith({
    String? ordonnanceId,
    String? rdvId,
    String? medecinId,
    String? patientId,
    String? identifiantUnique,
    String? paysEmissionId,
    String? contenu,
    DateTime? dateEmission,
  }) {
    return Ordonnance(
      ordonnanceId: ordonnanceId ?? this.ordonnanceId,
      rdvId: rdvId ?? this.rdvId,
      medecinId: medecinId ?? this.medecinId,
      patientId: patientId ?? this.patientId,
      identifiantUnique: identifiantUnique ?? this.identifiantUnique,
      paysEmissionId: paysEmissionId ?? this.paysEmissionId,
      contenu: contenu ?? this.contenu,
      dateEmission: dateEmission ?? this.dateEmission,
    );
  }

  @override
  String toString() => 'Ordonnance($ordonnanceId, $identifiantUnique)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is Ordonnance && other.ordonnanceId == ordonnanceId);

  @override
  int get hashCode => ordonnanceId.hashCode;
}

/// ─────────────────────────────────────────────────────────────────
/// Filtres pour GET /ordonnances (query params).
/// ─────────────────────────────────────────────────────────────────
/// ⚠️ [medecinId]/[patientId] ne sont réellement pris en compte par le
/// backend que si l'appelant est admin/superadmin — mêmes règles de
/// scoping que [RendezVousFiltres].
class OrdonnanceFiltres {
  final String? rdvId;
  final String? medecinId;
  final String? patientId;

  const OrdonnanceFiltres({this.rdvId, this.medecinId, this.patientId});

  Map<String, dynamic>? toQuery() {
    final query = <String, dynamic>{
      if (rdvId != null && rdvId!.isNotEmpty) 'rdv_id': rdvId,
      if (medecinId != null && medecinId!.isNotEmpty) 'medecin_id': medecinId,
      if (patientId != null && patientId!.isNotEmpty) 'patient_id': patientId,
    };
    return query.isEmpty ? null : query;
  }

  OrdonnanceFiltres copyWith({
    String? rdvId,
    String? medecinId,
    String? patientId,
  }) {
    return OrdonnanceFiltres(
      rdvId: rdvId ?? this.rdvId,
      medecinId: medecinId ?? this.medecinId,
      patientId: patientId ?? this.patientId,
    );
  }
}

/// Payload pour POST /ordonnances.
/// Réservé au médecin du rendez-vous concerné, déduit de [rdvId] côté
/// backend (jamais un autre médecin, même admin ne peut créer une
/// ordonnance à la place du médecin). [identifiantUnique] est généré
/// côté serveur, jamais fourni ici.
class CreerOrdonnancePayload {
  final String rdvId;
  final String paysEmissionId;
  final String contenu;

  const CreerOrdonnancePayload({
    required this.rdvId,
    required this.paysEmissionId,
    required this.contenu,
  });

  Map<String, dynamic> toJson() => {
    'rdv_id': rdvId,
    'pays_emission_id': paysEmissionId,
    'contenu': contenu,
  };
}

/// Payload pour PUT /ordonnances/:id.
/// Le médecin auteur ou admin/superadmin — seuls [contenu] et
/// [paysEmissionId] sont modifiables ; rdv_id, medecin_id, patient_id et
/// identifiant_unique sont immuables après émission (non exposés ici).
/// Seuls les champs non `null` sont envoyés — voir [estVide].
class ModifierOrdonnancePayload {
  final String? contenu;
  final String? paysEmissionId;

  const ModifierOrdonnancePayload({this.contenu, this.paysEmissionId});

  bool get estVide => contenu == null && paysEmissionId == null;

  Map<String, dynamic> toJson() => {
    if (contenu != null) 'contenu': contenu,
    if (paysEmissionId != null) 'pays_emission_id': paysEmissionId,
  };
}