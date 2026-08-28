import 'package:flutter/material.dart';

/// Palette de couleurs de l'application APS Santé.
///
/// Reprend fidèlement les variables CSS du design system
/// (--green-*, --coral-*, --amber-*, --ink*, --paper, --card, --line*).
///
/// Utilisation :
/// ```dart
/// Container(color: AppColors.primary)
/// Text('Alerte', style: TextStyle(color: AppColors.danger))
/// ```
class AppColors {
  AppColors._();

  // ===========================================================
  // VERTS — couleur de marque / actions principales / succès
  // ===========================================================
  static const Color green900 = Color(0xFF0F3A2B);
  static const Color green700 = Color(0xFF1E8A63);
  static const Color green600 = Color(0xFF279A6E);
  static const Color green500 = Color(0xFF2FAB7B);
  static const Color green100 = Color(0xFFE4F3EC);
  static const Color green50 = Color(0xFFF1F8F4);

  // ===========================================================
  // CORAIL — urgence / danger / actions destructives ou fortes
  // ===========================================================
  static const Color coral500 = Color(0xFFE1604A);
  static const Color coral600 = Color(0xFFC94E3A);
  static const Color coral100 = Color(0xFFFBE7E2);

  // ===========================================================
  // AMBRE — avertissement / mise en garde
  // ===========================================================
  static const Color amber500 = Color(0xFFDD9A2E);
  static const Color amber100 = Color(0xFFFBF0DC);

  // ===========================================================
  // ENCRE — texte
  // ===========================================================
  static const Color ink = Color(0xFF16241F);
  static const Color inkSoft = Color(0xFF5B6B64);
  static const Color inkFaint = Color(0xFF93A39C);

  // ===========================================================
  // SURFACES
  // ===========================================================
  static const Color paper = Color(0xFFF5F8F6);
  static const Color card = Color(0xFFFFFFFF);
  static const Color line = Color(0xFFE5ECE8);
  static const Color lineStrong = Color(0xFFD3DFD9);

  // ===========================================================
  // RÔLES SÉMANTIQUES
  // Ce sont ces alias qui doivent être utilisés dans les
  // composants (cards, buttons, alert) plutôt que les couleurs
  // brutes ci-dessus, afin de pouvoir « re-thémer » facilement.
  // ===========================================================

  /// Couleur d'action principale (boutons primaires, liens, icônes actives).
  static const Color primary = green700;
  static const Color primaryDark = green900;
  static const Color primaryLight = green100;
  static const Color primarySurface = green50;

  /// Succès / validation / éléments vérifiés.
  static const Color success = green600;
  static const Color successLight = green100;

  /// Neutre / secondaire (boutons outline, badges neutres).
  static const Color secondary = inkSoft;
  static const Color secondaryLight = lineStrong;

  /// Avertissement.
  static const Color warning = amber500;
  static const Color warningLight = amber100;

  /// Danger / urgence / actions d'appel immédiat.
  static const Color danger = coral500;
  static const Color dangerDark = coral600;
  static const Color dangerLight = coral100;

  /// Petit point vert utilisé pour signaler « ouvert / de garde ».
  static const Color guardDotOn = green500;
  static const Color guardDotOff = inkFaint;

  // ===========================================================
  // OMBRES (approximation Material des box-shadow CSS)
  // ===========================================================
  static List<BoxShadow> get shadowCard => [
        BoxShadow(
          color: ink.withOpacity(0.03),
          blurRadius: 1,
          offset: const Offset(0, 1),
        ),
        BoxShadow(
          color: ink.withOpacity(0.08),
          blurRadius: 12,
          offset: const Offset(0, 4),
          spreadRadius: -6,
        ),
      ];

  static List<BoxShadow> get shadowSoft => [
        BoxShadow(
          color: ink.withOpacity(0.04),
          blurRadius: 2,
          offset: const Offset(0, 1),
        ),
        BoxShadow(
          color: ink.withOpacity(0.10),
          blurRadius: 20,
          offset: const Offset(0, 8),
          spreadRadius: -10,
        ),
      ];
}
