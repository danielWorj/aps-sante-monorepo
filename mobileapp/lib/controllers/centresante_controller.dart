// lib/controllers/centresante_controller.dart
//
// Gestion d'état (Riverpod) du module "annuaire — centre de santé",
// en miroir de centresante_repository.dart (voir son en-tête) et de
// centresante_models.dart.
//
// Comme pour MedecinController : ce fichier porte TOUT l'état
// applicatif (chargement, erreurs, sélection courante, filtres) de ce
// module. Il ne parle jamais HTTP directement — il s'appuie
// uniquement sur [CentreSanteRepository], qui traduit déjà toute
// [ApiException] en exception métier typée ([CentreSanteException] et
// ses sous-types) : les widgets peuvent donc faire un `switch`
// exhaustif sur l'erreur plutôt que d'inspecter un code HTTP.
//
// Règle du token : identique à [ApiClient]/[CentreSanteRepository], le
// token n'est JAMAIS conservé de façon persistante ici, à l'exception
// du cache mémoire local de [ListeCentresSanteController] (durée de
// vie du provider uniquement — voir la même remarque dans
// medecin_controller.dart). Idéalement ce token provient d'un
// AuthController / authTokenProvider global déjà présent ailleurs
// dans l'app ; ce fichier ne le redéfinit pas et se contente de le
// recevoir en entrée.

import 'package:riverpod/legacy.dart';
import 'package:riverpod/riverpod.dart';

import '../models/centresante_models.dart';
import '../repositories/centresante_repository.dart';

/* =========================================================================
 * Dépendances partagées
 * ========================================================================= */

/// Repository ré-exposé ici pour que les widgets n'aient jamais besoin
/// d'importer centresante_repository.dart directement.
///
/// [CentreSanteRepository] parle HTTP directement (via le package
/// `http`) et ne prend plus de dépendance en paramètre : pas besoin
/// d'[ApiClient] ici (même patron que [medecinRepositoryProvider] dans
/// medecin_controller.dart).
final centreSanteRepositoryProvider = Provider<CentreSanteRepository>((ref) {
  return CentreSanteRepository();
});

/* =========================================================================
 * Liste / détail (lecture, publique — token optionnel)
 * ========================================================================= */

/// Filtres courants de l'annuaire (GET /centres-sante : pays_id,
/// ville_id, type_structure, statut_verification, recherche).
/// Modifier cette valeur (ex: depuis une barre de recherche ou des
/// chips de filtre) déclenche automatiquement un rechargement de
/// [listeCentresSanteControllerProvider].
final filtresCentresSanteProvider =
StateProvider<CentresSanteFiltre?>((ref) => null);

/// Liste des centres de santé de l'annuaire, synchronisée avec
/// [filtresCentresSanteProvider].
///
/// Le token est optionnel et volontairement gardé en mémoire locale
/// (via [definirToken]) plutôt que passé à chaque appel — même patron
/// que `ListeMedecinsController` — au cas où la liste s'enrichirait un
/// jour pour un utilisateur connu (voir la remarque `authentifierOptionnel`
/// dans le repository).
class ListeCentresSanteController extends AsyncNotifier<List<CentreSante>> {
  String? _token;

  @override
  Future<List<CentreSante>> build() {
    // ref.listen (et non ref.watch) : on réagit à un changement de
    // filtres par un rechargement explicite, sans reconstruire cette
    // instance de notifier (on garderait sinon un _token réinitialisé
    // à chaque changement de filtre).
    ref.listen<CentresSanteFiltre?>(filtresCentresSanteProvider,
            (previous, next) {
          if (previous != next) {
            rafraichir();
          }
        });
    return _charger(ref.read(filtresCentresSanteProvider));
  }

  Future<List<CentreSante>> _charger(CentresSanteFiltre? filtre) {
    return ref
        .read(centreSanteRepositoryProvider)
        .lister(filtre: filtre, token: _token);
  }

  /// À appeler après connexion/déconnexion, puis recharge
  /// automatiquement la liste.
  Future<void> definirToken(String? token) async {
    _token = token;
    await rafraichir();
  }

  /// Recharge la liste avec les filtres courants, sans perdre l'état
  /// précédent pendant le chargement (utile pour garder l'ancienne
  /// liste affichée le temps du fetch, cf. `AsyncValue.copyWithPrevious`).
  Future<void> rafraichir() async {
    state = const AsyncLoading<List<CentreSante>>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(ref.read(filtresCentresSanteProvider)),
    );
  }
}

final listeCentresSanteControllerProvider =
AsyncNotifierProvider<ListeCentresSanteController, List<CentreSante>>(
  ListeCentresSanteController.new,
);

/// Fiche d'un centre de santé par son id (GET /centres-sante/:id).
/// `autoDispose` : pas de raison de garder une fiche consultée en
/// mémoire une fois l'écran de détail quitté.
final centreSanteParIdProvider = FutureProvider.autoDispose
    .family<CentreSante, ({String id, String? token})>((ref, params) {
  return ref
      .read(centreSanteRepositoryProvider)
      .obtenir(params.id, token: params.token);
});

/* =========================================================================
 * Création (POST /centres-sante)
 * ========================================================================= */

/// Création d'un centre de santé (+ compte agent associé) —
/// authentifiée, ouverte à tout rôle.
///
/// ⚠️ Le résultat porte le mot de passe temporaire du compte agent
/// créé (voir [AgentCentreSante.motDePasseTemporaire]), à n'afficher
/// qu'une seule fois : appeler [reinitialiser] dès que l'utilisateur a
/// quitté l'écran de confirmation, pour ne pas le laisser traîner en
/// mémoire.
class CreationCentreSanteController
    extends AsyncNotifier<CentreSanteCreationReponse?> {
  @override
  CentreSanteCreationReponse? build() => null;

  Future<void> soumettre({
    required CentreSanteCreationRequete requete,
    required List<int> imageStructureOctets,
    required String imageStructureNomFichier,
    required List<int> pieceIdentiteOctets,
    required String pieceIdentiteNomFichier,
    required List<int> documentAgrementOctets,
    required String documentAgrementNomFichier,
    required String token,
  }) async {
    state = const AsyncLoading<CentreSanteCreationReponse?>()
        .copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final reponse = await ref.read(centreSanteRepositoryProvider).creer(
        requete: requete,
        imageStructureOctets: imageStructureOctets,
        imageStructureNomFichier: imageStructureNomFichier,
        pieceIdentiteOctets: pieceIdentiteOctets,
        pieceIdentiteNomFichier: pieceIdentiteNomFichier,
        documentAgrementOctets: documentAgrementOctets,
        documentAgrementNomFichier: documentAgrementNomFichier,
        token: token,
      );
      // Le nouveau centre n'apparaîtra dans l'annuaire courant que
      // s'il correspond aux filtres actifs, mais on invalide malgré
      // tout la liste pour ne pas laisser un état obsolète en cache.
      ref.invalidate(listeCentresSanteControllerProvider);
      return reponse;
    });
  }

  /// À appeler après que l'utilisateur a quitté l'écran de
  /// confirmation, pour ne pas laisser le mot de passe temporaire de
  /// l'agent en mémoire plus longtemps que nécessaire.
  void reinitialiser() => state = const AsyncData(null);
}

final creationCentreSanteControllerProvider = AsyncNotifierProvider<
    CreationCentreSanteController, CentreSanteCreationReponse?>(
  CreationCentreSanteController.new,
);

/* =========================================================================
 * Modification (PUT /centres-sante/:id)
 * ========================================================================= */

/// Modification d'une fiche centre de santé — authentifiée, ouverte à
/// tout rôle (le comportement de `statutVerification` dépend du rôle
/// côté serveur, voir [CentreSanteMiseAJourRequete]).
///
/// Après succès, invalide [listeCentresSanteControllerProvider] pour
/// que l'annuaire reflète la mise à jour au prochain accès, plutôt que
/// de dupliquer la logique de fusion dans deux états différents.
class ModificationCentreSanteController extends AsyncNotifier<CentreSante?> {
  @override
  CentreSante? build() => null;

  Future<void> modifier({
    required String structureId,
    required CentreSanteMiseAJourRequete requete,
    required String token,
    List<int>? imageStructureOctets,
    String? imageStructureNomFichier,
    List<int>? pieceIdentiteOctets,
    String? pieceIdentiteNomFichier,
    List<int>? documentAgrementOctets,
    String? documentAgrementNomFichier,
  }) async {
    state = const AsyncLoading<CentreSante?>().copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final centreSante =
      await ref.read(centreSanteRepositoryProvider).modifier(
        structureId: structureId,
        requete: requete,
        token: token,
        imageStructureOctets: imageStructureOctets,
        imageStructureNomFichier: imageStructureNomFichier,
        pieceIdentiteOctets: pieceIdentiteOctets,
        pieceIdentiteNomFichier: pieceIdentiteNomFichier,
        documentAgrementOctets: documentAgrementOctets,
        documentAgrementNomFichier: documentAgrementNomFichier,
      );
      ref.invalidate(listeCentresSanteControllerProvider);
      return centreSante;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final modificationCentreSanteControllerProvider = AsyncNotifierProvider<
    ModificationCentreSanteController, CentreSante?>(
  ModificationCentreSanteController.new,
);

/* =========================================================================
 * Suppression (DELETE /centres-sante/:id)
 * ========================================================================= */

/// Suppression d'une fiche centre de santé — réservée superadmin côté
/// serveur (tout autre appelant reçoit une
/// [CentreSanteAccesRefuseException], à charge du widget appelant de
/// l'afficher).
///
/// L'état exposé ([AsyncNotifier<void>]) ne sert qu'à piloter un
/// indicateur de chargement global (ex: bouton en cours d'action) —
/// [supprimer] renvoie aussi directement le message de confirmation
/// serveur pour que l'appelant puisse réagir immédiatement sans avoir
/// à relire l'état du provider.
class SuppressionCentreSanteController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<String> supprimer(String structureId, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(centreSanteRepositoryProvider)
          .supprimer(structureId, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeCentresSanteControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      // On relance pour que l'appelant (widget) puisse afficher le
      // message d'erreur précis (CentreSanteException) au bon
      // endroit — l'état du provider ne sert ici qu'à l'indicateur de
      // chargement global.
      rethrow;
    }
  }
}

final suppressionCentreSanteControllerProvider =
AsyncNotifierProvider<SuppressionCentreSanteController, void>(
  SuppressionCentreSanteController.new,
);