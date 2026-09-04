import 'dart:ui';
import 'package:flutter/material.dart';

import '../../models/authentification_models.dart' show RoleUtilisateur;

/// ============================================================
/// role-bottom-navigation.dart
///
/// Barre de navigation basse flottante GÉNÉRIQUE, pour tous les
/// rôles qui n'ont pas (encore) de barre dédiée : admin, superadmin,
/// agent_structure_sante, agent_pharmacie, agent_ambulance,
/// agent_pompes_funebres, agent_assurance (voir table `roles`).
///
/// Même style visuel que patient-bottom-navigation.dart et
/// medecin-bottom-navigation-bar.dart, pour rester cohérent avec le
/// reste de l'app.
///
/// `itemsPourRole` fait correspondre chaque rôle à un jeu d'items par
/// défaut, aligné sur l'enum `RoleUtilisateur` d'authentification_models.dart
/// (patient, medecin, admin, superadmin, agentStructureSante,
/// agentPharmacie, agentAmbulance, agentPompesFunebres, agentAssurance).
/// ============================================================

class RoleNavColors {
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
class RoleNavItem {
  final IconData icon;
  final String label;
  final int? badgeCount;

  const RoleNavItem({
    required this.icon,
    required this.label,
    this.badgeCount,
  });
}

class RoleBottomNavigationBar extends StatelessWidget {
  /// Index de l'onglet actif.
  final int currentIndex;

  /// Appelé avec le nouvel index lorsqu'un item est sélectionné.
  final ValueChanged<int> onTap;

  /// Liste des items affichés.
  final List<RoleNavItem> items;

  const RoleBottomNavigationBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    required this.items,
  });

  /// Construit la barre avec un jeu d'items par défaut selon le rôle,
  /// pour éviter de devoir écrire une liste d'items à chaque écran
  /// qui héberge un rôle "administré" sans barre dédiée.
  factory RoleBottomNavigationBar.forRole({
    required RoleUtilisateur role,
    required int currentIndex,
    required ValueChanged<int> onTap,
  }) {
    return RoleBottomNavigationBar(
      currentIndex: currentIndex,
      onTap: onTap,
      items: itemsPourRole(role),
    );
  }

  /// Exposé statique (et non privé) pour pouvoir être réutilisé par le
  /// shell (ex: générer le nombre de pages correspondant).
  static List<RoleNavItem> itemsPourRole(RoleUtilisateur role) {
    switch (role) {
      case RoleUtilisateur.admin:
      case RoleUtilisateur.superadmin:
        return const [
          RoleNavItem(icon: Icons.dashboard_outlined, label: 'Tableau de bord'),
          RoleNavItem(icon: Icons.people_alt_outlined, label: 'Comptes'),
          RoleNavItem(icon: Icons.person_outline, label: 'Profil'),
        ];
      case RoleUtilisateur.agentStructureSante:
        return const [
          RoleNavItem(icon: Icons.local_hospital_outlined, label: 'Accueil'),
          RoleNavItem(icon: Icons.event_note_outlined, label: 'Demandes'),
          RoleNavItem(icon: Icons.person_outline, label: 'Profil'),
        ];
      case RoleUtilisateur.agentPharmacie:
        return const [
          RoleNavItem(icon: Icons.local_pharmacy_outlined, label: 'Accueil'),
          RoleNavItem(icon: Icons.event_note_outlined, label: 'Demandes'),
          RoleNavItem(icon: Icons.person_outline, label: 'Profil'),
        ];
      case RoleUtilisateur.agentAmbulance:
        return const [
          RoleNavItem(icon: Icons.local_shipping_outlined, label: 'Accueil'),
          RoleNavItem(icon: Icons.event_note_outlined, label: 'Courses'),
          RoleNavItem(icon: Icons.person_outline, label: 'Profil'),
        ];
      case RoleUtilisateur.agentPompesFunebres:
        return const [
          RoleNavItem(icon: Icons.business_outlined, label: 'Accueil'),
          RoleNavItem(icon: Icons.event_note_outlined, label: 'Demandes'),
          RoleNavItem(icon: Icons.person_outline, label: 'Profil'),
        ];
      case RoleUtilisateur.agentAssurance:
        return const [
          RoleNavItem(icon: Icons.shield_outlined, label: 'Accueil'),
          RoleNavItem(icon: Icons.event_note_outlined, label: 'Dossiers'),
          RoleNavItem(icon: Icons.person_outline, label: 'Profil'),
        ];
      case RoleUtilisateur.patient:
      case RoleUtilisateur.medecin:
      // Ces deux rôles ont leur propre barre dédiée (PatientBottomNavigationBar
      // / MedecinBottomNavigationBar) — cas conservé uniquement pour que le
      // switch soit exhaustif ; ne devrait jamais être atteint via
      // RoleHomeShell (voir HomeRouterForRole).
        return const [
          RoleNavItem(icon: Icons.home_outlined, label: 'Accueil'),
          RoleNavItem(icon: Icons.person_outline, label: 'Profil'),
        ];
    }
  }

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
              color: RoleNavColors.card.withOpacity(0.94),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: RoleNavColors.line),
              boxShadow: [
                BoxShadow(
                  color: RoleNavColors.green900.withOpacity(0.28),
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
                return _RoleNavItemWidget(
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

class _RoleNavItemWidget extends StatelessWidget {
  final RoleNavItem item;
  final bool active;
  final VoidCallback onTap;

  const _RoleNavItemWidget({
    required this.item,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = active ? RoleNavColors.green700 : RoleNavColors.inkFaint;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        width: 64,
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
                    color: active ? RoleNavColors.green100 : Colors.transparent,
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
                        color: RoleNavColors.coral500,
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
              textAlign: TextAlign.center,
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