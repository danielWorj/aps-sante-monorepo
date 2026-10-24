import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../controllers/mise_a_jour_controller.dart';
import '../../pages/parametres/parametres_page.dart';
import '../style/colors.dart';
import '../ui/aps_ui.dart';

/// Accès aux paramètres de l'application, en haut de l'accueil public et des
/// tableaux de bord. Une pastille signale une mise à jour disponible.
class BoutonParametres extends ConsumerWidget {
  const BoutonParametres({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nouvelleVersion = ref.watch(miseAJourProvider.select((e) => e.nouvelleVersion));
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ApsIconButton(
        icon: Icons.settings_outlined,
        size: 38,
        iconColor: AppColors.ink2,
        dot: nouvelleVersion,
        tooltip: 'Paramètres',
        onPressed: () => ouvrirParametres(context),
      ),
    );
  }
}
