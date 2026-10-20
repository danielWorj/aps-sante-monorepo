import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../style/text_styles.dart';
import '../ui/aps_ui.dart';
import 'badge_chip.dart';

/// Carte « Pharmacie » — ligne de la liste des gardes (écran 20).
///
/// Vignette, nom, quartier et distance, pastille de statut (de garde /
/// ouverte, fiche vérifiée), et deux actions directes : appeler et
/// itinéraire.
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
    this.imageUrl,
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

  /// Photo de la fiche ; à défaut, l'icône pharmacie.
  final String? imageUrl;
  final bool deGarde;
  final bool verifiee;
  final String? numeroOrdre;
  final double? distanceKm;
  final VoidCallback onAppeler;
  final VoidCallback onItineraire;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final meta = [
      quartier,
      if (distanceKm != null) '${distanceKm!.toStringAsFixed(1).replaceAll('.', ',')} km',
    ].where((e) => e.isNotEmpty).join(' · ');

    return CardSurface(
      onTap: onTap,
      child: Row(
        children: [
          ApsVignette(
            imageUrl: imageUrl,
            repli: Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(
                color: deGarde ? AppColors.b1 : AppColors.bg,
                borderRadius: BorderRadius.circular(12),
              ),
              alignment: Alignment.center,
              child: Icon(
                Icons.local_pharmacy_rounded,
                color: deGarde ? AppColors.b6 : AppColors.ink3,
                size: 26,
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
                    if (verifiee) ...[
                      const SizedBox(width: 4),
                      const ApsVerified(size: 13),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTextStyles.xs),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ApsPill(
                      deGarde ? 'De garde' : 'Ouverte',
                      tone: deGarde ? ApsTone.green : ApsTone.neutral,
                      dot: true,
                    ),
                    if (numeroOrdre != null)
                      BadgeChip(
                          label: 'N° $numeroOrdre',
                          style: BadgeChipStyle.outline,
                          mono: true),
                  ],
                ),
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
