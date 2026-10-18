import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../ui/aps_ui.dart';

/// ============================================================
/// patient-bottom-navigation.dart
///
/// Barre de navigation basse de l'espace patient — barre flottante
/// sombre de la refonte 2026 (`.tab` dans new-mobile-ui.html) :
/// l'onglet actif est une pastille blanche avec son libellé.
/// Items : Accueil, Rendez-vous, Demande (RDV aléatoire), Compte.
/// ============================================================

/// Couleurs conservées pour compatibilité ; elles suivent la palette.
class PatientNavColors {
  static const green900 = AppColors.b9;
  static const green700 = AppColors.b7;
  static const green100 = AppColors.b1;
  static const coral500 = AppColors.coral500;
  static const ink = AppColors.ink;
  static const inkFaint = AppColors.ink3;
  static const card = AppColors.surface;
  static const line = AppColors.line;
}

/// Un item de la barre de navigation.
class PatientNavItem {
  final IconData icon;
  final String label;
  final int? badgeCount;

  const PatientNavItem({
    required this.icon,
    required this.label,
    this.badgeCount,
  });
}

class PatientBottomNavigationBar extends StatelessWidget {
  /// Index de l'onglet actif.
  final int currentIndex;

  /// Appelé avec le nouvel index lorsqu'un item est sélectionné.
  final ValueChanged<int> onTap;

  /// Liste des items. Par défaut : Accueil / Rendez-vous / Demande / Compte.
  final List<PatientNavItem> items;

  const PatientBottomNavigationBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    this.items = const [
      PatientNavItem(icon: Icons.home_rounded, label: 'Accueil'),
      PatientNavItem(icon: Icons.calendar_today_rounded, label: 'Rendez-vous'),
      PatientNavItem(icon: Icons.campaign_outlined, label: 'Demande'),
      PatientNavItem(icon: Icons.person_outline_rounded, label: 'Compte'),
    ],
  });

  @override
  Widget build(BuildContext context) {
    return ApsFloatingTabBar(
      currentIndex: currentIndex,
      onTap: onTap,
      items: [
        for (final i in items)
          ApsTabItem(label: i.label, icon: i.icon, badge: i.badgeCount ?? 0),
      ],
    );
  }
}
