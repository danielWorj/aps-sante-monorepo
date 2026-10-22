// lib/controllers/laboratoire_controller.dart
//
// État Riverpod du module « Laboratoires d'analyses » : annuaire public
// (filtres envoyés au serveur), fiche détaillée, portail du gérant. Les
// lectures du portail passent par `appelAuthentifie` (renouvellement du
// jeton sur 401) ; les écrans invalident ces providers après chaque action.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod/legacy.dart';

import '../models/laboratoire_models.dart';
import '../repositories/laboratoire_repository.dart';
import 'authentification_controller.dart';

final laboratoireRepositoryProvider = Provider<LaboratoireRepository>((ref) => LaboratoireRepository());

/// Appel authentifié (portail, dépôt d'avis, création).
Future<T> appelLaboratoire<T>(Ref ref, Future<T> Function(LaboratoireRepository repo, String token) appel) {
  final repo = ref.read(laboratoireRepositoryProvider);
  return ref.read(sessionControllerProvider.notifier).appelAuthentifie((token) => appel(repo, token));
}

/// Même raccourci depuis un widget.
Future<T> appelLaboratoireUi<T>(WidgetRef ref, Future<T> Function(LaboratoireRepository repo, String token) appel) {
  final repo = ref.read(laboratoireRepositoryProvider);
  return ref.read(sessionControllerProvider.notifier).appelAuthentifie((token) => appel(repo, token));
}

/* ---------------------------- Annuaire ---------------------------- */

final filtresLaboratoiresProvider = StateProvider<FiltresLaboratoires>((ref) => const FiltresLaboratoires());

final laboratoiresProvider = FutureProvider.autoDispose<List<Laboratoire>>((ref) {
  final filtres = ref.watch(filtresLaboratoiresProvider);
  return ref.read(laboratoireRepositoryProvider).lister(filtres: filtres);
});

/* ---------------------------- Fiche publique ---------------------------- */

/// Fiche + examens + centres + médias en une fois (jeton facultatif).
typedef DetailLaboratoire = ({
  Laboratoire laboratoire,
  List<ExamenLaboratoire> examens,
  List<String> categories,
  List<CentreLaboratoire> centres,
  List<MediaLaboratoire> medias,
});

final detailLaboratoireProvider = FutureProvider.autoDispose.family<DetailLaboratoire, String>((ref, id) async {
  final repo = ref.read(laboratoireRepositoryProvider);
  final token = ref.read(authTokenProvider);
  final resultats = await Future.wait([
    repo.obtenir(id, token: token),
    repo.examens(id, token: token),
    repo.centres(id, token: token),
    repo.mediasPublics(id).catchError((_) => <MediaLaboratoire>[]),
  ]);
  final ex = resultats[1] as ({List<ExamenLaboratoire> examens, List<String> categories});
  return (
    laboratoire: resultats[0] as Laboratoire,
    examens: ex.examens,
    categories: ex.categories,
    centres: resultats[2] as List<CentreLaboratoire>,
    medias: resultats[3] as List<MediaLaboratoire>,
  );
});

final avisLaboratoireProvider = FutureProvider.autoDispose.family<PageAvisLaboratoire, ({String id, int page})>((ref, cle) {
  return ref.read(laboratoireRepositoryProvider).avis(cle.id, token: ref.read(authTokenProvider), page: cle.page);
});

/* ---------------------------- Portail ---------------------------- */

/// Laboratoire géré par le compte connecté (404 : aucun rattachement).
final monLaboratoireProvider = FutureProvider<Laboratoire>((ref) {
  ref.watch(authUtilisateurProvider.select((u) => u?.utilisateurId));
  return appelLaboratoire(ref, (repo, token) => repo.monLaboratoire(token: token));
});

final tableauDeBordLaboratoireProvider = FutureProvider.autoDispose.family<TableauDeBordLaboratoire, int>((ref, jours) async {
  final labo = await ref.watch(monLaboratoireProvider.future);
  return appelLaboratoire(ref, (repo, token) => repo.tableauDeBord(labo.id, token: token, jours: jours));
});

final gestionLaboratoireProvider = FutureProvider.autoDispose<GestionLaboratoire>((ref) async {
  final labo = await ref.watch(monLaboratoireProvider.future);
  return appelLaboratoire(ref, (repo, token) => repo.gestion(labo.id, token: token));
});

final mediasLaboratoireProvider = FutureProvider.autoDispose<MediasLaboratoireGestion>((ref) async {
  final labo = await ref.watch(monLaboratoireProvider.future);
  return appelLaboratoire(ref, (repo, token) => repo.mediasGestion(labo.id, token: token));
});
