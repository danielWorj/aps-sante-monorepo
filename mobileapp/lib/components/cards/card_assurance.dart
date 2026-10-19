import 'package:flutter/material.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';
import '../ui/aps_ui.dart';
import 'badge_chip.dart';

/// Carte « Assurance » — `.insurer-card` (annuaire des compagnies/courtiers).
///
/// ```dart
/// CardAssurance(
///   nom: 'AXA',
///   sigle: 'AXA',
///   ville: 'Douala',
///   description: 'Leader mondial de l'assurance...',
///   numeroAgrement: 'RCM-07MEICOM',
///   verifieeAps: false,
///   couleurLogo: Color(0xFF0B2C9E),
///   fondLogo: Color(0xFFEDF1FB),
///   onVoirFiche: () {},
/// )
/// ```
class CardAssurance extends StatelessWidget {
  const CardAssurance({
    super.key,
    required this.nom,
    required this.sigle,
    required this.ville,
    required this.description,
    this.numeroAgrement,
    this.verifieeAps = false,
    this.couleurLogo = AppColors.green700,
    this.fondLogo = AppColors.green100,
    this.typeStructure = 'Compagnie d\'assurance',
    required this.onVoirFiche,
    this.onTap,
  });

  final String nom;

  /// Sigle affiché dans le logo (ex : « AXA », « BE »).
  final String sigle;
  final String ville;
  final String description;
  final String? numeroAgrement;
  final bool verifieeAps;
  final Color couleurLogo;
  final Color fondLogo;
  final String typeStructure;
  final VoidCallback onVoirFiche;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return CardSurface(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: fondLogo, borderRadius: BorderRadius.circular(10)),
                alignment: Alignment.center,
                child: Text(
                  sigle,
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontDisplay,
                    fontWeight: FontWeight.w800,
                    fontSize: 12.5,
                    color: couleurLogo,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(nom,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTextStyles.strong),
                        ),
                        if (verifieeAps) ...[
                          const SizedBox(width: 4),
                          const ApsVerified(size: 13),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text('$typeStructure · $ville',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTextStyles.xs),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded,
                  size: 20, color: AppColors.ink4),
            ],
          ),
          if (numeroAgrement != null) const SizedBox(height: 10),
          Wrap(
            spacing: 5,
            runSpacing: 5,
            children: [
              if (numeroAgrement != null)
                BadgeChip(label: numeroAgrement!, style: BadgeChipStyle.outline, mono: true),
            ],
          ),
          // Description absente en présence minimale (fiche sans abonnement).
          if (description.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(description,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: AppTextStyles.small),
          ],
          const SizedBox(height: 12),
          ApsButton(
            label: 'Voir la fiche',
            onPressed: onVoirFiche,
            variant: ApsButtonVariant.soft,
            small: true,
            trailingIcon: Icons.arrow_forward_rounded,
          ),
        ],
      ),
    );
  }
}
