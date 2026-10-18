import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/cards/notifications_bell.dart';
import '../../../components/navigation/medecin-bottom-navigation-bar.dart';
import '../../../controllers/notification_controller.dart';
import 'portail-medecin-agenda.dart';
import 'portail-medecin-demandes.dart';
import 'portail-medecin-rdv.dart';
import 'portail-medecin-profil.dart';

/// Shell (Scaffold + MedecinBottomNavigationBar) affiché une fois
/// connecté avec le rôle "medecin".
///
/// "Rendez-vous", "Agenda" et "Profil" pointent vers les vrais écrans
/// (`PortailMedecinRdv` / `PortailMedecinAgenda` / `PortailMedecinProfil`),
/// qui ne gèrent pas eux-mêmes de barre de navigation : c'est ce shell qui
/// en est l'unique responsable. "Aide" reste un placeholder.
///
/// Notifications in-app (politique de fonds v2, phase 6) : il n'y a pas
/// d'AppBar, la cloche flotte donc en haut à droite, au-dessus de
/// l'en-tête de chaque onglet. Le nombre de non lues alimente aussi la
/// pastille de l'item « Rendez-vous » de la barre basse. Un appui sur une
/// notification bascule sur l'onglet « Rendez-vous ».
class MedecinHomeShell extends ConsumerStatefulWidget {
  const MedecinHomeShell({super.key});

  @override
  ConsumerState<MedecinHomeShell> createState() => _MedecinHomeShellState();
}

class _MedecinHomeShellState extends ConsumerState<MedecinHomeShell> {
  int _index = 0;

  /// Index de l'onglet « Rendez-vous » dans [_pages].
  static const int _indexRendezVous = 0;

  /// Index de l'onglet « Demandes » (RDV aléatoire) dans [_pages].
  static const int _indexDemandes = 1;

  static const _pages = <Widget>[
    PortailMedecinRdv(),
    PortailMedecinDemandes(),
    PortailMedecinAgenda(),
    PortailMedecinProfil(),
    Center(child: Text('Aide')), // TODO: écran réel "Aide"
  ];

  @override
  Widget build(BuildContext context) {
    // Lire le compteur démarre aussi le polling (provider paresseux).
    final nonLues = ref.watch(notificationsNonLuesProvider);

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
                onOuvrirDemandes: () =>
                    setState(() => _index = _indexDemandes),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: MedecinBottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
        notificationsNonLues: nonLues,
      ),
    );
  }
}
