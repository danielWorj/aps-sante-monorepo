import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/assurance_controller.dart';
import '../../../models/assurance_models.dart';
import '../Assurancepage.dart';
import 'onboarding_progress.dart';

/// Écran 1.3.2 — Choix du type d'acteur (étape 2/2 du sous-parcours
/// « Assurances », après la ville — voir
/// [OnboardingAssuranceVillePage]).
///
/// Portage Flutter de `OnboardingAssuranceType.jsx`. Le type d'acteur
/// est une énumération fixe côté serveur (voir [TypeActeurAssurance]
/// dans assurance_models.dart : uniquement `compagnie` ou `courtier`) :
/// aucun appel réseau n'est donc nécessaire ici, la liste est statique.
///
/// Au tap sur « Voir l'annuaire » : pose les filtres choisis
/// (ville + pays + type d'acteur) dans [filtresServicesAssuranceProvider]
/// — via le [ProviderScope] global de l'app, le même arbre que
/// [AssurancePage] — puis pousse cet écran, qui les lira immédiatement.
class OnboardingAssuranceTypePage extends ConsumerStatefulWidget {
  const OnboardingAssuranceTypePage({
    super.key,
    this.paysId,
    this.villeId,
    this.villeNom,
  });

  final String? paysId;
  final String? villeId;
  final String? villeNom;

  @override
  ConsumerState<OnboardingAssuranceTypePage> createState() =>
      _OnboardingAssuranceTypePageState();
}

class _OnboardingAssuranceTypePageState
    extends ConsumerState<OnboardingAssuranceTypePage> {
  // Présélectionné sur "Tous les acteurs" (null) : le type, comme la
  // ville, n'est pas obligatoire pour consulter l'annuaire assurances —
  // l'utilisateur peut donc avancer sans rien changer.
  TypeActeurAssurance? _typeActeur;

  void _voirLAnnuaire() {
    ref.read(filtresServicesAssuranceProvider.notifier).state =
        ServicesAssuranceFiltre(
      paysId: widget.paysId,
      villeId: widget.villeId,
      typeActeur: _typeActeur,
    );
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const AssurancePage()),
    );
  }

  @override
  Widget build(BuildContext context) {
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
                eyebrow: 'Assurances',
                title: "Quel type d'acteur recherchez-vous ?",
                subtitle: widget.villeNom != null
                    ? 'Recherche à : ${widget.villeNom}'
                    : null,
              ),
              const SizedBox(height: 22),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  _TypeActeurChip(
                    icon: Icons.health_and_safety_outlined,
                    label: 'Tous les acteurs',
                    selected: _typeActeur == null,
                    onTap: () => setState(() => _typeActeur = null),
                  ),
                  _TypeActeurChip(
                    icon: Icons.apartment_outlined,
                    label: "Compagnie d'assurance",
                    selected: _typeActeur == TypeActeurAssurance.compagnie,
                    onTap: () => setState(
                      () => _typeActeur = TypeActeurAssurance.compagnie,
                    ),
                  ),
                  _TypeActeurChip(
                    icon: Icons.handshake_outlined,
                    label: 'Courtier',
                    selected: _typeActeur == TypeActeurAssurance.courtier,
                    onTap: () => setState(
                      () => _typeActeur = TypeActeurAssurance.courtier,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 28),
              OnboardingNavActions(
                onBack: () => Navigator.of(context).pop(),
                onNext: _voirLAnnuaire,
                nextLabel: "Voir l'annuaire",
                nextIcon: Icons.search,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Carte sélectionnable pour un type d'acteur assurance, même patron
/// visuel que `_SpecialiteChip` (sous-parcours médecins).
class _TypeActeurChip extends StatelessWidget {
  const _TypeActeurChip({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
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
                icon,
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
