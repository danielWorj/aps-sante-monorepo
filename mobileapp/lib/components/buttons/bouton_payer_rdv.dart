// lib/components/buttons/bouton_payer_rdv.dart
//
// Bouton « Payer » d'un rendez-vous. Au clic, le patient choisit son moyen
// de paiement :
//   - Carte bancaire : PaymentSheet Stripe native ([_payer]) ;
//   - Mobile Money   : modale CamPay (dialogue_paiement_mobile_money.dart).
// Avant le choix, le patient voit la facture détaillée de chaque moyen
// (consultation, frais agrégateur, commission APS, total) et le remboursement
// estimé ; un moyen dont le barème n'est pas saisi (503) y est grisé.
// Dans les deux cas, [onPaye] n'est appelé qu'une fois le paiement
// confirmé par le SERVEUR (webhook), jamais sur la seule foi du client.
// Le total envoyé à Stripe (PaymentSheet) comme à CamPay est celui que le
// serveur recalcule : l'app n'envoie jamais de montant, la facture affichée
// est donc exactement le montant débité.
// À la confirmation, la FACTURE FINALE (GET …/facture, card + bouton
// « Télécharger la facture ») s'ouvre dans une boîte de dialogue, AVANT
// [onPaye] : le bouton disparaît dès que l'appelant passe le RDV à « payé »,
// ce qui détruirait le contexte nécessaire pour afficher la facture. Un échec
// de chargement de la facture ne bloque jamais la confirmation.
// Réutilisable : écran de confirmation après réservation, et onglet
// « À payer » du portail patient (rattrapage d'un paiement annulé).
//
// N'est volontairement PAS exporté par components.dart : il dépend de
// la couche données (paiement_controller / repository), alors que les
// autres composants de ce dossier sont de la pure présentation.

import 'package:flutter/material.dart';

import '../../controllers/paiement_controller.dart';
import '../../repositories/paiement_repository.dart';
import '../dialogs/dialogue_choix_moyen_paiement.dart';
import '../dialogs/dialogue_paiement_mobile_money.dart';
import '../factures/facture_recapitulative.dart';
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
    this.telephoneInitial,
  });

  final String rdvId;

  /// Fournit le token d'accès (voir [ExecuteurAuthentifie]).
  final ExecuteurAuthentifie executer;

  /// Appelé UNE fois que le serveur (via webhook) a confirmé le paiement.
  final VoidCallback? onPaye;

  /// Injectable pour les tests ; instancié par défaut.
  final PaiementRepository? repository;

  final String label;

  /// Numéro pré-rempli dans la modale Mobile Money (ex. le téléphone du
  /// patient). Facultatif, modifiable par le patient.
  final String? telephoneInitial;

  @override
  State<BoutonPayerRdv> createState() => _BoutonPayerRdvState();
}

class _BoutonPayerRdvState extends State<BoutonPayerRdv> {
  late final PaiementRepository _repo = widget.repository ?? PaiementRepository();

  bool _enCours = false;

  /// Le paiement a été pris côté Stripe mais pas encore confirmé par le
  /// serveur : on propose « Vérifier » plutôt que de payer une 2e fois.
  bool _paiementEffectueEnAttente = false;

  /// Le serveur indique que le rendez-vous est annulé : plus rien à
  /// payer ni à vérifier, on n'affiche plus que le message.
  bool _rdvAnnule = false;

  String? _message;
  bool _messageEstErreur = false;

  /// Clic sur « Payer » : le patient choisit d'abord son moyen de paiement.
  Future<void> _choisirMoyen() async {
    final moyen = await demanderMoyenPaiement(
      context,
      rdvId: widget.rdvId,
      executer: widget.executer,
      repository: _repo,
    );
    if (!mounted || moyen == null) return;
    switch (moyen) {
      case MoyenPaiement.carte:
        await _payer();
      case MoyenPaiement.mobileMoney:
        await _payerMobileMoney();
    }
  }

  /// Ouvre la modale Mobile Money (saisie, attente de validation, échec,
  /// délai dépassé) et réagit à son issue.
  Future<void> _payerMobileMoney() async {
    setState(() {
      _message = null;
      _messageEstErreur = false;
    });
    final resultat = await ouvrirPaiementMobileMoney(
      context,
      rdvId: widget.rdvId,
      executer: widget.executer,
      repository: _repo,
      telephoneInitial: widget.telephoneInitial,
    );
    if (!mounted) return;
    switch (resultat) {
      case ResultatMobileMoney.confirme:
        // Confirmé par le serveur (paiement « reussie »).
        setState(() {
          _enCours = false;
          _paiementEffectueEnAttente = false;
          _message = null;
        });
        await _afficherFactureFinale();
        widget.onPaye?.call();
      case ResultatMobileMoney.enAttente:
        // Demande envoyée mais pas encore confirmée : le patient peut
        // valider après coup → « Vérifier » plutôt que de repayer.
        setState(() {
          _paiementEffectueEnAttente = true;
          _messageEstErreur = false;
          _message = 'Demande de paiement envoyée. Une fois validée sur '
              'votre téléphone, appuyez sur « Vérifier mon paiement ».';
        });
      case ResultatMobileMoney.rdvAnnule:
        setState(() {
          _rdvAnnule = true;
          _message = rdvAnnuleMessage;
          _messageEstErreur = true;
        });
      case ResultatMobileMoney.abandonne:
        break;
    }
  }

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
        _rdvAnnule = _estRdvAnnule(e);
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
        await _afficherFactureFinale();
        widget.onPaye?.call();
        return;
      }
      setState(() {
        _enCours = false;
        _message = 'Paiement en cours de confirmation. '
            'Appuyez sur « Vérifier mon paiement » dans quelques instants.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _enCours = false;
        _rdvAnnule = _estRdvAnnule(e);
        _message = _messageLisible(e);
        _messageEstErreur = true;
      });
    }
  }

  /// Affiche, une fois le paiement confirmé par le serveur, la facture
  /// finale (card + « Télécharger la facture »), comme PaiementSucces.jsx.
  /// Sans effet si le widget a été retiré entre-temps ; si la facture ne se
  /// charge pas, la boîte affiche le message d'erreur avec « Réessayer » :
  /// le paiement, lui, est déjà confirmé.
  Future<void> _afficherFactureFinale() async {
    if (!mounted) return;
    await afficherFactureRdv(
      context,
      rdvId: widget.rdvId,
      executer: widget.executer,
      repository: _repo,
      titre: 'Paiement confirmé',
    );
  }

  /// Détecte un refus « rendez-vous annulé » : soit levé par le polling
  /// ([rdvAnnuleMessage]), soit renvoyé par le serveur (409 sur
  /// POST …/paiement-natif).
  bool _estRdvAnnule(Object e) {
    final texte = '$e';
    return texte == rdvAnnuleMessage || texte.contains('a été annulé');
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
        if (!_rdvAnnule)
        PrimaryButton(
          label: verifierSeulement ? 'Vérifier mon paiement' : widget.label,
          icon: verifierSeulement ? Icons.refresh_rounded : Icons.lock_outline,
          loading: _enCours,
          onPressed: verifierSeulement ? _verifier : _choisirMoyen,
        ),
        // Sortie de secours : une demande Mobile Money refusée ou ignorée
        // sur le téléphone ne doit pas laisser le patient bloqué sur
        // « Vérifier ». Le serveur reste garant : il renvoie la tentative
        // déjà en cours (même numéro, < 2 min) et refuse un RDV déjà payé
        // ou annulé.
        if (verifierSeulement && !_rdvAnnule && !_enCours)
          TextButton(
            onPressed: () {
              setState(() {
                _paiementEffectueEnAttente = false;
                _message = null;
                _messageEstErreur = false;
              });
              _choisirMoyen();
            },
            child: const Text('Payer autrement / réessayer'),
          ),
        if (_message != null) ...[
          if (!_rdvAnnule) const SizedBox(height: 8),
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