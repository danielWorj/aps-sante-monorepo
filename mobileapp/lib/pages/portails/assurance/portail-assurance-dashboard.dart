// lib/pages/portails/assurance/portail-assurance-dashboard.dart
//
// Portail assurance — « Tableau de bord » (pendant mobile de
// assurance-dashboard.jsx). Toutes les métriques viennent du serveur
// (GET /services-assurance/:id/tableau-de-bord). Les courbes jour par jour
// exigent le droit « statistiques complètes » de l'abonnement.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/navigation/bouton_deconnexion.dart';
import '../../../components/style/colors.dart';
import '../../../components/ui/aps_ui.dart' show ApsAvatar;
import '../../../components/style/text_styles.dart';
import '../../../controllers/portail_assurance_controller.dart';
import '../../../models/portail_assurance_models.dart';
import '../../../utils/fonds.dart';
import 'portail_assurance_commun.dart';

class PortailAssuranceDashboard extends ConsumerStatefulWidget {
  /// Bascule du shell vers un autre onglet (index).
  final ValueChanged<int> onOuvrirOnglet;

  const PortailAssuranceDashboard({super.key, required this.onOuvrirOnglet});

  @override
  ConsumerState<PortailAssuranceDashboard> createState() => _PortailAssuranceDashboardState();
}

class _PortailAssuranceDashboardState extends ConsumerState<PortailAssuranceDashboard> {
  int _jours = 30;

  @override
  Widget build(BuildContext context) {
    final tdb = ref.watch(tableauDeBordAssuranceProvider(_jours));
    return Container(
      color: AppColors.paper,
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(tableauDeBordAssuranceProvider(_jours).future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
          children: [
            const _Proprietaire(),
            const EnTetePortail(
              titre: 'Tableau de bord',
              description: "L'activité de votre fiche : demandes reçues, consultations et présence.",
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
              error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(tableauDeBordAssuranceProvider(_jours))),
              data: (d) => _Contenu(d: d, jours: _jours, onOuvrirOnglet: widget.onOuvrirOnglet),
            ),
          ],
        ),
      ),
    );
  }
}

/// Identité de l'espace (logo + nom de la fiche) et déconnexion.
class _Proprietaire extends ConsumerWidget {
  const _Proprietaire();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fiche = ref.watch(maFicheAssuranceProvider).value;
    final nom = fiche?.nom ?? 'Espace assurance';
    return Padding(
      // Marge droite : la cloche flotte en haut à droite (shell).
      padding: const EdgeInsets.fromLTRB(0, 12, 56, 0),
      child: Row(
        children: [
          ApsAvatar(name: nom, photoUrl: fiche?.imageUrl, size: 40),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Espace assurance', style: AppTextStyles.cardMeta),
                Text(
                  nom,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTextStyles.h3.copyWith(fontSize: 15),
                ),
              ],
            ),
          ),
          const BoutonDeconnexion(),
        ],
      ),
    );
  }
}

String _delai(double? h) {
  if (h == null) return '—';
  if (h < 1) return '< 1 h';
  if (h < 48) return '${h.round()} h';
  return '${(h / 24).round()} j';
}

class _Contenu extends StatelessWidget {
  final TableauDeBordAssurance d;
  final int jours;
  final ValueChanged<int> onOuvrirOnglet;

  const _Contenu({required this.d, required this.jours, required this.onOuvrirOnglet});

  @override
  Widget build(BuildContext context) {
    final ab = d.abonnement;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (d.statutFiche != 'publie')
          const BandeauPortail(
            icone: Icons.hourglass_top_outlined,
            texte: "Votre fiche est en cours de vérification par ApSa : elle n'est pas encore visible du public.",
          ),
        if (ab.enGrace)
          BandeauPortail(
            icone: Icons.warning_amber_outlined,
            texte: 'Votre abonnement a expiré le ${dateCourtePortail(ab.dernierJour)} : vos contenus enrichis sont masqués. '
                "Renouvelez-le pour qu'ils réapparaissent, sans ressaisie.",
          ),
        if (!ab.estActif && !ab.enGrace)
          BandeauPortail(
            icone: Icons.info_outline,
            fond: AppColors.primarySurface,
            couleur: AppColors.primaryDark,
            texte: 'Sans abonnement, votre fiche reste en présence minimale : ni contacts, ni activités, ni agences, '
                'ni formulaire de mise en relation.',
            action: TextButton(onPressed: () => onOuvrirOnglet(4), child: const Text('Activer un abonnement')),
          ),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.75,
          children: [
            _Tuile(icone: Icons.inbox_outlined, valeur: '${d.demandesATraiter}', libelle: 'Demandes à traiter'),
            _Tuile(icone: Icons.mark_email_unread_outlined, valeur: '${d.demandesPeriode}', libelle: 'Demandes ($jours j)'),
            _Tuile(icone: Icons.visibility_outlined, valeur: formaterEntier(d.vuesPeriode), libelle: 'Vues ($jours j)'),
            _Tuile(
              icone: Icons.timer_outlined,
              valeur: _delai(d.delaiMoyenHeures),
              libelle: d.tauxTraitement == null ? 'Délai de traitement' : 'Délai · ${d.tauxTraitement} % traitées',
            ),
          ],
        ),
        const SizedBox(height: 12),
        CartePortail(
          titre: 'Activité jour par jour',
          icone: Icons.bar_chart_outlined,
          child: d.statistiquesDetaillees && d.serieDemandes != null && d.serieVues != null
              ? Column(
                  children: [
                    _Barres(titre: 'Demandes reçues', serie: d.serieDemandes!, unite: 'demande'),
                    const SizedBox(height: 16),
                    _Barres(titre: 'Vues de la fiche', serie: d.serieVues!, unite: 'vue'),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Les courbes jour par jour sont incluses dans les abonnements « statistiques complètes ».',
                      style: AppTextStyles.cardMeta,
                    ),
                    const SizedBox(height: 8),
                    Text('Vues : ${formaterEntier(d.vuesSeptJours)} sur 7 jours · ${formaterEntier(d.vuesTotal)} depuis le début',
                        style: AppTextStyles.body),
                  ],
                ),
        ),
        CartePortail(
          titre: 'Dernières demandes',
          icone: Icons.inbox_outlined,
          action: TextButton(onPressed: () => onOuvrirOnglet(1), child: const Text('Toutes')),
          child: d.dernieresDemandes.isEmpty
              ? const VidePortail(icone: Icons.inbox_outlined, texte: "Aucune demande reçue pour l'instant.")
              : Column(
                  children: [
                    for (final dm in d.dernieresDemandes)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            PuceStatutDemande(statut: dm.statut, libelle: libelleStatutDemande(dm.statut)),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('${dm.demandeur ?? 'Utilisateur'} · ${dateHeurePortail(dm.dateCreation)}',
                                      style: AppTextStyles.cardMeta),
                                  Text(dm.extrait, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppTextStyles.body),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
        CartePortail(
          titre: 'Abonnement',
          icone: Icons.workspace_premium_outlined,
          action: TextButton(onPressed: () => onOuvrirOnglet(4), child: Text(ab.estActif ? 'Gérer' : 'Activer')),
          child: Text(
            ab.estActif
                ? '${ab.niveauLibelle ?? ''} — valable jusqu\'au ${dateCourtePortail(ab.dernierJour)} inclus (${ab.joursRestants ?? 0} j restants).'
                : (ab.enGrace ? 'Expiré (période de grâce).' : 'Aucun abonnement actif.'),
            style: AppTextStyles.body,
          ),
        ),
        CartePortail(
          titre: 'Contenus de la fiche',
          icone: Icons.layers_outlined,
          child: Column(
            children: [
              _LigneQuota('Activités / produits', '${d.nbActivites} (${d.nbOptions} options)'),
              _LigneQuota('Agences', d.agences.libelle),
              _LigneQuota('Photos', d.photos.libelle),
              _LigneQuota('Vidéos', d.videos.libelle),
            ],
          ),
        ),
        CartePortail(
          titre: 'Complétude de la fiche · ${d.completude} %',
          icone: Icons.checklist_outlined,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  value: d.completude / 100,
                  minHeight: 6,
                  backgroundColor: AppColors.line,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(height: 8),
              for (final e in d.elementsCompletude)
                InkWell(
                  onTap: e.ok ? null : () => onOuvrirOnglet(e.cle == 'photos' ? 3 : 2),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        Icon(e.ok ? Icons.check_circle : Icons.radio_button_unchecked,
                            size: 18, color: e.ok ? AppColors.success : AppColors.inkFaint),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            e.libelle,
                            style: TextStyle(fontSize: 13, color: e.ok ? AppColors.ink : AppColors.primary),
                          ),
                        ),
                        if (!e.ok) const Icon(Icons.chevron_right, size: 18, color: AppColors.inkFaint),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Tuile extends StatelessWidget {
  final IconData icone;
  final String valeur;
  final String libelle;

  const _Tuile({required this.icone, required this.valeur, required this.libelle});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icone, size: 18, color: AppColors.primary),
          const SizedBox(height: 4),
          Text(valeur,
              style: const TextStyle(fontFamily: AppTextStyles.fontDisplay, fontSize: 20, fontWeight: FontWeight.w700, color: AppColors.ink)),
          Text(libelle, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppTextStyles.cardMeta),
        ],
      ),
    );
  }
}

class _LigneQuota extends StatelessWidget {
  final String libelle;
  final String valeur;

  const _LigneQuota(this.libelle, this.valeur);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            Expanded(child: Text(libelle, style: AppTextStyles.body)),
            Text(valeur, style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink)),
          ],
        ),
      );
}

/// Histogramme d'UNE série (pas de légende : le titre la nomme). Un appui
/// sur une barre affiche sa valeur.
class _Barres extends StatefulWidget {
  final String titre;
  final List<PointSerie> serie;
  final String unite;

  const _Barres({required this.titre, required this.serie, required this.unite});

  @override
  State<_Barres> createState() => _BarresState();
}

class _BarresState extends State<_Barres> {
  int? _actif;

  String _libelle(int n) => '${formaterEntier(n)} ${widget.unite}${n > 1 ? 's' : ''}';

  @override
  Widget build(BuildContext context) {
    final serie = widget.serie;
    final max = serie.fold<int>(1, (m, p) => p.valeur > m ? p.valeur : m);
    final total = serie.fold<int>(0, (a, p) => a + p.valeur);
    final point = _actif == null ? null : serie[_actif!];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('${widget.titre} · ${_libelle(total)}', style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink)),
        const SizedBox(height: 4),
        Text(
          point == null ? 'Touchez une barre pour voir le détail.' : '${dateCourtePortail(point.jour)} : ${_libelle(point.valeur)}',
          style: AppTextStyles.cardMeta,
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: 90,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (var i = 0; i < serie.length; i++)
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => setState(() => _actif = _actif == i ? null : i),
                    child: Align(
                      alignment: Alignment.bottomCenter,
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 1),
                        height: serie[i].valeur == 0 ? 0 : (90 * serie[i].valeur / max).clamp(3, 90).toDouble(),
                        decoration: BoxDecoration(
                          color: _actif == null || _actif == i ? AppColors.primary : AppColors.primary.withValues(alpha: 0.45),
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Container(height: 1, color: AppColors.line),
        const SizedBox(height: 3),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(dateCourtePortail(serie.first.jour), style: AppTextStyles.cardMeta),
            Text(dateCourtePortail(serie.last.jour), style: AppTextStyles.cardMeta),
          ],
        ),
      ],
    );
  }
}
