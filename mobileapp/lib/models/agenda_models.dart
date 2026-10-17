// lib/models/agenda_models.dart
//
// Modèles du module transverse « Agenda du médecin » (Horaire /
// DisponibiliteMedecin / CreneauAgenda), en miroir de agenda.controller.js
// côté backend.
//
// Usages :
//   - patient : grille des créneaux LIBRES d'un médecin pour prendre
//     rendez-vous (GET /medecins/:id/agenda?libres=true) — un créneau déjà
//     demandé par un autre patient (en attente de paiement) ou confirmé n'y
//     figure pas ;
//   - reprogrammation « deux absents » : proposer un créneau libre ;
//   - médecin : déclarer ses horaires de la semaine (gabarit,
//     DisponibiliteMedecin) et fermer / rouvrir un créneau précis.
//
// ⚠️ Convention de dates :
//   - `date` et `horaire.heure_debut` sont des HEURES MURALES du médecin,
//     « épinglées en UTC » et lues par découpage de chaîne ;
//   - `debut` / `fin` sont les instants RÉELS du créneau (ISO), calculés par
//     le serveur dans le fuseau du pays d'exercice du médecin. Ce sont eux
//     qu'on affiche (fuseau de l'appareil) et qu'on envoie comme date
//     (`nouvelle_date`). Repli sur la reconstruction UTC si une ancienne
//     réponse ne les porte pas.
//
// Le serveur n'expose jamais `rdv_id` sur cette route publique : le statut
// `reserve` suffit à indiquer qu'un créneau n'est plus libre.

import '../utils/fonds.dart';

/// Lit une valeur potentiellement absente/nulle sans lever d'erreur.
T? _lire<T>(Map<String, dynamic> json, String cle) {
  final valeur = json[cle];
  return valeur is T ? valeur : null;
}

/// Jours de la semaine (enum Prisma `JourSemaine`), dans l'ordre d'affichage.
const List<({String valeur, String libelle, String court})> joursSemaineAgenda = [
  (valeur: 'lundi', libelle: 'Lundi', court: 'LUN'),
  (valeur: 'mardi', libelle: 'Mardi', court: 'MAR'),
  (valeur: 'mercredi', libelle: 'Mercredi', court: 'MER'),
  (valeur: 'jeudi', libelle: 'Jeudi', court: 'JEU'),
  (valeur: 'vendredi', libelle: 'Vendredi', court: 'VEN'),
  (valeur: 'samedi', libelle: 'Samedi', court: 'SAM'),
  (valeur: 'dimanche', libelle: 'Dimanche', court: 'DIM'),
];

/// Jours ouvrés (copie rapide des horaires du lundi au vendredi).
const List<String> joursOuvresAgenda = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];

/// Miroir de l'enum Prisma `StatutCreneauAgenda`. [inconnu] conserve la
/// valeur brute du serveur dans [CreneauAgenda.statutBrut] : un statut
/// ajouté plus tard côté backend ne doit jamais faire planter l'écran.
enum StatutCreneauAgenda {
  disponible,
  reserve,
  bloque,
  inconnu;

  static StatutCreneauAgenda fromApi(String? valeur) {
    switch (valeur) {
      case 'disponible':
        return StatutCreneauAgenda.disponible;
      case 'reserve':
        return StatutCreneauAgenda.reserve;
      case 'bloque':
        return StatutCreneauAgenda.bloque;
      default:
        return StatutCreneauAgenda.inconnu;
    }
  }

  /// Valeur envoyée en filtre `?statut=` (jamais pour [inconnu]).
  String? toApi() => this == StatutCreneauAgenda.inconnu ? null : name;
}

/// Tranche horaire du référentiel partagé (ex. 09:00 – 09:30).
/// [heureDebut] / [heureFin] restent des chaînes brutes : voir la
/// convention de dates en en-tête.
class HoraireAgenda {
  final String horaireId;
  final String heureDebut;
  final String heureFin;

  const HoraireAgenda({
    required this.horaireId,
    required this.heureDebut,
    required this.heureFin,
  });

  /// « 09:00 » — heure murale déclarée par le médecin.
  String get libelleDebut => libelleHeureCreneau(heureDebut);

  /// « 09:30 ».
  String get libelleFin => libelleHeureCreneau(heureFin);

  factory HoraireAgenda.fromJson(Map<String, dynamic> json) {
    return HoraireAgenda(
      horaireId: _lire<String>(json, 'horaire_id') ?? '',
      heureDebut: _lire<String>(json, 'heure_debut') ?? '',
      heureFin: _lire<String>(json, 'heure_fin') ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'horaire_id': horaireId,
        'heure_debut': heureDebut,
        'heure_fin': heureFin,
      };
}

/// Une tranche du gabarit hebdomadaire du médecin : « disponible le
/// [jourSemaine] sur [horaire] ».
class DisponibiliteMedecin {
  final String disponibiliteId;
  final String jourSemaine;
  final String horaireId;
  final HoraireAgenda? horaire;

  const DisponibiliteMedecin({
    required this.disponibiliteId,
    required this.jourSemaine,
    required this.horaireId,
    this.horaire,
  });

  factory DisponibiliteMedecin.fromJson(Map<String, dynamic> json) {
    final horaireBrut = json['horaire'];
    return DisponibiliteMedecin(
      disponibiliteId: _lire<String>(json, 'disponibilite_id') ?? '',
      jourSemaine: _lire<String>(json, 'jour_semaine') ?? '',
      horaireId: _lire<String>(json, 'horaire_id') ?? '',
      horaire: horaireBrut is Map<String, dynamic> ? HoraireAgenda.fromJson(horaireBrut) : null,
    );
  }
}

/// Créneau concret d'un médecin à une date donnée.
class CreneauAgenda {
  final String creneauId;
  final String medecinId;
  final String horaireId;

  /// Date murale épinglée en UTC, chaîne brute (« 2026-10-12T00:00:00.000Z »).
  final String date;
  final StatutCreneauAgenda statut;
  final String? statutBrut;

  /// `genere` (issu du gabarit) ou `manuel`.
  final String? origine;
  final HoraireAgenda? horaire;

  /// Instants réels de début / fin (ISO), calculés par le serveur.
  final String? debut;
  final String? fin;

  const CreneauAgenda({
    required this.creneauId,
    required this.medecinId,
    required this.horaireId,
    required this.date,
    required this.statut,
    this.statutBrut,
    this.origine,
    this.horaire,
    this.debut,
    this.fin,
  });

  bool get estDisponible => statut == StatutCreneauAgenda.disponible;
  bool get estReserve => statut == StatutCreneauAgenda.reserve;
  bool get estBloque => statut == StatutCreneauAgenda.bloque;
  bool get estGenere => origine == 'genere';

  /// Vrai si le créneau a bien une heure de début exploitable. Sans elle,
  /// on ne peut ni l'afficher ni le proposer au serveur.
  bool get estExploitable =>
      (debut != null && debut!.isNotEmpty) || (horaire != null && horaire!.heureDebut.isNotEmpty);

  /// ISO 8601 du début réel du créneau, envoyé comme `nouvelle_date`.
  /// À n'appeler que si [estExploitable].
  String get iso => debut ?? creneauVersIso(date, horaire?.heureDebut ?? '');

  /// Instant UTC du début du créneau. `null` si la date est illisible.
  DateTime? get instantUtc => DateTime.tryParse(iso)?.toUtc();

  /// Jour lisible dans le fuseau de l'appareil, « lundi 12 octobre ».
  String get libelleJour {
    final i = instantUtc;
    return i == null ? libelleJourCreneau(date) : jourLongLocal(i);
  }

  /// Heure lisible dans le fuseau de l'appareil, « 09:30 ».
  String get libelleHeure {
    final i = instantUtc;
    return i == null ? libelleHeureCreneau(horaire?.heureDebut ?? '') : heureLocale(i);
  }

  /// Clé de regroupement par jour local (AAAA-MM-JJ).
  String get cleJour {
    final i = instantUtc;
    if (i != null) return cleJourLocal(i);
    return date.length >= 10 ? date.substring(0, 10) : date;
  }

  /// Clé du jour MURAL du médecin (AAAA-MM-JJ), pour la grille de son agenda.
  String get cleJourMural => date.length >= 10 ? date.substring(0, 10) : date;

  factory CreneauAgenda.fromJson(Map<String, dynamic> json) {
    final brut = _lire<String>(json, 'statut');
    final horaireBrut = json['horaire'];
    return CreneauAgenda(
      creneauId: _lire<String>(json, 'creneau_id') ?? '',
      medecinId: _lire<String>(json, 'medecin_id') ?? '',
      horaireId: _lire<String>(json, 'horaire_id') ?? '',
      date: _lire<String>(json, 'date') ?? '',
      statut: StatutCreneauAgenda.fromApi(brut),
      statutBrut: brut,
      origine: _lire<String>(json, 'origine'),
      horaire: horaireBrut is Map<String, dynamic>
          ? HoraireAgenda.fromJson(horaireBrut)
          : null,
      debut: _lire<String>(json, 'debut'),
      fin: _lire<String>(json, 'fin'),
    );
  }

  Map<String, dynamic> toJson() => {
        'creneau_id': creneauId,
        'medecin_id': medecinId,
        'horaire_id': horaireId,
        'date': date,
        'statut': statutBrut ?? statut.name,
        if (origine != null) 'origine': origine,
        if (horaire != null) 'horaire': horaire!.toJson(),
        if (debut != null) 'debut': debut,
        if (fin != null) 'fin': fin,
      };

  @override
  String toString() => 'CreneauAgenda($creneauId, ${debut ?? date}, ${statutBrut ?? statut.name})';
}

/// Filtres de GET /medecins/:medecinId/agenda. Ne construit que les
/// paires effectivement renseignées (`?date_debut&date_fin&statut&libres`).
class FiltresAgenda {
  /// Bornes incluses, comparées par le serveur à la date MURALE du médecin.
  /// Seule la partie AAAA-MM-JJ (date locale) est envoyée : prévoir un jour
  /// de marge de chaque côté si le fuseau peut différer.
  final DateTime? dateDebut;
  final DateTime? dateFin;
  final StatutCreneauAgenda? statut;

  /// Vrai : uniquement les créneaux réservables (disponibles, sans
  /// rendez-vous, heure non passée).
  final bool libres;

  const FiltresAgenda({this.dateDebut, this.dateFin, this.statut, this.libres = false});

  static String _jourIso(DateTime d) {
    String deux(int n) => n.toString().padLeft(2, '0');
    return '${d.year.toString().padLeft(4, '0')}-${deux(d.month)}-${deux(d.day)}';
  }

  Map<String, String> toQuery() {
    final statutApi = statut?.toApi();
    return {
      if (dateDebut != null) 'date_debut': _jourIso(dateDebut!),
      if (dateFin != null) 'date_fin': _jourIso(dateFin!),
      if (statutApi != null) 'statut': statutApi,
      if (libres) 'libres': 'true',
    };
  }
}
