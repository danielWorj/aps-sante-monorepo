// lib/components/reputation/reputation_ui.dart
//
// Atomes visuels de la réputation médecin (tableau de bord, avis) :
// direction sobre — surfaces blanches à bordure fine, rayon 10, aucun
// dégradé, une seule teinte de données (vert APS), étoiles ambrées.
// Le texte reste toujours en encre, jamais dans la couleur des données.

import 'package:flutter/material.dart';

import '../../models/reputation_medecin_models.dart' show libellesNote;
import '../style/colors.dart';
import '../style/text_styles.dart';

/// Rayon commun des cartes de la réputation (volontairement discret).
const double rayonReputation = 10;

const _moisCourts = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const _moisLongs = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const joursSemaineCourts = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const _joursLongs = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

String jourMoisCourt(DateTime d) => '${d.day} ${_moisCourts[d.month - 1]}';
String jourMoisAnnee(DateTime d) => '${d.day} ${_moisLongs[d.month - 1]} ${d.year}';
String moisAnnee(DateTime d) => '${_moisLongs[d.month - 1]} ${d.year}';
String moisCourtAnnee(DateTime d) => '${_moisCourts[d.month - 1]} ${d.year % 100}';
String jourLong(DateTime d) => '${_joursLongs[d.weekday - 1]} ${d.day} ${_moisLongs[d.month - 1]}';

/// « il y a 3 jours », « il y a 2 mois »…
String ilYA(DateTime? d) {
  if (d == null) return '';
  final jours = DateTime.now().difference(d).inDays;
  if (jours < 1) return "aujourd'hui";
  if (jours < 2) return 'hier';
  if (jours < 30) return 'il y a $jours jours';
  final mois = jours ~/ 30;
  if (mois < 12) return 'il y a $mois mois';
  final ans = mois ~/ 12;
  return 'il y a $ans an${ans > 1 ? 's' : ''}';
}

/// Nombre avec espaces fines (1 234).
String nombreFr(num? n) {
  if (n == null) return '—';
  final s = n.round().abs().toString();
  final b = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(' ');
    b.write(s[i]);
  }
  return b.toString();
}

/// 4.3 -> « 4,3 ».
String decimalFr(num? n, {int chiffres = 1}) =>
    n == null ? '—' : n.toStringAsFixed(chiffres).replaceAll('.', ',');

/// Carte sobre : fond blanc, bordure fine, rayon 10, sans ombre.
class CarteReputation extends StatelessWidget {
  const CarteReputation({
    super.key,
    required this.child,
    this.titre,
    this.icone,
    this.action,
    this.padding = const EdgeInsets.all(16),
    this.margin = const EdgeInsets.only(bottom: 12),
    this.onTap,
  });

  final Widget child;
  final String? titre;
  final IconData? icone;
  final Widget? action;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final contenu = Padding(
      padding: padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (titre != null) ...[
            Row(
              children: [
                if (icone != null) ...[
                  Icon(icone, size: 17, color: AppColors.b7),
                  const SizedBox(width: 8),
                ],
                Expanded(child: Text(titre!, style: AppTextStyles.strong.copyWith(fontSize: 14.5, letterSpacing: -0.2))),
                ?action,
              ],
            ),
            const SizedBox(height: 14),
          ],
          child,
        ],
      ),
    );
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(rayonReputation),
        border: Border.all(color: AppColors.line),
      ),
      child: onTap == null
          ? contenu
          : Material(
              type: MaterialType.transparency,
              child: InkWell(onTap: onTap, borderRadius: BorderRadius.circular(rayonReputation), child: contenu),
            ),
    );
  }
}

/// Note en étoiles (lecture seule, fractions comprises).
class Etoiles extends StatelessWidget {
  const Etoiles(this.valeur, {super.key, this.taille = 14, this.espace = 1.5});
  final double? valeur;
  final double taille;
  final double espace;

  @override
  Widget build(BuildContext context) {
    final v = (valeur ?? 0).clamp(0, 5).toDouble();
    return Semantics(
      label: valeur == null ? 'Aucune note' : '${decimalFr(v)} sur 5',
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < 5; i++)
              Padding(
                padding: EdgeInsets.only(right: i < 4 ? espace : 0),
                child: SizedBox(
                  width: taille,
                  height: taille,
                  child: Stack(
                    children: [
                      Icon(Icons.star_rounded, size: taille, color: AppColors.segment),
                      ClipRect(
                        clipper: _Fraction((v - i).clamp(0, 1).toDouble()),
                        child: Icon(Icons.star_rounded, size: taille, color: AppColors.star),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Fraction extends CustomClipper<Rect> {
  _Fraction(this.part);
  final double part;
  @override
  Rect getClip(Size size) => Rect.fromLTWH(0, 0, size.width * part, size.height);
  @override
  bool shouldReclip(_Fraction old) => old.part != part;
}

/// Saisie d'une note de 1 à 5 (cibles tactiles de 44 px).
class SaisieEtoiles extends StatelessWidget {
  const SaisieEtoiles({
    super.key,
    required this.valeur,
    required this.onChanged,
    this.taille = 34,
    this.afficherLibelle = true,
    this.libelle = 'Note',
  });

  final int? valeur;
  final ValueChanged<int> onChanged;
  final double taille;
  final bool afficherLibelle;
  final String libelle;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var n = 1; n <= 5; n++)
              Semantics(
                button: true,
                selected: valeur == n,
                label: '$libelle : $n sur 5, ${libellesNote[n]}',
                child: InkResponse(
                  onTap: () => onChanged(n),
                  radius: taille * 0.75,
                  child: Padding(
                    padding: EdgeInsets.all(taille > 28 ? 4 : 5),
                    child: AnimatedScale(
                      duration: const Duration(milliseconds: 140),
                      scale: valeur == n ? 1.12 : 1,
                      child: Icon(
                        Icons.star_rounded,
                        size: taille,
                        color: (valeur ?? 0) >= n ? AppColors.star : AppColors.segment,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        if (afficherLibelle) ...[
          const SizedBox(height: 4),
          Text(
            valeur == null ? 'Touchez une étoile' : libellesNote[valeur]!,
            style: AppTextStyles.small.copyWith(fontWeight: FontWeight.w700, color: AppColors.ink2),
          ),
        ],
      ],
    );
  }
}

/// Piste de progression fine (répartition des notes, critères, entonnoir).
class Piste extends StatelessWidget {
  const Piste({super.key, required this.part, this.hauteur = 6});
  final double part;
  final double hauteur;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(hauteur),
      child: SizedBox(
        height: hauteur,
        child: Stack(
          children: [
            Container(color: AppColors.b0),
            FractionallySizedBox(
              widthFactor: part.clamp(0, 1).toDouble(),
              child: Container(color: AppColors.b7),
            ),
          ],
        ),
      ),
    );
  }
}

/// Variation en % par rapport à la période précédente (icône + signe :
/// jamais la couleur seule). [inverse] : une hausse est une mauvaise nouvelle.
class Variation extends StatelessWidget {
  const Variation(this.valeur, {super.key, this.inverse = false});
  final int? valeur;
  final bool inverse;

  @override
  Widget build(BuildContext context) {
    if (valeur == null) {
      return Text('—', style: AppTextStyles.xs.copyWith(fontWeight: FontWeight.w700));
    }
    final v = valeur!;
    final bon = v == 0 ? null : (v > 0) != inverse;
    final couleur = bon == null ? AppColors.ink3 : (bon ? AppColors.b8 : AppColors.coral600);
    final icone = v == 0 ? Icons.remove_rounded : (v > 0 ? Icons.north_east_rounded : Icons.south_east_rounded);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icone, size: 13, color: couleur),
        const SizedBox(width: 2),
        Text(
          '${v > 0 ? '+' : ''}$v %',
          style: TextStyle(fontFamily: AppTextStyles.fontSans, fontSize: 11.5, fontWeight: FontWeight.w800, color: couleur),
        ),
      ],
    );
  }
}

/// Puce discrète à bordure (critère, recommandation, filtre actif).
class PuceDiscrete extends StatelessWidget {
  const PuceDiscrete(this.libelle, {super.key, this.icone, this.fond, this.couleur, this.onTap});
  final String libelle;
  final IconData? icone;
  final Color? fond;
  final Color? couleur;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final fg = couleur ?? AppColors.ink2;
    final puce = Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: fond ?? AppColors.bg,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: fond == null ? AppColors.line : Colors.transparent),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icone != null) ...[Icon(icone, size: 12, color: fg), const SizedBox(width: 5)],
          Text(libelle, style: TextStyle(fontFamily: AppTextStyles.fontSans, fontSize: 11, fontWeight: FontWeight.w700, color: fg)),
        ],
      ),
    );
    return onTap == null ? puce : GestureDetector(onTap: onTap, child: puce);
  }
}

/// Bloc « verrouillé » : statistiques non incluses dans l'abonnement.
class BlocVerrouille extends StatelessWidget {
  const BlocVerrouille({super.key, required this.texte, this.onAction});
  final String texte;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.circular(8)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.lock_outline_rounded, size: 18, color: AppColors.ink3),
          const SizedBox(width: 10),
          Expanded(child: Text(texte, style: AppTextStyles.small.copyWith(fontSize: 12))),
          if (onAction != null) ...[
            const SizedBox(width: 8),
            GestureDetector(
              onTap: onAction,
              child: Text('Formules', style: AppTextStyles.small.copyWith(fontWeight: FontWeight.w800, color: AppColors.b7)),
            ),
          ],
        ],
      ),
    );
  }
}
