// lib/controllers/patient_controller.dart
//
// Gestion d'état (Riverpod) du module transverse "Gestion des
// médecins" — périmètre "fiche patient" (Patient), en miroir de
// patient_repository.dart (voir son en-tête) et de patient_models.dart,
// et dans le même esprit que medecin_controller.dart (version
// "annuaire médecin" de ce même module).
//
// Comme annoncé dans l'en-tête de [PatientRepository] : ce fichier
// porte TOUT l'état applicatif (chargement, erreurs, cache mémoire) de
// ce périmètre. Il ne parle jamais HTTP directement — il s'appuie
// uniquement sur [PatientRepository].
//
// Règle du token : identique à [PatientRepository], le token n'est
// JAMAIS conservé de façon persistante ici. Contrairement à
// [ListeMedecinsController] (medecin_controller.dart) qui met en cache
// un token optionnel pour une vue "enrichie", la fiche patient est une
// donnée PRIVÉE et TOUTES les routes l'exigent : le token est donc
// toujours passé explicitement à chaque appel de méthode ci-dessous,
// jamais mis en cache local. Idéalement, ce token provient d'un
// AuthController / authTokenProvider global déjà présent ailleurs dans
// l'app ; ce fichier ne le redéfinit pas et se contente de le recevoir
// en entrée.
//
// ⚠️ Périmètre volontairement identique à celui du repository : fiche
// "Mon profil" patient, consultation d'une fiche patient par id, et
// liste des rendez-vous d'un patient. Prise de rendez-vous, annulation,
// ordonnances sont hors périmètre — à traiter dans des controllers
// dédiés suivant le même patron.

import 'package:riverpod/legacy.dart';
import 'package:riverpod/riverpod.dart';

import '../models/patient_models.dart';
import '../repositories/patient_repository.dart';

/* =========================================================================
 * Dépendances partagées
 * ========================================================================= */

/// Repository ré-exposé ici pour que les widgets n'aient jamais besoin
/// d'importer patient_repository.dart directement.
///
/// [PatientRepository] parle HTTP directement (via le package `http`)
/// et ne prend pas de dépendance en paramètre : pas besoin d'
/// [ApiClient] ici.
final patientRepositoryProvider = Provider<PatientRepository>((ref) {
  return PatientRepository();
});

/* =========================================================================
 * Mon profil (GET /patients/mon-profil)
 * ========================================================================= */

/// Profil complet du patient connecté (fiche patient + statistiques
/// d'activité), pour l'écran "Mon profil" côté patient.
///
/// Réservé au titulaire du compte patient : le [token] doit toujours
/// être celui de la session courante, passé explicitement à [charger]
/// — voir la note sur le token en tête de fichier. `null` tant qu'aucun
/// chargement n'a été déclenché.
class MonProfilPatientController
    extends AsyncNotifier<MonProfilPatientResponse?> {
  @override
  MonProfilPatientResponse? build() => null;

  /// Charge (ou recharge) le profil courant. Conserve l'ancienne
  /// valeur affichée pendant le chargement (utile pour un pull-to-
  /// refresh sans écran de chargement plein).
  Future<void> charger({required String token}) async {
    state = const AsyncLoading<MonProfilPatientResponse?>()
        .copyWithPrevious(state);
    state = await AsyncValue.guard(
          () => ref.read(patientRepositoryProvider).obtenirMonProfil(token: token),
    );
  }

  /// Alias explicite de [charger], pour un bouton "Actualiser" /
  /// pull-to-refresh — évite à l'appelant de re-préciser son intention
  /// via le nom de la méthode.
  Future<void> rafraichir({required String token}) => charger(token: token);

  /// À appeler à la déconnexion, pour ne pas laisser la fiche d'un
  /// patient affichée après un changement de compte.
  void reinitialiser() => state = const AsyncData(null);
}

final monProfilPatientControllerProvider =
AsyncNotifierProvider<MonProfilPatientController, MonProfilPatientResponse?>(
  MonProfilPatientController.new,
);

/// Raccourci pratique pour l'écran "Mon profil" : le prochain
/// rendez-vous à venir du patient connecté (`null` si aucun rendez-
/// vous à venir, ou si le profil n'a pas encore été chargé). Dérivé de
/// [monProfilPatientControllerProvider] plutôt que recalculé côté UI.
final prochainRendezVousProvider = Provider.autoDispose<RendezVousPatient?>((ref) {
  final profil = ref.watch(monProfilPatientControllerProvider).asData?.value;
  return profil?.statistiques.prochainRendezVous;
});

/* =========================================================================
 * Fiche patient par id (GET /patients/:id)
 * ========================================================================= */

/// Fiche d'un patient par son id — vue complète (patient lui-même,
/// admin/superadmin) ou restreinte (médecin tiers ayant un rendez-vous
/// avec ce patient), voir [UtilisateurPatient.estVueComplete].
///
/// `autoDispose` : pas de raison de garder une fiche consultée en
/// mémoire une fois l'écran de détail quitté (donnée privée).
/// `family` : une fiche par couple (id, token) — deux appelants avec
/// des droits différents sur le même patient (ex. le patient lui-même
/// puis un médecin) obtiennent chacun leur propre requête/cache, sans
/// jamais mélanger vue complète et vue restreinte.
final patientParIdProvider = FutureProvider.autoDispose
    .family<Patient, ({String id, String token})>((ref, params) {
  return ref
      .read(patientRepositoryProvider)
      .obtenirPatient(params.id, token: params.token);
});

/* =========================================================================
 * Rendez-vous d'un patient (GET /patients/:id/rendez-vous)
 * ========================================================================= */

/// Filtre de statut courant pour l'écran "rendez-vous d'un patient" —
/// à faire varier (ex. depuis des chips "à venir / honorés / annulés")
/// puis relire via [rendezVousPatientProvider] avec la même valeur.
/// `null` = aucun filtre, tous statuts confondus.
final filtreStatutRendezVousProvider =
StateProvider.autoDispose<StatutRendezVous?>((ref) => null);

/// Liste des rendez-vous du patient [id], du plus récent au plus
/// ancien, filtrée par [statut] si fourni.
///
/// Mêmes règles d'accès que [patientParIdProvider] ; pour un médecin
/// tiers autorisé, seuls SES PROPRES rendez-vous avec ce patient sont
/// renvoyés (jamais le dossier complet) — restriction appliquée côté
/// backend, ce controller ne fait que relayer la réponse.
///
/// `family` : une liste par combinaison (patientId, token, statut).
/// Pour recharger après un changement de [filtreStatutRendezVousProvider],
/// il suffit que le widget appelant relise ce provider avec la nouvelle
/// valeur de statut — Riverpod se charge de refaire la requête et de
/// garder les anciennes combinaisons en cache le temps de l'autoDispose.
final rendezVousPatientProvider = FutureProvider.autoDispose.family<
    List<RendezVousPatient>,
    ({String patientId, String token, StatutRendezVous? statut})>((ref, params) {
  return ref.read(patientRepositoryProvider).listerRendezVousPatient(
    params.patientId,
    token: params.token,
    statut: params.statut,
  );
});

/// Variante pratique de [rendezVousPatientProvider] ne gardant que les
/// rendez-vous à venir (voir [RendezVousPatient.estAVenir]), pour un
/// onglet "à venir" sans dupliquer la logique de filtrage côté widget.
/// Ne fait pas d'appel réseau supplémentaire : dérive simplement le
/// résultat déjà chargé sans filtre de statut.
final rendezVousAVenirPatientProvider = FutureProvider.autoDispose
    .family<List<RendezVousPatient>, ({String patientId, String token})>(
        (ref, params) async {
      final tous = await ref.watch(rendezVousPatientProvider(
        (patientId: params.patientId, token: params.token, statut: null),
      ).future);
      return tous.where((rdv) => rdv.estAVenir).toList();
    });