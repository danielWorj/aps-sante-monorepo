import 'package:flutter/material.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';
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
                width: 42,
                height: 42,
                decoration: BoxDecoration(color: fondLogo, borderRadius: BorderRadius.circular(12)),
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
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(nom, style: AppTextStyles.cardTitle.copyWith(fontSize: 13.5)),
                    const SizedBox(height: 2),
                    Text('$typeStructure · $ville',
                        style: AppTextStyles.cardMeta.copyWith(fontSize: 10.5)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 5,
            runSpacing: 5,
            children: [
              if (verifieeAps)
                const BadgeChip(
                  label: 'Vérifiée APS',
                  style: BadgeChipStyle.green,
                  icon: Icons.verified_outlined,
                ),
              if (numeroAgrement != null)
                BadgeChip(label: numeroAgrement!, style: BadgeChipStyle.outline, mono: true),
            ],
          ),
          const SizedBox(height: 9),
          Text(description, style: AppTextStyles.body.copyWith(fontSize: 11)),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerRight,
            child: ElevatedButton(
              onPressed: onVoirFiche,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                elevation: 0,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
              ),
              child: Text('Voir la fiche', style: AppTextStyles.buttonLabel.copyWith(fontSize: 11.5)),
            ),
          ),
        ],
      ),
    );
  }
}
