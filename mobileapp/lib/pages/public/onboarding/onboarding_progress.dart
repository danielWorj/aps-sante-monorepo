import 'package:flutter/material.dart';

import '../../../components/style/colors.dart';

/// Barre de progression minimaliste pour un sous-parcours d'onboarding
/// (ex : Médecins Écran 1.1.1 → 1.1.2, Assurances Écran 1.3.1 → 1.3.2).
///
/// Portage de `OnboardingProgess.jsx` (client-plateform), qui affiche
/// une rangée de points remplis jusqu'à l'étape courante. Adapté ici en
/// segments (plus lisibles sur petit écran) : [current] est l'étape
/// active (1-indexée), [total] le nombre total d'étapes.
class OnboardingProgress extends StatelessWidget {
  const OnboardingProgress({
    super.key,
    required this.current,
    this.total = 2,
  });

  final int current;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Étape $current sur $total',
      child: Row(
        children: [
          for (var n = 1; n <= total; n++) ...[
            Expanded(
              child: Container(
                height: 4,
                decoration: BoxDecoration(
                  color: n <= current ? AppColors.primary : AppColors.line,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            if (n != total) const SizedBox(width: 6),
          ],
        ],
      ),
    );
  }
}
