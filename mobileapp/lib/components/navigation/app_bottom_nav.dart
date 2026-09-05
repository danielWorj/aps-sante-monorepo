import 'dart:ui';
import 'package:flutter/material.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';

/// Un item de la barre de navigation basse (hors bouton flottant).
class AppBottomNavItem {
  const AppBottomNavItem({required this.label, required this.icon});

  final String label;
  final IconData icon;
}

/// Barre de navigation basse flottante — `.bottomnav` dans la maquette.
///
/// Reproduit fidèlement `ui-mobile.html` :
/// - 4 rubriques disposées de part et d'autre d'un bouton flottant central
///   (`.navitem` / `.navitem.active`),
/// - un bouton flottant central « Prendre rendez-vous » (`.navitem-fab`),
///   qui dépasse au-dessus de la barre.
///
/// Rubriques par défaut : **Accueil, Médecin, Assurance, Mon espace**
/// (le bouton flottant central correspond au rendez-vous, pas à une rubrique).
///
/// La rubrique « Mon espace » (ex « À propos ») ouvre l'espace personnel
/// de l'utilisateur s'il est déjà connecté (sa propre bottom navigation
/// bar, avec ses différentes pages), ou l'écran de connexion sinon —
/// voir `utils/mon_espace_navigation.dart` (`ouvrirMonEspace`).
///
/// Utilisation — à placer dans un `Stack` en bas de l'écran (comme dans la
/// maquette, la barre flotte au-dessus du contenu) :
/// ```dart
/// Scaffold(
///   extendBody: true,
///   body: Stack(
///     children: [
///       ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 96), ...),
///       Positioned(
///         left: 10,
///         right: 10,
///         bottom: 10,
///         child: AppBottomNav(
///           currentIndex: 0,
///           onTap: (i) {},
///           onRdvPressed: () {},
///         ),
///       ),
///     ],
///   ),
/// )
/// ```
class AppBottomNav extends StatelessWidget {
  const AppBottomNav({
    super.key,
    required this.onTap,
    required this.onRdvPressed,
    this.currentIndex = 0,
    this.items = defaultItems,
    this.rdvLabel = 'Rendez-vous',
    this.rdvIcon = Icons.calendar_month_rounded,
  }) : assert(items.length == 4,
  'AppBottomNav attend exactement 4 rubriques (2 de chaque côté du bouton flottant).');

  /// Rubriques par défaut de l'application APS : Accueil, Médecin, Assurance, Mon espace.
  static const List<AppBottomNavItem> defaultItems = [
    AppBottomNavItem(label: 'Accueil', icon: Icons.home_rounded),
    AppBottomNavItem(label: 'Médecin', icon: Icons.medical_services_outlined),
    AppBottomNavItem(label: 'Assurance', icon: Icons.shield_outlined),
    AppBottomNavItem(label: 'Mon espace', icon: Icons.person_outline_rounded),
  ];

  /// Les 4 rubriques affichées (2 avant / 2 après le bouton flottant).
  final List<AppBottomNavItem> items;

  /// Index de la rubrique active (0 à 3).
  final int currentIndex;

  /// Appelé avec l'index de la rubrique tapée (0 à 3).
  final ValueChanged<int> onTap;

  /// Appelé quand le bouton flottant central (« Rendez-vous ») est tapé.
  final VoidCallback onRdvPressed;

  /// Libellé accessible du bouton flottant (non affiché, cf. `Semantics`).
  final String rdvLabel;

  /// Icône du bouton flottant central.
  final IconData rdvIcon;

  @override
  Widget build(BuildContext context) {
    final left = items.sublist(0, 2);
    final right = items.sublist(2, 4);

    return SizedBox(
      height: 66 + 22, // + espace pour le débord du bouton flottant (margin-top: -22)
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.bottomCenter,
        children: [
          // Barre flottante avec effet "verre dépoli"
          ClipRRect(
            borderRadius: BorderRadius.circular(22),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
              child: Container(
                height: 66,
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.92),
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: AppColors.line),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.ink.withOpacity(0.28),
                      blurRadius: 24,
                      offset: const Offset(0, 10),
                      spreadRadius: -14,
                    ),
                  ],
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _NavItem(item: left[0], active: currentIndex == 0, onTap: () => onTap(0)),
                    _NavItem(item: left[1], active: currentIndex == 1, onTap: () => onTap(1)),
                    // Espace réservé pour le bouton flottant, positionné au-dessus.
                    const SizedBox(width: 48),
                    _NavItem(item: right[0], active: currentIndex == 2, onTap: () => onTap(2)),
                    _NavItem(item: right[1], active: currentIndex == 3, onTap: () => onTap(3)),
                  ],
                ),
              ),
            ),
          ),
          // Bouton flottant central — Prendre rendez-vous
          Positioned(
            bottom: 66 - 26, // aligné avec margin-top:-22px de la maquette (48/2=24 + un peu de marge)
            child: Semantics(
              button: true,
              label: rdvLabel,
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: onRdvPressed,
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    width: 48,
                    height: 48,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.primary.withOpacity(0.55),
                          blurRadius: 16,
                          offset: const Offset(0, 8),
                          spreadRadius: -6,
                        ),
                      ],
                    ),
                    child: Icon(rdvIcon, color: Colors.white, size: 22),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({required this.item, required this.active, required this.onTap});

  final AppBottomNavItem item;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.primary : AppColors.inkFaint;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        width: 56,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              margin: const EdgeInsets.only(bottom: 1),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
              decoration: BoxDecoration(
                color: active ? AppColors.primaryLight : Colors.transparent,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(item.icon, size: 20, color: color),
            ),
            Text(
              item.label,
              style: AppTextStyles.badge.copyWith(fontSize: 10.5, color: color),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}