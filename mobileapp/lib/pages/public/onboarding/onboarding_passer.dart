import 'package:flutter/material.dart';

import '../../../components/components.dart';
import '../publicAcceuil.dart';

/// Action « Passer » des écrans d'onboarding (barre du haut) : quitte le
/// parcours et ouvre directement l'accueil de l'application, en vidant
/// l'historique (le retour arrière ne ramène pas dans l'onboarding).
class OnboardingPasser extends StatelessWidget {
  const OnboardingPasser({super.key});

  static void passer(BuildContext context) {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const PublicAcceuilPage()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: TextButton.icon(
        onPressed: () => passer(context),
        style: TextButton.styleFrom(
          foregroundColor: AppColors.ink2,
          textStyle: AppTextStyles.strong.copyWith(fontSize: 13.5),
        ),
        iconAlignment: IconAlignment.end,
        icon: const Icon(Icons.arrow_forward_rounded, size: 16),
        label: const Text('Passer'),
      ),
    );
  }
}
