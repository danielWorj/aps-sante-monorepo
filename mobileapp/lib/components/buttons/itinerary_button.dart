import 'package:flutter/material.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';

/// Bouton « Itinéraire » — `.mini-btn.outline` avec icône de localisation.
///
/// Utilisé sur les cartes structure / pharmacie pour ouvrir un plan /
/// une application de navigation externe.
class ItineraryButton extends StatelessWidget {
  const ItineraryButton({
    super.key,
    this.label = 'Itinéraire',
    required this.onPressed,
    this.expanded = false,
  });

  final String label;
  final VoidCallback onPressed;
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final button = OutlinedButton.icon(
      onPressed: onPressed,
      icon: const Icon(Icons.location_on_outlined, size: 14, color: AppColors.ink),
      label: Text(label, style: AppTextStyles.buttonLabel.copyWith(fontSize: 11.5, color: AppColors.ink)),
      style: OutlinedButton.styleFrom(
        backgroundColor: AppColors.card,
        side: const BorderSide(color: AppColors.lineStrong),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(9),
        ),
      ),
    );
    return expanded ? SizedBox(width: double.infinity, child: button) : button;
  }
}
