import 'package:flutter/material.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';

/// Bouton « Prendre RDV » — `.mini-btn` (vert) dans la maquette.
///
/// Utilisé sur la carte médecin pour lancer le flux de prise de
/// rendez-vous.
class RdvButton extends StatelessWidget {
  const RdvButton({
    super.key,
    this.label = 'Prendre RDV',
    required this.onPressed,
    this.expanded = false,
    this.large = false,
    this.icon,
  });

  final String label;
  final VoidCallback onPressed;
  final bool expanded;
  final bool large;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final button = ElevatedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon ?? Icons.event_available_rounded, size: large ? 18 : 15, color: Colors.white),
      label: Text(label, style: AppTextStyles.buttonLabel.copyWith(fontSize: large ? 15 : 12.5)),
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        minimumSize: Size(0, large ? 54 : 40),
        padding: EdgeInsets.symmetric(horizontal: large ? 18 : 14),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(large ? 18 : 13),
        ),
      ),
    );
    return expanded ? SizedBox(width: double.infinity, child: button) : button;
  }
}
