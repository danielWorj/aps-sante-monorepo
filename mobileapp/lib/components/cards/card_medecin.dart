import 'package:flutter/material.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';
import '../buttons/rdv_button.dart';
import '../buttons/outline_button.dart';
import 'badge_chip.dart';

/// Carte « Médecin / professionnel de santé » — `.list-card` (annuaire médecins).
///
/// Affiche l'avatar, le nom, la spécialité + la ville, des badges de
/// confiance (vérifié à l'Ordre, télé-consultation...), le tarif de
/// consultation et les actions « Voir le profil » / « Prendre RDV ».
///
/// ```dart
/// CardMedecin(
///   nom: 'Dr. Landry Amari',
///   specialite: 'Cardiologie',
///   ville: 'Garoua',
///   prixFcfa: 12000,
///   verifieOrdre: true,
///   teleconsultation: true,
///   onVoirProfil: () {},
///   onPrendreRdv: () {},
/// )
/// ```
class CardMedecin extends StatelessWidget {
  const CardMedecin({
    super.key,
    required this.nom,
    required this.specialite,
    required this.ville,
    this.photoUrl,
    this.prixFcfa,
    this.verifieOrdre = false,
    this.teleconsultation = false,
    this.disponibleAujourdhui = false,
    required this.onVoirProfil,
    required this.onPrendreRdv,
    this.onTap,
  });

  final String nom;
  final String specialite;
  final String ville;
  final String? photoUrl;
  final int? prixFcfa;
  final bool verifieOrdre;
  final bool teleconsultation;
  final bool disponibleAujourdhui;
  final VoidCallback onVoirProfil;
  final VoidCallback onPrendreRdv;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return CardSurface(
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Avatar(photoUrl: photoUrl, fallback: _initials(nom)),
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
                      child: Text('$specialite · $ville',
                          style: AppTextStyles.cardMeta, overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 5,
                  runSpacing: 5,
                  children: [
                    if (verifieOrdre)
                      const BadgeChip(
                        label: "Vérifié à l'Ordre",
                        style: BadgeChipStyle.green,
                        icon: Icons.verified_outlined,
                      ),
                    if (teleconsultation)
                      const BadgeChip(
                        label: 'Télé',
                        style: BadgeChipStyle.amber,
                        icon: Icons.videocam_outlined,
                      ),
                    if (disponibleAujourdhui)
                      const BadgeChip(
                        label: "Disponible aujourd'hui",
                        style: BadgeChipStyle.outline,
                      ),
                  ],
                ),
                const SizedBox(height: 9),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    if (prixFcfa != null)
                      RichText(
                        text: TextSpan(
                          style: AppTextStyles.price,
                          children: [
                            TextSpan(text: '$prixFcfa'),
                            const TextSpan(
                              text: ' FCFA',
                              style: TextStyle(
                                fontFamily: AppTextStyles.fontDisplay,
                                fontSize: 9.5,
                                fontWeight: FontWeight.w600,
                                color: AppColors.inkFaint,
                              ),
                            ),
                          ],
                        ),
                      )
                    else
                      const SizedBox.shrink(),
                    Row(
                      children: [
                        AppOutlineButton(label: 'Voir le profil', onPressed: onVoirProfil),
                        const SizedBox(width: 6),
                        RdvButton(onPressed: onPrendreRdv),
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

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    final letters = parts.where((p) => p.isNotEmpty).map((p) => p[0]).take(2);
    return letters.join().toUpperCase();
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({this.photoUrl, required this.fallback});

  final String? photoUrl;
  final String fallback;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Container(
        width: 56,
        height: 56,
        color: AppColors.green100,
        alignment: Alignment.center,
        child: photoUrl != null
            ? Image.network(
                photoUrl!,
                fit: BoxFit.cover,
                width: 56,
                height: 56,
                errorBuilder: (_, __, ___) => _initialsText(),
              )
            : _initialsText(),
      ),
    );
  }

  Widget _initialsText() => Text(
        fallback,
        style: const TextStyle(
          fontFamily: AppTextStyles.fontDisplay,
          fontWeight: FontWeight.w700,
          fontSize: 16,
          color: AppColors.green700,
        ),
      );
}
