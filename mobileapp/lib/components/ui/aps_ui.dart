import 'dart:ui';

import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../style/text_styles.dart';

// =====================================================================
// Primitives de la refonte 2026 — une classe par motif de
// `mobile/new-mobile-ui.html` (.card, .ib, .pill, .chip, .av, .slot,
// .btn, .seg, .menu/.mi, .ic, .note, .steps, .cta, .tab…).
// =====================================================================

/// Teintes partagées par [ApsPill], [ApsIconTile] et [ApsNote].
enum ApsTone { green, amber, coral, violet, sky, red, ink, neutral, white }

class _ToneColors {
  const _ToneColors(this.bg, this.fg);
  final Color bg;
  final Color fg;
}

_ToneColors _tone(ApsTone t) {
  switch (t) {
    case ApsTone.green:
      return const _ToneColors(AppColors.b1, AppColors.b7);
    case ApsTone.amber:
      return const _ToneColors(AppColors.amber100, AppColors.amber700);
    case ApsTone.coral:
      return const _ToneColors(AppColors.coral100, AppColors.coral600);
    case ApsTone.violet:
      return const _ToneColors(AppColors.violet100, AppColors.violet700);
    case ApsTone.sky:
      return const _ToneColors(AppColors.sky100, AppColors.sky);
    case ApsTone.red:
      return const _ToneColors(AppColors.red100, AppColors.red);
    case ApsTone.ink:
      return const _ToneColors(AppColors.ink, Colors.white);
    case ApsTone.neutral:
      return const _ToneColors(AppColors.bg, AppColors.ink2);
    case ApsTone.white:
      return const _ToneColors(Color(0x2EFFFFFF), Colors.white);
  }
}

// ---------------------------------------------------------------------
// Cartes
// ---------------------------------------------------------------------

/// `.card` — surface blanche, rayon 22, ombre douce.
/// [flat] : sans ombre, bordure fine (`.card.flat`).
class ApsCard extends StatelessWidget {
  const ApsCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.margin,
    this.onTap,
    this.flat = false,
    this.color,
    this.gradient,
    this.borderColor,
    this.borderWidth = 1,
    this.radius = 22,
    this.clip = false,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final bool flat;
  final Color? color;
  final Gradient? gradient;
  final Color? borderColor;
  final double borderWidth;
  final double radius;
  final bool clip;

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(radius);
    final border = borderColor != null
        ? Border.all(color: borderColor!, width: borderWidth)
        : (flat ? Border.all(color: AppColors.line) : null);
    final shadow =
        (flat || borderColor != null || color != null || gradient != null)
            ? null
            : AppColors.shadowCard;

    Widget content = Padding(padding: padding, child: child);
    if (onTap != null) {
      content = Material(
        type: MaterialType.transparency,
        child: InkWell(onTap: onTap, borderRadius: br, child: content),
      );
    }

    return Container(
      margin: margin,
      clipBehavior: clip ? Clip.antiAlias : Clip.none,
      decoration: BoxDecoration(
        color: gradient == null ? (color ?? AppColors.surface) : null,
        gradient: gradient,
        borderRadius: br,
        border: border,
        boxShadow: shadow,
      ),
      child: content,
    );
  }
}

// ---------------------------------------------------------------------
// Boutons
// ---------------------------------------------------------------------

enum ApsButtonVariant { primary, dark, white, ghost, ghostWhite, soft, red, violet }

/// `.btn` — bouton pleine largeur, 54 px (40 px en [small]).
class ApsButton extends StatelessWidget {
  const ApsButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.trailingIcon,
    this.variant = ApsButtonVariant.primary,
    this.small = false,
    this.loading = false,
    this.expand = true,
    this.foreground,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final IconData? trailingIcon;
  final ApsButtonVariant variant;
  final bool small;
  final bool loading;
  final bool expand;

  /// Force la couleur du texte (ex. « Annuler » en rouge sur un bouton ghost).
  final Color? foreground;

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    BorderSide? side;
    Color? glow;
    switch (variant) {
      case ApsButtonVariant.primary:
        bg = AppColors.b7;
        fg = Colors.white;
        glow = AppColors.b7;
        break;
      case ApsButtonVariant.dark:
        bg = AppColors.ink;
        fg = Colors.white;
        glow = AppColors.ink;
        break;
      case ApsButtonVariant.white:
        bg = Colors.white;
        fg = AppColors.ink;
        break;
      case ApsButtonVariant.ghost:
        bg = Colors.transparent;
        fg = AppColors.ink;
        side = const BorderSide(color: AppColors.lineStrong, width: 1.5);
        break;
      case ApsButtonVariant.ghostWhite:
        bg = const Color(0x1AFFFFFF);
        fg = Colors.white;
        side = const BorderSide(color: Color(0x40FFFFFF), width: 1.5);
        break;
      case ApsButtonVariant.soft:
        bg = AppColors.b1;
        fg = AppColors.b7;
        break;
      case ApsButtonVariant.red:
        bg = AppColors.red;
        fg = Colors.white;
        glow = AppColors.red;
        break;
      case ApsButtonVariant.violet:
        bg = AppColors.violet;
        fg = Colors.white;
        glow = AppColors.violet;
        break;
    }
    if (foreground != null) fg = foreground!;
    final disabled = onPressed == null || loading;
    final h = small ? 40.0 : 54.0;
    final r = BorderRadius.circular(small ? 13 : 18);

    final child = loading
        ? SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2, color: fg),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: small ? 16 : 18, color: fg),
                const SizedBox(width: 8),
              ],
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: small ? 13 : 15,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.15,
                    color: fg,
                  ),
                ),
              ),
              if (trailingIcon != null) ...[
                const SizedBox(width: 8),
                Icon(trailingIcon, size: small ? 16 : 18, color: fg),
              ],
            ],
          );

    return Opacity(
      opacity: disabled && !loading ? 0.5 : 1,
      child: Container(
        width: expand ? double.infinity : null,
        height: h,
        decoration: BoxDecoration(
          color: bg,
          borderRadius: r,
          border: side != null ? Border.fromBorderSide(side) : null,
          boxShadow:
              (glow != null && !small && !disabled) ? AppColors.shadowGlow(glow) : null,
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: disabled ? null : onPressed,
            borderRadius: r,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: small ? 14 : 18),
              child: Center(child: child),
            ),
          ),
        ),
      ),
    );
  }
}

/// `.ib` — bouton icône carré 42 px (retour, cloche, partage…).
class ApsIconButton extends StatelessWidget {
  const ApsIconButton({
    super.key,
    required this.icon,
    this.onPressed,
    this.flat = false,
    this.glass = false,
    this.dot = false,
    this.size = 42,
    this.iconColor,
    this.tooltip,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final bool flat;
  final bool glass;
  final bool dot;
  final double size;
  final Color? iconColor;
  final String? tooltip;

  /// Bouton retour standard (pop de la route courante).
  static Widget back(BuildContext context, {bool glass = false, bool flat = false}) =>
      ApsIconButton(
        icon: Icons.chevron_left_rounded,
        glass: glass,
        flat: flat,
        tooltip: 'Retour',
        onPressed: () => Navigator.of(context).maybePop(),
      );

  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(size / 3);
    final fg = iconColor ?? (glass ? Colors.white : AppColors.ink);
    Widget box = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: glass ? const Color(0x2EFFFFFF) : AppColors.surface,
        borderRadius: r,
        border: glass
            ? Border.all(color: const Color(0x38FFFFFF))
            : (flat ? Border.all(color: AppColors.line) : null),
        boxShadow: (glass || flat) ? null : AppColors.shadowCard,
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onPressed,
          borderRadius: r,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Icon(icon, size: size * 0.5, color: fg),
              if (dot)
                Positioned(
                  top: size * 0.22,
                  right: size * 0.24,
                  child: Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      color: AppColors.coral500,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    if (glass) {
      box = ClipRRect(
        borderRadius: r,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: box,
        ),
      );
    }
    return tooltip != null ? Tooltip(message: tooltip!, child: box) : box;
  }
}

// ---------------------------------------------------------------------
// En-têtes
// ---------------------------------------------------------------------

/// `.top` — barre haute : bouton gauche, titre centré (avec sur-titre
/// optionnel), action droite. Sans [leading], affiche un retour si la
/// route peut être dépilée.
class ApsTopBar extends StatelessWidget {
  const ApsTopBar({
    super.key,
    this.title,
    this.overline,
    this.leading,
    this.trailing,
    this.showBack = true,
    this.glass = false,
    this.padding = const EdgeInsets.fromLTRB(0, 6, 0, 14),
  });

  final String? title;
  final String? overline;
  final Widget? leading;
  final Widget? trailing;
  final bool showBack;
  final bool glass;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();
    final lead = leading ??
        (showBack && canPop
            ? ApsIconButton.back(context, glass: glass)
            : const SizedBox(width: 42));
    final color = glass ? Colors.white : AppColors.ink;
    return Padding(
      padding: padding,
      child: Row(
        children: [
          lead,
          const SizedBox(width: 10),
          Expanded(
            child: title == null
                ? const SizedBox.shrink()
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (overline != null)
                        Text(overline!,
                            style: AppTextStyles.xs.copyWith(
                                color: glass ? Colors.white70 : null)),
                      Text(
                        title!,
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTextStyles.strong.copyWith(color: color),
                      ),
                    ],
                  ),
          ),
          const SizedBox(width: 10),
          trailing ?? const SizedBox(width: 42),
        ],
      ),
    );
  }
}

/// En-tête d'onglet principal : grand titre à gauche, action à droite
/// (« Rendez-vous », « Compte », « Agenda »).
class ApsPageTitle extends StatelessWidget {
  const ApsPageTitle(this.title, {super.key, this.trailing, this.subtitle});

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 6, 0, 14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppTextStyles.l),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(subtitle!, style: AppTextStyles.xs),
                ],
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// `.sec-t` — titre de section avec lien optionnel à droite.
class ApsSectionTitle extends StatelessWidget {
  const ApsSectionTitle(
    this.title, {
    super.key,
    this.action,
    this.onAction,
    this.trailing,
    this.padding = const EdgeInsets.only(top: 22, bottom: 12),
  });

  final String title;
  final String? action;
  final VoidCallback? onAction;
  final Widget? trailing;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        children: [
          Expanded(child: Text(title, style: AppTextStyles.section)),
          if (trailing != null) trailing!,
          if (action != null)
            GestureDetector(
              onTap: onAction,
              child: Text(
                action!,
                style: AppTextStyles.small.copyWith(
                  color: AppColors.b6,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// `.over` — sur-titre en capitales.
class ApsOverline extends StatelessWidget {
  const ApsOverline(this.text, {super.key, this.color, this.padding});

  final String text;
  final Color? color;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding ?? const EdgeInsets.only(top: 20, bottom: 8),
      child: Text(text.toUpperCase(),
          style: AppTextStyles.over.copyWith(color: color)),
    );
  }
}

// ---------------------------------------------------------------------
// Pastilles, puces, icônes
// ---------------------------------------------------------------------

/// `.pill` — petite étiquette de statut, avec point (`.d`) optionnel.
class ApsPill extends StatelessWidget {
  const ApsPill(
    this.label, {
    super.key,
    this.tone = ApsTone.green,
    this.icon,
    this.dot = false,
    this.background,
    this.foreground,
  });

  final String label;
  final ApsTone tone;
  final IconData? icon;
  final bool dot;
  final Color? background;
  final Color? foreground;

  @override
  Widget build(BuildContext context) {
    final c = _tone(tone);
    final fg = foreground ?? c.fg;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: background ?? c.bg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: fg, shape: BoxShape.circle),
            ),
            const SizedBox(width: 5),
          ],
          if (icon != null) ...[
            Icon(icon, size: 12, color: fg),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontFamily: AppTextStyles.fontSans,
                fontSize: 10.5,
                fontWeight: FontWeight.w800,
                color: fg,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// `.chip` — puce de filtre (36 px). [selected] = fond encre.
/// [soft] = vert pâle (`.chip.soft`).
class ApsChip extends StatelessWidget {
  const ApsChip(
    this.label, {
    super.key,
    this.selected = false,
    this.soft = false,
    this.icon,
    this.iconColor,
    this.count,
    this.onTap,
  });

  final String label;
  final bool selected;
  final bool soft;
  final IconData? icon;
  final Color? iconColor;
  final int? count;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final bg = selected
        ? AppColors.ink
        : (soft ? AppColors.b1 : AppColors.surface);
    final fg = selected
        ? Colors.white
        : (soft ? AppColors.b7 : AppColors.ink2);
    return Material(
      color: bg,
      shape: StadiumBorder(
        side: BorderSide(
          color: selected
              ? AppColors.ink
              : (soft ? Colors.transparent : AppColors.line),
        ),
      ),
      child: InkWell(
        onTap: onTap,
        customBorder: const StadiumBorder(),
        child: Container(
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 14, color: iconColor ?? fg),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: TextStyle(
                  fontFamily: AppTextStyles.fontSans,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: fg,
                ),
              ),
              if (count != null && count! > 0) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: AppColors.b5,
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    '$count',
                    style: const TextStyle(
                      fontFamily: AppTextStyles.fontSans,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Rangée de puces défilante horizontalement (`.chips`).
class ApsChipRow extends StatelessWidget {
  const ApsChipRow({super.key, required this.children, this.padding});

  final List<Widget> children;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: padding,
      child: Row(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            children[i],
          ],
        ],
      ),
    );
  }
}

/// `.ic` — tuile d'icône teintée (38 px, 32 px en [small]).
class ApsIconTile extends StatelessWidget {
  const ApsIconTile(
    this.icon, {
    super.key,
    this.tone = ApsTone.green,
    this.small = false,
    this.size,
    this.background,
    this.foreground,
  });

  final IconData icon;
  final ApsTone tone;
  final bool small;
  final double? size;
  final Color? background;
  final Color? foreground;

  @override
  Widget build(BuildContext context) {
    final c = _tone(tone);
    final s = size ?? (small ? 32.0 : 38.0);
    return Container(
      width: s,
      height: s,
      decoration: BoxDecoration(
        color: background ?? c.bg,
        borderRadius: BorderRadius.circular(s / 2.9),
      ),
      alignment: Alignment.center,
      child: Icon(icon, size: s * 0.5, color: foreground ?? c.fg),
    );
  }
}

/// `.note` — encadré d'information discret.
class ApsNote extends StatelessWidget {
  const ApsNote({
    super.key,
    required this.child,
    this.icon = Icons.info_outline_rounded,
    this.tone = ApsTone.green,
  });

  /// Raccourci texte simple, avec début en gras optionnel.
  factory ApsNote.text(String text,
      {Key? key, String? bold, IconData icon = Icons.info_outline_rounded, ApsTone tone = ApsTone.green}) {
    return ApsNote(
      key: key,
      icon: icon,
      tone: tone,
      child: Text.rich(
        TextSpan(children: [
          if (bold != null)
            TextSpan(
              text: '$bold ',
              style: const TextStyle(color: AppColors.ink, fontWeight: FontWeight.w800),
            ),
          TextSpan(text: text),
        ]),
        style: AppTextStyles.small.copyWith(fontSize: 12),
      ),
    );
  }

  final Widget child;
  final IconData icon;
  final ApsTone tone;

  @override
  Widget build(BuildContext context) {
    late Color bg, border, fg;
    switch (tone) {
      case ApsTone.amber:
        bg = AppColors.amber100;
        border = const Color(0xFFF6E1BA);
        fg = AppColors.amber700;
        break;
      case ApsTone.violet:
        bg = AppColors.violet100;
        border = const Color(0xFFDCD8FD);
        fg = AppColors.violet700;
        break;
      case ApsTone.red:
        bg = AppColors.red100;
        border = const Color(0xFFF8CFD0);
        fg = AppColors.red;
        break;
      case ApsTone.sky:
        bg = AppColors.sky100;
        border = const Color(0xFFCFE0FA);
        fg = AppColors.sky;
        break;
      default:
        bg = AppColors.b0;
        border = AppColors.b1;
        fg = AppColors.b6;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(icon, size: 16, color: fg),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: DefaultTextStyle.merge(
              style: AppTextStyles.small.copyWith(fontSize: 12),
              child: child,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------

/// `.av` — avatar à initiales sur dégradé (ou photo).
/// La teinte est dérivée du nom pour rester stable.
class ApsAvatar extends StatelessWidget {
  const ApsAvatar({
    super.key,
    required this.name,
    this.photoUrl,
    this.size = 54,
    this.round = false,
    this.online = false,
    this.variant,
    this.border,
  });

  final String name;
  final String? photoUrl;
  final double size;
  final bool round;
  final bool online;

  /// 0..5 pour forcer une teinte ; sinon dérivée du nom.
  final int? variant;
  final BoxBorder? border;

  static const _gradients = <List<Color>>[
    [Color(0xFF3CC08E), Color(0xFF0E6A4A)],
    [Color(0xFF9C8CFF), Color(0xFF5143D6)],
    [Color(0xFFFF9D7E), Color(0xFFD24F31)],
    [Color(0xFF6FB2FF), Color(0xFF2459C9)],
    [Color(0xFFFFC66B), Color(0xFFC9790C)],
    [Color(0xFF4A5A53), Color(0xFF0D1B16)],
  ];

  static String initials(String name) {
    final cleaned = name
        .replaceAll(RegExp(r'^(dr\.?|pr\.?)\s+', caseSensitive: false), '')
        .trim();
    final parts = cleaned.split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    final letters = parts.map((p) => p[0]).take(2).join();
    return letters.isEmpty ? '?' : letters.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final v = variant ??
        (initials(name).codeUnits.fold<int>(0, (a, b) => a * 31 + b) %
            _gradients.length);
    final g = _gradients[v % _gradients.length];
    final r = round ? size / 2 : size / 3;
    final text = Text(
      initials(name),
      style: TextStyle(
        fontFamily: AppTextStyles.fontSans,
        fontWeight: FontWeight.w800,
        fontSize: size * 0.32,
        letterSpacing: -0.3,
        color: Colors.white,
      ),
    );
    final hasPhoto = photoUrl != null && photoUrl!.isNotEmpty;
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: size,
            height: size,
            clipBehavior: Clip.antiAlias,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(r),
              border: border,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: g,
              ),
            ),
            child: hasPhoto
                ? Image.network(
                    photoUrl!,
                    width: size,
                    height: size,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => text,
                  )
                : text,
          ),
          if (online)
            Positioned(
              right: -2,
              bottom: -2,
              child: Container(
                width: 14,
                height: 14,
                decoration: BoxDecoration(
                  color: AppColors.b5,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 3),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Badge « vérifié » bleu placé après un nom.
class ApsVerified extends StatelessWidget {
  const ApsVerified({super.key, this.size = 14});
  final double size;

  @override
  Widget build(BuildContext context) =>
      Icon(Icons.verified_rounded, size: size, color: AppColors.sky);
}

/// `.stars` — note avec étoile jaune.
class ApsStars extends StatelessWidget {
  const ApsStars(this.note, {super.key, this.count});
  final double note;
  final int? count;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.star_rounded, size: 14, color: AppColors.star),
        const SizedBox(width: 3),
        Text(note.toStringAsFixed(1),
            style: AppTextStyles.strong.copyWith(fontSize: 12)),
        if (count != null) ...[
          const SizedBox(width: 3),
          Text('($count)', style: AppTextStyles.xs),
        ],
      ],
    );
  }
}

// ---------------------------------------------------------------------
// Créneaux et dates
// ---------------------------------------------------------------------

enum ApsSlotState { free, selected, off, more }

/// `.slot` — bouton de créneau horaire.
class ApsSlot extends StatelessWidget {
  const ApsSlot(this.label, {super.key, this.state = ApsSlotState.free, this.onTap});

  final String label;
  final ApsSlotState state;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    BoxBorder? border;
    List<BoxShadow>? shadow;
    switch (state) {
      case ApsSlotState.free:
        bg = AppColors.b1;
        fg = AppColors.b7;
        break;
      case ApsSlotState.selected:
        bg = AppColors.b7;
        fg = Colors.white;
        shadow = [
          BoxShadow(
            color: AppColors.b7.withValues(alpha: 0.6),
            blurRadius: 16,
            offset: const Offset(0, 8),
            spreadRadius: -8,
          ),
        ];
        break;
      case ApsSlotState.off:
        bg = AppColors.slotOff;
        fg = AppColors.ink4;
        break;
      case ApsSlotState.more:
        bg = AppColors.surface;
        fg = AppColors.ink2;
        border = Border.all(color: AppColors.lineStrong);
        break;
    }
    final r = BorderRadius.circular(12);
    return Container(
      height: 38,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: r,
        border: border,
        boxShadow: shadow,
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: r,
          onTap: state == ApsSlotState.off ? null : onTap,
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontFamily: AppTextStyles.fontSans,
                fontSize: 12.5,
                fontWeight: FontWeight.w800,
                color: fg,
                decoration:
                    state == ApsSlotState.off ? TextDecoration.lineThrough : null,
                decorationColor: fg,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// `.slots` — grille de créneaux sur 4 colonnes.
class ApsSlotGrid extends StatelessWidget {
  const ApsSlotGrid({super.key, required this.children, this.columns = 4});

  final List<Widget> children;
  final int columns;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      const gap = 7.0;
      final w = (c.maxWidth - gap * (columns - 1)) / columns;
      return Wrap(
        spacing: gap,
        runSpacing: gap,
        children: [for (final s in children) SizedBox(width: w, child: s)],
      );
    });
  }
}

/// Tuile jour de semaine (« JEU 19 ») avec pastille de disponibilité.
class ApsDayTile extends StatelessWidget {
  const ApsDayTile({
    super.key,
    required this.weekday,
    required this.day,
    this.selected = false,
    this.disabled = false,
    this.dotColor,
    this.selectedColor = AppColors.ink,
    this.onTap,
  });

  final String weekday;
  final String day;
  final bool selected;
  final bool disabled;
  final Color? dotColor;
  final Color selectedColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final fg = selected
        ? Colors.white
        : (disabled ? AppColors.ink4 : AppColors.ink);
    final r = BorderRadius.circular(16);
    return Container(
      decoration: BoxDecoration(
        color: selected ? selectedColor : AppColors.surface,
        borderRadius: r,
        boxShadow: selected
            ? [
                BoxShadow(
                  color: selectedColor.withValues(alpha: 0.5),
                  blurRadius: 20,
                  offset: const Offset(0, 10),
                  spreadRadius: -10,
                )
              ]
            : null,
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: r,
          onTap: disabled ? null : onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(0, 9, 0, 7),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  weekday.toUpperCase(),
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: selected
                        ? Colors.white70
                        : (disabled ? AppColors.ink4 : AppColors.ink3),
                  ),
                ),
                Text(
                  day,
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: fg,
                  ),
                ),
                const SizedBox(height: 3),
                Container(
                  width: 4,
                  height: 4,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: dotColor == null
                        ? Colors.transparent
                        : (selected ? AppColors.mint : dotColor),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Bloc date vertical « JEU / 19 / OCT » des cartes de rendez-vous.
class ApsDateBlock extends StatelessWidget {
  const ApsDateBlock({
    super.key,
    required this.weekday,
    required this.day,
    required this.month,
    this.tone = ApsTone.green,
  });

  final String weekday;
  final String day;
  final String month;
  final ApsTone tone;

  @override
  Widget build(BuildContext context) {
    final c = _tone(tone);
    final small = TextStyle(
      fontFamily: AppTextStyles.fontSans,
      fontSize: 10,
      fontWeight: FontWeight.w800,
      color: c.fg,
    );
    return Container(
      width: 56,
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: c.bg,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(weekday.toUpperCase(), style: small),
          Text(
            day,
            style: TextStyle(
              fontFamily: AppTextStyles.fontSans,
              fontSize: 22,
              height: 1.1,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.6,
              color: c.fg,
            ),
          ),
          Text(month.toUpperCase(), style: small),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------
// Contrôles
// ---------------------------------------------------------------------

/// `.seg` — contrôle segmenté.
class ApsSegmented<T> extends StatelessWidget {
  const ApsSegmented({
    super.key,
    required this.segments,
    required this.value,
    required this.onChanged,
    this.compact = false,
    this.background,
  });

  final List<ApsSegment<T>> segments;
  final T value;
  final ValueChanged<T> onChanged;
  final bool compact;
  final Color? background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(compact ? 3 : 4),
      decoration: BoxDecoration(
        color: background ?? AppColors.segment,
        borderRadius: BorderRadius.circular(15),
      ),
      child: Row(
        children: [
          for (final s in segments)
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => onChanged(s.value),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  height: compact ? 30 : 38,
                  decoration: BoxDecoration(
                    color: s.value == value ? Colors.white : Colors.transparent,
                    borderRadius: BorderRadius.circular(11),
                    boxShadow: s.value == value ? AppColors.shadowCard : null,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (s.icon != null) ...[
                        Icon(s.icon, size: 15,
                            color: s.value == value ? AppColors.ink : AppColors.ink2),
                        const SizedBox(width: 6),
                      ],
                      Flexible(
                        child: Text(
                          s.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: AppTextStyles.fontSans,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: s.value == value ? AppColors.ink : AppColors.ink2,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class ApsSegment<T> {
  const ApsSegment(this.value, this.label, {this.icon});
  final T value;
  final String label;
  final IconData? icon;
}

/// `.steps` — barre de progression segmentée.
class ApsSteps extends StatelessWidget {
  const ApsSteps({super.key, required this.total, required this.current, this.color});

  /// Nombre d'étapes.
  final int total;

  /// Nombre d'étapes atteintes (1..total).
  final int current;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < total; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              height: 5,
              decoration: BoxDecoration(
                color: i < current ? (color ?? AppColors.b6) : AppColors.line,
                borderRadius: BorderRadius.circular(5),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

// ---------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------

/// `.menu` — groupe de lignes dans une carte.
class ApsMenu extends StatelessWidget {
  const ApsMenu({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(22),
        boxShadow: AppColors.shadowCard,
      ),
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) const Divider(height: 1, thickness: 1, color: AppColors.line),
            children[i],
          ],
        ],
      ),
    );
  }
}

/// `.mi` — ligne de menu : icône teintée, titre, sous-titre, chevron.
class ApsMenuItem extends StatelessWidget {
  const ApsMenuItem({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.tone = ApsTone.green,
    this.trailing,
    this.onTap,
    this.destructive = false,
    this.showChevron = true,
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final ApsTone tone;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool destructive;
  final bool showChevron;

  @override
  Widget build(BuildContext context) {
    return Material(
      type: MaterialType.transparency,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          child: Row(
            children: [
              if (icon != null) ...[
                ApsIconTile(icon!, tone: destructive ? ApsTone.red : tone, small: true),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: AppTextStyles.strong.copyWith(
                        fontSize: 13.5,
                        color: destructive ? AppColors.red : null,
                      ),
                    ),
                    if (subtitle != null && subtitle!.isNotEmpty) ...[
                      const SizedBox(height: 1),
                      Text(subtitle!,
                          style: AppTextStyles.xs.copyWith(fontSize: 11.5)),
                    ],
                  ],
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 8), trailing!],
              if (showChevron && onTap != null) ...[
                const SizedBox(width: 6),
                const Icon(Icons.chevron_right_rounded,
                    size: 20, color: AppColors.ink4),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Ligne « libellé — valeur » d'un récapitulatif.
class ApsKeyValue extends StatelessWidget {
  const ApsKeyValue(this.label, this.value, {super.key, this.strong = false, this.valueColor});

  final String label;
  final String value;
  final bool strong;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: strong ? AppTextStyles.strong : AppTextStyles.small,
            ),
          ),
          const SizedBox(width: 12),
          Text(
            value,
            style: AppTextStyles.strong.copyWith(
              fontSize: strong ? 18 : 13,
              letterSpacing: strong ? -0.5 : null,
              color: valueColor,
            ),
          ),
        ],
      ),
    );
  }
}

/// Bloc « libellé au-dessus / valeur en gras » (grilles de détail).
class ApsInfoCell extends StatelessWidget {
  const ApsInfoCell(this.label, this.value, {super.key, this.mono = false, this.light = false});

  final String label;
  final String value;
  final bool mono;
  final bool light;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: AppTextStyles.xs.copyWith(color: light ? Colors.white60 : null)),
        const SizedBox(height: 2),
        Text(
          value,
          style: mono
              ? AppTextStyles.mono.copyWith(fontSize: 12.5, color: light ? Colors.white : null)
              : AppTextStyles.strong.copyWith(fontSize: 13.5, color: light ? Colors.white : null),
        ),
      ],
    );
  }
}

/// `.hr` — séparateur fin avec marges verticales.
class ApsDivider extends StatelessWidget {
  const ApsDivider({super.key, this.space = 12, this.dashed = false});
  final double space;
  final bool dashed;

  @override
  Widget build(BuildContext context) {
    if (!dashed) {
      return Padding(
        padding: EdgeInsets.symmetric(vertical: space),
        child: const Divider(height: 1, thickness: 1, color: AppColors.line),
      );
    }
    return Padding(
      padding: EdgeInsets.symmetric(vertical: space),
      child: LayoutBuilder(builder: (context, c) {
        final n = (c.maxWidth / 8).floor();
        return Row(
          children: List.generate(
            n,
            (_) => Expanded(
              child: Container(
                height: 1,
                margin: const EdgeInsets.symmetric(horizontal: 2),
                color: AppColors.lineStrong,
              ),
            ),
          ),
        );
      }),
    );
  }
}

// ---------------------------------------------------------------------
// Barres fixes
// ---------------------------------------------------------------------

/// `.cta` — barre d'action fixée en bas (à passer en
/// `bottomNavigationBar` d'un Scaffold).
/// [priceLabel]/[priceValue] affichent le récapitulatif à gauche.
class ApsCtaBar extends StatelessWidget {
  const ApsCtaBar({
    super.key,
    required this.child,
    this.priceLabel,
    this.priceValue,
    this.footer,
    this.solid = true,
  });

  final Widget child;
  final String? priceLabel;
  final String? priceValue;
  final Widget? footer;
  final bool solid;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: solid ? AppColors.surface : null,
        gradient: solid
            ? null
            : const LinearGradient(
                begin: Alignment.bottomCenter,
                end: Alignment.topCenter,
                stops: [0.72, 1],
                colors: [AppColors.surface, Color(0x00FFFFFF)],
              ),
        border: solid
            ? const Border(top: BorderSide(color: AppColors.line))
            : null,
      ),
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.only(bottom: 12),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  if (priceValue != null) ...[
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (priceLabel != null)
                          Text(priceLabel!, style: AppTextStyles.xs),
                        Text(
                          priceValue!,
                          style: AppTextStyles.strong.copyWith(
                              fontSize: 18, letterSpacing: -0.4),
                        ),
                      ],
                    ),
                    const SizedBox(width: 12),
                  ],
                  Expanded(child: child),
                ],
              ),
              if (footer != null) ...[const SizedBox(height: 8), footer!],
            ],
          ),
        ),
      ),
    );
  }
}

/// Élément de la barre d'onglets flottante.
class ApsTabItem {
  const ApsTabItem({required this.label, required this.icon, this.badge = 0});
  final String label;
  final IconData icon;
  final int badge;
}

/// `.tab` — barre d'onglets flottante sombre : l'onglet actif est une
/// pastille blanche avec libellé, les autres n'affichent que l'icône.
///
/// À passer en `bottomNavigationBar` d'un Scaffold avec `extendBody: true`.
class ApsFloatingTabBar extends StatelessWidget {
  const ApsFloatingTabBar({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onTap,
  });

  final List<ApsTabItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  /// Hauteur totale réservée (barre + marge basse), à ajouter au padding
  /// bas des listes qui défilent sous la barre.
  static const double reservedHeight = 66 + 24 + 16;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        child: ApsTabBarSurface(
          children: [
            for (var i = 0; i < items.length; i++)
              ApsTabPill(
                item: items[i],
                active: i == currentIndex,
                compact: items.length >= 5,
                onTap: () => onTap(i),
              ),
          ],
        ),
      ),
    );
  }
}

/// Fond de la barre d'onglets flottante (encre translucide floutée).
class ApsTabBarSurface extends StatelessWidget {
  const ApsTabBarSurface({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: AppColors.ink.withValues(alpha: 0.6),
            blurRadius: 40,
            offset: const Offset(0, 20),
            spreadRadius: -16,
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            height: 66,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            color: AppColors.ink.withValues(alpha: 0.94),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: children,
            ),
          ),
        ),
      ),
    );
  }
}

/// Onglet de la barre flottante : pastille blanche + libellé si actif.
class ApsTabPill extends StatelessWidget {
  const ApsTabPill({
    super.key,
    required this.item,
    required this.active,
    required this.onTap,
    this.compact = false,
  });

  final ApsTabItem item;
  final bool active;
  final bool compact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fg = active ? AppColors.ink : Colors.white.withValues(alpha: 0.55);
    return Semantics(
      button: true,
      selected: active,
      label: item.label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          height: 46,
          padding: EdgeInsets.symmetric(horizontal: compact ? 12 : 15),
          decoration: BoxDecoration(
            color: active ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(17),
          ),
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(item.icon, size: 20, color: fg),
                  AnimatedSize(
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOutCubic,
                    child: active
                        ? Padding(
                            padding: const EdgeInsets.only(left: 7),
                            child: ConstrainedBox(
                              constraints:
                                  BoxConstraints(maxWidth: compact ? 72 : 110),
                              child: Text(
                              item.label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontFamily: AppTextStyles.fontSans,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w800,
                                color: AppColors.ink,
                              ),
                            ),
                            ),
                          )
                        : const SizedBox.shrink(),
                  ),
                ],
              ),
              if (item.badge > 0 && !active)
                Positioned(
                  top: 4,
                  right: -8,
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 16),
                    height: 16,
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      color: AppColors.coral500,
                      borderRadius: BorderRadius.circular(99),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      item.badge > 9 ? '9+' : '${item.badge}',
                      style: const TextStyle(
                        fontFamily: AppTextStyles.fontSans,
                        fontSize: 9.5,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------
// États
// ---------------------------------------------------------------------

/// État vide / erreur centré : tuile d'icône, titre, texte, action.
class ApsEmptyState extends StatelessWidget {
  const ApsEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
    this.tone = ApsTone.green,
  });

  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final ApsTone tone;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ApsIconTile(icon, tone: tone, size: 64),
          const SizedBox(height: 16),
          Text(title, textAlign: TextAlign.center, style: AppTextStyles.m),
          if (message != null) ...[
            const SizedBox(height: 6),
            Text(message!, textAlign: TextAlign.center, style: AppTextStyles.small),
          ],
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 18),
            ApsButton(
              label: actionLabel!,
              onPressed: onAction,
              small: true,
              expand: false,
              variant: ApsButtonVariant.dark,
            ),
          ],
        ],
      ),
    );
  }
}

/// `.grab` + en-tête de feuille modale (titre, bouton fermer).
class ApsSheetHeader extends StatelessWidget {
  const ApsSheetHeader({super.key, required this.title, this.onClose, this.showGrab = true});

  final String title;
  final VoidCallback? onClose;

  /// Poignée `.grab` au-dessus du titre.
  final bool showGrab;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (showGrab)
          Container(
            width: 42,
            height: 5,
            margin: const EdgeInsets.only(bottom: 16, top: 10),
            decoration: BoxDecoration(
              color: AppColors.lineStrong,
              borderRadius: BorderRadius.circular(5),
            ),
          ),
        Row(
          children: [
            Expanded(
              child: Text(title,
                  style: AppTextStyles.m.copyWith(letterSpacing: -0.34)),
            ),
            ApsIconButton(
              icon: Icons.close_rounded,
              flat: true,
              size: 34,
              onPressed: onClose ?? () => Navigator.of(context).maybePop(),
            ),
          ],
        ),
      ],
    );
  }
}

/// `.logo` — tuile verte en dégradé avec la croix APS.
class ApsLogo extends StatelessWidget {
  const ApsLogo({super.key, this.size = 52});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: AppColors.gradientLogo,
        borderRadius: BorderRadius.circular(size / 3),
        boxShadow: [
          BoxShadow(
            color: AppColors.b7.withValues(alpha: 0.7),
            blurRadius: 24,
            offset: const Offset(0, 12),
            spreadRadius: -10,
          ),
        ],
      ),
      child: Icon(Icons.add_rounded, color: Colors.white, size: size * 0.6),
    );
  }
}

/// `.search` — champ de recherche 56 px, blanc, ombre douce.
class ApsSearchField extends StatelessWidget {
  const ApsSearchField({
    super.key,
    required this.controller,
    required this.hint,
    this.onChanged,
    this.trailing,
  });

  final TextEditingController controller;
  final String hint;
  final ValueChanged<String>? onChanged;

  /// Action à droite (ex. bouton filtres sombre).
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 56,
      padding: const EdgeInsets.only(left: 16, right: 6),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        boxShadow: AppColors.shadowCard,
      ),
      child: Row(
        children: [
          const Icon(Icons.search_rounded, size: 20, color: AppColors.ink3),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              textInputAction: TextInputAction.search,
              style: AppTextStyles.strong.copyWith(fontSize: 14),
              decoration: InputDecoration(
                hintText: hint,
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
          ValueListenableBuilder<TextEditingValue>(
            valueListenable: controller,
            builder: (context, v, _) => v.text.isEmpty
                ? (trailing ?? const SizedBox(width: 10))
                : IconButton(
                    tooltip: 'Effacer',
                    icon: const Icon(Icons.cancel_rounded, size: 20, color: AppColors.ink4),
                    onPressed: () {
                      controller.clear();
                      onChanged?.call('');
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
