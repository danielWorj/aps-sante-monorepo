// lib/pages/portails/teleconsultation_screen.dart
//
// Écran de téléconsultation (Jitsi), partagé entre l'espace médecin et
// l'espace patient — miroir mobile de visio-modal.jsx +
// ClotureConsultation.jsx côté client-plateform. Palette bleu santé
// (AppColors.bleuSante*).
//
// Cycle :
//   1. Salle d'attente : carte bleue (interlocuteur, date, motif,
//      vérifications) — la caméra et le micro ne sont sollicités qu'au
//      geste « Rejoindre la consultation ».
//   2. Token Jitsi à usage unique (POST /visio/token, via
//      SessionController.appelAuthentifie), puis conférence native
//      (jitsi_meet_flutter_sdk), plein écran par-dessus cet écran.
//   3. Fin de l'appel (raccroché, retour Android, fin par le médecin) :
//      la conférence est raccrochée proprement côté SDK, puis la carte de
//      clôture s'affiche :
//        - MÉDECIN : sa sortie clôt la consultation (POST /visio/:id/cloture) ;
//          remerciement + « paiement dans X heures » (délai T du pays,
//          paramétré au back-office) ;
//        - PATIENT : quand le médecin sort, on relit le bilan et, s'il a
//          clôturé, on raccroche ; la carte propose de noter le médecin,
//          laisser un avis et déclarer un litige.
//
// Erreurs (voir visio.controller.js) : 400 statut / type incompatible,
// 409 RDV_NON_PAYE (D8, sans « Réessayer »), 403, 404 — le message du
// serveur est affiché tel quel.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jitsi_meet_flutter_sdk/jitsi_meet_flutter_sdk.dart';

import '../../components/components.dart';
import '../../components/reputation/appel_reputation.dart';
import '../../components/reputation/reputation_ui.dart' show SaisieEtoiles;
import '../../controllers/authentification_controller.dart';
import '../../controllers/rendez_vous_controller.dart';
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

enum _EtatEcran { salleAttente, chargement, erreur, enConference, cloture }

/// Relecture du bilan par le patient pendant l'appel (filet de sécurité si
/// l'événement « participant sorti » est manqué).
const Duration _intervalleVerification = Duration(seconds: 20);

class _TeleconsultationScreenState
    extends ConsumerState<TeleconsultationScreen> {
  final JitsiMeet _jitsiMeet = JitsiMeet();

  _EtatEcran _etat = _EtatEcran.salleAttente;
  String? _messageErreur;
  Timer? _verification;

  /// Vrai quand la visio est refusée à cause du statut du RDV
  /// (`a_reprogrammer`, ou RDV non payé : 409 `RDV_NON_PAYE`) :
  /// réessayer n'a alors aucun sens.
  bool _blocageStatut = false;

  bool get _estMedecin =>
      ref.read(roleUtilisateurCourantProvider) == RoleUtilisateur.medecin;

  @override
  void initState() {
    super.initState();
    // Le serveur refuse la visio pour un RDV `a_reprogrammer` : on
    // l'explique sans même appeler POST /visio/token (même texte que le web).
    if (widget.rdv.statut == StatutRendezVous.aReprogrammer) {
      _etat = _EtatEcran.erreur;
      _blocageStatut = true;
      _messageErreur =
          "Ce rendez-vous est à reprogrammer (les deux parties étaient "
          "absentes). Convenez d'une nouvelle date depuis la page de "
          "vos rendez-vous.";
    }
  }

  @override
  void dispose() {
    _verification?.cancel();
    // Écran quitté pendant l'appel : on raccroche plutôt que de laisser
    // une conférence orpheline.
    if (_etat == _EtatEcran.enConference) _jitsiMeet.hangUp();
    super.dispose();
  }

  Future<void> _demarrer() async {
    setState(() {
      _etat = _EtatEcran.chargement;
      _messageErreur = null;
      _blocageStatut = false;
    });

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
        _blocageStatut = e.estRdvNonPaye;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _etat = _EtatEcran.erreur;
        _messageErreur = 'Impossible de démarrer la consultation.';
      });
    }
  }

  Future<void> _rejoindre(VisioSession session) async {
    final moi = ref.read(authUtilisateurProvider);
    final interlocuteur = _estMedecin
        ? widget.rdv.patient?.utilisateur
        : widget.rdv.medecin?.utilisateur;
    final sujet = interlocuteur != null
        ? "Téléconsultation avec ${_estMedecin ? '' : 'Dr '}${interlocuteur.prenom} ${interlocuteur.nom}"
        : 'Téléconsultation APS Santé';

    final options = JitsiMeetConferenceOptions(
      serverURL: 'https://${session.domain}',
      room: session.roomName,
      token: session.token,
      configOverrides: {
        'startWithAudioMuted': false,
        'startWithVideoMuted': false,
        'subject': sujet,
        // Affiché chez chacun (subject n'est appliqué que par le modérateur).
        'localSubject': sujet,
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
      conferenceJoined: (_) => _demarrerVerification(),
      // La clôture du médecin peut suivre de peu son départ : relectures.
      participantLeft: (_) {
        for (final s in const [0, 3, 8]) {
          Future<void>.delayed(Duration(seconds: s), _verifierClotureMedecin);
        }
      },
      conferenceTerminated: (url, error) => _surFinConference(),
      readyToClose: () => _surFinConference(),
    );

    setState(() => _etat = _EtatEcran.enConference);
    await _jitsiMeet.join(options, listener);
  }

  void _demarrerVerification() {
    if (_estMedecin) return;
    _verification?.cancel();
    _verification = Timer.periodic(
        _intervalleVerification, (_) => _verifierClotureMedecin());
  }

  /// PATIENT : le médecin a-t-il clôturé ? Si oui, on raccroche proprement
  /// (sinon il s'est peut-être juste déconnecté : on reste dans la salle).
  Future<void> _verifierClotureMedecin() async {
    if (_estMedecin || _etat != _EtatEcran.enConference) return;
    try {
      final bilan = await ref
          .read(sessionControllerProvider.notifier)
          .appelAuthentifie((token) => ref
              .read(visioRepositoryProvider)
              .obtenirBilan(rdvId: widget.rdv.rdvId, token: token));
      if (bilan.visioCloturee && mounted && _etat == _EtatEcran.enConference) {
        await _jitsiMeet.hangUp();
        _surFinConference();
      }
    } catch (_) {
      // Silencieux : nouvel essai au prochain passage.
    }
  }

  /// Fin d'appel (une seule fois) : la carte de clôture prend le relais.
  void _surFinConference() {
    if (!mounted || _etat != _EtatEcran.enConference) return;
    _verification?.cancel();
    setState(() => _etat = _EtatEcran.cloture);
  }

  void _fermer() {
    // Statut et fonds ont pu changer : la liste des RDV est rechargée.
    ref.invalidate(listeRendezVousControllerProvider);
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final enAppel = _etat == _EtatEcran.enConference;
    return PopScope(
      canPop: !enAppel && _etat != _EtatEcran.cloture,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (enAppel) {
          _jitsiMeet.hangUp();
          _surFinConference();
        } else if (_etat == _EtatEcran.cloture) {
          _fermer();
        }
      },
      child: Scaffold(
        backgroundColor: _etat == _EtatEcran.salleAttente
            ? AppColors.bleuSanteClair
            : AppColors.bleuNuit,
        body: SafeArea(
          child: switch (_etat) {
            _EtatEcran.salleAttente => _SalleAttente(
                rdv: widget.rdv,
                estMedecin: _estMedecin,
                onRejoindre: _demarrer,
                onPlusTard: () => Navigator.of(context).pop(),
              ),
            _EtatEcran.chargement => const _ChargementConsultation(),
            _EtatEcran.erreur => _ErreurConsultation(
                message: _messageErreur ??
                    'Impossible de démarrer la consultation.',
                onReessayer: _blocageStatut ? null : _demarrer,
              ),
            _EtatEcran.enConference => const SizedBox.shrink(),
            _EtatEcran.cloture => _CarteCloture(
                rdvId: widget.rdv.rdvId,
                estMedecin: _estMedecin,
                onFermer: _fermer,
                onRejoindre: _estMedecin ? null : _demarrer,
              ),
          },
        ),
      ),
    );
  }
}

/* =========================================================================
 * Salle d'attente
 * ========================================================================= */

const _jours = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const _mois = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

String _deuxChiffres(int n) => n.toString().padLeft(2, '0');

String _dateLongue(DateTime d) {
  final l = d.toLocal();
  return '${_jours[l.weekday - 1]} ${l.day} ${_mois[l.month - 1]} à '
      '${_deuxChiffres(l.hour)}:${_deuxChiffres(l.minute)}';
}

TextStyle _style(double taille, FontWeight poids, Color couleur, {double? hauteur}) =>
    TextStyle(
      fontFamily: AppTextStyles.fontSans,
      fontSize: taille,
      fontWeight: poids,
      color: couleur,
      height: hauteur,
    );

class _SalleAttente extends StatelessWidget {
  const _SalleAttente({
    required this.rdv,
    required this.estMedecin,
    required this.onRejoindre,
    required this.onPlusTard,
  });

  final RendezVous rdv;
  final bool estMedecin;
  final VoidCallback onRejoindre;
  final VoidCallback onPlusTard;

  @override
  Widget build(BuildContext context) {
    final u = estMedecin ? rdv.patient?.utilisateur : rdv.medecin?.utilisateur;
    final nom = u == null
        ? 'Votre interlocuteur'
        : estMedecin
            ? '${u.prenom} ${u.nom}'
            : 'Dr ${u.prenom} ${u.nom}';
    final initiales = u == null
        ? '?'
        : '${u.prenom.isNotEmpty ? u.prenom[0] : ''}${u.nom.isNotEmpty ? u.nom[0] : ''}'
            .toUpperCase();

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.bleuSanteLigne),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Bandeau bleu santé (aplat, sans dégradé).
                Container(
                  color: AppColors.bleuSante,
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
                  child: Row(
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white.withValues(alpha: 0.16),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
                        ),
                        child: Text(initiales,
                            style: _style(17, FontWeight.w800, Colors.white)),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('TÉLÉCONSULTATION',
                                style: _style(10.5, FontWeight.w700,
                                    Colors.white.withValues(alpha: 0.85))
                                    .copyWith(letterSpacing: 0.9)),
                            const SizedBox(height: 3),
                            Text(nom,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: _style(18, FontWeight.w800, Colors.white)),
                          ],
                        ),
                      ),
                      const Icon(Icons.videocam_rounded, color: Colors.white, size: 22),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _LigneInfo(
                          icone: Icons.calendar_today_rounded,
                          texte: _dateLongue(rdv.dateCreneau)),
                      if (rdv.motif?.isNotEmpty ?? false) ...[
                        const SizedBox(height: 8),
                        _LigneInfo(
                            icone: Icons.chat_bubble_outline_rounded,
                            texte: '« ${rdv.motif} »',
                            italique: true),
                      ],
                      const SizedBox(height: 16),
                      const _Verification(icone: Icons.wifi_rounded, texte: 'Une connexion internet stable'),
                      const _Verification(icone: Icons.mic_none_rounded, texte: 'Caméra et micro autorisés'),
                      const _Verification(icone: Icons.wb_sunny_outlined, texte: 'Un endroit calme et bien éclairé'),
                      const SizedBox(height: 18),
                      _BoutonBleu(
                        label: 'Rejoindre la consultation',
                        icone: Icons.videocam_rounded,
                        onPressed: onRejoindre,
                      ),
                      const SizedBox(height: 8),
                      _BoutonBleu(label: 'Plus tard', secondaire: true, onPressed: onPlusTard),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          const Icon(Icons.shield_outlined, size: 15, color: AppColors.bleuSanteFonce),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              'Salle sécurisée, accessible uniquement à vous deux. Rien n’est enregistré.',
                              style: _style(11.5, FontWeight.w600, AppColors.bleuSanteFonce),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LigneInfo extends StatelessWidget {
  const _LigneInfo({required this.icone, required this.texte, this.italique = false});

  final IconData icone;
  final String texte;
  final bool italique;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.bleuSanteClair,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icone, size: 15, color: AppColors.bleuSante),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              texte,
              style: _style(13.5, FontWeight.w600, italique ? AppColors.ink2 : AppColors.ink)
                  .copyWith(fontStyle: italique ? FontStyle.italic : FontStyle.normal),
            ),
          ),
        ],
      ),
    );
  }
}

class _Verification extends StatelessWidget {
  const _Verification({required this.icone, required this.texte});

  final IconData icone;
  final String texte;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icone, size: 16, color: AppColors.bleuSante),
          const SizedBox(width: 10),
          Text(texte, style: _style(12.5, FontWeight.w500, AppColors.ink2)),
        ],
      ),
    );
  }
}

class _BoutonBleu extends StatelessWidget {
  const _BoutonBleu({
    required this.label,
    required this.onPressed,
    this.icone,
    this.secondaire = false,
    this.alerte = false,
    this.chargement = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icone;
  final bool secondaire;
  final bool alerte;
  final bool chargement;

  @override
  Widget build(BuildContext context) {
    final fond = secondaire
        ? AppColors.surface
        : alerte
            ? AppColors.red
            : AppColors.bleuSante;
    final texte = secondaire ? AppColors.bleuSanteFonce : Colors.white;
    return SizedBox(
      height: 48,
      child: TextButton(
        onPressed: chargement ? null : onPressed,
        style: TextButton.styleFrom(
          backgroundColor: fond,
          disabledBackgroundColor: fond.withValues(alpha: 0.55),
          foregroundColor: texte,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: secondaire
                ? const BorderSide(color: AppColors.bleuSanteLigne)
                : BorderSide.none,
          ),
        ),
        child: chargement
            ? SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: texte),
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icone != null) ...[
                    Icon(icone, size: 18, color: texte),
                    const SizedBox(width: 8),
                  ],
                  Text(label, style: _style(14, FontWeight.w700, texte)),
                ],
              ),
      ),
    );
  }
}

/* =========================================================================
 * Carte de clôture
 * ========================================================================= */

const int _essaisAttente = 8;
const Duration _intervalleAttente = Duration(milliseconds: 2500);

const _messagesNonTermineeMedecin = {
  'presences_incompletes':
      "La présence des deux participants n'a pas pu être confirmée par la visio. "
          'La consultation sera vérifiée automatiquement et votre paiement suivra les règles habituelles.',
  'parametre_delai_absent':
      "La fin de consultation n'a pas pu être enregistrée : le délai de versement n'est pas encore "
          "paramétré pour votre pays. L'équipe APS Santé a été alertée.",
  'statut_incompatible':
      "Ce rendez-vous n'est plus dans un état permettant de clôturer la consultation.",
};

class _CarteCloture extends ConsumerStatefulWidget {
  const _CarteCloture({
    required this.rdvId,
    required this.estMedecin,
    required this.onFermer,
    this.onRejoindre,
  });

  final String rdvId;
  final bool estMedecin;
  final VoidCallback onFermer;
  final VoidCallback? onRejoindre;

  @override
  ConsumerState<_CarteCloture> createState() => _CarteClotureState();
}

class _CarteClotureState extends ConsumerState<_CarteCloture> {
  BilanClotureVisio? _bilan;
  String? _erreur;
  bool _attente = true;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<T> _appel<T>(Future<T> Function(String token) f) =>
      ref.read(sessionControllerProvider.notifier).appelAuthentifie(f);

  Future<void> _charger() async {
    setState(() {
      _attente = true;
      _erreur = null;
    });
    try {
      final repo = ref.read(visioRepositoryProvider);
      var b = await _appel((t) => repo.cloturer(rdvId: widget.rdvId, token: t));
      // Le médecin clôt en quittant : le patient relit le bilan ~20 s.
      for (var i = 0;
          !widget.estMedecin && !b.visioCloturee && b.enAttenteMedecin && i < _essaisAttente;
          i++) {
        await Future<void>.delayed(_intervalleAttente);
        if (!mounted) return;
        b = await _appel((t) => repo.obtenirBilan(rdvId: widget.rdvId, token: t));
      }
      if (mounted) setState(() => _bilan = b);
    } catch (e) {
      if (mounted) {
        setState(() => _erreur =
            _messageErreur(e, 'Impossible de récupérer le bilan de la consultation.'));
      }
    } finally {
      if (mounted) setState(() => _attente = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget contenu;
    if (_attente) {
      contenu = Padding(
        padding: const EdgeInsets.symmetric(vertical: 28),
        child: Column(
          children: [
            const SizedBox(
              width: 34,
              height: 34,
              child: CircularProgressIndicator(strokeWidth: 3, color: AppColors.bleuSante),
            ),
            const SizedBox(height: 14),
            Text(
              widget.estMedecin ? 'Clôture de la consultation…' : 'Fin de la consultation…',
              style: _style(14, FontWeight.w600, AppColors.ink2),
            ),
          ],
        ),
      );
    } else if (_erreur != null) {
      contenu = Column(
        children: [
          const _Pastille(icone: Icons.error_outline_rounded, alerte: true),
          Text('Bilan indisponible', style: _style(19, FontWeight.w800, AppColors.ink)),
          const SizedBox(height: 8),
          Text(_erreur!, textAlign: TextAlign.center, style: _style(13.5, FontWeight.w500, AppColors.ink2, hauteur: 1.5)),
          const SizedBox(height: 18),
          _BoutonBleu(label: 'Réessayer', icone: Icons.refresh_rounded, onPressed: _charger),
          const SizedBox(height: 8),
          _BoutonBleu(label: 'Fermer', secondaire: true, onPressed: widget.onFermer),
        ],
      );
    } else if (_bilan!.role == 'medecin') {
      contenu = _BilanMedecin(bilan: _bilan!, onFermer: widget.onFermer);
    } else {
      contenu = _BilanPatient(
        bilan: _bilan!,
        onFermer: widget.onFermer,
        onRejoindre: widget.onRejoindre,
      );
    }

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Container(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.bleuSanteLigne),
            ),
            child: AnimatedSize(
              duration: const Duration(milliseconds: 200),
              child: contenu,
            ),
          ),
        ),
      ),
    );
  }
}

class _Pastille extends StatelessWidget {
  const _Pastille({required this.icone, this.neutre = false, this.alerte = false});

  final IconData icone;
  final bool neutre;
  final bool alerte;

  @override
  Widget build(BuildContext context) {
    final fond = alerte
        ? AppColors.red100
        : neutre
            ? AppColors.bg
            : AppColors.bleuSanteClair;
    final couleur = alerte
        ? AppColors.dangerDark
        : neutre
            ? AppColors.ink2
            : AppColors.bleuSante;
    return Container(
      width: 58,
      height: 58,
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: fond,
        border: Border.all(color: alerte ? AppColors.red100 : neutre ? AppColors.line : AppColors.bleuSanteLigne),
      ),
      child: Icon(icone, color: couleur, size: 26),
    );
  }
}

class _Encart extends StatelessWidget {
  const _Encart({required this.icone, required this.enfants, this.neutre = false});

  final IconData icone;
  final List<Widget> enfants;
  final bool neutre;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: neutre ? AppColors.bg : AppColors.bleuSanteClair,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: neutre ? AppColors.line : AppColors.bleuSanteLigne),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: neutre ? AppColors.surface : AppColors.bleuSante,
              borderRadius: BorderRadius.circular(8),
              border: neutre ? Border.all(color: AppColors.line) : null,
            ),
            child: Icon(icone, size: 17, color: neutre ? AppColors.ink2 : Colors.white),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: enfants),
          ),
        ],
      ),
    );
  }
}

/// Message lisible d'une erreur d'API : chaque dépôt a sa propre
/// ApiException (champ `message`), d'où la lecture dynamique.
String _messageErreur(Object e, String defaut) {
  try {
    final m = (e as dynamic).message;
    if (m is String && m.isNotEmpty) return m;
  } catch (_) {
    // Pas de champ `message` : message par défaut.
  }
  return defaut;
}

String _heures(int h) => '$h heure${h > 1 ? 's' : ''}';

class _BilanMedecin extends StatelessWidget {
  const _BilanMedecin({required this.bilan, required this.onFermer});

  final BilanClotureVisio bilan;
  final VoidCallback onFermer;

  @override
  Widget build(BuildContext context) {
    final patient = '${bilan.interlocuteurPrenom} ${bilan.interlocuteurNom}'.trim();
    final heures = bilan.delaiLiberationHeures;
    return Column(
      children: [
        const _Pastille(icone: Icons.volunteer_activism_outlined),
        Text('Merci, Docteur !', style: _style(20, FontWeight.w800, AppColors.ink)),
        const SizedBox(height: 8),
        Text(
          'Votre téléconsultation${patient.isNotEmpty ? ' avec $patient' : ''} est terminée. '
          'Merci pour votre engagement auprès de vos patients.',
          textAlign: TextAlign.center,
          style: _style(13.5, FontWeight.w500, AppColors.ink2, hauteur: 1.5),
        ),
        const SizedBox(height: 18),
        if (bilan.termine)
          _Encart(
            icone: Icons.account_balance_wallet_outlined,
            enfants: [
              Text(
                heures != null
                    ? 'Vous recevrez votre paiement dans ${_heures(heures)}.'
                    : 'Votre paiement sera versé à l’issue du délai de vérification.',
                style: _style(14.5, FontWeight.w800, AppColors.bleuSanteFonce),
              ),
              if (bilan.dateLiberation != null) ...[
                const SizedBox(height: 3),
                Text('Versement prévu le ${_dateLongue(bilan.dateLiberation!)}.',
                    style: _style(12.5, FontWeight.w500, AppColors.ink2)),
              ],
              const SizedBox(height: 6),
              Text(
                'Ce délai permet au patient de signaler un éventuel problème ; sans litige, '
                'les fonds sont versés automatiquement dans votre portefeuille.',
                style: _style(11.5, FontWeight.w500, AppColors.ink3, hauteur: 1.45),
              ),
            ],
          )
        else
          _Encart(
            icone: Icons.info_outline_rounded,
            neutre: true,
            enfants: [
              Text(
                _messagesNonTermineeMedecin[bilan.raisonNonTerminee] ??
                    "La fin de consultation n'a pas pu être enregistrée pour le moment.",
                style: _style(13, FontWeight.w500, AppColors.ink2, hauteur: 1.45),
              ),
            ],
          ),
        const SizedBox(height: 18),
        _BoutonBleu(
          label: 'Retour à mes rendez-vous',
          icone: Icons.event_available_rounded,
          onPressed: onFermer,
        ),
      ],
    );
  }
}

class _BilanPatient extends StatelessWidget {
  const _BilanPatient({required this.bilan, required this.onFermer, this.onRejoindre});

  final BilanClotureVisio bilan;
  final VoidCallback onFermer;
  final VoidCallback? onRejoindre;

  @override
  Widget build(BuildContext context) {
    final nomMedecin = 'Dr ${bilan.interlocuteurPrenom} ${bilan.interlocuteurNom}'.trim();

    // Le médecin a terminé l'appel, consultation encore à valider : pas de
    // « Rejoindre ».
    if (!bilan.termine && bilan.visioCloturee) {
      return Column(
        children: [
          const _Pastille(icone: Icons.check_circle_outline_rounded),
          Text('Consultation terminée', style: _style(20, FontWeight.w800, AppColors.ink)),
          const SizedBox(height: 8),
          Text(
            '$nomMedecin a mis fin à la téléconsultation. Merci de votre confiance.',
            textAlign: TextAlign.center,
            style: _style(13.5, FontWeight.w500, AppColors.ink2, hauteur: 1.5),
          ),
          const SizedBox(height: 6),
          Text(
            'La consultation est en cours de vérification. Vous pourrez noter le médecin '
            'depuis vos rendez-vous dès qu’elle sera validée.',
            textAlign: TextAlign.center,
            style: _style(12, FontWeight.w500, AppColors.ink3, hauteur: 1.45),
          ),
          const SizedBox(height: 18),
          _BoutonBleu(label: 'Fermer', onPressed: onFermer),
        ],
      );
    }

    if (!bilan.termine) {
      return Column(
        children: [
          const _Pastille(icone: Icons.videocam_off_outlined, neutre: true),
          Text('Vous avez quitté la consultation',
              textAlign: TextAlign.center, style: _style(19, FontWeight.w800, AppColors.ink)),
          const SizedBox(height: 8),
          Text(
            "$nomMedecin n'a pas encore clôturé la téléconsultation. Si vous avez été "
            'déconnecté, vous pouvez la rejoindre à nouveau.',
            textAlign: TextAlign.center,
            style: _style(13.5, FontWeight.w500, AppColors.ink2, hauteur: 1.5),
          ),
          const SizedBox(height: 6),
          Text(
            'Vous pourrez noter le médecin depuis vos rendez-vous une fois la consultation clôturée.',
            textAlign: TextAlign.center,
            style: _style(12, FontWeight.w500, AppColors.ink3, hauteur: 1.45),
          ),
          const SizedBox(height: 18),
          if (onRejoindre != null) ...[
            _BoutonBleu(label: 'Rejoindre à nouveau', icone: Icons.videocam_rounded, onPressed: onRejoindre),
            const SizedBox(height: 8),
          ],
          _BoutonBleu(label: 'Fermer', secondaire: true, onPressed: onFermer),
        ],
      );
    }

    return Column(
      children: [
        const _Pastille(icone: Icons.check_circle_outline_rounded),
        Text('Consultation terminée', style: _style(20, FontWeight.w800, AppColors.ink)),
        const SizedBox(height: 8),
        Text(
          'Comment s’est passée votre téléconsultation avec $nomMedecin'
          '${bilan.specialite != null ? ' (${bilan.specialite})' : ''} ?',
          textAlign: TextAlign.center,
          style: _style(13.5, FontWeight.w500, AppColors.ink2, hauteur: 1.5),
        ),
        const SizedBox(height: 16),
        if (bilan.avisPossible)
          _FormulaireAvis(rdvId: bilan.rdvId)
        else if (bilan.avisDejaDepose)
          _Encart(
            icone: Icons.star_outline_rounded,
            neutre: true,
            enfants: [
              Text('Vous avez déjà donné votre avis sur cette consultation. Merci !',
                  style: _style(13, FontWeight.w500, AppColors.ink2)),
            ],
          ),
        if (bilan.contestationPossible) ...[
          const SizedBox(height: 12),
          _DeclarerLitige(rdvId: bilan.rdvId, dateLiberation: bilan.dateLiberation),
        ],
        const SizedBox(height: 16),
        _BoutonBleu(label: 'Fermer', secondaire: true, onPressed: onFermer),
      ],
    );
  }
}

class _FormulaireAvis extends ConsumerStatefulWidget {
  const _FormulaireAvis({required this.rdvId});

  final String rdvId;

  @override
  ConsumerState<_FormulaireAvis> createState() => _FormulaireAvisState();
}

class _FormulaireAvisState extends ConsumerState<_FormulaireAvis> {
  final _commentaire = TextEditingController();
  int? _note;
  bool _anonyme = false;
  bool _enCours = false;
  bool _envoye = false;
  String? _erreur;

  @override
  void dispose() {
    _commentaire.dispose();
    super.dispose();
  }

  Future<void> _envoyer() async {
    if (_note == null || _enCours) return;
    setState(() {
      _enCours = true;
      _erreur = null;
    });
    try {
      await appelReputationEcran(
        ref,
        (repo, token) => repo.deposerAvis({
          'rdv_id': widget.rdvId,
          'note': _note,
          'commentaire': _commentaire.text.trim(),
          'anonyme': _anonyme,
        }, token: token),
      );
      if (mounted) setState(() => _envoye = true);
    } catch (e) {
      if (mounted) {
        setState(() => _erreur = _messageErreur(e, "Impossible d'envoyer votre avis."));
      }
    } finally {
      if (mounted) setState(() => _enCours = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_envoye) {
      return _Encart(
        icone: Icons.favorite_outline_rounded,
        enfants: [
          Text('Merci pour votre avis !', style: _style(14.5, FontWeight.w800, AppColors.bleuSanteFonce)),
          const SizedBox(height: 3),
          Text('Il est désormais visible sur la fiche du médecin.',
              style: _style(12.5, FontWeight.w500, AppColors.ink2, hauteur: 1.45)),
        ],
      );
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.bleuSanteLigne),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: SaisieEtoiles(
              valeur: _note,
              onChanged: (n) => setState(() => _note = n),
              libelle: 'Note du médecin',
            ),
          ),
          const SizedBox(height: 12),
          Text('Votre avis (facultatif)', style: _style(12.5, FontWeight.w700, AppColors.ink)),
          const SizedBox(height: 6),
          TextField(
            controller: _commentaire,
            enabled: !_enCours,
            minLines: 3,
            maxLines: 5,
            maxLength: 2000,
            style: _style(13.5, FontWeight.w500, AppColors.ink),
            decoration: InputDecoration(
              hintText: 'Écoute, explications, ponctualité…',
              hintStyle: _style(13, FontWeight.w500, AppColors.ink3),
              counterText: '',
              filled: true,
              fillColor: AppColors.surface,
              contentPadding: const EdgeInsets.all(12),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: AppColors.bleuSanteLigne),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: AppColors.bleuSante, width: 1.4),
              ),
            ),
          ),
          const SizedBox(height: 4),
          InkWell(
            onTap: _enCours ? null : () => setState(() => _anonyme = !_anonyme),
            borderRadius: BorderRadius.circular(8),
            child: Row(
              children: [
                Checkbox(
                  value: _anonyme,
                  activeColor: AppColors.bleuSante,
                  onChanged: _enCours ? null : (v) => setState(() => _anonyme = v ?? false),
                ),
                Expanded(
                  child: Text('Publier sous « Patient vérifié »',
                      style: _style(12.5, FontWeight.w500, AppColors.ink2)),
                ),
              ],
            ),
          ),
          if (_erreur != null) ...[
            const SizedBox(height: 6),
            AppAlert(type: AppAlertType.danger, message: _erreur!),
          ],
          const SizedBox(height: 10),
          _BoutonBleu(
            label: 'Publier ma note',
            icone: Icons.star_rounded,
            chargement: _enCours,
            onPressed: _note == null ? null : _envoyer,
          ),
        ],
      ),
    );
  }
}

class _DeclarerLitige extends ConsumerStatefulWidget {
  const _DeclarerLitige({required this.rdvId, this.dateLiberation});

  final String rdvId;
  final DateTime? dateLiberation;

  @override
  ConsumerState<_DeclarerLitige> createState() => _DeclarerLitigeState();
}

class _DeclarerLitigeState extends ConsumerState<_DeclarerLitige> {
  bool _ouvert = false;
  bool _enCours = false;
  bool _declare = false;
  String? _erreur;

  Future<void> _confirmer() async {
    setState(() {
      _enCours = true;
      _erreur = null;
    });
    try {
      await ref.read(sessionControllerProvider.notifier).appelAuthentifie(
            (token) => ref.read(rendezVousRepositoryProvider).changerStatutRendezVous(
                  id: widget.rdvId,
                  payload: const ChangerStatutRendezVousPayload(statut: StatutRendezVous.conteste),
                  token: token,
                ),
          );
      if (mounted) setState(() => _declare = true);
    } catch (e) {
      if (mounted) {
        setState(() =>
            _erreur = _messageErreur(e, 'Impossible de déclarer le litige pour le moment.'));
      }
    } finally {
      if (mounted) setState(() => _enCours = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_declare) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.red100,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            const Icon(Icons.flag_outlined, size: 18, color: AppColors.dangerDark),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Litige déclaré. Les fonds restent bloqués et notre équipe vous recontactera.',
                style: _style(12.5, FontWeight.w600, AppColors.dangerDark, hauteur: 1.4),
              ),
            ),
          ],
        ),
      );
    }

    if (!_ouvert) {
      return TextButton.icon(
        onPressed: () => setState(() => _ouvert = true),
        icon: const Icon(Icons.flag_outlined, size: 16, color: AppColors.ink2),
        label: Text('Un problème ? Déclarer un litige',
            style: _style(12.5, FontWeight.w600, AppColors.ink2)
                .copyWith(decoration: TextDecoration.underline)),
      );
    }

    final quand = widget.dateLiberation != null
        ? ' (versement prévu le ${_dateLongue(widget.dateLiberation!)})'
        : '';
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.red100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Le paiement du médecin sera bloqué$quand jusqu’au traitement du litige par '
            'APS Santé. Cette action est définitive.',
            style: _style(12.5, FontWeight.w500, AppColors.ink2, hauteur: 1.45),
          ),
          if (_erreur != null) ...[
            const SizedBox(height: 8),
            AppAlert(type: AppAlertType.danger, message: _erreur!),
          ],
          const SizedBox(height: 12),
          _BoutonBleu(label: 'Confirmer le litige', alerte: true, chargement: _enCours, onPressed: _confirmer),
          const SizedBox(height: 8),
          _BoutonBleu(
            label: 'Annuler',
            secondaire: true,
            onPressed: _enCours ? null : () => setState(() => _ouvert = false),
          ),
        ],
      ),
    );
  }
}

/* =========================================================================
 * Chargement / erreur
 * ========================================================================= */

class _ChargementConsultation extends StatelessWidget {
  const _ChargementConsultation();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(color: AppColors.bleuSanteVif),
          const SizedBox(height: 16),
          Text('Connexion à la consultation…',
              style: _style(13, FontWeight.w600, Colors.white)),
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

  /// `null` : pas de bouton « Réessayer » (erreur non récupérable).
  final VoidCallback? onReessayer;

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
                if (onReessayer != null) ...[
                  const SizedBox(width: 12),
                  SizedBox(
                    width: 150,
                    child: _BoutonBleu(
                      label: 'Réessayer',
                      icone: Icons.refresh_rounded,
                      onPressed: onReessayer,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
