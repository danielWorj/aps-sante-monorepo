// lib/components/factures/facture_recapitulative.dart
//
// Politique de fonds v2 — Facture récapitulative détaillée (card).
// Miroir de client-plateform/.../FactureRecapitulative.jsx.
//
// Trois éléments publics :
//   - [FactureRecapitulative] : affichage PUR d'une [Facture] déjà chargée,
//     avec le bouton « Télécharger la facture » (PDF généré dans l'app) ;
//   - [FactureRdv]            : charge la facture d'un RDV (GET
//     /paiement/rendez-vous/:id/facture) puis l'affiche — avant paiement,
//     `agregateur` est obligatoire ; après paiement, il est omis ;
//   - [afficherFactureRdv]    : ouvre la facture d'un RDV dans une boîte de
//     dialogue (récapitulatif après paiement, accès depuis un RDV payé).
//
// Aucun montant n'est calculé ici : le serveur renvoie lignes et total, déjà
// arrondis, dont la somme est exactement le montant débité. La card ne fait
// que les afficher (formule « base × taux = montant » incluse, via
// utils/facture_format.dart, partagé avec le PDF).
//
// Facture MINIMALE (transaction antérieure à la v2) : une seule ligne
// « Consultation » et le total débité, sans frais ni commission.
//
// Volontairement NON exportée par components.dart : [FactureRdv] dépend de la
// couche données (repository), comme bouton_payer_rdv.dart.

import 'package:flutter/material.dart';

import '../../controllers/paiement_controller.dart';
import '../../repositories/paiement_repository.dart';
import '../../services/facture_pdf_service.dart';
import '../../utils/facture_format.dart';
import '../../utils/fonds.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';

/// Signature du téléchargement, injectable pour les tests (par défaut :
/// [FacturePdfService.partager]).
typedef TelechargerFacture = Future<void> Function(
  Facture facture,
  Rect? origine,
);

Future<void> _telechargerParDefaut(Facture facture, Rect? origine) =>
    FacturePdfService.partager(facture, origine: origine);

/// Card de facture. [compact] : version réduite pour les boîtes de
/// dialogue (coins carrés, marges et montants plus petits).
class FactureRecapitulative extends StatefulWidget {
  const FactureRecapitulative({
    super.key,
    required this.facture,
    this.telechargeable = true,
    this.compact = false,
    this.onTelecharger = _telechargerParDefaut,
  });

  final Facture facture;
  final bool telechargeable;
  final bool compact;
  final TelechargerFacture onTelecharger;

  @override
  State<FactureRecapitulative> createState() => _FactureRecapitulativeState();
}

class _FactureRecapitulativeState extends State<FactureRecapitulative> {
  bool _generation = false;

  Future<void> _telecharger() async {
    if (_generation) return;
    // Zone d'ancrage de la feuille de partage (requise sur iPad).
    final box = context.findRenderObject();
    final origine = box is RenderBox && box.hasSize
        ? box.localToGlobal(Offset.zero) & box.size
        : null;
    final messager = ScaffoldMessenger.maybeOf(context);
    setState(() => _generation = true);
    try {
      await widget.onTelecharger(widget.facture, origine);
    } catch (_) {
      messager?.showSnackBar(
        const SnackBar(
          content: Text(
            'Impossible de générer le PDF de la facture. Réessayez.',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _generation = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final f = widget.facture;
    final compact = widget.compact;
    final devise = f.devise;
    final date = dateLongueFacture(f.date);
    final e = f.entete;
    final marge = compact ? 12.0 : 16.0;

    final infos = <(String, String)>[
      if (e.specialite != null) ('Spécialité', e.specialite!),
      if (e.pays != null) ('Pays', e.pays!),
      if (e.ville != null) ('Ville', e.ville!),
      if (e.dateCreneau != null) ('Rendez-vous', dateHeureUtc(e.dateCreneau)),
    ];

    return Semantics(
      container: true,
      label: titreFacture(f),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.card,
          border: Border.all(color: AppColors.lineStrong),
          borderRadius: compact ? BorderRadius.zero : BorderRadius.circular(14),
          boxShadow: compact
              ? null
              : [
                  BoxShadow(
                    color: AppColors.ink.withOpacity(0.06),
                    blurRadius: 14,
                    offset: const Offset(0, 4),
                  ),
                ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── En-tête APS Santé + numéro / date ──
            Container(
              color: AppColors.primary,
              padding: EdgeInsets.symmetric(horizontal: marge, vertical: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'APS Santé',
                          style: AppTextStyles.h3.copyWith(
                            color: Colors.white,
                            fontSize: compact ? 16 : 18,
                          ),
                        ),
                        Text(
                          titreFacture(f),
                          style: AppTextStyles.cardMeta.copyWith(
                            color: Colors.white.withOpacity(0.85),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      if (f.estDevis)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          color: Colors.white.withOpacity(0.18),
                          child: Text(
                            'Avant paiement',
                            style: AppTextStyles.badge.copyWith(
                              color: Colors.white,
                            ),
                          ),
                        )
                      else if (f.numero != null)
                        Text(
                          f.numero!,
                          style: AppTextStyles.cardMeta.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      if (date != null)
                        Text(
                          date,
                          style: AppTextStyles.cardMeta.copyWith(
                            color: Colors.white.withOpacity(0.85),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),

            Padding(
              padding: EdgeInsets.all(marge),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // ── Consultation ──
                  Text(
                    'Consultation auprès de ${e.medecin}',
                    style: AppTextStyles.cardTitle,
                  ),
                  if (infos.isNotEmpty) const SizedBox(height: 6),
                  for (final (libelle, valeur) in infos)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SizedBox(
                            width: 84,
                            child: Text(libelle, style: AppTextStyles.cardMeta),
                          ),
                          Expanded(
                            child: Text(
                              valeur,
                              style: AppTextStyles.cardMeta.copyWith(
                                color: AppColors.ink,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  SizedBox(height: compact ? 10 : 14),

                  // ── Lignes : consultation / frais / commission ──
                  const Divider(height: 1, color: AppColors.line),
                  for (final l in f.lignes) ...[
                    _LigneFactureWidget(ligne: l, devise: devise),
                    const Divider(height: 1, color: AppColors.line),
                  ],
                  const SizedBox(height: 12),

                  // ── Total mis en valeur ──
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.primarySurface,
                      border: Border.all(color: AppColors.primary),
                      borderRadius: compact
                          ? BorderRadius.zero
                          : BorderRadius.circular(10),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Total', style: AppTextStyles.cardTitle),
                        Text(
                          montantDevise(f.total, devise),
                          style: AppTextStyles.cardTitle.copyWith(
                            color: AppColors.primary,
                            fontSize: compact ? 15 : 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),

                  if (f.minimale) ...[
                    const SizedBox(height: 10),
                    Text(
                      'Ce paiement a été effectué avant la mise en place du '
                      'détail des frais : seul le montant total débité est '
                      'affiché.',
                      style: AppTextStyles.cardMeta,
                    ),
                  ],

                  if (widget.telechargeable) ...[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: _generation ? null : _telecharger,
                      icon: _generation
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.download_rounded, size: 18),
                      label: Text(
                        _generation
                            ? 'Génération du PDF…'
                            : 'Télécharger la facture',
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.primary,
                        side: const BorderSide(color: AppColors.primary),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: compact
                              ? BorderRadius.zero
                              : BorderRadius.circular(10),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Une ligne de la facture : libellé (+ formule) à gauche, montant à droite.
class _LigneFactureWidget extends StatelessWidget {
  const _LigneFactureWidget({required this.ligne, required this.devise});

  final LigneFacture ligne;
  final String devise;

  @override
  Widget build(BuildContext context) {
    final detail = formuleLigne(ligne, devise);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  ligne.libelle,
                  style: AppTextStyles.body.copyWith(color: AppColors.ink),
                ),
                if (detail.isNotEmpty)
                  Text(detail, style: AppTextStyles.cardMeta),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            montantDevise(ligne.montant, devise),
            style: AppTextStyles.price,
          ),
        ],
      ),
    );
  }
}

/// Charge puis affiche la facture d'un RDV.
///
/// Recharge automatiquement quand [rdvId] ou [agregateur] change (onglet
/// « Carte bancaire / Mobile Money » du choix de paiement). Les réponses
/// d'une requête périmée sont ignorées.
class FactureRdv extends StatefulWidget {
  const FactureRdv({
    super.key,
    required this.rdvId,
    required this.executer,
    this.agregateur,
    this.telechargeable = true,
    this.compact = false,
    this.repository,
    this.onTelecharger = _telechargerParDefaut,
  });

  final String rdvId;

  /// `stripe` | `campay` avant paiement (obligatoire) ; `null` après.
  final String? agregateur;
  final ExecuteurAuthentifie executer;
  final bool telechargeable;
  final bool compact;

  /// Injectable pour les tests ; instancié par défaut.
  final PaiementRepository? repository;
  final TelechargerFacture onTelecharger;

  @override
  State<FactureRdv> createState() => _FactureRdvState();
}

class _FactureRdvState extends State<FactureRdv> {
  late final PaiementRepository _repo =
      widget.repository ?? PaiementRepository();

  Facture? _facture;
  String? _erreur;
  bool _chargement = true;

  /// Numéro de la requête en cours : une réponse qui ne le porte plus est
  /// périmée (changement d'agrégateur entre-temps) et est ignorée.
  int _requete = 0;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  @override
  void didUpdateWidget(covariant FactureRdv ancien) {
    super.didUpdateWidget(ancien);
    if (ancien.rdvId != widget.rdvId ||
        ancien.agregateur != widget.agregateur) {
      _charger();
    }
  }

  Future<void> _charger() async {
    final numero = ++_requete;
    setState(() {
      _chargement = true;
      _erreur = null;
    });
    try {
      final facture = await widget.executer(
        (token) => _repo.obtenirFacture(
          rdvId: widget.rdvId,
          agregateur: widget.agregateur,
          token: token,
        ),
      );
      if (!mounted || numero != _requete) return;
      setState(() {
        _facture = facture;
        _chargement = false;
      });
    } catch (e) {
      if (!mounted || numero != _requete) return;
      setState(() {
        _facture = null;
        _chargement = false;
        _erreur = _messageLisible(e);
      });
    }
  }

  String _messageLisible(Object e) {
    final texte = '$e';
    if (texte.contains('SocketException') ||
        texte.contains('TimeoutException') ||
        texte.contains('ClientException')) {
      return 'Facture indisponible. Vérifiez votre réseau et réessayez.';
    }
    return texte.isEmpty ? 'Facture indisponible pour le moment.' : texte;
  }

  @override
  Widget build(BuildContext context) {
    if (_chargement) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: 10),
            Text('Chargement de la facture…', style: AppTextStyles.cardMeta),
          ],
        ),
      );
    }
    final facture = _facture;
    if (facture == null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _erreur ?? 'Facture indisponible pour le moment.',
              style: AppTextStyles.cardMeta.copyWith(color: AppColors.coral600),
            ),
            const SizedBox(height: 4),
            GestureDetector(
              onTap: _charger,
              child: Text(
                'Réessayer',
                style: AppTextStyles.cardMeta.copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w700,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
          ],
        ),
      );
    }
    return FactureRecapitulative(
      facture: facture,
      telechargeable: widget.telechargeable,
      compact: widget.compact,
      onTelecharger: widget.onTelecharger,
    );
  }
}

/// Ouvre la facture d'un RDV dans une boîte de dialogue (card + bouton
/// « Télécharger la facture »). Retourne quand le patient la ferme.
///
/// Utilisée après un paiement confirmé et pour consulter la facture d'un RDV
/// déjà payé. [agregateur] : à omettre pour un RDV payé.
Future<void> afficherFactureRdv(
  BuildContext context, {
  required String rdvId,
  required ExecuteurAuthentifie executer,
  String? agregateur,
  PaiementRepository? repository,
  String titre = 'Votre facture',
}) {
  return showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      title: Text(titre),
      content: SizedBox(
        width: double.maxFinite,
        child: SingleChildScrollView(
          child: FactureRdv(
            rdvId: rdvId,
            executer: executer,
            agregateur: agregateur,
            repository: repository,
            compact: true,
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('Fermer'),
        ),
      ],
    ),
  );
}