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

/// Lit un nombre qui peut arriver sous forme de nombre OU de chaîne :
/// Prisma sérialise les `Decimal` (ex. `montant` d'un mouvement de
/// portefeuille, `taux_applique` d'une amende) en chaîne JSON.
double? lireNombre(Object? valeur) {
  if (valeur is num) return valeur.toDouble();
  if (valeur is String) return double.tryParse(valeur.trim());
  return null;
}

/// Lit une date ISO 8601 absente, nulle ou invalide sans lever d'erreur.
DateTime? _lireDate(Map<String, dynamic> json, String cle) {
  final valeur = json[cle];
  return valeur is String ? DateTime.tryParse(valeur) : null;
}

/// Délai laissé aux deux parties pour convenir d'une nouvelle date une
/// fois le rendez-vous passé en `a_reprogrammer` (politique de fonds v2).
/// Affichage uniquement : le serveur reste seul juge de l'échéance.
const Duration delaiReprogrammation = Duration(hours: 48);

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
///
/// [aReprogrammer] : les deux parties étaient absentes, elles ont 48 h
/// pour convenir d'une nouvelle date (politique de fonds v2).
///
/// [inconnu] : statut renvoyé par le serveur mais pas encore connu de
/// l'application. Il ne doit JAMAIS être traité comme `cree` (un RDV
/// non reconnu afficherait « en attente de paiement » avec le bouton
/// Payer). La valeur brute reste lisible via `RendezVous.statutBrut`.
/// Les écrans l'affichent avec un libellé neutre, sans action
/// financière.
enum StatutRendezVous {
  cree,
  confirme,
  enAttentePresence,
  aReprogrammer,
  honore,
  nonHonore,
  annule,
  conteste,
  inconnu;

  /// Statuts acceptés par le serveur pour un filtre de liste (voir
  /// STATUTS_RDV dans patient.controller.js : `a_reprogrammer` n'y figure
  /// pas encore, un filtre dessus répondrait 400) — [inconnu] n'a de
  /// sens que côté lecture.
  static const List<StatutRendezVous> filtrables = [
    cree,
    confirme,
    enAttentePresence,
    honore,
    nonHonore,
    annule,
    conteste,
  ];

  static StatutRendezVous fromApi(String? valeur) {
    switch (valeur) {
      case 'cree':
        return StatutRendezVous.cree;
      case 'confirme':
        return StatutRendezVous.confirme;
      case 'en_attente_presence':
        return StatutRendezVous.enAttentePresence;
      case 'a_reprogrammer':
        return StatutRendezVous.aReprogrammer;
      case 'honore':
        return StatutRendezVous.honore;
      case 'non_honore':
        return StatutRendezVous.nonHonore;
      case 'annule':
        return StatutRendezVous.annule;
      case 'conteste':
        return StatutRendezVous.conteste;
      default:
        // Absent ou non reconnu : jamais `cree` par défaut.
        return StatutRendezVous.inconnu;
    }
  }

  /// Valeur envoyée à l'API. Lève une [StateError] pour [inconnu] : ce
  /// statut n'existe que côté lecture et ne doit jamais être émis.
  String toApi() {
    switch (this) {
      case StatutRendezVous.cree:
        return 'cree';
      case StatutRendezVous.confirme:
        return 'confirme';
      case StatutRendezVous.enAttentePresence:
        return 'en_attente_presence';
      case StatutRendezVous.aReprogrammer:
        return 'a_reprogrammer';
      case StatutRendezVous.honore:
        return 'honore';
      case StatutRendezVous.nonHonore:
        return 'non_honore';
      case StatutRendezVous.annule:
        return 'annule';
      case StatutRendezVous.conteste:
        return 'conteste';
      case StatutRendezVous.inconnu:
        throw StateError(
          "Le statut « inconnu » ne peut pas être envoyé à l'API.",
        );
    }
  }
}

/// Partie du rendez-vous à l'origine d'une proposition de
/// reprogrammation — miroir de l'enum Prisma `PartieRendezVous`.
enum PartieRendezVous {
  patient,
  medecin;

  static PartieRendezVous? fromApi(String? valeur) {
    for (final p in PartieRendezVous.values) {
      if (p.name == valeur) return p;
    }
    return null;
  }

  String toApi() => name;
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
/// `code_unique` est le CODE DE CONSULTATION : un secret du PATIENT
/// (6 caractères), généré côté serveur à la création et jamais saisi par le
/// client. Le patient le communique au médecin à la FIN de la consultation ;
/// le médecin le saisit pour terminer le RDV physique. Le serveur ne le
/// renvoie JAMAIS au médecin : [codeUnique] vaut donc `''` dans l'espace
/// médecin et ne doit jamais y être affiché. [qrTokenSecret] n'est plus
/// utilisé (le scan QR a été remplacé par ce code) et n'est plus renvoyé.
///
/// Libération différée des fonds (T heures) :
///   - [termineLe]           : fin de consultation constatée (code valide
///                             ou clôture de la visio) ;
///   - [liberationPrevueLe]  : date à laquelle les fonds sont libérés au
///                             médecin (`termine_le` + T, calculée par le
///                             serveur) ; `null` tant que la consultation
///                             n'est pas terminée.
///
/// Politique de fonds v2 — reprogrammation « deux absents » :
///   - [aReprogrammerLe]       : date de passage au statut `a_reprogrammer`
///                               (départ du délai de 48 h, jamais prolongé) ;
///   - [nouvelleDateProposee]  : proposition en cours (une nouvelle
///                               proposition remplace la précédente) ;
///   - [proposeePar]           : partie qui a proposé (l'autre doit accepter) ;
///   - [dateProposition]       : date de la proposition.
///
/// [statutBrut] conserve la valeur reçue du serveur, utile quand
/// [statut] vaut [StatutRendezVous.inconnu].
class RendezVous {
  final String rdvId;
  final String patientId;
  final String medecinId;
  final String? structureId;
  final TypeRdv typeRdv;
  final DateTime dateCreneau;
  final StatutRendezVous statut;
  final String? statutBrut;
  final String? motif;
  final String codeUnique;
  final String? qrTokenSecret;

  final DateTime? aReprogrammerLe;
  final DateTime? nouvelleDateProposee;
  final PartieRendezVous? proposeePar;
  final DateTime? dateProposition;

  final DateTime? termineLe;
  final DateTime? liberationPrevueLe;

  final MedecinRdvRef? medecin;
  final PatientRdvRef? patient;

  /// D8 : indicateur `non_paye` renvoyé au MÉDECIN pour un RDV non payé
  /// (statut `cree`). Dans ce cas le serveur ne fournit que
  /// { rdv_id, date_creneau, statut, non_paye: true } : [patientId],
  /// [medecinId] et [codeUnique] sont alors vides, et [patient], [motif],
  /// [qrTokenSecret] absents.
  final bool nonPaye;

  const RendezVous({
    required this.rdvId,
    required this.patientId,
    required this.medecinId,
    this.structureId,
    required this.typeRdv,
    required this.dateCreneau,
    required this.statut,
    this.statutBrut,
    this.motif,
    required this.codeUnique,
    this.qrTokenSecret,
    this.aReprogrammerLe,
    this.nouvelleDateProposee,
    this.proposeePar,
    this.dateProposition,
    this.termineLe,
    this.liberationPrevueLe,
    this.medecin,
    this.patient,
    this.nonPaye = false,
  });

  /// RDV physique pour lequel le patient doit pouvoir consulter son code de
  /// consultation (consultation pas encore terminée) et le médecin peut
  /// cliquer sur « Terminé ».
  bool get estTerminableParCode =>
      !estNonPaye &&
      typeRdv == TypeRdv.physique &&
      (statut == StatutRendezVous.confirme ||
          statut == StatutRendezVous.enAttentePresence);

  /// Les fonds de ce RDV honoré sont encore en séquestre : leur libération
  /// est prévue dans le futur.
  bool get fondsEnAttenteDeLiberation =>
      statut == StatutRendezVous.honore &&
      liberationPrevueLe != null &&
      liberationPrevueLe!.isAfter(DateTime.now());

  /// RDV non payé (D8) : `non_paye: true` renvoyé par le serveur, ou statut
  /// `cree` (miroir de `estRdvNonPaye` côté web). Pour le médecin, un tel
  /// RDV est en lecture seule : aucune action, aucune donnée patient.
  bool get estNonPaye => nonPaye || statut == StatutRendezVous.cree;

  bool get estAReprogrammer => statut == StatutRendezVous.aReprogrammer;
  bool get estStatutConnu => statut != StatutRendezVous.inconnu;

  /// Échéance de la reprogrammation : passage à `a_reprogrammer` + 48 h
  /// (le délai ne se prolonge jamais). `null` hors de ce statut ou si le
  /// serveur n'a pas renvoyé [aReprogrammerLe]. Affichage uniquement.
  DateTime? get echeanceReprogrammation => aReprogrammerLe?.add(delaiReprogrammation);

  /// Une proposition de nouvelle date est en cours.
  bool get aUneProposition => nouvelleDateProposee != null && proposeePar != null;

  bool get estAnnule => statut == StatutRendezVous.annule;
  bool get estConteste => statut == StatutRendezVous.conteste;
  bool get estTeleconsultation => typeRdv == TypeRdv.teleconsultation;

  factory RendezVous.fromJson(Map<String, dynamic> json) {
    return RendezVous(
      rdvId: json['rdv_id'] as String,
      // D8 : la projection minimale d'un RDV non payé (vue médecin) ne
      // contient ni patient_id, ni medecin_id, ni code_unique. Parsing
      // défensif : un `as String` sur null ferait échouer TOUTE la liste.
      patientId: _lire<String>(json, 'patient_id') ?? '',
      medecinId: _lire<String>(json, 'medecin_id') ?? '',
      structureId: _lire<String>(json, 'structure_id'),
      typeRdv: TypeRdv.fromApi(_lire<String>(json, 'type_rdv')),
      dateCreneau: DateTime.parse(json['date_creneau'] as String),
      statut: StatutRendezVous.fromApi(_lire<String>(json, 'statut')),
      statutBrut: _lire<String>(json, 'statut'),
      motif: _lire<String>(json, 'motif'),
      codeUnique: _lire<String>(json, 'code_unique') ?? '',
      qrTokenSecret: _lire<String>(json, 'qr_token_secret'),
      aReprogrammerLe: _lireDate(json, 'a_reprogrammer_le'),
      nouvelleDateProposee: _lireDate(json, 'nouvelle_date_proposee'),
      proposeePar: PartieRendezVous.fromApi(_lire<String>(json, 'proposee_par')),
      dateProposition: _lireDate(json, 'date_proposition'),
      termineLe: _lireDate(json, 'termine_le'),
      liberationPrevueLe: _lireDate(json, 'liberation_prevue_le'),
      medecin: json['medecin'] is Map<String, dynamic>
          ? MedecinRdvRef.fromJson(json['medecin'] as Map<String, dynamic>)
          : null,
      patient: json['patient'] is Map<String, dynamic>
          ? PatientRdvRef.fromJson(json['patient'] as Map<String, dynamic>)
          : null,
      nonPaye: json['non_paye'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'rdv_id': rdvId,
    'patient_id': patientId,
    'medecin_id': medecinId,
    'structure_id': structureId,
    'type_rdv': typeRdv.toApi(),
    'date_creneau': dateCreneau.toIso8601String(),
    'statut': statutBrut ?? statut.toApi(),
    'motif': motif,
    'code_unique': codeUnique,
    if (qrTokenSecret != null) 'qr_token_secret': qrTokenSecret,
    if (aReprogrammerLe != null)
      'a_reprogrammer_le': aReprogrammerLe!.toIso8601String(),
    if (nouvelleDateProposee != null)
      'nouvelle_date_proposee': nouvelleDateProposee!.toIso8601String(),
    if (proposeePar != null) 'proposee_par': proposeePar!.toApi(),
    if (dateProposition != null)
      'date_proposition': dateProposition!.toIso8601String(),
    if (termineLe != null) 'termine_le': termineLe!.toIso8601String(),
    if (liberationPrevueLe != null)
      'liberation_prevue_le': liberationPrevueLe!.toIso8601String(),
    if (medecin != null) 'medecin': medecin!.toJson(),
    if (patient != null) 'patient': patient!.toJson(),
    if (nonPaye) 'non_paye': true,
  };

  RendezVous copyWith({
    String? rdvId,
    String? patientId,
    String? medecinId,
    String? structureId,
    TypeRdv? typeRdv,
    DateTime? dateCreneau,
    StatutRendezVous? statut,
    String? statutBrut,
    String? motif,
    String? codeUnique,
    String? qrTokenSecret,
    DateTime? aReprogrammerLe,
    DateTime? nouvelleDateProposee,
    PartieRendezVous? proposeePar,
    DateTime? dateProposition,
    DateTime? termineLe,
    DateTime? liberationPrevueLe,
    MedecinRdvRef? medecin,
    PatientRdvRef? patient,
    bool? nonPaye,
  }) {
    return RendezVous(
      rdvId: rdvId ?? this.rdvId,
      patientId: patientId ?? this.patientId,
      medecinId: medecinId ?? this.medecinId,
      structureId: structureId ?? this.structureId,
      typeRdv: typeRdv ?? this.typeRdv,
      dateCreneau: dateCreneau ?? this.dateCreneau,
      statut: statut ?? this.statut,
      // Un statut explicitement remplacé invalide la valeur brute reçue.
      statutBrut: statutBrut ?? (statut != null ? null : this.statutBrut),
      motif: motif ?? this.motif,
      codeUnique: codeUnique ?? this.codeUnique,
      qrTokenSecret: qrTokenSecret ?? this.qrTokenSecret,
      aReprogrammerLe: aReprogrammerLe ?? this.aReprogrammerLe,
      nouvelleDateProposee: nouvelleDateProposee ?? this.nouvelleDateProposee,
      proposeePar: proposeePar ?? this.proposeePar,
      dateProposition: dateProposition ?? this.dateProposition,
      termineLe: termineLe ?? this.termineLe,
      liberationPrevueLe: liberationPrevueLe ?? this.liberationPrevueLe,
      medecin: medecin ?? this.medecin,
      patient: patient ?? this.patient,
      nonPaye: nonPaye ?? this.nonPaye,
    );
  }

  @override
  String toString() =>
      'RendezVous($rdvId, ${statutBrut ?? statut.name}, $dateCreneau)';

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

  /// Motif d'annulation — OBLIGATOIRE quand [statut] vaut
  /// [StatutRendezVous.annule] : depuis la Phase 3 le backend refuse
  /// (400) toute annulation sans `motif_annulation`, car c'est lui qui
  /// pilote le remboursement (voir annulerRendezVous côté serveur).
  final MotifAnnulation? motifAnnulation;

  /// Commentaire libre facultatif (1000 caractères maximum côté serveur).
  final String? commentaireAnnulation;

  const ChangerStatutRendezVousPayload({
    required this.statut,
    this.motifAnnulation,
    this.commentaireAnnulation,
  }) : assert(
          statut != StatutRendezVous.annule || motifAnnulation != null,
          'Un motif est obligatoire pour annuler un rendez-vous.',
        );

  Map<String, dynamic> toJson() {
    final commentaire = commentaireAnnulation?.trim();
    return {
      'statut': statut.toApi(),
      if (statut == StatutRendezVous.annule && motifAnnulation != null) ...{
        'motif_annulation': motifAnnulation!.toApi(),
        if (commentaire != null && commentaire.isNotEmpty)
          'commentaire_annulation': commentaire,
      },
    };
  }
}

/// Miroir de l'enum Prisma `MotifAnnulation` (liste fermée, voir
/// MOTIFS_ANNULATION dans rendezVous.controller.js). Les valeurs API
/// doivent rester strictement identiques à celles du serveur.
enum MotifAnnulation {
  changementHorairePatient('changement_horaire_patient', 'Changement d\'horaire'),
  urgencePersonnelle('urgence_personnelle', 'Urgence personnelle'),
  erreurReservation('erreur_reservation', 'Erreur de réservation'),
  professionnelIndisponible(
    'professionnel_indisponible',
    'Professionnel indisponible',
  ),
  autre('autre', 'Autre motif');

  const MotifAnnulation(this.valeurApi, this.libelle);

  /// Valeur envoyée à l'API (`motif_annulation`).
  final String valeurApi;

  /// Libellé affiché à l'utilisateur.
  final String libelle;

  String toApi() => valeurApi;

  /// Motifs proposés à un patient qui annule son rendez-vous.
  static const List<MotifAnnulation> pourPatient = [
    changementHorairePatient,
    urgencePersonnelle,
    erreurReservation,
    autre,
  ];

  /// Motifs proposés à un médecin qui refuse / annule un rendez-vous.
  static const List<MotifAnnulation> pourMedecin = [
    professionnelIndisponible,
    autre,
  ];
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

/// ─────────────────────────────────────────────────────────────────
/// Politique de fonds v2 — résultats et données financières
/// ─────────────────────────────────────────────────────────────────
/// Principe : le front affiche, le serveur décide. Aucun de ces modèles
/// ne calcule de montant ; ils relaient ce que renvoient
/// rendezVous.controller.js, paiement.controller.js,
/// notification.controller.js et portefeuille.controller.js.

/// Remboursement renvoyé à l'annulation (`remboursement` de
/// PATCH /rendez-vous/:id/statut, voir traitementFonds.service.js).
///
/// [statut] vaut `a_traiter` pour un paiement Mobile Money : le
/// remboursement est traité manuellement, [montant] est alors le brut
/// et [montantEstimeNet] l'estimation après frais de retrait.
class RemboursementAnnulation {
  final double montant;
  final double? montantEstimeNet;
  final String devise;
  final String? motif;
  final String statut;

  const RemboursementAnnulation({
    required this.montant,
    this.montantEstimeNet,
    required this.devise,
    this.motif,
    required this.statut,
  });

  /// Remboursement Mobile Money traité manuellement par l'équipe APS.
  bool get estATraiter => statut == 'a_traiter';

  factory RemboursementAnnulation.fromJson(Map<String, dynamic> json) {
    return RemboursementAnnulation(
      montant: lireNombre(json['montant']) ?? 0,
      montantEstimeNet: lireNombre(json['montant_estime_net']),
      devise: _lire<String>(json, 'devise') ?? 'xaf',
      motif: _lire<String>(json, 'motif'),
      statut: _lire<String>(json, 'statut') ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
    'montant': montant,
    if (montantEstimeNet != null) 'montant_estime_net': montantEstimeNet,
    'devise': devise,
    if (motif != null) 'motif': motif,
    'statut': statut,
  };
}

/// Parse un rendez-vous imbriqué sans jamais faire échouer la réponse
/// qui le porte : un RDV illisible ne doit pas faire perdre le résultat
/// financier d'une annulation déjà effectuée côté serveur.
RendezVous? _rendezVousTolerant(Object? brut) {
  if (brut is! Map<String, dynamic>) return null;
  try {
    return RendezVous.fromJson(brut);
  } catch (_) {
    return null;
  }
}

/// Réponse complète de PATCH /rendez-vous/:id/statut à l'annulation,
/// FILTRÉE PAR RÔLE par le serveur (D7) : tout champ absent vaut `null` /
/// `false` et ne doit jamais être déduit.
///   - [remboursement]    : `null` si rien à rembourser (jamais payé…) ;
///   - [versementMedecin] : H − CM libérés au médecin (annulation patient
///                          < 24 h), avant amendes (médecin, admin) ;
///   - [commissionMedecin]: commission médecin (CM) conservée par APS
///                          (médecin, admin ; jamais le patient) ;
///   - [commissionAps]    : alias déprécié de [commissionMedecin] ;
///   - [commissionPatient]: commission patient (CP) conservée ou rendue
///                          (patient, admin ; jamais le médecin) ;
///   - [commissionPatientRendue] : CP rendue au patient (médecin fautif) ;
///   - [medecinFautif]    : l'annulation vient d'une faute du médecin
///                          (réponse patient) ;
///   - [amende]           : une amende a été enregistrée au médecin.
class ResultatAnnulation {
  final String? message;
  final RendezVous? rendezVous;
  final bool tardif;
  final RemboursementAnnulation? remboursement;
  final double? versementMedecin;
  final double? commissionMedecin;
  final double? commissionAps;
  final double? commissionPatient;
  final double? commissionPatientRendue;
  final bool medecinFautif;
  final bool amende;

  const ResultatAnnulation({
    this.message,
    this.rendezVous,
    this.tardif = false,
    this.remboursement,
    this.versementMedecin,
    this.commissionMedecin,
    this.commissionAps,
    this.commissionPatient,
    this.commissionPatientRendue,
    this.medecinFautif = false,
    this.amende = false,
  });

  factory ResultatAnnulation.fromJson(Map<String, dynamic> json) {
    return ResultatAnnulation(
      message: _lire<String>(json, 'message'),
      rendezVous: _rendezVousTolerant(json['rendez_vous']),
      tardif: json['tardif'] == true,
      remboursement: json['remboursement'] is Map<String, dynamic>
          ? RemboursementAnnulation.fromJson(
              json['remboursement'] as Map<String, dynamic>,
            )
          : null,
      versementMedecin: lireNombre(json['versement_medecin']),
      commissionMedecin: lireNombre(
        json['commission_medecin'] ?? json['commission_aps'],
      ),
      commissionAps: lireNombre(json['commission_aps']),
      commissionPatient: lireNombre(json['commission_patient']),
      commissionPatientRendue: lireNombre(json['commission_patient_rendue']),
      medecinFautif: json['medecin_fautif'] == true,
      amende: json['amende'] == true,
    );
  }
}

/// Réponse de POST /rendez-vous/:id/reprogrammation/proposer et /accepter :
/// `{ message, rendez_vous, echeance_reprogrammation? }`.
///   - [rendezVous] : RDV mis à jour, SANS `qr_token_secret` (retiré par le
///     serveur), parsé de façon tolérante : une proposition déjà enregistrée
///     ne doit jamais apparaître comme un échec à cause d'un champ illisible ;
///   - [echeance]   : échéance de la reprogrammation (proposer uniquement),
///     le délai de 48 h n'étant jamais prolongé.
class ResultatReprogrammation {
  final String? message;
  final RendezVous? rendezVous;
  final DateTime? echeance;

  const ResultatReprogrammation({this.message, this.rendezVous, this.echeance});

  factory ResultatReprogrammation.fromJson(Map<String, dynamic> json) {
    return ResultatReprogrammation(
      message: _lire<String>(json, 'message'),
      rendezVous: _rendezVousTolerant(json['rendez_vous']),
      echeance: _lireDate(json, 'echeance_reprogrammation'),
    );
  }
}

/// Réponse de POST /rendez-vous/:id/terminer :
/// `{ message, rendez_vous, liberation_prevue_le }`.
///   - [rendezVous]         : RDV passé `honore`, SANS `code_unique` (le
///                            médecin ne le reçoit jamais), parsé de façon
///                            tolérante : une consultation déjà terminée côté
///                            serveur ne doit jamais apparaître comme un échec
///                            à cause d'un champ illisible ;
///   - [liberationPrevueLe] : date de libération des fonds (`termine_le` + T,
///                            T étant figé par le serveur à la validation).
class ResultatTerminaison {
  final String? message;
  final RendezVous? rendezVous;
  final DateTime? liberationPrevueLe;

  const ResultatTerminaison({
    this.message,
    this.rendezVous,
    this.liberationPrevueLe,
  });

  factory ResultatTerminaison.fromJson(Map<String, dynamic> json) {
    final rdv = _rendezVousTolerant(json['rendez_vous']);
    return ResultatTerminaison(
      message: _lire<String>(json, 'message'),
      rendezVous: rdv,
      liberationPrevueLe:
          _lireDate(json, 'liberation_prevue_le') ?? rdv?.liberationPrevueLe,
    );
  }
}

/// Devis avant paiement — GET /paiement/rendez-vous/:id/devis
/// ?agregateur=stripe|campay.
/// `total = honoraires + frais d'envoi + commission APS patient (CP)`.
/// La commission médecin (CM) n'est jamais exposée au patient (D7).
/// [remboursementIndicatif] vaut `true` pour CamPay : le remboursement
/// estimé n'est qu'une indication (Mobile Money, traitement manuel).
/// Réponses d'erreur : 400 (agrégateur invalide), 409 (rendez-vous non
/// payable ou déjà payé), 503 (barème absent — le message serveur est à
/// afficher tel quel).
class DevisPaiement {
  final String agregateur;
  final String devise;
  final double honoraires;
  final double fraisEnvoi;

  /// Commission APS patient (CP). 0 si le serveur ne la renvoie pas
  /// (lecture défensive) ou si le taux du pays est nul.
  final double commissionPatient;
  final double total;
  final double remboursementEstime;
  final bool remboursementIndicatif;

  const DevisPaiement({
    required this.agregateur,
    required this.devise,
    required this.honoraires,
    required this.fraisEnvoi,
    this.commissionPatient = 0,
    required this.total,
    required this.remboursementEstime,
    required this.remboursementIndicatif,
  });

  factory DevisPaiement.fromJson(Map<String, dynamic> json) {
    return DevisPaiement(
      agregateur: _lire<String>(json, 'agregateur') ?? '',
      devise: _lire<String>(json, 'devise') ?? 'xaf',
      honoraires: lireNombre(json['honoraires']) ?? 0,
      fraisEnvoi: lireNombre(json['frais_envoi']) ?? 0,
      commissionPatient: lireNombre(json['commission_patient']) ?? 0,
      total: lireNombre(json['total']) ?? 0,
      remboursementEstime: lireNombre(json['remboursement_estime']) ?? 0,
      remboursementIndicatif: json['remboursement_indicatif'] == true,
    );
  }
}

/// Types de notification in-app — miroir de l'enum Prisma
/// `TypeNotification`. [inconnu] : type ajouté côté serveur mais pas
/// encore connu de l'application (affiché avec une icône neutre).
enum TypeNotification {
  rdvAReprogrammer('rdv_a_reprogrammer'),
  rdvReprogrammationProposee('rdv_reprogrammation_proposee'),
  rdvReprogrammationAcceptee('rdv_reprogrammation_acceptee'),
  inconnu('');

  const TypeNotification(this.valeurApi);

  final String valeurApi;

  static TypeNotification fromApi(String? valeur) {
    for (final t in TypeNotification.values) {
      if (t != TypeNotification.inconnu && t.valeurApi == valeur) return t;
    }
    return TypeNotification.inconnu;
  }
}

/// Notification in-app — élément de `notifications` de
/// GET /notifications (`?non_lues=true&limit=`, la valeur doit valoir
/// exactement « true »). [lueLe] `null` = non lue.
class NotificationApp {
  final String notificationId;
  final TypeNotification type;
  final String? rdvId;
  final String titre;
  final String message;
  final Map<String, dynamic>? donnees;
  final DateTime? lueLe;
  final DateTime? dateCreation;

  const NotificationApp({
    required this.notificationId,
    required this.type,
    this.rdvId,
    required this.titre,
    required this.message,
    this.donnees,
    this.lueLe,
    this.dateCreation,
  });

  bool get estLue => lueLe != null;

  factory NotificationApp.fromJson(Map<String, dynamic> json) {
    return NotificationApp(
      notificationId: json['notification_id'] as String,
      type: TypeNotification.fromApi(_lire<String>(json, 'type')),
      rdvId: _lire<String>(json, 'rdv_id'),
      titre: _lire<String>(json, 'titre') ?? '',
      message: _lire<String>(json, 'message') ?? '',
      donnees: json['donnees'] is Map<String, dynamic>
          ? json['donnees'] as Map<String, dynamic>
          : null,
      lueLe: _lireDate(json, 'lue_le'),
      dateCreation: _lireDate(json, 'date_creation'),
    );
  }

  NotificationApp copyWith({DateTime? lueLe}) {
    return NotificationApp(
      notificationId: notificationId,
      type: type,
      rdvId: rdvId,
      titre: titre,
      message: message,
      donnees: donnees,
      lueLe: lueLe ?? this.lueLe,
      dateCreation: dateCreation,
    );
  }
}

/// Réponse de GET /notifications : la liste et le compteur GLOBAL de
/// non lues (le compteur ignore le filtre `non_lues` et la limite).
class ListeNotifications {
  final List<NotificationApp> notifications;
  final int nonLues;

  const ListeNotifications({required this.notifications, required this.nonLues});

  factory ListeNotifications.fromJson(Map<String, dynamic> json) {
    final brut = json['notifications'];
    return ListeNotifications(
      notifications: brut is List
          ? brut
              .whereType<Map<String, dynamic>>()
              .map(NotificationApp.fromJson)
              .toList()
          : const [],
      nonLues: (lireNombre(json['non_lues']) ?? 0).toInt(),
    );
  }
}

/// Mouvement du grand-livre du portefeuille médecin — élément de
/// `mouvements` de GET /medecins/:id/portefeuille (50 maximum).
///
/// Le signe vient du préfixe du [type] (`credit_*` augmente le solde,
/// `debit_*` le diminue) ; [montant] est toujours positif. Les types de
/// l'ancienne politique (`debit_retenue_annulation_tardive`,
/// `debit_frais_no_show`, `credit_frais_annulation`) restent possibles
/// dans l'historique : [type] est donc conservé en chaîne brute.
class MouvementPortefeuille {
  final String mouvementId;
  final String type;
  final double montant;
  final DateTime? dateCreation;
  final String? rdvId;

  const MouvementPortefeuille({
    required this.mouvementId,
    required this.type,
    required this.montant,
    this.dateCreation,
    this.rdvId,
  });

  bool get estCredit => type.startsWith('credit_');
  bool get estDebit => type.startsWith('debit_');

  /// Montant signé pour l'affichage (+ crédit, − débit).
  double get montantSigne => estDebit ? -montant : montant;

  factory MouvementPortefeuille.fromJson(Map<String, dynamic> json) {
    return MouvementPortefeuille(
      mouvementId: _lire<String>(json, 'mouvement_id') ?? '',
      type: _lire<String>(json, 'type') ?? '',
      // Decimal Prisma : chaîne dans le JSON.
      montant: lireNombre(json['montant']) ?? 0,
      dateCreation: _lireDate(json, 'date_creation'),
      rdvId: _lire<String>(json, 'rdv_id'),
    );
  }
}

/// Amende en attente d'imputation — élément de `amendes_en_attente` de
/// GET /medecins/:id/portefeuille. Elle n'a pas de montant : il se
/// calcule à la prochaine libération de fonds, seul le taux retenu
/// ([tauxApplique], fraction : 0.15 = 15 %) est exposé.
class AmendeEnAttente {
  final String amendeId;
  final String? rdvId;
  final double tauxApplique;
  final String statut;
  final DateTime? dateCreation;

  const AmendeEnAttente({
    required this.amendeId,
    this.rdvId,
    required this.tauxApplique,
    required this.statut,
    this.dateCreation,
  });

  factory AmendeEnAttente.fromJson(Map<String, dynamic> json) {
    return AmendeEnAttente(
      amendeId: _lire<String>(json, 'amende_id') ?? '',
      rdvId: _lire<String>(json, 'rdv_id'),
      tauxApplique: lireNombre(json['taux_applique']) ?? 0,
      statut: _lire<String>(json, 'statut') ?? 'en_attente',
      dateCreation: _lireDate(json, 'date_creation'),
    );
  }
}

/// Réponse de GET /medecins/:id/portefeuille : `{ solde, mouvements,
/// amendes_en_attente }`. Le solde est recalculé par le serveur.
class PortefeuilleMedecin {
  final double solde;
  final List<MouvementPortefeuille> mouvements;
  final List<AmendeEnAttente> amendesEnAttente;

  const PortefeuilleMedecin({
    required this.solde,
    required this.mouvements,
    required this.amendesEnAttente,
  });

  factory PortefeuilleMedecin.fromJson(Map<String, dynamic> json) {
    List<T> liste<T>(Object? brut, T Function(Map<String, dynamic>) f) =>
        brut is List ? brut.whereType<Map<String, dynamic>>().map(f).toList() : <T>[];

    return PortefeuilleMedecin(
      solde: lireNombre(json['solde']) ?? 0,
      mouvements: liste(json['mouvements'], MouvementPortefeuille.fromJson),
      amendesEnAttente: liste(json['amendes_en_attente'], AmendeEnAttente.fromJson),
    );
  }
}