import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../style/text_styles.dart';
import 'bouton_deconnexion.dart' show retournerAccueilPublic;

/// Bouton flottant des espaces connectés (patient, médecin, assurance,
/// laboratoire, pharmacie, centre de santé, annonceur…) : revient à
/// l'accueil public SANS fermer la session. « Mon espace » (barre basse
/// publique) ramène ensuite directement dans le dernier espace.
class BoutonAccueilPublic extends StatelessWidget {
  const BoutonAccueilPublic({super.key});

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton.extended(
      // Plusieurs boutons flottants peuvent coexister pendant une transition.
      heroTag: 'bouton_accueil_public',
      tooltip: 'Revenir à l’accueil public',
      onPressed: retournerAccueilPublic,
      backgroundColor: AppColors.surface,
      foregroundColor: AppColors.green700,
      elevation: 2,
      highlightElevation: 3,
      extendedPadding: const EdgeInsets.symmetric(horizontal: 14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: AppColors.line),
      ),
      icon: const Icon(Icons.travel_explore_rounded, size: 20),
      label: Text(
        'Accueil public',
        style: AppTextStyles.small.copyWith(fontWeight: FontWeight.w700, color: AppColors.green700),
      ),
    );
  }
}
