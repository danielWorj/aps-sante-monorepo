import 'package:flutter/material.dart';

import '../../../components/navigation/patient-bottom-navigation.dart';

/// Shell (Scaffold + PatientBottomNavigationBar) affiché une fois
/// connecté avec le rôle "patient".
///
/// Les pages sont volontairement des placeholders : à remplacer par
/// les vrais écrans "Accueil" / "Rendez-vous" / "Profil" de l'espace
/// patient au fur et à mesure qu'ils existent.
class PatientHomeShell extends StatefulWidget {
  const PatientHomeShell({super.key});

  @override
  State<PatientHomeShell> createState() => _PatientHomeShellState();
}

class _PatientHomeShellState extends State<PatientHomeShell> {
  int _index = 0;

  static const _pages = <Widget>[
    Center(child: Text('Accueil patient')),
    Center(child: Text('Rendez-vous')),
    Center(child: Text('Profil')),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: IndexedStack(index: _index, children: _pages),
      ),
      bottomNavigationBar: PatientBottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
      ),
    );
  }
}