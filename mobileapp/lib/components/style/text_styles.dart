import 'package:flutter/material.dart';
import 'colors.dart';

/// Typographies partagées, calquées sur le design system web
/// (Sora = titres/UI forte, Inter = corps de texte, IBM Plex Mono = chiffres/codes).
///
/// Si les polices ne sont pas embarquées dans le projet Flutter,
/// remplacer `fontFamily` par vos polices locales ou les charger
/// via google_fonts.
class AppTextStyles {
  AppTextStyles._();

  static const String fontDisplay = 'Sora';
  static const String fontBody = 'Inter';
  static const String fontMono = 'IBMPlexMono';

  static const TextStyle h3 = TextStyle(
    fontFamily: fontDisplay,
    fontSize: 18,
    fontWeight: FontWeight.w700,
    color: AppColors.ink,
  );

  static const TextStyle cardTitle = TextStyle(
    fontFamily: fontDisplay,
    fontSize: 14,
    fontWeight: FontWeight.w700,
    color: AppColors.ink,
  );

  static const TextStyle cardMeta = TextStyle(
    fontFamily: fontBody,
    fontSize: 11.5,
    fontWeight: FontWeight.w500,
    color: AppColors.inkSoft,
  );

  static const TextStyle body = TextStyle(
    fontFamily: fontBody,
    fontSize: 12.5,
    fontWeight: FontWeight.w400,
    color: AppColors.inkSoft,
    height: 1.5,
  );

  static const TextStyle badge = TextStyle(
    fontFamily: fontDisplay,
    fontSize: 10.5,
    fontWeight: FontWeight.w600,
  );

  static const TextStyle buttonLabel = TextStyle(
    fontFamily: fontDisplay,
    fontSize: 13,
    fontWeight: FontWeight.w600,
  );

  static const TextStyle price = TextStyle(
    fontFamily: fontMono,
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: AppColors.ink,
  );
}

/// Rayons de bordure standard du design system.
class AppRadius {
  AppRadius._();

  static const double lg = 26;
  static const double md = 18;
  static const double sm = 12;

  static BorderRadius get lgRadius => BorderRadius.circular(lg);
  static BorderRadius get mdRadius => BorderRadius.circular(md);
  static BorderRadius get smRadius => BorderRadius.circular(sm);
}
