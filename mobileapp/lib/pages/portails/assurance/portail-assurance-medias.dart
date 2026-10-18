// lib/pages/portails/assurance/portail-assurance-medias.dart
//
// Portail assurance — « Multimédia » : photos et vidéos de la fiche. Le
// serveur applique les quotas de l'abonnement et décide de ce qui est
// visible du public ; l'ordre des photos compte (quand le quota baisse,
// seules les premières restent visibles, les autres sont conservées).
// Une vidéo s'ouvre dans le lecteur du téléphone (navigateur).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../components/stepper/aps_stepper.dart' show apsChoisirFichier, ApsFichierException;
import '../../../components/style/colors.dart';
import '../../../components/style/text_styles.dart';
import '../../../controllers/portail_assurance_controller.dart';
import '../../../models/portail_assurance_models.dart';
import 'portail_assurance_commun.dart';

class PortailAssuranceMedias extends ConsumerWidget {
  final VoidCallback onOuvrirAbonnement;

  const PortailAssuranceMedias({super.key, required this.onOuvrirAbonnement});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final medias = ref.watch(mediasAssuranceProvider);
    return Container(
      color: AppColors.paper,
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(mediasAssuranceProvider.future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
          children: [
            const EnTetePortail(
              titre: 'Multimédia',
              description: 'Les photos et vidéos qui présentent votre compagnie sur votre fiche publique.',
            ),
            medias.when(
              loading: () => const ChargementPortail(),
              error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(mediasAssuranceProvider)),
              data: (m) => Column(
                children: [
                  if (!m.fichePubliee)
                    const BandeauPortail(
                      icone: Icons.hourglass_top_outlined,
                      texte: "Votre fiche n'est pas encore publiée : vos médias apparaîtront au public après sa validation.",
                    ),
                  _Section(type: 'image', liste: m.images, quota: m.photos, onOuvrirAbonnement: onOuvrirAbonnement),
                  _Section(type: 'video', liste: m.videosListe, quota: m.videos, onOuvrirAbonnement: onOuvrirAbonnement),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Section extends ConsumerStatefulWidget {
  final String type;
  final List<MediaAssurance> liste;
  final Quota quota;
  final VoidCallback onOuvrirAbonnement;

  const _Section({required this.type, required this.liste, required this.quota, required this.onOuvrirAbonnement});

  @override
  ConsumerState<_Section> createState() => _SectionState();
}

class _SectionState extends ConsumerState<_Section> {
  bool _envoi = false;

  bool get _video => widget.type == 'video';

  Future<String?> _demanderTitre({String? initial}) async {
    final c = TextEditingController(text: initial ?? '');
    final r = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Légende'),
        content: TextField(
          controller: c,
          maxLength: 150,
          decoration: const InputDecoration(hintText: 'Facultatif', border: OutlineInputBorder()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(d, c.text.trim()), child: const Text('Valider')),
        ],
      ),
    );
    c.dispose();
    return r;
  }

  Future<void> _ajouter() async {
    try {
      final fichier = await apsChoisirFichier(
        extensions: _video ? const ['mp4', 'webm', 'mov'] : const ['jpg', 'jpeg', 'png', 'webp'],
        tailleMaxMo: _video ? 50 : 5,
      );
      if (fichier == null || !mounted) return;
      final titre = await _demanderTitre();
      if (titre == null || !mounted) return; // annulé
      final fiche = await ref.read(maFicheAssuranceProvider.future);
      setState(() => _envoi = true);
      await appelPortailUi(
        ref,
        (repo, token) => repo.ajouterMedia(fiche.id, token: token, octets: fichier.octets, nomFichier: fichier.nom, titre: titre),
      );
      if (mounted) snackPortail(context, _video ? 'Vidéo ajoutée.' : 'Photo ajoutée.');
      ref.invalidate(mediasAssuranceProvider);
    } on ApsFichierException catch (e) {
      if (mounted) snackPortail(context, e.message);
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Future<void> _deplacer(int index, int sens) async {
    final ids = widget.liste.map((m) => m.id).toList();
    final cible = index + sens;
    final tmp = ids[index];
    ids[index] = ids[cible];
    ids[cible] = tmp;
    try {
      final fiche = await ref.read(maFicheAssuranceProvider.future);
      await appelPortailUi(ref, (repo, token) => repo.ordonnerMedias(fiche.id, token: token, type: widget.type, ids: ids));
      ref.invalidate(mediasAssuranceProvider);
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    }
  }

  Future<void> _renommer(MediaAssurance m) async {
    final titre = await _demanderTitre(initial: m.titre);
    if (titre == null) return;
    try {
      await appelPortailUi(ref, (repo, token) => repo.modifierTitreMedia(m.id, titre.isEmpty ? null : titre, token: token));
      ref.invalidate(mediasAssuranceProvider);
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    }
  }

  Future<void> _supprimer(MediaAssurance m) async {
    if (!await confirmerPortail(context, 'Supprimer', 'Supprimer ${_video ? 'cette vidéo' : 'cette photo'} ? Cette action est définitive.',
        action: 'Supprimer')) {
      return;
    }
    try {
      await appelPortailUi(ref, (repo, token) => repo.supprimerMedia(m.id, token: token));
      ref.invalidate(mediasAssuranceProvider);
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = widget.quota;
    return CartePortail(
      titre: '${_video ? 'Vidéos' : 'Photos'} (${q.libelle})',
      icone: _video ? Icons.movie_outlined : Icons.photo_library_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!_video && widget.liste.length > 1)
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: Text("La première photo est mise en avant sur votre fiche. Les flèches changent l'ordre.",
                  style: AppTextStyles.cardMeta),
            ),
          if (widget.liste.isEmpty)
            VidePortail(icone: _video ? Icons.movie_outlined : Icons.photo_library_outlined, texte: _video ? 'Aucune vidéo.' : 'Aucune photo.')
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: widget.liste.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 0.82,
              ),
              itemBuilder: (_, i) => _CarteMedia(
                media: widget.liste[i],
                premier: i == 0,
                dernier: i == widget.liste.length - 1,
                onAvancer: () => _deplacer(i, -1),
                onReculer: () => _deplacer(i, 1),
                onRenommer: () => _renommer(widget.liste[i]),
                onSupprimer: () => _supprimer(widget.liste[i]),
              ),
            ),
          const SizedBox(height: 10),
          if (q.atteint)
            Row(
              children: [
                Expanded(
                  child: Text(
                    q.nonInclus
                        ? (_video
                            ? 'Les vidéos de présentation ne sont pas incluses dans votre abonnement.'
                            : 'Les photos ne sont pas incluses dans votre abonnement.')
                        : 'Vous avez atteint le maximum (${q.max}).',
                    style: AppTextStyles.cardMeta,
                  ),
                ),
                if (q.nonInclus) TextButton(onPressed: widget.onOuvrirAbonnement, child: const Text('Formules')),
              ],
            )
          else
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _envoi ? null : _ajouter,
                icon: _envoi
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.upload_outlined),
                label: Text(_envoi
                    ? (_video ? 'Envoi de la vidéo…' : 'Envoi…')
                    : (_video ? 'Ajouter une vidéo (50 Mo max)' : 'Ajouter une photo (5 Mo max)')),
              ),
            ),
        ],
      ),
    );
  }
}

class _CarteMedia extends StatelessWidget {
  final MediaAssurance media;
  final bool premier;
  final bool dernier;
  final VoidCallback onAvancer;
  final VoidCallback onReculer;
  final VoidCallback onRenommer;
  final VoidCallback onSupprimer;

  const _CarteMedia({
    required this.media,
    required this.premier,
    required this.dernier,
    required this.onAvancer,
    required this.onReculer,
    required this.onRenommer,
    required this.onSupprimer,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.line),
        color: AppColors.card,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: GestureDetector(
              onTap: media.url == null ? null : () => launchUrl(Uri.parse(media.url!), mode: LaunchMode.externalApplication),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Opacity(
                    opacity: media.visibleAuPublic ? 1 : 0.45,
                    child: media.vignetteUrl == null
                        ? const ColoredBox(color: AppColors.primarySurface)
                        : Image.network(media.vignetteUrl!, fit: BoxFit.cover,
                            errorBuilder: (_, _, _) => const ColoredBox(color: AppColors.primarySurface)),
                  ),
                  if (media.estVideo) const Center(child: Icon(Icons.play_circle_fill, size: 40, color: Colors.white)),
                  if (!media.visibleAuPublic)
                    Positioned(
                      top: 6,
                      left: 6,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(99)),
                        child: const Text('Masqué au public', style: TextStyle(fontSize: 10.5, color: AppColors.inkSoft)),
                      ),
                    ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
            child: Text(
              media.titre ?? 'Sans légende',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: media.titre == null ? AppColors.inkFaint : AppColors.ink),
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _Bouton(Icons.arrow_back, 'Avancer', premier ? null : onAvancer),
              _Bouton(Icons.arrow_forward, 'Reculer', dernier ? null : onReculer),
              _Bouton(Icons.edit_outlined, 'Légende', onRenommer),
              _Bouton(Icons.delete_outline, 'Supprimer', onSupprimer),
            ],
          ),
        ],
      ),
    );
  }
}

class _Bouton extends StatelessWidget {
  final IconData icone;
  final String aide;
  final VoidCallback? onTap;

  const _Bouton(this.icone, this.aide, this.onTap);

  @override
  Widget build(BuildContext context) => IconButton(
        tooltip: aide,
        visualDensity: VisualDensity.compact,
        iconSize: 18,
        onPressed: onTap,
        icon: Icon(icone),
      );
}
