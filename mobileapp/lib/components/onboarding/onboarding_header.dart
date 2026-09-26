import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../style/text_styles.dart';

/// En-tête partagé des écrans d'onboarding : un "eyebrow" (nom du
/// sous-parcours en petites capitales, ex "Médecins et professionnels"),
/// un titre de question, et un sous-titre optionnel (ex la ville déjà
/// choisie à l'étape précédente).
///
/// Reprend exactement le style utilisé "à la main" dans
/// [OnboardingProChoixPage] (eyebrow en [AppTextStyles.cardMeta] +
/// couleur primaire + gras + espacement des lettres, titre en
/// [AppTextStyles.h3] à 20px), pour que tous les écrans du parcours
/// restent visuellement identiques.
class OnboardingHeader extends StatelessWidget {
  const OnboardingHeader({
    super.key,
    required this.eyebrow,
    required this.title,
    this.subtitle,
  });

  /// Nom du sous-parcours, affiché en petites capitales (ex : "Médecins
  /// et professionnels", "Assurances").
  final String eyebrow;

  /// Question posée à l'utilisateur pour cette étape.
  final String title;

  /// Rappel optionnel d'un choix déjà fait à l'étape précédente (ex :
  /// "Recherche à : Douala").
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          eyebrow.toUpperCase(),
          style: AppTextStyles.cardMeta.copyWith(
            color: AppColors.primary,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 8),
        Text(title, style: AppTextStyles.h3.copyWith(fontSize: 20)),
        if (subtitle != null) ...[
          const SizedBox(height: 6),
          Text(
            subtitle!,
            style: AppTextStyles.body.copyWith(color: AppColors.inkSoft),
          ),
        ],
      ],
    );
  }
}
