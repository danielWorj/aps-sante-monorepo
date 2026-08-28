import 'package:flutter/material.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';

/// Bouton d'appel — `.mini-btn.coral` dans la maquette.
///
/// Utilisé sur les cartes médecin / structure / pharmacie / urgence
/// pour lancer un appel téléphonique direct.
///
/// ```dart
/// CallButton(
///   label: 'Appeler',
///   onPressed: () => launchUrl(Uri.parse('tel:+237...')),
/// )
/// ```
class CallButton extends StatelessWidget {
  const CallButton({
    super.key,
    this.label = 'Appeler',
    required this.onPressed,
    this.expanded = false,
    this.large = false,
  });

  final String label;
  final VoidCallback onPressed;

  /// Si `true`, le bouton prend toute la largeur disponible.
  final bool expanded;

  /// Si `true`, applique un padding plus généreux (usage en pleine largeur).
  final bool large;

  @override
  Widget build(BuildContext context) {
    final button = ElevatedButton.icon(
      onPressed: onPressed,
      icon: const Icon(Icons.call, size: 14, color: Colors.white),
      label: Text(label, style: AppTextStyles.buttonLabel.copyWith(fontSize: 11.5)),
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.danger,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: EdgeInsets.symmetric(
          horizontal: large ? 16 : 12,
          vertical: large ? 13 : 7,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(9),
        ),
      ),
    );
    return expanded ? SizedBox(width: double.infinity, child: button) : button;
  }
}
