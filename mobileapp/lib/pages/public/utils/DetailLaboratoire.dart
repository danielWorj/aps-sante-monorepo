// lib/pages/public/utils/DetailLaboratoire.dart
//
// Fiche publique d'un laboratoire d'analyses (pendant mobile de
// client-plateform/src/pages/FicheLaboratoire.jsx) : en-tête, actions
// (appeler, e-mail, itinéraire, partager), onglets Infos / Examens /
// Centres / Avis / Galerie. Les actions du visiteur sont signalées au
// serveur (tableau de bord du laboratoire) sans jamais bloquer l'écran.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../components/components.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/laboratoire_controller.dart';
import '../../../models/laboratoire_models.dart';
import '../../../utils/mon_espace_navigation.dart';

class DetailLaboratoirePage extends ConsumerStatefulWidget {
  const DetailLaboratoirePage({super.key, required this.laboratoireId, this.apercu});

  final String laboratoireId;

  /// Fiche de l'annuaire, affichée pendant le chargement du détail.
  final Laboratoire? apercu;

  @override
  ConsumerState<DetailLaboratoirePage> createState() => _DetailLaboratoirePageState();
}

enum _Onglet { infos, examens, centres, avis, galerie }

class _DetailLaboratoirePageState extends ConsumerState<DetailLaboratoirePage> {
  _Onglet _onglet = _Onglet.infos;

  void _signaler(String type) =>
      ref.read(laboratoireRepositoryProvider).signalerEngagement(widget.laboratoireId, type, token: ref.read(authTokenProvider));

  Future<void> _ouvrirLien(Uri uri, String engagement) async {
    _signaler(engagement);
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Impossible d'ouvrir l'application.")));
    }
  }

  void _choisirOnglet(_Onglet o) {
    setState(() => _onglet = o);
    if (o == _Onglet.examens) _signaler('lecture_examens');
    if (o == _Onglet.avis) _signaler('lecture_avis');
  }

  Future<void> _partager(Laboratoire l) async {
    _signaler('partage');
    final texte = [l.nom, if (l.localisation.isNotEmpty) l.localisation, l.lieu, 'Tél. ${l.telephone}', 'Trouvé sur APS Santé']
        .where((s) => s.isNotEmpty)
        .join('\n');
    await Clipboard.setData(ClipboardData(text: texte));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Coordonnées du laboratoire copiées.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(detailLaboratoireProvider(widget.laboratoireId));
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: detail.when(
          loading: () => Column(
            children: [
              _barre(context),
              if (widget.apercu != null) Padding(padding: const EdgeInsets.symmetric(horizontal: 18), child: _EnTete(laboratoire: widget.apercu!)),
              const Expanded(child: Center(child: CircularProgressIndicator())),
            ],
          ),
          error: (e, _) => Column(
            children: [
              _barre(context),
              Expanded(
                child: ApsEmptyState(
                  icon: Icons.error_outline_rounded,
                  tone: ApsTone.neutral,
                  title: 'Fiche indisponible',
                  message: '$e',
                  actionLabel: 'Réessayer',
                  onAction: () => ref.invalidate(detailLaboratoireProvider(widget.laboratoireId)),
                ),
              ),
            ],
          ),
          data: (d) => _contenu(context, d),
        ),
      ),
    );
  }

  Widget _barre(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(10, 4, 10, 4),
        child: Row(
          children: [
            ApsIconButton(icon: Icons.arrow_back_rounded, tooltip: 'Retour', onPressed: () => Navigator.of(context).maybePop()),
            const SizedBox(width: 6),
            const Expanded(child: Text('Laboratoire', style: AppTextStyles.section)),
          ],
        ),
      );

  Widget _contenu(BuildContext context, DetailLaboratoire d) {
    final l = d.laboratoire;
    final onglets = <(_Onglet, String)>[
      (_Onglet.infos, 'Infos'),
      (_Onglet.examens, 'Examens (${d.examens.length})'),
      (_Onglet.centres, 'Centres (${d.centres.length})'),
      (_Onglet.avis, 'Avis (${l.resumeAvis.nombre})'),
      if (d.medias.isNotEmpty) (_Onglet.galerie, 'Galerie (${d.medias.length})'),
    ];
    return RefreshIndicator(
      onRefresh: () => ref.refresh(detailLaboratoireProvider(widget.laboratoireId).future),
      child: ListView(
        padding: EdgeInsets.fromLTRB(0, 0, 0, 24 + MediaQuery.paddingOf(context).bottom),
        children: [
          _barre(context),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!l.estPublie)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 10),
                    child: _Bandeau(texte: "Aperçu de votre fiche : elle n'est pas encore visible du public (vérification en cours)."),
                  ),
                _EnTete(laboratoire: l),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _Action(
                        icone: Icons.call_outlined,
                        libelle: 'Appeler',
                        principal: true,
                        onTap: () => _ouvrirLien(Uri(scheme: 'tel', path: l.telephone), 'clic_telephone'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _Action(
                        icone: Icons.mail_outline_rounded,
                        libelle: 'E-mail',
                        onTap: () => _ouvrirLien(Uri(scheme: 'mailto', path: l.email), 'clic_email'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (l.geolocalisation != null) ...[
                      Expanded(
                        child: _Action(
                          icone: Icons.directions_outlined,
                          libelle: 'Itinéraire',
                          onTap: () => _ouvrirLien(_itineraire(l.geolocalisation!), 'clic_itineraire'),
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                    Expanded(child: _Action(icone: Icons.share_outlined, libelle: 'Partager', onTap: () => _partager(l))),
                  ],
                ),
                const SizedBox(height: 14),
              ],
            ),
          ),
          SizedBox(
            height: 38,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 18),
              children: [
                for (final (o, libelle) in onglets)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: _PuceOnglet(libelle: libelle, actif: _onglet == o, onTap: () => _choisirOnglet(o)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: switch (_onglet) {
              _Onglet.infos => _PanneauInfos(laboratoire: l),
              _Onglet.examens => _PanneauExamens(examens: d.examens, categories: d.categories, devise: l.devise),
              _Onglet.centres => _PanneauCentres(centres: d.centres, onLien: _ouvrirLien),
              _Onglet.avis => _PanneauAvis(laboratoire: l),
              _Onglet.galerie => _PanneauGalerie(medias: d.medias),
            },
          ),
        ],
      ),
    );
  }
}

Uri _itineraire(PointGps p) => Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}');

/* ============================ Éléments communs ============================ */

BoxDecoration _carte() => BoxDecoration(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(10),
      border: Border.all(color: AppColors.line),
    );

class _Bloc extends StatelessWidget {
  const _Bloc({required this.titre, required this.icone, required this.child});

  final String titre;
  final IconData icone;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: _carte(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(icone, size: 17, color: AppColors.b7),
              const SizedBox(width: 8),
              Expanded(child: Text(titre, style: AppTextStyles.strong)),
            ]),
            const SizedBox(height: 10),
            child,
          ],
        ),
      );
}

class _Bandeau extends StatelessWidget {
  const _Bandeau({required this.texte});
  final String texte;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: AppColors.amber100, borderRadius: BorderRadius.circular(8)),
        child: Row(children: [
          const Icon(Icons.visibility_outlined, size: 16, color: AppColors.amber700),
          const SizedBox(width: 8),
          Expanded(child: Text(texte, style: AppTextStyles.xs.copyWith(color: AppColors.amber700))),
        ]),
      );
}

class _EnTete extends StatelessWidget {
  const _EnTete({required this.laboratoire});
  final Laboratoire laboratoire;

  @override
  Widget build(BuildContext context) {
    final l = laboratoire;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ApsVignette(
          imageUrl: l.imageUrl,
          size: 68,
          radius: 10,
          repli: Container(
            width: 68,
            height: 68,
            decoration: BoxDecoration(color: AppColors.b0, borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.biotech_outlined, color: AppColors.b7, size: 30),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l.nom, style: AppTextStyles.l),
              const SizedBox(height: 3),
              Text(l.lieu.isEmpty ? "Laboratoire d'analyses" : "Laboratoire d'analyses · ${l.lieu}", style: AppTextStyles.xs),
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (l.estPublie) const _Puce(icone: Icons.verified_rounded, texte: 'Vérifié APS'),
                  if (l.agrement.isNotEmpty) _Puce(texte: 'Agrément ${l.agrement}'),
                  if (l.resumeAvis.moyenne != null) ApsStars(l.resumeAvis.moyenne!, count: l.resumeAvis.nombre),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Puce extends StatelessWidget {
  const _Puce({required this.texte, this.icone});
  final String texte;
  final IconData? icone;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: AppColors.b1, borderRadius: BorderRadius.circular(6)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icone != null) ...[Icon(icone, size: 12, color: AppColors.b8), const SizedBox(width: 3)],
          Text(texte, style: AppTextStyles.xs.copyWith(color: AppColors.b8, fontWeight: FontWeight.w600)),
        ]),
      );
}

class _Action extends StatelessWidget {
  const _Action({required this.icone, required this.libelle, required this.onTap, this.principal = false});
  final IconData icone;
  final String libelle;
  final VoidCallback onTap;
  final bool principal;

  @override
  Widget build(BuildContext context) => Material(
        color: principal ? AppColors.b7 : AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(color: principal ? AppColors.b7 : AppColors.line),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Column(children: [
              Icon(icone, size: 19, color: principal ? Colors.white : AppColors.b7),
              const SizedBox(height: 3),
              Text(libelle, style: AppTextStyles.xs.copyWith(color: principal ? Colors.white : AppColors.ink, fontWeight: FontWeight.w600)),
            ]),
          ),
        ),
      );
}

class _PuceOnglet extends StatelessWidget {
  const _PuceOnglet({required this.libelle, required this.actif, required this.onTap});
  final String libelle;
  final bool actif;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: actif ? AppColors.ink : AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8), side: BorderSide(color: actif ? AppColors.ink : AppColors.line)),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            child: Text(libelle, style: AppTextStyles.xs.copyWith(color: actif ? Colors.white : AppColors.ink, fontWeight: FontWeight.w600)),
          ),
        ),
      );
}

/* ============================ Onglets ============================ */

class _PanneauInfos extends StatelessWidget {
  const _PanneauInfos({required this.laboratoire});
  final Laboratoire laboratoire;

  @override
  Widget build(BuildContext context) {
    final l = laboratoire;
    return Column(children: [
      _Bloc(
        titre: 'Informations générales',
        icone: Icons.biotech_outlined,
        child: Column(children: [
          ApsKeyValue('Adresse', [l.localisation, l.lieu].where((s) => s.isNotEmpty).join(', ')),
          ApsKeyValue('Téléphone', l.telephone),
          ApsKeyValue('E-mail', l.email),
          ApsKeyValue('Agrément', l.agrement),
        ]),
      ),
      if ((l.description ?? '').trim().isNotEmpty)
        _Bloc(titre: 'Présentation', icone: Icons.info_outline_rounded, child: Text(l.description!, style: AppTextStyles.body)),
      ApsNote.text(
        'les résultats sont remis directement par le laboratoire.',
        bold: 'Bon à savoir :',
        icon: Icons.info_outline_rounded,
      ),
    ]);
  }
}

class _PanneauExamens extends StatefulWidget {
  const _PanneauExamens({required this.examens, required this.categories, required this.devise});
  final List<ExamenLaboratoire> examens;
  final List<String> categories;
  final String? devise;

  @override
  State<_PanneauExamens> createState() => _PanneauExamensState();
}

class _PanneauExamensState extends State<_PanneauExamens> {
  final _recherche = TextEditingController();
  String? _categorie;

  @override
  void dispose() {
    _recherche.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.examens.isEmpty) {
      return const ApsEmptyState(icon: Icons.science_outlined, tone: ApsTone.neutral, title: 'Aucun examen publié', message: "Ce laboratoire n'a pas encore publié ses examens.");
    }
    final q = _recherche.text.trim().toLowerCase();
    final liste = widget.examens
        .where((e) => (_categorie == null || e.categorie == _categorie) && (q.isEmpty || e.nom.toLowerCase().contains(q)))
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ApsSearchField(controller: _recherche, hint: 'Rechercher un examen…', onChanged: (_) => setState(() {})),
        if (widget.categories.isNotEmpty) ...[
          const SizedBox(height: 10),
          Wrap(spacing: 6, runSpacing: 6, children: [
            _PuceOnglet(libelle: 'Tous', actif: _categorie == null, onTap: () => setState(() => _categorie = null)),
            for (final c in widget.categories) _PuceOnglet(libelle: c, actif: _categorie == c, onTap: () => setState(() => _categorie = c)),
          ]),
        ],
        const SizedBox(height: 12),
        if (liste.isEmpty) Text('Aucun examen pour ces critères.', style: AppTextStyles.xs),
        for (final e in liste)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: _carte(),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(child: Text(e.nom, style: AppTextStyles.strong)),
                  const SizedBox(width: 8),
                  Text(formaterPrixExamen(e.prix, widget.devise), style: AppTextStyles.strong.copyWith(color: AppColors.b8)),
                ]),
                if (e.categorie != null) ...[const SizedBox(height: 4), _Puce(texte: e.categorie!)],
                if ((e.description ?? '').isNotEmpty) ...[const SizedBox(height: 6), Text(e.description!, style: AppTextStyles.xs)],
                if (e.delaiResultat != null || e.preparation != null) const SizedBox(height: 6),
                if (e.delaiResultat != null) _LigneIcone(icone: Icons.schedule_rounded, texte: 'Résultat : ${e.delaiResultat}'),
                if (e.preparation != null) _LigneIcone(icone: Icons.error_outline_rounded, texte: e.preparation!),
              ],
            ),
          ),
        const SizedBox(height: 4),
        Text('Tarifs indicatifs communiqués par le laboratoire, à confirmer sur place.', style: AppTextStyles.xs),
      ],
    );
  }
}

class _LigneIcone extends StatelessWidget {
  const _LigneIcone({required this.icone, required this.texte});
  final IconData icone;
  final String texte;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icone, size: 13, color: AppColors.ink3),
          const SizedBox(width: 5),
          Expanded(child: Text(texte, style: AppTextStyles.xs)),
        ]),
      );
}

class _PanneauCentres extends StatelessWidget {
  const _PanneauCentres({required this.centres, required this.onLien});
  final List<CentreLaboratoire> centres;
  final Future<void> Function(Uri uri, String engagement) onLien;

  @override
  Widget build(BuildContext context) {
    if (centres.isEmpty) {
      return const ApsEmptyState(icon: Icons.place_outlined, tone: ApsTone.neutral, title: 'Aucun centre renseigné');
    }
    return Column(children: [
      for (final c in centres)
        Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: _carte(),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(c.nom, style: AppTextStyles.strong),
                const SizedBox(height: 3),
                _LigneIcone(icone: Icons.place_outlined, texte: [c.localisation, c.villeNom].whereType<String>().where((s) => s.isNotEmpty).join(', ')),
                if (c.horaires != null) _LigneIcone(icone: Icons.schedule_rounded, texte: c.horaires!),
              ]),
            ),
            if (c.telephone != null)
              ApsIconButton(icon: Icons.call_outlined, tooltip: 'Appeler', onPressed: () => onLien(Uri(scheme: 'tel', path: c.telephone), 'clic_telephone')),
            if (c.gps != null)
              ApsIconButton(icon: Icons.directions_outlined, tooltip: 'Itinéraire', onPressed: () => onLien(_itineraire(c.gps!), 'clic_itineraire')),
          ]),
        ),
    ]);
  }
}

class _PanneauGalerie extends StatelessWidget {
  const _PanneauGalerie({required this.medias});
  final List<MediaLaboratoire> medias;

  @override
  Widget build(BuildContext context) => GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        children: [
          for (final m in medias)
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: InkWell(
                onTap: () => launchUrl(Uri.parse(m.url), mode: LaunchMode.externalApplication),
                child: Stack(fit: StackFit.expand, children: [
                  if (m.vignetteUrl != null)
                    Image.network(m.vignetteUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => Container(color: AppColors.segment))
                  else
                    Container(color: AppColors.segment),
                  if (m.estVideo) const Center(child: Icon(Icons.play_circle_fill_rounded, color: Colors.white, size: 40)),
                ]),
              ),
            ),
        ],
      );
}

/* ============================ Avis ============================ */

class _PanneauAvis extends ConsumerStatefulWidget {
  const _PanneauAvis({required this.laboratoire});
  final Laboratoire laboratoire;

  @override
  ConsumerState<_PanneauAvis> createState() => _PanneauAvisState();
}

class _PanneauAvisState extends ConsumerState<_PanneauAvis> {
  final List<AvisLaboratoire> _avis = [];
  PageAvisLaboratoire? _page;
  bool _chargement = true;
  String? _erreur;

  @override
  void initState() {
    super.initState();
    _charger(1);
  }

  Future<void> _charger(int page) async {
    setState(() => _chargement = true);
    try {
      final p = await ref.read(laboratoireRepositoryProvider).avis(widget.laboratoire.id, token: ref.read(authTokenProvider), page: page);
      if (!mounted) return;
      setState(() {
        if (page == 1) _avis.clear();
        _avis.addAll(p.avis);
        _page = p;
        _erreur = null;
      });
    } catch (e) {
      if (mounted) setState(() => _erreur = '$e');
    } finally {
      if (mounted) setState(() => _chargement = false);
    }
  }

  Future<void> _donnerAvis() async {
    final connecte = ref.read(authTokenProvider) != null;
    if (!connecte) {
      await ouvrirAvecSession(context, (_) => DetailLaboratoirePage(laboratoireId: widget.laboratoire.id));
      return;
    }
    final envoye = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => _FeuilleAvis(laboratoireId: widget.laboratoire.id, monAvis: _page?.monAvis),
    );
    if (envoye == true) _charger(1);
  }

  @override
  Widget build(BuildContext context) {
    final p = _page;
    if (p == null) {
      return _erreur != null
          ? ApsEmptyState(icon: Icons.error_outline_rounded, tone: ApsTone.neutral, title: 'Avis indisponibles', message: _erreur, actionLabel: 'Réessayer', onAction: () => _charger(1))
          : const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
    }
    final r = p.resume;
    final peutNoter = !widget.laboratoire.estGestionnaire && widget.laboratoire.estPublie;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Bloc(
          titre: 'Note des utilisateurs',
          icone: Icons.star_outline_rounded,
          child: r.nombre == 0
              ? Text("Pas encore d'avis publié sur ce laboratoire.", style: AppTextStyles.xs)
              : Row(children: [
                  Column(children: [
                    Text(r.moyenne!.toStringAsFixed(1), style: AppTextStyles.xl),
                    Text('${r.nombre} avis', style: AppTextStyles.xs),
                  ]),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(children: [
                      for (var n = 5; n >= 1; n--)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: Row(children: [
                            SizedBox(width: 12, child: Text('$n', style: AppTextStyles.xs)),
                            const SizedBox(width: 6),
                            Expanded(
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(3),
                                child: LinearProgressIndicator(
                                  value: r.nombre == 0 ? 0 : (r.distribution[n] ?? 0) / r.nombre,
                                  minHeight: 6,
                                  backgroundColor: AppColors.segment,
                                  color: AppColors.b7,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            SizedBox(width: 22, child: Text('${r.distribution[n] ?? 0}', style: AppTextStyles.xs, textAlign: TextAlign.right)),
                          ]),
                        ),
                    ]),
                  ),
                ]),
        ),
        if (peutNoter) ...[
          if (p.monAvis != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                switch (p.monAvis!.statut) {
                  'publie' => 'Votre avis est publié.',
                  'rejete' => "Votre avis n'a pas été publié : vous pouvez le reformuler.",
                  _ => 'Votre avis est en cours de vérification.',
                },
                style: AppTextStyles.xs,
              ),
            ),
          ApsButton(
            label: p.monAvis == null ? 'Donner mon avis' : 'Modifier mon avis',
            icon: Icons.rate_review_outlined,
            onPressed: _donnerAvis,
          ),
          const SizedBox(height: 12),
        ],
        for (final a in _avis)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: _carte(),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(a.auteur, style: AppTextStyles.strong)),
                for (var i = 1; i <= 5; i++) Icon(i <= a.note ? Icons.star_rounded : Icons.star_outline_rounded, size: 14, color: AppColors.star),
              ]),
              if (a.date != null) Text(_dateCourte(a.date!), style: AppTextStyles.xs),
              const SizedBox(height: 6),
              Text(a.commentaire ?? 'Note sans commentaire.', style: AppTextStyles.body),
            ]),
          ),
        if (p.page < p.pages)
          Center(
            child: TextButton(
              onPressed: _chargement ? null : () => _charger(p.page + 1),
              child: Text(_chargement ? 'Chargement…' : "Voir plus d'avis"),
            ),
          ),
        const SizedBox(height: 4),
        Text('Chaque avis est vérifié par APS Santé avant publication.', style: AppTextStyles.xs),
      ],
    );
  }
}

String _dateCourte(DateTime d) {
  final l = d.toLocal();
  String p(int n) => n.toString().padLeft(2, '0');
  return '${p(l.day)}/${p(l.month)}/${l.year}';
}

class _FeuilleAvis extends ConsumerStatefulWidget {
  const _FeuilleAvis({required this.laboratoireId, this.monAvis});
  final String laboratoireId;
  final MonAvisLaboratoire? monAvis;

  @override
  ConsumerState<_FeuilleAvis> createState() => _FeuilleAvisState();
}

class _FeuilleAvisState extends ConsumerState<_FeuilleAvis> {
  late int _note = widget.monAvis?.note ?? 0;
  late final _commentaire = TextEditingController(text: widget.monAvis?.commentaire ?? '');
  bool _envoi = false;
  String? _erreur;

  @override
  void dispose() {
    _commentaire.dispose();
    super.dispose();
  }

  Future<void> _envoyer() async {
    if (_note == 0) return setState(() => _erreur = 'Choisissez une note.');
    setState(() {
      _envoi = true;
      _erreur = null;
    });
    try {
      final message = await appelLaboratoireUi(
        ref,
        (repo, token) => repo.deposerAvis(widget.laboratoireId, token: token, note: _note, commentaire: _commentaire.text.trim()),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _erreur = '$e');
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 8, 18, 18 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const ApsSheetHeader(title: 'Votre avis'),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 1; i <= 5; i++)
                IconButton(
                  onPressed: () => setState(() => _note = i),
                  icon: Icon(i <= _note ? Icons.star_rounded : Icons.star_outline_rounded, size: 34, color: AppColors.star),
                  tooltip: '$i sur 5',
                ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _commentaire,
            maxLines: 4,
            maxLength: 2000,
            decoration: const InputDecoration(hintText: 'Accueil, délais, qualité du prélèvement… (facultatif)'),
          ),
          if (_erreur != null) Text(_erreur!, style: const TextStyle(color: AppColors.red, fontSize: 12)),
          const SizedBox(height: 8),
          ApsButton(label: _envoi ? 'Envoi…' : 'Publier mon avis', icon: Icons.send_rounded, onPressed: _envoi ? null : _envoyer),
          const SizedBox(height: 6),
          Text('Votre avis sera visible après vérification par APS Santé.', style: AppTextStyles.xs),
        ],
      ),
    );
  }
}
