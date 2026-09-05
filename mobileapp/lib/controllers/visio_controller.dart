// lib/controllers/visio_controller.dart
//
// Gestion d'état (Riverpod) du module "Visio" (téléconsultation
// Jitsi), en miroir de visio_repository.dart (voir son en-tête) et de
// visio_models.dart.
//
// Comme [MedecinController] : ce fichier ne parle jamais HTTP
// directement — il s'appuie uniquement sur [VisioRepository], qui
// gère lui-même son client HTTP (package `http`) et ses URLs via
// ApiRealEndpoints (endpoint.dart), sans passer par ApiClient.
//
// Règle du token — même principe que rendez_vous_controller.dart : la
// route POST /visio/token exige déjà "authentifier" côté backend (voir
// visio.controller.js), le token n'est donc jamais optionnel ici. Il
// doit être fourni par l'appelant, typiquement via
//   ref.read(sessionControllerProvider.notifier).appelAuthentifie(
//     (token) => ref.read(visioControllerProvider.notifier)
//         .obtenirSession(rdvId: rdvId, token: token),
//   )
// côté widget, pour bénéficier du rafraîchissement automatique du
// token expiré (voir authentification_controller.dart).

import 'package:riverpod/riverpod.dart';

import '../models/visio_models.dart';
import '../repositories/visio_repository.dart';

/* =========================================================================
 * Dépendances partagées
 * ========================================================================= */

/// Repository ré-exposé ici pour que les widgets n'aient jamais besoin
/// d'importer visio_repository.dart directement. Ne dépend plus
/// d'[ApiClient] : [VisioRepository] gère son propre client HTTP.
final visioRepositoryProvider = Provider<VisioRepository>((ref) {
  return VisioRepository();
});

/* =========================================================================
 * Obtention du token Jitsi (POST /visio/token)
 * ========================================================================= */

/// Pilote l'appel unique à `/visio/token`.
///
/// L'état exposé ([AsyncNotifier<VisioSession?>]) sert à la fois
/// d'indicateur de chargement (bouton "Rejoindre la téléconsultation"
/// en cours) et de dernière session obtenue — [obtenirSession] renvoie
/// aussi directement son résultat pour que l'appelant puisse enchaîner
/// immédiatement sur `JitsiMeet().join(...)` sans avoir à relire
/// l'état du provider.
class VisioController extends AsyncNotifier<VisioSession?> {
  @override
  VisioSession? build() => null;

  /// [rdvId] : identifiant du rendez-vous de téléconsultation
  /// concerné (voir [RendezVous.rdvId] dans rendez_vous_models.dart).
  ///
  /// Lève une [ApiException] (voir visio_repository.dart) :
  /// - 400 si ce rendez-vous n'est pas une téléconsultation, ou si son
  ///   statut ne permet pas encore la visio (voir
  ///   STATUTS_AUTORISES_VISIO côté backend) ;
  /// - 403 si l'appelant n'est ni le médecin ni le patient concerné ;
  /// - 404 si le rendez-vous n'existe pas.
  Future<VisioSession> obtenirSession({
    required String rdvId,
    required String token,
  }) async {
    state = const AsyncLoading<VisioSession?>().copyWithPrevious(state);
    try {
      final session = await ref
          .read(visioRepositoryProvider)
          .obtenirTokenVisio(rdvId: rdvId, token: token);
      state = AsyncData(session);
      return session;
    } catch (e, pile) {
      state = AsyncError<VisioSession?>(e, pile);
      // On relance pour que l'appelant (widget) puisse afficher le
      // message d'erreur précis (ApiException) au bon endroit — l'état
      // du provider ne sert ici qu'à l'indicateur de chargement global.
      rethrow;
    }
  }

  /// Remet l'état à zéro (ex: juste après avoir quitté l'appel Jitsi),
  /// pour qu'un futur tap sur "Rejoindre" reparte d'un état propre
  /// plutôt que de réafficher la session précédente pendant le
  /// chargement de la suivante.
  void reinitialiser() {
    state = const AsyncData(null);
  }
}

final visioControllerProvider =
AsyncNotifierProvider<VisioController, VisioSession?>(
  VisioController.new,
);