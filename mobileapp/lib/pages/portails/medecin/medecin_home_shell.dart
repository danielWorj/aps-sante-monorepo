import 'package:flutter/material.dart';

import '../../../components/navigation/medecin-bottom-navigation-bar.dart';

/// Shell (Scaffold + MedecinBottomNavigationBar) affiché une fois
/// connecté avec le rôle "medecin".
///
/// Les pages sont volontairement des placeholders : à remplacer par
/// les vrais écrans "Rendez-vous" / "Agenda" / "Profil" / "Aide" de
/// l'espace médecin au fur et à mesure qu'ils existent.
class MedecinHomeShell extends StatefulWidget {
  const MedecinHomeShell({super.key});

  @override
  State<MedecinHomeShell> createState() => _MedecinHomeShellState();
}

class _MedecinHomeShellState extends State<MedecinHomeShell> {
  int _index = 0;

  static const _pages = <Widget>[
    Center(child: Text('Rendez-vous')),
    Center(child: Text('Agenda')),
    Center(child: Text('Profil')),
    Center(child: Text('Aide')),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: IndexedStack(index: _index, children: _pages),
      ),
      bottomNavigationBar: MedecinBottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
      ),
    );
  }
}