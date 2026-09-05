// lib/models/patient_models.dart
//
// Modèles Dart du module transverse "Gestion des médecins" — fiche
// `patient`, en miroir exact des réponses JSON de :
//   - GET /api/patients/mon-profil        -> MonProfilPatientResponse
//   - GET /api/patients/:id               -> PatientResponse
//   - GET /api/patients/:id/rendez-vous   -> RendezVousPatientResponse
// (voir patient.controller.js / patient.routes.js).
//
// ⚠️ Vue "complète" vs "restreinte" de l'utilisateur :
// La fiche patient renvoyée par GET /api/patients/:id n'expose PAS
// toujours les mêmes champs utilisateur :
//   - patient lui-même / admin-superadmin  -> vue complète
//     (SELECTION_UTILISATEUR_PATIENT : email, téléphone, pays, statut)
//   - médecin tiers ayant un rendez-vous avec ce patient -> vue
//     restreinte (SELECTION_UTILISATEUR_RESTREINTE : nom/prénom
//     uniquement, jamais les coordonnées)
// UtilisateurPatient modélise les deux avec des champs nullable ; le
// getter `estVueComplete` permet à l'UI de savoir laquelle est reçue
// (ex. pour masquer une section "coordonnées" si absente).
//
// Champs réels côté Prisma (schema.prisma) :
//   patient { patient_id, utilisateur_id (unique), date_naissance,
//     rendez_vous[], ordonnances[] }
//   rendez_vous { rdv_id, patient_id, medecin_id, structure_id?,
//     type_rdv, date_creneau, statut, motif?, code_unique,
//     qr_token_secret }

/// Statuts possibles d'un rendez-vous — même liste que STATUTS_RDV
/// dans patient.controller.js (et l'enum StatutRendezVous du schema).
enum StatutRendezVous {
  cree,
  confirme,
  enAttentePresence,
  honore,
  nonHonore,
  annule,
  conteste;

  static StatutRendezVous fromJson(String valeur) {
    switch (valeur) {
      case 'cree':
        return StatutRendezVous.cree;
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
      default:
        throw ArgumentError('Statut de rendez-vous inconnu : $valeur');
    }
  }

  String toJson() {
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

/// Type de rendez-vous — enum TypeRdv du schema.prisma.
enum TypeRdv {
  physique,
  teleconsultation;

  static TypeRdv fromJson(String valeur) {
    switch (valeur) {
      case 'physique':
        return TypeRdv.physique;
      case 'teleconsultation':
        return TypeRdv.teleconsultation;
      default:
        throw ArgumentError('Type de rendez-vous inconnu : $valeur');
    }
  }

  String toJson() => this == TypeRdv.physique ? 'physique' : 'teleconsultation';
}

/// Vue minimale d'un utilisateur (nom/prénom uniquement), utilisée
/// pour l'utilisateur du médecin imbriqué dans un rendez-vous
/// (`medecin: { include: { utilisateur: { select: { nom, prenom } } } }`
/// — patient.controller.js). Pas d'id ici : Prisma ne le sélectionne
/// pas à cet endroit.
class UtilisateurNomPrenom {
  final String nom;
  final String prenom;

  const UtilisateurNomPrenom({required this.nom, required this.prenom});

  factory UtilisateurNomPrenom.fromJson(Map<String, dynamic> json) {
    return UtilisateurNomPrenom(
      nom: json['nom'] as String,
      prenom: json['prenom'] as String,
    );
  }

  Map<String, dynamic> toJson() => {'nom': nom, 'prenom': prenom};

  /// Nom complet prêt à afficher (ex. "Dr. Prenom Nom" côté UI).
  String get nomComplet => '$prenom $nom';
}

/// Fiche utilisateur rattachée à un patient, dans sa vue "complète"
/// (titulaire du compte / admin) ou "restreinte" (médecin tiers) — voir
/// SELECTION_UTILISATEUR_PATIENT / SELECTION_UTILISATEUR_RESTREINTE
/// dans patient.controller.js.
class UtilisateurPatient {
  final String utilisateurId;
  final String nom;
  final String prenom;

  /// Non nul uniquement en vue complète.
  final String? email;
  final String? telephone;
  final String? paysId;
  final String? statutCompte;

  const UtilisateurPatient({
    required this.utilisateurId,
    required this.nom,
    required this.prenom,
    this.email,
    this.telephone,
    this.paysId,
    this.statutCompte,
  });

  factory UtilisateurPatient.fromJson(Map<String, dynamic> json) {
    return UtilisateurPatient(
      utilisateurId: json['utilisateur_id'] as String,
      nom: json['nom'] as String,
      prenom: json['prenom'] as String,
      email: json['email'] as String?,
      telephone: json['telephone'] as String?,
      paysId: json['pays_id'] as String?,
      statutCompte: json['statut_compte'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'utilisateur_id': utilisateurId,
    'nom': nom,
    'prenom': prenom,
    if (email != null) 'email': email,
    if (telephone != null) 'telephone': telephone,
    if (paysId != null) 'pays_id': paysId,
    if (statutCompte != null) 'statut_compte': statutCompte,
  };

  /// true si la réponse porte la vue complète (email présent) —
  /// permet à l'UI de savoir si les coordonnées sont disponibles
  /// avant d'afficher une section "contact".
  bool get estVueComplete => email != null;

  String get nomComplet => '$prenom $nom';
}

/// Vue résumée d'une structure de santé, imbriquée dans un
/// rendez-vous (`structure: { select: { structure_id, nom } }`).
class StructureResume {
  final String structureId;
  final String nom;

  const StructureResume({required this.structureId, required this.nom});

  factory StructureResume.fromJson(Map<String, dynamic> json) {
    return StructureResume(
      structureId: json['structure_id'] as String,
      nom: json['nom'] as String,
    );
  }

  Map<String, dynamic> toJson() => {'structure_id': structureId, 'nom': nom};
}

/// Vue résumée d'un médecin telle qu'imbriquée dans un rendez-vous
/// patient (`medecin: { include: { utilisateur: { select: { nom,
/// prenom } } } }` — patient.controller.js). Reprend les champs
/// scalaires du modèle Medecin (schema.prisma), utiles à l'écran
/// "mes rendez-vous" côté patient (ex. tarif indicatif, téléconsultation).
class MedecinResume {
  final String medecinId;
  final String specialiteId;
  final String numeroOrdre;
  final String statutVerification;
  final String paysExerciceId;
  final String villeExerciceId;
  final bool teleconsultationActivee;
  final double tarifIndicatif;
  final String biographie;
  final String? linkedInUrl;
  final String? photoUrl;
  final DateTime dateCreation;
  final UtilisateurNomPrenom utilisateur;

  const MedecinResume({
    required this.medecinId,
    required this.specialiteId,
    required this.numeroOrdre,
    required this.statutVerification,
    required this.paysExerciceId,
    required this.villeExerciceId,
    required this.teleconsultationActivee,
    required this.tarifIndicatif,
    required this.biographie,
    this.linkedInUrl,
    this.photoUrl,
    required this.dateCreation,
    required this.utilisateur,
  });

  factory MedecinResume.fromJson(Map<String, dynamic> json) {
    return MedecinResume(
      medecinId: json['medecin_id'] as String,
      specialiteId: json['specialite_id'] as String,
      numeroOrdre: json['numero_ordre'] as String,
      statutVerification: json['statut_verification'] as String,
      paysExerciceId: json['pays_exercice_id'] as String,
      villeExerciceId: json['ville_exercice_id'] as String,
      teleconsultationActivee: json['teleconsultation_activee'] as bool,
      tarifIndicatif: (json['tarif_indicatif'] as num).toDouble(),
      biographie: json['biographie'] as String? ?? '',
      linkedInUrl: json['linkedInUrl'] as String?,
      photoUrl: json['photo_url'] as String?,
      dateCreation: DateTime.parse(json['date_creation'] as String),
      utilisateur: UtilisateurNomPrenom.fromJson(
        json['utilisateur'] as Map<String, dynamic>,
      ),
    );
  }

  Map<String, dynamic> toJson() => {
    'medecin_id': medecinId,
    'specialite_id': specialiteId,
    'numero_ordre': numeroOrdre,
    'statut_verification': statutVerification,
    'pays_exercice_id': paysExerciceId,
    'ville_exercice_id': villeExerciceId,
    'teleconsultation_activee': teleconsultationActivee,
    'tarif_indicatif': tarifIndicatif,
    'biographie': biographie,
    if (linkedInUrl != null) 'linkedInUrl': linkedInUrl,
    if (photoUrl != null) 'photo_url': photoUrl,
    'date_creation': dateCreation.toIso8601String(),
    'utilisateur': utilisateur.toJson(),
  };
}

/// Rendez-vous tel que renvoyé pour un patient : soit le prochain
/// rendez-vous à venir (obtenirMonProfil), soit un élément de la
/// liste de listerRendezVousPatient. Dans les deux cas le médecin est
/// imbriqué (vue résumée) ; `structure` n'est présente que sur la
/// liste (jamais sur le "prochain rendez-vous" du profil).
class RendezVousPatient {
  final String rdvId;
  final String patientId;
  final String medecinId;
  final String? structureId;
  final TypeRdv typeRdv;
  final DateTime dateCreneau;
  final StatutRendezVous statut;
  final String? motif;
  final String codeUnique;
  final MedecinResume medecin;
  final StructureResume? structure;

  const RendezVousPatient({
    required this.rdvId,
    required this.patientId,
    required this.medecinId,
    this.structureId,
    required this.typeRdv,
    required this.dateCreneau,
    required this.statut,
    this.motif,
    required this.codeUnique,
    required this.medecin,
    this.structure,
  });

  factory RendezVousPatient.fromJson(Map<String, dynamic> json) {
    return RendezVousPatient(
      rdvId: json['rdv_id'] as String,
      patientId: json['patient_id'] as String,
      medecinId: json['medecin_id'] as String,
      structureId: json['structure_id'] as String?,
      typeRdv: TypeRdv.fromJson(json['type_rdv'] as String),
      dateCreneau: DateTime.parse(json['date_creneau'] as String),
      statut: StatutRendezVous.fromJson(json['statut'] as String),
      motif: json['motif'] as String?,
      codeUnique: json['code_unique'] as String,
      medecin: MedecinResume.fromJson(json['medecin'] as Map<String, dynamic>),
      structure: json['structure'] == null
          ? null
          : StructureResume.fromJson(json['structure'] as Map<String, dynamic>),
    );
  }

  Map<String, dynamic> toJson() => {
    'rdv_id': rdvId,
    'patient_id': patientId,
    'medecin_id': medecinId,
    if (structureId != null) 'structure_id': structureId,
    'type_rdv': typeRdv.toJson(),
    'date_creneau': dateCreneau.toIso8601String(),
    'statut': statut.toJson(),
    if (motif != null) 'motif': motif,
    'code_unique': codeUnique,
    'medecin': medecin.toJson(),
    if (structure != null) 'structure': structure!.toJson(),
  };

  bool get estTeleconsultation => typeRdv == TypeRdv.teleconsultation;
  bool get estAVenir =>
      dateCreneau.isAfter(DateTime.now()) &&
          (statut == StatutRendezVous.cree || statut == StatutRendezVous.confirme);
}

/// Fiche patient — modèle Patient du schema.prisma, avec son
/// utilisateur imbriqué (vue complète ou restreinte selon
/// l'appelant, voir UtilisateurPatient).
class Patient {
  final String patientId;
  final String utilisateurId;
  final DateTime dateNaissance;
  final UtilisateurPatient utilisateur;

  const Patient({
    required this.patientId,
    required this.utilisateurId,
    required this.dateNaissance,
    required this.utilisateur,
  });

  factory Patient.fromJson(Map<String, dynamic> json) {
    return Patient(
      patientId: json['patient_id'] as String,
      utilisateurId: json['utilisateur_id'] as String,
      dateNaissance: DateTime.parse(json['date_naissance'] as String),
      utilisateur:
      UtilisateurPatient.fromJson(json['utilisateur'] as Map<String, dynamic>),
    );
  }

  Map<String, dynamic> toJson() => {
    'patient_id': patientId,
    'utilisateur_id': utilisateurId,
    'date_naissance': dateNaissance.toIso8601String(),
    'utilisateur': utilisateur.toJson(),
  };

  int get age {
    final maintenant = DateTime.now();
    var annees = maintenant.year - dateNaissance.year;
    final anniversairePasse = (maintenant.month > dateNaissance.month) ||
        (maintenant.month == dateNaissance.month && maintenant.day >= dateNaissance.day);
    if (!anniversairePasse) annees -= 1;
    return annees;
  }
}

/// Bloc "statistiques" de GET /api/patients/mon-profil.
class StatistiquesPatient {
  final int totalRendezVous;
  final int totalOrdonnances;
  final RendezVousPatient? prochainRendezVous;

  const StatistiquesPatient({
    required this.totalRendezVous,
    required this.totalOrdonnances,
    this.prochainRendezVous,
  });

  factory StatistiquesPatient.fromJson(Map<String, dynamic> json) {
    return StatistiquesPatient(
      totalRendezVous: json['total_rendez_vous'] as int,
      totalOrdonnances: json['total_ordonnances'] as int,
      prochainRendezVous: json['prochain_rendez_vous'] == null
          ? null
          : RendezVousPatient.fromJson(
        json['prochain_rendez_vous'] as Map<String, dynamic>,
      ),
    );
  }

  Map<String, dynamic> toJson() => {
    'total_rendez_vous': totalRendezVous,
    'total_ordonnances': totalOrdonnances,
    if (prochainRendezVous != null)
      'prochain_rendez_vous': prochainRendezVous!.toJson(),
  };
}

/// Réponse de GET /api/patients/mon-profil (obtenirMonProfil).
class MonProfilPatientResponse {
  final Patient patient;
  final StatistiquesPatient statistiques;

  const MonProfilPatientResponse({
    required this.patient,
    required this.statistiques,
  });

  factory MonProfilPatientResponse.fromJson(Map<String, dynamic> json) {
    return MonProfilPatientResponse(
      patient: Patient.fromJson(json['patient'] as Map<String, dynamic>),
      statistiques: StatistiquesPatient.fromJson(
        json['statistiques'] as Map<String, dynamic>,
      ),
    );
  }
}

/// Réponse de GET /api/patients/:id (obtenirPatient).
class PatientResponse {
  final Patient patient;

  const PatientResponse({required this.patient});

  factory PatientResponse.fromJson(Map<String, dynamic> json) {
    return PatientResponse(
      patient: Patient.fromJson(json['patient'] as Map<String, dynamic>),
    );
  }
}

/// Réponse de GET /api/patients/:id/rendez-vous (listerRendezVousPatient).
class RendezVousPatientResponse {
  final List<RendezVousPatient> rendezVous;

  const RendezVousPatientResponse({required this.rendezVous});

  factory RendezVousPatientResponse.fromJson(Map<String, dynamic> json) {
    return RendezVousPatientResponse(
      rendezVous: (json['rendez_vous'] as List<dynamic>)
          .map((e) => RendezVousPatient.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}