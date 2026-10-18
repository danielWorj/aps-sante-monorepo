// lib/controllers/annonceur_publicite_controller.dart
//
// Riverpod — publicité v9 côté visiteur et annonceur. Les appels
// authentifiés passent par SessionController.appelAuthentifie (token
// renouvelé et rejoué sur 401), comme le portail assurance.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/annonceur_publicite_models.dart';
import '../repositories/annonceur_publicite_repository.dart';
import 'authentification_controller.dart';

final annonceurPubliciteRepositoryProvider = Provider<AnnonceurPubliciteRepository>(
  (ref) => AnnonceurPubliciteRepository(),
);

/// Appel authentifié au dépôt (token géré par la session).
Future<T> appelAnnonceur<T>(
  WidgetRef ref,
  Future<T> Function(AnnonceurPubliciteRepository repo, String token) appel,
) {
  final repo = ref.read(annonceurPubliciteRepositoryProvider);
  return ref.read(sessionControllerProvider.notifier).appelAuthentifie((token) => appel(repo, token));
}

/// Carrousel d'une page (filtré sur le pays du compte connecté, s'il y en a un).
final sliderPageProvider = FutureProvider.autoDispose.family<SliderPage?, String>((ref, code) {
  final paysId = ref.watch(authUtilisateurProvider)?.paysId;
  return ref.read(annonceurPubliciteRepositoryProvider).sliderPage(code, paysId: paysId);
});

/// Portail annonceur : liste + résumé. Invalider après une action.
final mesPublicitesProvider = FutureProvider.autoDispose<MesPublicites>((ref) {
  final repo = ref.read(annonceurPubliciteRepositoryProvider);
  return ref.read(sessionControllerProvider.notifier).appelAuthentifie((token) => repo.mesPublicites(token: token));
});
