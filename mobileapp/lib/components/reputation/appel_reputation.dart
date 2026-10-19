// lib/components/reputation/appel_reputation.dart
//
// Appel authentifié depuis un écran (WidgetRef) : renouvellement du token
// sur 401 via SessionController, comme dans le portail assurance.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../controllers/authentification_controller.dart';
import '../../controllers/reputation_medecin_controller.dart';
import '../../repositories/reputation_medecin_repository.dart';

Future<T> appelReputationEcran<T>(
  WidgetRef ref,
  Future<T> Function(ReputationMedecinRepository repo, String token) appel,
) {
  final repo = ref.read(reputationMedecinRepositoryProvider);
  return ref.read(sessionControllerProvider.notifier).appelAuthentifie((token) => appel(repo, token));
}
