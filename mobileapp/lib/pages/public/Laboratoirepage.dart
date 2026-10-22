// lib/pages/public/Laboratoirepage.dart
//
// Écran public — annuaire des laboratoires d'analyses (pendant mobile de
// client-plateform/src/pages/Laboratoire.jsx). Consultable sans compte :
// GET /api/laboratoires (fiches publiées). Mêmes codes que les autres
// annuaires : recherche, feuille de filtres (pays / ville du référentiel
// envoyés au serveur, examen recherché, tri), puces actives, 5 fiches par
// page, invitation « Inscrire mon laboratoire ».

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/laboratoire_controller.dart';
import '../../models/laboratoire_models.dart';
import '../../services/pays_utilisateur_service.dart';
import '../../utils/mon_espace_navigation.dart';
import 'utils/DetailLaboratoire.dart';

class LaboratoirePage extends ConsumerStatefulWidget {
  const LaboratoirePage({super.key});

  @override
  ConsumerState<LaboratoirePage> createState() => _LaboratoirePageState();
}

class _LaboratoirePageState extends ConsumerState<LaboratoirePage> {
  final TextEditingController _recherche = TextEditingController();
  String _query = '';
  String _tri = 'pertinence';
  bool _paysTouche = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _paysParDefaut());
    PaysUtilisateurService.instance.addListener(_paysParDefaut);
  }

  @override
  void dispose() {
    PaysUtilisateurService.instance.removeListener(_paysParDefaut);
    _recherche.dispose();
    super.dispose();
  }

  FiltresLaboratoires get _filtres => ref.read(filtresLaboratoiresProvider);

  /// Ouvre l'annuaire sur le pays de l'utilisateur tant qu'il n'en a pas choisi un ici.
  void _paysParDefaut() {
    if (!mounted || _paysTouche) return;
    final service = PaysUtilisateurService.instance;
    final id = service.paysId;
    final actuel = _filtres.paysId;
    if (id == null || actuel == id) return;
    if (actuel != null && actuel != service.paysPrecedent) return;
    _appliquer(FiltresLaboratoires(paysId: id, examen: _filtres.examen), parUtilisateur: false);
  }

  void _appliquer(FiltresLaboratoires filtres, {bool parUtilisateur = true}) {
    if (parUtilisateur && filtres.paysId != _filtres.paysId) {
      _paysTouche = true;
      PaysUtilisateurService.instance.choisir(filtres.paysId);
    }
    ref.read(filtresLaboratoiresProvider.notifier).state = filtres;
  }

  Future<void> _ouvrirFiltres() async {
    final f = _filtres;
    final examenCtrl = TextEditingController(text: f.examen ?? '');
    final choix = await showApsFilterSheet<({String? paysId, String? villeId, String tri})>(
      context: context,
      initial: (paysId: f.paysId, villeId: f.villeId, tri: _tri),
      reset: (paysId: null, villeId: null, tri: 'pertinence'),
      builder: (c, maj) => [
        ApsFilterSection(
          title: 'Examen recherché',
          child: ApsSearchField(controller: examenCtrl, hint: 'Glycémie, NFS, test de grossesse…'),
        ),
        ApsFiltrePaysVille(
          paysId: c.paysId,
          villeId: c.villeId,
          onChanged: (paysId, villeId) => maj((paysId: paysId, villeId: villeId, tri: c.tri)),
        ),
        ApsFilterSection(
          title: 'Trier par',
          child: ApsFilterChoices<String>(
            value: c.tri,
            onChanged: (v) => maj((paysId: c.paysId, villeId: c.villeId, tri: v)),
            options: [for (final e in apsLibellesTriAnnuaire.entries) ApsFilterOption(e.key, e.value)],
          ),
        ),
      ],
    );
    final examen = examenCtrl.text.trim();
    examenCtrl.dispose();
    if (choix == null || !mounted) return;
    setState(() => _tri = choix.tri);
    _appliquer(FiltresLaboratoires(paysId: choix.paysId, villeId: choix.villeId, examen: examen.isEmpty ? null : examen));
  }

  List<Laboratoire> _filtrer(List<Laboratoire> labos) {
    final q = _query.trim().toLowerCase();
    final liste = labos
        .where((l) => q.isEmpty || l.nom.toLowerCase().contains(q) || l.lieu.toLowerCase().contains(q) || l.localisation.toLowerCase().contains(q))
        .toList();
    if (_tri == 'nom') liste.sort((a, b) => a.nom.toLowerCase().compareTo(b.nom.toLowerCase()));
    return liste;
  }

  @override
  Widget build(BuildContext context) {
    final labos = ref.watch(laboratoiresProvider);
    final f = ref.watch(filtresLaboratoiresProvider);

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.b6,
          onRefresh: () => ref.refresh(laboratoiresProvider.future),
          child: ListView(
            padding: EdgeInsets.fromLTRB(18, 6, 18, 24 + MediaQuery.paddingOf(context).bottom),
            children: [
              ApsPageTitle(
                'Laboratoires',
                subtitle: "Analyses médicales et centres de prélèvement",
                trailing: Navigator.of(context).canPop()
                    ? ApsIconButton(icon: Icons.close_rounded, tooltip: 'Fermer', onPressed: () => Navigator.of(context).maybePop())
                    : null,
              ),
              ApsSearchField(
                controller: _recherche,
                hint: 'Laboratoire, quartier, ville…',
                onChanged: (v) => setState(() => _query = v),
              ),
              const SizedBox(height: 12),
              ApsFilterBar(
                onOpen: _ouvrirFiltres,
                actifs: [
                  if (f.examen != null)
                    (
                      label: f.examen!,
                      icon: Icons.biotech_outlined,
                      onRemove: () => _appliquer(FiltresLaboratoires(paysId: f.paysId, villeId: f.villeId)),
                    ),
                  if (f.paysId != null)
                    (
                      label: apsNomPays(ref, f.paysId!),
                      icon: Icons.public_rounded,
                      onRemove: () => _appliquer(FiltresLaboratoires(examen: f.examen)),
                    ),
                  if (f.paysId != null && f.villeId != null)
                    (
                      label: apsNomVille(ref, f.paysId!, f.villeId!),
                      icon: Icons.location_on_outlined,
                      onRemove: () => _appliquer(FiltresLaboratoires(paysId: f.paysId, examen: f.examen)),
                    ),
                  if (_tri != 'pertinence')
                    (
                      label: apsLibellesTriAnnuaire[_tri]!,
                      icon: Icons.sort_rounded,
                      onRemove: () => setState(() => _tri = 'pertinence'),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              ApsInvitationPro(
                question: 'Vous dirigez un laboratoire ?',
                libelle: 'Inscrire mon laboratoire',
                icone: Icons.biotech_outlined,
                onPressed: () => ouvrirDeclarerLaboratoire(context),
              ),
              const SizedBox(height: 16),
              labos.when(
                loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 48), child: Center(child: CircularProgressIndicator())),
                error: (_, _) => ApsEmptyState(
                  icon: Icons.wifi_off_rounded,
                  tone: ApsTone.neutral,
                  title: 'Annuaire indisponible',
                  message: "Impossible de charger l'annuaire des laboratoires.",
                  actionLabel: 'Réessayer',
                  onAction: () => ref.invalidate(laboratoiresProvider),
                ),
                data: (liste) {
                  final resultats = _filtrer(liste);
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ApsSectionTitle(
                        'Laboratoires',
                        padding: const EdgeInsets.only(bottom: 12),
                        trailing: Text('${resultats.length} au total', style: AppTextStyles.xs),
                      ),
                      if (resultats.isEmpty)
                        ApsEmptyState(
                          icon: Icons.search_off_rounded,
                          tone: ApsTone.neutral,
                          title: 'Aucun laboratoire trouvé',
                          message: f.examen != null
                              ? 'Aucun laboratoire ne propose « ${f.examen} » avec ces critères.'
                              : 'Essayez une autre ville ou réinitialisez les filtres.',
                          actionLabel: 'Réinitialiser',
                          onAction: () {
                            setState(() {
                              _recherche.clear();
                              _query = '';
                              _tri = 'pertinence';
                            });
                            _appliquer(const FiltresLaboratoires());
                          },
                        )
                      else
                        ApsListePaginee<Laboratoire>(
                          elements: resultats,
                          cleReinitialisation: Object.hash(identityHashCode(liste), _query, _tri),
                          construirePage: (context, page) => [for (final l in page) CarteLaboratoire(laboratoire: l)],
                        ),
                    ],
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Carte d'annuaire — sobre : fond blanc, bordure fine, rayon 10, sans ombre.
class CarteLaboratoire extends StatelessWidget {
  const CarteLaboratoire({super.key, required this.laboratoire});

  final Laboratoire laboratoire;

  @override
  Widget build(BuildContext context) {
    final l = laboratoire;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: const BorderSide(color: AppColors.line)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => DetailLaboratoirePage(laboratoireId: l.id, apercu: l))),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                ApsVignette(
                  imageUrl: l.imageUrl,
                  size: 60,
                  radius: 8,
                  repli: Container(
                    width: 60,
                    height: 60,
                    decoration: BoxDecoration(color: AppColors.b0, borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.biotech_outlined, color: AppColors.b7),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(child: Text(l.nom, style: AppTextStyles.strong, maxLines: 1, overflow: TextOverflow.ellipsis)),
                          const SizedBox(width: 4),
                          const Icon(Icons.verified_rounded, size: 15, color: AppColors.b7),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        [l.lieu, if (l.distanceKm != null) '${l.distanceKm!.toStringAsFixed(1)} km'].where((s) => s.isNotEmpty).join(' · '),
                        style: AppTextStyles.xs,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 10,
                        runSpacing: 4,
                        children: [
                          _Meta(icone: Icons.science_outlined, texte: '${l.nbExamens} examen${l.nbExamens > 1 ? 's' : ''}'),
                          if (l.nbCentres > 0) _Meta(icone: Icons.place_outlined, texte: '${l.nbCentres} centre${l.nbCentres > 1 ? 's' : ''}'),
                          if (l.noteMoyenne != null)
                            _Meta(icone: Icons.star_rounded, couleur: AppColors.star, texte: '${l.noteMoyenne!.toStringAsFixed(1)} (${l.nbAvis})'),
                        ],
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: AppColors.ink3),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.icone, required this.texte, this.couleur = AppColors.ink3});

  final IconData icone;
  final String texte;
  final Color couleur;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icone, size: 14, color: couleur),
          const SizedBox(width: 3),
          Text(texte, style: AppTextStyles.xs),
        ],
      );
}
