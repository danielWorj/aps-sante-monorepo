import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../ui/aps_ui.dart';

/// ============================================================
/// medecin-bottom-navigation-bar.dart
///
/// Barre de navigation basse de l'espace médecin — barre flottante
/// sombre de la refonte 2026 (`.tab` dans new-mobile-ui.html).
/// Items : Rendez-vous, Demandes, Agenda, Compte, Activité.
/// ============================================================

/// Couleurs conservées pour compatibilité ; elles suivent la palette.
class MedecinNavColors {
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
class MedecinNavItem {
  final IconData icon;
  final String label;
  final int? badgeCount;

  const MedecinNavItem({
    required this.icon,
    required this.label,
    this.badgeCount,
  });
}

class MedecinBottomNavigationBar extends StatelessWidget {
  /// Index de l'onglet actif.
  final int currentIndex;

  /// Appelé avec le nouvel index lorsqu'un item est sélectionné.
  final ValueChanged<int> onTap;

  /// Nombre de notifications non lues, affiché en pastille sur l'item
  /// « Rendez-vous » (politique de fonds v2, phase 6). `0` = pas de pastille.
  final int notificationsNonLues;

  /// Liste des items. Par défaut : Rendez-vous / Demandes / Agenda /
  /// Compte / Activité ; la pastille de « Rendez-vous » suit
  /// [notificationsNonLues].
  final List<MedecinNavItem>? items;

  const MedecinBottomNavigationBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    this.notificationsNonLues = 0,
    this.items,
  });

  List<MedecinNavItem> get _items =>
      items ??
      [
        MedecinNavItem(
          icon: Icons.grid_view_rounded,
          label: 'Tableau',
          badgeCount: notificationsNonLues > 0 ? notificationsNonLues : null,
        ),
        const MedecinNavItem(icon: Icons.campaign_outlined, label: 'Demandes'),
        const MedecinNavItem(icon: Icons.calendar_today_rounded, label: 'Agenda'),
        const MedecinNavItem(icon: Icons.person_outline_rounded, label: 'Compte'),
        const MedecinNavItem(icon: Icons.insights_rounded, label: 'Activité'),
      ];

  @override
  Widget build(BuildContext context) {
    return ApsFloatingTabBar(
      currentIndex: currentIndex,
      onTap: onTap,
      items: [
        for (final i in _items)
          ApsTabItem(label: i.label, icon: i.icon, badge: i.badgeCount ?? 0),
      ],
    );
  }
}
