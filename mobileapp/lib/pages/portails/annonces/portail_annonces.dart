// lib/pages/portails/annonces/portail_annonces.dart
//
// « Annonces » — liste des annonces reçues, commune à tous les portails
// (ouverte depuis la cloche, ou l'en-tête des espaces sans cloche).
// « En cours » = ni désactivées ni expirées ; « Toutes » ajoute les
// expirées. Ouvrir la page marque les annonces comme vues ; l'étiquette
// « Nouveau » reste affichée pendant la visite.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../components/components.dart';
import '../../../components/reputation/reputation_ui.dart' show jourMoisAnnee;
import '../../../controllers/annonce_controller.dart';
import '../../../models/annonce_models.dart';

/// Ouvre la page des annonces par-dessus l'écran courant.
void ouvrirAnnonces(BuildContext context) {
  Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const PortailAnnonces()));
}

/// Bouton d'en-tête des espaces sans cloche (pharmacie, structure…) :
/// point rouge tant qu'il reste des annonces nouvelles.
class BoutonAnnonces extends ConsumerWidget {
  const BoutonAnnonces({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nouvelles = ref.watch(annoncesNonLuesProvider);
    return ApsIconButton(
      icon: Icons.campaign_outlined,
      dot: nouvelles > 0,
      tooltip: nouvelles > 0 ? 'Annonces ($nouvelles nouvelles)' : 'Annonces',
      onPressed: () => ouvrirAnnonces(context),
    );
  }
}

class PortailAnnonces extends ConsumerStatefulWidget {
  const PortailAnnonces({super.key});

  @override
  ConsumerState<PortailAnnonces> createState() => _PortailAnnoncesState();
}

class _PortailAnnoncesState extends ConsumerState<PortailAnnonces> {
  bool _toutes = false;

  /// Dernière visite figée à l'ouverture.
  DateTime? _depuis;
  bool _marquees = false;

  @override
  void initState() {
    super.initState();
    _depuis = ref.read(derniereVisiteAnnoncesProvider).value;
  }

  void _marquerVues() {
    if (_marquees) return;
    _marquees = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(derniereVisiteAnnoncesProvider.notifier).marquerVues();
      ref.invalidate(annoncesEnCoursProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final etat = ref.watch(annoncesRecuesProvider);
    if (etat.hasValue) _marquerVues();

    final annonces = (etat.value ?? const <Annonce>[]).where((a) => _toutes || !a.expiree).toList();

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.b7,
          onRefresh: () => ref.refresh(annoncesRecuesProvider.future),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 32),
            children: [
              const ApsTopBar(title: 'Annonces', overline: 'APS Santé'),
              ApsSegmented<bool>(
                compact: true,
                value: _toutes,
                onChanged: (v) => setState(() => _toutes = v),
                segments: const [ApsSegment(false, 'En cours'), ApsSegment(true, 'Toutes')],
              ),
              const SizedBox(height: 14),
              if (!etat.hasValue && etat.hasError)
                ApsEmptyState(
                  icon: Icons.wifi_off_rounded,
                  tone: ApsTone.neutral,
                  title: 'Annonces indisponibles',
                  message: '${etat.error}',
                  actionLabel: 'Réessayer',
                  onAction: () => ref.invalidate(annoncesRecuesProvider),
                )
              else if (!etat.hasValue)
                const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))
              else if (annonces.isEmpty)
                ApsEmptyState(
                  icon: Icons.campaign_outlined,
                  tone: ApsTone.neutral,
                  title: 'Aucune annonce',
                  message: _toutes
                      ? 'Les annonces publiées par APS Santé apparaîtront ici.'
                      : 'Aucune annonce en cours pour le moment.',
                )
              else
                for (final a in annonces) ...[
                  _CarteAnnonce(
                    annonce: a,
                    nouvelle: !a.expiree && annonceNouvelle(a, _depuis),
                    onTap: () => _ouvrirDetail(context, a),
                  ),
                  const SizedBox(height: 10),
                ],
            ],
          ),
        ),
      ),
    );
  }

  void _ouvrirDetail(BuildContext context, Annonce a) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (_) => _DetailAnnonce(annonce: a),
    );
  }
}

class _Visuel extends StatelessWidget {
  final Annonce annonce;
  final double largeur;
  final double hauteur;

  const _Visuel({required this.annonce, required this.largeur, required this.hauteur});

  @override
  Widget build(BuildContext context) {
    final repli = Center(
      child: Icon(
        annonce.estPdf ? Icons.picture_as_pdf_outlined : Icons.campaign_outlined,
        color: AppColors.b7,
        size: 26,
      ),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: largeur,
        height: hauteur,
        color: AppColors.b0,
        child: annonce.aImage
            ? Image.network(annonce.fichierUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => repli)
            : repli,
      ),
    );
  }
}

class _CarteAnnonce extends StatelessWidget {
  final Annonce annonce;
  final bool nouvelle;
  final VoidCallback onTap;

  const _CarteAnnonce({required this.annonce, required this.nouvelle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: annonce.expiree ? 0.6 : 1,
      child: ApsCard(
        flat: true,
        radius: 10,
        padding: const EdgeInsets.all(12),
        onTap: onTap,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Visuel(annonce: annonce, largeur: 72, hauteur: 72),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    annonce.libelle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTextStyles.strong.copyWith(fontSize: 14),
                  ),
                  const SizedBox(height: 3),
                  Text('Publiée le ${jourMoisAnnee(annonce.dateCreation)}', style: AppTextStyles.xs),
                  if (annonce.apercu != null) ...[
                    const SizedBox(height: 5),
                    Text(
                      annonce.apercu!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTextStyles.small.copyWith(fontSize: 12),
                    ),
                  ],
                  if (nouvelle || annonce.expiree) ...[
                    const SizedBox(height: 7),
                    nouvelle
                        ? const ApsPill('Nouveau', tone: ApsTone.green)
                        : const ApsPill('Expirée', tone: ApsTone.neutral),
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

class _DetailAnnonce extends StatelessWidget {
  final Annonce annonce;

  const _DetailAnnonce({required this.annonce});

  Future<void> _ouvrirFichier(BuildContext context) async {
    final ok = await launchUrl(Uri.parse(annonce.fichierUrl!), mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Impossible d'ouvrir le fichier.")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final hauteurMax = MediaQuery.of(context).size.height * 0.85;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: hauteurMax),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              ApsSheetHeader(title: 'Annonce', onClose: () => Navigator.of(context).pop()),
              if (annonce.aImage) ...[
                LayoutBuilder(
                  builder: (_, c) => _Visuel(annonce: annonce, largeur: c.maxWidth, hauteur: c.maxWidth * 9 / 16),
                ),
                const SizedBox(height: 14),
              ],
              Text(annonce.libelle, style: AppTextStyles.strong.copyWith(fontSize: 17)),
              const SizedBox(height: 4),
              Text(
                annonce.expiree
                    ? 'Publiée le ${jourMoisAnnee(annonce.dateCreation)} · expirée'
                    : 'Publiée le ${jourMoisAnnee(annonce.dateCreation)} · jusqu\'au ${jourMoisAnnee(annonce.dateFin)}',
                style: AppTextStyles.xs,
              ),
              if (annonce.description ?? annonce.courteDescription case final texte?) ...[
                const SizedBox(height: 12),
                Text(texte, style: AppTextStyles.small.copyWith(fontSize: 13.5, height: 1.55, color: AppColors.ink)),
              ],
              if (annonce.fichierUrl != null) ...[
                const SizedBox(height: 16),
                ApsButton(
                  label: annonce.estPdf ? 'Ouvrir le PDF' : "Ouvrir l'image",
                  icon: annonce.estPdf ? Icons.picture_as_pdf_outlined : Icons.open_in_new_rounded,
                  variant: ApsButtonVariant.ghost,
                  onPressed: () => _ouvrirFichier(context),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
