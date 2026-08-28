import 'package:flutter/material.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';
import '../buttons/call_button.dart';
import '../buttons/itinerary_button.dart';
import 'badge_chip.dart';

/// Carte « Pharmacie » — `.list-card` (annuaire pharmacies + gardes).
///
/// Reprend le point de statut (`.guard-dot`), le badge « Fiche vérifiée »,
/// le numéro d'ordre et la distance.
///
/// ```dart
/// CardPharmacie(
///   nom: 'Pharmacie Soleil',
///   quartier: 'Douala, Akwa Nord',
///   deGarde: true,
///   verifiee: true,
///   numeroOrdre: 'RCM-002E',
///   distanceKm: 1.2,
///   onAppeler: () {},
///   onItineraire: () {},
/// )
/// ```
class CardPharmacie extends StatelessWidget {
  const CardPharmacie({
    super.key,
    required this.nom,
    required this.quartier,
    this.deGarde = false,
    this.verifiee = false,
    this.numeroOrdre,
    this.distanceKm,
    required this.onAppeler,
    required this.onItineraire,
    this.onTap,
  });

  final String nom;
  final String quartier;
  final bool deGarde;
  final bool verifiee;
  final String? numeroOrdre;
  final double? distanceKm;
  final VoidCallback onAppeler;
  final VoidCallback onItineraire;
  final VoidCallback? onTap;

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
              color: AppColors.amber100,
              borderRadius: BorderRadius.circular(14),
            ),
            alignment: Alignment.center,
            child: const Icon(Icons.medication_outlined, color: AppColors.amber500, size: 24),
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
                    GuardDot(active: deGarde),
                    Expanded(
                      child: Text(
                        deGarde ? 'De garde — $quartier' : 'Ouverte — $quartier',
                        style: AppTextStyles.cardMeta,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 5,
                  runSpacing: 5,
                  children: [
                    if (verifiee)
                      const BadgeChip(
                        label: 'Fiche vérifiée',
                        style: BadgeChipStyle.green,
                        icon: Icons.verified_outlined,
                      ),
                    if (numeroOrdre != null)
                      BadgeChip(label: 'N° ordre $numeroOrdre', style: BadgeChipStyle.outline, mono: true),
                  ],
                ),
                const SizedBox(height: 9),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    if (distanceKm != null)
                      Text('${distanceKm!.toStringAsFixed(1)} km',
                          style: AppTextStyles.cardMeta.copyWith(fontSize: 11, color: AppColors.inkFaint))
                    else
                      const SizedBox.shrink(),
                    Row(
                      children: [
                        CallButton(onPressed: onAppeler),
                        const SizedBox(width: 6),
                        ItineraryButton(onPressed: onItineraire),
                      ],
                    ),
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
