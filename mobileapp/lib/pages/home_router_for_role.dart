import 'package:flutter/material.dart';

import '../models/authentification_models.dart' show RoleUtilisateur;
import 'portails/assurance/assurance_home_shell.dart';
import 'portails/medecin/medecin_home_shell.dart';
import 'portails/patient/patient_home_shell.dart';
import 'portails/role/role_home_shell.dart';
import 'publicite/mes_publicites_screen.dart';

/// Aiguille vers le "shell" (Scaffold + bottom navigation bar) adapté
/// au rôle de l'utilisateur connecté :
///   - patient  -> PatientHomeShell  (components/patient-bottom-navigation.dart)
///   - medecin  -> MedecinHomeShell  (components/medecin-bottom-navigation-bar.dart)
///   - agent_assurance -> AssuranceHomeShell (portail assurance)
///   - annonceur -> MesPublicitesScreen (portail annonceur, avec déconnexion)
///   - tout autre rôle (admin, superadmin, agent_structure_sante,
///     agent_pharmacie, agent_ambulance, agent_pompes_funebres,
///     agent_assurance…) -> RoleHomeShell (components/role-bottom-navigation.dart)
class HomeRouterForRole extends StatelessWidget {
  final RoleUtilisateur role;

  const HomeRouterForRole({super.key, required this.role});

  @override
  Widget build(BuildContext context) {
    switch (role) {
      case RoleUtilisateur.patient:
        return const PatientHomeShell();
      case RoleUtilisateur.medecin:
        return const MedecinHomeShell();
      case RoleUtilisateur.agentAssurance:
        return const AssuranceHomeShell();
      case RoleUtilisateur.annonceur:
        return const MesPublicitesScreen(espaceAnnonceur: true);
      default:
        return RoleHomeShell(role: role);
    }
  }
}