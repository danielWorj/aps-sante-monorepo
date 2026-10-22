import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../controllers/authentification_controller.dart';
import '../models/authentification_models.dart' show EspaceCompte, RoleUtilisateur;
import 'espaces/choisir_espace_screen.dart';
import 'portails/assurance/assurance_home_shell.dart';
import 'portails/laboratoire/laboratoire_home_shell.dart';
import 'portails/medecin/medecin_home_shell.dart';
import 'portails/patient/patient_home_shell.dart';
import 'portails/role/role_home_shell.dart';
import 'publicite/mes_publicites_screen.dart';

/// Aiguille vers le "shell" (Scaffold + bottom navigation bar) adapté
/// au rôle de l'utilisateur connecté :
///   - patient  -> PatientHomeShell  (components/patient-bottom-navigation.dart)
///   - medecin  -> MedecinHomeShell  (components/medecin-bottom-navigation-bar.dart)
///   - agent_assurance -> AssuranceHomeShell (portail assurance)
///   - agent_laboratoire -> LaboratoireHomeShell (portail laboratoire)
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
      case RoleUtilisateur.agentLaboratoire:
        return const LaboratoireHomeShell();
      case RoleUtilisateur.annonceur:
        return const MesPublicitesScreen(espaceAnnonceur: true);
      default:
        return RoleHomeShell(role: role);
    }
  }
}

/// Écran d'accueil d'un espace du compte (voir GET /auth/espaces).
Widget ecranEspace(EspaceCompte espace, RoleUtilisateur role) {
  switch (espace.type) {
    case 'patient':
      return const PatientHomeShell();
    case 'medecin':
      return const MedecinHomeShell();
    case 'assurance':
      return const AssuranceHomeShell();
    case 'laboratoire':
      return const LaboratoireHomeShell();
    case 'publicites':
      return const MesPublicitesScreen(espaceAnnonceur: true);
    default:
      return HomeRouterForRole(role: role);
  }
}

/// Point d'entrée de l'espace personnel une fois connecté (une personne =
/// un compte, plusieurs espaces possibles) :
///   - un seul espace : on l'ouvre ;
///   - plusieurs espaces : après une vraie connexion ([choisir] = true),
///     « Choisir mon espace » ; à la réouverture de l'application, le
///     DERNIER espace utilisé directement (la liste reste accessible par
///     « Changer d'espace »).
/// Si la liste ne peut pas être chargée, on retombe sur l'accueil du rôle.
class AccueilCompte extends ConsumerWidget {
  const AccueilCompte({super.key, this.choisir = false, this.espaces});

  final bool choisir;

  /// Liste déjà connue (réponse de connexion), pour éviter un appel.
  final List<EspaceCompte>? espaces;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(authUtilisateurProvider)?.role;
    if (role == null) return const SizedBox.shrink();

    Widget pour(List<EspaceCompte> liste) {
      if (liste.isEmpty) return HomeRouterForRole(role: role);
      if (liste.length == 1) return ecranEspace(liste.first, role);
      final dernier = liste.where((e) => e.dernier).firstOrNull;
      if (!choisir && dernier != null) return ecranEspace(dernier, role);
      return ChoisirEspaceScreen(espaces: liste);
    }

    if (espaces != null) return pour(espaces!);
    return ref.watch(espacesCompteProvider).when(
          data: pour,
          error: (_, _) => HomeRouterForRole(role: role),
          loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
        );
  }
}
