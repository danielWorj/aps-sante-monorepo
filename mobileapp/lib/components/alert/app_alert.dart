import 'package:flutter/material.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';

/// Variantes de message d'alerte disponibles dans l'app.
///
/// Correspond aux styles `.notice-chip`, `.ins-notice`, `.offline-note`
/// et `.rule-tag.(ok|warn|off)` de la maquette.
enum AppAlertType { primary, success, secondary, warning, danger }

class _AlertPalette {
  const _AlertPalette({
    required this.background,
    required this.border,
    required this.foreground,
    required this.icon,
    this.dashed = false,
  });

  final Color background;
  final Color border;
  final Color foreground;
  final IconData icon;
  final bool dashed;
}

const Map<AppAlertType, _AlertPalette> _palettes = {
  // Bandeau vert d'information générale (ex: "Présentation seulement...")
  AppAlertType.primary: _AlertPalette(
    background: AppColors.green50,
    border: AppColors.green100,
    foreground: AppColors.green900,
    icon: Icons.info_outline,
  ),
  // Confirmation / élément vérifié / règle autorisée (rule-tag.ok)
  AppAlertType.success: _AlertPalette(
    background: AppColors.green100,
    border: AppColors.green100,
    foreground: AppColors.green700,
    icon: Icons.check_circle_outline,
  ),
  // Neutre / hors-ligne / info discrète (offline-note)
  AppAlertType.secondary: _AlertPalette(
    background: AppColors.paper,
    border: AppColors.lineStrong,
    foreground: AppColors.inkSoft,
    icon: Icons.wifi_off_rounded,
    dashed: true,
  ),
  // Avertissement (rule-tag.warn)
  AppAlertType.warning: _AlertPalette(
    background: AppColors.amber100,
    border: AppColors.amber100,
    foreground: AppColors.amber500,
    icon: Icons.warning_amber_rounded,
  ),
  // Danger / interdit / urgence (rule-tag.off)
  AppAlertType.danger: _AlertPalette(
    background: AppColors.coral100,
    border: AppColors.coral100,
    foreground: AppColors.coral600,
    icon: Icons.error_outline,
  ),
};

/// Bandeau d'alerte pleine largeur — `.notice-chip` / `.ins-notice` / `.offline-note`.
///
/// ```dart
/// AppAlert(
///   type: AppAlertType.primary,
///   message: 'Présentation seulement : aucune souscription en ligne.',
/// )
///
/// AppAlert(
///   type: AppAlertType.secondary,
///   message: 'Mode dégradé hors connexion : les numéros restent accessibles.',
/// )
/// ```
class AppAlert extends StatelessWidget {
  const AppAlert({
    super.key,
    required this.type,
    required this.message,
    this.title,
    this.icon,
    this.onClose,
  });

  final AppAlertType type;
  final String message;
  final String? title;
  final IconData? icon;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final palette = _palettes[type]!;

    final content = Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon ?? palette.icon, size: 16, color: palette.foreground),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (title != null) ...[
                  Text(
                    title!,
                    style: AppTextStyles.cardTitle.copyWith(
                      fontSize: 12.5,
                      color: palette.foreground,
                    ),
                  ),
                  const SizedBox(height: 3),
                ],
                Text(
                  message,
                  style: AppTextStyles.body.copyWith(
                    fontSize: 11.5,
                    height: 1.5,
                    color: type == AppAlertType.primary ? AppColors.green900 : palette.foreground,
                  ),
                ),
              ],
            ),
          ),
          if (onClose != null)
            GestureDetector(
              onTap: onClose,
              child: Icon(Icons.close, size: 14, color: palette.foreground),
            ),
        ],
      ),
    );

    final decoration = BoxDecoration(
      color: palette.background,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(
        color: palette.border,
        width: palette.dashed ? 1 : 1,
        style: BorderStyle.solid,
      ),
    );

    if (!palette.dashed) {
      return Container(decoration: decoration, child: content);
    }

    // Bordure pointillée pour la variante "secondary" (offline-note).
    return _DashedBorder(
      color: palette.border,
      borderRadius: 12,
      child: Container(
        decoration: BoxDecoration(color: palette.background, borderRadius: BorderRadius.circular(12)),
        child: content,
      ),
    );
  }
}

/// Badge/pastille d'alerte compacte — `.rule-tag` / `.badge`.
///
/// Utile pour signaler un statut court : « Autorisé », « Exclu du boost »,
/// « Zéro publicité ».
class AppAlertBadge extends StatelessWidget {
  const AppAlertBadge({
    super.key,
    required this.type,
    required this.label,
    this.icon,
  });

  final AppAlertType type;
  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final palette = _palettes[type]!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: palette.background,
        borderRadius: BorderRadius.circular(100),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon ?? palette.icon, size: 12, color: palette.foreground),
          const SizedBox(width: 5),
          Text(
            label,
            style: AppTextStyles.badge.copyWith(fontSize: 10.5, color: palette.foreground),
          ),
        ],
      ),
    );
  }
}

/// Petit utilitaire pour dessiner une bordure pointillée (offline-note).
class _DashedBorder extends StatelessWidget {
  const _DashedBorder({
    required this.child,
    required this.color,
    required this.borderRadius,
  });

  final Widget child;
  final Color color;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _DashedBorderPainter(color: color, radius: borderRadius),
      child: child,
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  _DashedBorderPainter({required this.color, required this.radius});

  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final rrect = RRect.fromRectAndRadius(
      Rect.fromLTWH(0.5, 0.5, size.width - 1, size.height - 1),
      Radius.circular(radius),
    );
    final path = Path()..addRRect(rrect);
    final dashPath = Path();
    const dashWidth = 4.0;
    const dashSpace = 3.0;

    for (final metric in path.computeMetrics()) {
      double distance = 0;
      while (distance < metric.length) {
        dashPath.addPath(
          metric.extractPath(distance, distance + dashWidth),
          Offset.zero,
        );
        distance += dashWidth + dashSpace;
      }
    }

    canvas.drawPath(
      dashPath,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(covariant _DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.radius != radius;
}
