import 'package:flutter/material.dart';
import 'colors.dart';

/// Typographies partagées — refonte 2026 (`new-mobile-ui.html`).
///
/// Plus Jakarta Sans pour toute l'interface, DM Mono pour les heures,
/// montants et références, Instrument Serif (italique) pour les accroches.
/// Les trois polices sont embarquées dans `assets/fonts`.
///
/// Les anciens noms (`fontDisplay`, `fontBody`, `cardTitle`…) sont
/// conservés et utilisent la nouvelle police.
class AppTextStyles {
  AppTextStyles._();

  static const String fontSans = 'PlusJakartaSans';
  static const String fontDisplay = fontSans;
  static const String fontBody = fontSans;
  static const String fontMono = 'DMMono';
  static const String fontSerif = 'InstrumentSerif';

  // ---- Échelle de la maquette (.t-xl, .t-l, .t-m, .t-b, .t-s, .t-xs, .over)

  /// `.t-xl` — titre d'écran d'accueil (connexion).
  static const TextStyle xl = TextStyle(
    fontFamily: fontSans,
    fontSize: 28,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.98,
    height: 1.08,
    color: AppColors.ink,
  );

  /// `.t-l` — titre d'écran (« Rendez-vous », « Compte »).
  static const TextStyle l = TextStyle(
    fontFamily: fontSans,
    fontSize: 22,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.66,
    height: 1.12,
    color: AppColors.ink,
  );

  /// `.t-m` — titre de fiche.
  static const TextStyle m = TextStyle(
    fontFamily: fontSans,
    fontSize: 17,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.34,
    color: AppColors.ink,
  );

  /// `.sec-t h4` — titre de section.
  static const TextStyle section = TextStyle(
    fontFamily: fontSans,
    fontSize: 16,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.32,
    color: AppColors.ink,
  );

  /// `.t-b` — texte fort (nom, libellé).
  static const TextStyle strong = TextStyle(
    fontFamily: fontSans,
    fontSize: 14,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.14,
    color: AppColors.ink,
  );

  /// `.t-s` — texte courant secondaire.
  static const TextStyle small = TextStyle(
    fontFamily: fontSans,
    fontSize: 12.5,
    fontWeight: FontWeight.w500,
    height: 1.5,
    color: AppColors.ink2,
  );

  /// `.t-xs` — méta-données.
  static const TextStyle xs = TextStyle(
    fontFamily: fontSans,
    fontSize: 11,
    fontWeight: FontWeight.w600,
    color: AppColors.ink3,
  );

  /// `.over` — sur-titre en capitales espacées.
  static const TextStyle over = TextStyle(
    fontFamily: fontSans,
    fontSize: 10.5,
    fontWeight: FontWeight.w800,
    letterSpacing: 1.36,
    color: AppColors.ink3,
  );

  /// Accroche en italique (Instrument Serif).
  static const TextStyle serif = TextStyle(
    fontFamily: fontSerif,
    fontStyle: FontStyle.italic,
    fontWeight: FontWeight.w400,
    letterSpacing: -0.2,
  );

  /// Heures, références, montants techniques.
  static const TextStyle mono = TextStyle(
    fontFamily: fontMono,
    fontSize: 13,
    fontWeight: FontWeight.w500,
    color: AppColors.ink,
  );

  // ---- Anciens noms (compatibilité)

  static const TextStyle h3 = TextStyle(
    fontFamily: fontSans,
    fontSize: 18,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.4,
    color: AppColors.ink,
  );

  static const TextStyle cardTitle = strong;

  static const TextStyle cardMeta = xs;

  static const TextStyle body = TextStyle(
    fontFamily: fontSans,
    fontSize: 12.5,
    fontWeight: FontWeight.w500,
    color: AppColors.ink2,
    height: 1.5,
  );

  static const TextStyle badge = TextStyle(
    fontFamily: fontSans,
    fontSize: 10.5,
    fontWeight: FontWeight.w800,
  );

  static const TextStyle buttonLabel = TextStyle(
    fontFamily: fontSans,
    fontSize: 15,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.15,
  );

  static const TextStyle price = TextStyle(
    fontFamily: fontSans,
    fontSize: 13,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.2,
    color: AppColors.ink,
  );
}

/// Rayons de bordure — 12 · 16 · 22 · 32 dans la maquette.
class AppRadius {
  AppRadius._();

  static const double xl = 20;
  static const double lg = 14;
  static const double md = 12;
  static const double sm = 10;

  static BorderRadius get xlRadius => BorderRadius.circular(xl);
  static BorderRadius get lgRadius => BorderRadius.circular(lg);
  static BorderRadius get mdRadius => BorderRadius.circular(md);
  static BorderRadius get smRadius => BorderRadius.circular(sm);
}
