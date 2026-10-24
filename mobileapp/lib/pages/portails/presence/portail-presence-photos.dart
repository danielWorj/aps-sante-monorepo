// lib/pages/portails/presence/portail-presence-photos.dart
//
// Espaces pharmacie et centre de santé — « Photos » : galerie de la fiche.
// Toutes les photos sont conservées ; le public voit les premières, dans la
// limite de l'abonnement (droit « photos » et nombre maximal du niveau).
// La première photo est mise en avant ; l'ordre se change avec les flèches.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../components/components.dart';
import '../../../controllers/espace_presence_controller.dart';
import '../../../models/espace_presence_models.dart';
import '../../../repositories/espace_presence_repository.dart' show FichierPresence;
import 'presence_commun.dart';

class PortailPresencePhotos extends ConsumerStatefulWidget {
  const PortailPresencePhotos({super.key, required this.type});

  final TypeEspacePresence type;

  @override
  ConsumerState<PortailPresencePhotos> createState() => _PortailPresencePhotosState();
}

class _PortailPresencePhotosState extends ConsumerState<PortailPresencePhotos> {
  bool _envoi = false;

  TypeEspacePresence get _type => widget.type;

  Future<String> _ficheId() async => (await ref.read(maFichePresenceProvider(_type).future)).id;

  void _rafraichir() {
    ref.invalidate(photosPresenceProvider(_type));
    ref.invalidate(tableauDeBordPresenceProvider);
  }

  Future<void> _ajouter() async {
    try {
      final fichier = await apsChoisirFichier(extensions: const ['jpg', 'jpeg', 'png', 'webp'], tailleMaxMo: 5);
      if (fichier == null || !mounted) return;
      setState(() => _envoi = true);
      final id = await _ficheId();
      await appelPresenceUi(ref, (repo, token) => repo.ajouterPhoto(_type, id, token: token, fichier: FichierPresence(fichier.octets, fichier.nom)));
      _rafraichir();
      if (mounted) snackPortail(context, 'Photo ajoutée.');
    } on ApsFichierException catch (e) {
      if (mounted) snackPortail(context, e.message);
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Future<void> _deplacer(List<PhotoPresence> liste, int index, int sens) async {
    final ids = liste.map((p) => p.id).toList();
    final tmp = ids[index];
    ids[index] = ids[index + sens];
    ids[index + sens] = tmp;
    try {
      final id = await _ficheId();
      await appelPresenceUi(ref, (repo, token) => repo.ordonnerPhotos(_type, id, token: token, ids: ids));
      _rafraichir();
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    }
  }

  Future<void> _legende(PhotoPresence p) async {
    final ctrl = TextEditingController(text: p.titre ?? '');
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
      await appelPresenceUi(ref, (repo, token) => repo.legendePhoto(p.id, titre.isEmpty ? null : titre, token: token));
      _rafraichir();
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    }
  }

  Future<void> _supprimer(PhotoPresence p) async {
    if (!await confirmerPortail(context, 'Supprimer la photo', 'Cette photo sera supprimée définitivement.', action: 'Supprimer')) return;
    try {
      await appelPresenceUi(ref, (repo, token) => repo.supprimerPhoto(p.id, token: token));
      _rafraichir();
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final photos = ref.watch(photosPresenceProvider(_type));
    return PagePresence(
      titre: 'Photos',
      description: 'Les photos de votre établissement présentées sur votre fiche publique.',
      onRafraichir: () => ref.refresh(photosPresenceProvider(_type).future),
      children: [
        photos.when(
          loading: () => const ChargementPortail(),
          error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(photosPresenceProvider(_type))),
          data: (d) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              BandeauMasque(visible: d.droitPhotos, texte: "Vos photos sont conservées mais masquées au public : votre abonnement n'inclut pas les photos."),
              if (d.droitPhotos && d.maxPublic != null)
                BandeauPortail(icone: Icons.info_outline_rounded, texte: 'Votre abonnement affiche les ${d.maxPublic} premières photos ; les suivantes sont conservées.'),
              CartePortail(
                titre: 'Galerie (${d.utilise} / ${d.max})',
                icone: Icons.photo_library_outlined,
                action: d.plein
                    ? null
                    : TextButton.icon(
                        onPressed: _envoi ? null : _ajouter,
                        icon: _envoi
                            ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.add_rounded, size: 18),
                        label: Text(_envoi ? 'Envoi…' : 'Ajouter'),
                      ),
                child: d.photos.isEmpty
                    ? const VidePortail(
                        icone: Icons.photo_library_outlined,
                        texte: 'Aucune photo (JPEG, PNG, WEBP — 5 Mo). Montrez votre façade, votre accueil, vos équipements.',
                      )
                    : Column(children: [
                        for (var i = 0; i < d.photos.length; i++)
                          _LignePhoto(
                            photo: d.photos[i],
                            premier: i == 0,
                            dernier: i == d.photos.length - 1,
                            onAvancer: () => _deplacer(d.photos, i, -1),
                            onReculer: () => _deplacer(d.photos, i, 1),
                            onLegende: () => _legende(d.photos[i]),
                            onSupprimer: () => _supprimer(d.photos[i]),
                          ),
                      ]),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _LignePhoto extends StatelessWidget {
  const _LignePhoto({
    required this.photo,
    required this.premier,
    required this.dernier,
    required this.onAvancer,
    required this.onReculer,
    required this.onLegende,
    required this.onSupprimer,
  });

  final PhotoPresence photo;
  final bool premier;
  final bool dernier;
  final VoidCallback onAvancer;
  final VoidCallback onReculer;
  final VoidCallback onLegende;
  final VoidCallback onSupprimer;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(children: [
          InkWell(
            onTap: () => launchUrl(Uri.parse(photo.url), mode: LaunchMode.externalApplication),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                width: 72,
                height: 54,
                child: Image.network(photo.url, fit: BoxFit.cover, errorBuilder: (_, _, _) => Container(color: AppColors.segment)),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(photo.titre ?? 'Sans légende', maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: photo.titre == null ? AppTextStyles.cardMeta : AppTextStyles.body),
              Text(photo.visiblePublic ? 'Visible du public' : 'Masquée au public',
                  style: AppTextStyles.cardMeta.copyWith(color: photo.visiblePublic ? AppColors.success : AppColors.inkFaint)),
            ]),
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
