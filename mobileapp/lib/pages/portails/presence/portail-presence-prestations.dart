// lib/pages/portails/presence/portail-presence-prestations.dart
//
// Espace centre de santé — « Prestations » : consultations, actes et examens
// réalisés par la structure (onglet « Examens » de la fiche publique), avec
// catégorie, prix indicatif (vide = sur demande), description et
// disponibilité. Visibles du public avec un abonnement qui inclut les
// contenus enrichis ; une prestation indisponible n'apparaît plus.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/espace_presence_controller.dart';
import '../../../models/espace_presence_models.dart';
import 'presence_commun.dart';

class PortailPresencePrestations extends ConsumerWidget {
  const PortailPresencePrestations({super.key});

  void _rafraichir(WidgetRef ref) {
    ref.invalidate(prestationsPresenceProvider);
    ref.invalidate(tableauDeBordPresenceProvider);
  }

  Future<void> _editer(BuildContext context, WidgetRef ref, PrestationsGestion d, PrestationStructure? p) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _FormulairePrestation(prestation: p, devise: d.devise),
    );
    if (ok == true) _rafraichir(ref);
  }

  Future<void> _basculer(BuildContext context, WidgetRef ref, PrestationStructure p) async {
    try {
      final fiche = await ref.read(maFichePresenceProvider(TypeEspacePresence.structure).future);
      await appelPresenceUi(ref, (repo, token) => repo.enregistrerPrestation(
            token: token,
            structureId: fiche.id,
            prestationId: p.id,
            donnees: {'disponible': !p.disponible},
          ));
      _rafraichir(ref);
    } catch (e) {
      if (context.mounted) snackPortail(context, messageErreur(e));
    }
  }

  Future<void> _supprimer(BuildContext context, WidgetRef ref, PrestationStructure p) async {
    if (!await confirmerPortail(context, 'Supprimer la prestation', '« ${p.nom} » sera retirée définitivement.', action: 'Supprimer')) return;
    try {
      await appelPresenceUi(ref, (repo, token) => repo.supprimerPrestation(p.id, token: token));
      _rafraichir(ref);
    } catch (e) {
      if (context.mounted) snackPortail(context, messageErreur(e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prestations = ref.watch(prestationsPresenceProvider);
    final d = prestations.value;
    return PagePresence(
      titre: 'Prestations',
      description: 'Les consultations, actes et examens réalisés dans votre structure, avec leurs tarifs indicatifs.',
      onRafraichir: () => ref.refresh(prestationsPresenceProvider.future),
      action: d == null || d.prestations.length >= d.max
          ? null
          : IconButton(onPressed: () => _editer(context, ref, d, null), icon: const Icon(Icons.add_rounded), tooltip: 'Ajouter une prestation'),
      children: [
        prestations.when(
          loading: () => const ChargementPortail(),
          error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(prestationsPresenceProvider)),
          data: (d) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              BandeauMasque(
                visible: d.visiblesPublic,
                texte: "Vos prestations sont enregistrées mais masquées au public : votre abonnement n'inclut pas les contenus enrichis.",
              ),
              if (d.prestations.isEmpty)
                const VidePortail(icone: Icons.receipt_long_outlined, texte: 'Aucune prestation. Touchez + pour ajouter vos consultations et examens.')
              else
                for (final p in d.prestations)
                  Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.line)),
                    child: ListTile(
                      title: Text(p.nom, style: AppTextStyles.cardTitle.copyWith(color: p.disponible ? AppColors.ink : AppColors.inkFaint)),
                      subtitle: Text(
                        [
                          if (p.categorie != null) p.categorie!,
                          formaterPrixPrestation(p.prix, d.devise),
                          if (!p.disponible) 'Indisponible',
                        ].join(' · '),
                        style: AppTextStyles.cardMeta,
                      ),
                      trailing: PopupMenuButton<String>(
                        icon: const Icon(Icons.more_vert_rounded, color: AppColors.inkFaint),
                        onSelected: (c) => switch (c) {
                          'modifier' => _editer(context, ref, d, p),
                          'basculer' => _basculer(context, ref, p),
                          _ => _supprimer(context, ref, p),
                        },
                        itemBuilder: (_) => [
                          const PopupMenuItem(value: 'modifier', child: Text('Modifier')),
                          PopupMenuItem(value: 'basculer', child: Text(p.disponible ? 'Marquer indisponible' : 'Marquer disponible')),
                          const PopupMenuItem(value: 'supprimer', child: Text('Supprimer')),
                        ],
                      ),
                    ),
                  ),
              const SizedBox(height: 8),
              Text('Tarifs indicatifs, à confirmer par le patient auprès de vous avant tout déplacement.', style: AppTextStyles.cardMeta),
            ],
          ),
        ),
      ],
    );
  }
}

class _FormulairePrestation extends ConsumerStatefulWidget {
  const _FormulairePrestation({this.prestation, this.devise});

  final PrestationStructure? prestation;
  final String? devise;

  @override
  ConsumerState<_FormulairePrestation> createState() => _FormulairePrestationState();
}

class _FormulairePrestationState extends ConsumerState<_FormulairePrestation> {
  final _form = GlobalKey<FormState>();
  late final PrestationStructure? p = widget.prestation;
  late final _nom = TextEditingController(text: p?.nom ?? '');
  late final _categorie = TextEditingController(text: p?.categorie ?? '');
  late final _prix = TextEditingController(text: p?.prix == null ? '' : formaterPrixPrestation(p!.prix, null).replaceAll(' ', ''));
  late final _description = TextEditingController(text: p?.description ?? '');
  late bool _disponible = p?.disponible ?? true;
  bool _envoi = false;

  @override
  void dispose() {
    for (final c in [_nom, _categorie, _prix, _description]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _enregistrer() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    final prixTexte = _prix.text.trim().replaceAll(' ', '').replaceAll(',', '.');
    final prix = prixTexte.isEmpty ? null : double.tryParse(prixTexte);
    if (prixTexte.isNotEmpty && (prix == null || prix < 0)) return snackPortail(context, 'Prix invalide.');
    setState(() => _envoi = true);
    try {
      final fiche = await ref.read(maFichePresenceProvider(TypeEspacePresence.structure).future);
      await appelPresenceUi(ref, (repo, token) => repo.enregistrerPrestation(
            token: token,
            structureId: fiche.id,
            prestationId: p?.id,
            donnees: {
              'nom': _nom.text.trim(),
              'categorie': _categorie.text.trim(),
              'prix': prix,
              'description': _description.text.trim(),
              'disponible': _disponible,
            },
          ));
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

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
              Text(p == null ? 'Nouvelle prestation' : 'Modifier la prestation', style: AppTextStyles.h3),
              const SizedBox(height: 12),
              ChampLaboratoire(controleur: _nom, libelle: 'Nom', requis: true, indication: 'Ex. Échographie obstétricale'),
              ChampLaboratoire(controleur: _categorie, libelle: 'Catégorie', indication: 'Ex. Imagerie, Consultations, Biologie'),
              ChampLaboratoire(
                controleur: _prix,
                libelle: 'Prix indicatif${widget.devise == null ? '' : ' (${widget.devise})'}',
                indication: 'Vide = sur demande',
                clavier: const TextInputType.numberWithOptions(decimal: true),
              ),
              ChampLaboratoire(controleur: _description, libelle: 'Description', lignes: 3, indication: 'Ex. Sur rendez-vous, à jeun, ordonnance requise…'),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _disponible,
                onChanged: (v) => setState(() => _disponible = v),
                title: const Text('Disponible actuellement'),
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
