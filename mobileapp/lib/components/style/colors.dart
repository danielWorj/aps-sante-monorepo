import 'package:flutter/material.dart';

/// Palette de couleurs de l'application APS Santé — refonte 2026.
///
/// Reprend les jetons de `mobile/new-mobile-ui.html` :
/// verts `--b9…--b0`, corail `--co`, ambre `--am`, violet `--vi`
/// (demande express), bleu ciel `--sk` (vidéo, vérifié), rouge `--rd`
/// (urgence), encres `--ink…--ink4`, surfaces `--bg`, `--sf`, `--ln`.
///
/// Les anciens noms (`green700`, `paper`, `inkSoft`…) restent disponibles
/// et pointent vers les nouvelles teintes : tout l'existant bascule ainsi
/// sur la nouvelle direction visuelle sans réécriture.
class AppColors {
  AppColors._();

  // ===========================================================
  // VERTS — marque, actions principales, succès
  // ===========================================================
  static const Color b9 = Color(0xFF0F5C44);
  static const Color b8 = Color(0xFF13775A);
  static const Color b7 = Color(0xFF16996C);
  static const Color b6 = Color(0xFF1DAE7C);
  static const Color b5 = Color(0xFF34C38F);
  static const Color b4 = Color(0xFF74D9B0);
  static const Color b2 = Color(0xFFC6EFDD);
  static const Color b1 = Color(0xFFE5F7EF);
  static const Color b0 = Color(0xFFF3FBF7);

  /// Vert menthe utilisé sur fonds sombres (accroches, pastilles).
  static const Color mint = Color(0xFF7FE0B5);

  // Anciens noms (compatibilité).
  static const Color green900 = b9;
  static const Color green700 = b7;
  static const Color green600 = b6;
  static const Color green500 = b5;
  static const Color green100 = b1;
  static const Color green50 = b0;

  // ===========================================================
  // CORAIL — badges, points de notification
  // ===========================================================
  static const Color coral500 = Color(0xFFEE6847);
  static const Color coral600 = Color(0xFFB8432A);
  static const Color coral100 = Color(0xFFFDEBE5);

  // ===========================================================
  // AMBRE — attente (paiement attendu, expiration)
  // ===========================================================
  static const Color amber500 = Color(0xFFE59E2E);
  static const Color amber700 = Color(0xFF9A6100);
  static const Color amber100 = Color(0xFFFCF2DF);

  // ===========================================================
  // VIOLET — demande express (RDV sur offre)
  // ===========================================================
  static const Color violet = Color(0xFF6B5CF0);
  static const Color violet700 = Color(0xFF4A3DC4);
  static const Color violet100 = Color(0xFFEDEBFE);

  // ===========================================================
  // BLEU CIEL — vidéo, compte vérifié, informations
  // ===========================================================
  static const Color sky = Color(0xFF2F80ED);
  static const Color sky100 = Color(0xFFE6F0FD);

  // ===========================================================
  // BLEU SANTÉ — téléconsultation (déclinaison posée du bleu ciel,
  // ni trop foncé ni trop vif ; mêmes valeurs que --bleu-sante-* web)
  // ===========================================================
  static const Color bleuSante = Color(0xFF2E6FB7);
  static const Color bleuSanteFonce = Color(0xFF1D4F8A);
  static const Color bleuSanteVif = Color(0xFF4A8FDB);
  static const Color bleuSanteClair = Color(0xFFEEF4FB);
  static const Color bleuSanteLigne = Color(0xFFD5E3F3);
  static const Color bleuNuit = Color(0xFF0F2236);

  // ===========================================================
  // ROUGE — urgence, actions destructives
  // ===========================================================
  static const Color red = Color(0xFFE5484D);
  static const Color red100 = Color(0xFFFDE8E8);

  /// Étoiles des avis.
  static const Color star = Color(0xFFF5B400);

  // ===========================================================
  // ENCRE — texte
  // ===========================================================
  static const Color ink = Color(0xFF0D1B16);
  static const Color ink2 = Color(0xFF4A5A53);
  static const Color ink3 = Color(0xFF8A9992);
  static const Color ink4 = Color(0xFFBAC6C0);

  static const Color inkSoft = ink2;
  static const Color inkFaint = ink3;

  // ===========================================================
  // SURFACES
  // ===========================================================
  static const Color bg = Color(0xFFF3F6F4);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color segment = Color(0xFFE8EEEA);
  static const Color slotOff = Color(0xFFF1F4F2);

  static const Color paper = bg;
  static const Color card = surface;
  static const Color line = Color(0xFFE6ECE9);
  static const Color lineStrong = Color(0xFFD6E0DB);

  // ===========================================================
  // RÔLES SÉMANTIQUES
  // Ce sont ces alias qui doivent être utilisés dans les
  // composants (cards, buttons, alert) plutôt que les couleurs
  // brutes ci-dessus, afin de pouvoir « re-thémer » facilement.
  // ===========================================================

  /// Couleur d'action principale (boutons primaires, liens, icônes actives).
  static const Color primary = b7;
  static const Color primaryDark = b9;
  static const Color primaryLight = b1;
  static const Color primarySurface = b0;

  /// Succès / validation / éléments vérifiés.
  static const Color success = b6;
  static const Color successLight = b1;

  /// Neutre / secondaire (boutons outline, badges neutres).
  static const Color secondary = ink2;
  static const Color secondaryLight = lineStrong;

  /// Avertissement.
  static const Color warning = amber500;
  static const Color warningLight = amber100;

  /// Danger / urgence / actions d'appel immédiat.
  static const Color danger = red;
  static const Color dangerDark = Color(0xFFC7343A);
  static const Color dangerLight = red100;

  /// Petit point vert utilisé pour signaler « ouvert / de garde ».
  static const Color guardDotOn = b5;
  static const Color guardDotOff = ink3;

  // ===========================================================
  // DÉGRADÉS
  // ===========================================================

  /// Carte « prochain RDV », carte santé, en-têtes de fiche.
  static const LinearGradient gradientForest = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [b6, b7],
  );

  /// Logo et pastille de confirmation.
  static const LinearGradient gradientLogo = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [b5, b7],
  );

  /// Bandeau « Demande express ».
  static const LinearGradient gradientViolet = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF7D70F3), violet],
  );

  // ===========================================================
  // OMBRES (box-shadow --sh1 et --sh2 de la maquette)
  // ===========================================================
  static List<BoxShadow> get shadowCard => [
        BoxShadow(
          color: ink.withValues(alpha: 0.04),
          blurRadius: 2,
          offset: const Offset(0, 1),
        ),
        BoxShadow(
          color: ink.withValues(alpha: 0.12),
          blurRadius: 16,
          offset: const Offset(0, 6),
          spreadRadius: -8,
        ),
      ];

  static List<BoxShadow> get shadowSoft => [
        BoxShadow(
          color: ink.withValues(alpha: 0.05),
          blurRadius: 6,
          offset: const Offset(0, 2),
        ),
        BoxShadow(
          color: ink.withValues(alpha: 0.28),
          blurRadius: 40,
          offset: const Offset(0, 20),
          spreadRadius: -18,
        ),
      ];

  /// Ombre colorée sous le bouton principal.
  static List<BoxShadow> shadowGlow(Color c) => [
        BoxShadow(
          color: c.withValues(alpha: 0.30),
          blurRadius: 24,
          offset: const Offset(0, 12),
          spreadRadius: -12,
        ),
      ];
}
