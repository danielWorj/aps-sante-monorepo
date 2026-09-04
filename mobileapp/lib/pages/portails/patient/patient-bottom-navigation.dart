import 'dart:ui';
import 'package:flutter/material.dart';

/// ============================================================
/// patient-bottom-navigation.dart
///
/// Barre de navigation basse flottante de l'espace patient (APS).
/// Reproduit le même style que la barre médecin : items
/// "Accueil", "Rendez-vous", "Profil".
/// ============================================================

/// Palette reprise des design tokens CSS (`:root`).
class PatientNavColors {
  static const green900 = Color(0xFF0F3A2B);
  static const green700 = Color(0xFF1E8A63);
  static const green100 = Color(0xFFE4F3EC);
  static const coral500 = Color(0xFFE1604A);
  static const ink = Color(0xFF16241F);
  static const inkFaint = Color(0xFF93A39C);
  static const card = Color(0xFFFFFFFF);
  static const line = Color(0xFFE5ECE8);
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

/// Barre de navigation basse flottante, façon "pill" arrondie,
/// avec léger effet de flou (backdrop-filter blur dans le CSS).
class PatientBottomNavigationBar extends StatelessWidget {
  /// Index de l'onglet actif.
  final int currentIndex;

  /// Appelé avec le nouvel index lorsqu'un item est sélectionné.
  final ValueChanged<int> onTap;

  /// Liste des items. Par défaut : Accueil / Rendez-vous / Profil.
  final List<PatientNavItem> items;

  const PatientBottomNavigationBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    this.items = const [
      PatientNavItem(
        icon: Icons.home_outlined,
        label: 'Accueil',
      ),
      PatientNavItem(
        icon: Icons.event_note_outlined,
        label: 'Rendez-vous',
      ),
      PatientNavItem(
        icon: Icons.person_outline,
        label: 'Profil',
      ),
    ],
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
          child: Container(
            height: 66,
            decoration: BoxDecoration(
              color: PatientNavColors.card.withOpacity(0.94),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: PatientNavColors.line),
              boxShadow: [
                BoxShadow(
                  color: PatientNavColors.green900.withOpacity(0.28),
                  blurRadius: 24,
                  offset: const Offset(0, 10),
                  spreadRadius: -14,
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: List.generate(items.length, (index) {
                final item = items[index];
                final active = index == currentIndex;
                return _PatientNavItemWidget(
                  item: item,
                  active: active,
                  onTap: () => onTap(index),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }
}

class _PatientNavItemWidget extends StatelessWidget {
  final PatientNavItem item;
  final bool active;
  final VoidCallback onTap;

  const _PatientNavItemWidget({
    required this.item,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color =
    active ? PatientNavColors.green700 : PatientNavColors.inkFaint;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        width: 58,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: active
                        ? PatientNavColors.green100
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(item.icon, size: 20, color: color),
                ),
                if (item.badgeCount != null)
                  Positioned(
                    top: -2,
                    right: 4,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 15),
                      height: 15,
                      padding: const EdgeInsets.symmetric(horizontal: 3),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: PatientNavColors.coral500,
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: Text(
                        '${item.badgeCount}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 8.5,
                          fontWeight: FontWeight.w700,
                          height: 1,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              item.label,
              style: TextStyle(
                fontFamily: 'Sora',
                fontSize: 10.5,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}