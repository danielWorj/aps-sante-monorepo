import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../style/text_styles.dart';
import 'aps_ui.dart';

// =====================================================================
// Liste déroulante sur mesure — équivalent mobile d'ApsSelect (web).
//
// Le menu natif de DropdownButtonFormField se stylise mal (et déborde
// facilement sans isExpanded) : ce champ le remplace par une feuille
// d'options (option choisie en vert clair avec coche, recherche au-delà
// de 8 options).
//
// Même API que DropdownButtonFormField pour l'essentiel (items en
// DropdownMenuItem, value / initialValue, decoration, hint, validator,
// onChanged, icon, style) : remplacer le nom du widget suffit.
// =====================================================================

const int _seuilRecherche = 8;

class ApsSelectField<T> extends FormField<T> {
  ApsSelectField({
    super.key,
    required List<DropdownMenuItem<T>>? items,
    T? value,
    T? initialValue,
    this.onChanged,
    InputDecoration? decoration,
    Widget? hint,
    Widget? icon,
    TextStyle? style,
    String? sheetTitle,
    super.validator,
    super.onSaved,
    super.autovalidateMode,
    // Acceptés pour la compatibilité avec DropdownButtonFormField : le
    // champ occupe toujours toute la largeur disponible.
    bool isExpanded = true,
  })  : _valeur = value ?? initialValue,
        super(
          initialValue: value ?? initialValue,
          enabled: onChanged != null && (items?.isNotEmpty ?? false),
          builder: (champ) {
            final etat = champ as _ApsSelectFieldState<T>;
            return etat._construire(
              items: items ?? const [],
              decoration: decoration ?? const InputDecoration(),
              hint: hint,
              icon: icon,
              style: style,
              sheetTitle: sheetTitle,
            );
          },
        );

  final ValueChanged<T?>? onChanged;
  final T? _valeur;

  @override
  FormFieldState<T> createState() => _ApsSelectFieldState<T>();
}

class _ApsSelectFieldState<T> extends FormFieldState<T> {
  bool _ouvert = false;

  @override
  ApsSelectField<T> get widget => super.widget as ApsSelectField<T>;

  @override
  void didUpdateWidget(ApsSelectField<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    // La valeur suit le parent (ex. ville remise à zéro au changement de pays).
    if (widget._valeur != oldWidget._valeur && widget._valeur != value) {
      setValue(widget._valeur);
    }
  }

  Future<void> _ouvrir(List<DropdownMenuItem<T>> items, String titre) async {
    setState(() => _ouvert = true);
    final choix = await showModalBottomSheet<(T?,)>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _ApsSelectSheet<T>(items: items, valeur: value, titre: titre),
    );
    if (!mounted) return;
    setState(() => _ouvert = false);
    if (choix == null) return;
    final nouvelle = choix.$1;
    if (nouvelle != value) {
      didChange(nouvelle);
      widget.onChanged?.call(nouvelle);
    }
  }

  Widget _construire({
    required List<DropdownMenuItem<T>> items,
    required InputDecoration decoration,
    required Widget? hint,
    required Widget? icon,
    required TextStyle? style,
    required String? sheetTitle,
  }) {
    final actif = widget.enabled;
    final choisi = items.where((i) => i.value == value).firstOrNull;
    final theme = Theme.of(context);
    final deco = decoration
        .applyDefaults(theme.inputDecorationTheme)
        .copyWith(
          enabled: actif,
          errorText: errorText,
          suffixIcon: decoration.suffixIcon ??
              Padding(
                padding: const EdgeInsets.only(right: 4),
                child: icon ??
                    AnimatedRotation(
                      turns: _ouvert ? 0.5 : 0,
                      duration: const Duration(milliseconds: 200),
                      child: Icon(
                        Icons.keyboard_arrow_down_rounded,
                        size: 22,
                        color: !actif
                            ? AppColors.ink4
                            : _ouvert
                                ? AppColors.b7
                                : AppColors.ink3,
                      ),
                    ),
              ),
        );

    final styleValeur = (style ??
            const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.ink))
        .copyWith(
      fontFamily: style?.fontFamily ?? AppTextStyles.fontSans,
      color: actif ? null : AppColors.ink3,
    );

    final Widget contenu;
    if (choisi != null) {
      contenu = DefaultTextStyle(
        style: styleValeur,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        child: choisi.child,
      );
    } else if (hint != null) {
      contenu = DefaultTextStyle(
        style: deco.hintStyle ?? styleValeur.copyWith(color: AppColors.ink4),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        child: hint,
      );
    } else {
      contenu = Text('', style: styleValeur);
    }

    final titre = sheetTitle ??
        decoration.labelText ??
        decoration.hintText ??
        (hint is Text ? hint.data : null) ??
        'Choisir une option';

    return Semantics(
      button: true,
      enabled: actif,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: actif ? () => _ouvrir(items, titre) : null,
        child: InputDecorator(
          decoration: deco,
          isFocused: _ouvert,
          isEmpty: choisi == null && hint == null,
          child: contenu,
        ),
      ),
    );
  }
}

/// Libellé texte d'une option (recherche) : le texte du `Text` enfant,
/// sinon la valeur.
String _libelle<T>(DropdownMenuItem<T> item) {
  final enfant = item.child;
  if (enfant is Text) return enfant.data ?? enfant.textSpan?.toPlainText() ?? '';
  return '${item.value ?? ''}';
}

String _sansAccents(String texte) {
  const avec = 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ';
  const sans = 'aaaaaaceeeeiiiinooooouuuuyyoa';
  final bas = texte.toLowerCase();
  final sortie = StringBuffer();
  for (final c in bas.split('')) {
    final i = avec.indexOf(c);
    sortie.write(i >= 0 ? sans[i] : c);
  }
  return sortie.toString();
}

class _ApsSelectSheet<T> extends StatefulWidget {
  const _ApsSelectSheet({required this.items, required this.valeur, required this.titre});

  final List<DropdownMenuItem<T>> items;
  final T? valeur;
  final String titre;

  @override
  State<_ApsSelectSheet<T>> createState() => _ApsSelectSheetState<T>();
}

class _ApsSelectSheetState<T> extends State<_ApsSelectSheet<T>> {
  final _recherche = TextEditingController();

  @override
  void dispose() {
    _recherche.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final avecRecherche = widget.items.length > _seuilRecherche;
    final q = _sansAccents(_recherche.text.trim());
    final visibles = q.isEmpty
        ? widget.items
        : widget.items.where((i) => _sansAccents(_libelle(i)).contains(q)).toList();
    final media = MediaQuery.of(context);

    return Padding(
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: media.size.height * 0.75),
        child: Padding(
          padding: EdgeInsets.fromLTRB(16, 0, 16, 12 + media.padding.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ApsSheetHeader(title: widget.titre),
              const SizedBox(height: 10),
              if (avecRecherche) ...[
                _ChampRecherche(controller: _recherche, onChanged: (_) => setState(() {})),
                const SizedBox(height: 8),
              ],
              Flexible(
                child: visibles.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.symmetric(vertical: 24),
                        child: Text(
                          'Aucun résultat',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 13.5, color: AppColors.ink3),
                        ),
                      )
                    : ListView.separated(
                        shrinkWrap: true,
                        padding: const EdgeInsets.only(bottom: 4),
                        itemCount: visibles.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 2),
                        itemBuilder: (_, i) {
                          final item = visibles[i];
                          return _Option(
                            item: item,
                            choisie: item.value == widget.valeur,
                            onTap: () => Navigator.of(context).pop((item.value,)),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChampRecherche extends StatelessWidget {
  const _ChampRecherche({required this.controller, required this.onChanged});

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      autofocus: false,
      textInputAction: TextInputAction.search,
      style: const TextStyle(fontSize: 14, color: AppColors.ink),
      decoration: InputDecoration(
        hintText: 'Rechercher…',
        isDense: true,
        filled: true,
        fillColor: AppColors.bg,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        prefixIcon: const Icon(Icons.search_rounded, size: 19, color: AppColors.ink3),
        prefixIconConstraints: const BoxConstraints(minWidth: 40),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(9),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(9),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(9),
          borderSide: const BorderSide(color: AppColors.b4),
        ),
      ),
    );
  }
}

class _Option<T> extends StatelessWidget {
  const _Option({required this.item, required this.choisie, required this.onTap});

  final DropdownMenuItem<T> item;
  final bool choisie;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final actif = item.enabled;
    return Opacity(
      opacity: actif ? 1 : 0.45,
      child: Material(
        color: choisie ? AppColors.b1 : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: actif ? onTap : null,
          splashColor: AppColors.b1,
          highlightColor: AppColors.bg,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
            child: Row(
              children: [
                Expanded(
                  child: DefaultTextStyle(
                    style: TextStyle(
                      fontFamily: AppTextStyles.fontSans,
                      fontSize: 14.5,
                      fontWeight: choisie ? FontWeight.w700 : FontWeight.w600,
                      color: choisie ? AppColors.b9 : AppColors.ink2,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    child: item.child,
                  ),
                ),
                if (choisie) ...[
                  const SizedBox(width: 10),
                  const Icon(Icons.check_rounded, size: 18, color: AppColors.b7),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
