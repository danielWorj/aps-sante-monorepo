import 'package:flutter/material.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';
import '../buttons/call_button.dart';
import '../buttons/itinerary_button.dart';
import 'badge_chip.dart';

/// Type de structure de santé, pilote la couleur de la vignette.
enum StructureType { hopital, clinique, centreDeSante }

/// Carte « Structure de santé » — `.list-card` (hôpitaux / cliniques / centres).
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

  Color get _thumbBg {
    switch (type) {
      case StructureType.hopital:
        return AppColors.coral100;
      case StructureType.clinique:
      case StructureType.centreDeSante:
        return AppColors.green100;
    }
  }

  Color get _thumbFg {
    switch (type) {
      case StructureType.hopital:
        return AppColors.coral500;
      case StructureType.clinique:
      case StructureType.centreDeSante:
        return AppColors.green700;
    }
  }

  @override
  Widget build(BuildContext context) {
    return CardSurface(
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: _thumbBg,
              borderRadius: BorderRadius.circular(14),
            ),
            alignment: Alignment.center,
            child: Icon(Icons.local_hospital_outlined, color: _thumbFg, size: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(nom, style: AppTextStyles.cardTitle),
                const SizedBox(height: 2),
                Row(
                  children: [
                    const Icon(Icons.location_on_outlined, size: 11, color: AppColors.inkFaint),
                    const SizedBox(width: 3),
                    Expanded(
                      child: Text(ville, style: AppTextStyles.cardMeta, overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 5,
                  runSpacing: 5,
                  children: [
                    BadgeChip(label: _typeLabel, style: BadgeChipStyle.outline),
                    if (verifiee)
                      const BadgeChip(
                        label: 'Vérifiée',
                        style: BadgeChipStyle.green,
                        icon: Icons.verified_outlined,
                      ),
                  ],
                ),
                const SizedBox(height: 9),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    CallButton(onPressed: onAppeler),
                    const SizedBox(width: 6),
                    ItineraryButton(onPressed: onItineraire),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
