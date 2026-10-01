// lib/controllers/agenda_controller.dart
//
// Gestion d'état (Riverpod) de la lecture de l'agenda d'un médecin, pour
// la reprogrammation « deux absents » (politique de fonds v2, phase 5).
//
// Ne parle jamais HTTP directement : s'appuie sur [AgendaRepository]. La
// route est publique, aucun token n'intervient ici.
//
// La proposition / l'acceptation de reprogrammation, elles, passent par
// [ActionsRendezVousController] (rendez_vous_controller.dart).

import 'package:riverpod/riverpod.dart';

import '../models/agenda_models.dart';
import '../repositories/agenda_repository.dart';

/// Horizon de recherche des créneaux libres proposés (en jours), comme sur
/// le web (reprogrammation-panel.jsx).
const int horizonCreneauxLibresJours = 30;

final agendaRepositoryProvider = Provider<AgendaRepository>((ref) {
  return AgendaRepository();
});

/// Créneaux LIBRES et FUTURS d'un médecin sur les
/// [horizonCreneauxLibresJours] prochains jours, triés par date puis heure.
///
/// Le filtre `statut=disponible` ne suffit pas : on retire aussi les
/// créneaux déjà passés (comparaison en UTC, selon la convention
/// « épinglé en UTC » de l'agenda). Le serveur reste seul juge à l'envoi de
/// la proposition (créneau pris, hors agenda…).
///
/// `retry` désactivé : en cas d'échec réseau, l'utilisateur relance
/// lui-même via `ref.invalidate(...)` plutôt que d'attendre des
/// tentatives automatiques en boucle.
final creneauxLibresProvider = FutureProvider.autoDispose
    .family<List<CreneauAgenda>, String>(
  (ref, medecinId) async {
    final maintenant = DateTime.now().toUtc();
    final fin = maintenant.add(const Duration(days: horizonCreneauxLibresJours));

    final creneaux = await ref.read(agendaRepositoryProvider).listerCreneaux(
          medecinId,
          filtres: FiltresAgenda(
            dateDebut: maintenant,
            dateFin: fin,
            statut: StatutCreneauAgenda.disponible,
          ),
        );

    final futurs = <CreneauAgenda>[];
    for (final c in creneaux) {
      if (!c.estDisponible) continue;
      final instant = c.instantUtc;
      if (instant == null || !instant.isAfter(maintenant)) continue;
      futurs.add(c);
    }
    futurs.sort((a, b) => a.instantUtc!.compareTo(b.instantUtc!));
    return futurs;
  },
  retry: (_, __) => null,
);
