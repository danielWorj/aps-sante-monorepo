import 'package:flutter/material.dart';

import '../buttons/app_buttons.dart';
import '../ui/aps_ui.dart';

/// Barre d'actions "Précédent / Suivant" partagée par les écrans
/// d'onboarding. [onBack] est toujours actif (retour simple :
/// `Navigator.pop`). [onNext] à `null` désactive le bouton principal
/// (ex : tant qu'aucune ville/spécialité/type n'est choisi) — le
/// bouton reste visible mais grisé, jamais masqué, pour que
/// l'utilisateur comprenne toujours ce qu'il lui reste à faire.
class OnboardingNavActions extends StatelessWidget {
  const OnboardingNavActions({
    super.key,
    required this.onBack,
    required this.onNext,
    this.nextLabel = 'Suivant',
    this.nextIcon = Icons.arrow_forward_rounded,
  });

  final VoidCallback onBack;
  final VoidCallback? onNext;
  final String nextLabel;
  final IconData nextIcon;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        ApsIconButton(
          icon: Icons.chevron_left_rounded,
          size: 54,
          tooltip: 'Précédent',
          onPressed: onBack,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: PrimaryButton(
            label: nextLabel,
            icon: nextIcon,
            onPressed: onNext,
          ),
        ),
      ],
    );
  }
}
