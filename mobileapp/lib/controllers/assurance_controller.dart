// lib/controllers/assurance_controller.dart
//
// Gestion d'état (Riverpod) du module "annuaire — assurance"
// (service_assurance, mise_en_relation, catalogue activite /
// option_activite, agence), en miroir de assurance_repository.dart
// (voir son en-tête) et de assurance_models.dart, et suivant
// exactement le même patron que medecin_controller.dart.
//
// Comme annoncé dans l'en-tête d'[AssuranceRepository] : ce fichier
// porte TOUT l'état applicatif (chargement, erreurs, sélection
// courante, filtres) de ce module. Il ne parle jamais HTTP directement
// — il s'appuie uniquement sur [AssuranceRepository].
//
// Règle du token : identique à [ApiClient] / [AssuranceRepository] /
// [MedecinRepository] : le token n'est JAMAIS conservé de façon
// persistante ici. Chaque controller qui en a besoin le reçoit en
// paramètre de ses méthodes ; certains le mettent en cache mémoire
// (durée de vie du provider uniquement, perdu à l'invalidation) pour
// éviter d'avoir à le repasser à chaque rafraîchissement — voir
// [ListeMisesEnRelationController], sur le même modèle que
// [ListeMedecinsController]. Idéalement, ce token provient d'un
// AuthController / authTokenProvider global déjà présent ailleurs
// dans l'app ; ce fichier ne le redéfinit pas et se contente de le
// recevoir en entrée.
//
// Rappel des règles d'accès (voir assurance.routes.js, reprises dans
// assurance_repository.dart) :
//   - service_assurance   : GET publique ; POST/PUT tout utilisateur
//                            authentifié ; DELETE superadmin uniquement.
//   - mise_en_relation    : POST tout utilisateur authentifié ; GET/DELETE
//                            agent du service_assurance concerné, ou
//                            admin/superadmin.
//   - activite / option_activite / agence : GET publique ; écriture
//                            réservée à l'agent du service_assurance
//                            concerné, ou admin/superadmin.

import 'package:riverpod/legacy.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/assurance_models.dart';
import '../repositories/assurance_repository.dart';
import '../utils/api_client.dart';

/* =========================================================================
 * Dépendances partagées
 * ========================================================================= */

/// Instance unique d'[ApiClient] pour toute l'app.
///
/// ⚠️ Si un `apiClientProvider` existe déjà ailleurs dans le projet
/// (fichier partagé entre tous les modules, ex: medecin_controller.dart),
/// SUPPRIMER cette déclaration et importer l'existant à la place — ce
/// provider n'est redéclaré ici que pour que ce fichier compile de
/// façon autonome. Adapter `baseUrl` à la configuration réelle (ex:
/// variable d'environnement / flavor).
final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(baseUrl: 'http://localhost:3000/api');
  ref.onDispose(client.close);
  return client;
});

/// Repository ré-exposé ici pour que les widgets n'aient jamais besoin
/// d'importer assurance_repository.dart directement.
final assuranceRepositoryProvider = Provider<AssuranceRepository>((ref) {
  return AssuranceRepository(ref.watch(apiClientProvider));
});

/// ⚠️ Même remarque que pour [apiClientProvider] : si un
/// `authTokenProvider` global existe déjà ailleurs dans le projet (issu de
/// l'AuthController de l'app), SUPPRIMER cette déclaration et importer
/// l'existant à la place — ce provider n'est redéclaré ici que pour que ce
/// fichier compile de façon autonome et que les écrans du module assurance
/// (ex: [AssuranceDetailPage]) aient un token à lire pour la mise en
/// relation. `null` tant qu'aucun utilisateur n'est connecté.
final authTokenProvider = StateProvider<String?>((ref) => null);

/* =========================================================================
 * Services d'assurance
 * ========================================================================= */

/// Filtres courants de l'annuaire des services d'assurance
/// (GET /services-assurance). Modifier cette valeur (ex: depuis une
/// barre de recherche ou des chips de filtre) déclenche automatiquement
/// un rechargement de [listeServicesAssuranceControllerProvider].
final filtresServicesAssuranceProvider =
StateProvider<ServicesAssuranceFiltre?>((ref) => null);

/// Liste des services d'assurance, synchronisée avec
/// [filtresServicesAssuranceProvider]. Route publique — aucun token
/// requis.
class ListeServicesAssuranceController
    extends AsyncNotifier<List<ServiceAssurance>> {
  @override
  Future<List<ServiceAssurance>> build() {
    // ref.listen (et non ref.watch) : on réagit à un changement de
    // filtres par un rechargement explicite, sans reconstruire cette
    // instance de notifier.
    ref.listen<ServicesAssuranceFiltre?>(filtresServicesAssuranceProvider,
            (previous, next) {
          if (previous != next) {
            rafraichir();
          }
        });
    return _charger(ref.read(filtresServicesAssuranceProvider));
  }

  Future<List<ServiceAssurance>> _charger(ServicesAssuranceFiltre? filtres) {
    return ref
        .read(assuranceRepositoryProvider)
        .listerServicesAssurance(filtres: filtres);
  }

  /// Recharge la liste avec les filtres courants, sans perdre l'état
  /// précédent pendant le chargement (utile pour garder l'ancienne
  /// liste affichée le temps du fetch, cf. `AsyncValue.copyWithPrevious`).
  Future<void> rafraichir() async {
    state =
        const AsyncLoading<List<ServiceAssurance>>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(ref.read(filtresServicesAssuranceProvider)),
    );
  }
}

final listeServicesAssuranceControllerProvider = AsyncNotifierProvider<
    ListeServicesAssuranceController, List<ServiceAssurance>>(
  ListeServicesAssuranceController.new,
);

/// Fiche d'un service d'assurance par son id (GET /services-assurance/:id).
/// `autoDispose` : pas de raison de garder une fiche consultée en
/// mémoire une fois l'écran de détail quitté.
final serviceAssuranceParIdProvider =
FutureProvider.autoDispose.family<ServiceAssurance, String>((ref, id) {
  return ref.read(assuranceRepositoryProvider).obtenirServiceAssurance(id);
});

/// Candidature service d'assurance (POST /services-assurance).
///
/// ⚠️ Le résultat porte le mot de passe temporaire du compte agent créé
/// (voir [AgentServiceAssurance] dans [ServiceAssuranceCreationReponse]),
/// à n'afficher qu'une seule fois : appeler [reinitialiser] dès que
/// l'utilisateur a quitté l'écran de confirmation, pour ne pas le
/// laisser traîner en mémoire — même règle que
/// [CreationMedecinController] côté module médecins.
class CreationServiceAssuranceController
    extends AsyncNotifier<ServiceAssuranceCreationReponse?> {
  @override
  ServiceAssuranceCreationReponse? build() => null;

  Future<void> soumettre({
    required ServiceAssuranceCreationRequete requete,
    required List<int> imageOctets,
    required String imageNomFichier,
    required String token,
  }) async {
    state = const AsyncLoading<ServiceAssuranceCreationReponse?>()
        .copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final reponse =
      await ref.read(assuranceRepositoryProvider).creerServiceAssurance(
        requete: requete,
        imageOctets: imageOctets,
        imageNomFichier: imageNomFichier,
        token: token,
      );
      ref.invalidate(listeServicesAssuranceControllerProvider);
      return reponse;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final creationServiceAssuranceControllerProvider = AsyncNotifierProvider<
    CreationServiceAssuranceController, ServiceAssuranceCreationReponse?>(
  CreationServiceAssuranceController.new,
);

/// Modification d'une fiche service d'assurance (PUT /services-assurance/:id).
/// Après succès, invalide [listeServicesAssuranceControllerProvider]
/// pour que l'annuaire reflète la mise à jour au prochain accès —
/// même logique que [ModificationMedecinController].
class ModificationServiceAssuranceController
    extends AsyncNotifier<ServiceAssurance?> {
  @override
  ServiceAssurance? build() => null;

  Future<void> modifier({
    required String id,
    required String token,
    ServiceAssuranceMiseAJourRequete? requete,
    List<int>? imageOctets,
    String? imageNomFichier,
  }) async {
    state =
        const AsyncLoading<ServiceAssurance?>().copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final reponse =
      await ref.read(assuranceRepositoryProvider).modifierServiceAssurance(
        id: id,
        token: token,
        requete: requete,
        imageOctets: imageOctets,
        imageNomFichier: imageNomFichier,
      );
      ref.invalidate(listeServicesAssuranceControllerProvider);
      return reponse.serviceAssurance;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final modificationServiceAssuranceControllerProvider =
AsyncNotifierProvider<ModificationServiceAssuranceController,
    ServiceAssurance?>(
  ModificationServiceAssuranceController.new,
);

/// Suppression d'un service d'assurance (DELETE /services-assurance/:id,
/// réservée superadmin côté backend — échoue via [ApiException] statusCode
/// 409 si des agents/mises en relation/activités/agences en dépendent
/// encore).
///
/// Isolée dans son propre controller (plutôt que fusionnée dans un
/// [ActionsServiceAssuranceController] générique comme pour les
/// médecins) car c'est la seule action d'administration transverse de
/// ce sous-module.
class SuppressionServiceAssuranceController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(assuranceRepositoryProvider)
          .supprimerServiceAssurance(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeServicesAssuranceControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      // On relance pour que l'appelant (widget) puisse afficher le
      // message d'erreur précis (ApiException) au bon endroit — l'état
      // du provider ne sert ici qu'à l'indicateur de chargement global.
      rethrow;
    }
  }
}

final suppressionServiceAssuranceControllerProvider =
AsyncNotifierProvider<SuppressionServiceAssuranceController, void>(
  SuppressionServiceAssuranceController.new,
);

/* =========================================================================
 * Mises en relation
 * ========================================================================= */

/// Service d'assurance actuellement sélectionné pour la vue "mises en
/// relation" (ex: écran back-office d'un agent). `null` tant qu'aucun
/// service n'est sélectionné — [listerMisesEnRelation] n'accepte pas de
/// liste globale non filtrée côté serveur, donc pas de chargement tant
/// que cette valeur est nulle.
final serviceAssuranceIdMisesEnRelationProvider =
StateProvider<String?>((ref) => null);

/// Liste des mises en relation du service sélectionné, synchronisée
/// avec [serviceAssuranceIdMisesEnRelationProvider].
///
/// Le token est mis en cache mémoire (via [definirToken]) plutôt que
/// passé à chaque appel, sur le même modèle que
/// [ListeMedecinsController] : la route est réservée à l'agent du
/// service concerné ou à admin/superadmin, donc un token est
/// nécessaire dès le premier chargement.
class ListeMisesEnRelationController
    extends AsyncNotifier<List<MiseEnRelation>> {
  String? _token;

  @override
  Future<List<MiseEnRelation>> build() {
    ref.listen<String?>(serviceAssuranceIdMisesEnRelationProvider,
            (previous, next) {
          if (previous != next) {
            rafraichir();
          }
        });
    return _charger(ref.read(serviceAssuranceIdMisesEnRelationProvider));
  }

  Future<List<MiseEnRelation>> _charger(String? serviceAssuranceId) {
    final token = _token;
    if (serviceAssuranceId == null || token == null) {
      // Pas de service sélectionné, ou pas encore de session
      // authentifiée disponible : rien à afficher plutôt que de tenter
      // un appel voué à échouer côté serveur (route protégée).
      return Future.value(const []);
    }
    return ref.read(assuranceRepositoryProvider).listerMisesEnRelation(
      serviceAssuranceId: serviceAssuranceId,
      token: token,
    );
  }

  /// À appeler après connexion/déconnexion, puis recharge
  /// automatiquement la liste avec le service courant.
  Future<void> definirToken(String? token) async {
    _token = token;
    await rafraichir();
  }

  /// Recharge la liste avec le service et le token courants, sans
  /// perdre l'état précédent pendant le chargement.
  Future<void> rafraichir() async {
    state =
        const AsyncLoading<List<MiseEnRelation>>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(ref.read(serviceAssuranceIdMisesEnRelationProvider)),
    );
  }
}

final listeMisesEnRelationControllerProvider = AsyncNotifierProvider<
    ListeMisesEnRelationController, List<MiseEnRelation>>(
  ListeMisesEnRelationController.new,
);

/// Création d'une mise en relation (POST /mises-en-relation-assurance).
/// Ouverte à tout utilisateur authentifié — `utilisateur_id` n'est
/// jamais envoyé, déduit côté serveur du compte connecté.
class CreationMiseEnRelationController
    extends AsyncNotifier<MiseEnRelationCreationReponse?> {
  @override
  MiseEnRelationCreationReponse? build() => null;

  Future<void> soumettre({
    required MiseEnRelationCreationRequete requete,
    required String token,
  }) async {
    state = const AsyncLoading<MiseEnRelationCreationReponse?>()
        .copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final reponse =
      await ref.read(assuranceRepositoryProvider).creerMiseEnRelation(
        requete: requete,
        token: token,
      );
      // N'invalide la liste que si elle correspond au service concerné
      // — l'utilisateur qui soumet la demande n'est pas forcément
      // l'agent qui consulte la liste, mais si c'est le cas, autant
      // refléter la nouvelle demande immédiatement.
      if (ref.read(serviceAssuranceIdMisesEnRelationProvider) ==
          requete.serviceAssuranceId) {
        ref.invalidate(listeMisesEnRelationControllerProvider);
      }
      return reponse;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final creationMiseEnRelationControllerProvider = AsyncNotifierProvider<
    CreationMiseEnRelationController, MiseEnRelationCreationReponse?>(
  CreationMiseEnRelationController.new,
);

/// Suppression d'une mise en relation (DELETE
/// /mises-en-relation-assurance/:id), réservée à l'agent du service
/// concerné ou à admin/superadmin.
class ActionsMisesEnRelationController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(assuranceRepositoryProvider)
          .supprimerMiseEnRelation(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeMisesEnRelationControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }
}

final actionsMisesEnRelationControllerProvider =
AsyncNotifierProvider<ActionsMisesEnRelationController, void>(
  ActionsMisesEnRelationController.new,
);

/* =========================================================================
 * Activités (catalogue produits)
 * ========================================================================= */

/// Filtre courant du catalogue Activités (GET /activites), typiquement
/// `service_assurance_id` pour afficher le catalogue d'un seul service.
/// Sans filtre, retourne l'ensemble du catalogue.
final filtresActivitesProvider =
StateProvider<ActivitesFiltre?>((ref) => null);

/// Liste des activités, synchronisée avec [filtresActivitesProvider] —
/// même patron que [ListeServicesAssuranceController], route entièrement
/// publique.
class ListeActivitesController extends AsyncNotifier<List<Activite>> {
  @override
  Future<List<Activite>> build() {
    ref.listen<ActivitesFiltre?>(filtresActivitesProvider, (previous, next) {
      if (previous != next) {
        rafraichir();
      }
    });
    return _charger(ref.read(filtresActivitesProvider));
  }

  Future<List<Activite>> _charger(ActivitesFiltre? filtre) {
    return ref
        .read(assuranceRepositoryProvider)
        .listerActivites(filtre: filtre);
  }

  Future<void> rafraichir() async {
    state = const AsyncLoading<List<Activite>>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(ref.read(filtresActivitesProvider)),
    );
  }
}

final listeActivitesControllerProvider =
AsyncNotifierProvider<ListeActivitesController, List<Activite>>(
  ListeActivitesController.new,
);

/// Fiche d'une activité par son id (GET /activites/:id).
final activiteParIdProvider =
FutureProvider.autoDispose.family<Activite, String>((ref, id) {
  return ref.read(assuranceRepositoryProvider).obtenirActivite(id);
});

/// Catalogue Activités d'UN SEUL service d'assurance (GET
/// /activites?service_assurance_id=...), scoppé par [serviceAssuranceId].
///
/// À préférer à [listeActivitesControllerProvider] +
/// [filtresActivitesProvider] dans un écran qui n'affiche jamais que les
/// activités d'un service précis (ex: [AssuranceDetailPage]) : ce dernier
/// duo repose sur un `StateProvider` global partagé entre écrans, ce qui
/// oblige à poser le filtre après le premier `build()` (pas de mutation de
/// provider pendant la construction) — d'où un premier fetch non filtré
/// (tout le catalogue) suivi d'un second fetch filtré dès que le filtre est
/// posé. `autoDispose.family` élimine ce problème : chaque
/// `serviceAssuranceId` a sa propre instance, chargée directement avec le
/// bon filtre dès le premier appel, sans état global à réinitialiser au
/// `dispose()`.
final activitesParServiceProvider =
FutureProvider.autoDispose.family<List<Activite>, String>(
      (ref, serviceAssuranceId) {
    return ref.read(assuranceRepositoryProvider).listerActivites(
      filtre: ActivitesFiltre(serviceAssuranceId: serviceAssuranceId),
    );
  },
);

/// Création / modification / suppression d'une activité (réservées à
/// l'agent du service_assurance concerné, ou admin/superadmin — voir
/// repository). Chaque méthode invalide
/// [listeActivitesControllerProvider] après succès plutôt que de
/// modifier la liste en place, pour rester la seule source de vérité
/// simple à raisonner — même patron que [CrudSpecialitesController].
class CrudActivitesController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<Activite> creer({
    required ActiviteCreationRequete requete,
    required String token,
  }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final activite = await ref
          .read(assuranceRepositoryProvider)
          .creerActivite(requete: requete, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeActivitesControllerProvider);
      return activite;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  Future<Activite> modifier(
      String id, {
        required ActiviteMiseAJourRequete requete,
        required String token,
      }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final activite = await ref.read(assuranceRepositoryProvider).modifierActivite(
        id: id,
        requete: requete,
        token: token,
      );
      state = const AsyncData(null);
      ref.invalidate(listeActivitesControllerProvider);
      return activite;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(assuranceRepositoryProvider)
          .supprimerActivite(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeActivitesControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }
}

final crudActivitesControllerProvider =
AsyncNotifierProvider<CrudActivitesController, void>(
  CrudActivitesController.new,
);

/* =========================================================================
 * Options d'activité
 * ========================================================================= */

/// Activité actuellement sélectionnée pour la vue "options" (ex: écran
/// de détail d'une activité listant ses options). `null` tant qu'aucune
/// activité n'est sélectionnée — [listerOptionsActivite] exige
/// `activite_id` côté serveur, donc pas de chargement tant que cette
/// valeur est nulle.
final activiteIdOptionsProvider = StateProvider<String?>((ref) => null);

/// Liste des options de l'activité sélectionnée, synchronisée avec
/// [activiteIdOptionsProvider]. Route publique — aucun token requis.
class ListeOptionsActiviteController
    extends AsyncNotifier<List<OptionActivite>> {
  @override
  Future<List<OptionActivite>> build() {
    ref.listen<String?>(activiteIdOptionsProvider, (previous, next) {
      if (previous != next) {
        rafraichir();
      }
    });
    return _charger(ref.read(activiteIdOptionsProvider));
  }

  Future<List<OptionActivite>> _charger(String? activiteId) {
    if (activiteId == null) {
      return Future.value(const []);
    }
    return ref
        .read(assuranceRepositoryProvider)
        .listerOptionsActivite(activiteId: activiteId);
  }

  Future<void> rafraichir() async {
    state =
        const AsyncLoading<List<OptionActivite>>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(ref.read(activiteIdOptionsProvider)),
    );
  }
}

final listeOptionsActiviteControllerProvider = AsyncNotifierProvider<
    ListeOptionsActiviteController, List<OptionActivite>>(
  ListeOptionsActiviteController.new,
);

/// Fiche d'une option d'activité par son id (GET /options-activite/:id).
final optionActiviteParIdProvider =
FutureProvider.autoDispose.family<OptionActivite, String>((ref, id) {
  return ref.read(assuranceRepositoryProvider).obtenirOptionActivite(id);
});

/// Création / modification / suppression d'une option d'activité
/// (réservées à l'agent du service_assurance propriétaire de l'activité
/// parente, ou admin/superadmin — voir repository). Invalide
/// [listeOptionsActiviteControllerProvider] après succès.
class CrudOptionsActiviteController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<OptionActivite> creer({
    required OptionActiviteCreationRequete requete,
    required String token,
  }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final option = await ref
          .read(assuranceRepositoryProvider)
          .creerOptionActivite(requete: requete, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeOptionsActiviteControllerProvider);
      return option;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  Future<OptionActivite> modifier(
      String id, {
        required OptionActiviteMiseAJourRequete requete,
        required String token,
      }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final option =
      await ref.read(assuranceRepositoryProvider).modifierOptionActivite(
        id: id,
        requete: requete,
        token: token,
      );
      state = const AsyncData(null);
      ref.invalidate(listeOptionsActiviteControllerProvider);
      return option;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(assuranceRepositoryProvider)
          .supprimerOptionActivite(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeOptionsActiviteControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }
}

final crudOptionsActiviteControllerProvider =
AsyncNotifierProvider<CrudOptionsActiviteController, void>(
  CrudOptionsActiviteController.new,
);

/* =========================================================================
 * Agences
 * ========================================================================= */

/// Filtre courant de la liste des agences (GET /agences), typiquement
/// `service_assurance_id` pour afficher les agences d'un seul service.
/// Sans filtre, retourne l'ensemble des agences.
final filtresAgencesProvider = StateProvider<AgencesFiltre?>((ref) => null);

/// Liste des agences, synchronisée avec [filtresAgencesProvider] — même
/// patron que [ListeActivitesController], route entièrement publique.
class ListeAgencesController extends AsyncNotifier<List<Agence>> {
  @override
  Future<List<Agence>> build() {
    ref.listen<AgencesFiltre?>(filtresAgencesProvider, (previous, next) {
      if (previous != next) {
        rafraichir();
      }
    });
    return _charger(ref.read(filtresAgencesProvider));
  }

  Future<List<Agence>> _charger(AgencesFiltre? filtre) {
    return ref.read(assuranceRepositoryProvider).listerAgences(filtre: filtre);
  }

  Future<void> rafraichir() async {
    state = const AsyncLoading<List<Agence>>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(ref.read(filtresAgencesProvider)),
    );
  }
}

final listeAgencesControllerProvider =
AsyncNotifierProvider<ListeAgencesController, List<Agence>>(
  ListeAgencesController.new,
);

/// Fiche d'une agence par son id (GET /agences/:id).
final agenceParIdProvider =
FutureProvider.autoDispose.family<Agence, String>((ref, id) {
  return ref.read(assuranceRepositoryProvider).obtenirAgence(id);
});

/// Agences d'UN SEUL service d'assurance (GET
/// /agences?service_assurance_id=...), scoppé par [serviceAssuranceId] —
/// même motivation que [activitesParServiceProvider] (voir sa doc), à
/// préférer à [listeAgencesControllerProvider] + [filtresAgencesProvider]
/// dans un écran qui n'affiche que les agences d'un service précis.
final agencesParServiceProvider =
FutureProvider.autoDispose.family<List<Agence>, String>(
      (ref, serviceAssuranceId) {
    return ref.read(assuranceRepositoryProvider).listerAgences(
      filtre: AgencesFiltre(serviceAssuranceId: serviceAssuranceId),
    );
  },
);

/// Création / modification / suppression d'une agence (réservées à
/// l'agent du service_assurance concerné, ou admin/superadmin — voir
/// repository). Invalide [listeAgencesControllerProvider] après succès.
class CrudAgencesController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<Agence> creer({
    required AgenceCreationRequete requete,
    required String token,
  }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final agence = await ref
          .read(assuranceRepositoryProvider)
          .creerAgence(requete: requete, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeAgencesControllerProvider);
      return agence;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  Future<Agence> modifier(
      String id, {
        required AgenceMiseAJourRequete requete,
        required String token,
      }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final agence = await ref.read(assuranceRepositoryProvider).modifierAgence(
        id: id,
        requete: requete,
        token: token,
      );
      state = const AsyncData(null);
      ref.invalidate(listeAgencesControllerProvider);
      return agence;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(assuranceRepositoryProvider)
          .supprimerAgence(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeAgencesControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }
}

final crudAgencesControllerProvider =
AsyncNotifierProvider<CrudAgencesController, void>(
  CrudAgencesController.new,
);