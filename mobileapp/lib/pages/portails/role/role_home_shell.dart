import 'package:flutter/material.dart';

import '../../../models/authentification_models.dart' show RoleUtilisateur;
import '../../../components/navigation/role-bottom-navigation.dart';

/// Shell (Scaffold + RoleBottomNavigationBar) affiché pour tout rôle
/// qui n'a pas de shell dédié (admin, superadmin, agent_structure_sante,
/// agent_pharmacie, agent_ambulance, agent_pompes_funebres,
/// agent_assurance…).
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
        child: IndexedStack(
          index: _index,
          children: [
            for (final item in items) Center(child: Text(item.label)),
          ],
        ),
      ),
      bottomNavigationBar: RoleBottomNavigationBar.forRole(
        role: widget.role,
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
      ),
    );
  }
}