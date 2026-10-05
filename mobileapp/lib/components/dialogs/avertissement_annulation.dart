// lib/components/dialogs/avertissement_annulation.dart
//
// Politique de fonds v2 : conséquence financière INDICATIVE d'une
// annulation, affichée AVANT la confirmation (équivalent de
// avertissement-annulation.jsx côté client-plateform).
//
// Règle de remboursement (D3) : la commission APS patient (CP) n'est JAMAIS
// rendue au patient, sauf si le médecin est fautif ; les frais d'envoi ne
// sont jamais rendus. Hors faute du médecin, le patient reçoit uniquement
// les honoraires (H) moins les frais de remboursement de l'agrégateur (F).
// Visibilité (D7) : le patient ne voit jamais la part médecin (CM) ; le
// médecin ne voit jamais CP ni le détail du remboursement du patient.
// Aucun montant de CM n'apparaît ici.
//
// Le front affiche, le serveur décide : ce texte n'engage rien, le résumé
// réel est donné après l'annulation (voir `resumerAnnulation`,
// utils/fonds.dart). Règles d'affichage :
//   - lecture du statut de paiement en cours : petit indicateur ;
//   - lecture en échec : le widget ne montre RIEN et ne bloque pas
//     l'annulation (le serveur tranche) ;
//   - RDV non payé : aucun fonds n'est concerné ;
//   - RDV payé : message selon le rôle, le caractère tardif (strictement
//     moins de 24 h) et le statut `a_reprogrammer`.
//
// Le chargement passe par une fonction fournie par l'appelant
// ([chargerPaiement]) : la boîte de dialogue vit sous le Navigator, pas
// forcément sous le ProviderScope de la page, donc ce widget ne lit aucun
// provider lui-même.
//
// Volontairement NON exporté par components.dart : il dépend de la couche
// modèles/repositories, comme dialogue_motif_annulation.dart.

import 'package:flutter/material.dart';

import '../../models/rendez_vous_models.dart';
import '../../repositories/paiement_repository.dart';
import '../../utils/fonds.dart';
import '../style/colors.dart';

class AvertissementAnnulation extends StatefulWidget {
  const AvertissementAnnulation({
    super.key,
    required this.rdv,
    required this.role,
    required this.chargerPaiement,
  });

  final RendezVous rdv;
  final RoleAnnulation role;

  /// Lit GET /paiement/rendez-vous/:id/paiement (avec rafraîchissement du
  /// token par l'appelant).
  final Future<StatutPaiementRdv> Function() chargerPaiement;

  @override
  State<AvertissementAnnulation> createState() =>
      _AvertissementAnnulationState();
}

class _AvertissementAnnulationState extends State<AvertissementAnnulation> {
  bool _chargement = true;
  bool _erreur = false;
  StatutPaiementRdv? _paiement;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<void> _charger() async {
    try {
      final paiement = await widget.chargerPaiement();
      if (!mounted) return;
      setState(() {
        _paiement = paiement;
        _chargement = false;
      });
    } catch (_) {
      // N'empêche pas l'annulation : le serveur tranche.
      if (!mounted) return;
      setState(() {
        _erreur = true;
        _chargement = false;
      });
    }
  }

  /// Texte indicatif, mêmes formulations que le web.
  String _message(StatutPaiementRdv paiement) {
    final honoraires = paiement.decomposition?.honoraires;
    final devise = paiement.devise;
    final patient = widget.role == RoleAnnulation.patient;

    if (widget.rdv.statut == StatutRendezVous.aReprogrammer) {
      // Deux absents sans reprogrammation : le patient reçoit H − CM − F
      // (CP conservée par APS). Seul le principe est affiché au patient,
      // jamais le montant de la part médecin (D7).
      return patient
          ? 'Les deux parties étaient absentes. Si vous annulez, vous serez '
              'remboursé d\u2019une partie de vos honoraires, après '
              'déduction des frais de remboursement du moyen de paiement et '
              'des frais de service APS retenus sur cette consultation. La '
              'commission APS et les frais d\u2019envoi ne sont pas '
              'remboursés. Le montant exact vous sera indiqué à '
              'l\u2019annulation.'
          : 'Les deux parties étaient absentes. Si vous annulez, le patient '
              'est remboursé et vous ne percevez aucun honoraire. Aucune '
              'amende.';
    }

    final tardif = estTardif(widget.rdv.dateCreneau);
    if (patient) {
      if (tardif) {
        return 'Le rendez-vous a lieu dans moins de 24 h : aucun '
            'remboursement. Le médecin sera rémunéré pour ce créneau.';
      }
      final detail =
          honoraires != null ? ' (${montantDevise(honoraires, devise)})' : '';
      return 'Le rendez-vous a lieu dans plus de 24 h : vous serez remboursé '
          'de vos honoraires$detail moins les frais de remboursement du '
          'moyen de paiement. La commission APS et les frais d\u2019envoi ne '
          'sont pas remboursés.';
    }
    return tardif
        ? 'Le rendez-vous a lieu dans moins de 24 h : le patient sera '
            'remboursé, vous ne percevrez aucun honoraire, et une amende '
            'sera enregistrée à votre nom (un pourcentage de votre prochaine '
            'libération de fonds, reversé à APS).'
        : 'Le patient sera remboursé. Vous ne percevrez aucun honoraire '
            'pour ce rendez-vous.';
  }

  @override
  Widget build(BuildContext context) {
    if (_chargement) {
      return const Row(
        children: [
          SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'Vérification du paiement…',
              style: TextStyle(fontSize: 12, color: AppColors.inkSoft),
            ),
          ),
        ],
      );
    }
    if (_erreur || _paiement == null) return const SizedBox.shrink();

    final paye = _paiement!.estPaye;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: paye ? AppColors.warningLight : AppColors.primarySurface,
        border: Border.all(
          color: paye ? AppColors.warning : AppColors.line,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            paye ? Icons.balance : Icons.info_outline,
            size: 18,
            color: paye ? AppColors.warning : AppColors.inkSoft,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              paye
                  ? _message(_paiement!)
                  : 'Ce rendez-vous n\'a pas été payé : aucun fonds n\'est '
                      'concerné.',
              style: const TextStyle(fontSize: 13, color: AppColors.ink),
            ),
          ),
        ],
      ),
    );
  }
}