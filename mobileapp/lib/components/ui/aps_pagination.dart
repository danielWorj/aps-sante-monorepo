import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../style/text_styles.dart';

/// Nombre d'éléments par page des annuaires (médecins, pharmacies,
/// structures, assurances…).
const int apsTaillePageAnnuaire = 5;

/// Liste paginée côté client : affiche [taillePage] éléments, puis la
/// barre de pagination SOUS la liste (évite le défilement sans fin).
///
/// Revient à la page 1 quand le nombre d'éléments change (nouvelle
/// recherche, filtre…) ou quand [cleReinitialisation] change. Au
/// changement de page, la vue remonte en haut de la liste.
///
/// [construirePage] reçoit les éléments de la page courante et renvoie
/// les widgets à empiler (permet d'intercaler un encart, ex. publicité).
class ApsListePaginee<T> extends StatefulWidget {
  const ApsListePaginee({
    super.key,
    required this.elements,
    required this.construirePage,
    this.taillePage = apsTaillePageAnnuaire,
    this.cleReinitialisation,
  });

  final List<T> elements;
  final List<Widget> Function(BuildContext context, List<T> page) construirePage;
  final int taillePage;
  final Object? cleReinitialisation;

  @override
  State<ApsListePaginee<T>> createState() => _ApsListePagineeState<T>();
}

class _ApsListePagineeState<T> extends State<ApsListePaginee<T>> {
  final GlobalKey _haut = GlobalKey();
  int _page = 1;

  int get _nbPages =>
      math.max(1, (widget.elements.length / widget.taillePage).ceil());

  @override
  void didUpdateWidget(covariant ApsListePaginee<T> ancien) {
    super.didUpdateWidget(ancien);
    if (ancien.elements.length != widget.elements.length ||
        ancien.cleReinitialisation != widget.cleReinitialisation) {
      _page = 1;
    }
  }

  void _allerA(int page) {
    if (page == _page) return;
    setState(() => _page = page);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _haut.currentContext;
      if (ctx != null && ctx.mounted) {
        Scrollable.ensureVisible(
          ctx,
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOut,
          alignmentPolicy: ScrollPositionAlignmentPolicy.keepVisibleAtStart,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final page = _page.clamp(1, _nbPages);
    final debut = (page - 1) * widget.taillePage;
    final fin = math.min(debut + widget.taillePage, widget.elements.length);
    final elementsPage = widget.elements.sublist(debut, fin);

    return Column(
      key: _haut,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ...widget.construirePage(context, elementsPage),
        if (_nbPages > 1) ...[
          const SizedBox(height: 6),
          ApsPagination(
            page: page,
            nbPages: _nbPages,
            onChanged: _allerA,
          ),
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}

/// Barre de pagination sobre : précédent, numéros (fenêtre de 5 pages
/// max autour de la page courante), suivant.
class ApsPagination extends StatelessWidget {
  const ApsPagination({
    super.key,
    required this.page,
    required this.nbPages,
    required this.onChanged,
  });

  final int page;
  final int nbPages;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    const fenetre = 5;
    var premier = math.max(1, page - fenetre ~/ 2);
    final dernier = math.min(nbPages, premier + fenetre - 1);
    premier = math.max(1, dernier - fenetre + 1);

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _Case(
          tooltip: 'Page précédente',
          onTap: page > 1 ? () => onChanged(page - 1) : null,
          child: const Icon(Icons.chevron_left_rounded, size: 20),
        ),
        for (var n = premier; n <= dernier; n++)
          _Case(
            actif: n == page,
            onTap: () => onChanged(n),
            child: Text('$n'),
          ),
        _Case(
          tooltip: 'Page suivante',
          onTap: page < nbPages ? () => onChanged(page + 1) : null,
          child: const Icon(Icons.chevron_right_rounded, size: 20),
        ),
      ],
    );
  }
}

class _Case extends StatelessWidget {
  const _Case({
    required this.child,
    required this.onTap,
    this.actif = false,
    this.tooltip,
  });

  final Widget child;
  final VoidCallback? onTap;
  final bool actif;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final desactive = onTap == null;
    final couleur = actif
        ? Colors.white
        : desactive
            ? AppColors.ink4
            : AppColors.ink;
    Widget boite = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 3),
      child: Material(
        color: actif ? AppColors.b7 : AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(color: actif ? AppColors.b7 : AppColors.line),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: actif ? null : onTap,
          child: SizedBox(
            width: 36,
            height: 36,
            child: Center(
              child: IconTheme(
                data: IconThemeData(color: couleur),
                child: DefaultTextStyle.merge(
                  style: AppTextStyles.strong.copyWith(fontSize: 13, color: couleur),
                  child: child,
                ),
              ),
            ),
          ),
        ),
      ),
    );
    if (tooltip != null) boite = Tooltip(message: tooltip!, child: boite);
    return boite;
  }
}
