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
/// Au tap sur une carte de spécialité : pose directement les filtres
/// choisis (ville + pays d'exercice + spécialité) dans
/// [filtresMedecinsProvider] — porté par [medecinProviderContainer], le
/// même container que [MedecinPage] — puis pousse cet écran, qui les
/// lira immédiatement au premier chargement de sa liste. Aucune étape
/// de confirmation supplémentaire : choisir la spécialité ouvre
/// directement la liste des médecins.
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

  void _voirLesMedecins(String specialiteId) {
    _container.read(filtresMedecinsProvider.notifier).state = MedecinFiltres(
      specialiteId: specialiteId,
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
                          onTap: () => _voirLesMedecins(s.specialiteId),
                        ),
                    ],
                  ),
              const SizedBox(height: 28),
              Material(
                color: AppColors.card,
                shape: const CircleBorder(side: BorderSide(color: AppColors.line)),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: () => Navigator.of(context).pop(),
                  child: const SizedBox(
                    width: 46,
                    height: 46,
                    child: Icon(Icons.arrow_back_rounded, color: AppColors.ink, size: 20),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Carte de spécialité, équivalent de `.service-type-opt` / `.opt-card`
/// côté web. Le tap ouvre directement la liste des médecins pour cette
/// spécialité — pas d'état "sélectionné" à conserver, une seule
/// interaction suffit.
class _SpecialiteChip extends StatelessWidget {
  const _SpecialiteChip({
    required this.label,
    required this.onTap,
  });

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
      borderRadius: AppRadius.smRadius,
      child: InkWell(
        borderRadius: AppRadius.smRadius,
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: AppRadius.smRadius,
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.medical_services_outlined,
                size: 16,
                color: AppColors.primary,
              ),
              const SizedBox(width: 8),
              Text(
                label,
                style: AppTextStyles.cardTitle.copyWith(
                  fontSize: 13,
                  color: AppColors.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}