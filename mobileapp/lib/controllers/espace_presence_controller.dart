// lib/controllers/espace_presence_controller.dart
//
// État Riverpod des espaces pharmacie et centre de santé (une famille de
// providers par type). La fiche est celle de l'ESPACE ACTIF de la session :
// elle est relue quand le compte ou l'espace change. Les écrans invalident
// ces providers après chaque action ; les appels passent par
// `appelAuthentifie` (renouvellement du jeton sur 401).

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/espace_presence_models.dart';
import '../repositories/espace_presence_repository.dart';
import 'authentification_controller.dart';

final espacePresenceRepositoryProvider = Provider<EspacePresenceRepository>((ref) => EspacePresenceRepository());

Future<T> appelPresence<T>(Ref ref, Future<T> Function(EspacePresenceRepository repo, String token) appel) {
  final repo = ref.read(espacePresenceRepositoryProvider);
  return ref.read(sessionControllerProvider.notifier).appelAuthentifie((token) => appel(repo, token));
}

Future<T> appelPresenceUi<T>(WidgetRef ref, Future<T> Function(EspacePresenceRepository repo, String token) appel) {
  final repo = ref.read(espacePresenceRepositoryProvider);
  return ref.read(sessionControllerProvider.notifier).appelAuthentifie((token) => appel(repo, token));
}

/// Fiche de l'espace actif (404 : aucune fiche rattachée dans cet espace).
final maFichePresenceProvider = FutureProvider.family<FichePresence, TypeEspacePresence>((ref, type) {
  ref.watch(authUtilisateurProvider.select((u) => (u?.utilisateurId, u?.espaceActif)));
  return appelPresence(ref, (repo, token) => repo.maFiche(type, token: token));
});

final tableauDeBordPresenceProvider =
    FutureProvider.autoDispose.family<TableauDeBordPresence, ({TypeEspacePresence type, int jours})>((ref, cle) async {
  final fiche = await ref.watch(maFichePresenceProvider(cle.type).future);
  return appelPresence(ref, (repo, token) => repo.tableauDeBord(cle.type, fiche.id, token: token, jours: cle.jours));
});

final photosPresenceProvider = FutureProvider.autoDispose.family<PhotosPresenceGestion, TypeEspacePresence>((ref, type) async {
  final fiche = await ref.watch(maFichePresenceProvider(type).future);
  return appelPresence(ref, (repo, token) => repo.photos(type, fiche.id, token: token));
});

final actualitesPresenceProvider = FutureProvider.autoDispose.family<ActualitesPresenceGestion, TypeEspacePresence>((ref, type) async {
  final fiche = await ref.watch(maFichePresenceProvider(type).future);
  return appelPresence(ref, (repo, token) => repo.actualites(type, fiche.id, token: token));
});

/// Messages : [statut] null = boîte de réception (tous sauf archivés).
final messagesPresenceProvider =
    FutureProvider.autoDispose.family<MessagesPresence, ({TypeEspacePresence type, String? statut})>((ref, cle) async {
  final fiche = await ref.watch(maFichePresenceProvider(cle.type).future);
  return appelPresence(ref, (repo, token) => repo.messages(cle.type, fiche.id, token: token, statut: cle.statut));
});

/// Nombre de messages non lus (pastille de l'onglet Messages).
final messagesNonLusPresenceProvider = FutureProvider.autoDispose.family<int, TypeEspacePresence>((ref, type) async {
  final m = await ref.watch(messagesPresenceProvider((type: type, statut: 'non_lu')).future);
  return m.compteurs['non_lu'] ?? 0;
});

final gardesPresenceProvider = FutureProvider.autoDispose.family<List<GardePresence>, bool>((ref, passees) async {
  final fiche = await ref.watch(maFichePresenceProvider(TypeEspacePresence.pharmacie).future);
  return appelPresence(ref, (repo, token) => repo.gardes(fiche.id, token: token, passees: passees));
});

final avisPresenceProvider = FutureProvider.autoDispose<AvisPresenceGestion>((ref) async {
  final fiche = await ref.watch(maFichePresenceProvider(TypeEspacePresence.pharmacie).future);
  return appelPresence(ref, (repo, token) => repo.avis(fiche.id, token: token));
});

final prestationsPresenceProvider = FutureProvider.autoDispose<PrestationsGestion>((ref) async {
  final fiche = await ref.watch(maFichePresenceProvider(TypeEspacePresence.structure).future);
  return appelPresence(ref, (repo, token) => repo.prestations(fiche.id, token: token));
});

final gestionAbonnementPresenceProvider = FutureProvider.autoDispose.family<GestionAbonnementPresence, TypeEspacePresence>((ref, type) async {
  final fiche = await ref.watch(maFichePresenceProvider(type).future);
  return appelPresence(ref, (repo, token) => repo.gestionAbonnement(type, fiche.id, token: token));
});

final offresPresenceProvider = FutureProvider.autoDispose.family<OffresPresence, TypeEspacePresence>((ref, type) async {
  final fiche = await ref.watch(maFichePresenceProvider(type).future);
  return appelPresence(ref, (repo, token) => repo.offres(type, fiche.id, token: token));
});
