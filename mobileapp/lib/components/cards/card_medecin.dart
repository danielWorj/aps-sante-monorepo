import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../style/text_styles.dart';
import '../ui/aps_ui.dart';
import 'badge_chip.dart';

/// Carte « Médecin » — carte de résultat de la refonte 2026 (écran 07).
///
/// Avatar à initiales (ou photo), nom + badge vérifié, spécialité et
/// ville, pastilles (vidéo, disponible aujourd'hui), tarif, puis les
/// actions « Voir le profil » / « Prendre RDV ».
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
    this.noteMoyenne,
    this.nombreAvis = 0,
    required this.onVoirProfil,
    this.onPrendreRdv,
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

  /// Réputation : affichée seulement s'il y a au moins un avis publié.
  final double? noteMoyenne;
  final int nombreAvis;
  final VoidCallback onVoirProfil;

  /// null = prise de RDV en ligne indisponible (bouton masqué).
  final VoidCallback? onPrendreRdv;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return CardSurface(
      onTap: onTap ?? onVoirProfil,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ApsAvatar(
                name: nom,
                photoUrl: photoUrl,
                online: disponibleAujourdhui,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            nom,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTextStyles.strong,
                          ),
                        ),
                        if (verifieOrdre) ...[
                          const SizedBox(width: 4),
                          const ApsVerified(),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [specialite, ville].where((e) => e.isNotEmpty).join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTextStyles.xs,
                    ),
                    if (nombreAvis > 0 && noteMoyenne != null) ...[
                      const SizedBox(height: 4),
                      ApsStars(noteMoyenne!, count: nombreAvis),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              if (teleconsultation)
                                const ApsPill('Vidéo',
                                    tone: ApsTone.sky,
                                    icon: Icons.videocam_outlined),
                              if (disponibleAujourdhui)
                                const ApsPill("Aujourd'hui",
                                    tone: ApsTone.green, dot: true),
                              if (!teleconsultation && !disponibleAujourdhui)
                                const ApsPill('Cabinet', tone: ApsTone.neutral),
                            ],
                          ),
                        ),
                        if (prixFcfa != null)
                          Text(
                            '${_fcfa(prixFcfa!)} F',
                            style: AppTextStyles.strong.copyWith(fontSize: 12.5),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const ApsDivider(),
          Row(
            children: [
              Expanded(
                child: ApsButton(
                  label: 'Voir le profil',
                  onPressed: onVoirProfil,
                  variant: ApsButtonVariant.ghost,
                  small: true,
                ),
              ),
              if (onPrendreRdv != null) ...[
                const SizedBox(width: 8),
                Expanded(
                  flex: 1,
                  child: ApsButton(
                    label: 'Prendre RDV',
                    onPressed: onPrendreRdv,
                    small: true,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  static String _fcfa(int v) {
    final s = v.toString();
    final b = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) b.write(' ');
      b.write(s[i]);
    }
    return b.toString();
  }
}

/// Couleur conservée pour les écrans qui affichaient l'ancien fond d'avatar.
const Color cardMedecinAvatarBg = AppColors.b1;
