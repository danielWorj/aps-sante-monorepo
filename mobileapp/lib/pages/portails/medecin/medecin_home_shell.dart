import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/navigation/bouton_accueil_public.dart';
import '../../../components/cards/notifications_bell.dart';
import '../../../components/navigation/medecin-bottom-navigation-bar.dart';
import '../../../controllers/notification_controller.dart';
import '../../../utils/navigation_push.dart';
import 'portail-medecin-activite.dart';
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
/// en est l'unique responsable. « Activité » regroupe statistiques et avis.
///
/// Notifications in-app (politique de fonds v2, phase 6) : il n'y a pas
/// d'AppBar, la cloche flotte donc en haut à droite, au-dessus de
/// l'en-tête de chaque onglet. Le nombre de non lues alimente aussi la
/// pastille de l'item « Rendez-vous » de la barre basse. Un appui sur une
/// notification bascule sur l'onglet « Rendez-vous ».
class MedecinHomeShell extends ConsumerStatefulWidget {
  const MedecinHomeShell({super.key, this.ongletInitial = 0});

  /// Onglet ouvert à l'arrivée (ex. notification push touchée).
  final int ongletInitial;

  @override
  ConsumerState<MedecinHomeShell> createState() => _MedecinHomeShellState();
}

class _MedecinHomeShellState extends ConsumerState<MedecinHomeShell> {
  late int _index = widget.ongletInitial;

  /// Index de l'onglet « Rendez-vous » dans [_pages].
  static const int _indexRendezVous = 0;

  /// Index de l'onglet « Demandes » (RDV aléatoire) dans [_pages].
  static const int _indexDemandes = 1;

  /// Index de l'onglet « Activité » (statistiques + avis) dans [_pages].
  static const int _indexActivite = 4;

  static const _pages = <Widget>[
    PortailMedecinRdv(),
    PortailMedecinDemandes(),
    PortailMedecinAgenda(),
    PortailMedecinProfil(),
    PortailMedecinActivite(),
  ];

  // Notification push touchée : bascule sur l'onglet demandé.
  @override
  void initState() {
    super.initState();
    if (widget.ongletInitial == _indexActivite) vueActiviteMedecin.value = 1;
    demandeOngletPush.addListener(_surDemandePush);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _route = ModalRoute.of(context);
    if (_route != null) routesShellsPush[EspacePush.medecin] = _route!;
  }

  Route<dynamic>? _route;

  @override
  void dispose() {
    demandeOngletPush.removeListener(_surDemandePush);
    if (routesShellsPush[EspacePush.medecin] == _route) {
      routesShellsPush.remove(EspacePush.medecin);
    }
    super.dispose();
  }

  void _surDemandePush() {
    final demande = demandeOngletPush.value;
    if (demande == null || demande.espace != EspacePush.medecin) return;
    demandeOngletPush.value = null;
    final onglet = ongletMedecinPush(demande.cible);
    if (onglet == _indexActivite) vueActiviteMedecin.value = 1;
    setState(() => _index = onglet);
  }

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
              top: 12,
              right: 18,
              child: NotificationsBell(
                onOuvrirRendezVous: () =>
                    setState(() => _index = _indexRendezVous),
                onOuvrirDemandes: () =>
                    setState(() => _index = _indexDemandes),
                onOuvrirAvis: () {
                  vueActiviteMedecin.value = 1;
                  setState(() => _index = _indexActivite);
                },
              ),
            ),
          ],
        ),
      ),
      // Retour à l'accueil public sans se déconnecter.
      floatingActionButton: const BoutonAccueilPublic(),
      bottomNavigationBar: MedecinBottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
        notificationsNonLues: nonLues,
      ),
    );
  }
}
