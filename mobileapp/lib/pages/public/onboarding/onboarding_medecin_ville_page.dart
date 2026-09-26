import 'package:flutter/material.dart';
import 'package:riverpod/riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/referentiel_controller.dart';
import '../../../models/referentiel_models.dart';
import '../Medecinpage.dart' show medecinProviderContainer;
import 'onboarding_medecin_specialite_page.dart';
import 'onboarding_progress.dart';

/// Écran 1.1.1 — Choix de la ville (étape 1/2 du sous-parcours « Médecins
/// et professionnels »).
///
/// Portage Flutter de `OnboardingMedecinVille.jsx`. Charge les référentiels
/// Pays / Ville publics ([listePaysProvider] / [villesParPaysProvider],
/// referentiel_controller.dart) via [medecinProviderContainer] — le même
/// [ProviderContainer] que [MedecinPage], pour que le choix fait ici soit
/// bien visible de l'écran de résultats poussé à l'étape suivante.
///
/// ⚠️ Contrairement à la version web, aucune détection automatique du
/// pays par géolocalisation n'est effectuée ici : l'app ne dépend
/// d'aucun package de géolocalisation à ce jour (voir pubspec.yaml). Le
/// pays reste donc à choisir manuellement — à brancher sur un futur
/// service de géolocalisation si besoin (mêmes principes que
/// `src/lib/geoloc.js` côté web : résolution silencieuse, jamais
/// bloquante pour l'écran).
class OnboardingMedecinVillePage extends StatefulWidget {
  const OnboardingMedecinVillePage({super.key});

  @override
  State<OnboardingMedecinVillePage> createState() =>
      _OnboardingMedecinVillePageState();
}

class _OnboardingMedecinVillePageState
    extends State<OnboardingMedecinVillePage> {
  final ProviderContainer _container = medecinProviderContainer;

  late ProviderSubscription<AsyncValue<List<Pays>>> _paysSub;
  AsyncValue<List<Pays>> _paysState = const AsyncLoading();

  ProviderSubscription<AsyncValue<List<Ville>>>? _villesSub;
  AsyncValue<List<Ville>> _villesState = const AsyncData([]);

  String? _paysId;
  String? _villeId;

  @override
  void initState() {
    super.initState();
    _paysSub = _container.listen<AsyncValue<List<Pays>>>(
      listePaysProvider,
      (previous, next) => setState(() => _paysState = next),
      fireImmediately: true,
    );
  }

  @override
  void dispose() {
    _paysSub.close();
    _villesSub?.close();
    super.dispose();
  }

  void _choisirPays(String? paysId) {
    _villesSub?.close();
    _villesSub = null;
    setState(() {
      _paysId = paysId;
      _villeId = null; // le choix de ville précédent ne vaut plus
      _villesState = const AsyncData([]);
    });
    if (paysId == null) return;
    _villesSub = _container.listen<AsyncValue<List<Ville>>>(
      villesParPaysProvider(paysId),
      (previous, next) => setState(() => _villesState = next),
      fireImmediately: true,
    );
  }

  void _allerVersEtapeSpecialite() {
    if (_villeId == null) return;
    final villes = _villesState.value ?? const <Ville>[];
    final ville = villes.where((v) => v.villeId == _villeId).firstOrNull;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => OnboardingMedecinSpecialitePage(
          paysExerciceId: _paysId!,
          villeExerciceId: _villeId!,
          villeNom: ville?.nom,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pays = _paysState.value ?? const <Pays>[];
    final villes = _villesState.value ?? const <Ville>[];
    final chargementPays = _paysState.isLoading;
    final chargementVilles = _villesState.isLoading;

    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(
        backgroundColor: AppColors.paper,
        elevation: 0,
        foregroundColor: AppColors.ink,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const OnboardingProgress(current: 1, total: 2),
              const SizedBox(height: 18),
              const OnboardingHeader(
                eyebrow: 'Médecins et professionnels',
                title: 'Dans quelle ville ?',
              ),
              const SizedBox(height: 22),
              Text('Pays', style: AppTextStyles.cardMeta),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                key: ValueKey('pays-$_paysId'),
                value: _paysId,
                isExpanded: true,
                decoration: _fieldDecoration(
                  chargementPays ? 'Chargement…' : 'Sélectionner…',
                ),
                items: [
                  for (final p in pays)
                    DropdownMenuItem(value: p.paysId, child: Text(p.nom)),
                ],
                onChanged: chargementPays ? null : _choisirPays,
              ),
              const SizedBox(height: 16),
              Text('Ville', style: AppTextStyles.cardMeta),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                key: ValueKey('ville-$_paysId-$_villeId'),
                value: _villeId,
                isExpanded: true,
                decoration: _fieldDecoration(
                  _paysId == null
                      ? "Choisissez d'abord un pays"
                      : chargementVilles
                          ? 'Chargement…'
                          : 'Sélectionner…',
                ),
                items: [
                  for (final v in villes)
                    DropdownMenuItem(value: v.villeId, child: Text(v.nom)),
                ],
                onChanged: (_paysId == null || chargementVilles)
                    ? null
                    : (id) => setState(() => _villeId = id),
              ),
              const SizedBox(height: 28),
              OnboardingNavActions(
                onBack: () => Navigator.of(context).pop(),
                onNext: _villeId == null ? null : _allerVersEtapeSpecialite,
              ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _fieldDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: AppColors.card,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: AppRadius.smRadius,
        borderSide: const BorderSide(color: AppColors.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: AppRadius.smRadius,
        borderSide: const BorderSide(color: AppColors.line),
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
