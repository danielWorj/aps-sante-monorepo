// lib/models/periodes_agenda.dart
//
// Regroupement des tranches du référentiel Horaire en trois périodes de la
// journée (matin, après-midi, soirée) pour l'agenda du médecin : il coche une
// période entière, puis affine heure par heure s'il le souhaite. Purement
// visuel : le serveur ne connaît que des horaire_id. Miroir de
// client-plateform/src/utils/periodesAgenda.js.
//
// Bornes (heure murale de DÉBUT de la tranche) : matin avant 12:00,
// après-midi de 12:00 à 18:00, soirée à partir de 18:00.

import 'package:flutter/material.dart';

import 'agenda_models.dart';

enum EtatPeriode { complet, partiel, vide }

class PeriodeAgenda {
  final String cle;
  final String libelle;
  final IconData icone;

  /// Borne exclusive « HH:mm » de l'heure de début.
  final String avant;

  const PeriodeAgenda(this.cle, this.libelle, this.icone, this.avant);
}

const List<PeriodeAgenda> periodesAgenda = [
  PeriodeAgenda('matin', 'Matin', Icons.wb_sunny_outlined, '12:00'),
  PeriodeAgenda('apres_midi', 'Après-midi', Icons.wb_cloudy_outlined, '18:00'),
  PeriodeAgenda('soiree', 'Soirée', Icons.nightlight_outlined, '24:00'),
];

PeriodeAgenda periodeDeHoraire(HoraireAgenda h) =>
    periodesAgenda.firstWhere((p) => h.libelleDebut.compareTo(p.avant) < 0, orElse: () => periodesAgenda.last);

/// Une période et ses tranches du référentiel, triées.
class GroupePeriode {
  final PeriodeAgenda periode;
  final List<HoraireAgenda> horaires;

  const GroupePeriode(this.periode, this.horaires);

  /// « 08:00 – 12:00 ».
  String get plage => '${horaires.first.libelleDebut} – ${horaires.last.libelleFin}';

  Iterable<String> get ids => horaires.map((h) => h.horaireId);

  EtatPeriode etat(Set<String> selection) {
    final n = horaires.where((h) => selection.contains(h.horaireId)).length;
    if (n == 0) return EtatPeriode.vide;
    return n == horaires.length ? EtatPeriode.complet : EtatPeriode.partiel;
  }
}

/// Horaires regroupés par période ; les périodes vides sont omises.
List<GroupePeriode> grouperParPeriode(List<HoraireAgenda> horaires) {
  final tries = [...horaires]..sort((a, b) => a.libelleDebut.compareTo(b.libelleDebut));
  return [
    for (final p in periodesAgenda)
      GroupePeriode(p, tries.where((h) => periodeDeHoraire(h).cle == p.cle).toList()),
  ].where((g) => g.horaires.isNotEmpty).toList();
}

/// Résumé court d'une journée : « Matin · Après-midi (partiel) » ou « Fermé ».
String resumeJournee(List<GroupePeriode> groupes, Set<String> selection) {
  final parties = [
    for (final g in groupes)
      if (g.etat(selection) == EtatPeriode.complet)
        g.periode.libelle
      else if (g.etat(selection) == EtatPeriode.partiel)
        '${g.periode.libelle} (partiel)',
  ];
  return parties.isEmpty ? 'Fermé' : parties.join(' · ');
}
