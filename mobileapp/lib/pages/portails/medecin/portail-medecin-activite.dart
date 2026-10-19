// lib/pages/portails/medecin/portail-medecin-activite.dart
//
// Espace médecin — onglet « Activité » : pendant mobile du tableau de bord
// (medecin-tableau-de-bord.jsx) et de l'espace « Avis & notes »
// (medecin-avis.jsx). Deux vues sous un contrôle segmenté :
//   - Statistiques : audience de la fiche (selon les droits « statistiques »
//     de l'abonnement), rendez-vous, consultations, nouveaux patients,
//     créneaux demandés, réputation — comparés à la période précédente ;
//   - Avis : synthèse des notes, avis publiés filtrables, réponse publique
//     et signalement.
// Onglet du shell (MedecinHomeShell) : pas de Scaffold ici.

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/reputation/appel_reputation.dart';
import '../../../components/reputation/avis_widgets.dart';
import '../../../components/reputation/graphiques.dart';
import '../../../components/reputation/reputation_ui.dart';
import '../../../components/style/colors.dart';
import '../../../components/style/text_styles.dart';
import '../../../components/ui/aps_filter_sheet.dart';
import '../../../components/ui/aps_ui.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/reputation_medecin_controller.dart';
import '../../../models/reputation_medecin_models.dart';

/// Vue affichée par l'onglet (0 = statistiques, 1 = avis). Le shell la
/// positionne avant d'ouvrir l'onglet (ex. notification « nouvel avis »).
final ValueNotifier<int> vueActiviteMedecin = ValueNotifier<int>(0);

class PortailMedecinActivite extends StatelessWidget {
  const PortailMedecinActivite({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.bg,
      child: ValueListenableBuilder<int>(
        valueListenable: vueActiviteMedecin,
        builder: (context, vue, _) => Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 0, 18, 0),
              child: Column(
                children: [
                  const ApsPageTitle(
                    'Activité',
                    subtitle: 'Audience, rendez-vous et avis de vos patients',
                    trailing: SizedBox(width: 44),
                  ),
                  ApsSegmented<int>(
                    value: vue,
                    onChanged: (v) => vueActiviteMedecin.value = v,
                    segments: const [
                      ApsSegment(0, 'Statistiques', icon: Icons.insights_rounded),
                      ApsSegment(1, 'Avis & notes', icon: Icons.star_outline_rounded),
                    ],
                  ),
                  const SizedBox(height: 14),
                ],
              ),
            ),
            Expanded(
              child: IndexedStack(
                index: vue,
                children: const [_VueStatistiques(), VueAvisMedecin()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Page autonome des avis, poussée depuis « Compte » (profil du médecin).
class PageMesAvisMedecin extends StatelessWidget {
  const PageMesAvisMedecin({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 18),
              child: ApsTopBar(title: 'Avis & notes'),
            ),
            SizedBox(height: 8),
            Expanded(child: VueAvisMedecin()),
          ],
        ),
      ),
    );
  }
}

/* =============================== Statistiques =============================== */

enum _Preset { j7, j30, m3, m12 }

extension on _Preset {
  String get libelle => switch (this) { _Preset.j7 => '7 j', _Preset.j30 => '30 j', _Preset.m3 => '3 mois', _Preset.m12 => '12 mois' };
  String get granularite => switch (this) { _Preset.j7 || _Preset.j30 => 'jour', _Preset.m3 => 'semaine', _Preset.m12 => 'mois' };
}

String _iso(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

FiltreTableauDeBord _filtre(_Preset p, String granularite) {
  final n = DateTime.now().toUtc();
  final auj = DateTime.utc(n.year, n.month, n.day);
  final du = switch (p) {
    _Preset.j7 => auj.subtract(const Duration(days: 6)),
    _Preset.j30 => auj.subtract(const Duration(days: 29)),
    _Preset.m3 => auj.subtract(const Duration(days: 89)),
    _Preset.m12 => DateTime.utc(auj.year, auj.month - 11, 1),
  };
  return (du: _iso(du), au: _iso(auj), granularite: granularite);
}

class _VueStatistiques extends ConsumerStatefulWidget {
  const _VueStatistiques();

  @override
  ConsumerState<_VueStatistiques> createState() => _VueStatistiquesState();
}

class _VueStatistiquesState extends ConsumerState<_VueStatistiques> {
  _Preset _preset = _Preset.j30;
  String _granularite = 'jour';
  TableauDeBordMedecin? _dernier;

  bool get _jourAutorise => _preset != _Preset.m12;

  @override
  Widget build(BuildContext context) {
    final filtre = _filtre(_preset, _granularite);
    final etat = ref.watch(tableauDeBordMedecinProvider(filtre));
    // Pendant un rechargement, l'affichage précédent reste en place (atténué).
    final donnees = etat.value ?? _dernier;
    if (etat.value != null) _dernier = etat.value;

    return RefreshIndicator(
      color: AppColors.b7,
      onRefresh: () => ref.refresh(tableauDeBordMedecinProvider(filtre).future),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 120),
        children: [
          ApsSegmented<_Preset>(
            compact: true,
            value: _preset,
            onChanged: (p) => setState(() {
              _preset = p;
              _granularite = p.granularite;
            }),
            segments: [for (final p in _Preset.values) ApsSegment(p, p.libelle)],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  donnees == null ? ' ' : 'Du ${jourMoisCourt(donnees.du)} au ${jourMoisAnnee(donnees.au)}',
                  style: AppTextStyles.xs.copyWith(fontWeight: FontWeight.w700, color: AppColors.ink2),
                ),
              ),
              for (final g in const [('jour', 'Jour'), ('semaine', 'Sem.'), ('mois', 'Mois')])
                _BoutonGranularite(
                  libelle: g.$2,
                  actif: _granularite == g.$1,
                  desactive: g.$1 == 'jour' && !_jourAutorise,
                  onTap: () => setState(() => _granularite = g.$1),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (donnees == null && etat.hasError)
            ApsEmptyState(
              icon: Icons.wifi_off_rounded,
              tone: ApsTone.neutral,
              title: 'Statistiques indisponibles',
              message: '${etat.error}',
              actionLabel: 'Réessayer',
              onAction: () => ref.invalidate(tableauDeBordMedecinProvider(filtre)),
            )
          else if (donnees == null)
            const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))
          else
            AnimatedOpacity(
              duration: const Duration(milliseconds: 200),
              opacity: etat.isLoading ? 0.5 : 1,
              child: _ContenuStatistiques(d: donnees),
            ),
        ],
      ),
    );
  }
}

class _BoutonGranularite extends StatelessWidget {
  const _BoutonGranularite({required this.libelle, required this.actif, required this.desactive, required this.onTap});
  final String libelle;
  final bool actif;
  final bool desactive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: InkWell(
        onTap: desactive ? null : onTap,
        borderRadius: BorderRadius.circular(6),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
          decoration: BoxDecoration(
            color: actif ? AppColors.ink : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: actif ? AppColors.ink : AppColors.lineStrong),
          ),
          child: Text(
            libelle,
            style: TextStyle(
              fontFamily: AppTextStyles.fontSans,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: desactive ? AppColors.ink4 : (actif ? Colors.white : AppColors.ink2),
            ),
          ),
        ),
      ),
    );
  }
}

/// Métrique affichable dans la carte « Évolution ».
class _Metrique {
  final String cle;
  final String libelle;
  final List<SeauTdb> serie;
  final String champ;
  final FormeCourbe forme;
  final String Function(num? v) format;
  const _Metrique(this.cle, this.libelle, this.serie, this.champ, this.forme, this.format);
}

String Function(num?) _unite(String singulier, [String? pluriel]) =>
    (v) => v == null ? 'Aucune donnée' : '${nombreFr(v)} ${v > 1 ? (pluriel ?? '${singulier}s') : singulier}';

class _ContenuStatistiques extends StatefulWidget {
  const _ContenuStatistiques({required this.d});
  final TableauDeBordMedecin d;

  @override
  State<_ContenuStatistiques> createState() => _ContenuStatistiquesState();
}

class _ContenuStatistiquesState extends State<_ContenuStatistiques> {
  String _metrique = 'vues';

  @override
  Widget build(BuildContext context) {
    final d = widget.d;
    final aud = d.audience;
    final act = d.activite;
    final rep = d.reputation;
    final detaillees = aud.disponible && aud.detaillees;

    final metriques = <_Metrique>[
      if (detaillees) ...[
        _Metrique('vues', 'Vues', aud.serie!, 'vues', FormeCourbe.aire, _unite('vue')),
        _Metrique('visiteurs', 'Visiteurs', aud.serie!, 'visiteurs', FormeCourbe.aire, _unite('visiteur')),
      ],
      _Metrique('rdv', 'RDV demandés', act.serie, 'rdv_demandes', FormeCourbe.colonnes, _unite('rendez-vous', 'rendez-vous')),
      _Metrique('consultations', 'Consultations', act.serie, 'consultations', FormeCourbe.colonnes, _unite('consultation')),
      _Metrique('patients', 'Nouveaux patients', act.serie, 'nouveaux_patients', FormeCourbe.colonnes, _unite('patient')),
      _Metrique('note', 'Note', rep.serie, 'note_moyenne', FormeCourbe.aire, (v) => v == null ? 'Aucun avis' : '${decimalFr(v)} / 5'),
      if (detaillees) _Metrique('engagements', 'Engagements', aud.serie!, 'engagements', FormeCourbe.colonnes, _unite('engagement')),
    ];
    final m = metriques.firstWhere((x) => x.cle == _metrique, orElse: () => metriques.first);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!d.fichePubliee) ...[
          ApsNote.text(
            "Votre fiche n'est pas encore publiée : elle n'est pas visible des patients, l'audience reste donc à zéro.",
            icon: Icons.hourglass_top_rounded,
            tone: ApsTone.amber,
          ),
          const SizedBox(height: 12),
        ],

        // Indicateurs clés.
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.42,
          children: [
            _Tuile(
              icone: Icons.visibility_outlined,
              libelle: 'Vues de la fiche',
              valeur: aud.disponible ? nombreFr(aud.vues) : null,
              variation: aud.variations['vues'],
              serie: detaillees ? aud.serie!.map((s) => s['vues']).toList() : null,
            ),
            _Tuile(
              icone: Icons.event_available_outlined,
              libelle: 'RDV demandés',
              valeur: nombreFr(act.total('rdv_demandes')),
              variation: act.variations['rdv_demandes'],
              serie: act.serie.map((s) => s['rdv_demandes']).toList(),
            ),
            _Tuile(
              icone: Icons.medical_services_outlined,
              libelle: 'Consultations',
              valeur: nombreFr(act.total('consultations')),
              variation: act.variations['consultations'],
              serie: act.serie.map((s) => s['consultations']).toList(),
            ),
            _Tuile(
              icone: Icons.person_add_alt_outlined,
              libelle: 'Nouveaux patients',
              valeur: nombreFr(act.total('nouveaux_patients')),
              variation: act.variations['nouveaux_patients'],
              serie: act.serie.map((s) => s['nouveaux_patients']).toList(),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Évolution.
        CarteReputation(
          titre: 'Évolution',
          icone: Icons.show_chart_rounded,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final x in metriques)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: _PuceMetrique(libelle: x.libelle, actif: x.cle == m.cle, onTap: () => setState(() => _metrique = x.cle)),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              CourbeTemporelle(
                key: ValueKey('${m.cle}-${d.granularite}-${d.du}'),
                serie: m.serie,
                champ: m.champ,
                granularite: d.granularite,
                forme: m.forme,
                formatValeur: m.format,
              ),
              if (aud.disponible && !aud.detaillees)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    'Les courbes d\'audience (vues, visiteurs, engagements) sont incluses dans les formules « statistiques détaillées ».',
                    style: AppTextStyles.xs,
                  ),
                ),
            ],
          ),
        ),

        // Réputation.
        CarteReputation(
          titre: 'Votre réputation',
          icone: Icons.star_outline_rounded,
          action: _LienTexte('Avis', onTap: () => vueActiviteMedecin.value = 1),
          child: rep.resume.nombre == 0
              ? Text("Aucun avis publié pour l'instant. Vos patients sont invités à noter chaque consultation terminée.",
                  style: AppTextStyles.small.copyWith(fontSize: 12.5))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Text(decimalFr(rep.resume.moyenne),
                            style: const TextStyle(fontFamily: AppTextStyles.fontSans, fontSize: 32, height: 1, fontWeight: FontWeight.w800, letterSpacing: -1, color: AppColors.ink)),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Etoiles(rep.resume.moyenne, taille: 15),
                              const SizedBox(height: 3),
                              Text('${nombreFr(rep.resume.nombre)} avis publiés', style: AppTextStyles.xs),
                            ],
                          ),
                        ),
                        if (rep.resume.tauxRecommandation != null)
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text('${rep.resume.tauxRecommandation} %', style: AppTextStyles.strong),
                              Text('recommandent', style: AppTextStyles.xs),
                            ],
                          ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    const Divider(height: 1),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: Text('Sur la période', style: AppTextStyles.small.copyWith(fontSize: 12.5))),
                        Text(
                          '${nombreFr(rep.avisPeriode)} avis${rep.notePeriode != null ? ' · ${decimalFr(rep.notePeriode)}/5' : ''}',
                          style: AppTextStyles.strong.copyWith(fontSize: 13),
                        ),
                      ],
                    ),
                  ],
                ),
        ),

        // Parcours patient.
        CarteReputation(
          titre: 'Parcours patient',
          icone: Icons.filter_alt_outlined,
          child: aud.disponible
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Entonnoir(etapes: [
                      EtapeEntonnoir('Visiteurs de la fiche', Icons.visibility_outlined, aud.visiteurs),
                      if (aud.engagementsParType != null)
                        EtapeEntonnoir('Clics « Prendre RDV »', Icons.touch_app_outlined, aud.engagementsParType!['clic_rdv'] ?? 0),
                      EtapeEntonnoir('RDV demandés', Icons.event_available_outlined, act.total('rdv_demandes')),
                      EtapeEntonnoir('RDV payés', Icons.credit_card_outlined, act.total('rdv_payes')),
                    ]),
                    const SizedBox(height: 12),
                    Text(
                      'Conversion : ${act.totaux['taux_conversion'] == null ? '—' : '${decimalFr(act.totaux['taux_conversion'])} %'} des visiteurs demandent un rendez-vous '
                      '(RDV pris hors fiche inclus).',
                      style: AppTextStyles.xs,
                    ),
                  ],
                )
              : const BlocVerrouille(texte: "Les statistiques d'audience ne sont pas incluses dans votre formule de présence."),
        ),

        // Engagements.
        CarteReputation(
          titre: 'Engagements sur votre fiche',
          icone: Icons.touch_app_outlined,
          child: detaillees
              ? _ListeEngagements(audience: aud)
              : aud.disponible
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(nombreFr(aud.engagements), style: AppTextStyles.l),
                        const SizedBox(height: 4),
                        Text('Le détail (RDV, contacts, itinéraires, partages, lectures des avis) est inclus dans les formules « statistiques détaillées ».',
                            style: AppTextStyles.xs),
                      ],
                    )
                  : const BlocVerrouille(texte: 'Découvrez ce que les patients font sur votre fiche avec une formule « statistiques ».'),
        ),

        // Créneaux.
        CarteReputation(
          titre: 'Créneaux les plus demandés',
          icone: Icons.calendar_view_week_outlined,
          child: GrilleCreneaux(carte: act.carte),
        ),

        // Activité détaillée.
        CarteReputation(
          titre: 'Activité détaillée',
          icone: Icons.receipt_long_outlined,
          child: Column(
            children: [
              _Ligne('Rendez-vous à venir (7 jours)', nombreFr(act.aVenir7Jours)),
              _Ligne('RDV payés',
                  '${nombreFr(act.total('rdv_payes'))}${act.totaux['taux_paiement'] != null ? '  ·  ${decimalFr(act.totaux['taux_paiement'])} %' : ''}'),
              _Ligne('Au cabinet / en vidéo', '${nombreFr(act.total('consultations_physiques'))} / ${nombreFr(act.total('teleconsultations'))}'),
              _Ligne(
                'Annulations de RDV payés',
                nombreFr(act.total('annulations')),
                suffixe: Variation(act.variations['annulations'], inverse: true),
                sousTitre: act.total('annulations_par_vous') > 0 ? 'dont ${act.total('annulations_par_vous')} par vous' : null,
              ),
              if (aud.disponible)
                _Ligne('Visiteurs uniques (cumul)', nombreFr(aud.visiteurs), suffixe: Variation(aud.variations['visiteurs']), dernier: true),
            ],
          ),
        ),
        if (aud.disponible)
          Text('Vos propres consultations de la fiche, celles d\'APS Santé et des robots ne sont pas comptées.',
              textAlign: TextAlign.center, style: AppTextStyles.xs),
      ],
    );
  }
}

class _Tuile extends StatelessWidget {
  const _Tuile({required this.icone, required this.libelle, required this.valeur, this.variation, this.serie});
  final IconData icone;
  final String libelle;

  /// null = non inclus dans l'abonnement (verrou).
  final String? valeur;
  final int? variation;
  final List<num?>? serie;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(13, 12, 13, 11),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(rayonReputation),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icone, size: 15, color: AppColors.b7),
              const SizedBox(width: 6),
              Expanded(
                child: Text(libelle, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: AppTextStyles.xs.copyWith(fontWeight: FontWeight.w700, color: AppColors.ink2)),
              ),
            ],
          ),
          const Spacer(),
          if (valeur == null) ...[
            const Icon(Icons.lock_outline_rounded, size: 16, color: AppColors.ink4),
            const SizedBox(height: 4),
            Text('Non inclus', style: AppTextStyles.xs),
          ] else ...[
            Text(valeur!, style: const TextStyle(fontFamily: AppTextStyles.fontSans, fontSize: 24, height: 1.1, fontWeight: FontWeight.w800, letterSpacing: -0.6, color: AppColors.ink)),
            const SizedBox(height: 6),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Variation(variation),
                const Spacer(),
                if (serie != null) Flexible(child: Sparkline(serie!, largeur: 60, hauteur: 22)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _PuceMetrique extends StatelessWidget {
  const _PuceMetrique({required this.libelle, required this.actif, required this.onTap});
  final String libelle;
  final bool actif;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: actif,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
          decoration: BoxDecoration(
            color: actif ? AppColors.b7 : AppColors.surface,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: actif ? AppColors.b7 : AppColors.lineStrong),
          ),
          child: Text(
            libelle,
            style: TextStyle(
              fontFamily: AppTextStyles.fontSans,
              fontSize: 11.5,
              fontWeight: FontWeight.w800,
              color: actif ? Colors.white : AppColors.ink2,
            ),
          ),
        ),
      ),
    );
  }
}

class _LienTexte extends StatelessWidget {
  const _LienTexte(this.libelle, {required this.onTap});
  final String libelle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(libelle, style: AppTextStyles.small.copyWith(fontWeight: FontWeight.w800, color: AppColors.b7)),
            const Icon(Icons.chevron_right_rounded, size: 18, color: AppColors.b7),
          ],
        ),
      ),
    );
  }
}

class _ListeEngagements extends StatelessWidget {
  const _ListeEngagements({required this.audience});
  final AudienceTdb audience;

  static const _types = [
    ('clic_rdv', 'Prendre RDV', Icons.touch_app_outlined),
    ('clic_contact', 'Contacts', Icons.call_outlined),
    ('clic_itineraire', 'Itinéraires', Icons.directions_outlined),
    ('partage', 'Partages', Icons.share_outlined),
    ('lecture_avis', 'Lectures des avis', Icons.reviews_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    final parType = audience.engagementsParType ?? const {};
    final max = math.max(1, parType.values.fold<int>(0, math.max));
    return Column(
      children: [
        for (final t in _types)
          Padding(
            padding: const EdgeInsets.only(bottom: 11),
            child: Row(
              children: [
                Icon(t.$3, size: 15, color: AppColors.b7),
                const SizedBox(width: 8),
                SizedBox(width: 112, child: Text(t.$2, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppTextStyles.small.copyWith(fontSize: 12))),
                const SizedBox(width: 8),
                Expanded(child: Piste(part: (parType[t.$1] ?? 0) / max)),
                SizedBox(
                  width: 36,
                  child: Text(nombreFr(parType[t.$1] ?? 0), textAlign: TextAlign.right, style: AppTextStyles.strong.copyWith(fontSize: 12.5)),
                ),
              ],
            ),
          ),
        const Divider(height: 1),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(child: Text("Taux d'engagement", style: AppTextStyles.small.copyWith(fontSize: 12.5))),
            Text(audience.tauxEngagement == null ? '—' : '${decimalFr(audience.tauxEngagement)} %', style: AppTextStyles.strong.copyWith(fontSize: 13)),
          ],
        ),
      ],
    );
  }
}

class _Ligne extends StatelessWidget {
  const _Ligne(this.libelle, this.valeur, {this.suffixe, this.sousTitre, this.dernier = false});
  final String libelle;
  final String valeur;
  final Widget? suffixe;
  final String? sousTitre;
  final bool dernier;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(border: dernier ? null : const Border(bottom: BorderSide(color: AppColors.line))),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(libelle, style: AppTextStyles.small.copyWith(fontSize: 12.5)),
                if (sousTitre != null) Text(sousTitre!, style: AppTextStyles.xs),
              ],
            ),
          ),
          Text(valeur, style: AppTextStyles.strong.copyWith(fontSize: 13)),
          if (suffixe != null) ...[const SizedBox(width: 8), suffixe!],
        ],
      ),
    );
  }
}

/* =================================== Avis =================================== */

/// Vue « Avis & notes » (réutilisée par [PageMesAvisMedecin]).
class VueAvisMedecin extends ConsumerStatefulWidget {
  const VueAvisMedecin({super.key});

  @override
  ConsumerState<VueAvisMedecin> createState() => VueAvisMedecinState();
}

class VueAvisMedecinState extends ConsumerState<VueAvisMedecin> {
  FiltreMesAvis _filtre = filtreMesAvisParDefaut;
  PageAvis? _dernier;

  void _filtrer({int? note, bool effacerNote = false, String? reponse, bool? avecCommentaire, String? tri, int page = 1}) {
    setState(() {
      _filtre = (
        note: effacerNote ? null : (note ?? _filtre.note),
        reponse: reponse ?? _filtre.reponse,
        avecCommentaire: avecCommentaire ?? _filtre.avecCommentaire,
        tri: tri ?? _filtre.tri,
        page: page,
      );
    });
  }

  String get _nomMedecin {
    final u = ref.read(authUtilisateurProvider);
    final nom = [u?.prenom, u?.nom].whereType<String>().join(' ').trim();
    return nom.isEmpty ? 'Le médecin' : 'Dr $nom';
  }

  static const _libellesTri = {
    'recent': 'Plus récents',
    'ancien': 'Plus anciens',
    'note_basse': 'Notes les plus basses',
    'note_haute': 'Notes les plus hautes',
  };

  Future<void> _ouvrirFiltres() async {
    final choix = await showApsFilterSheet<FiltreMesAvis>(
      context: context,
      initial: _filtre,
      reset: filtreMesAvisParDefaut,
      builder: (f, maj) => [
        ApsFilterSection(
          title: 'Réponse',
          child: ApsFilterChoices<String>(
            value: f.reponse,
            onChanged: (v) => maj((note: f.note, reponse: v, avecCommentaire: f.avecCommentaire, tri: f.tri, page: 1)),
            options: const [
              ApsFilterOption('', 'Tous'),
              ApsFilterOption('sans', 'Sans réponse'),
              ApsFilterOption('avec', 'Avec réponse'),
            ],
          ),
        ),
        ApsFilterSection(
          title: 'Note',
          child: ApsFilterChoices<int?>(
            value: f.note,
            onChanged: (v) => maj((note: v, reponse: f.reponse, avecCommentaire: f.avecCommentaire, tri: f.tri, page: 1)),
            options: [
              const ApsFilterOption(null, 'Toutes'),
              for (var n = 5; n >= 1; n--) ApsFilterOption(n, '$n ★'),
            ],
          ),
        ),
        ApsFilterSwitch(
          label: 'Avec commentaire',
          icon: Icons.notes_rounded,
          value: f.avecCommentaire,
          onChanged: (v) => maj((note: f.note, reponse: f.reponse, avecCommentaire: v, tri: f.tri, page: 1)),
        ),
        ApsFilterSection(
          title: 'Trier par',
          child: ApsFilterChoices<String>(
            value: f.tri,
            onChanged: (v) => maj((note: f.note, reponse: f.reponse, avecCommentaire: f.avecCommentaire, tri: v, page: 1)),
            options: [for (final e in _libellesTri.entries) ApsFilterOption(e.key, e.value)],
          ),
        ),
      ],
    );
    if (choix == null || !mounted) return;
    setState(() => _filtre = (
          note: choix.note,
          reponse: choix.reponse,
          avecCommentaire: choix.avecCommentaire,
          tri: choix.tri,
          page: 1,
        ));
  }

  void _recharger() => ref.invalidate(mesAvisMedecinProvider(_filtre));

  Future<void> _repondre(AvisPublic avis) async {
    final texte = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => _FeuilleTexte(
        titre: avis.reponse == null ? 'Répondre à ${avis.auteur}' : 'Modifier votre réponse',
        label: 'Votre réponse publique',
        aide: 'Visible par tous sous l\'avis. Ne mentionnez jamais d\'information médicale concernant le patient.',
        initial: avis.reponse ?? '',
        maxLength: 1500,
        boutonLibelle: 'Publier la réponse',
        minimum: 1,
      ),
    );
    if (texte == null || !mounted) return;
    try {
      await appelReputationEcran(ref, (repo, token) => repo.repondre(avis.avisId, texte, token: token));
      _recharger();
      _message('Réponse publiée sous l\'avis.');
    } catch (e) {
      _message('$e');
    }
  }

  Future<void> _retirerReponse(AvisPublic avis) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: const Text('Retirer votre réponse ?'),
        content: const Text('Elle ne sera plus visible sous cet avis. Vous pourrez en écrire une nouvelle.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.red),
            child: const Text('Retirer'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await appelReputationEcran(ref, (repo, token) => repo.supprimerReponse(avis.avisId, token: token));
      _recharger();
      _message('Réponse retirée.');
    } catch (e) {
      _message('$e');
    }
  }

  Future<void> _signaler(AvisPublic avis) async {
    final motif = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => const _FeuilleTexte(
        titre: 'Signaler cet avis',
        label: 'Motif du signalement',
        aide: 'Propos injurieux, personne inconnue, informations médicales… L\'avis reste en ligne pendant l\'examen par APS Santé.',
        maxLength: 500,
        boutonLibelle: 'Signaler',
        minimum: 10,
        danger: true,
      ),
    );
    if (motif == null || !mounted) return;
    try {
      final message = await appelReputationEcran(ref, (repo, token) => repo.signaler(avis.avisId, motif, token: token));
      _recharger();
      _message(message);
    } catch (e) {
      _message('$e');
    }
  }

  void _message(String texte) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(texte)));
  }

  @override
  Widget build(BuildContext context) {
    final etat = ref.watch(mesAvisMedecinProvider(_filtre));
    final page = etat.value ?? _dernier;
    if (etat.value != null) _dernier = etat.value;

    return RefreshIndicator(
      color: AppColors.b7,
      onRefresh: () => ref.refresh(mesAvisMedecinProvider(_filtre).future),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 120),
        children: [
          if (page == null && etat.hasError)
            ApsEmptyState(
              icon: Icons.wifi_off_rounded,
              tone: ApsTone.neutral,
              title: 'Avis indisponibles',
              message: '${etat.error}',
              actionLabel: 'Réessayer',
              onAction: _recharger,
            )
          else if (page == null)
            const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))
          else ...[
            CarteReputation(
              child: ResumeNotesVue(
                resume: page.resume,
                filtreNote: _filtre.note,
                onFiltrerNote: (n) => n == null ? _filtrer(effacerNote: true) : _filtrer(note: n),
              ),
            ),
            if (page.sansReponse > 0)
              _Alerte(
                icone: Icons.reply_rounded,
                texte: '${page.sansReponse} avis attendent votre réponse',
                onTap: () => _filtrer(reponse: 'sans'),
              ),
            if (page.enAttenteModeration > 0)
              _Alerte(
                icone: Icons.hourglass_top_rounded,
                texte: '${page.enAttenteModeration} nouvel${page.enAttenteModeration > 1 ? 's' : ''} avis en cours de vérification par APS Santé',
                info: true,
              ),
            const SizedBox(height: 6),
            ApsFilterBar(
              onOpen: _ouvrirFiltres,
              actifs: [
                if (_filtre.reponse.isNotEmpty)
                  (
                    label: _filtre.reponse == 'sans' ? 'Sans réponse' : 'Avec réponse',
                    icon: Icons.reply_rounded,
                    onRemove: () => _filtrer(reponse: ''),
                  ),
                if (_filtre.avecCommentaire)
                  (
                    label: 'Avec commentaire',
                    icon: Icons.notes_rounded,
                    onRemove: () => _filtrer(avecCommentaire: false),
                  ),
                if (_filtre.note != null)
                  (
                    label: '${_filtre.note} ★',
                    icon: null,
                    onRemove: () => _filtrer(effacerNote: true),
                  ),
                if (_filtre.tri != 'recent')
                  (
                    label: _libellesTri[_filtre.tri] ?? _filtre.tri,
                    icon: Icons.swap_vert_rounded,
                    onRemove: () => _filtrer(tri: 'recent'),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            AnimatedOpacity(
              duration: const Duration(milliseconds: 200),
              opacity: etat.isLoading ? 0.5 : 1,
              child: page.avis.isEmpty
                  ? ApsEmptyState(
                      icon: Icons.forum_outlined,
                      tone: ApsTone.neutral,
                      title: page.resume.nombre == 0 ? 'Pas encore d\'avis publié' : 'Aucun avis pour ces filtres',
                    )
                  : Column(
                      children: [
                        for (final avis in page.avis)
                          CarteAvisVue(
                            avis: avis,
                            nomMedecin: _nomMedecin,
                            libelleReponse: 'Votre réponse',
                            pied: Row(
                              children: [
                                if (avis.reponse == null)
                                  _Action('Répondre', Icons.reply_rounded, () => _repondre(avis), principal: true)
                                else ...[
                                  _Action('Modifier', Icons.edit_outlined, () => _repondre(avis)),
                                  _Action('Retirer', Icons.delete_outline_rounded, () => _retirerReponse(avis)),
                                ],
                                const Spacer(),
                                if (avis.signaleLe == null) _Action('Signaler', Icons.outlined_flag_rounded, () => _signaler(avis)),
                              ],
                            ),
                          ),
                      ],
                    ),
            ),
            if (page.pagination.pages > 1)
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    onPressed: _filtre.page > 1 ? () => _filtrer(page: _filtre.page - 1) : null,
                    icon: const Icon(Icons.chevron_left_rounded),
                  ),
                  Text('Page ${page.pagination.page} sur ${page.pagination.pages}', style: AppTextStyles.small),
                  IconButton(
                    onPressed: _filtre.page < page.pagination.pages ? () => _filtrer(page: _filtre.page + 1) : null,
                    icon: const Icon(Icons.chevron_right_rounded),
                  ),
                ],
              ),
          ],
        ],
      ),
    );
  }
}

class _Alerte extends StatelessWidget {
  const _Alerte({required this.icone, required this.texte, this.onTap, this.info = false});
  final IconData icone;
  final String texte;
  final VoidCallback? onTap;
  final bool info;

  @override
  Widget build(BuildContext context) {
    final couleur = info ? AppColors.b8 : AppColors.amber700;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          decoration: BoxDecoration(
            color: info ? AppColors.b0 : AppColors.amber100,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              Icon(icone, size: 16, color: couleur),
              const SizedBox(width: 9),
              Expanded(child: Text(texte, style: AppTextStyles.small.copyWith(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.ink))),
              if (onTap != null) Icon(Icons.chevron_right_rounded, size: 18, color: couleur),
            ],
          ),
        ),
      ),
    );
  }
}

class _Action extends StatelessWidget {
  const _Action(this.libelle, this.icone, this.onTap, {this.principal = false});
  final String libelle;
  final IconData icone;
  final VoidCallback onTap;
  final bool principal;

  @override
  Widget build(BuildContext context) {
    final couleur = principal ? AppColors.b7 : AppColors.ink2;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icone, size: 16, color: couleur),
            const SizedBox(width: 5),
            Text(libelle, style: AppTextStyles.small.copyWith(fontSize: 12.5, fontWeight: FontWeight.w800, color: couleur)),
          ],
        ),
      ),
    );
  }
}

/// Feuille de saisie d'un texte (réponse publique, motif de signalement).
class _FeuilleTexte extends StatefulWidget {
  const _FeuilleTexte({
    required this.titre,
    required this.label,
    required this.aide,
    required this.maxLength,
    required this.boutonLibelle,
    required this.minimum,
    this.initial = '',
    this.danger = false,
  });

  final String titre;
  final String label;
  final String aide;
  final int maxLength;
  final String boutonLibelle;
  final int minimum;
  final String initial;
  final bool danger;

  @override
  State<_FeuilleTexte> createState() => _FeuilleTexteState();
}

class _FeuilleTexteState extends State<_FeuilleTexte> {
  late final _controleur = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _controleur.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final valide = _controleur.text.trim().length >= widget.minimum;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ApsSheetHeader(title: widget.titre),
              const SizedBox(height: 4),
              Text(widget.aide, style: AppTextStyles.small.copyWith(fontSize: 12)),
              const SizedBox(height: 14),
              TextField(
                controller: _controleur,
                autofocus: true,
                minLines: 3,
                maxLines: 6,
                maxLength: widget.maxLength,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: widget.label, alignLabelWithHint: true),
              ),
              const SizedBox(height: 6),
              ApsButton(
                label: widget.boutonLibelle,
                variant: widget.danger ? ApsButtonVariant.dark : ApsButtonVariant.primary,
                onPressed: valide ? () => Navigator.of(context).pop(_controleur.text.trim()) : null,
              ),
              if (widget.minimum > 1 && !valide)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('${widget.minimum} caractères au moins.', textAlign: TextAlign.center, style: AppTextStyles.xs),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
