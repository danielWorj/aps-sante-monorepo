import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../style/text_styles.dart';

/// Invitation discrète affichée au-dessus d'un annuaire pour les
/// professionnels qui souhaitent y figurer (« Vous êtes médecin ? ·
/// Devenir médecin »). Une ligne fine, sans encombrer la liste.
class ApsInvitationPro extends StatelessWidget {
  const ApsInvitationPro({
    super.key,
    required this.question,
    required this.libelle,
    required this.onPressed,
    this.icone = Icons.add_rounded,
  });

  /// Ex : « Vous êtes médecin ? ».
  final String question;

  /// Ex : « Devenir médecin ».
  final String libelle;
  final IconData icone;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              question,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTextStyles.xs.copyWith(fontSize: 12.5),
            ),
          ),
          const SizedBox(width: 8),
          TextButton.icon(
            onPressed: onPressed,
            style: TextButton.styleFrom(
              foregroundColor: AppColors.b7,
              backgroundColor: AppColors.b1,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              minimumSize: const Size(0, 34),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              textStyle: AppTextStyles.strong.copyWith(fontSize: 12.5),
            ),
            icon: Icon(icone, size: 16),
            label: Text(libelle),
          ),
        ],
      ),
    );
  }
}
