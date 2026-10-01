// lib/models/agenda_models.dart
//
// Modèles du module transverse « Agenda du médecin » (Horaire /
// CreneauAgenda), en miroir de agenda.controller.js côté backend.
//
// Périmètre volontairement limité à la LECTURE des créneaux, seule chose
// dont l'app mobile a besoin pour la reprogrammation « deux absents »
// (politique de fonds v2, phase 5) : GET /medecins/:medecinId/agenda,
// route PUBLIQUE qui renvoie `{ creneaux }`. Le gabarit récurrent
// (DisponibiliteMedecin) et la gestion de l'agenda par le médecin restent
// hors périmètre.
//
// ⚠️ Convention de dates (identique au web, voir utils/fonds.js) :
// `date` et `horaire.heure_debut` sont des valeurs « épinglées en UTC »,
// lues par découpage de chaîne et JAMAIS converties dans le fuseau local.
// Le serveur compare la date et l'heure UTC de `nouvelle_date` à l'agenda :
// l'ISO envoyé se reconstruit donc avec [creneauVersIso] (utils/fonds.dart).
//
// Le serveur n'expose jamais `rdv_id` sur cette route publique : le statut
// `reserve` suffit à indiquer qu'un créneau n'est plus libre.

import '../utils/fonds.dart';

/// Lit une valeur potentiellement absente/nulle sans lever d'erreur.
T? _lire<T>(Map<String, dynamic> json, String cle) {
  final valeur = json[cle];
  return valeur is T ? valeur : null;
}

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

/// Créneau concret d'un médecin à une date donnée.
class CreneauAgenda {
  final String creneauId;
  final String medecinId;
  final String horaireId;

  /// Date épinglée en UTC, chaîne brute (« 2026-10-12T00:00:00.000Z »).
  final String date;
  final StatutCreneauAgenda statut;
  final String? statutBrut;

  /// `genere` (issu du gabarit) ou `manuel`.
  final String? origine;
  final HoraireAgenda? horaire;

  const CreneauAgenda({
    required this.creneauId,
    required this.medecinId,
    required this.horaireId,
    required this.date,
    required this.statut,
    this.statutBrut,
    this.origine,
    this.horaire,
  });

  bool get estDisponible => statut == StatutCreneauAgenda.disponible;

  /// Vrai si le créneau a bien une heure de début exploitable. Sans elle,
  /// on ne peut pas construire la date à proposer au serveur.
  bool get estExploitable => horaire != null && horaire!.heureDebut.isNotEmpty;

  /// ISO 8601 envoyé comme `nouvelle_date` : `AAAA-MM-JJTHH:mm:00.000Z`.
  /// À n'appeler que si [estExploitable].
  String get iso => creneauVersIso(date, horaire?.heureDebut ?? '');

  /// Instant UTC du créneau (pour filtrer les créneaux passés).
  /// `null` si la date est illisible.
  DateTime? get instantUtc => DateTime.tryParse(iso);

  /// Jour lisible, « lundi 12 octobre ».
  String get libelleJour => libelleJourCreneau(date);

  /// Heure lisible, « 09:30 ».
  String get libelleHeure => libelleHeureCreneau(horaire?.heureDebut ?? '');

  /// Clé de regroupement par jour (AAAA-MM-JJ).
  String get cleJour => date.length >= 10 ? date.substring(0, 10) : date;

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
      };

  @override
  String toString() => 'CreneauAgenda($creneauId, $date, ${statutBrut ?? statut.name})';
}

/// Filtres de GET /medecins/:medecinId/agenda. Ne construit que les
/// paires effectivement renseignées (`?date_debut&date_fin&statut`).
class FiltresAgenda {
  /// Bornes incluses. Seule la partie AAAA-MM-JJ (UTC) est envoyée.
  final DateTime? dateDebut;
  final DateTime? dateFin;
  final StatutCreneauAgenda? statut;

  const FiltresAgenda({this.dateDebut, this.dateFin, this.statut});

  static String _jourIso(DateTime d) {
    final u = d.toUtc();
    String deux(int n) => n.toString().padLeft(2, '0');
    return '${u.year.toString().padLeft(4, '0')}-${deux(u.month)}-${deux(u.day)}';
  }

  Map<String, String> toQuery() {
    final statutApi = statut?.toApi();
    return {
      if (dateDebut != null) 'date_debut': _jourIso(dateDebut!),
      if (dateFin != null) 'date_fin': _jourIso(dateFin!),
      if (statutApi != null) 'statut': statutApi,
    };
  }
}
