import 'package:flutter/material.dart';

import '../ui/aps_ui.dart';

/// Bouton principal pleine largeur — `.btn` (vert, 54 px, ombre colorée).
///
/// Utilisé pour les actions de premier plan des écrans
/// (ex : « Confirmer le rendez-vous », « Valider »).
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return ApsButton(
      label: label,
      onPressed: onPressed,
      icon: icon,
      loading: loading,
    );
  }
}

/// Bouton secondaire pleine largeur — `.btn.ghost` (contour, fond clair).
///
/// Utilisé pour les actions secondaires pleine largeur
/// (ex : « Envoyer ma position à un contact d'urgence »).
class SecondaryButton extends StatelessWidget {
  const SecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return ApsButton(
      label: label,
      onPressed: onPressed,
      icon: icon,
      variant: ApsButtonVariant.ghost,
    );
  }
}
