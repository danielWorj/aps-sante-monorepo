// lib/controllers/pharmacie_controller.dart
//
// Gestion d'état (Riverpod) du module "annuaire — pharmacie" ET de son
// sous-module "Gardes officielles" (planning_garde / garde_pharmacie),
// en miroir de pharmacie_repository.dart (voir son en-tête) et de
// pharmacie_models.dart.
//
// Comme CentreSanteController / MedecinController : ce fichier porte
// TOUT l'état applicatif (chargement, erreurs, sélection courante,
// filtres) des 3 sous-ressources du module (pharmacies, plannings de
// garde, gardes). Il ne parle jamais HTTP directement — il s'appuie
// uniquement sur [PharmacieRepository], qui traduit déjà toute erreur
// réseau en [ApiException].
//
// Règle du token : identique à [PharmacieRepository], le token n'est
// JAMAIS conservé de façon persistante ici. Contrairement à
// [ListeCentresSanteController] / `ListeMedecinsController`, aucun des
// 3 controllers de liste ci-dessous n'a de `definirToken` : les GET de
// ce module sont publics et n'ont, contrairement à listerMedecins, pas
// d'enrichissement conditionnel côté backend en présence d'un token
// (voir l'en-tête de pharmacie_repository.dart). Le token n'est donc
// requis que pour les mutations (create/update/delete), reçu en
// paramètre de chaque appel et jamais stocké. Idéalement ce token
// provient d'un AuthController / authTokenProvider global déjà présent
// ailleurs dans l'app.

import 'package:riverpod/legacy.dart';
import 'package:riverpod/riverpod.dart';

import '../models/pharmacie_models.dart';
import '../repositories/pharmacie_repository.dart';

/* =========================================================================
 * Dépendances partagées
 * ========================================================================= */

/// Repository ré-exposé ici pour que les widgets n'aient jamais besoin
/// d'importer pharmacie_repository.dart directement.
///
/// [PharmacieRepository] parle HTTP directement (via le package `http`)
/// et ne prend plus de dépendance en paramètre : pas besoin d'
/// [ApiClient] ici (voir medecin_controller.dart pour le même patron).
final pharmacieRepositoryProvider = Provider<PharmacieRepository>((ref) {
  return PharmacieRepository();
});

/* =========================================================================
 * Pharmacies (fiche Annuaire) — lecture publique, écriture authentifiée
 * ========================================================================= */

/// Filtres courants de l'annuaire pharmacies (GET /pharmacies :
/// pays_id, ville_id, statut_verification, recherche). N'existe pas
/// dans pharmacie_models.dart (contrairement à `CentresSanteFiltre` côté
/// centres de santé) : ce type de filtre, propre à ce provider, vit
/// donc ici plutôt que dans les modèles.
class PharmaciesFiltre {
  final String? paysId;
  final String? villeId;
  final StatutVerificationPharmacie? statutVerification;
  final String? recherche;

  const PharmaciesFiltre({
    this.paysId,
    this.villeId,
    this.statutVerification,
    this.recherche,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is PharmaciesFiltre &&
              other.paysId == paysId &&
              other.villeId == villeId &&
              other.statutVerification == statutVerification &&
              other.recherche == recherche);

  @override
  int get hashCode =>
      Object.hash(paysId, villeId, statutVerification, recherche);
}

/// Modifier cette valeur (ex: depuis une barre de recherche ou des
/// chips de filtre) déclenche automatiquement un rechargement de
/// [listePharmaciesControllerProvider].
final filtresPharmaciesProvider =
StateProvider<PharmaciesFiltre?>((ref) => null);

/// Liste des pharmacies de l'annuaire, synchronisée avec
/// [filtresPharmaciesProvider].
///
/// Pas de `definirToken` sur ce controller : `GET /pharmacies` est
/// publique et sans enrichissement conditionnel côté backend (voir
/// l'en-tête de ce fichier).
class ListePharmaciesController extends AsyncNotifier<List<Pharmacie>> {
  @override
  Future<List<Pharmacie>> build() {
    // ref.listen (et non ref.watch) : on réagit à un changement de
    // filtres par un rechargement explicite, sans reconstruire cette
    // instance de notifier — même patron que
    // ListeCentresSanteController.
    ref.listen<PharmaciesFiltre?>(filtresPharmaciesProvider, (previous, next) {
      if (previous != next) {
        rafraichir();
      }
    });
    return _charger(ref.read(filtresPharmaciesProvider));
  }

  Future<List<Pharmacie>> _charger(PharmaciesFiltre? filtre) {
    return ref.read(pharmacieRepositoryProvider).listerPharmacies(
      paysId: filtre?.paysId,
      villeId: filtre?.villeId,
      statutVerification: filtre?.statutVerification,
      recherche: filtre?.recherche,
    );
  }

  /// Recharge la liste avec les filtres courants, sans perdre l'état
  /// précédent pendant le chargement (utile pour garder l'ancienne
  /// liste affichée le temps du fetch, cf. `AsyncValue.copyWithPrevious`).
  Future<void> rafraichir() async {
    state = const AsyncLoading<List<Pharmacie>>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(ref.read(filtresPharmaciesProvider)),
    );
  }
}

final listePharmaciesControllerProvider =
AsyncNotifierProvider<ListePharmaciesController, List<Pharmacie>>(
  ListePharmaciesController.new,
);

/// Fiche d'une pharmacie par son id (GET /pharmacies/:id).
/// `autoDispose` : pas de raison de garder une fiche consultée en
/// mémoire une fois l'écran de détail quitté.
final pharmacieParIdProvider =
FutureProvider.autoDispose.family<Pharmacie, String>((ref, id) {
  return ref.read(pharmacieRepositoryProvider).obtenirPharmacie(id);
});

/* -------------------------------------------------------------------------
 * Création (POST /pharmacies)
 * ------------------------------------------------------------------------- */

/// Création d'une pharmacie (+ compte agent associé) — authentifiée,
/// ouverte à tout rôle.
///
/// ⚠️ Le résultat porte le mot de passe temporaire du compte agent créé
/// (voir [AgentPharmacieCree.motDePasseTemporaire]), à n'afficher qu'une
/// seule fois : appeler [reinitialiser] dès que l'utilisateur a quitté
/// l'écran de confirmation, pour ne pas le laisser traîner en mémoire —
/// même précaution que [CreationCentreSanteController].
class CreationPharmacieController
    extends AsyncNotifier<PharmacieCreationResultat?> {
  @override
  PharmacieCreationResultat? build() => null;

  /// [latitude]/[longitude] : à fournir ensemble ou pas du tout — le
  /// repository lève une [ApiException] côté client sinon, pour
  /// échouer vite sans appel réseau inutile (voir
  /// [PharmacieRepository.creerPharmacie]).
  Future<void> soumettre({
    required String token,
    required String nom,
    required String paysId,
    required String villeId,
    required String telephone,
    required StatutVerificationPharmacie statutVerification,
    required String numeroOrdreTitulaire,
    required List<int> imageOctets,
    required String imageNomFichier,
    required List<int> pieceIdentiteOctets,
    required String pieceIdentiteNomFichier,
    required List<int> documentAgrementOctets,
    required String documentAgrementNomFichier,
    required String fonction,
    required String agentNom,
    required String agentPrenom,
    required String agentEmail,
    String? agentTelephone,
    double? latitude,
    double? longitude,
  }) async {
    state = const AsyncLoading<PharmacieCreationResultat?>()
        .copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final resultat =
      await ref.read(pharmacieRepositoryProvider).creerPharmacie(
        token: token,
        nom: nom,
        paysId: paysId,
        villeId: villeId,
        telephone: telephone,
        statutVerification: statutVerification,
        numeroOrdreTitulaire: numeroOrdreTitulaire,
        imageOctets: imageOctets,
        imageNomFichier: imageNomFichier,
        pieceIdentiteOctets: pieceIdentiteOctets,
        pieceIdentiteNomFichier: pieceIdentiteNomFichier,
        documentAgrementOctets: documentAgrementOctets,
        documentAgrementNomFichier: documentAgrementNomFichier,
        fonction: fonction,
        agentNom: agentNom,
        agentPrenom: agentPrenom,
        agentEmail: agentEmail,
        agentTelephone: agentTelephone,
        latitude: latitude,
        longitude: longitude,
      );
      // La nouvelle pharmacie n'apparaîtra dans l'annuaire courant que
      // si elle correspond aux filtres actifs, mais on invalide malgré
      // tout la liste pour ne pas laisser un état obsolète en cache.
      ref.invalidate(listePharmaciesControllerProvider);
      return resultat;
    });
  }

  /// À appeler après que l'utilisateur a quitté l'écran de
  /// confirmation, pour ne pas laisser le mot de passe temporaire de
  /// l'agent en mémoire plus longtemps que nécessaire.
  void reinitialiser() => state = const AsyncData(null);
}

final creationPharmacieControllerProvider = AsyncNotifierProvider<
    CreationPharmacieController, PharmacieCreationResultat?>(
  CreationPharmacieController.new,
);

/* -------------------------------------------------------------------------
 * Modification (PUT /pharmacies/:id)
 * ------------------------------------------------------------------------- */

/// Modification d'une fiche pharmacie — authentifiée, ouverte à tout
/// rôle (le comportement de `statutVerification` dépend du rôle côté
/// serveur : repasse en `en_cours` pour tout non admin/superadmin, voir
/// [PharmacieRepository.modifierPharmacie]).
///
/// Après succès, invalide [listePharmaciesControllerProvider] pour que
/// l'annuaire reflète la mise à jour au prochain accès, plutôt que de
/// dupliquer la logique de fusion dans deux états différents.
class ModificationPharmacieController extends AsyncNotifier<Pharmacie?> {
  @override
  Pharmacie? build() => null;

  Future<void> modifier({
    required String id,
    required String token,
    String? nom,
    String? paysId,
    String? villeId,
    String? telephone,
    StatutVerificationPharmacie? statutVerification,
    String? numeroOrdreTitulaire,
    double? latitude,
    double? longitude,
    List<int>? imageOctets,
    String? imageNomFichier,
    List<int>? pieceIdentiteOctets,
    String? pieceIdentiteNomFichier,
    List<int>? documentAgrementOctets,
    String? documentAgrementNomFichier,
  }) async {
    state = const AsyncLoading<Pharmacie?>().copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final pharmacie =
      await ref.read(pharmacieRepositoryProvider).modifierPharmacie(
        id: id,
        token: token,
        nom: nom,
        paysId: paysId,
        villeId: villeId,
        telephone: telephone,
        statutVerification: statutVerification,
        numeroOrdreTitulaire: numeroOrdreTitulaire,
        latitude: latitude,
        longitude: longitude,
        imageOctets: imageOctets,
        imageNomFichier: imageNomFichier,
        pieceIdentiteOctets: pieceIdentiteOctets,
        pieceIdentiteNomFichier: pieceIdentiteNomFichier,
        documentAgrementOctets: documentAgrementOctets,
        documentAgrementNomFichier: documentAgrementNomFichier,
      );
      ref.invalidate(listePharmaciesControllerProvider);
      return pharmacie;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final modificationPharmacieControllerProvider =
AsyncNotifierProvider<ModificationPharmacieController, Pharmacie?>(
  ModificationPharmacieController.new,
);

/* -------------------------------------------------------------------------
 * Suppression (DELETE /pharmacies/:id)
 * ------------------------------------------------------------------------- */

/// Suppression d'une fiche pharmacie — réservée superadmin côté serveur
/// (tout autre appelant reçoit une [ApiException] 403, à charge du
/// widget appelant de l'afficher).
///
/// L'état exposé ([AsyncNotifier<void>]) ne sert qu'à piloter un
/// indicateur de chargement global (ex: bouton en cours d'action) —
/// [supprimer] renvoie aussi directement le message de confirmation
/// serveur pour que l'appelant puisse réagir immédiatement sans avoir à
/// relire l'état du provider.
class SuppressionPharmacieController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(pharmacieRepositoryProvider)
          .supprimerPharmacie(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listePharmaciesControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      // On relance pour que l'appelant (widget) puisse afficher le
      // message d'erreur précis (ex: 409 "agents encore rattachés") au
      // bon endroit — l'état du provider ne sert ici qu'à l'indicateur
      // de chargement global.
      rethrow;
    }
  }
}

final suppressionPharmacieControllerProvider =
AsyncNotifierProvider<SuppressionPharmacieController, void>(
  SuppressionPharmacieController.new,
);

/* =========================================================================
 * Plannings de garde — lecture publique, écriture admin/superadmin
 * ========================================================================= */

/// Filtres courants des plannings de garde (GET /plannings-garde :
/// pays_id, statut).
class PlanningsGardeFiltre {
  final String? paysId;
  final StatutPlanningGarde? statut;

  const PlanningsGardeFiltre({this.paysId, this.statut});

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is PlanningsGardeFiltre &&
              other.paysId == paysId &&
              other.statut == statut);

  @override
  int get hashCode => Object.hash(paysId, statut);
}

final filtresPlanningsGardeProvider =
StateProvider<PlanningsGardeFiltre?>((ref) => null);

/// Liste des plannings de garde, synchronisée avec
/// [filtresPlanningsGardeProvider]. Le champ `gardes` de chaque
/// [PlanningGarde] reste `null` ici (non peuplé par le listing côté
/// backend) — seul [planningGardeParIdProvider] les inclut.
class ListePlanningsGardeController
    extends AsyncNotifier<List<PlanningGarde>> {
  @override
  Future<List<PlanningGarde>> build() {
    ref.listen<PlanningsGardeFiltre?>(filtresPlanningsGardeProvider,
            (previous, next) {
          if (previous != next) {
            rafraichir();
          }
        });
    return _charger(ref.read(filtresPlanningsGardeProvider));
  }

  Future<List<PlanningGarde>> _charger(PlanningsGardeFiltre? filtre) {
    return ref.read(pharmacieRepositoryProvider).listerPlanningsGarde(
      paysId: filtre?.paysId,
      statut: filtre?.statut,
    );
  }

  Future<void> rafraichir() async {
    state = const AsyncLoading<List<PlanningGarde>>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(ref.read(filtresPlanningsGardeProvider)),
    );
  }
}

final listePlanningsGardeControllerProvider =
AsyncNotifierProvider<ListePlanningsGardeController, List<PlanningGarde>>(
  ListePlanningsGardeController.new,
);

/// Détail d'un planning de garde (GET /plannings-garde/:id), avec ses
/// [PlanningGarde.gardes] peuplées — seul appel du module à les
/// inclure (`include: { gardes: true }` côté backend).
final planningGardeParIdProvider =
FutureProvider.autoDispose.family<PlanningGarde, String>((ref, id) {
  return ref.read(pharmacieRepositoryProvider).obtenirPlanningGarde(id);
});

/// Création d'un planning de garde — réservée admin/superadmin (403
/// sinon côté backend).
class CreationPlanningGardeController extends AsyncNotifier<PlanningGarde?> {
  @override
  PlanningGarde? build() => null;

  Future<void> soumettre({
    required String token,
    required String paysId,
    required StatutPlanningGarde statut,
    required DateTime periodeDebut,
    required DateTime periodeFin,
  }) async {
    state = const AsyncLoading<PlanningGarde?>().copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final planning =
      await ref.read(pharmacieRepositoryProvider).creerPlanningGarde(
        token: token,
        paysId: paysId,
        statut: statut,
        periodeDebut: periodeDebut,
        periodeFin: periodeFin,
      );
      ref.invalidate(listePlanningsGardeControllerProvider);
      return planning;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final creationPlanningGardeControllerProvider =
AsyncNotifierProvider<CreationPlanningGardeController, PlanningGarde?>(
  CreationPlanningGardeController.new,
);

/// Modification d'un planning de garde — réservée admin/superadmin.
class ModificationPlanningGardeController
    extends AsyncNotifier<PlanningGarde?> {
  @override
  PlanningGarde? build() => null;

  Future<void> modifier({
    required String id,
    required String token,
    StatutPlanningGarde? statut,
    DateTime? periodeDebut,
    DateTime? periodeFin,
  }) async {
    state = const AsyncLoading<PlanningGarde?>().copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final planning =
      await ref.read(pharmacieRepositoryProvider).modifierPlanningGarde(
        id: id,
        token: token,
        statut: statut,
        periodeDebut: periodeDebut,
        periodeFin: periodeFin,
      );
      ref.invalidate(listePlanningsGardeControllerProvider);
      return planning;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final modificationPlanningGardeControllerProvider = AsyncNotifierProvider<
    ModificationPlanningGardeController, PlanningGarde?>(
  ModificationPlanningGardeController.new,
);

/// Suppression d'un planning de garde — réservée admin/superadmin.
/// Échoue avec un message clair (via [ApiException], 409) si des
/// gardes sont encore rattachées à ce planning : à charge du widget
/// appelant de l'afficher.
class SuppressionPlanningGardeController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(pharmacieRepositoryProvider)
          .supprimerPlanningGarde(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listePlanningsGardeControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }
}

final suppressionPlanningGardeControllerProvider =
AsyncNotifierProvider<SuppressionPlanningGardeController, void>(
  SuppressionPlanningGardeController.new,
);

/* =========================================================================
 * Gardes (pharmacie <-> créneau) — lecture publique, écriture admin/superadmin
 * ========================================================================= */

/// Filtres courants des gardes (GET /gardes-pharmacie : ville_id,
/// planning_garde_id, pharmacie_id, [instant]). [instant] correspond au
/// cas d'usage "pharmacie de garde maintenant" (voir
/// [PharmacieRepository.listerGardesPharmacie]).
class GardesPharmacieFiltre {
  final String? villeId;
  final String? planningGardeId;
  final String? pharmacieId;
  final DateTime? instant;

  const GardesPharmacieFiltre({
    this.villeId,
    this.planningGardeId,
    this.pharmacieId,
    this.instant,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is GardesPharmacieFiltre &&
              other.villeId == villeId &&
              other.planningGardeId == planningGardeId &&
              other.pharmacieId == pharmacieId &&
              other.instant == instant);

  @override
  int get hashCode =>
      Object.hash(villeId, planningGardeId, pharmacieId, instant);
}

final filtresGardesPharmacieProvider =
StateProvider<GardesPharmacieFiltre?>((ref) => null);

/// Liste des gardes, synchronisée avec [filtresGardesPharmacieProvider].
class ListeGardesPharmacieController
    extends AsyncNotifier<List<GardePharmacie>> {
  @override
  Future<List<GardePharmacie>> build() {
    ref.listen<GardesPharmacieFiltre?>(filtresGardesPharmacieProvider,
            (previous, next) {
          if (previous != next) {
            rafraichir();
          }
        });
    return _charger(ref.read(filtresGardesPharmacieProvider));
  }

  Future<List<GardePharmacie>> _charger(GardesPharmacieFiltre? filtre) {
    return ref.read(pharmacieRepositoryProvider).listerGardesPharmacie(
      villeId: filtre?.villeId,
      planningGardeId: filtre?.planningGardeId,
      pharmacieId: filtre?.pharmacieId,
      instant: filtre?.instant,
    );
  }

  Future<void> rafraichir() async {
    state = const AsyncLoading<List<GardePharmacie>>().copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => _charger(ref.read(filtresGardesPharmacieProvider)),
    );
  }
}

final listeGardesPharmacieControllerProvider = AsyncNotifierProvider<
    ListeGardesPharmacieController, List<GardePharmacie>>(
  ListeGardesPharmacieController.new,
);

/// Fiche d'une garde par son id (GET /gardes-pharmacie/:id).
final gardePharmacieParIdProvider =
FutureProvider.autoDispose.family<GardePharmacie, String>((ref, id) {
  return ref.read(pharmacieRepositoryProvider).obtenirGardePharmacie(id);
});

/// Création d'une garde — réservée admin/superadmin. [dateDebut] doit
/// être strictement antérieure à [dateFin] (voir
/// [PharmacieRepository.creerGardePharmacie]).
class CreationGardePharmacieController
    extends AsyncNotifier<GardePharmacie?> {
  @override
  GardePharmacie? build() => null;

  Future<void> soumettre({
    required String token,
    required String planningGardeId,
    required String pharmacieId,
    required String villeId,
    required DateTime dateDebut,
    required DateTime dateFin,
  }) async {
    state = const AsyncLoading<GardePharmacie?>().copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final garde =
      await ref.read(pharmacieRepositoryProvider).creerGardePharmacie(
        token: token,
        planningGardeId: planningGardeId,
        pharmacieId: pharmacieId,
        villeId: villeId,
        dateDebut: dateDebut,
        dateFin: dateFin,
      );
      ref.invalidate(listeGardesPharmacieControllerProvider);
      return garde;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final creationGardePharmacieControllerProvider = AsyncNotifierProvider<
    CreationGardePharmacieController, GardePharmacie?>(
  CreationGardePharmacieController.new,
);

/// Modification d'une garde — réservée admin/superadmin.
class ModificationGardePharmacieController
    extends AsyncNotifier<GardePharmacie?> {
  @override
  GardePharmacie? build() => null;

  Future<void> modifier({
    required String id,
    required String token,
    String? pharmacieId,
    String? villeId,
    DateTime? dateDebut,
    DateTime? dateFin,
  }) async {
    state = const AsyncLoading<GardePharmacie?>().copyWithPrevious(state);
    state = await AsyncValue.guard(() async {
      final garde =
      await ref.read(pharmacieRepositoryProvider).modifierGardePharmacie(
        id: id,
        token: token,
        pharmacieId: pharmacieId,
        villeId: villeId,
        dateDebut: dateDebut,
        dateFin: dateFin,
      );
      ref.invalidate(listeGardesPharmacieControllerProvider);
      return garde;
    });
  }

  void reinitialiser() => state = const AsyncData(null);
}

final modificationGardePharmacieControllerProvider = AsyncNotifierProvider<
    ModificationGardePharmacieController, GardePharmacie?>(
  ModificationGardePharmacieController.new,
);

/// Suppression d'une garde — réservée admin/superadmin.
class SuppressionGardePharmacieController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<String> supprimer(String id, {required String token}) async {
    state = const AsyncLoading<void>().copyWithPrevious(state);
    try {
      final message = await ref
          .read(pharmacieRepositoryProvider)
          .supprimerGardePharmacie(id, token: token);
      state = const AsyncData(null);
      ref.invalidate(listeGardesPharmacieControllerProvider);
      return message;
    } catch (e, pile) {
      state = AsyncError<void>(e, pile);
      rethrow;
    }
  }
}

final suppressionGardePharmacieControllerProvider =
AsyncNotifierProvider<SuppressionGardePharmacieController, void>(
  SuppressionGardePharmacieController.new,
);