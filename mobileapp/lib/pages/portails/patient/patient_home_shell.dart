import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobileapp/pages/portails/patient/portail-patient-profil.dart';

import '../../../components/cards/notifications_bell.dart';
import '../../../components/navigation/patient-bottom-navigation.dart';
import '../../../controllers/notification_controller.dart';
import '../../../utils/navigation_push.dart';
import 'portail-patient-accueil.dart';
import 'portail-patient-demandes.dart';
import 'portail-patient-rdv.dart';

/// Shell (Scaffold + PatientBottomNavigationBar) affiché une fois
/// connecté avec le rôle "patient".
///
/// "Rendez-vous" pointe vers le vrai écran (`PortailPatientRdv`), qui
/// ne gère plus lui-même de barre de navigation : c'est ce shell qui
/// en est l'unique responsable. « Accueil » ([PortailPatientAccueil])
/// montre le prochain rendez-vous et les raccourcis.
///
/// Notifications in-app (politique de fonds v2, phase 6) : il n'y a pas
/// d'AppBar, la cloche flotte donc en haut à droite, au-dessus de
/// l'en-tête de chaque onglet. Un appui sur une notification bascule sur
/// l'onglet « Rendez-vous ».
class PatientHomeShell extends ConsumerStatefulWidget {
  const PatientHomeShell({super.key, this.ongletInitial = 0});

  /// Onglet ouvert à l'arrivée (ex. [indexDemandes] depuis le bandeau
  /// « Demande rapide » de l'annuaire public).
  final int ongletInitial;

  /// Index de l'onglet « Demande » (RDV aléatoire).
  static const int indexDemandes = 2;

  @override
  ConsumerState<PatientHomeShell> createState() => _PatientHomeShellState();
}

class _PatientHomeShellState extends ConsumerState<PatientHomeShell> {
  late int _index = widget.ongletInitial;

  /// Index de l'onglet « Rendez-vous » dans [_pages].
  static const int _indexRendezVous = 1;

  /// Index de l'onglet « Demande » (RDV aléatoire) dans [_pages].
  static const int _indexDemandes = PatientHomeShell.indexDemandes;

  late final List<Widget> _pages = <Widget>[
    PortailPatientAccueil(
      onOuvrirRendezVous: () => setState(() => _index = _indexRendezVous),
      onOuvrirDemandes: () => setState(() => _index = _indexDemandes),
    ),
    const PortailPatientRdv(),
    const PortailPatientDemandes(),
    const PortailPatientProfil(),
  ];

  // Notification push touchée : bascule sur l'onglet demandé.
  @override
  void initState() {
    super.initState();
    demandeOngletPush.addListener(_surDemandePush);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _route = ModalRoute.of(context);
    if (_route != null) routesShellsPush[EspacePush.patient] = _route!;
  }

  Route<dynamic>? _route;

  @override
  void dispose() {
    demandeOngletPush.removeListener(_surDemandePush);
    if (routesShellsPush[EspacePush.patient] == _route) {
      routesShellsPush.remove(EspacePush.patient);
    }
    super.dispose();
  }

  void _surDemandePush() {
    final demande = demandeOngletPush.value;
    if (demande == null || demande.espace != EspacePush.patient) return;
    demandeOngletPush.value = null;
    setState(() => _index = ongletPatientPush(demande.cible));
  }

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
              top: 12,
              right: 18,
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
      bottomNavigationBar: PatientBottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
      ),
    );
  }
}
