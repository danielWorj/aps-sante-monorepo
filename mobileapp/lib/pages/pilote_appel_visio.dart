// lib/pages/pilote_appel_visio.dart
//
// Pilote de l'appel visio entrant (patient), monté au-dessus de toute
// l'application (MaterialApp.builder), à côté de PilotePush :
//   - application ouverte : relit GET /visio/appel-entrant toutes les 8 s
//     et fait sonner l'appel natif (AppelVisioService) — fonctionne même
//     sans Firebase ;
//   - « Accepter » sur l'écran d'appel (application ouverte, en
//     arrière-plan, ou lancée par l'appel) : ouvre la téléconsultation et
//     entre directement dans la salle ;
//   - « Refuser » / sonnerie expirée : refus envoyé au serveur
//     (POST /visio/:id/refus), l'appel cesse de sonner sur les autres
//     appareils ; le bouton « Rejoindre » reste disponible dans les RDV ;
//   - à chaque relecture, l'écran d'appel est aligné sur le serveur : un
//     appel qu'il ne présente plus (refusé / décroché ailleurs, visio
//     terminée) est raccroché, et un appel sonné ici puis disparu sans
//     réponse connue (refusé application fermée) lui est signalé comme refusé.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../controllers/authentification_controller.dart';
import '../controllers/rendez_vous_controller.dart';
import '../controllers/visio_controller.dart';
import '../models/authentification_models.dart' show RoleUtilisateur;
import '../services/appel_visio_service.dart';
import 'pilote_push.dart' show cleNavigateurApp;
import 'portails/teleconsultation_screen.dart';

const Duration _intervalleVerification = Duration(seconds: 8);

class PiloteAppelVisio extends ConsumerStatefulWidget {
  const PiloteAppelVisio({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<PiloteAppelVisio> createState() => _PiloteAppelVisioState();
}

class _PiloteAppelVisioState extends ConsumerState<PiloteAppelVisio> with WidgetsBindingObserver {
  StreamSubscription<CallEvent?>? _evenements;
  Timer? _verification;

  /// Appel décroché avant que la session soit prête (application lancée
  /// par l'appel).
  String? _aOuvrir;
  String? _ouvertRecemment;

  /// Refus déjà envoyés (une fois par appel).
  final Set<String> _refusEnvoyes = {};

  bool get _estPatient =>
      ref.read(estConnecteProvider) && ref.read(roleUtilisateurCourantProvider) == RoleUtilisateur.patient;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    try {
      _evenements = FlutterCallkitIncoming.onEvent.listen(_surEvenement, onError: (_) {});
    } catch (_) {
      // Plugin indisponible sur cette plateforme.
    }
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final rdvId = await AppelVisioService.appelDecroche();
      if (rdvId != null) _ouvrir(rdvId);
      _demarrerVerification();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _evenements?.cancel();
    _verification?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState etat) {
    if (etat == AppLifecycleState.resumed) {
      _demarrerVerification();
    } else if (etat == AppLifecycleState.paused) {
      _verification?.cancel();
    }
  }

  void _demarrerVerification() {
    _verification?.cancel();
    _verification = Timer.periodic(_intervalleVerification, (_) => _verifier());
    _verifier();
  }

  Future<void> _verifier() async {
    if (!_estPatient) return;
    try {
      final appel = await ref.read(sessionControllerProvider.notifier).appelAuthentifie(
          (token) => ref.read(visioRepositoryProvider).obtenirAppelEntrant(token: token));
      final affiches = await AppelVisioService.appelsAffiches();

      // Appels qui sonnent encore ici alors que le serveur ne les présente
      // plus : refusés / décrochés ailleurs, ou visio terminée.
      for (final a in affiches) {
        final rdvId = AppelVisioService.rdvIdDe(a);
        if (rdvId != null && !a.isAccepted && rdvId != appel?.rdvId) {
          await AppelVisioService.raccrocher(rdvId);
        }
      }
      if (appel == null || appel.rdvId == _ouvertRecemment) return;

      if (!await AppelVisioService.dejaSonne(appel.cle)) {
        await AppelVisioService.sonner(appel);
        return;
      }
      // Déjà sonné ici, plus affiché, pas décroché : refusé ou manqué pendant
      // que l'application était fermée. Le serveur l'ignore encore : on le
      // lui dit, pour qu'il cesse de sonner partout.
      final encoreAffiche = affiches.any((a) => AppelVisioService.rdvIdDe(a) == appel.rdvId);
      if (!encoreAffiche) await _refuser(appel.rdvId, cle: appel.cle);
    } catch (_) {
      // Silencieux : un appel manqué reste joignable depuis les rendez-vous.
    }
  }

  /// Refus (ou appel manqué) transmis au serveur, une fois par appel.
  Future<void> _refuser(String rdvId, {String? cle}) async {
    final id = cle ?? rdvId;
    if (!_estPatient || !_refusEnvoyes.add(id)) return;
    try {
      await ref.read(sessionControllerProvider.notifier).appelAuthentifie(
          (token) => ref.read(visioRepositoryProvider).refuserAppel(rdvId: rdvId, token: token));
    } catch (_) {
      // Nouvel essai à la relecture suivante.
      _refusEnvoyes.remove(id);
    }
  }

  void _surEvenement(CallEvent? evenement) {
    switch (evenement) {
      case CallEventActionCallAccept(:final callKitParams):
        final rdvId = AppelVisioService.rdvIdDe(callKitParams);
        if (rdvId != null) _ouvrir(rdvId);
      case CallEventActionCallDecline(:final callKitParams):
        final rdvId = AppelVisioService.rdvIdDe(callKitParams);
        final cle = callKitParams.extra?['cle'];
        if (rdvId != null) _refuser(rdvId, cle: cle is String ? cle : null);
      case CallEventActionCallTimeout(:final id):
        _refuser(id);
      default:
        break;
    }
  }

  Future<void> _ouvrir(String rdvId) async {
    // Le même décroché peut arriver par l'événement ET par activeCalls().
    if (_ouvertRecemment == rdvId && _aOuvrir == null) return;
    if (!_estPatient) {
      _aOuvrir = rdvId;
      return;
    }
    _aOuvrir = null;
    _ouvertRecemment = rdvId;
    // L'appel quitte l'écran natif : la visio prend le relais.
    unawaited(AppelVisioService.raccrocher(rdvId));
    try {
      final rdv = await ref.read(sessionControllerProvider.notifier).appelAuthentifie(
          (token) => ref.read(rendezVousRepositoryProvider).obtenirRendezVous(rdvId, token: token));
      final navigateur = cleNavigateurApp.currentState;
      if (!mounted || navigateur == null) return;
      await navigateur.push(MaterialPageRoute<void>(
        builder: (_) => TeleconsultationScreen(rdv: rdv, rejoindreDirect: true),
      ));
    } catch (e) {
      debugPrint('[appel] Ouverture de la téléconsultation impossible : $e');
    } finally {
      // Visio quittée : un nouveau lancement par le médecin pourra resonner.
      if (_ouvertRecemment == rdvId) _ouvertRecemment = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Session restaurée après un lancement par l'appel : on ouvre la visio.
    ref.listen<bool>(estConnecteProvider, (_, connecte) {
      final enAttente = _aOuvrir;
      if (connecte && enAttente != null) {
        Future<void>.delayed(const Duration(milliseconds: 400), () {
          if (mounted) _ouvrir(enAttente);
        });
      }
    });
    return widget.child;
  }
}
