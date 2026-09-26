import 'package:flutter/material.dart';

import '../buttons/app_buttons.dart';
import '../style/colors.dart';

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
        Material(
          color: AppColors.card,
          shape: const CircleBorder(side: BorderSide(color: AppColors.line)),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onBack,
            child: const SizedBox(
              width: 46,
              height: 46,
              child: Icon(Icons.arrow_back_rounded, color: AppColors.ink, size: 20),
            ),
          ),
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
