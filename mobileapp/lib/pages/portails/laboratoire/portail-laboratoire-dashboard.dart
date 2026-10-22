// lib/pages/portails/laboratoire/portail-laboratoire-dashboard.dart
//
// Portail laboratoire — « Tableau de bord » : vues de la fiche, engagements
// des visiteurs (appels, e-mails, itinéraires, partages, consultations des
// examens et des avis), taux d'engagement, avis, contenus et complétude.
// Données : GET /laboratoires/:id/tableau-de-bord?jours=.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/style/colors.dart';
import '../../../components/style/text_styles.dart';
import '../../../controllers/laboratoire_controller.dart';
import '../../../models/laboratoire_models.dart';
import 'portail_laboratoire_commun.dart';

class PortailLaboratoireDashboard extends ConsumerStatefulWidget {
  const PortailLaboratoireDashboard({super.key, required this.onOuvrirOnglet});

  /// Bascule du shell vers un autre onglet (1 examens, 2 centres, 3 médias, 4 profil).
  final ValueChanged<int> onOuvrirOnglet;

  @override
  ConsumerState<PortailLaboratoireDashboard> createState() => _PortailLaboratoireDashboardState();
}

class _PortailLaboratoireDashboardState extends ConsumerState<PortailLaboratoireDashboard> {
  int _jours = 30;

  @override
  Widget build(BuildContext context) {
    final tdb = ref.watch(tableauDeBordLaboratoireProvider(_jours));
    return Container(
      color: AppColors.paper,
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(tableauDeBordLaboratoireProvider(_jours).future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
          children: [
            const EnTeteLaboratoire(),
            const EnTetePortail(
              titre: 'Tableau de bord',
              description: "L'audience de votre fiche : consultations, actions des visiteurs et avis.",
            ),
            SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 7, label: Text('7 j')),
                ButtonSegment(value: 30, label: Text('30 j')),
                ButtonSegment(value: 90, label: Text('90 j')),
              ],
              selected: {_jours},
              showSelectedIcon: false,
              onSelectionChanged: (s) => setState(() => _jours = s.first),
            ),
            const SizedBox(height: 12),
            tdb.when(
              loading: () => const ChargementPortail(),
              error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(tableauDeBordLaboratoireProvider(_jours))),
              data: (d) => _Contenu(d: d, onOuvrirOnglet: widget.onOuvrirOnglet),
            ),
          ],
        ),
      ),
    );
  }
}

const Map<String, int> _ongletCompletude = {
  'description': 4,
  'logo': 4,
  'geolocalisation': 4,
  'examens': 1,
  'centres': 2,
  'photos': 3,
};

class _Contenu extends StatelessWidget {
  const _Contenu({required this.d, required this.onOuvrirOnglet});

  final TableauDeBordLaboratoire d;
  final ValueChanged<int> onOuvrirOnglet;

  @override
  Widget build(BuildContext context) {
    final n = nombreLaboratoire;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (d.statut != StatutVerificationLaboratoire.publie)
          const BandeauPortail(
            icone: Icons.hourglass_top_outlined,
            texte: "Votre fiche est en cours de vérification par APS Santé : elle n'est pas encore visible du public.",
          ),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 1.7,
          children: [
            TuileLaboratoire(icone: Icons.visibility_outlined, valeur: n(d.vuesPeriode), libelle: 'Vues (${d.jours} j)'),
            TuileLaboratoire(icone: Icons.touch_app_outlined, valeur: n(d.engagementsPeriode), libelle: 'Engagements (${d.jours} j)'),
            TuileLaboratoire(
              icone: Icons.percent_rounded,
              valeur: d.tauxEngagement == null ? '—' : '${d.tauxEngagement!.toStringAsFixed(1)} %',
              libelle: "Taux d'engagement",
            ),
            TuileLaboratoire(
              icone: Icons.star_outline_rounded,
              valeur: d.avis.moyenne == null ? '—' : d.avis.moyenne!.toStringAsFixed(1),
              libelle: 'Note · ${d.avis.nombre} avis',
            ),
          ],
        ),
        const SizedBox(height: 12),
        CartePortail(
          titre: 'Activité jour par jour',
          icone: Icons.bar_chart_rounded,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BarresLaboratoire(titre: 'Vues de la fiche', serie: d.serieVues, unite: 'vue'),
              const SizedBox(height: 16),
              BarresLaboratoire(titre: 'Engagements', serie: d.serieEngagements, unite: 'engagement'),
              const SizedBox(height: 8),
              Text(
                '${n(d.vuesSeptJours)} vues sur 7 jours · ${n(d.vuesTotal)} depuis le début. '
                "Vos propres consultations, celles d'APS et des robots ne sont pas comptées.",
                style: AppTextStyles.cardMeta,
              ),
            ],
          ),
        ),
        CartePortail(
          titre: 'Engagements par type (${d.jours} j)',
          icone: Icons.touch_app_outlined,
          child: Column(
            children: [
              for (final t in d.engagementsParType)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(children: [
                    Expanded(child: Text(t.libelle, style: AppTextStyles.body)),
                    Text(n(t.periode), style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink)),
                    SizedBox(width: 64, child: Text('${n(t.septJours)} / 7 j', textAlign: TextAlign.right, style: AppTextStyles.cardMeta)),
                  ]),
                ),
            ],
          ),
        ),
        CartePortail(
          titre: 'Avis',
          icone: Icons.star_half_rounded,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (d.avisEnAttente > 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text('${d.avisEnAttente} avis en cours de vérification par APS Santé.', style: AppTextStyles.cardMeta),
                ),
              if (d.derniersAvis.isEmpty)
                const VidePortail(icone: Icons.star_outline_rounded, texte: "Aucun avis publié pour l'instant.")
              else
                for (final a in d.derniersAvis)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Expanded(child: Text(a.auteur, style: AppTextStyles.strong)),
                          for (var i = 1; i <= 5; i++)
                            Icon(i <= a.note ? Icons.star_rounded : Icons.star_outline_rounded, size: 13, color: AppColors.star),
                        ]),
                        if ((a.commentaire ?? '').isNotEmpty)
                          Text(a.commentaire!, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppTextStyles.cardMeta),
                      ],
                    ),
                  ),
            ],
          ),
        ),
        CartePortail(
          titre: 'Contenus de la fiche',
          icone: Icons.layers_outlined,
          child: Column(children: [
            _Ligne('Examens', '${d.nbExamens}${d.nbExamensIndisponibles > 0 ? ' (${d.nbExamensIndisponibles} indisponibles)' : ''}', () => onOuvrirOnglet(1)),
            _Ligne('Centres de prélèvement', '${d.nbCentres}', () => onOuvrirOnglet(2)),
            _Ligne('Photos', '${d.photos.utilise} / ${d.photos.max}', () => onOuvrirOnglet(3)),
            _Ligne('Vidéos', '${d.videos.utilise} / ${d.videos.max}', () => onOuvrirOnglet(3)),
          ]),
        ),
        CartePortail(
          titre: 'Complétude de la fiche · ${d.completude} %',
          icone: Icons.checklist_rounded,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(value: d.completude / 100, minHeight: 6, backgroundColor: AppColors.segment, color: AppColors.primary),
              ),
              const SizedBox(height: 8),
              for (final e in d.elementsCompletude)
                InkWell(
                  onTap: e.ok ? null : () => onOuvrirOnglet(_ongletCompletude[e.cle] ?? 4),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(children: [
                      Icon(e.ok ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                          size: 17, color: e.ok ? AppColors.primary : AppColors.inkFaint),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(e.libelle,
                            style: AppTextStyles.body.copyWith(color: e.ok ? AppColors.ink : AppColors.primary)),
                      ),
                    ]),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Ligne extends StatelessWidget {
  const _Ligne(this.libelle, this.valeur, this.onTap);

  final String libelle;
  final String valeur;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(children: [
            Expanded(child: Text(libelle, style: AppTextStyles.body)),
            Text(valeur, style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink)),
            const Icon(Icons.chevron_right_rounded, size: 18, color: AppColors.inkFaint),
          ]),
        ),
      );
}
