import 'package:flutter/material.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';

/// Style visuel d'un [BadgeChip] — `.badge.green` / `.badge.amber` /
/// `.badge.coral` / `.badge.outline`.
enum BadgeChipStyle { green, amber, coral, outline }

/// Petit badge utilisé dans les en-têtes de carte : « Vérifié à l'Ordre »,
/// « Télé dispo », « Hôpital », « N° ordre RCM-002E »...
class BadgeChip extends StatelessWidget {
  const BadgeChip({
    super.key,
    required this.label,
    this.style = BadgeChipStyle.outline,
    this.icon,
    this.mono = false,
  });

  final String label;
  final BadgeChipStyle style;
  final IconData? icon;

  /// Utilise la police mono (pour les numéros d'ordre par ex.).
  final bool mono;

  @override
  Widget build(BuildContext context) {
    late Color bg;
    late Color fg;
    Border? border;

    switch (style) {
      case BadgeChipStyle.green:
        bg = AppColors.green100;
        fg = AppColors.green700;
        break;
      case BadgeChipStyle.amber:
        bg = AppColors.amber100;
        fg = AppColors.amber500;
        break;
      case BadgeChipStyle.coral:
        bg = AppColors.coral100;
        fg = AppColors.coral500;
        break;
      case BadgeChipStyle.outline:
        bg = AppColors.paper;
        fg = AppColors.inkSoft;
        border = Border.all(color: AppColors.lineStrong);
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        border: border,
        borderRadius: BorderRadius.circular(100),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: (mono ? AppTextStyles.price : AppTextStyles.badge).copyWith(
              fontSize: mono ? 10 : 10.5,
              fontWeight: FontWeight.w600,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}

/// Point coloré indiquant un statut « ouvert / de garde » — `.guard-dot`.
class GuardDot extends StatelessWidget {
  const GuardDot({super.key, this.active = true});

  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 7,
      height: 7,
      margin: const EdgeInsets.only(right: 5),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: active ? AppColors.guardDotOn : AppColors.guardDotOff,
      ),
    );
  }
}

/// Enveloppe de carte générique — fond blanc, coins arrondis, ombre douce.
/// Réutilisée par toutes les cartes (`card_medecin`, `card_structure`, etc.)
/// afin de garder une apparence cohérente.
class CardSurface extends StatelessWidget {
  const CardSurface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(12),
    this.margin,
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = Container(
      margin: margin ?? const EdgeInsets.only(bottom: 12),
      padding: padding,
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(18),
        boxShadow: AppColors.shadowCard,
      ),
      child: child,
    );

    if (onTap == null) return content;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: content,
    );
  }
}
