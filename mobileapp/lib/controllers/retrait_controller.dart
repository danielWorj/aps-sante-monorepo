// lib/controllers/retrait_controller.dart
//
// Portefeuille & retraits du médecin connecté. Même patron que
// MonProfilMedecinController (medecin_controller.dart) : AsyncNotifier, `copyWithPrevious`
// pendant un rafraîchissement (l'ancien contenu reste affiché), token fourni par l'appelant.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../repositories/retrait_repository.dart';

final retraitRepositoryProvider = Provider<RetraitRepository>((ref) {
  return RetraitRepository();
});

class RetraitController extends AsyncNotifier<PortefeuilleRetraits?> {
  @override
  PortefeuilleRetraits? build() => null;

  /// Charge (ou recharge) le solde, l'historique et les numéros du médecin.
  Future<void> charger({required String medecinId, required String token}) async {
    state = const AsyncLoading<PortefeuilleRetraits?>().copyWithPrevious(state);
    state = await AsyncValue.guard(
      () => ref
          .read(retraitRepositoryProvider)
          .lister(medecinId: medecinId, token: token),
    );
  }

  /// Crée une demande de retrait puis recharge. Laisse remonter l'[ApiException]
  /// (message serveur lisible : solde insuffisant, demande déjà en cours…) à l'appelant,
  /// SANS toucher à [state] en cas d'échec : le portefeuille affiché reste valide.
  Future<void> demander({
    required String medecinId,
    required String mobileMoneyId,
    required int montant,
    required String token,
  }) async {
    await ref.read(retraitRepositoryProvider).demander(
          medecinId: medecinId,
          mobileMoneyId: mobileMoneyId,
          montant: montant,
          token: token,
        );
    await charger(medecinId: medecinId, token: token);
  }

  void reinitialiser() => state = const AsyncData(null);
}

final retraitControllerProvider =
    AsyncNotifierProvider<RetraitController, PortefeuilleRetraits?>(
  RetraitController.new,
);