// lib/pages/portails/laboratoire/portail-laboratoire-centres.dart
//
// Portail laboratoire — « Centres » : centres de prélèvement / sites du
// laboratoire (nom, ville du pays de la fiche, adresse, téléphone, horaires,
// position GPS facultative). Ajout / modification dans une feuille du bas.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/laboratoire_controller.dart';
import '../../../models/laboratoire_models.dart';
import 'portail_laboratoire_commun.dart';

class PortailLaboratoireCentres extends ConsumerWidget {
  const PortailLaboratoireCentres({super.key});

  Future<void> _editer(BuildContext context, WidgetRef ref, GestionLaboratoire g, [CentreLaboratoire? centre]) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => _FeuilleCentre(laboratoire: g.laboratoire, centre: centre),
    );
    if (ok == true) {
      ref.invalidate(gestionLaboratoireProvider);
      ref.invalidate(tableauDeBordLaboratoireProvider);
    }
  }

  Future<void> _supprimer(BuildContext context, WidgetRef ref, CentreLaboratoire c) async {
    if (!await confirmerPortail(context, 'Supprimer le centre', '« ${c.nom} » ne sera plus affiché sur votre fiche.', action: 'Supprimer')) return;
    try {
      await appelLaboratoireUi(ref, (repo, token) => repo.supprimerCentre(c.id, token: token));
      ref.invalidate(gestionLaboratoireProvider);
      ref.invalidate(tableauDeBordLaboratoireProvider);
      if (context.mounted) snackPortail(context, 'Centre supprimé.');
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
            const EnTetePortail(titre: 'Centres de prélèvement', description: 'Les sites où vos patients sont prélevés ou retirent leurs résultats.'),
            gestion.when(
              loading: () => const ChargementPortail(),
              error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(gestionLaboratoireProvider)),
              data: (g) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ApsButton(label: 'Ajouter un centre', icon: Icons.add_rounded, onPressed: () => _editer(context, ref, g)),
                  const SizedBox(height: 12),
                  CartePortail(
                    titre: 'Mes centres (${g.centres.length})',
                    icone: Icons.place_outlined,
                    child: g.centres.isEmpty
                        ? const VidePortail(icone: Icons.place_outlined, texte: 'Aucun centre. Ajoutez au moins votre site principal.')
                        : Column(children: [
                            for (final c in g.centres)
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 6),
                                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Expanded(
                                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                      Text(c.nom, style: AppTextStyles.strong),
                                      Text([c.localisation, c.villeNom].whereType<String>().where((s) => s.isNotEmpty).join(', '), style: AppTextStyles.cardMeta),
                                      if (c.telephone != null || c.horaires != null)
                                        Text([c.telephone, c.horaires].whereType<String>().join(' · '), style: AppTextStyles.cardMeta),
                                      if (c.gps == null) Text('Position non renseignée', style: AppTextStyles.cardMeta.copyWith(color: AppColors.amber700)),
                                    ]),
                                  ),
                                  PopupMenuButton<String>(
                                    icon: const Icon(Icons.more_vert_rounded, color: AppColors.inkFaint),
                                    onSelected: (choix) => choix == 'modifier' ? _editer(context, ref, g, c) : _supprimer(context, ref, c),
                                    itemBuilder: (_) => const [
                                      PopupMenuItem(value: 'modifier', child: Text('Modifier')),
                                      PopupMenuItem(value: 'supprimer', child: Text('Supprimer')),
                                    ],
                                  ),
                                ]),
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

class _FeuilleCentre extends ConsumerStatefulWidget {
  const _FeuilleCentre({required this.laboratoire, this.centre});

  final Laboratoire laboratoire;
  final CentreLaboratoire? centre;

  @override
  ConsumerState<_FeuilleCentre> createState() => _FeuilleCentreState();
}

class _FeuilleCentreState extends ConsumerState<_FeuilleCentre> {
  final _form = GlobalKey<FormState>();
  late final _nom = TextEditingController(text: widget.centre?.nom ?? '');
  late final _adresse = TextEditingController(text: widget.centre?.localisation ?? '');
  late final _telephone = TextEditingController(text: widget.centre?.telephone ?? '');
  late final _horaires = TextEditingController(text: widget.centre?.horaires ?? '');
  late final _lat = TextEditingController(text: widget.centre?.gps?.latitude.toString() ?? '');
  late final _lng = TextEditingController(text: widget.centre?.gps?.longitude.toString() ?? '');
  late String? _villeId = widget.centre?.villeId;
  bool _envoi = false;

  @override
  void dispose() {
    for (final c in [_nom, _adresse, _telephone, _horaires, _lat, _lng]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _enregistrer() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    final erreurGps = apsValiderCoordonnees(_lat.text, _lng.text);
    if (erreurGps != null) return snackPortail(context, erreurGps);
    setState(() => _envoi = true);
    final lat = apsParseCoordonnee(_lat.text);
    final lng = apsParseCoordonnee(_lng.text);
    try {
      await appelLaboratoireUi(ref, (repo, token) => repo.enregistrerCentre(
            token: token,
            laboratoireId: widget.laboratoire.id,
            centreId: widget.centre?.id,
            donnees: {
              'nom': _nom.text.trim(),
              'localisation': _adresse.text.trim(),
              'telephone': _telephone.text.trim(),
              'horaires': _horaires.text.trim(),
              'ville_id': _villeId,
              if (lat != null && lng != null) ...{'latitude': lat, 'longitude': lng},
            },
          ));
      if (!mounted) return;
      snackPortail(context, widget.centre == null ? 'Centre ajouté.' : 'Centre mis à jour.');
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
              ApsSheetHeader(title: widget.centre == null ? 'Nouveau centre' : 'Modifier le centre'),
              ChampLaboratoire(controleur: _nom, libelle: 'Nom du centre', indication: 'Ex. Centre Akwa (siège)', requis: true),
              // Villes du pays de la fiche (le pays n'est pas modifiable ici).
              ChoixVilleLaboratoire(
                paysId: widget.laboratoire.paysId,
                villeId: _villeId,
                onChanged: (v) => setState(() => _villeId = v),
              ),
              ChampLaboratoire(controleur: _adresse, libelle: 'Adresse', indication: 'Quartier, rue, point de repère', requis: true),
              ChampLaboratoire(controleur: _telephone, libelle: 'Téléphone', clavier: TextInputType.phone),
              ChampLaboratoire(controleur: _horaires, libelle: 'Horaires', indication: 'Ex. Lun-Sam 7h-18h'),
              Row(children: [
                Expanded(
                  child: ChampLaboratoire(controleur: _lat, libelle: 'Latitude', clavier: const TextInputType.numberWithOptions(decimal: true, signed: true)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ChampLaboratoire(controleur: _lng, libelle: 'Longitude', clavier: const TextInputType.numberWithOptions(decimal: true, signed: true)),
                ),
              ]),
              const SizedBox(height: 8),
              ApsButton(label: 'Enregistrer', icon: Icons.check_rounded, loading: _envoi, onPressed: _envoi ? null : _enregistrer),
            ],
          ),
        ),
      ),
    );
  }
}
