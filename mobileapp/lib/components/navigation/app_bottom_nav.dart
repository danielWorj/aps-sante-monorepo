import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../ui/aps_ui.dart';

/// Un item de la barre de navigation basse (hors bouton central).
class AppBottomNavItem {
  const AppBottomNavItem({required this.label, required this.icon});

  final String label;
  final IconData icon;
}

/// Barre de navigation basse de l'espace public — barre flottante
/// sombre de la refonte 2026 (`.tab` dans new-mobile-ui.html).
///
/// Quatre rubriques (l'active est une pastille blanche avec libellé),
/// plus une action centrale verte « Prendre rendez-vous ».
///
/// Rubriques par défaut : **Accueil, Médecins, Assurances, Compte**.
/// « Compte » ouvre l'espace personnel s'il existe une session, sinon la
/// connexion — voir `utils/mon_espace_navigation.dart` (`ouvrirMonEspace`).
///
/// À placer en bas d'un `Stack` (la barre flotte au-dessus du contenu) :
/// ```dart
/// Positioned(
///   left: 16, right: 16, bottom: 24,
///   child: AppBottomNav(currentIndex: 0, onTap: (i) {}, onRdvPressed: () {}),
/// )
/// ```
class AppBottomNav extends StatelessWidget {
  const AppBottomNav({
    super.key,
    required this.onTap,
    required this.onRdvPressed,
    this.currentIndex = 0,
    this.items = defaultItems,
    this.rdvLabel = 'Prendre rendez-vous',
    this.rdvIcon = Icons.add_rounded,
  }) : assert(items.length == 4,
            'AppBottomNav attend exactement 4 rubriques (2 de chaque côté du bouton central).');

  static const List<AppBottomNavItem> defaultItems = [
    AppBottomNavItem(label: 'Accueil', icon: Icons.home_rounded),
    AppBottomNavItem(label: 'Médecins', icon: Icons.explore_outlined),
    AppBottomNavItem(label: 'Assurances', icon: Icons.shield_outlined),
    AppBottomNavItem(label: 'Compte', icon: Icons.person_outline_rounded),
  ];

  /// Les 4 rubriques affichées (2 avant / 2 après le bouton central).
  final List<AppBottomNavItem> items;

  /// Index de la rubrique active (0 à 3) ; -1 pour n'en activer aucune.
  final int currentIndex;

  /// Appelé avec l'index de la rubrique tapée (0 à 3).
  final ValueChanged<int> onTap;

  /// Appelé quand le bouton central est tapé.
  final VoidCallback onRdvPressed;

  /// Libellé accessible du bouton central.
  final String rdvLabel;

  /// Icône du bouton central.
  final IconData rdvIcon;

  /// Hauteur à réserver en bas des listes qui défilent sous la barre.
  static const double reservedHeight = 66 + 24 + 16;

  @override
  Widget build(BuildContext context) {
    Widget pill(int i) => ApsTabPill(
          item: ApsTabItem(label: items[i].label, icon: items[i].icon),
          active: currentIndex == i,
          compact: true,
          onTap: () => onTap(i),
        );

    return ApsTabBarSurface(
      children: [
        pill(0),
        pill(1),
        Semantics(
          button: true,
          label: rdvLabel,
          child: Tooltip(
            message: rdvLabel,
            child: GestureDetector(
              onTap: onRdvPressed,
              child: Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  gradient: AppColors.gradientLogo,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(rdvIcon, color: Colors.white, size: 24),
              ),
            ),
          ),
        ),
        pill(2),
        pill(3),
      ],
    );
  }
}
