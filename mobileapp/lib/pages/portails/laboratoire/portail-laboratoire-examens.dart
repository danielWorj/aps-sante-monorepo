// lib/pages/portails/laboratoire/portail-laboratoire-examens.dart
//
// Portail laboratoire — « Examens » : catalogue des analyses proposées
// (nom, catégorie, prix indicatif, délai, préparation, disponibilité).
// Ajout / modification dans une feuille du bas ; un examen indisponible
// reste enregistré mais disparaît de la fiche publique.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/laboratoire_controller.dart';
import '../../../models/laboratoire_models.dart';
import 'portail_laboratoire_commun.dart';

class PortailLaboratoireExamens extends ConsumerWidget {
  const PortailLaboratoireExamens({super.key});

  Future<void> _editer(BuildContext context, WidgetRef ref, GestionLaboratoire g, [ExamenLaboratoire? examen]) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => _FeuilleExamen(laboratoireId: g.laboratoire.id, devise: g.laboratoire.devise, examen: examen),
    );
    if (ok == true) {
      ref.invalidate(gestionLaboratoireProvider);
      ref.invalidate(tableauDeBordLaboratoireProvider);
    }
  }

  Future<void> _basculer(BuildContext context, WidgetRef ref, GestionLaboratoire g, ExamenLaboratoire e) async {
    try {
      await appelLaboratoireUi(ref, (repo, token) => repo.enregistrerExamen(
            token: token, laboratoireId: g.laboratoire.id, examenId: e.id, donnees: {'disponible': !e.disponible}));
      ref.invalidate(gestionLaboratoireProvider);
    } catch (err) {
      if (context.mounted) snackPortail(context, messageErreur(err));
    }
  }

  Future<void> _supprimer(BuildContext context, WidgetRef ref, ExamenLaboratoire e) async {
    if (!await confirmerPortail(context, "Supprimer l'examen", '« ${e.nom} » sera retiré de votre catalogue.', action: 'Supprimer')) return;
    try {
      await appelLaboratoireUi(ref, (repo, token) => repo.supprimerExamen(e.id, token: token));
      ref.invalidate(gestionLaboratoireProvider);
      ref.invalidate(tableauDeBordLaboratoireProvider);
      if (context.mounted) snackPortail(context, 'Examen supprimé.');
    } catch (err) {
      if (context.mounted) snackPortail(context, messageErreur(err));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gestion = ref.watch(gestionLaboratoireProvider);
    return Container(
      color: AppColors.paper,
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(gestionLaboratoireProvider.future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
          children: [
            const EnTetePortail(titre: 'Examens', description: 'Les analyses que vous proposez, avec leurs tarifs indicatifs.'),
            gestion.when(
              loading: () => const ChargementPortail(),
              error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(gestionLaboratoireProvider)),
              data: (g) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ApsButton(label: 'Ajouter un examen', icon: Icons.add_rounded, onPressed: () => _editer(context, ref, g)),
                  const SizedBox(height: 12),
                  CartePortail(
                    titre: 'Catalogue (${g.examens.length})',
                    icone: Icons.science_outlined,
                    child: g.examens.isEmpty
                        ? const VidePortail(icone: Icons.science_outlined, texte: "Aucun examen. Ajoutez vos analyses pour qu'elles apparaissent sur votre fiche.")
                        : Column(children: [
                            for (final e in g.examens)
                              Opacity(
                                opacity: e.disponible ? 1 : 0.55,
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 6),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(e.nom, style: AppTextStyles.strong),
                                            Text(
                                              [
                                                if (e.categorie != null) e.categorie!,
                                                formaterPrixExamen(e.prix, g.laboratoire.devise),
                                                if (e.delaiResultat != null) e.delaiResultat!,
                                                if (!e.disponible) 'Indisponible',
                                              ].join(' · '),
                                              style: AppTextStyles.cardMeta,
                                            ),
                                          ],
                                        ),
                                      ),
                                      PopupMenuButton<String>(
                                        icon: const Icon(Icons.more_vert_rounded, color: AppColors.inkFaint),
                                        onSelected: (choix) {
                                          if (choix == 'modifier') _editer(context, ref, g, e);
                                          if (choix == 'basculer') _basculer(context, ref, g, e);
                                          if (choix == 'supprimer') _supprimer(context, ref, e);
                                        },
                                        itemBuilder: (_) => [
                                          const PopupMenuItem(value: 'modifier', child: Text('Modifier')),
                                          PopupMenuItem(value: 'basculer', child: Text(e.disponible ? 'Marquer indisponible' : 'Marquer disponible')),
                                          const PopupMenuItem(value: 'supprimer', child: Text('Supprimer')),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                          ]),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FeuilleExamen extends ConsumerStatefulWidget {
  const _FeuilleExamen({required this.laboratoireId, this.devise, this.examen});

  final String laboratoireId;
  final String? devise;
  final ExamenLaboratoire? examen;

  @override
  ConsumerState<_FeuilleExamen> createState() => _FeuilleExamenState();
}

class _FeuilleExamenState extends ConsumerState<_FeuilleExamen> {
  final _form = GlobalKey<FormState>();
  late final _nom = TextEditingController(text: widget.examen?.nom ?? '');
  late final _categorie = TextEditingController(text: widget.examen?.categorie ?? '');
  late final _prix = TextEditingController(text: widget.examen?.prix == null ? '' : _sansZero(widget.examen!.prix!));
  late final _delai = TextEditingController(text: widget.examen?.delaiResultat ?? '');
  late final _preparation = TextEditingController(text: widget.examen?.preparation ?? '');
  late final _description = TextEditingController(text: widget.examen?.description ?? '');
  late bool _disponible = widget.examen?.disponible ?? true;
  bool _envoi = false;

  static String _sansZero(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : '$v';

  @override
  void dispose() {
    for (final c in [_nom, _categorie, _prix, _delai, _preparation, _description]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _enregistrer() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _envoi = true);
    try {
      await appelLaboratoireUi(ref, (repo, token) => repo.enregistrerExamen(
            token: token,
            laboratoireId: widget.laboratoireId,
            examenId: widget.examen?.id,
            donnees: {
              'nom': _nom.text.trim(),
              'categorie': _categorie.text.trim(),
              'prix': _prix.text.trim().isEmpty ? null : _prix.text.trim().replaceAll(',', '.'),
              'delai_resultat': _delai.text.trim(),
              'preparation': _preparation.text.trim(),
              'description': _description.text.trim(),
              'disponible': _disponible,
            },
          ));
      if (!mounted) return;
      snackPortail(context, widget.examen == null ? 'Examen ajouté.' : 'Examen mis à jour.');
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 8, 18, 18 + MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ApsSheetHeader(title: widget.examen == null ? 'Nouvel examen' : "Modifier l'examen"),
              ChampLaboratoire(controleur: _nom, libelle: "Nom de l'examen", indication: 'Ex. Numération formule sanguine', requis: true),
              ChampLaboratoire(controleur: _categorie, libelle: 'Catégorie', indication: 'Ex. Hématologie, Biochimie'),
              ChampLaboratoire(
                controleur: _prix,
                libelle: 'Prix indicatif${widget.devise != null ? ' (${widget.devise})' : ''}',
                indication: 'Vide = sur demande',
                clavier: const TextInputType.numberWithOptions(decimal: true),
              ),
              ChampLaboratoire(controleur: _delai, libelle: 'Délai de résultat', indication: 'Ex. 24 h, le jour même'),
              ChampLaboratoire(controleur: _preparation, libelle: 'Préparation du patient', indication: 'Ex. À jeun depuis 12 h'),
              ChampLaboratoire(controleur: _description, libelle: 'Description', lignes: 3),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Disponible'),
                subtitle: const Text('Visible sur votre fiche publique'),
                value: _disponible,
                onChanged: (v) => setState(() => _disponible = v),
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
