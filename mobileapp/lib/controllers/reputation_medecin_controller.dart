// lib/controllers/reputation_medecin_controller.dart
//
// Réputation du médecin — état Riverpod : tableau de bord et avis (espace
// médecin), consultations à noter (patient). Les lectures authentifiées
// passent par `appelAuthentifie` et se relancent quand la session change ;
// les écrans invalident ces providers après chaque action.

import 'package:riverpod/riverpod.dart';

import '../models/reputation_medecin_models.dart';
import '../repositories/reputation_medecin_repository.dart';
import 'authentification_controller.dart';

final reputationMedecinRepositoryProvider =
    Provider<ReputationMedecinRepository>((ref) => ReputationMedecinRepository());

/// Exécute un appel authentifié (raccourci pour les providers et les écrans).
Future<T> appelReputation<T>(Ref ref, Future<T> Function(ReputationMedecinRepository repo, String token) appel) {
  final repo = ref.read(reputationMedecinRepositoryProvider);
  return ref.read(sessionControllerProvider.notifier).appelAuthentifie((token) => appel(repo, token));
}

/// Filtre du tableau de bord : bornes (AAAA-MM-JJ, UTC) et découpage.
typedef FiltreTableauDeBord = ({String du, String au, String granularite});

final tableauDeBordMedecinProvider =
    FutureProvider.autoDispose.family<TableauDeBordMedecin, FiltreTableauDeBord>((ref, f) {
  ref.watch(authUtilisateurProvider.select((u) => u?.utilisateurId));
  return appelReputation(
    ref,
    (repo, token) => repo.tableauDeBord(token: token, du: f.du, au: f.au, granularite: f.granularite),
  );
});

/// Filtre de l'espace avis du médecin.
typedef FiltreMesAvis = ({int? note, String reponse, bool avecCommentaire, String tri, int page});

const filtreMesAvisParDefaut = (note: null, reponse: '', avecCommentaire: false, tri: 'recent', page: 1);

final mesAvisMedecinProvider = FutureProvider.autoDispose.family<PageAvis, FiltreMesAvis>((ref, f) {
  ref.watch(authUtilisateurProvider.select((u) => u?.utilisateurId));
  return appelReputation(
    ref,
    (repo, token) => repo.mesAvis(
      token: token,
      note: f.note,
      reponse: f.reponse,
      avecCommentaire: f.avecCommentaire,
      tri: f.tri,
      page: f.page,
    ),
  );
});

/// Patient : consultations terminées encore à noter (liste vide sans session).
final consultationsANoterProvider = FutureProvider.autoDispose<List<ConsultationANoter>>((ref) async {
  final utilisateur = ref.watch(authUtilisateurProvider);
  if (utilisateur == null) return const [];
  return appelReputation(ref, (repo, token) => repo.consultationsANoter(token: token));
});
