// lib/pages/pilote_push.dart
//
// Pilote des notifications push, monté au-dessus de toute l'application
// (MaterialApp.builder) :
//   - connexion → jeton FCM de l'appareil enregistré auprès du serveur
//     (POST /notifications/appareils), ainsi qu'à chaque renouvellement ;
//   - déconnexion → jeton supprimé (le téléphone ne reçoit plus rien) ;
//   - notification touchée → page des rendez-vous (ou des demandes, des
//     avis) de l'espace patient ou médecin concerné ; si l'application a
//     été lancée par la notification, l'ouverture attend la restauration
//     de la session ;
//   - message reçu application ouverte → bandeau discret « Voir », et
//     rechargement de la cloche.

import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../components/style/colors.dart';
import '../components/style/text_styles.dart';
import '../controllers/authentification_controller.dart';
import '../controllers/notification_controller.dart';
import '../controllers/rendez_vous_controller.dart';
import '../models/authentification_models.dart' show RoleUtilisateur;
import '../services/push_service.dart';
import '../utils/navigation_push.dart';
import 'home_router_for_role.dart';
import 'portails/medecin/medecin_home_shell.dart';
import 'portails/patient/patient_home_shell.dart';

/// Navigateur et messager de l'application (MaterialApp) : le pilote
/// ouvre des pages et affiche des bandeaux hors de tout BuildContext.
final GlobalKey<NavigatorState> cleNavigateurApp = GlobalKey<NavigatorState>();
final GlobalKey<ScaffoldMessengerState> cleMessagerApp = GlobalKey<ScaffoldMessengerState>();

class PilotePush extends ConsumerStatefulWidget {
  const PilotePush({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<PilotePush> createState() => _PilotePushState();
}

class _PilotePushState extends ConsumerState<PilotePush> {
  final List<StreamSubscription<dynamic>> _abonnements = [];

  /// Notification touchée avant que la session soit prête.
  DonneesPush? _enAttente;

  @override
  void initState() {
    super.initState();
    if (!PushService.actif) return;
    _enAttente = PushService.consommerToucherInitial();
    _abonnements
      ..add(PushService.touchers.listen(_ouvrir))
      ..add(PushService.premierPlan.listen(_afficherPremierPlan))
      ..add(PushService.jetonRenouvele.listen(_enregistrerJeton));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (ref.read(estConnecteProvider)) _surConnexion();
    });
  }

  @override
  void dispose() {
    for (final a in _abonnements) {
      a.cancel();
    }
    super.dispose();
  }

  Future<void> _surConnexion() async {
    final jeton = await PushService.obtenirJeton();
    if (jeton != null) await _enregistrerJeton(jeton);
    final enAttente = _enAttente;
    if (enAttente != null) {
      _enAttente = null;
      // Laisse l'écran courant se construire avant d'ouvrir l'espace.
      await Future<void>.delayed(const Duration(milliseconds: 400));
      if (mounted) _ouvrir(enAttente);
    }
  }

  Future<void> _enregistrerJeton(String jeton) async {
    if (!ref.read(estConnecteProvider)) return;
    try {
      await ref.read(sessionControllerProvider.notifier).appelAuthentifie(
            (token) => ref.read(notificationRepositoryProvider).enregistrerAppareil(
                  jeton: jeton,
                  plateforme: PushService.plateforme,
                  token: token,
                ),
          );
    } catch (e) {
      // Sans enregistrement, seul le push manque : la cloche reste à jour.
      debugPrint('[push] Enregistrement du jeton impossible : $e');
    }
  }

  void _rafraichir(DonneesPush donnees) {
    ref.read(notificationControllerProvider.notifier).charger();
    final type = donnees['type'];
    if (type is String && type.startsWith('rdv_')) {
      ref.invalidate(listeRendezVousControllerProvider);
    }
  }

  void _ouvrir(DonneesPush donnees) {
    if (!ref.read(estConnecteProvider)) {
      _enAttente = donnees;
      return;
    }
    _rafraichir(donnees);

    final role = ref.read(roleUtilisateurCourantProvider);
    final espace = espaceDeNotification(donnees) ??
        switch (role) {
          RoleUtilisateur.patient => EspacePush.patient,
          RoleUtilisateur.medecin => EspacePush.medecin,
          _ => null,
        };
    final cible = donnees['cible'] is String ? donnees['cible'] as String : 'rendez_vous';
    final navigateur = cleNavigateurApp.currentState;
    if (navigateur == null) return;

    // Shell déjà ouvert : on y revient et on bascule sur l'onglet.
    final route = espace == null ? null : routesShellsPush[espace];
    if (route != null && route.isActive) {
      navigateur.popUntil((r) => r == route);
      demandeOngletPush.value = DemandeOngletPush(espace!, cible);
      return;
    }

    final roleCorrespond = (espace == EspacePush.patient && role == RoleUtilisateur.patient) ||
        (espace == EspacePush.medecin && role == RoleUtilisateur.medecin);
    navigateur.push(MaterialPageRoute<void>(
      builder: (_) => !roleCorrespond
          ? const AccueilCompte()
          : espace == EspacePush.patient
              ? PatientHomeShell(ongletInitial: ongletPatientPush(cible))
              : MedecinHomeShell(ongletInitial: ongletMedecinPush(cible)),
    ));
  }

  void _afficherPremierPlan(RemoteMessage message) {
    _rafraichir(message.data);
    // iOS affiche déjà son bandeau (setForegroundNotificationPresentationOptions).
    if (!Platform.isAndroid) return;
    final titre = message.notification?.title;
    final corps = message.notification?.body;
    if (titre == null && corps == null) return;

    cleMessagerApp.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.ink,
        duration: const Duration(seconds: 6),
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        content: Row(
          children: [
            const Icon(Icons.notifications_active_outlined, color: AppColors.mint, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (titre != null)
                    Text(titre,
                        style: const TextStyle(
                            fontFamily: AppTextStyles.fontSans,
                            fontWeight: FontWeight.w800,
                            fontSize: 13.5,
                            color: Colors.white)),
                  if (corps != null)
                    Text(corps,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontFamily: AppTextStyles.fontSans,
                            fontSize: 12.5,
                            color: Colors.white.withValues(alpha: 0.8))),
                ],
              ),
            ),
          ],
        ),
        action: SnackBarAction(
          label: 'Voir',
          textColor: AppColors.mint,
          onPressed: () => _ouvrir(message.data),
        ),
      ));
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<bool>(estConnecteProvider, (avant, connecte) {
      if (!PushService.actif) return;
      if (connecte && avant != true) {
        _surConnexion();
      } else if (!connecte && avant == true) {
        PushService.supprimerJeton();
      }
    });
    return widget.child;
  }
}
