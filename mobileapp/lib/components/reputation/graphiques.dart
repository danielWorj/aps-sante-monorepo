// lib/components/reputation/graphiques.dart
//
// Visualisations du tableau de bord médecin, sans dépendance externe :
//   CourbeTemporelle : une série (aire ou colonnes), toucher/glisser pour
//                      lire une valeur (réticule + bulle), valeur de fin
//                      étiquetée, liste des valeurs dépliable ;
//   Sparkline        : tendance d'une tuile ;
//   Entonnoir        : parcours visiteur -> RDV, taux entre étapes ;
//   GrilleCreneaux   : jour × moment de la journée, une teinte du clair au foncé.
// Une seule série par graphique : le titre de la carte la nomme (pas de légende).

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../models/reputation_medecin_models.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';
import 'reputation_ui.dart';

/* ------------------------------- Libellés ------------------------------- */

String libelleAxeSeau(SeauTdb s, String granularite) =>
    granularite == 'mois' ? moisCourtAnnee(s.debut) : jourMoisCourt(s.debut);

String libellePeriodeSeau(SeauTdb s, String granularite) {
  if (granularite == 'jour') return jourLong(s.debut);
  if (granularite == 'mois' && s.debut.day == 1) {
    final finMois = DateTime.utc(s.debut.year, s.debut.month + 1, 0);
    if (s.fin.day == finMois.day && s.fin.month == finMois.month) return moisAnnee(s.debut);
  }
  if (s.debut == s.fin) return jourMoisCourt(s.debut);
  return 'Du ${jourMoisCourt(s.debut)} au ${jourMoisCourt(s.fin)}';
}

/// Plafond « rond » et pas des graduations.
({double plafond, double pas}) _echelle(double max) {
  if (max <= 0) return (plafond: 4, pas: 1);
  final brut = max / 4;
  final puissance = math.pow(10, (math.log(brut) / math.ln10).floor()).toDouble();
  final pas = math.max(1.0, [1, 2, 2.5, 5, 10].map((m) => m * puissance).firstWhere((p) => p >= brut));
  return (plafond: (max / pas).ceil() * pas, pas: pas);
}

String _compact(double n) => n >= 1000 ? '${decimalFr(n / 1000)} k' : nombreFr(n);

/* ---------------------------- Courbe temporelle ---------------------------- */

enum FormeCourbe { aire, colonnes }

class CourbeTemporelle extends StatefulWidget {
  const CourbeTemporelle({
    super.key,
    required this.serie,
    required this.champ,
    required this.granularite,
    required this.formatValeur,
    this.forme = FormeCourbe.aire,
    this.hauteur = 190,
  });

  final List<SeauTdb> serie;
  final String champ;
  final String granularite;
  final String Function(num? v) formatValeur;
  final FormeCourbe forme;
  final double hauteur;

  @override
  State<CourbeTemporelle> createState() => _CourbeTemporelleState();
}

class _CourbeTemporelleState extends State<CourbeTemporelle> {
  int? _actif;
  bool _valeursOuvertes = false;

  static const _gauche = 34.0;
  static const _droite = 8.0;
  static const _haut = 12.0;
  static const _bas = 24.0;

  int _indexPour(double x, double largeur) {
    final n = widget.serie.length;
    final w = largeur - _gauche - _droite;
    final px = (x - _gauche).clamp(0, w);
    final i = widget.forme == FormeCourbe.colonnes ? (px / (w / n)).floor() : ((px / w) * (n - 1)).round();
    return i.clamp(0, n - 1);
  }

  @override
  Widget build(BuildContext context) {
    final valeurs = widget.serie.map((s) => s[widget.champ]?.toDouble()).toList();
    final total = valeurs.fold<double>(0, (a, v) => a + (v ?? 0));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LayoutBuilder(builder: (context, c) {
          final largeur = c.maxWidth;
          final n = widget.serie.length;
          final w = largeur - _gauche - _droite;
          double xDe(int i) => widget.forme == FormeCourbe.colonnes
              ? _gauche + (w / n) * (i + 0.5)
              : _gauche + (n == 1 ? w / 2 : (i / (n - 1)) * w);
          return Semantics(
            label: 'Graphique : ${widget.formatValeur(total)} sur la période. Dépliez « Voir les valeurs » pour le détail.',
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapDown: (d) => setState(() => _actif = _indexPour(d.localPosition.dx, largeur)),
              onHorizontalDragStart: (d) => setState(() => _actif = _indexPour(d.localPosition.dx, largeur)),
              onHorizontalDragUpdate: (d) => setState(() => _actif = _indexPour(d.localPosition.dx, largeur)),
              onHorizontalDragEnd: (_) => setState(() => _actif = null),
              onTapUp: (_) => Future.delayed(const Duration(seconds: 2), () {
                if (mounted) setState(() => _actif = null);
              }),
              child: SizedBox(
                height: widget.hauteur,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned.fill(
                      child: CustomPaint(
                        painter: _PeintreCourbe(
                          valeurs: valeurs,
                          forme: widget.forme,
                          actif: _actif,
                          libellesAxe: widget.serie.map((s) => libelleAxeSeau(s, widget.granularite)).toList(),
                          formatFin: widget.formatValeur,
                        ),
                      ),
                    ),
                    if (_actif != null)
                      Positioned(
                        top: -4,
                        left: (xDe(_actif!) - 70).clamp(0, math.max(0, largeur - 140)).toDouble(),
                        width: 140,
                        child: IgnorePointer(child: _Bulle(
                          valeur: widget.formatValeur(valeurs[_actif!]),
                          periode: libellePeriodeSeau(widget.serie[_actif!], widget.granularite),
                        )),
                      ),
                  ],
                ),
              ),
            ),
          );
        }),
        const SizedBox(height: 6),
        InkWell(
          onTap: () => setState(() => _valeursOuvertes = !_valeursOuvertes),
          borderRadius: BorderRadius.circular(6),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                Icon(_valeursOuvertes ? Icons.expand_less_rounded : Icons.expand_more_rounded, size: 18, color: AppColors.ink3),
                const SizedBox(width: 4),
                Text('Voir les valeurs', style: AppTextStyles.xs.copyWith(fontWeight: FontWeight.w700, color: AppColors.ink2)),
              ],
            ),
          ),
        ),
        if (_valeursOuvertes)
          for (var i = widget.serie.length - 1; i >= 0; i--)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 7),
              decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.line))),
              child: Row(
                children: [
                  Expanded(child: Text(libellePeriodeSeau(widget.serie[i], widget.granularite), style: AppTextStyles.small.copyWith(fontSize: 12))),
                  Text(widget.formatValeur(valeurs[i]), style: AppTextStyles.small.copyWith(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.ink)),
                ],
              ),
            ),
      ],
    );
  }
}

class _Bulle extends StatelessWidget {
  const _Bulle({required this.valeur, required this.periode});
  final String valeur;
  final String periode;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: AppColors.ink,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(valeur, textAlign: TextAlign.center, style: const TextStyle(fontFamily: AppTextStyles.fontSans, fontSize: 12.5, fontWeight: FontWeight.w800, color: Colors.white)),
          const SizedBox(height: 1),
          Text(periode, textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontFamily: AppTextStyles.fontSans, fontSize: 10.5, fontWeight: FontWeight.w600, color: Color(0xB3FFFFFF))),
        ],
      ),
    );
  }
}

class _PeintreCourbe extends CustomPainter {
  _PeintreCourbe({
    required this.valeurs,
    required this.forme,
    required this.actif,
    required this.libellesAxe,
    required this.formatFin,
  });

  final List<double?> valeurs;
  final FormeCourbe forme;
  final int? actif;
  final List<String> libellesAxe;
  final String Function(num? v) formatFin;

  static const _g = _CourbeTemporelleState._gauche;
  static const _d = _CourbeTemporelleState._droite;
  static const _h = _CourbeTemporelleState._haut;
  static const _b = _CourbeTemporelleState._bas;

  void _texte(Canvas c, String t, Offset o, {TextAlign align = TextAlign.left, double taille = 10, Color couleur = AppColors.ink3, FontWeight poids = FontWeight.w600}) {
    final tp = TextPainter(
      text: TextSpan(text: t, style: TextStyle(fontFamily: AppTextStyles.fontSans, fontSize: taille, fontWeight: poids, color: couleur)),
      textDirection: TextDirection.ltr,
    )..layout();
    final dx = align == TextAlign.right ? o.dx - tp.width : (align == TextAlign.center ? o.dx - tp.width / 2 : o.dx);
    tp.paint(c, Offset(dx, o.dy - tp.height / 2));
  }

  @override
  void paint(Canvas canvas, Size size) {
    final n = valeurs.length;
    if (n == 0) return;
    final w = size.width - _g - _d;
    final h = size.height - _h - _b;
    final base = _h + h;
    final max = valeurs.fold<double>(0, (a, v) => math.max(a, v ?? 0));
    final e = _echelle(max);
    double y(double v) => _h + h - (v / e.plafond) * h;
    final bande = w / n;
    double x(int i) => forme == FormeCourbe.colonnes ? _g + bande * (i + 0.5) : _g + (n == 1 ? w / 2 : (i / (n - 1)) * w);

    // Grille horizontale + graduations.
    final grille = Paint()..color = AppColors.line..strokeWidth = 1;
    for (var t = 0.0; t <= e.plafond + 1e-9; t += e.pas) {
      canvas.drawLine(Offset(_g, y(t)), Offset(size.width - _d, y(t)), grille);
      _texte(canvas, _compact(t), Offset(_g - 6, y(t)), align: TextAlign.right);
    }

    final couleur = AppColors.b7;
    if (forme == FormeCourbe.colonnes) {
      final epaisseur = math.max(2.0, math.min(18.0, bande - 3));
      for (var i = 0; i < n; i++) {
        final v = valeurs[i] ?? 0;
        if (v <= 0) continue;
        final haut = math.max(2.0, (v / e.plafond) * h);
        final r = math.min(3.0, epaisseur / 2);
        final rect = RRect.fromRectAndCorners(
          Rect.fromLTWH(x(i) - epaisseur / 2, base - haut, epaisseur, haut),
          topLeft: Radius.circular(r),
          topRight: Radius.circular(r),
        );
        canvas.drawRRect(rect, Paint()..color = actif == null || actif == i ? couleur : couleur.withValues(alpha: 0.35));
      }
    } else {
      // Segments interrompus sur les valeurs nulles (ex. note sans avis).
      final segments = <List<Offset>>[];
      var courant = <Offset>[];
      for (var i = 0; i < n; i++) {
        final v = valeurs[i];
        if (v == null) {
          if (courant.isNotEmpty) segments.add(courant);
          courant = [];
        } else {
          courant.add(Offset(x(i), y(v)));
        }
      }
      if (courant.isNotEmpty) segments.add(courant);

      final trait = Paint()
        ..color = couleur
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round;
      for (final seg in segments) {
        if (seg.length > 1) {
          final aire = Path()..moveTo(seg.first.dx, base);
          for (final p in seg) {
            aire.lineTo(p.dx, p.dy);
          }
          aire..lineTo(seg.last.dx, base)..close();
          canvas.drawPath(aire, Paint()..color = couleur.withValues(alpha: 0.08));
          final ligne = Path()..moveTo(seg.first.dx, seg.first.dy);
          for (final p in seg.skip(1)) {
            ligne.lineTo(p.dx, p.dy);
          }
          canvas.drawPath(ligne, trait);
        } else {
          canvas.drawCircle(seg.first, 3.5, Paint()..color = couleur);
        }
      }

      if (actif != null) {
        canvas.drawLine(Offset(x(actif!), _h), Offset(x(actif!), base), Paint()..color = AppColors.ink4..strokeWidth = 1);
        final v = valeurs[actif!];
        if (v != null) {
          canvas.drawCircle(Offset(x(actif!), y(v)), 6, Paint()..color = AppColors.surface);
          canvas.drawCircle(Offset(x(actif!), y(v)), 4, Paint()..color = couleur);
        }
      } else {
        final dernier = valeurs.lastIndexWhere((v) => v != null);
        if (dernier >= 0) {
          final p = Offset(x(dernier), y(valeurs[dernier]!));
          canvas.drawCircle(p, 6, Paint()..color = AppColors.surface);
          canvas.drawCircle(p, 4, Paint()..color = couleur);
          _texte(canvas, formatFin(valeurs[dernier]).split(' ').first, Offset(p.dx - 8, math.max(_h, p.dy - 12)),
              align: TextAlign.right, taille: 11, couleur: AppColors.ink, poids: FontWeight.w800);
        }
      }
    }

    canvas.drawLine(Offset(_g, base), Offset(size.width - _d, base), Paint()..color = AppColors.lineStrong..strokeWidth = 1);

    // Étiquettes d'axe : au plus ~5, réparties.
    final nb = math.min(n, math.max(2, (w / 72).floor()));
    final indices = <int>{};
    if (n == 1) {
      indices.add(0);
    } else {
      for (var k = 0; k < nb; k++) {
        indices.add(((k / (nb - 1)) * (n - 1)).round());
      }
    }
    for (final i in indices) {
      final align = forme == FormeCourbe.colonnes
          ? TextAlign.center
          : (i == 0 ? TextAlign.left : (i == n - 1 ? TextAlign.right : TextAlign.center));
      _texte(canvas, libellesAxe[i], Offset(x(i), size.height - 8), align: align);
    }
  }

  @override
  bool shouldRepaint(_PeintreCourbe old) =>
      old.valeurs != valeurs || old.actif != actif || old.forme != forme;
}

/* -------------------------------- Sparkline -------------------------------- */

class Sparkline extends StatelessWidget {
  const Sparkline(this.valeurs, {super.key, this.largeur = 72, this.hauteur = 26});
  final List<num?> valeurs;
  final double largeur;
  final double hauteur;

  @override
  Widget build(BuildContext context) {
    final v = valeurs.map((e) => (e ?? 0).toDouble()).toList();
    if (v.length < 2 || v.every((x) => x == 0)) return SizedBox(width: largeur, height: hauteur);
    return ExcludeSemantics(
      child: CustomPaint(size: Size(largeur, hauteur), painter: _PeintreSparkline(v)),
    );
  }
}

class _PeintreSparkline extends CustomPainter {
  _PeintreSparkline(this.v);
  final List<double> v;

  @override
  void paint(Canvas canvas, Size size) {
    final max = v.reduce(math.max);
    final min = v.reduce(math.min);
    final etendue = math.max(1.0, max - min);
    Offset p(int i) => Offset(2 + (i / (v.length - 1)) * (size.width - 4), size.height - 3 - ((v[i] - min) / etendue) * (size.height - 6));
    final ligne = Path()..moveTo(p(0).dx, p(0).dy);
    for (var i = 1; i < v.length; i++) {
      ligne.lineTo(p(i).dx, p(i).dy);
    }
    canvas.drawPath(
      ligne,
      Paint()
        ..color = AppColors.b7.withValues(alpha: 0.8)
        ..strokeWidth = 1.6
        ..style = PaintingStyle.stroke
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawCircle(p(v.length - 1), 2.6, Paint()..color = AppColors.b7);
  }

  @override
  bool shouldRepaint(_PeintreSparkline old) => old.v != v;
}

/* -------------------------------- Entonnoir -------------------------------- */

class EtapeEntonnoir {
  final String libelle;
  final IconData icone;
  final int valeur;
  const EtapeEntonnoir(this.libelle, this.icone, this.valeur);
}

class Entonnoir extends StatelessWidget {
  const Entonnoir({super.key, required this.etapes});
  final List<EtapeEntonnoir> etapes;

  @override
  Widget build(BuildContext context) {
    final base = math.max(1, etapes.first.valeur);
    return Column(
      children: [
        for (var i = 0; i < etapes.length; i++)
          Padding(
            padding: EdgeInsets.only(bottom: i < etapes.length - 1 ? 14 : 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(etapes[i].icone, size: 15, color: AppColors.b7),
                    const SizedBox(width: 8),
                    Expanded(child: Text(etapes[i].libelle, style: AppTextStyles.small.copyWith(fontSize: 12.5))),
                    Text(nombreFr(etapes[i].valeur), style: AppTextStyles.strong.copyWith(fontSize: 14)),
                  ],
                ),
                const SizedBox(height: 6),
                Piste(part: etapes[i].valeur == 0 ? 0 : math.max(0.02, etapes[i].valeur / base), hauteur: 8),
                if (i > 0) ...[
                  const SizedBox(height: 4),
                  Text.rich(
                    TextSpan(children: [
                      TextSpan(
                        text: etapes[i - 1].valeur == 0
                            ? '—'
                            : '${decimalFr(etapes[i].valeur / etapes[i - 1].valeur * 100)} %',
                        style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.ink),
                      ),
                      const TextSpan(text: " de l'étape précédente"),
                    ]),
                    style: AppTextStyles.xs,
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

/* ----------------------------- Grille des créneaux ----------------------------- */

class GrilleCreneaux extends StatelessWidget {
  const GrilleCreneaux({super.key, required this.carte});
  final CarteCreneauxTdb carte;

  @override
  Widget build(BuildContext context) {
    final max = math.max(1, carte.grille.expand((l) => l).fold<int>(0, math.max));
    ({int v, int j, int t})? meilleur;
    for (var j = 0; j < carte.grille.length; j++) {
      for (var t = 0; t < carte.grille[j].length; t++) {
        final v = carte.grille[j][t];
        if (v > 0 && (meilleur == null || v > meilleur.v)) meilleur = (v: v, j: j, t: t);
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const SizedBox(width: 40),
            for (final t in carte.tranches)
              Expanded(child: Text(t, textAlign: TextAlign.center, style: AppTextStyles.xs.copyWith(fontWeight: FontWeight.w700))),
          ],
        ),
        const SizedBox(height: 6),
        for (var j = 0; j < carte.grille.length; j++)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              children: [
                SizedBox(width: 40, child: Text(joursSemaineCourts[j], style: AppTextStyles.xs.copyWith(fontWeight: FontWeight.w700, color: AppColors.ink2))),
                for (var t = 0; t < carte.grille[j].length; t++)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: _Case(valeur: carte.grille[j][t], max: max, libelle: '${joursSemaineCourts[j]}, ${carte.tranches[t]}'),
                    ),
                  ),
              ],
            ),
          ),
        const SizedBox(height: 8),
        Text(
          meilleur == null
              ? 'Aucun rendez-vous payé sur la période.'
              : 'Moment le plus demandé : ${joursSemaineCourts[meilleur.j].toLowerCase()}. ${carte.tranches[meilleur.t].toLowerCase()} (${meilleur.v} RDV).',
          style: AppTextStyles.xs,
        ),
      ],
    );
  }
}

class _Case extends StatelessWidget {
  const _Case({required this.valeur, required this.max, required this.libelle});
  final int valeur;
  final int max;
  final String libelle;

  @override
  Widget build(BuildContext context) {
    final intensite = valeur == 0 ? 0.0 : 0.14 + (valeur / max) * 0.76;
    final fond = valeur == 0 ? AppColors.bg : Color.lerp(AppColors.b0, AppColors.b7, intensite)!;
    return Semantics(
      label: '$libelle : $valeur rendez-vous',
      child: Container(
        height: 30,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: fond, borderRadius: BorderRadius.circular(5)),
        child: valeur == 0
            ? null
            : Text('$valeur',
                style: TextStyle(
                  fontFamily: AppTextStyles.fontSans,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w800,
                  color: intensite > 0.55 ? Colors.white : AppColors.ink,
                )),
      ),
    );
  }
}
