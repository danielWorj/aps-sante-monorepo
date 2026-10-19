import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../style/text_styles.dart';
import 'aps_ui.dart';

// =====================================================================
// Filtres en feuille modale (showModalBottomSheet).
//
// Chaque écran garde son propre type d'état (souvent un record Dart) :
// la feuille travaille sur un brouillon et ne le renvoie qu'au tap sur
// « Afficher les résultats ». Fermer la feuille (glisser, ✕, fond)
// abandonne les modifications.
//
//   final choix = await showApsFilterSheet<({String ville, bool verifie})>(
//     context: context,
//     initial: (ville: _ville, verifie: _verifie),
//     reset: (ville: '', verifie: false),
//     builder: (f, maj) => [
//       ApsFilterSection(title: 'Ville', child: ApsFilterChoices(...)),
//       ApsFilterSwitch(label: 'Vérifiés', value: f.verifie,
//           onChanged: (v) => maj((ville: f.ville, verifie: v))),
//     ],
//   );
//   if (choix != null) setState(() { ... });
// =====================================================================

/// Ouvre la feuille de filtres et renvoie le filtre validé, ou `null`
/// si l'utilisateur ferme sans valider.
///
/// [reset] est la valeur appliquée par « Réinitialiser » (dans le
/// brouillon : il faut encore valider).
Future<T?> showApsFilterSheet<T>({
  required BuildContext context,
  required T initial,
  required T reset,
  required List<Widget> Function(T filtre, ValueChanged<T> maj) builder,
  String title = 'Filtres',
  String applyLabel = 'Afficher les résultats',
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _ApsFilterSheet<T>(
      initial: initial,
      reset: reset,
      builder: builder,
      title: title,
      applyLabel: applyLabel,
    ),
  );
}

class _ApsFilterSheet<T> extends StatefulWidget {
  const _ApsFilterSheet({
    required this.initial,
    required this.reset,
    required this.builder,
    required this.title,
    required this.applyLabel,
  });

  final T initial;
  final T reset;
  final List<Widget> Function(T filtre, ValueChanged<T> maj) builder;
  final String title;
  final String applyLabel;

  @override
  State<_ApsFilterSheet<T>> createState() => _ApsFilterSheetState<T>();
}

class _ApsFilterSheetState<T> extends State<_ApsFilterSheet<T>> {
  late T _brouillon = widget.initial;

  @override
  Widget build(BuildContext context) {
    final sections = widget.builder(_brouillon, (v) => setState(() => _brouillon = v));
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
      child: Padding(
        padding: EdgeInsets.fromLTRB(18, 0, 18, 16 + MediaQuery.paddingOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ApsSheetHeader(title: widget.title),
            const SizedBox(height: 8),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = 0; i < sections.length; i++) ...[
                      if (i > 0) const SizedBox(height: 18),
                      sections[i],
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                // Largeur intrinsèque : le libellé n'est jamais tronqué.
                ApsButton(
                  label: 'Réinitialiser',
                  variant: ApsButtonVariant.ghost,
                  expand: false,
                  onPressed: () => setState(() => _brouillon = widget.reset),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ApsButton(
                    label: widget.applyLabel,
                    onPressed: () => Navigator.of(context).pop(_brouillon),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Bloc titré d'une feuille de filtres.
class ApsFilterSection extends StatelessWidget {
  const ApsFilterSection({super.key, required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: AppTextStyles.strong.copyWith(fontSize: 13)),
        const SizedBox(height: 10),
        child,
      ],
    );
  }
}

/// Option d'un [ApsFilterChoices].
class ApsFilterOption<V> {
  const ApsFilterOption(this.value, this.label, {this.icon});

  final V value;
  final String label;
  final IconData? icon;
}

/// Choix unique parmi des puces (retour à la ligne automatique).
class ApsFilterChoices<V> extends StatelessWidget {
  const ApsFilterChoices({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
  });

  final List<ApsFilterOption<V>> options;
  final V value;
  final ValueChanged<V> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final o in options)
          ApsChip(
            o.label,
            icon: o.icon,
            selected: o.value == value,
            onTap: () => onChanged(o.value),
          ),
      ],
    );
  }
}

/// Ligne interrupteur (filtre oui / non).
class ApsFilterSwitch extends StatelessWidget {
  const ApsFilterSwitch({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.icon,
    this.subtitle,
  });

  final String label;
  final String? subtitle;
  final IconData? icon;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => onChanged(!value),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.line),
        ),
        child: Row(
          children: [
            if (icon != null) ...[
              Icon(icon, size: 18, color: AppColors.ink2),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: AppTextStyles.strong.copyWith(fontSize: 13)),
                  if (subtitle != null) Text(subtitle!, style: AppTextStyles.xs),
                ],
              ),
            ),
            Switch.adaptive(
              value: value,
              activeTrackColor: AppColors.b7,
              onChanged: onChanged,
            ),
          ],
        ),
      ),
    );
  }
}

/// Rangée affichée sur l'écran : bouton « Filtres » (ouvre la feuille)
/// suivi des filtres actifs, chacun retirable d'un tap.
class ApsFilterBar extends StatelessWidget {
  const ApsFilterBar({super.key, required this.onOpen, this.actifs = const []});

  final VoidCallback onOpen;

  /// Filtres actifs : libellé + action de retrait.
  final List<({String label, IconData? icon, VoidCallback onRemove})> actifs;

  @override
  Widget build(BuildContext context) {
    return ApsChipRow(
      children: [
        ApsChip(
          'Filtres',
          icon: Icons.tune_rounded,
          selected: actifs.isNotEmpty,
          count: actifs.length,
          onTap: onOpen,
        ),
        for (final a in actifs)
          ApsChip(
            '${a.label}  ✕',
            icon: a.icon,
            soft: true,
            onTap: a.onRemove,
          ),
      ],
    );
  }
}
