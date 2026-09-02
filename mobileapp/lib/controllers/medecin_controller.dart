// lib/controllers/medecin_controller.dart
//
// Gestion d'état (Riverpod) du module "Gestion des médecins" —
// périmètre "fiche Annuaire" (Medecin, Specialite), en miroir de
// medecin_repository.dart (voir son en-tête) et de medecin_models.dart.
//
// Comme annoncé dans l'en-tête de MedecinRepository : ce fichier porte
// TOUT l'état applicatif (chargement, erreurs, sélection courante,
// filtres) de ce module. Il ne parle jamais HTTP directement — il
// s'appuie uniquement sur [MedecinRepository].
//
// Règle du token : identique à [ApiClient] et [MedecinRepository], le
// token n'est JAMAIS conservé de façon persistante ici. Chaque
// controller qui en a besoin le reçoit en paramètre de ses méthodes ;
// certains le mettent en cache mémoire (durée de vie du provider
// uniquement, perdu à l'invalidation) pour éviter d'avoir à le
// repasser à chaque rafraîchissement — voir [ListeMedecinsController].
// Idéalement, ce token provient d'un AuthController /
// authTokenProvider global déjà présent ailleurs dans l'app ; ce
// fichier ne le redéfinit pas et se contente de le recevoir en entrée.
//
// ⚠️ Périmètre volontairement identique à celui du repository : fiche
// médecin + référentiel Spécialités uniquement. Avis médecin,
// Abonnements médecin, Rendez-vous, Ordonnances, Agenda sont hors
// périmètre — à traiter dans des controllers dédiés suivant le même
// patron.

import 'package:riverpod/legacy.dart';
import 'package:riverpod/riverpod.dart';

import '../models/medecin_models.dart';
import '../repositories/medecin_repository.dart';

/* =========================================================================
 * Dépendances partagées
 * ========================================================================= */

/// Repository ré-exposé ici pour que les widgets n'aient jamais besoin
/// d'importer medecin_repository.dart directement.
///
/// [MedecinRepository] parle HTTP directement (via le package `http`)
/// et ne prend plus de dépendance en paramètre : pas besoin d'
/// [ApiClient] ici.
final medecinRepositoryProvider = Provider<MedecinRepository>((ref) {
  return MedecinRepository();
});

/* =========================================================================
 * Médecins (fiche Annuaire)
 * ========================================================================= */

/// Filtres courants de l'annuaire (GET /medecins). Modifier cette
/// valeur (ex: depuis une barre de recherche ou des chips de filtre)
/// déclenche automatiquement un rechargement de
/// [listeMedecinsControllerProvider].
final filtresMedecinsProvider = StateProvider<MedecinFiltres?>((ref) => null);

/// Liste des médecins de l'annuaire, synchronisée avec
/// [filtresMedecinsProvider].
///
/// Le token est optionnel et volontairement gardé en mémoire locale
/// (via [definirToken]) plutôt que passé à chaque appel : il permet de
/// bénéficier de la vue enrichie (email/téléphone) pour un
/// admin/superadmin connecté, sans que les widgets aient à le
/// repasser à chaque frame.
class ListeMedecinsController extends AsyncNotifier<List<Medecin>> {
  String? _token;

  @override
  Future<List<Medecin>> build() {
    // ref.listen (et non ref.watch) : on réagit à un changement de
    // filtres par un rechargement explicite, sans reconstruire cette
    // instance de notifier (on garderait sinon un _token réinitialisé
    // à chaque changement de filtre).
    ref.listen<MedecinFiltres?>(filtresMedecinsProvider, (previous, next) {
      if (previous != next) {
        rafraichir();
      }
    });
    return _charger(ref.read(filtresMedecinsProvider));
  }

  Future<List<Medecin>> _charger(MedecinFiltres? filtres) {
    return ref
        .read(medecinRepositoryProvider)
        .listerMedecins(filtres: filtres, token: _token);
  }

  /// À appeler après connexion/déconnexion pour activer/désactiver la
  /// vue enrichie, puis recharge automatiquement la liste.
  Future<void> definirToken(String? token) async {
    _token = token;
    await rafraichir();
  }

  /// Recharge la liste avec les filtres courants, sans perdre l'état
  /// précédent pendant le chargement (utile pour garder l'ancienne
  /// liste affichée le temps du fetch, cf. `AsyncValue.copyWithPrevious`).
  Future<void> rafraichir() async {
    state = const AsyncLoading<List<Medecin>>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(ref.read(filtresMedecinsProvider)),
    );
  }
}

final listeMedecinsControllerProvider =
AsyncNotifierProvider<ListeMedecinsController, List<Medecin>>(
  ListeMedecinsController.new,
);

/// Fiche d'un médecin par son id (GET /medecins/:id).
/// `autoDispose` : pas de raison de garder une fiche consultée en
/// mémoire une fois l'écran de détail quitté.
final medecinParIdProvider = FutureProvider.autoDispose
    .family<Medecin, ({String id, String? token})>((ref, params) {
  return ref
      .read(medecinRepositoryProvider)
      .obtenirMedecin(params.id, token: params.token);
});

/// Profil complet du médecin connecté (GET /medecins/mon-profil).
/// Contrairement à [ListeMedecinsController], le token n'est jamais
/// mis en cache ici : il doit être fourni explicitement à [charger],
/// ce qui force l'appelant (écran "Mon profil") à toujours passer le
/// token courant de la session.
class MonProfilMedecinController extends AsyncNotifier<MonProfilMedecin?> {
  @override
  MonProfilMedecin? build() => null;

  Future<void> charger({required String token}) async {
    state = const AsyncLoading<MonProfilMedecin?>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => ref.read(medecinRepositoryProvider).obtenirMonProfil(token: token),
    );
  }

  void reinitialiser() => state = const AsyncData(null);
}

final monProfilMedecinControllerProvider =
AsyncNotifierProvider<MonProfilMedecinController, MonProfilMedecin?>(
  MonProfilMedecinController.new,
);

/// Candidature médecin (POST /medecins).
///
/// ⚠️ Le résultat porte le mot de passe temporaire du compte créé
/// (voir [UtilisateurCreeMedecin]), à n'afficher qu'une seule fois :
/// appeler [reinitialiser] dès que l'utilisateur a quitté l'écran de
/// confirmation, pour ne pas le laisser traîner en mémoire.
class CreationMedecinController
    extends AsyncNotifier<MedecinCreationResultat?> {
  @override
  MedecinCreationResultat? build() => null;

  Future<void> soumettre({
    required CreerMedecinPayload payload,
    required List<int> cniOctets,
    required String cniNomFichier,
    required List<int> attestationOctets,
    required String attestationNomFichier,
    List<int>? photoOctets,
    String? photoNomFichier,
  }) async {
    state =
        const AsyncLoading<MedecinCreationResultat?>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => ref.read(medecinRepositoryProvider).creerMedecin(
        payload: payload,
        cniOctets: cniOctets,
        cniNomFichier: cniNomFichier,
        attestationOctets: attestationOctets,
        attestationNomFichier: attestationNomFichier,
        photoOctets: photoOctets,
        photoNomFichier: photoNomFichier,
      ),
    );
  }

  void reinitialiser() => state = const AsyncData(null);
}

final creationMedecinControllerProvider =
AsyncNotifierProvider<CreationMedecinController, MedecinCreationResultat?>(
  CreationMedecinController.new,
);

/// Modification d'une fiche médecin (PUT /medecins/:id).
/// Après succès, invalide [listeMedecinsControllerProvider] pour que
/// l'annuaire reflète la mise à jour au prochain accès, plutôt que de
/// dupliquer la logique de fusion dans deux états différents.
class ModificationMedecinController extends AsyncNotifier<Medecin?> {
  @override
  Medecin? build() => null;

  Future<void> modifier({
    required String id,
    required String token,
    ModifierMedecinPayload? payload,
    List<int>? cniOctets,
    String? cniNomFichier,
    List<int>? attestationOctets,
    String? attestationNomFichier,
    List<int>? photoOctets,
    String? photoNomFichier,
    List<int>? cvOctets,
    String? cvNomFichier,
  }) async {
    state = const AsyncLoading<Medecin?>().copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final medecin = await ref.read(medecinRepositoryProvider).modifierMedecin(
        id: id,
        token: token,
        payload: payload,
        cniOctets: cniOctets,
        cniNomFichier: cniNomFichier,
        attestationOctets: attestationOctets,
        attestationNomFichier: attestationNomFichier,
        photoOctets: photoOctets,
        photoNomFichier: photoNomFichier,
        cvOctets: cvOctets,
        cvNomFichier: cvNomFichier,
      );
      ref.invalidate(listeMedecinsControllerProvider);
      return medecin;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final modificationMedecinControllerProvider =
AsyncNotifierProvider<ModificationMedecinController, Medecin?>(
  ModificationMedecinController.new,
);

/// Actions d'administration sur une fiche médecin : publier,
/// suspendre, réactiver, supprimer (toutes réservées admin/superadmin
/// côté backend, sauf indication contraire dans le repository).
///
/// L'état exposé ([AsyncNotifier<void>]) ne sert qu'à piloter un
/// indicateur de chargement global (ex: bouton en cours d'action) —
/// chaque méthode renvoie aussi directement son résultat pour que
/// l'appelant puisse réagir immédiatement (ex: afficher le message,
/// ou le [MedecinActionResultat.medecin] mis à jour) sans avoir à
/// relire l'état du provider.
class ActionsMedecinController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<MedecinActionResultat> publier(
      String id, {
        required String token,
      }) {
    return _executer(
          () => ref.read(medecinRepositoryProvider).publierMedecin(
        id,
        token: token,
      ),
    );
  }

  Future<MedecinActionResultat> suspendre(
      String id, {
        required String token,
      }) {
    return _executer(
          () => ref.read(medecinRepositoryProvider).suspendreMedecin(
        id,
        token: token,
      ),
    );
  }

  /// Ne republie PAS automatiquement la fiche — voir la note sur
  /// [MedecinActionResultat] côté modèles : appeler [publier] ensuite
  /// si nécessaire.
  Future<String> reactiver(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(medecinRepositoryProvider)
          .reactiverMedecin(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeMedecinsControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(medecinRepositoryProvider)
          .supprimerMedecin(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeMedecinsControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  Future<MedecinActionResultat> _executer(
      Future<MedecinActionResultat> Function() action,
      ) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final resultat = await action();
      state = const AsyncData(null);
      ref.invalidate(listeMedecinsControllerProvider);
      return resultat;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      // On relance pour que l'appelant (widget) puisse afficher le
      // message d'erreur précis (ApiException) au bon endroit — l'état
      // du provider ne sert ici qu'à l'indicateur de chargement global.
      rethrow;
    }
  }
}

final actionsMedecinControllerProvider =
AsyncNotifierProvider<ActionsMedecinController, void>(
  ActionsMedecinController.new,
);

/// Vérification d'appartenance au Tableau de l'Ordre National des
/// Médecins (ONMC), indépendante de tout compte local — typiquement
/// utilisée en pré-validation du numéro d'ordre avant de lancer
/// [CreationMedecinController.soumettre].
///
/// `autoDispose` : chaque numéro vérifié a son propre résultat mis en
/// cache le temps de l'écran, sans persister au-delà.
final verificationOrdreProvider = FutureProvider.autoDispose
    .family<VerificationOrdreResultat, String>((ref, numeroOrdre) {
  return ref
      .read(medecinRepositoryProvider)
      .verifierAppartenanceOrdre(numeroOrdre);
});

/* =========================================================================
 * Spécialités médicales (référentiel)
 * ========================================================================= */

/// Filtre de recherche courant sur le référentiel Spécialités.
final rechercheSpecialitesProvider = StateProvider<String?>((ref) => null);

/// Liste des spécialités, synchronisée avec
/// [rechercheSpecialitesProvider] — même patron que
/// [ListeMedecinsController], en plus simple (route entièrement
/// publique, pas de notion de token enrichi).
class ListeSpecialitesController extends AsyncNotifier<List<Specialite>> {
  @override
  Future<List<Specialite>> build() {
    ref.listen<String?>(rechercheSpecialitesProvider, (previous, next) {
      if (previous != next) {
        rafraichir();
      }
    });
    return _charger(ref.read(rechercheSpecialitesProvider));
  }

  Future<List<Specialite>> _charger(String? recherche) {
    return ref
        .read(medecinRepositoryProvider)
        .listerSpecialites(recherche: recherche);
  }

  Future<void> rafraichir() async {
    state = const AsyncLoading<List<Specialite>>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(ref.read(rechercheSpecialitesProvider)),
    );
  }
}

final listeSpecialitesControllerProvider =
AsyncNotifierProvider<ListeSpecialitesController, List<Specialite>>(
  ListeSpecialitesController.new,
);

/// Fiche d'une spécialité par son id (GET /specialites/:id).
final specialiteParIdProvider =
FutureProvider.autoDispose.family<Specialite, String>((ref, id) {
  return ref.read(medecinRepositoryProvider).obtenirSpecialite(id);
});

/// Création / modification / suppression d'une spécialité (réservées
/// admin/superadmin, suppression réservée superadmin — voir
/// repository). Chaque méthode invalide
/// [listeSpecialitesControllerProvider] après succès plutôt que de
/// modifier la liste en place, pour rester la seule source de vérité
/// simple à raisonner.
class CrudSpecialitesController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<Specialite> creer({
    required String nom,
    String? description,
    required String token,
  }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final specialite = await ref.read(medecinRepositoryProvider).creerSpecialite(
        nom: nom,
        description: description,
        token: token,
      );
      state = const AsyncData(null);
      ref.invalidate(listeSpecialitesControllerProvider);
      return specialite;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  Future<Specialite> modifier(
      String id, {
        required ModifierSpecialitePayload payload,
        required String token,
      }) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final specialite =
      await ref.read(medecinRepositoryProvider).modifierSpecialite(
        id,
        payload: payload,
        token: token,
      );
      state = const AsyncData(null);
      ref.invalidate(listeSpecialitesControllerProvider);
      return specialite;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }

  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(medecinRepositoryProvider)
          .supprimerSpecialite(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeSpecialitesControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }
}

final crudSpecialitesControllerProvider =
AsyncNotifierProvider<CrudSpecialitesController, void>(
  CrudSpecialitesController.new,
);