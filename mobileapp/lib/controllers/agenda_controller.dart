// lib/controllers/agenda_controller.dart
//
// Gestion d'état (Riverpod) de la lecture de l'agenda d'un médecin :
//   - [creneauxLibresProvider] : reprogrammation « deux absents » ;
//   - [creneauxReservablesProvider] : grille de prise de rendez-vous.
//
// Ne parle jamais HTTP directement : s'appuie sur [AgendaRepository]. Ces
// routes sont publiques, aucun token n'intervient ici. L'écran agenda du
// médecin (gestion de son gabarit) appelle directement le repository.
//
// La proposition / l'acceptation de reprogrammation, elles, passent par
// [ActionsRendezVousController] (rendez_vous_controller.dart).

import 'package:riverpod/riverpod.dart';

import '../models/agenda_models.dart';
import '../repositories/agenda_repository.dart';

/// Horizon de recherche des créneaux libres proposés pour une
/// reprogrammation (en jours), comme sur le web (reprogrammation-panel.jsx).
const int horizonCreneauxLibresJours = 30;

/// Horizon de la grille de prise de rendez-vous (en jours) : aligné sur
/// l'horizon de publication des créneaux côté serveur (AGENDA_HORIZON_JOURS).
const int horizonCreneauxReservablesJours = 60;

final agendaRepositoryProvider = Provider<AgendaRepository>((ref) {
  return AgendaRepository();
});

/// Créneaux RÉSERVABLES d'un médecin sur [jours] jours : disponibles, sans
/// rendez-vous (ni confirmé, ni en attente de paiement), futurs. Triés par
/// instant de début. Le serveur filtre déjà (`libres=true`) ; on retire en
/// plus ce qui est devenu passé entre-temps.
Future<List<CreneauAgenda>> chargerCreneauxReservables(
  AgendaRepository repository,
  String medecinId, {
  required int jours,
}) async {
  final maintenant = DateTime.now();
  // Un jour de marge de chaque côté : le serveur compare à la date murale
  // du médecin, qui peut différer de la date locale autour de minuit.
  final creneaux = await repository.listerCreneaux(
    medecinId,
    filtres: FiltresAgenda(
      dateDebut: maintenant.subtract(const Duration(days: 1)),
      dateFin: maintenant.add(Duration(days: jours + 1)),
      libres: true,
    ),
  );

  final maintenantUtc = maintenant.toUtc();
  final futurs = <CreneauAgenda>[
    for (final c in creneaux)
      if (c.estDisponible && (c.instantUtc?.isAfter(maintenantUtc) ?? false)) c,
  ];
  futurs.sort((a, b) => a.instantUtc!.compareTo(b.instantUtc!));
  return futurs;
}

/// Créneaux LIBRES et FUTURS d'un médecin sur les
/// [horizonCreneauxLibresJours] prochains jours (reprogrammation).
///
/// `retry` désactivé : en cas d'échec réseau, l'utilisateur relance
/// lui-même via `ref.invalidate(...)` plutôt que d'attendre des
/// tentatives automatiques en boucle.
final creneauxLibresProvider = FutureProvider.autoDispose
    .family<List<CreneauAgenda>, String>(
  (ref, medecinId) => chargerCreneauxReservables(
    ref.read(agendaRepositoryProvider),
    medecinId,
    jours: horizonCreneauxLibresJours,
  ),
  retry: (_, __) => null,
);

/// Créneaux réservables sur [horizonCreneauxReservablesJours] jours (prise
/// de rendez-vous).
final creneauxReservablesProvider = FutureProvider.autoDispose
    .family<List<CreneauAgenda>, String>(
  (ref, medecinId) => chargerCreneauxReservables(
    ref.read(agendaRepositoryProvider),
    medecinId,
    jours: horizonCreneauxReservablesJours,
  ),
  retry: (_, __) => null,
);
