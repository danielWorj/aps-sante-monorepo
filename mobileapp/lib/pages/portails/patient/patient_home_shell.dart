import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobileapp/pages/portails/patient/portail-patient-profil.dart';

import '../../../components/cards/notifications_bell.dart';
import '../../../components/navigation/patient-bottom-navigation.dart';
import '../../../controllers/notification_controller.dart';
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
///
/// Notifications in-app (politique de fonds v2, phase 6) : il n'y a pas
/// d'AppBar, la cloche flotte donc en haut à droite, au-dessus de
/// l'en-tête de chaque onglet. Un appui sur une notification bascule sur
/// l'onglet « Rendez-vous ».
class PatientHomeShell extends ConsumerStatefulWidget {
  const PatientHomeShell({super.key});

  @override
  ConsumerState<PatientHomeShell> createState() => _PatientHomeShellState();
}

class _PatientHomeShellState extends ConsumerState<PatientHomeShell> {
  int _index = 0;

  /// Index de l'onglet « Rendez-vous » dans [_pages].
  static const int _indexRendezVous = 1;

  static const _pages = <Widget>[
    Center(child: Text('Accueil patient')), // TODO: écran réel "Accueil"
    PortailPatientRdv(),
    PortailPatientProfil(), // TODO: créer PortailPatientProfil
  ];

  @override
  Widget build(BuildContext context) {
    // Démarre le polling dès l'entrée dans le shell (le provider est
    // paresseux) : la cloche et son compteur sont ainsi toujours à jour.
    ref.watch(notificationControllerProvider);

    return Scaffold(
      extendBody: true,
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            IndexedStack(index: _index, children: _pages),
            Positioned(
              top: 6,
              right: 14,
              child: NotificationsBell(
                onOuvrirRendezVous: () =>
                    setState(() => _index = _indexRendezVous),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: PatientBottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
      ),
    );
  }
}
