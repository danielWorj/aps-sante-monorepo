import 'package:flutter/material.dart';

import '../../../components/navigation/patient-bottom-navigation.dart';
import 'portail-patient-rdv.dart';

/// Shell (Scaffold + PatientBottomNavigationBar) affiché une fois
/// connecté avec le rôle "patient".
///
/// "Rendez-vous" pointe vers le vrai écran (`PortailPatientRdv`), qui
/// ne gère plus lui-même de barre de navigation : c'est ce shell qui
/// en est l'unique responsable. "Accueil" et "Profil" restent des
/// placeholders : la page profil patient n'existe pas encore
/// (contrairement à son équivalent médecin, `PortailMedecinProfil`) —
/// à remplacer dès qu'elle sera écrite.
class PatientHomeShell extends StatefulWidget {
  const PatientHomeShell({super.key});

  @override
  State<PatientHomeShell> createState() => _PatientHomeShellState();
}

class _PatientHomeShellState extends State<PatientHomeShell> {
  int _index = 0;

  static const _pages = <Widget>[
    Center(child: Text('Accueil patient')), // TODO: écran réel "Accueil"
    PortailPatientRdv(),
    Center(child: Text('Profil')), // TODO: créer PortailPatientProfil
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      body: SafeArea(
        bottom: false,
        child: IndexedStack(index: _index, children: _pages),
      ),
      bottomNavigationBar: PatientBottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
      ),
    );
  }
}