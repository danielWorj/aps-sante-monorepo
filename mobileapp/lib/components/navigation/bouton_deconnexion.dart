import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../controllers/authentification_controller.dart';
import '../../pages/public/publicAcceuil.dart';
import '../style/colors.dart';
import '../ui/aps_ui.dart';

/// Déconnexion depuis un espace connecté (patient, médecin, assurance,
/// structure…) : confirmation, session fermée (même hors réseau), puis
/// retour à l'accueil public avec un historique vidé.
Future<void> deconnecterEspace(BuildContext context, WidgetRef ref) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: const Text('Déconnexion'),
      content: const Text('Se déconnecter de votre espace ?'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Annuler')),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Se déconnecter')),
      ],
    ),
  );
  if (ok != true) return;
  try {
    await ref.read(sessionControllerProvider.notifier).deconnecter();
  } catch (_) {
    // Session déjà fermée localement (voir SessionController.deconnecter).
  }
  if (!context.mounted) return;
  Navigator.of(context).pushAndRemoveUntil(
    MaterialPageRoute(builder: (_) => const PublicAcceuilPage()),
    (_) => false,
  );
}

/// Bouton discret de déconnexion, placé à côté de l'avatar et du nom du
/// propriétaire dans l'en-tête des tableaux de bord.
class BoutonDeconnexion extends ConsumerWidget {
  const BoutonDeconnexion({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ApsIconButton(
      icon: Icons.logout_rounded,
      size: 38,
      iconColor: AppColors.ink2,
      tooltip: 'Se déconnecter',
      onPressed: () => deconnecterEspace(context, ref),
    );
  }
}
