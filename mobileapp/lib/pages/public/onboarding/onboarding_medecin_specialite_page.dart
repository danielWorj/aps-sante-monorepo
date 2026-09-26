import 'package:flutter/material.dart';
import 'package:riverpod/riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/medecin_controller.dart';
import '../../../models/medecin_models.dart';
import '../Medecinpage.dart' show MedecinPage, medecinProviderContainer;
import 'onboarding_medecin_ville_page.dart';
import 'onboarding_progress.dart';

/// Écran 1.1.2 — Choix de la spécialité (étape 2/2 du sous-parcours
/// « Médecins et professionnels », après la ville — voir
/// [OnboardingMedecinVillePage]).
///
/// Portage Flutter de `OnboardingMedecinSpecialite.jsx`. Charge le
/// référentiel des spécialités via [listeSpecialitesControllerProvider]
/// (medecin_controller.dart, GET /specialites, public) et le présente
/// sous forme de cartes sélectionnables.
///
/// Au tap sur « Voir les médecins » : pose les filtres choisis
/// (ville + pays d'exercice + spécialité) dans [filtresMedecinsProvider]
/// — porté par [medecinProviderContainer], le même container que
/// [MedecinPage] — puis pousse cet écran, qui les lira immédiatement au
/// premier chargement de sa liste.
class OnboardingMedecinSpecialitePage extends StatefulWidget {
  const OnboardingMedecinSpecialitePage({
    super.key,
    required this.paysExerciceId,
    required this.villeExerciceId,
    this.villeNom,
  });

  final String paysExerciceId;
  final String villeExerciceId;
  final String? villeNom;

  @override
  State<OnboardingMedecinSpecialitePage> createState() =>
      _OnboardingMedecinSpecialitePageState();
}

class _OnboardingMedecinSpecialitePageState
    extends State<OnboardingMedecinSpecialitePage> {
  final ProviderContainer _container = medecinProviderContainer;

  late ProviderSubscription<AsyncValue<List<Specialite>>> _specialitesSub;
  AsyncValue<List<Specialite>> _specialitesState = const AsyncLoading();

  String? _specialiteId;

  @override
  void initState() {
    super.initState();
    _specialitesSub = _container.listen<AsyncValue<List<Specialite>>>(
      listeSpecialitesControllerProvider,
      (previous, next) => setState(() => _specialitesState = next),
      fireImmediately: true,
    );
  }

  @override
  void dispose() {
    _specialitesSub.close();
    super.dispose();
  }

  void _voirLesMedecins() {
    if (_specialiteId == null) return;
    _container.read(filtresMedecinsProvider.notifier).state = MedecinFiltres(
      specialiteId: _specialiteId,
      villeExerciceId: widget.villeExerciceId,
      paysExerciceId: widget.paysExerciceId,
    );
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => MedecinPage(container: _container),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final chargement = _specialitesState.isLoading;
    final erreur = _specialitesState.hasError
        ? _specialitesState.error.toString()
        : null;
    final specialites = _specialitesState.value ?? const <Specialite>[];

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
              const OnboardingProgress(current: 2, total: 2),
              const SizedBox(height: 18),
              OnboardingHeader(
                eyebrow: 'Médecins et professionnels',
                title: 'Quelle spécialité recherchez-vous ?',
                subtitle: widget.villeNom != null
                    ? 'Recherche à : ${widget.villeNom}'
                    : null,
              ),
              const SizedBox(height: 22),
              if (chargement)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 32),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (erreur != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Text(
                    erreur,
                    textAlign: TextAlign.center,
                    style: AppTextStyles.body.copyWith(color: AppColors.danger),
                  ),
                )
              else if (specialites.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(
                    child: Text('Aucune spécialité disponible pour le moment.'),
                  ),
                )
              else
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    for (final s in specialites)
                      _SpecialiteChip(
                        label: s.nom,
                        selected: _specialiteId == s.specialiteId,
                        onTap: () =>
                            setState(() => _specialiteId = s.specialiteId),
                      ),
                  ],
                ),
              const SizedBox(height: 28),
              OnboardingNavActions(
                onBack: () => Navigator.of(context).pop(),
                onNext: _specialiteId == null ? null : _voirLesMedecins,
                nextLabel: 'Voir les médecins',
                nextIcon: Icons.search,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Carte sélectionnable pour une spécialité, équivalent de
/// `.service-type-opt` / `.opt-card` côté web.
class _SpecialiteChip extends StatelessWidget {
  const _SpecialiteChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primary : AppColors.card,
      borderRadius: AppRadius.smRadius,
      child: InkWell(
        borderRadius: AppRadius.smRadius,
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: AppRadius.smRadius,
            border: Border.all(
              color: selected ? AppColors.primary : AppColors.line,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.medical_services_outlined,
                size: 16,
                color: selected ? Colors.white : AppColors.primary,
              ),
              const SizedBox(width: 8),
              Text(
                label,
                style: AppTextStyles.cardTitle.copyWith(
                  fontSize: 13,
                  color: selected ? Colors.white : AppColors.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
