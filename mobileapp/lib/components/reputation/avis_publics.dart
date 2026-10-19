// lib/components/reputation/avis_publics.dart
//
// Avis sur la fiche publique d'un médecin (GET /medecins/:id/avis, public) :
//   - [SectionAvisPublics] : synthèse + deux derniers avis, sous la fiche ;
//   - [PageAvisPublics]    : tous les avis, filtre par note (toucher la
//     répartition), tri, « Voir plus ».
// L'ouverture de la page complète compte comme engagement « lecture_avis ».

import 'package:flutter/material.dart';

import '../../models/reputation_medecin_models.dart';
import '../../repositories/reputation_medecin_repository.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';
import '../ui/aps_filter_sheet.dart';
import '../ui/aps_ui.dart';
import 'avis_widgets.dart';
import 'reputation_ui.dart';

final _repo = ReputationMedecinRepository();

class SectionAvisPublics extends StatefulWidget {
  const SectionAvisPublics({super.key, required this.medecinId, required this.nomMedecin, this.token});
  final String medecinId;
  final String nomMedecin;
  final String? token;

  @override
  State<SectionAvisPublics> createState() => _SectionAvisPublicsState();
}

class _SectionAvisPublicsState extends State<SectionAvisPublics> {
  late Future<PageAvis> _page = _repo.avisPublics(widget.medecinId, parPage: 2);

  void _ouvrirTout() {
    _repo.signalerEngagement(widget.medecinId, 'lecture_avis', token: widget.token);
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PageAvisPublics(medecinId: widget.medecinId, nomMedecin: widget.nomMedecin),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<PageAvis>(
      future: _page,
      builder: (context, snap) {
        if (snap.hasError) {
          return CarteReputation(
            titre: 'Avis des patients',
            icone: Icons.star_outline_rounded,
            child: Row(
              children: [
                Expanded(child: Text('Avis momentanément indisponibles.', style: AppTextStyles.small)),
                TextButton(
                  onPressed: () => setState(() => _page = _repo.avisPublics(widget.medecinId, parPage: 2)),
                  child: const Text('Réessayer'),
                ),
              ],
            ),
          );
        }
        final page = snap.data;
        if (page == null) {
          return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            CarteReputation(
              titre: 'Avis des patients',
              icone: Icons.star_outline_rounded,
              action: page.resume.nombre > 0
                  ? GestureDetector(
                      onTap: _ouvrirTout,
                      child: Text('Tout voir', style: AppTextStyles.small.copyWith(fontWeight: FontWeight.w800, color: AppColors.b7)),
                    )
                  : null,
              child: ResumeNotesVue(resume: page.resume),
            ),
            for (final a in page.avis) CarteAvisVue(avis: a, nomMedecin: widget.nomMedecin),
            if (page.pagination.total > page.avis.length)
              ApsButton(
                label: 'Voir les ${page.pagination.total} avis',
                variant: ApsButtonVariant.ghost,
                small: true,
                onPressed: _ouvrirTout,
              ),
            const SizedBox(height: 10),
            Row(
              children: [
                const Icon(Icons.shield_outlined, size: 13, color: AppColors.ink3),
                const SizedBox(width: 6),
                Expanded(
                  child: Text('Seuls les patients ayant consulté via APS Santé peuvent laisser un avis, vérifié avant publication.',
                      style: AppTextStyles.xs),
                ),
              ],
            ),
          ],
        );
      },
    );
  }
}

class PageAvisPublics extends StatefulWidget {
  const PageAvisPublics({super.key, required this.medecinId, required this.nomMedecin});
  final String medecinId;
  final String nomMedecin;

  @override
  State<PageAvisPublics> createState() => _PageAvisPublicsState();
}

class _PageAvisPublicsState extends State<PageAvisPublics> {
  int? _note;
  String _tri = 'recent';
  int _page = 1;
  ResumeNotes? _resume;
  final List<AvisPublic> _avis = [];
  PaginationAvis? _pagination;
  bool _chargement = true;
  Object? _erreur;

  @override
  void initState() {
    super.initState();
    _charger(1);
  }

  Future<void> _charger(int page) async {
    setState(() {
      _chargement = true;
      _erreur = null;
    });
    try {
      final r = await _repo.avisPublics(widget.medecinId, note: _note, tri: _tri, page: page);
      if (!mounted) return;
      setState(() {
        _page = page;
        _resume = r.resume;
        if (page == 1) _avis.clear();
        _avis.addAll(r.avis);
        _pagination = r.pagination;
      });
    } catch (e) {
      if (mounted) setState(() => _erreur = e);
    } finally {
      if (mounted) setState(() => _chargement = false);
    }
  }

  void _filtrer({int? note, bool effacerNote = false, String? tri}) {
    _note = effacerNote ? null : (note ?? _note);
    _tri = tri ?? _tri;
    _charger(1);
  }

  Future<void> _ouvrirFiltres() async {
    final choix = await showApsFilterSheet<({int? note, String tri})>(
      context: context,
      initial: (note: _note, tri: _tri),
      reset: (note: null, tri: 'recent'),
      builder: (f, maj) => [
        ApsFilterSection(
          title: 'Note',
          child: ApsFilterChoices<int?>(
            value: f.note,
            onChanged: (v) => maj((note: v, tri: f.tri)),
            options: [
              const ApsFilterOption(null, 'Toutes'),
              for (var n = 5; n >= 1; n--) ApsFilterOption(n, '$n ★'),
            ],
          ),
        ),
        ApsFilterSection(
          title: 'Trier par',
          child: ApsFilterChoices<String>(
            value: f.tri,
            onChanged: (v) => maj((note: f.note, tri: v)),
            options: const [
              ApsFilterOption('recent', 'Plus récents'),
              ApsFilterOption('note_haute', 'Meilleures notes'),
              ApsFilterOption('note_basse', 'Notes les plus basses'),
            ],
          ),
        ),
      ],
    );
    if (choix == null || !mounted) return;
    _note = choix.note;
    _tri = choix.tri;
    _charger(1);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 18),
              child: ApsTopBar(title: 'Avis des patients', overline: widget.nomMedecin),
            ),
            Expanded(
              child: _resume == null
                  ? Center(
                      child: _erreur != null
                          ? ApsEmptyState(
                              icon: Icons.wifi_off_rounded,
                              tone: ApsTone.neutral,
                              title: 'Avis indisponibles',
                              message: '$_erreur',
                              actionLabel: 'Réessayer',
                              onAction: () => _charger(1),
                            )
                          : const CircularProgressIndicator(),
                    )
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(18, 0, 18, 32),
                      children: [
                        CarteReputation(
                          child: ResumeNotesVue(
                            resume: _resume!,
                            filtreNote: _note,
                            onFiltrerNote: (n) => n == null ? _filtrer(effacerNote: true) : _filtrer(note: n),
                          ),
                        ),
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                '${_pagination?.total ?? 0} avis${_note != null ? ' à $_note étoile${_note! > 1 ? 's' : ''}' : ''}',
                                style: AppTextStyles.small.copyWith(fontWeight: FontWeight.w700),
                              ),
                            ),
                            ApsChip(
                              'Filtres',
                              icon: Icons.tune_rounded,
                              selected: _note != null || _tri != 'recent',
                              count: (_note != null ? 1 : 0) + (_tri != 'recent' ? 1 : 0),
                              onTap: _ouvrirFiltres,
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        for (final a in _avis) CarteAvisVue(avis: a, nomMedecin: widget.nomMedecin),
                        if (_avis.isEmpty && !_chargement)
                          const ApsEmptyState(icon: Icons.forum_outlined, tone: ApsTone.neutral, title: 'Aucun avis pour ce filtre'),
                        if (_pagination != null && _page < _pagination!.pages)
                          ApsButton(
                            label: "Voir plus d'avis",
                            variant: ApsButtonVariant.ghost,
                            small: true,
                            loading: _chargement,
                            onPressed: () => _charger(_page + 1),
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
