import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../style/text_styles.dart';

/// Ligne d'information discrète sur la libération différée des fonds
/// (« Fonds libérés le 12 oct., 14:30 »).
///
/// Affichée sous la carte d'un RDV `honore` dont les fonds sont encore en
/// séquestre (voir `RendezVous.fondsEnAttenteDeLiberation`). Le message est
/// fourni par l'appelant : il diffère entre le médecin (« Fonds libérés le… »)
/// et le patient (« …Vous pouvez contester avant cette date »).
class InfoLiberationFonds extends StatelessWidget {
  const InfoLiberationFonds({
    super.key,
    required this.message,
    this.icon = Icons.hourglass_top_rounded,
  });

  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.amber100,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: AppColors.amber500),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontFamily: AppTextStyles.fontDisplay,
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.ink,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}