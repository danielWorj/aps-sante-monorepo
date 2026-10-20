// lib/controllers/annonce_controller.dart
//
// Annonces reçues — état Riverpod. Les annonces sont diffusées à tous
// (aucun destinataire côté serveur) : on retient donc, par compte et sur
// cet appareil, la date de la dernière visite de la page « Annonces ».
// Toute annonce en cours publiée après est « nouvelle » (pastille de la
// cloche, étiquette sur la carte). Même règle que annoncesVues.js (web).

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:riverpod/riverpod.dart';

import '../models/annonce_models.dart';
import '../repositories/annonce_repository.dart';
import 'authentification_controller.dart';

final annonceRepositoryProvider = Provider<AnnonceRepository>((ref) => AnnonceRepository());

/// Annonces non désactivées, expirées comprises (la page filtre « En cours »).
final annoncesRecuesProvider = FutureProvider.autoDispose<List<Annonce>>((ref) {
  return ref.read(annonceRepositoryProvider).lister();
});

/// Annonces en cours, pour la pastille (provider gardé en vie par les shells).
final annoncesEnCoursProvider = FutureProvider<List<Annonce>>((ref) {
  ref.watch(authUtilisateurProvider.select((u) => u?.utilisateurId));
  return ref.read(annonceRepositoryProvider).lister(seulementEnCours: true);
});

/// Date de la dernière visite de la page Annonces (`null` : jamais).
class DerniereVisiteAnnonces extends AsyncNotifier<DateTime?> {
  static const _stockage = FlutterSecureStorage();

  String? get _cle {
    final id = ref.read(authUtilisateurProvider)?.utilisateurId;
    return id == null ? null : 'aps_annonces_vues_$id';
  }

  @override
  Future<DateTime?> build() async {
    ref.watch(authUtilisateurProvider.select((u) => u?.utilisateurId));
    final cle = _cle;
    if (cle == null) return null;
    try {
      final v = await _stockage.read(key: cle);
      return v == null ? null : DateTime.tryParse(v);
    } catch (_) {
      return null;
    }
  }

  Future<void> marquerVues() async {
    final maintenant = DateTime.now();
    state = AsyncData(maintenant);
    final cle = _cle;
    if (cle == null) return;
    try {
      await _stockage.write(key: cle, value: maintenant.toIso8601String());
    } catch (_) {
      // Stockage indisponible : la pastille reviendra au prochain lancement.
    }
  }
}

final derniereVisiteAnnoncesProvider =
    AsyncNotifierProvider<DerniereVisiteAnnonces, DateTime?>(DerniereVisiteAnnonces.new);

bool annonceNouvelle(Annonce a, DateTime? depuis) => depuis == null || a.dateCreation.isAfter(depuis);

/// Nombre d'annonces en cours publiées depuis la dernière visite.
final annoncesNonLuesProvider = Provider<int>((ref) {
  if (ref.watch(authUtilisateurProvider) == null) return 0;
  final annonces = ref.watch(annoncesEnCoursProvider).value ?? const [];
  final visite = ref.watch(derniereVisiteAnnoncesProvider);
  if (visite.isLoading) return 0;
  return annonces.where((a) => annonceNouvelle(a, visite.value)).length;
});
