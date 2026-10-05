// lib/components/dialogs/dialogue_choix_moyen_paiement.dart
//
// Pop-up « Comment souhaitez-vous payer ? », affichée au clic sur « Payer ».
// Miroir de client-plateform/.../ChoixMoyenPaiement.jsx, sur le modèle de
// dialogue_motif_annulation.dart, avec des coins carrés.
//
// Deux options :
//   - Carte bancaire (Stripe)  → [MoyenPaiement.carte]
//   - Mobile Money (CamPay)    → [MoyenPaiement.mobileMoney]
//
// Politique de fonds v2 — facture et devis AVANT paiement :
//   - en haut, la FACTURE détaillée du moyen sélectionné (onglets « Carte
//     bancaire » / « Mobile Money » ; consultation + frais agrégateur +
//     commission APS patient, GET /paiement/rendez-vous/:id/facture) ;
//   - sous chaque moyen, le total et le remboursement estimé en cas
//     d'annulation (GET /paiement/rendez-vous/:id/devis).
// Les deux devis sont chargés en parallèle, avec des états INDÉPENDANTS :
// l'échec ou la lenteur de l'un n'affecte pas l'autre. Aucun montant n'est
// calculé dans l'app.
//   - chargement  : « Calcul du montant… » ;
//   - disponible  : détail du devis ;
//   - indisponible: 503 (barème non saisi) ou 409 (RDV non payable) → le
//                   moyen est grisé avec le message du serveur ;
//   - erreur      : échec transitoire (réseau…) → message + « Réessayer »,
//                   le moyen reste utilisable : le serveur recalcule le
//                   montant et reste seul juge au moment de payer.
//
// La boîte ne déclenche aucun paiement et n'envoie jamais de montant : elle
// retourne seulement le choix, l'appelant (bouton_payer_rdv.dart) lance
// ensuite le bon flux.
//
// Volontairement NON exportée par components.dart, comme les autres
// dialogues de ce dossier (elle dépend désormais de la couche données).

import 'package:flutter/material.dart';

import '../../controllers/paiement_controller.dart';
import '../../models/rendez_vous_models.dart' show DevisPaiement;
import '../../repositories/paiement_repository.dart';
import '../../repositories/rendez_vous_repository.dart' show ApiException;
import '../../utils/fonds.dart';
import '../factures/facture_recapitulative.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';

/// Moyen de paiement choisi par le patient.
enum MoyenPaiement { carte, mobileMoney }

/// Affiche la boîte de dialogue et retourne le moyen choisi, ou `null` si
/// le patient a renoncé (bouton « Annuler » ou tap à côté).
///
/// [rdvId] et [executer] servent à charger les devis ; [repository] est
/// injectable pour les tests.
Future<MoyenPaiement?> demanderMoyenPaiement(
  BuildContext context, {
  required String rdvId,
  required ExecuteurAuthentifie executer,
  PaiementRepository? repository,
}) {
  return showDialog<MoyenPaiement>(
    context: context,
    builder: (_) => _DialogueChoixMoyenPaiement(
      rdvId: rdvId,
      executer: executer,
      repository: repository,
    ),
  );
}

/// État du devis d'UN agrégateur.
sealed class _EtatDevis {
  const _EtatDevis();
}

class _DevisEnCours extends _EtatDevis {
  const _DevisEnCours();
}

class _DevisPret extends _EtatDevis {
  const _DevisPret(this.devis);
  final DevisPaiement devis;
}

/// Moyen inutilisable (503 barème absent, 409 non payable) : grisé.
class _DevisIndisponible extends _EtatDevis {
  const _DevisIndisponible(this.message);
  final String message;
}

/// Échec transitoire : le moyen reste sélectionnable.
class _DevisErreur extends _EtatDevis {
  const _DevisErreur(this.message);
  final String message;
}

class _DialogueChoixMoyenPaiement extends StatefulWidget {
  const _DialogueChoixMoyenPaiement({
    required this.rdvId,
    required this.executer,
    this.repository,
  });

  final String rdvId;
  final ExecuteurAuthentifie executer;
  final PaiementRepository? repository;

  @override
  State<_DialogueChoixMoyenPaiement> createState() =>
      _DialogueChoixMoyenPaiementState();
}

class _DialogueChoixMoyenPaiementState
    extends State<_DialogueChoixMoyenPaiement> {
  late final PaiementRepository _repo =
      widget.repository ?? PaiementRepository();

  // Valeurs attendues par `?agregateur=` côté serveur.
  static const String _stripe = 'stripe';
  static const String _campay = 'campay';

  _EtatDevis _devisStripe = const _DevisEnCours();
  _EtatDevis _devisCampay = const _DevisEnCours();

  /// Moyen dont la facture est affichée (onglet sélectionné).
  String _apercu = _stripe;

  @override
  void initState() {
    super.initState();
    // Chargement en parallèle ; chaque appel gère seul ses erreurs.
    _charger(_stripe);
    _charger(_campay);
  }

  void _poser(String agregateur, _EtatDevis etat) {
    if (!mounted) return;
    setState(() {
      if (agregateur == _stripe) {
        _devisStripe = etat;
      } else {
        _devisCampay = etat;
      }
    });
  }

  Future<void> _charger(String agregateur) async {
    _poser(agregateur, const _DevisEnCours());
    try {
      final devis = await widget.executer(
        (token) => _repo.obtenirDevis(
          rdvId: widget.rdvId,
          agregateur: agregateur,
          token: token,
        ),
      );
      _poser(agregateur, _DevisPret(devis));
    } on ApiException catch (e) {
      // 503 (barème absent) et 409 (RDV non payable / déjà payé) sont
      // définitifs : payer par ce moyen échouerait de toute façon.
      final definitif = e.statusCode == 503 || e.statusCode == 409;
      _poser(
        agregateur,
        definitif
            ? _DevisIndisponible(e.message)
            : _DevisErreur(e.message),
      );
    } catch (_) {
      _poser(
        agregateur,
        const _DevisErreur(
          'Montant indisponible pour le moment. Vérifiez votre réseau.',
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      // Coins carrés (demandés) : Radius nul plutôt que le 28 par défaut.
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      title: const Text('Comment souhaitez-vous payer ?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Choisissez votre moyen de paiement. Votre rendez-vous sera '
              'confirmé dès la réception du règlement.',
            ),
            const SizedBox(height: 12),
            _ApercuFacture(
              apercu: _apercu,
              onChanger: (v) => setState(() => _apercu = v),
              devisIndisponible: switch (_apercu == _stripe
                  ? _devisStripe
                  : _devisCampay) {
                _DevisIndisponible(:final message) => message,
                _ => null,
              },
              rdvId: widget.rdvId,
              executer: widget.executer,
              repository: _repo,
            ),
            const SizedBox(height: 12),
            _OptionPaiement(
              icone: Icons.credit_card_rounded,
              titre: 'Carte bancaire',
              sousTitre: 'Visa, Mastercard — paiement via Stripe',
              etat: _devisStripe,
              onReessayer: () => _charger(_stripe),
              onSelection: () => setState(() => _apercu = _stripe),
              onTap: () => Navigator.of(context).pop(MoyenPaiement.carte),
            ),
            const SizedBox(height: 10),
            _OptionPaiement(
              icone: Icons.phone_android_rounded,
              titre: 'Mobile Money',
              sousTitre: 'MTN / Orange — paiement via CamPay',
              etat: _devisCampay,
              onReessayer: () => _charger(_campay),
              onSelection: () => setState(() => _apercu = _campay),
              onTap: () =>
                  Navigator.of(context).pop(MoyenPaiement.mobileMoney),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Annuler'),
        ),
      ],
    );
  }
}

/// Carte cliquable à angles droits (icône, titre, sous-titre, devis,
/// chevron). Grisée et non cliquable quand le devis est indisponible.
class _OptionPaiement extends StatelessWidget {
  const _OptionPaiement({
    required this.icone,
    required this.titre,
    required this.sousTitre,
    required this.etat,
    required this.onTap,
    required this.onReessayer,
    required this.onSelection,
  });

  final IconData icone;
  final String titre;
  final String sousTitre;
  final _EtatDevis etat;
  final VoidCallback onTap;
  final VoidCallback onReessayer;

  /// Appelé au focus de l'option : la facture affichée suit le moyen.
  final VoidCallback onSelection;

  bool get _desactive => etat is _DevisIndisponible;

  @override
  Widget build(BuildContext context) {
    final carte = Material(
      color: _desactive ? AppColors.paper : AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: AppColors.lineStrong),
      ),
      child: InkWell(
        onTap: _desactive ? null : onTap,
        onFocusChange: (focus) {
          if (focus) onSelection();
        },
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                color: AppColors.primarySurface,
                child: Icon(icone, color: AppColors.primary, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(titre, style: AppTextStyles.cardTitle),
                    const SizedBox(height: 2),
                    Text(sousTitre, style: AppTextStyles.cardMeta),
                    const SizedBox(height: 6),
                    _DetailDevis(etat: etat, onReessayer: onReessayer),
                  ],
                ),
              ),
              if (!_desactive)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Icon(
                    Icons.chevron_right_rounded,
                    color: AppColors.inkFaint,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    return _desactive ? Opacity(opacity: 0.7, child: carte) : carte;
  }
}

/// Détail du devis sous un moyen de paiement, selon son état.
class _DetailDevis extends StatelessWidget {
  const _DetailDevis({required this.etat, required this.onReessayer});

  final _EtatDevis etat;
  final VoidCallback onReessayer;

  @override
  Widget build(BuildContext context) {
    final meta = AppTextStyles.cardMeta;
    switch (etat) {
      case _DevisEnCours():
        return Text('Calcul du montant…', style: meta);
      case _DevisIndisponible(:final message):
        return Text(
          message,
          style: meta.copyWith(color: AppColors.coral600),
        );
      case _DevisErreur(:final message):
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(message, style: meta.copyWith(color: AppColors.coral600)),
            const SizedBox(height: 2),
            GestureDetector(
              onTap: onReessayer,
              child: Text(
                'Réessayer',
                style: meta.copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w700,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
          ],
        );
      case _DevisPret(:final devis):
        final d = devis.devise;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Le détail ligne par ligne est dans la facture affichée plus haut.
            Text.rich(
              TextSpan(
                children: [
                  const TextSpan(text: 'Total : '),
                  TextSpan(
                    text: montantDevise(devis.total, d),
                    style: meta.copyWith(
                      color: AppColors.ink,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
              style: meta,
            ),
            const SizedBox(height: 2),
            Text(
              'Annulation plus de 24 h à l’avance : remboursement d’environ '
              '${montantDevise(devis.remboursementEstime, d)}'
              '${devis.remboursementIndicatif ? ' (estimation)' : ''}, soit '
              'les honoraires moins les frais de remboursement (commission '
              'APS et frais d’envoi non remboursés).',
              style: meta,
            ),
          ],
        );
    }
  }
}

/// Facture détaillée du moyen de paiement sélectionné : deux onglets, puis la
/// card [FactureRdv] (recalculée par le serveur selon l'agrégateur). Si le
/// devis de ce moyen est indisponible (503 barème absent, 409), le message du
/// serveur remplace la facture.
class _ApercuFacture extends StatelessWidget {
  const _ApercuFacture({
    required this.apercu,
    required this.onChanger,
    required this.devisIndisponible,
    required this.rdvId,
    required this.executer,
    required this.repository,
  });

  final String apercu;
  final ValueChanged<String> onChanger;
  final String? devisIndisponible;
  final String rdvId;
  final ExecuteurAuthentifie executer;
  final PaiementRepository repository;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            _Onglet(
              libelle: 'Carte bancaire',
              actif: apercu == 'stripe',
              onTap: () => onChanger('stripe'),
            ),
            const SizedBox(width: 6),
            _Onglet(
              libelle: 'Mobile Money',
              actif: apercu == 'campay',
              onTap: () => onChanger('campay'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (devisIndisponible != null)
          Text(
            devisIndisponible!,
            style: AppTextStyles.cardMeta.copyWith(color: AppColors.coral600),
          )
        else
          FactureRdv(
            rdvId: rdvId,
            agregateur: apercu,
            executer: executer,
            repository: repository,
            compact: true,
            // Aperçu avant paiement : le téléchargement est proposé sur la
            // facture définitive, une fois le paiement confirmé.
            telechargeable: false,
          ),
      ],
    );
  }
}

/// Onglet carré « Carte bancaire » / « Mobile Money ».
class _Onglet extends StatelessWidget {
  const _Onglet({
    required this.libelle,
    required this.actif,
    required this.onTap,
  });

  final String libelle;
  final bool actif;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: actif ? AppColors.primary : AppColors.card,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.zero,
          side: BorderSide(color: AppColors.primary),
        ),
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Center(
              child: Text(
                libelle,
                style: AppTextStyles.cardMeta.copyWith(
                  color: actif ? Colors.white : AppColors.primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}