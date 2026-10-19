// lib/controllers/offre_rdv_controller.dart
//
// RDV aléatoire (RDV sur offre) — état Riverpod des écrans « Demande »
// (patient) et « Demandes » (médecin). Les lectures passent par
// `appelAuthentifie` (rafraîchissement du token si expiré) ; les écrans
// invalident ces providers après chaque action.

import 'package:riverpod/riverpod.dart';

import '../models/offre_rdv_models.dart';
import '../repositories/offre_rdv_repository.dart';
import 'authentification_controller.dart';

final offreRdvRepositoryProvider = Provider<OffreRdvRepository>((ref) => OffreRdvRepository());

/// Offres du patient connecté (avec les médecins qui ont répondu).
final mesOffresRdvProvider = FutureProvider.autoDispose<List<OffreRdv>>((ref) {
  // Relance si la session change (connexion, déconnexion).
  ref.watch(authTokenProvider);
  final repo = ref.read(offreRdvRepositoryProvider);
  return ref
      .read(sessionControllerProvider.notifier)
      .appelAuthentifie((token) => repo.listerMesOffres(token: token));
});

/// Offres vues par le médecin connecté : `false` = demandes ouvertes qui le
/// concernent, `true` = celles auxquelles il a répondu.
final offresRdvMedecinProvider =
    FutureProvider.autoDispose.family<OffresMedecin, bool>((ref, mesReponses) {
  ref.watch(authTokenProvider);
  final repo = ref.read(offreRdvRepositoryProvider);
  return ref.read(sessionControllerProvider.notifier).appelAuthentifie(
        (token) => repo.listerPourMedecin(token: token, mesReponses: mesReponses),
      );
});
