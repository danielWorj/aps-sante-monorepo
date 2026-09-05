// lib/pages/portails/teleconsultation_screen.dart
//
// Écran de téléconsultation (Jitsi), partagé entre l'espace médecin et
// l'espace patient — miroir mobile de ConsultationRoom.jsx +
// VisioModal.jsx côté client-plateform.
//
// Cycle :
//   1. Au montage : récupère un token Jitsi à usage unique via
//      POST /visio/token (VisioController.obtenirSession), authentifié
//      via SessionController.appelAuthentifie (refresh auto si l'access
//      token a expiré, comme pour les actions RDV).
//   2. Une fois la session obtenue, lance la conférence native via
//      jitsi_meet_flutter_sdk (JitsiMeet().join(...)) — le SDK affiche
//      alors sa propre UI plein écran par-dessus cet écran.
//   3. Quand la conférence se termine (raccroché par l'utilisateur ou
//      par l'autre participant), on revient automatiquement sur la
//      page précédente (liste des rendez-vous).
//
// Erreurs possibles (voir visio.controller.js) :
//   - 400 si le RDV n'est pas une téléconsultation, ou n'est pas dans
//     un statut permettant la visio (confirme / en_attente_presence) ;
//   - 403 si l'utilisateur courant n'est ni le médecin ni le patient
//     concerné ;
//   - 404 si le RDV n'existe pas (a été supprimé entre-temps).
// Dans tous les cas, on affiche le message renvoyé par le backend et
// on propose de réessayer ou de revenir en arrière plutôt que de
// laisser l'écran figé.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jitsi_meet_flutter_sdk/jitsi_meet_flutter_sdk.dart';

import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../controllers/visio_controller.dart';
import '../../models/authentification_models.dart';
import '../../models/rendez_vous_models.dart';
import '../../models/visio_models.dart';
import '../../repositories/visio_repository.dart' show ApiException;

class TeleconsultationScreen extends ConsumerStatefulWidget {
  const TeleconsultationScreen({super.key, required this.rdv});

  final RendezVous rdv;

  @override
  ConsumerState<TeleconsultationScreen> createState() =>
      _TeleconsultationScreenState();
}

enum _EtatEcran { chargement, erreur, enConference }

class _TeleconsultationScreenState
    extends ConsumerState<TeleconsultationScreen> {
  final JitsiMeet _jitsiMeet = JitsiMeet();

  _EtatEcran _etat = _EtatEcran.chargement;
  String? _messageErreur;
  bool _aQuitteVolontairement = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _demarrer());
  }

  @override
  void dispose() {
    // Si l'utilisateur navigue en arrière pendant que la conférence
    // est ouverte (ex: bouton retour Android), on raccroche proprement
    // côté Jitsi plutôt que de laisser un appel actif orphelin.
    if (_etat == _EtatEcran.enConference && !_aQuitteVolontairement) {
      _jitsiMeet.hangUp();
    }
    super.dispose();
  }

  Future<void> _demarrer() async {
    setState(() {
      _etat = _EtatEcran.chargement;
      _messageErreur = null;
    });

    // Repose sur le controller de rendez-vous (visio_controller.dart)
    // qui, lui, ne parle jamais HTTP directement — voir son en-tête.
    ref.read(visioControllerProvider.notifier).reinitialiser();

    try {
      final session = await ref
          .read(sessionControllerProvider.notifier)
          .appelAuthentifie(
            (token) => ref
            .read(visioControllerProvider.notifier)
            .obtenirSession(rdvId: widget.rdv.rdvId, token: token),
      );

      if (!mounted) return;
      await _rejoindre(session);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _etat = _EtatEcran.erreur;
        _messageErreur = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _etat = _EtatEcran.erreur;
        _messageErreur = 'Impossible de démarrer la consultation.';
      });
    }
  }

  Future<void> _rejoindre(VisioSession session) async {
    final moi = ref.read(authUtilisateurProvider);
    final role = ref.read(roleUtilisateurCourantProvider);

    // Nom affiché dans la conférence : la personne EN FACE, pour le
    // sujet de la salle (le SDK, lui, prend le displayName du
    // participant courant via userInfo ci-dessous).
    final interlocuteur = role == RoleUtilisateur.medecin
        ? widget.rdv.patient?.utilisateur
        : widget.rdv.medecin?.utilisateur;
    final sujet = interlocuteur != null
        ? 'Consultation avec ${interlocuteur.prenom} ${interlocuteur.nom}'
        : 'Téléconsultation APS Santé';

    final options = JitsiMeetConferenceOptions(
      serverURL: 'https://${session.domain}',
      room: session.roomName,
      token: session.token,
      configOverrides: {
        'startWithAudioMuted': false,
        'startWithVideoMuted': false,
        'subject': sujet,
        'prejoinPageEnabled': false,
        'disableModeratorIndicator': true,
      },
      featureFlags: const {
        'welcomepage.enabled': false,
        'invite.enabled': false,
        'live-streaming.enabled': false,
        'recording.enabled': false,
      },
      userInfo: JitsiMeetUserInfo(
        displayName: moi != null ? '${moi.prenom} ${moi.nom}' : null,
        email: moi?.email,
      ),
    );

    final listener = JitsiMeetEventListener(
      conferenceTerminated: (url, error) => _surFinConference(),
      readyToClose: () => _surFinConference(),
    );

    setState(() => _etat = _EtatEcran.enConference);
    await _jitsiMeet.join(options, listener);
  }

  void _surFinConference() {
    if (!mounted) return;
    _aQuitteVolontairement = true;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    // Pendant que la conférence Jitsi est active, le SDK affiche sa
    // propre vue native par-dessus l'application : on laisse ici un
    // fond neutre (visible seulement lors des transitions).
    return PopScope(
      canPop: _etat != _EtatEcran.enConference,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _etat == _EtatEcran.enConference) {
          _aQuitteVolontairement = true;
          _jitsiMeet.hangUp();
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        backgroundColor: AppColors.ink,
        body: SafeArea(
          child: switch (_etat) {
            _EtatEcran.chargement => const _ChargementConsultation(),
            _EtatEcran.erreur => _ErreurConsultation(
              message: _messageErreur ??
                  'Impossible de démarrer la consultation.',
              onReessayer: _demarrer,
            ),
            _EtatEcran.enConference => const SizedBox.shrink(),
          },
        ),
      ),
    );
  }
}

class _ChargementConsultation extends StatelessWidget {
  const _ChargementConsultation();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(color: Colors.white),
          SizedBox(height: 16),
          Text(
            'Connexion à la consultation…',
            style: TextStyle(
              fontFamily: AppTextStyles.fontBody,
              color: Colors.white,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

class _ErreurConsultation extends StatelessWidget {
  const _ErreurConsultation({
    required this.message,
    required this.onReessayer,
  });

  final String message;
  final VoidCallback onReessayer;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.videocam_off_outlined,
                color: Colors.white, size: 40),
            const SizedBox(height: 16),
            AppAlert(type: AppAlertType.danger, message: message),
            const SizedBox(height: 20),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white54),
                  ),
                  child: const Text('Retour'),
                ),
                const SizedBox(width: 12),
                RdvButton(
                  label: 'Réessayer',
                  icon: Icons.refresh,
                  onPressed: onReessayer,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}