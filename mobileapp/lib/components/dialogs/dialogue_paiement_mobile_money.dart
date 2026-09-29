// lib/components/dialogs/dialogue_paiement_mobile_money.dart
//
// Modale « Payer par Mobile Money » (CamPay — MTN / Orange).
// Miroir de client-plateform/.../PaiementMobileMoney.jsx, en 4 états :
//
//   1. saisie   : le patient renseigne son numéro (le sien ou celui d'un
//                 proche) ;
//   2. attente  : POST …/paiement-campay a envoyé la demande de validation
//                 sur le téléphone ; on interroge ensuite GET
//                 …/paiement toutes les 3 s (~90 s max) ;
//   3. échec    : refus / expiration de la tentative, ou RDV annulé ;
//   4. délai    : pas de réponse à temps — ce n'est PAS un échec, le
//                 patient peut encore valider : « Vérifier à nouveau ».
//
// Succès : dès que le SERVEUR indique `paiement.statut == 'reussie'`, la
// modale se ferme avec [ResultatMobileMoney.confirme].
//
// Règle d'or : l'app ne confirme jamais rien elle-même, et n'envoie jamais
// de montant (le serveur le recalcule).
//
// Volontairement NON exportée par components.dart : elle dépend de la
// couche données (paiement_controller / repository), comme
// bouton_payer_rdv.dart.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart'
    show AutofillHints, FilteringTextInputFormatter;

import '../../controllers/paiement_controller.dart';
import '../../repositories/paiement_repository.dart';
import '../../repositories/rendez_vous_repository.dart' show ApiException;
import '../../utils/mobile_money.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';

/// Ce que l'appelant doit retenir de la fermeture de la modale.
enum ResultatMobileMoney {
  /// Le serveur a confirmé le paiement : appeler `onPaye`.
  confirme,

  /// Le patient a renoncé, aucune demande n'est en cours.
  abandonne,

  /// Une demande a été envoyée mais le serveur n'a pas (encore) confirmé
  /// le paiement : le patient peut valider après coup. L'appelant propose
  /// « Vérifier mon paiement » plutôt que de faire repayer.
  enAttente,

  /// Le rendez-vous est annulé : plus rien à payer ni à vérifier.
  rdvAnnule,
}

/// Ouvre la modale et retourne son [ResultatMobileMoney].
///
/// [telephoneInitial] pré-remplit le numéro (ex. `Utilisateur.telephone`) ;
/// le patient peut le modifier.
Future<ResultatMobileMoney> ouvrirPaiementMobileMoney(
  BuildContext context, {
  required String rdvId,
  required ExecuteurAuthentifie executer,
  PaiementRepository? repository,
  String? telephoneInitial,
}) async {
  final resultat = await showDialog<ResultatMobileMoney>(
    context: context,
    // Un tap à côté ne doit pas couper le suivi pendant que le patient
    // valide sur son téléphone : seuls les boutons ferment.
    barrierDismissible: false,
    builder: (_) => _DialoguePaiementMobileMoney(
      rdvId: rdvId,
      executer: executer,
      repository: repository,
      telephoneInitial: telephoneInitial,
    ),
  );
  return resultat ?? ResultatMobileMoney.abandonne;
}

enum _Etape { saisie, attente, echec, delai }

class _DialoguePaiementMobileMoney extends StatefulWidget {
  const _DialoguePaiementMobileMoney({
    required this.rdvId,
    required this.executer,
    this.repository,
    this.telephoneInitial,
  });

  final String rdvId;
  final ExecuteurAuthentifie executer;
  final PaiementRepository? repository;
  final String? telephoneInitial;

  @override
  State<_DialoguePaiementMobileMoney> createState() =>
      _DialoguePaiementMobileMoneyState();
}

class _DialoguePaiementMobileMoneyState
    extends State<_DialoguePaiementMobileMoney> {
  late final PaiementRepository _repo =
      widget.repository ?? PaiementRepository();
  late final TextEditingController _numeroCtrl;

  _Etape _etape = _Etape.saisie;
  bool _envoiEnCours = false;
  CollecteCampay? _collecte;
  String? _erreur;
  bool _rdvAnnule = false;

  /// Identifie la boucle de polling « courante » : toute boucle plus
  /// ancienne (ou survivant à la fermeture) s'arrête d'elle-même.
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    final tel = (widget.telephoneInitial ?? '').trim();
    _numeroCtrl = TextEditingController(
      text: estNumeroCMValide(tel) ? formaterNumeroAffichage(tel) : tel,
    );
  }

  @override
  void dispose() {
    _generation++; // stoppe le polling en cours
    _numeroCtrl.dispose();
    super.dispose();
  }

  bool get _numeroValide => estNumeroCMValide(_numeroCtrl.text);

  /// Envoi ou attente de validation : le retour Android ne doit pas fermer
  /// la modale (on perdrait le suivi). Le bouton « Fermer » reste voulu.
  bool get _fermetureAccidentelleBloquee =>
      _etape == _Etape.attente || _envoiEnCours;

  // ─── Actions ───────────────────────────────────────────────────────

  Future<void> _payer() async {
    if (_envoiEnCours || !_numeroValide) return;
    setState(() {
      _erreur = null;
      _envoiEnCours = true;
    });
    try {
      final collecte = await lancerCollecteMobileMoney(
        _repo,
        rdvId: widget.rdvId,
        numero: _numeroCtrl.text,
        executer: widget.executer,
      );
      if (!mounted) return;
      setState(() {
        _collecte = collecte;
        _envoiEnCours = false;
        _etape = _Etape.attente;
      });
      _surveiller();
    } catch (e) {
      if (!mounted) return;
      if (estErreurRdvAnnule(e)) {
        setState(() {
          _envoiEnCours = false;
          _rdvAnnule = true;
          _erreur = rdvAnnuleMessage;
          _etape = _Etape.echec;
        });
        return;
      }
      setState(() {
        _envoiEnCours = false;
        _erreur = e is ApiException && e.statusCode == 429
            ? 'Trop de tentatives. Réessayez dans quelques minutes.'
            : _messageLisible(e);
        _etape = _Etape.saisie;
      });
    }
  }

  Future<void> _surveiller() async {
    final id = ++_generation;
    try {
      final issue = await attendreConfirmationMobileMoney(
        _repo,
        rdvId: widget.rdvId,
        executer: widget.executer,
        doitContinuer: () => mounted && _generation == id,
      );
      if (!mounted || _generation != id) return;
      switch (issue) {
        case IssueMobileMoney.reussie:
          Navigator.of(context).pop(ResultatMobileMoney.confirme);
        case IssueMobileMoney.echouee:
          setState(() {
            _erreur = null;
            _etape = _Etape.echec;
          });
        case IssueMobileMoney.delaiDepasse:
          setState(() => _etape = _Etape.delai);
        case IssueMobileMoney.interrompue:
          break;
      }
    } catch (e) {
      if (!mounted || _generation != id) return;
      setState(() {
        _rdvAnnule = estErreurRdvAnnule(e);
        _erreur = _messageLisible(e);
        _etape = _Etape.echec;
      });
    }
  }

  void _reessayer() {
    setState(() {
      _erreur = null;
      _collecte = null;
      _etape = _Etape.saisie;
    });
  }

  void _reverifier() {
    setState(() => _etape = _Etape.attente);
    _surveiller();
  }

  void _fermer() {
    _generation++;
    final demandeEnvoyee = _collecte != null &&
        (_etape == _Etape.attente || _etape == _Etape.delai);
    Navigator.of(context).pop(
      _rdvAnnule
          ? ResultatMobileMoney.rdvAnnule
          : demandeEnvoyee
              ? ResultatMobileMoney.enAttente
              : ResultatMobileMoney.abandonne,
    );
  }

  String _messageLisible(Object e) {
    final texte = '$e';
    if (e is PaiementException || e is ApiException) return texte;
    if (texte.contains('SocketException') ||
        texte.contains('TimeoutException') ||
        texte.contains('ClientException')) {
      return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
    }
    return texte;
  }

  // ─── UI ────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_fermetureAccidentelleBloquee) _fermer();
      },
      child: AlertDialog(
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
        title: Row(
          children: [
            const Icon(Icons.phone_android_rounded, color: AppColors.primary),
            const SizedBox(width: 10),
            const Expanded(child: Text('Payer par Mobile Money')),
          ],
        ),
        content: SingleChildScrollView(
          child: switch (_etape) {
            _Etape.saisie => _buildSaisie(),
            _Etape.attente => _buildAttente(),
            _Etape.echec => _buildEchec(),
            _Etape.delai => _buildDelai(),
          },
        ),
        actions: [
          TextButton(
            onPressed: _envoiEnCours ? null : _fermer,
            child: const Text('Fermer'),
          ),
        ],
      ),
    );
  }

  Widget _buildSaisie() {
    final saisie = _numeroCtrl.text;
    final afficherErreurNumero = saisie.trim().isNotEmpty && !_numeroValide;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Numéro MTN ou Orange',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _numeroCtrl,
          enabled: !_envoiEnCours,
          keyboardType: TextInputType.phone,
          autofillHints: const [AutofillHints.telephoneNumber],
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9\s+.\-()]')),
          ],
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => _payer(),
          decoration: InputDecoration(
            hintText: '6XX XXX XXX',
            prefixIcon: const Icon(Icons.phone_outlined),
            errorText: afficherErreurNumero
                ? 'Saisissez un numéro camerounais valide (format 6XXXXXXXX).'
                : null,
            errorMaxLines: 2,
            // Coins carrés, comme le reste de la modale.
            border: const OutlineInputBorder(borderRadius: BorderRadius.zero),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Le numéro peut être celui d\'un proche. Une demande de '
          'validation y sera envoyée.',
          style: AppTextStyles.body.copyWith(fontSize: 12),
        ),
        if (_erreur != null) ...[
          const SizedBox(height: 12),
          _MessageErreur(_erreur!),
        ],
        const SizedBox(height: 16),
        _BoutonPrincipal(
          label: 'Envoyer la demande de paiement',
          icone: Icons.send_rounded,
          enCours: _envoiEnCours,
          onPressed: _numeroValide ? _payer : null,
        ),
      ],
    );
  }

  Widget _buildAttente() {
    final collecte = _collecte;
    final operateur = collecte?.operateur;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const SizedBox(height: 4),
        const SizedBox(
          width: 36,
          height: 36,
          child: CircularProgressIndicator(strokeWidth: 3),
        ),
        const SizedBox(height: 16),
        Text.rich(
          TextSpan(
            children: [
              const TextSpan(
                text: 'Une demande de paiement a été envoyée au ',
              ),
              TextSpan(
                text: formaterNumeroAffichage(_numeroCtrl.text),
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              if (operateur != null) TextSpan(text: ' ($operateur)'),
              const TextSpan(
                text: '.\nValidez-la sur votre téléphone avec votre code '
                    'secret.',
              ),
            ],
          ),
          textAlign: TextAlign.center,
        ),
        if (collecte?.dejaInitie == true) ...[
          const SizedBox(height: 10),
          _NoteDiscrete(
            'Une demande est déjà en cours pour ce numéro : inutile d\'en '
            'renvoyer une autre.',
          ),
        ],
        if (collecte?.incertain == true) ...[
          const SizedBox(height: 10),
          _NoteDiscrete(
            'Nous n\'avons pas pu confirmer l\'envoi de la demande à '
            'l\'opérateur. Si vous la recevez, vous pouvez la valider : '
            'votre paiement sera pris en compte. Inutile de renvoyer une '
            'demande.',
          ),
        ],
        if (collecte?.ussdCode != null) ...[
          const SizedBox(height: 10),
          Text.rich(
            TextSpan(
              children: [
                const TextSpan(text: 'Sinon, composez : '),
                TextSpan(
                  text: collecte!.ussdCode,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            textAlign: TextAlign.center,
            style: AppTextStyles.body.copyWith(fontSize: 13),
          ),
        ],
        const SizedBox(height: 10),
        _NoteDiscrete(
          'Ne fermez pas cette fenêtre : la confirmation est automatique.',
        ),
      ],
    );
  }

  Widget _buildEchec() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _MessageErreur(_erreur ?? 'Le paiement a été refusé ou a expiré.'),
        if (!_rdvAnnule) ...[
          const SizedBox(height: 16),
          _BoutonPrincipal(
            label: 'Réessayer',
            icone: Icons.refresh_rounded,
            onPressed: _reessayer,
          ),
        ],
      ],
    );
  }

  Widget _buildDelai() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Nous attendons encore la confirmation de l\'opérateur. Si vous '
          'avez déjà validé, patientez un instant.',
        ),
        const SizedBox(height: 16),
        _BoutonPrincipal(
          label: 'Vérifier à nouveau',
          icone: Icons.refresh_rounded,
          onPressed: _reverifier,
        ),
      ],
    );
  }
}

// ─── Petits widgets locaux (coins carrés) ────────────────────────────

class _BoutonPrincipal extends StatelessWidget {
  const _BoutonPrincipal({
    required this.label,
    required this.icone,
    required this.onPressed,
    this.enCours = false,
  });

  final String label;
  final IconData icone;
  final VoidCallback? onPressed;
  final bool enCours;

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: enCours ? null : onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        disabledBackgroundColor: AppColors.primary.withOpacity(0.6),
        disabledForegroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(vertical: 13, horizontal: 12),
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      ),
      child: enCours
          ? const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                ),
                SizedBox(width: 10),
                Text('Envoi de la demande…'),
              ],
            )
          : Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icone, size: 16),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    label,
                    style:
                        AppTextStyles.buttonLabel.copyWith(fontSize: 14),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
    );
  }
}

class _MessageErreur extends StatelessWidget {
  const _MessageErreur(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      color: AppColors.dangerLight,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.error_outline_rounded,
            size: 18,
            color: AppColors.dangerDark,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: AppTextStyles.body.copyWith(
                fontSize: 13,
                color: AppColors.dangerDark,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NoteDiscrete extends StatelessWidget {
  const _NoteDiscrete(this.texte);

  final String texte;

  @override
  Widget build(BuildContext context) {
    return Text(
      texte,
      textAlign: TextAlign.center,
      style: AppTextStyles.body.copyWith(
        fontSize: 12,
        color: AppColors.inkFaint,
      ),
    );
  }
}
