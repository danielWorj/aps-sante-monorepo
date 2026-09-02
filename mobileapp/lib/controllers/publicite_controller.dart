// lib/controllers/publicite_controller.dart
//
// Gestion d'état (Riverpod) du module autonome "Présence, publicité &
// boost commercial" (diagramme 09_presence_publicite_boost) :
// EmplacementPublicitaire, ForfaitPublicitaire, LigneForfaitPublicitaire,
// Publicite — en miroir de publicite_repository.dart (voir son en-tête)
// et de publicite_models.dart. Même patron que medecin_controller.dart.
//
// Comme annoncé dans l'en-tête de PubliciteRepository : ce fichier
// porte TOUT l'état applicatif (chargement, erreurs, sélection
// courante, filtres) de ce module. Il ne parle jamais HTTP
// directement — il s'appuie uniquement sur [PubliciteRepository].
//
// Règle du token : identique à [MedecinRepository] /
// [ListeMedecinsController], le token n'est JAMAIS conservé de façon
// persistante ici. Chaque controller qui en a besoin le reçoit en
// paramètre de ses méthodes ; [ListePublicitesController] le met en
// cache mémoire (durée de vie du provider uniquement, perdu à
// l'invalidation) pour bénéficier de la vue enrichie (publicités non
// "validee" pour un admin/superadmin, ou en attente/rejetées pour leur
// auteur) sans que les widgets aient à le repasser à chaque frame.
// Idéalement, ce token provient d'un AuthController /
// authTokenProvider global déjà présent ailleurs dans l'app ; ce
// fichier ne le redéfinit pas et se contente de le recevoir en entrée.
//
// Rappel métier (voir en-tête de publicite_repository.dart) : ce
// module est AUTONOME depuis la v8 — une Publicite ne référence plus
// jamais pharmacie, structure_sante ni aucune autre fiche annuaire,
// seulement un utilisateur (auteur) et un pays (diffusion).

import 'package:riverpod/legacy.dart';
import 'package:riverpod/riverpod.dart';

import '../models/publicite_models.dart';
import '../repositories/publicite_repository.dart';

/* =========================================================================
 * Dépendances partagées
 * ========================================================================= */

/// Repository ré-exposé ici pour que les widgets n'aient jamais besoin
/// d'importer publicite_repository.dart directement.
///
/// [PubliciteRepository] parle HTTP directement (via le package
/// `http`) et ne prend aucune dépendance en paramètre : pas besoin
/// d'ApiClient ici.
final publiciteRepositoryProvider = Provider<PubliciteRepository>((ref) {
  return PubliciteRepository();
});

/* =========================================================================
 * Emplacements publicitaires (référentiel)
 * ========================================================================= */
// Même patron que Spécialités dans medecin_controller.dart : lecture
// publique, écriture admin/superadmin, suppression superadmin.

/// Liste des emplacements publicitaires. Entièrement publique et sans
/// filtre de recherche côté backend
/// ([PubliciteRepository.listerEmplacementsPublicitaires] ne prend
/// aucun paramètre) : pas de StateProvider de filtre ici, contrairement
/// à [filtresForfaitsPublicitairesProvider] / [filtresPublicitesProvider].
class ListeEmplacementsPublicitairesController
    extends AsyncNotifier<List<EmplacementPublicitaire>> {
  @override
  Future<List<EmplacementPublicitaire>> build() {
    return ref
        .read(publiciteRepositoryProvider)
        .listerEmplacementsPublicitaires();
  }

  Future<void> rafraichir() async {
    state = const AsyncLoading<List<EmplacementPublicitaire>>()
        .copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => ref
          .read(publiciteRepositoryProvider)
          .listerEmplacementsPublicitaires(),
    );
  }
}

final listeEmplacementsPublicitairesControllerProvider =
AsyncNotifierProvider<ListeEmplacementsPublicitairesController,
    List<EmplacementPublicitaire>>(
  ListeEmplacementsPublicitairesController.new,
);

/// Fiche d'un emplacement publicitaire par son id
/// (GET /emplacements-publicitaires/:id).
/// `autoDispose` : pas de raison de garder une fiche consultée en
/// mémoire une fois l'écran de détail quitté.
final emplacementPublicitaireParIdProvider = FutureProvider.autoDispose
    .family<EmplacementPublicitaire, String>((ref, id) {
  return ref
      .read(publiciteRepositoryProvider)
      .obtenirEmplacementPublicitaire(id);
});

/// Création / modification / suppression d'un emplacement publicitaire
/// (réservées admin/superadmin, suppression réservée superadmin — voir
/// repository). Chaque méthode invalide
/// [listeEmplacementsPublicitairesControllerProvider] après succès
/// plutôt que de modifier la liste en place, pour rester la seule
/// source de vérité simple à raisonner.
class CrudEmplacementsPublicitairesController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<EmplacementPublicitaire> creer({
    required String code,
    required String libelle,
    String? description,
    required String token,
  }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final emplacement = await ref
          .read(publiciteRepositoryProvider)
          .creerEmplacementPublicitaire(
        code: code,
        libelle: libelle,
        description: description,
        token: token,
      );
      state = const AsyncData(null);
      ref.invalidate(listeEmplacementsPublicitairesControllerProvider);
      return emplacement;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  Future<EmplacementPublicitaire> modifier(
      String id, {
        required ModifierEmplacementPublicitairePayload payload,
        required String token,
      }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final emplacement = await ref
          .read(publiciteRepositoryProvider)
          .modifierEmplacementPublicitaire(
        id,
        payload: payload,
        token: token,
      );
      state = const AsyncData(null);
      ref.invalidate(listeEmplacementsPublicitairesControllerProvider);
      return emplacement;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  /// Échoue (via [ApiException], statusCode 409) si des forfaits
  /// référencent encore cet emplacement — voir repository.
  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(publiciteRepositoryProvider)
          .supprimerEmplacementPublicitaire(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeEmplacementsPublicitairesControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }
}

final crudEmplacementsPublicitairesControllerProvider =
AsyncNotifierProvider<CrudEmplacementsPublicitairesController, void>(
  CrudEmplacementsPublicitairesController.new,
);

/* =========================================================================
 * Forfaits publicitaires
 * ========================================================================= */

/// Filtres courants du catalogue de forfaits (GET
/// /forfaits-publicitaires). Modifier cette valeur (ex: depuis un
/// sélecteur d'emplacement) déclenche automatiquement un rechargement
/// de [listeForfaitsPublicitairesControllerProvider].
final filtresForfaitsPublicitairesProvider =
StateProvider<ForfaitsPublicitairesFiltres?>((ref) => null);

/// Liste des forfaits publicitaires, synchronisée avec
/// [filtresForfaitsPublicitairesProvider]. Route entièrement publique ;
/// le backend inclut systématiquement `lignes` dans chaque forfait.
class ListeForfaitsPublicitairesController
    extends AsyncNotifier<List<ForfaitPublicitaire>> {
  @override
  Future<List<ForfaitPublicitaire>> build() {
    // ref.listen (et non ref.watch) : on réagit à un changement de
    // filtres par un rechargement explicite, sans reconstruire cette
    // instance de notifier — même choix que [ListeMedecinsController].
    ref.listen<ForfaitsPublicitairesFiltres?>(
      filtresForfaitsPublicitairesProvider,
          (previous, next) {
        if (previous != next) {
          rafraichir();
        }
      },
    );
    return _charger(ref.read(filtresForfaitsPublicitairesProvider));
  }

  Future<List<ForfaitPublicitaire>> _charger(
      ForfaitsPublicitairesFiltres? filtres,
      ) {
    return ref
        .read(publiciteRepositoryProvider)
        .listerForfaitsPublicitaires(filtres: filtres);
  }

  Future<void> rafraichir() async {
    state = const AsyncLoading<List<ForfaitPublicitaire>>()
        .copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(ref.read(filtresForfaitsPublicitairesProvider)),
    );
  }
}

final listeForfaitsPublicitairesControllerProvider = AsyncNotifierProvider<
    ListeForfaitsPublicitairesController, List<ForfaitPublicitaire>>(
  ListeForfaitsPublicitairesController.new,
);

/// Fiche d'un forfait publicitaire par son id
/// (GET /forfaits-publicitaires/:id). `lignes` toujours incluse.
final forfaitPublicitaireParIdProvider = FutureProvider.autoDispose
    .family<ForfaitPublicitaire, String>((ref, id) {
  return ref.read(publiciteRepositoryProvider).obtenirForfaitPublicitaire(id);
});

/// Création / modification / suppression d'un forfait publicitaire
/// (réservées admin/superadmin, suppression réservée superadmin — voir
/// repository). `lignes` n'est modifiable qu'à la création ici — voir
/// [ActionsLignesForfaitController] pour l'ajout/modification/
/// suppression unitaire après coup.
class CrudForfaitsPublicitairesController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<ForfaitPublicitaire> creer({
    required String emplacementPublicitaireId,
    required String libelle,
    required String prix,
    required int dureeJours,
    List<LigneForfaitPublicitaire>? lignes,
    required String token,
  }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final forfait =
      await ref.read(publiciteRepositoryProvider).creerForfaitPublicitaire(
        emplacementPublicitaireId: emplacementPublicitaireId,
        libelle: libelle,
        prix: prix,
        dureeJours: dureeJours,
        lignes: lignes,
        token: token,
      );
      state = const AsyncData(null);
      ref.invalidate(listeForfaitsPublicitairesControllerProvider);
      return forfait;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  Future<ForfaitPublicitaire> modifier(
      String id, {
        required ModifierForfaitPublicitairePayload payload,
        required String token,
      }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final forfait = await ref
          .read(publiciteRepositoryProvider)
          .modifierForfaitPublicitaire(id, payload: payload, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeForfaitsPublicitairesControllerProvider);
      return forfait;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  /// Échoue (via [ApiException], statusCode 409) si des publicités
  /// référencent encore ce forfait. Les lignes rattachées sont
  /// supprimées côté backend dans la même transaction.
  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(publiciteRepositoryProvider)
          .supprimerForfaitPublicitaire(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeForfaitsPublicitairesControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }
}

final crudForfaitsPublicitairesControllerProvider =
AsyncNotifierProvider<CrudForfaitsPublicitairesController, void>(
  CrudForfaitsPublicitairesController.new,
);

/* =========================================================================
 * Lignes d'avantages (ligne_forfait_publicitaire)
 * ========================================================================= */
// Même autorisation que le forfait parent : admin/superadmin. Comme
// les lignes sont toujours renvoyées imbriquées dans leur forfait (pas
// de provider "liste des lignes" séparé), chaque action invalide ici
// [listeForfaitsPublicitairesControllerProvider] — seule source de
// vérité simple à raisonner, même choix que
// [CrudForfaitsPublicitairesController].

/// Ajout / modification / suppression d'une ligne d'avantage
/// rattachée à un forfait publicitaire.
class ActionsLignesForfaitController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<LigneForfaitPublicitaire> ajouter(
      String forfaitId, {
        required String libelleAvantage,
        String? description,
        int? ordreAffichage,
        required String token,
      }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final ligne =
      await ref.read(publiciteRepositoryProvider).ajouterLigneForfait(
        forfaitId,
        libelleAvantage: libelleAvantage,
        description: description,
        ordreAffichage: ordreAffichage,
        token: token,
      );
      state = const AsyncData(null);
      ref.invalidate(listeForfaitsPublicitairesControllerProvider);
      return ligne;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  Future<LigneForfaitPublicitaire> modifier(
      String ligneId, {
        required ModifierLigneForfaitPayload payload,
        required String token,
      }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final ligne = await ref
          .read(publiciteRepositoryProvider)
          .modifierLigneForfait(ligneId, payload: payload, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeForfaitsPublicitairesControllerProvider);
      return ligne;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  Future<String> supprimer(String ligneId, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(publiciteRepositoryProvider)
          .supprimerLigneForfait(ligneId, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeForfaitsPublicitairesControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }
}

final actionsLignesForfaitControllerProvider =
AsyncNotifierProvider<ActionsLignesForfaitController, void>(
  ActionsLignesForfaitController.new,
);

/* =========================================================================
 * Publicités
 * ========================================================================= */
// Même patron de modération que Avis (avis_pharmacie) / candidature
// médecin : toute publicité est créée "en_attente" quel que soit le
// rôle de l'auteur, et n'est visible publiquement qu'une fois
// "validee".

/// Filtres courants du fil de publicités (GET /publicites). Modifier
/// cette valeur déclenche automatiquement un rechargement de
/// [listePublicitesControllerProvider].
final filtresPublicitesProvider = StateProvider<PubliciteFiltres?>(
      (ref) => null,
);

/// Liste des publicités, synchronisée avec [filtresPublicitesProvider].
///
/// Le token est optionnel et volontairement gardé en mémoire locale
/// (via [definirToken]) plutôt que passé à chaque appel : il permet de
/// bénéficier de la vue enrichie (publicités non "validee" pour un
/// admin/superadmin selon `filtres.statutModeration`, ou pour l'auteur
/// ses propres publicités en attente/rejetées) sans que les widgets
/// aient à le repasser à chaque frame — même patron que
/// [ListeMedecinsController].
class ListePublicitesController extends AsyncNotifier<List<Publicite>> {
  String? _token;

  @override
  Future<List<Publicite>> build() {
    ref.listen<PubliciteFiltres?>(filtresPublicitesProvider, (previous, next) {
      if (previous != next) {
        rafraichir();
      }
    });
    return _charger(ref.read(filtresPublicitesProvider));
  }

  Future<List<Publicite>> _charger(PubliciteFiltres? filtres) {
    return ref
        .read(publiciteRepositoryProvider)
        .listerPublicites(filtres: filtres, token: _token);
  }

  /// À appeler après connexion/déconnexion (ou changement de rôle) pour
  /// activer/désactiver la vue enrichie, puis recharge automatiquement
  /// la liste.
  Future<void> definirToken(String? token) async {
    _token = token;
    await rafraichir();
  }

  /// Recharge la liste avec les filtres courants, sans perdre l'état
  /// précédent pendant le chargement (utile pour garder l'ancienne
  /// liste affichée le temps du fetch, cf. `AsyncValue.copyWithPrevious`).
  Future<void> rafraichir() async {
    state = const AsyncLoading<List<Publicite>>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(ref.read(filtresPublicitesProvider)),
    );
  }
}

final listePublicitesControllerProvider =
AsyncNotifierProvider<ListePublicitesController, List<Publicite>>(
  ListePublicitesController.new,
);

/// Fiche d'une publicité par son id (GET /publicites/:id).
/// `autoDispose` : pas de raison de garder une fiche consultée en
/// mémoire une fois l'écran de détail quitté. Passer un [token] permet
/// de voir une publicité non "validee" si l'appelant en est l'auteur
/// ou est admin/superadmin (sinon 404, voir repository).
final publiciteParIdProvider = FutureProvider.autoDispose
    .family<Publicite, ({String id, String? token})>((ref, params) {
  return ref
      .read(publiciteRepositoryProvider)
      .obtenirPublicite(params.id, token: params.token);
});

/// Publicités à afficher sur UNE page précise, identifiée par le CODE
/// de son emplacement (ex. "PAGE_MEDECIN", "PAGE_ACCUEIL"...), plutôt
/// que par l'UUID technique de l'emplacement — voir
/// [PubliciteRepository.listerPublicitesParCodePage]. Pratique pour un
/// écran qui n'a besoin que de « la pub de cette page », sans passer
/// par [listePublicitesControllerProvider] ni par
/// [filtresPublicitesProvider] (partagés, pensés pour un fil listant
/// toutes les publicités).
///
/// `autoDispose` : pas de raison de garder ces données en mémoire une
/// fois l'écran quitté — la pub est rechargée à chaque nouvelle visite
/// de la page. `family` sur un record pour pouvoir varier [paysId] et
/// [token] (vue enrichie admin/superadmin) sans multiplier les
/// providers.
final publicitesParCodePageProvider = FutureProvider.autoDispose.family<
    PublicitesParPageResultat,
    ({String codePage, String? paysId, String? token})>((ref, params) {
  return ref.read(publiciteRepositoryProvider).listerPublicitesParCodePage(
    params.codePage,
    paysId: params.paysId,
    token: params.token,
  );
});

/// Dépôt d'une nouvelle publicité (POST /publicites), ouvert à tout
/// utilisateur authentifié quel que soit son rôle. La publicité créée
/// est toujours "en_attente" côté backend.
class CreationPubliciteController extends AsyncNotifier<Publicite?> {
  @override
  Publicite? build() => null;

  Future<void> soumettre({
    required String forfaitPublicitaireId,
    required String emplacementPublicitaireId,
    required String paysId,
    required String titre,
    required DateTime dateDebut,
    required DateTime dateFin,
    required List<int> visuelOctets,
    required String visuelNomFichier,
    required String token,
  }) async {
    state = const AsyncLoading<Publicite?>().copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final publicite =
      await ref.read(publiciteRepositoryProvider).creerPublicite(
        forfaitPublicitaireId: forfaitPublicitaireId,
        emplacementPublicitaireId: emplacementPublicitaireId,
        paysId: paysId,
        titre: titre,
        dateDebut: dateDebut,
        dateFin: dateFin,
        visuelOctets: visuelOctets,
        visuelNomFichier: visuelNomFichier,
        token: token,
      );
      ref.invalidate(listePublicitesControllerProvider);
      return publicite;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final creationPubliciteControllerProvider =
AsyncNotifierProvider<CreationPubliciteController, Publicite?>(
  CreationPubliciteController.new,
);

/// Modification d'une publicité (PUT /publicites/:id) :
/// - L'auteur peut corriger `payload` (titre/dates) et/ou remplacer le
///   visuel, uniquement tant que la publicité est encore "en_attente"
///   (409 sinon, via [ApiException]).
/// - Un admin/superadmin peut à tout moment changer
///   `payload.statutModeration`, quel que soit le statut courant —
///   c'est ici, et non via des actions dédiées façon
///   [ActionsMedecinController.publier]/`suspendre`, que se fait la
///   modération d'une publicité.
class ModificationPubliciteController extends AsyncNotifier<Publicite?> {
  @override
  Publicite? build() => null;

  Future<void> modifier({
    required String id,
    required String token,
    ModifierPubliciteTextePayload? payload,
    List<int>? visuelOctets,
    String? visuelNomFichier,
  }) async {
    state = const AsyncLoading<Publicite?>().copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final publicite =
      await ref.read(publiciteRepositoryProvider).modifierPublicite(
        id: id,
        token: token,
        payload: payload,
        visuelOctets: visuelOctets,
        visuelNomFichier: visuelNomFichier,
      );
      ref.invalidate(listePublicitesControllerProvider);
      return publicite;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final modificationPubliciteControllerProvider =
AsyncNotifierProvider<ModificationPubliciteController, Publicite?>(
  ModificationPubliciteController.new,
);

/// Suppression d'une publicité (DELETE /publicites/:id), réservée à
/// son auteur (quel que soit son statut) ou à un admin/superadmin.
/// Isolée dans son propre controller `void` plutôt que rattachée à
/// [ModificationPubliciteController] : les deux actions n'ont pas le
/// même type d'état exposé (`Publicite?` vs rien à afficher, juste un
/// indicateur de chargement).
class SuppressionPubliciteController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(publiciteRepositoryProvider)
          .supprimerPublicite(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listePublicitesControllerProvider);
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

final suppressionPubliciteControllerProvider =
AsyncNotifierProvider<SuppressionPubliciteController, void>(
  SuppressionPubliciteController.new,
);