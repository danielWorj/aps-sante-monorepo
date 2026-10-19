import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../ui/aps_ui.dart';

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
          RoleNavItem(icon: Icons.dashboard_outlined, label: 'Tableau'),
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
      case RoleUtilisateur.annonceur:
      // Ces rôles ont leur propre écran (PatientBottomNavigationBar,
      // MedecinBottomNavigationBar, portail annonceur) — cas conservé uniquement pour que le
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
