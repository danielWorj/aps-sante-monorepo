// lib/components/buttons/bouton_payer_rdv.dart
//
// Bouton « Payer » d'un rendez-vous (PaymentSheet Stripe native).
// Réutilisable : écran de confirmation après réservation, et onglet
// « À payer » du portail patient (rattrapage d'un paiement annulé).
//
// N'est volontairement PAS exporté par components.dart : il dépend de
// la couche données (paiement_controller / repository), alors que les
// autres composants de ce dossier sont de la pure présentation.

import 'package:flutter/material.dart';

import '../../controllers/paiement_controller.dart';
import '../../repositories/paiement_repository.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';
import 'app_buttons.dart';

class BoutonPayerRdv extends StatefulWidget {
  const BoutonPayerRdv({
    super.key,
    required this.rdvId,
    required this.executer,
    this.onPaye,
    this.repository,
    this.label = 'Payer maintenant',
  });

  final String rdvId;

  /// Fournit le token d'accès (voir [ExecuteurAuthentifie]).
  final ExecuteurAuthentifie executer;

  /// Appelé UNE fois que le serveur (via webhook) a confirmé le paiement.
  final VoidCallback? onPaye;

  /// Injectable pour les tests ; instancié par défaut.
  final PaiementRepository? repository;

  final String label;

  @override
  State<BoutonPayerRdv> createState() => _BoutonPayerRdvState();
}

class _BoutonPayerRdvState extends State<BoutonPayerRdv> {
  late final PaiementRepository _repo = widget.repository ?? PaiementRepository();

  bool _enCours = false;

  /// Le paiement a été pris côté Stripe mais pas encore confirmé par le
  /// serveur : on propose « Vérifier » plutôt que de payer une 2e fois.
  bool _paiementEffectueEnAttente = false;

  String? _message;
  bool _messageEstErreur = false;

  Future<void> _payer() async {
    setState(() {
      _enCours = true;
      _message = null;
      _messageEstErreur = false;
    });
    try {
      final valide = await payerAvecPaymentSheet(
        _repo,
        rdvId: widget.rdvId,
        executer: widget.executer,
      );
      if (!mounted) return;
      if (!valide) {
        // Feuille fermée sans payer : rien à signaler, le bouton reste.
        setState(() => _enCours = false);
        return;
      }
      _paiementEffectueEnAttente = true;
      await _verifier();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _enCours = false;
        _message = _messageLisible(e);
        _messageEstErreur = true;
      });
    }
  }

  Future<void> _verifier() async {
    setState(() {
      _enCours = true;
      _messageEstErreur = false;
      _message = 'Vérification du paiement…';
    });
    try {
      final statut = await attendreConfirmationPaiement(
        _repo,
        rdvId: widget.rdvId,
        executer: widget.executer,
      );
      if (!mounted) return;
      if (statut != null) {
        setState(() {
          _enCours = false;
          _paiementEffectueEnAttente = false;
          _message = null;
        });
        widget.onPaye?.call();
        return;
      }
      setState(() {
        _enCours = false;
        _message = 'Paiement reçu, confirmation en cours. '
            'Appuyez sur « Vérifier mon paiement » dans quelques instants.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _enCours = false;
        _message = _messageLisible(e);
        _messageEstErreur = true;
      });
    }
  }

  String _messageLisible(Object e) {
    final texte = '$e';
    if (e is PaiementException) return texte;
    // Les ApiException (repositories) portent déjà un message lisible ;
    // les erreurs réseau (SocketException, Timeout) non.
    if (texte.contains('SocketException') ||
        texte.contains('TimeoutException') ||
        texte.contains('ClientException')) {
      return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
    }
    return texte;
  }

  @override
  Widget build(BuildContext context) {
    final verifierSeulement = _paiementEffectueEnAttente;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PrimaryButton(
          label: verifierSeulement ? 'Vérifier mon paiement' : widget.label,
          icon: verifierSeulement ? Icons.refresh_rounded : Icons.lock_outline,
          loading: _enCours,
          onPressed: verifierSeulement ? _verifier : _payer,
        ),
        if (_message != null) ...[
          const SizedBox(height: 8),
          Text(
            _message!,
            textAlign: TextAlign.center,
            style: AppTextStyles.body.copyWith(
              fontSize: 12,
              color: _messageEstErreur ? AppColors.coral600 : AppColors.ink,
            ),
          ),
        ],
      ],
    );
  }
}
