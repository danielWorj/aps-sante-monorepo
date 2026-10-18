// lib/controllers/portail_assurance_controller.dart
//
// Portail assurance — état Riverpod des écrans de l'agent. Toutes les
// lectures passent par `appelAuthentifie` (renouvellement du token sur 401)
// et se relancent quand la session change. Les écrans invalident ces
// providers après chaque action.

import 'package:riverpod/riverpod.dart';

import '../models/portail_assurance_models.dart';
import '../repositories/portail_assurance_repository.dart';
import 'authentification_controller.dart';

final portailAssuranceRepositoryProvider =
    Provider<PortailAssuranceRepository>((ref) => PortailAssuranceRepository());

/// Exécute un appel authentifié du portail (raccourci pour les écrans).
Future<T> appelPortail<T>(Ref ref, Future<T> Function(PortailAssuranceRepository repo, String token) appel) {
  final repo = ref.read(portailAssuranceRepositoryProvider);
  return ref.read(sessionControllerProvider.notifier).appelAuthentifie((token) => appel(repo, token));
}

/// Fiche gérée par le compte connecté (404 : aucune fiche rattachée).
final maFicheAssuranceProvider = FutureProvider<FicheAssuranceGeree>((ref) {
  ref.watch(authUtilisateurProvider.select((u) => u?.utilisateurId));
  return appelPortail(ref, (repo, token) => repo.maFiche(token: token));
});

/// Tableau de bord sur `jours` jours (7, 30 ou 90).
final tableauDeBordAssuranceProvider =
    FutureProvider.autoDispose.family<TableauDeBordAssurance, int>((ref, jours) async {
  final fiche = await ref.watch(maFicheAssuranceProvider.future);
  return appelPortail(ref, (repo, token) => repo.tableauDeBord(fiche.id, token: token, jours: jours));
});

/// Vue propriétaire complète (profil + abonnement).
final gestionAssuranceProvider = FutureProvider.autoDispose<GestionAssurance>((ref) async {
  final fiche = await ref.watch(maFicheAssuranceProvider.future);
  return appelPortail(ref, (repo, token) => repo.gestion(fiche.id, token: token));
});

final mediasAssuranceProvider = FutureProvider.autoDispose<MediasGestion>((ref) async {
  final fiche = await ref.watch(maFicheAssuranceProvider.future);
  return appelPortail(ref, (repo, token) => repo.medias(fiche.id, token: token));
});

/// Filtre de la liste des demandes : statut ('' = toutes) et page.
typedef FiltreDemandes = ({String statut, String recherche, int page});

final demandesAssuranceProvider =
    FutureProvider.autoDispose.family<PageDemandes, FiltreDemandes>((ref, filtre) async {
  final fiche = await ref.watch(maFicheAssuranceProvider.future);
  return appelPortail(
    ref,
    (repo, token) => repo.demandes(
      fiche.id,
      token: token,
      statut: filtre.statut,
      recherche: filtre.recherche,
      page: filtre.page,
    ),
  );
});

/// Nombre de demandes « nouvelles » (pastille de la barre basse).
final nouvellesDemandesAssuranceProvider = FutureProvider.autoDispose<int>((ref) async {
  final fiche = await ref.watch(maFicheAssuranceProvider.future);
  final page = await appelPortail(ref, (repo, token) => repo.demandes(fiche.id, token: token, limite: 1));
  return page.compteurs['nouvelle'] ?? 0;
});

final offresAbonnementAssuranceProvider = FutureProvider.autoDispose<OffresAbonnementAssurance>((ref) async {
  final fiche = await ref.watch(maFicheAssuranceProvider.future);
  return appelPortail(ref, (repo, token) => repo.offres(fiche.id, token: token));
});
