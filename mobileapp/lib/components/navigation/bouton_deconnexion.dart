import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../controllers/authentification_controller.dart';
import '../../pages/pilote_push.dart' show cleNavigateurApp;
import '../../pages/public/publicAcceuil.dart';
import '../style/colors.dart';
import '../ui/aps_ui.dart';

/// Revient à l'accueil public avec un historique vidé. Passe par le
/// navigateur racine : fonctionne même si l'écran appelant est démonté.
void retournerAccueilPublic() {
  cleNavigateurApp.currentState?.pushAndRemoveUntil(
    MaterialPageRoute(builder: (_) => const PublicAcceuilPage()),
    (_) => false,
  );
}

/// Ferme la session (même hors réseau) puis revient à l'accueil public.
///
/// Tout ce qui dépend de l'écran appelant est lu AVANT la déconnexion : dès
/// que la session passe à null, l'espace se reconstruit et se démonte
/// (AccueilCompte), son `context` et son `ref` ne sont plus utilisables —
/// c'était la cause de l'écran noir après « Se déconnecter ».
/// [nettoyer] : providers propres à l'espace à invalider ensuite.
Future<void> fermerSessionEtRevenirAccueil(
  BuildContext context, {
  void Function(ProviderContainer container)? nettoyer,
}) async {
  final container = ProviderScope.containerOf(context, listen: false);
  try {
    await container.read(sessionControllerProvider.notifier).deconnecter();
  } catch (_) {
    // Session déjà fermée localement (voir SessionController.deconnecter).
  }
  nettoyer?.call(container);
  retournerAccueilPublic();
}

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
  if (ok != true || !context.mounted) return;
  await fermerSessionEtRevenirAccueil(context);
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
