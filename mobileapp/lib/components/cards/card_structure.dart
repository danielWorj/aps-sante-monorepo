import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../style/text_styles.dart';
import '../ui/aps_ui.dart';
import 'badge_chip.dart';

/// Type de structure de santé, pilote la couleur de la vignette.
enum StructureType { hopital, clinique, centreDeSante }

/// Carte « Structure de santé » — hôpitaux, cliniques, centres.
///
/// ```dart
/// CardStructure(
///   nom: 'Hôpital Bleu',
///   ville: 'Douala',
///   type: StructureType.hopital,
///   verifiee: true,
///   onAppeler: () {},
///   onItineraire: () {},
/// )
/// ```
class CardStructure extends StatelessWidget {
  const CardStructure({
    super.key,
    required this.nom,
    required this.ville,
    this.type = StructureType.hopital,
    this.verifiee = false,
    required this.onAppeler,
    required this.onItineraire,
    this.onTap,
  });

  final String nom;
  final String ville;
  final StructureType type;
  final bool verifiee;
  final VoidCallback onAppeler;
  final VoidCallback onItineraire;
  final VoidCallback? onTap;

  String get _typeLabel {
    switch (type) {
      case StructureType.hopital:
        return 'Hôpital';
      case StructureType.clinique:
        return 'Clinique';
      case StructureType.centreDeSante:
        return 'Centre de santé';
    }
  }

  ApsTone get _tone {
    switch (type) {
      case StructureType.hopital:
        return ApsTone.sky;
      case StructureType.clinique:
        return ApsTone.violet;
      case StructureType.centreDeSante:
        return ApsTone.green;
    }
  }

  @override
  Widget build(BuildContext context) {
    return CardSurface(
      onTap: onTap,
      child: Row(
        children: [
          ApsIconTile(Icons.local_hospital_outlined, tone: _tone, size: 58),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(nom,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppTextStyles.strong),
                    ),
                    if (verifiee) ...[
                      const SizedBox(width: 4),
                      const ApsVerified(size: 13),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    const Icon(Icons.location_on_outlined,
                        size: 12, color: AppColors.ink3),
                    const SizedBox(width: 3),
                    Expanded(
                      child: Text(ville,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTextStyles.xs),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                BadgeChip(label: _typeLabel, style: BadgeChipStyle.outline),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            children: [
              ApsIconButton(
                icon: Icons.call_outlined,
                flat: true,
                size: 38,
                iconColor: AppColors.b6,
                tooltip: 'Appeler',
                onPressed: onAppeler,
              ),
              const SizedBox(height: 6),
              ApsIconButton(
                icon: Icons.near_me_outlined,
                flat: true,
                size: 38,
                iconColor: AppColors.ink2,
                tooltip: 'Itinéraire',
                onPressed: onItineraire,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
