import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../models/authentification_models.dart' show RoleUtilisateur;
import '../../../components/navigation/role-bottom-navigation.dart';
import '../annonces/portail_annonces.dart';
import '../../espaces/carte_connexion_compte.dart';

/// Shell (Scaffold + RoleBottomNavigationBar) affiché pour tout rôle
/// qui n'a pas de shell dédié (admin, superadmin, agent_ambulance,
/// agent_pompes_funebres). Pharmacie et centre de santé : PresenceHomeShell.
///
/// Les pages sont des placeholders générés à partir des libellés des
/// items de la barre : à remplacer par les vrais écrans de chaque
/// espace au fur et à mesure qu'ils existent.
class RoleHomeShell extends StatefulWidget {
  final RoleUtilisateur role;

  const RoleHomeShell({super.key, required this.role});

  @override
  State<RoleHomeShell> createState() => _RoleHomeShellState();
}

class _RoleHomeShellState extends State<RoleHomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final items = RoleBottomNavigationBar.itemsPourRole(widget.role);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const _EnTeteEspace(),
            Expanded(
              child: IndexedStack(
                index: _index,
                children: [
                  for (final item in items) Center(child: Text(item.label)),
                ],
              ),
            ),
          ],
        ),
      ),
      // Retour à l'accueil public sans se déconnecter.
      floatingActionButton: const BoutonAccueilPublic(),
      bottomNavigationBar: RoleBottomNavigationBar.forRole(
        role: widget.role,
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
      ),
    );
  }
}

/// Avatar + nom du propriétaire de l'espace, avec la déconnexion.
class _EnTeteEspace extends ConsumerWidget {
  const _EnTeteEspace();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(authUtilisateurProvider);
    final nom = [u?.prenom, u?.nom]
        .whereType<String>()
        .where((e) => e.isNotEmpty)
        .join(' ');
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 6),
      child: Row(
        children: [
          ApsAvatar(name: nom.isEmpty ? 'Mon espace' : nom, size: 40),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Mon espace', style: AppTextStyles.xs),
                Text(
                  nom.isEmpty ? 'Bienvenue' : nom,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTextStyles.strong.copyWith(fontSize: 15),
                ),
              ],
            ),
          ),
          const BoutonChangerEspace(),
          const BoutonAnnonces(),
          const SizedBox(width: 8),
          const BoutonParametres(),
          const BoutonDeconnexion(),
        ],
      ),
    );
  }
}
