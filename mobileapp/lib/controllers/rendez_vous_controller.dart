// lib/controllers/rendez_vous_controller.dart
//
// Gestion d'état (Riverpod) du module transverse "Gestion des
// médecins" — périmètre Rendez-vous + Ordonnance, en miroir de
// rendez_vous_repository.dart (voir son en-tête) et de
// rendez_vous_models.dart.
//
// Comme [MedecinController]/[ListeMedecinsController] : ce fichier
// porte TOUT l'état applicatif (chargement, erreurs, filtres) de ce
// module. Il ne parle jamais HTTP directement — il s'appuie
// uniquement sur [RendezVousRepository].
//
// Règle du token — DIFFÉRENTE de medecin_controller.dart : toutes les
// routes Rendez-vous/Ordonnance exigent déjà "authentifier" côté
// backend (voir l'en-tête de [RendezVousRepository]), le token n'est
// donc jamais optionnel ici. Contrairement à [ListeMedecinsController]
// (qui démarre son chargement immédiatement, token null accepté),
// [ListeRendezVousController]/[ListeOrdonnancesController] démarrent à
// vide tant qu'aucun token n'a été fourni via `definirToken` — sinon
// on déclencherait un appel voué à échouer (401) au premier build().
// Ce token provient idéalement d'un AuthController / authTokenProvider
// global déjà présent ailleurs dans l'app ; ce fichier ne le redéfinit
// pas et se contente de le recevoir en entrée.
//
// ⚠️ Périmètre volontairement identique à celui du repository :
// Rendez-vous + Ordonnance uniquement. Fiche médecin, Spécialités,
// Agenda sont hors périmètre — voir medecin_controller.dart.

import 'package:riverpod/legacy.dart';
import 'package:riverpod/riverpod.dart';

import '../models/rendez_vous_models.dart';
import '../repositories/rendez_vous_repository.dart';
// Réutilise l'unique instance d'[ApiClient] déjà déclarée dans
// medecin_controller.dart plutôt que d'en redéclarer une seconde ici
// (deux `apiClientProvider` distincts casseraient le partage d'état
// HTTP — timeout, `http.Client` sous-jacent — entre les modules).
// ⚠️ Si aucun `apiClientProvider` n'existe encore dans le projet
// (medecin_controller.dart absent), déclarer ici un provider
// équivalent — voir son en-tête pour le modèle attendu.
import 'medecin_controller.dart' show apiClientProvider;

/* =========================================================================
 * Dépendances partagées
 * ========================================================================= */

/// Repository ré-exposé ici pour que les widgets n'aient jamais besoin
/// d'importer rendez_vous_repository.dart directement.
final rendezVousRepositoryProvider = Provider<RendezVousRepository>((ref) {
  return RendezVousRepository(ref.watch(apiClientProvider));
});

/* =========================================================================
 * Rendez-vous
 * ========================================================================= */

/// Filtres courants (GET /rendez-vous). Modifier cette valeur (ex:
/// depuis des chips "à venir"/"passés"/"annulés") déclenche
/// automatiquement un rechargement de [listeRendezVousControllerProvider].
///
/// ⚠️ [RendezVousFiltres.medecinId]/[patientId] ne sont réellement pris
/// en compte par le backend que pour un appelant admin/superadmin —
/// voir la note d'en-tête du repository.
final filtresRendezVousProvider =
StateProvider<RendezVousFiltres?>((ref) => null);

/// Liste des rendez-vous de l'utilisateur connecté (ou de l'ensemble,
/// pour un admin/superadmin utilisant [filtresRendezVousProvider]),
/// synchronisée avec ce dernier.
///
/// Le token est gardé en mémoire locale (via [definirToken]) pour que
/// les widgets n'aient pas à le repasser à chaque frame — mais,
/// contrairement à [ListeMedecinsController], il est ici *obligatoire*
/// : tant qu'aucun token n'a été fourni, l'état reste une liste vide
/// plutôt que de tenter un appel non authentifié voué à un 401.
class ListeRendezVousController extends AsyncNotifier<List<RendezVous>> {
  String? _token;

  @override
  Future<List<RendezVous>> build() {
    // ref.listen (et non ref.watch) : on réagit à un changement de
    // filtres par un rechargement explicite, sans reconstruire cette
    // instance de notifier (on garderait sinon un _token réinitialisé
    // à chaque changement de filtre).
    ref.listen<RendezVousFiltres?>(filtresRendezVousProvider, (previous, next) {
      if (previous != next) {
        rafraichir();
      }
    });

    final token = _token;
    if (token == null) {
      return Future.value(const <RendezVous>[]);
    }
    return _charger(token, ref.read(filtresRendezVousProvider));
  }

  Future<List<RendezVous>> _charger(String token, RendezVousFiltres? filtres) {
    return ref
        .read(rendezVousRepositoryProvider)
        .listerRendezVous(filtres: filtres, token: token);
  }

  /// À appeler après connexion (et avec `token: null` — impossible ici,
  /// voir [reinitialiser] — après déconnexion) pour charger/recharger
  /// la liste avec le token courant de la session.
  Future<void> definirToken(String token) async {
    _token = token;
    await rafraichir();
  }

  /// À appeler à la déconnexion pour vider la liste et oublier le
  /// token en mémoire.
  void reinitialiser() {
    _token = null;
    state = const AsyncData(<RendezVous>[]);
  }

  /// Recharge la liste avec les filtres courants, sans perdre l'état
  /// précédent pendant le chargement (`AsyncValue.copyWithPrevious`).
  /// Ne fait rien si aucun token n'a encore été défini.
  Future<void> rafraichir() async {
    final token = _token;
    if (token == null) {
      state = const AsyncData(<RendezVous>[]);
      return;
    }
    state = const AsyncLoading<List<RendezVous>>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(token, ref.read(filtresRendezVousProvider)),
    );
  }
}

final listeRendezVousControllerProvider =
AsyncNotifierProvider<ListeRendezVousController, List<RendezVous>>(
  ListeRendezVousController.new,
);

/// Détail d'un rendez-vous par son id (GET /rendez-vous/:id).
/// `autoDispose` : pas de raison de garder un détail consulté en
/// mémoire une fois l'écran quitté. Le backend renvoie 404 (et non
/// 403) si l'appelant n'est pas autorisé sur ce rdv — l'erreur remonte
/// alors comme une [ApiException] classique côté widget.
final rendezVousParIdProvider = FutureProvider.autoDispose
    .family<RendezVous, ({String id, String token})>((ref, params) {
  return ref
      .read(rendezVousRepositoryProvider)
      .obtenirRendezVous(params.id, token: params.token);
});

/// Prise de rendez-vous (POST /rendez-vous), réservée à un compte
/// patient — patient_id déduit du token côté backend.
class CreationRendezVousController extends AsyncNotifier<RendezVous?> {
  @override
  RendezVous? build() => null;

  Future<void> soumettre({
    required CreerRendezVousPayload payload,
    required String token,
  }) async {
    state = const AsyncLoading<RendezVous?>().copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final rdv = await ref
          .read(rendezVousRepositoryProvider)
          .creerRendezVous(payload: payload, token: token);
      ref.invalidate(listeRendezVousControllerProvider);
      return rdv;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final creationRendezVousControllerProvider =
AsyncNotifierProvider<CreationRendezVousController, RendezVous?>(
  CreationRendezVousController.new,
);

/// Modification libre d'un rendez-vous (PUT /rendez-vous/:id) — ouverte
/// au patient concerné, au médecin concerné, ou à admin/superadmin.
///
/// ⚠️ Accepte [ModifierRendezVousPayload.statut] SANS contrôle de
/// transition : à réserver aux écrans back-office/admin. Pour un
/// changement de statut initié par un patient ou un médecin, utiliser
/// [ActionsRendezVousController.changerStatut] à la place.
class ModificationRendezVousController extends AsyncNotifier<RendezVous?> {
  @override
  RendezVous? build() => null;

  Future<void> modifier({
    required String id,
    required ModifierRendezVousPayload payload,
    required String token,
  }) async {
    state = const AsyncLoading<RendezVous?>().copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final rdv = await ref.read(rendezVousRepositoryProvider).modifierRendezVous(
        id: id,
        payload: payload,
        token: token,
      );
      ref.invalidate(listeRendezVousControllerProvider);
      return rdv;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final modificationRendezVousControllerProvider =
AsyncNotifierProvider<ModificationRendezVousController, RendezVous?>(
  ModificationRendezVousController.new,
);

/// Changement de statut ciblé (PATCH /rendez-vous/:id/statut) et
/// suppression physique (DELETE /rendez-vous/:id, réservée
/// admin/superadmin — voir le repository).
///
/// L'état exposé ([AsyncNotifier<void>]) ne sert qu'à piloter un
/// indicateur de chargement global (ex: bouton en cours d'action) —
/// chaque méthode renvoie aussi directement son résultat pour que
/// l'appelant puisse réagir immédiatement sans avoir à relire l'état
/// du provider.
class ActionsRendezVousController extends AsyncNotifier<void> {
  @override
  void build() {}

  /// Transition de statut cohérente avec le rôle de l'appelant (voir
  /// TRANSITIONS_AUTORISEES côté backend) — lève une [ApiException]
  /// (statusCode 403) si la transition n'est pas autorisée, ou 400 si
  /// le rdv a déjà ce statut.
  Future<RendezVous> changerStatut(
      String id, {
        required ChangerStatutRendezVousPayload payload,
        required String token,
      }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final rdv = await ref.read(rendezVousRepositoryProvider).changerStatutRendezVous(
        id: id,
        payload: payload,
        token: token,
      );
      state = const AsyncData(null);
      ref.invalidate(listeRendezVousControllerProvider);
      return rdv;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      // On relance pour que l'appelant (widget) puisse afficher le
      // message d'erreur précis (ApiException) au bon endroit — l'état
      // du provider ne sert ici qu'à l'indicateur de chargement global.
      rethrow;
    }
  }

  /// Suppression physique, réservée admin/superadmin côté backend.
  /// Lève une [ApiException] (statusCode 409) si une ordonnance est
  /// encore rattachée à ce rendez-vous.
  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(rendezVousRepositoryProvider)
          .supprimerRendezVous(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeRendezVousControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }
}

final actionsRendezVousControllerProvider =
AsyncNotifierProvider<ActionsRendezVousController, void>(
  ActionsRendezVousController.new,
);

/* =========================================================================
 * Ordonnances
 * ========================================================================= */

/// Filtres courants (GET /ordonnances) — typiquement [rdvId] pour
/// afficher l'ordonnance d'un rendez-vous précis. Modifier cette
/// valeur déclenche automatiquement un rechargement de
/// [listeOrdonnancesControllerProvider].
///
/// ⚠️ [OrdonnanceFiltres.medecinId]/[patientId] ne sont réellement pris
/// en compte par le backend que pour un appelant admin/superadmin —
/// même règle que [filtresRendezVousProvider].
final filtresOrdonnancesProvider =
StateProvider<OrdonnanceFiltres?>((ref) => null);

/// Liste des ordonnances, synchronisée avec [filtresOrdonnancesProvider]
/// — même patron que [ListeRendezVousController] (token obligatoire,
/// gardé en mémoire, liste vide tant qu'il n'est pas défini).
class ListeOrdonnancesController extends AsyncNotifier<List<Ordonnance>> {
  String? _token;

  @override
  Future<List<Ordonnance>> build() {
    ref.listen<OrdonnanceFiltres?>(filtresOrdonnancesProvider, (previous, next) {
      if (previous != next) {
        rafraichir();
      }
    });

    final token = _token;
    if (token == null) {
      return Future.value(const <Ordonnance>[]);
    }
    return _charger(token, ref.read(filtresOrdonnancesProvider));
  }

  Future<List<Ordonnance>> _charger(String token, OrdonnanceFiltres? filtres) {
    return ref
        .read(rendezVousRepositoryProvider)
        .listerOrdonnances(filtres: filtres, token: token);
  }

  Future<void> definirToken(String token) async {
    _token = token;
    await rafraichir();
  }

  void reinitialiser() {
    _token = null;
    state = const AsyncData(<Ordonnance>[]);
  }

  Future<void> rafraichir() async {
    final token = _token;
    if (token == null) {
      state = const AsyncData(<Ordonnance>[]);
      return;
    }
    state = const AsyncLoading<List<Ordonnance>>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(token, ref.read(filtresOrdonnancesProvider)),
    );
  }
}

final listeOrdonnancesControllerProvider =
AsyncNotifierProvider<ListeOrdonnancesController, List<Ordonnance>>(
  ListeOrdonnancesController.new,
);

/// Détail d'une ordonnance par son id (GET /ordonnances/:id).
/// `autoDispose` — même logique que [rendezVousParIdProvider] ; 404 (et
/// non 403) si l'appelant n'est pas autorisé.
final ordonnanceParIdProvider = FutureProvider.autoDispose
    .family<Ordonnance, ({String id, String token})>((ref, params) {
  return ref
      .read(rendezVousRepositoryProvider)
      .obtenirOrdonnance(params.id, token: params.token);
});

/// Émission d'une ordonnance (POST /ordonnances), réservée au médecin
/// du rendez-vous concerné (déduit de [CreerOrdonnancePayload.rdvId]
/// côté backend).
class CreationOrdonnanceController extends AsyncNotifier<Ordonnance?> {
  @override
  Ordonnance? build() => null;

  Future<void> soumettre({
    required CreerOrdonnancePayload payload,
    required String token,
  }) async {
    state = const AsyncLoading<Ordonnance?>().copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final ordonnance = await ref
          .read(rendezVousRepositoryProvider)
          .creerOrdonnance(payload: payload, token: token);
      ref.invalidate(listeOrdonnancesControllerProvider);
      return ordonnance;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final creationOrdonnanceControllerProvider =
AsyncNotifierProvider<CreationOrdonnanceController, Ordonnance?>(
  CreationOrdonnanceController.new,
);

/// Modification d'une ordonnance (PUT /ordonnances/:id) — le médecin
/// auteur ou admin/superadmin ; seuls contenu/pays d'émission sont
/// modifiables (rdv_id, medecin_id, patient_id, identifiant_unique
/// restent immuables — voir [ModifierOrdonnancePayload]).
class ModificationOrdonnanceController extends AsyncNotifier<Ordonnance?> {
  @override
  Ordonnance? build() => null;

  Future<void> modifier({
    required String id,
    required ModifierOrdonnancePayload payload,
    required String token,
  }) async {
    state = const AsyncLoading<Ordonnance?>().copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final ordonnance =
      await ref.read(rendezVousRepositoryProvider).modifierOrdonnance(
        id: id,
        payload: payload,
        token: token,
      );
      ref.invalidate(listeOrdonnancesControllerProvider);
      return ordonnance;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final modificationOrdonnanceControllerProvider =
AsyncNotifierProvider<ModificationOrdonnanceController, Ordonnance?>(
  ModificationOrdonnanceController.new,
);

/// Suppression physique (DELETE /ordonnances/:id), réservée
/// admin/superadmin côté backend — pièce médicale, jamais supprimée
/// par un médecin après émission.
class SuppressionOrdonnanceController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(rendezVousRepositoryProvider)
          .supprimerOrdonnance(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeOrdonnancesControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }
}

final suppressionOrdonnanceControllerProvider =
AsyncNotifierProvider<SuppressionOrdonnanceController, void>(
  SuppressionOrdonnanceController.new,
);