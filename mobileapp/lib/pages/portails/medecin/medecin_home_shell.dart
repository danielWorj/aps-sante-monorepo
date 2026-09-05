import 'package:flutter/material.dart';

import '../../../components/navigation/medecin-bottom-navigation-bar.dart';
import 'portail-medecin-rdv.dart';
import 'portail-medecin-profil.dart';

/// Shell (Scaffold + MedecinBottomNavigationBar) affiché une fois
/// connecté avec le rôle "medecin".
///
/// "Rendez-vous" et "Profil" pointent vers les vrais écrans
/// (`PortailMedecinRdv` / `PortailMedecinProfil`), qui ne gèrent plus
/// eux-mêmes de barre de navigation : c'est ce shell qui en est
/// l'unique responsable. "Agenda" et "Aide" restent des placeholders
/// à remplacer au fur et à mesure qu'ils existent.
class MedecinHomeShell extends StatefulWidget {
  const MedecinHomeShell({super.key});

  @override
  State<MedecinHomeShell> createState() => _MedecinHomeShellState();
}

class _MedecinHomeShellState extends State<MedecinHomeShell> {
  int _index = 0;

  static const _pages = <Widget>[
    PortailMedecinRdv(),
    Center(child: Text('Agenda')), // TODO: écran réel "Agenda"
    PortailMedecinProfil(),
    Center(child: Text('Aide')), // TODO: écran réel "Aide"
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      body: SafeArea(
        bottom: false,
        child: IndexedStack(index: _index, children: _pages),
      ),
      bottomNavigationBar: MedecinBottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
      ),
    );
  }
}