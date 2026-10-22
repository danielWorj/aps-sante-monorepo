// lib/pages/portails/laboratoire/portail-laboratoire-medias.dart
//
// Portail laboratoire — « Multimédia » : photos et vidéos de la fiche
// (quotas fixes renvoyés par le serveur). La première photo est mise en
// avant ; l'ordre se change avec les flèches. Une vidéo s'ouvre dans le
// lecteur du téléphone.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../components/stepper/aps_stepper.dart' show apsChoisirFichier, ApsFichierException;
import '../../../components/style/colors.dart';
import '../../../components/style/text_styles.dart';
import '../../../controllers/laboratoire_controller.dart';
import '../../../models/laboratoire_models.dart';
import '../../../repositories/laboratoire_repository.dart' show FichierLaboratoire;
import 'portail_laboratoire_commun.dart';

class PortailLaboratoireMedias extends ConsumerWidget {
  const PortailLaboratoireMedias({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final medias = ref.watch(mediasLaboratoireProvider);
    return Container(
      color: AppColors.paper,
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(mediasLaboratoireProvider.future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
          children: [
            const EnTetePortail(titre: 'Multimédia', description: 'Les photos et vidéos qui présentent votre laboratoire.'),
            medias.when(
              loading: () => const ChargementPortail(),
              error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(mediasLaboratoireProvider)),
              data: (m) => Column(children: [
                if (!m.fichePubliee)
                  const BandeauPortail(
                    icone: Icons.hourglass_top_outlined,
                    texte: "Votre fiche n'est pas encore publiée : vos médias apparaîtront au public après sa validation.",
                  ),
                _Section(type: 'image', liste: m.images, quota: m.photos),
                _Section(type: 'video', liste: m.videosListe, quota: m.videos),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}

class _Section extends ConsumerStatefulWidget {
  const _Section({required this.type, required this.liste, required this.quota});

  final String type;
  final List<MediaLaboratoire> liste;
  final QuotaMedia quota;

  @override
  ConsumerState<_Section> createState() => _SectionState();
}

class _SectionState extends ConsumerState<_Section> {
  bool _envoi = false;

  bool get _video => widget.type == 'video';

  Future<String> _laboId() async => (await ref.read(monLaboratoireProvider.future)).id;

  void _rafraichir() {
    ref.invalidate(mediasLaboratoireProvider);
    ref.invalidate(tableauDeBordLaboratoireProvider);
  }

  Future<void> _ajouter() async {
    try {
      final fichier = await apsChoisirFichier(
        extensions: _video ? const ['mp4', 'webm', 'mov'] : const ['jpg', 'jpeg', 'png', 'webp'],
        tailleMaxMo: _video ? 50 : 5,
      );
      if (fichier == null || !mounted) return;
      setState(() => _envoi = true);
      final id = await _laboId();
      await appelLaboratoireUi(ref, (repo, token) => repo.ajouterMedia(id, token: token, fichier: FichierLaboratoire(fichier.octets, fichier.nom)));
      _rafraichir();
      if (mounted) snackPortail(context, _video ? 'Vidéo ajoutée.' : 'Photo ajoutée.');
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
      final id = await _laboId();
      await appelLaboratoireUi(ref, (repo, token) => repo.ordonnerMedias(id, token: token, type: widget.type, ids: ids));
      _rafraichir();
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    }
  }

  Future<void> _legende(MediaLaboratoire m) async {
    final ctrl = TextEditingController(text: m.titre ?? '');
    final titre = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Légende'),
        content: TextField(controller: ctrl, maxLength: 150, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(c, ctrl.text.trim()), child: const Text('Enregistrer')),
        ],
      ),
    );
    ctrl.dispose();
    if (titre == null) return;
    try {
      await appelLaboratoireUi(ref, (repo, token) => repo.modifierTitreMedia(m.id, titre.isEmpty ? null : titre, token: token));
      _rafraichir();
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    }
  }

  Future<void> _supprimer(MediaLaboratoire m) async {
    if (!await confirmerPortail(context, _video ? 'Supprimer la vidéo' : 'Supprimer la photo', 'Ce média sera supprimé définitivement.', action: 'Supprimer')) {
      return;
    }
    try {
      await appelLaboratoireUi(ref, (repo, token) => repo.supprimerMedia(m.id, token: token));
      _rafraichir();
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = widget.quota;
    return CartePortail(
      titre: '${_video ? 'Vidéos' : 'Photos'} (${q.utilise} / ${q.max})',
      icone: _video ? Icons.movie_outlined : Icons.photo_library_outlined,
      action: q.plein
          ? null
          : TextButton.icon(
              onPressed: _envoi ? null : _ajouter,
              icon: _envoi
                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.add_rounded, size: 18),
              label: Text(_envoi ? 'Envoi…' : 'Ajouter'),
            ),
      child: widget.liste.isEmpty
          ? VidePortail(
              icone: _video ? Icons.movie_outlined : Icons.photo_library_outlined,
              texte: _video ? 'Aucune vidéo (MP4, WEBM, MOV — 50 Mo).' : 'Aucune photo (JPEG, PNG, WEBP — 5 Mo). Montrez votre accueil et vos équipements.',
            )
          : Column(children: [
              if (q.plein) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text('Maximum atteint (${q.max}).', style: AppTextStyles.cardMeta)),
              for (var i = 0; i < widget.liste.length; i++)
                _CarteMedia(
                  media: widget.liste[i],
                  premier: i == 0,
                  dernier: i == widget.liste.length - 1,
                  onAvancer: () => _deplacer(i, -1),
                  onReculer: () => _deplacer(i, 1),
                  onLegende: () => _legende(widget.liste[i]),
                  onSupprimer: () => _supprimer(widget.liste[i]),
                ),
            ]),
    );
  }
}

class _CarteMedia extends StatelessWidget {
  const _CarteMedia({
    required this.media,
    required this.premier,
    required this.dernier,
    required this.onAvancer,
    required this.onReculer,
    required this.onLegende,
    required this.onSupprimer,
  });

  final MediaLaboratoire media;
  final bool premier;
  final bool dernier;
  final VoidCallback onAvancer;
  final VoidCallback onReculer;
  final VoidCallback onLegende;
  final VoidCallback onSupprimer;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(children: [
        InkWell(
          onTap: () => launchUrl(Uri.parse(media.url), mode: LaunchMode.externalApplication),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: 72,
              height: 54,
              child: Stack(fit: StackFit.expand, children: [
                media.vignetteUrl == null
                    ? Container(color: AppColors.segment)
                    : Image.network(media.vignetteUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => Container(color: AppColors.segment)),
                if (media.estVideo) const Center(child: Icon(Icons.play_circle_fill_rounded, color: Colors.white)),
              ]),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(media.titre ?? 'Sans légende', maxLines: 2, overflow: TextOverflow.ellipsis,
              style: media.titre == null ? AppTextStyles.cardMeta : AppTextStyles.body),
        ),
        IconButton(onPressed: premier ? null : onAvancer, icon: const Icon(Icons.arrow_upward_rounded, size: 18), tooltip: 'Avancer'),
        IconButton(onPressed: dernier ? null : onReculer, icon: const Icon(Icons.arrow_downward_rounded, size: 18), tooltip: 'Reculer'),
        PopupMenuButton<String>(
          icon: const Icon(Icons.more_vert_rounded, color: AppColors.inkFaint),
          onSelected: (c) => c == 'legende' ? onLegende() : onSupprimer(),
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'legende', child: Text('Modifier la légende')),
            PopupMenuItem(value: 'supprimer', child: Text('Supprimer')),
          ],
        ),
      ]),
    );
  }
}
