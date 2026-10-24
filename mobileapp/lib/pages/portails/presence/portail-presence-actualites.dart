// lib/pages/portails/presence/portail-presence-actualites.dart
//
// Espaces pharmacie et centre de santé — « Actualités » : informations
// pratiques publiées sur la fiche (fermeture exceptionnelle, campagne de
// vaccination, nouveau service…), avec brouillon, publication programmée,
// date de fin et illustration facultative. Visibles du public avec un
// abonnement qui inclut les contenus enrichis. Jamais de promotion.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/espace_presence_controller.dart';
import '../../../models/espace_presence_models.dart';
import '../../../repositories/espace_presence_repository.dart' show FichierPresence;
import 'presence_commun.dart';

class PortailPresenceActualites extends ConsumerWidget {
  const PortailPresenceActualites({super.key, required this.type});

  final TypeEspacePresence type;

  Future<void> _editer(BuildContext context, WidgetRef ref, ActualitePresence? actualite) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _FormulaireActualite(type: type, actualite: actualite),
    );
    if (ok == true) {
      ref.invalidate(actualitesPresenceProvider(type));
      ref.invalidate(tableauDeBordPresenceProvider);
    }
  }

  Future<void> _supprimer(BuildContext context, WidgetRef ref, ActualitePresence a) async {
    if (!await confirmerPortail(context, "Supprimer l'actualité", '« ${a.titre} » sera supprimée définitivement.', action: 'Supprimer')) return;
    try {
      await appelPresenceUi(ref, (repo, token) => repo.supprimerActualite(a.id, token: token));
      ref.invalidate(actualitesPresenceProvider(type));
      ref.invalidate(tableauDeBordPresenceProvider);
    } catch (e) {
      if (context.mounted) snackPortail(context, messageErreur(e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actualites = ref.watch(actualitesPresenceProvider(type));
    return PagePresence(
      titre: 'Actualités',
      description: 'Les informations pratiques à communiquer à vos patients. Informations factuelles uniquement : aucune promotion commerciale.',
      onRafraichir: () => ref.refresh(actualitesPresenceProvider(type).future),
      action: IconButton(onPressed: () => _editer(context, ref, null), icon: const Icon(Icons.add_rounded), tooltip: 'Nouvelle actualité'),
      children: [
        actualites.when(
          loading: () => const ChargementPortail(),
          error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(actualitesPresenceProvider(type))),
          data: (d) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              BandeauMasque(
                visible: d.visiblesPublic,
                texte: "Vos actualités sont enregistrées mais masquées au public : votre abonnement n'inclut pas les contenus enrichis.",
              ),
              if (d.actualites.isEmpty)
                const VidePortail(icone: Icons.newspaper_outlined, texte: 'Aucune actualité. Touchez + pour en publier une.')
              else
                for (final a in d.actualites)
                  CartePortail(
                    titre: a.titre,
                    icone: Icons.newspaper_outlined,
                    action: PopupMenuButton<String>(
                      icon: const Icon(Icons.more_vert_rounded, color: AppColors.inkFaint),
                      onSelected: (c) => c == 'modifier' ? _editer(context, ref, a) : _supprimer(context, ref, a),
                      itemBuilder: (_) => const [
                        PopupMenuItem(value: 'modifier', child: Text('Modifier')),
                        PopupMenuItem(value: 'supprimer', child: Text('Supprimer')),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ApsPill(a.libelleStatut, tone: a.statut == 'en_ligne' ? ApsTone.green : (a.statut == 'programmee' ? ApsTone.amber : ApsTone.neutral)),
                        const SizedBox(height: 6),
                        Text(a.contenu, maxLines: 4, overflow: TextOverflow.ellipsis, style: AppTextStyles.body),
                        const SizedBox(height: 4),
                        Text(
                          'Publication : ${dateCourtePortail(a.datePublication)}'
                          '${a.dateExpiration == null ? '' : ' · retrait : ${dateCourtePortail(a.dateExpiration)}'}',
                          style: AppTextStyles.cardMeta,
                        ),
                      ],
                    ),
                  ),
            ],
          ),
        ),
      ],
    );
  }
}

class _FormulaireActualite extends ConsumerStatefulWidget {
  const _FormulaireActualite({required this.type, this.actualite});

  final TypeEspacePresence type;
  final ActualitePresence? actualite;

  @override
  ConsumerState<_FormulaireActualite> createState() => _FormulaireActualiteState();
}

class _FormulaireActualiteState extends ConsumerState<_FormulaireActualite> {
  final _form = GlobalKey<FormState>();
  late final _titre = TextEditingController(text: widget.actualite?.titre ?? '');
  late final _contenu = TextEditingController(text: widget.actualite?.contenu ?? '');
  late bool _publiee = widget.actualite?.publiee ?? true;
  late DateTime? _publication = widget.actualite?.datePublication;
  late DateTime? _expiration = widget.actualite?.dateExpiration;
  ApsFichier? _image;
  bool _retirerImage = false;
  bool _envoi = false;

  @override
  void dispose() {
    _titre.dispose();
    _contenu.dispose();
    super.dispose();
  }

  Future<DateTime?> _choisirDate(DateTime? initiale) async {
    final maintenant = DateTime.now();
    final jour = await showDatePicker(
      context: context,
      initialDate: initiale?.toLocal() ?? maintenant,
      firstDate: maintenant.subtract(const Duration(days: 365)),
      lastDate: maintenant.add(const Duration(days: 730)),
    );
    if (jour == null || !mounted) return null;
    final heure = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initiale?.toLocal() ?? maintenant),
      builder: (c, child) => MediaQuery(data: MediaQuery.of(c).copyWith(alwaysUse24HourFormat: true), child: child!),
    );
    if (heure == null) return null;
    return DateTime(jour.year, jour.month, jour.day, heure.hour, heure.minute);
  }

  Future<void> _choisirImage() async {
    try {
      final f = await apsChoisirFichier(extensions: const ['jpg', 'jpeg', 'png', 'webp'], tailleMaxMo: 5);
      if (f != null && mounted) setState(() => _image = f);
    } on ApsFichierException catch (e) {
      if (mounted) snackPortail(context, e.message);
    }
  }

  Future<void> _enregistrer() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    if (_expiration != null && !_expiration!.isAfter(_publication ?? DateTime.now())) {
      return snackPortail(context, 'La date de retrait doit suivre la date de publication.');
    }
    setState(() => _envoi = true);
    final image = _image;
    try {
      final fiche = await ref.read(maFichePresenceProvider(widget.type).future);
      await appelPresenceUi(ref, (repo, token) => repo.enregistrerActualite(
            widget.type,
            fiche.id,
            token: token,
            actualiteId: widget.actualite?.id,
            champs: {
              'titre': _titre.text.trim(),
              'contenu': _contenu.text.trim(),
              'publiee': '$_publiee',
              if (_publication != null) 'date_publication': _publication!.toUtc().toIso8601String(),
              'date_expiration': _expiration?.toUtc().toIso8601String() ?? '',
            },
            image: image == null ? null : FichierPresence(image.octets, image.nom),
            supprimerImage: _retirerImage && image == null,
          ));
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  String _date(DateTime? d, String vide) => d == null ? vide : '${dateCourtePortail(d)} ${dateHeurePresence(d).split(' ').last}';

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Form(
          key: _form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(widget.actualite == null ? 'Nouvelle actualité' : "Modifier l'actualité", style: AppTextStyles.h3),
              const SizedBox(height: 12),
              TextFormField(
                controller: _titre,
                maxLength: 150,
                decoration: const InputDecoration(labelText: 'Titre *', hintText: 'Ex. Fermeture exceptionnelle le 1er novembre'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Champ requis' : null,
              ),
              TextFormField(
                controller: _contenu,
                maxLength: 3000,
                minLines: 4,
                maxLines: 8,
                decoration: const InputDecoration(labelText: 'Texte *'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Champ requis' : null,
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event_outlined),
                title: const Text('Publication'),
                subtitle: Text(_date(_publication, 'Maintenant')),
                trailing: _publication == null ? null : IconButton(onPressed: () => setState(() => _publication = null), icon: const Icon(Icons.close_rounded)),
                onTap: () async {
                  final d = await _choisirDate(_publication);
                  if (d != null) setState(() => _publication = d);
                },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event_busy_outlined),
                title: const Text('Retirer de la fiche le'),
                subtitle: Text(_date(_expiration, 'Jamais (facultatif)')),
                trailing: _expiration == null ? null : IconButton(onPressed: () => setState(() => _expiration = null), icon: const Icon(Icons.close_rounded)),
                onTap: () async {
                  final d = await _choisirDate(_expiration);
                  if (d != null) setState(() => _expiration = d);
                },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.image_outlined),
                title: const Text('Illustration (facultatif)'),
                subtitle: Text(_image != null
                    ? _image!.nom
                    : (widget.actualite?.imageUrl != null && !_retirerImage ? 'Illustration actuelle conservée' : 'Aucune')),
                trailing: widget.actualite?.imageUrl != null && _image == null
                    ? TextButton(onPressed: () => setState(() => _retirerImage = !_retirerImage), child: Text(_retirerImage ? 'Garder' : 'Retirer'))
                    : null,
                onTap: _choisirImage,
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _publiee,
                onChanged: (v) => setState(() => _publiee = v),
                title: Text(_publiee ? 'Publiée' : 'Brouillon (visible de vous seul)'),
              ),
              const SizedBox(height: 8),
              ApsButton(label: 'Enregistrer', icon: Icons.check_rounded, loading: _envoi, onPressed: _envoi ? null : _enregistrer),
            ],
          ),
        ),
      ),
    );
  }
}
