// lib/pages/mise_a_jour/veille_mise_a_jour.dart
//
// Monté au-dessus de toute l'application (MaterialApp.builder) :
//   - au démarrage, vérifie la version publiée et, si elle est plus récente,
//     propose la mise à jour (une fois par lancement) ;
//   - au retour au premier plan, reprend l'installation si l'utilisateur
//     revient des réglages « installer des applications inconnues ».

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/mise_a_jour_controller.dart';
import '../pilote_push.dart' show cleNavigateurApp;
import 'mise_a_jour_page.dart';

class VeilleMiseAJour extends ConsumerStatefulWidget {
  const VeilleMiseAJour({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<VeilleMiseAJour> createState() => _VeilleMiseAJourState();
}

class _VeilleMiseAJourState extends ConsumerState<VeilleMiseAJour> with WidgetsBindingObserver {
  bool _proposee = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState etat) {
    if (etat == AppLifecycleState.resumed) {
      ref.read(miseAJourProvider.notifier).surRetourPremierPlan();
    }
  }

  void _proposer(EtatMiseAJour etat) {
    if (_proposee || etat.phase != PhaseMiseAJour.disponible || !etat.nouvelleVersion) return;
    final contexte = cleNavigateurApp.currentContext;
    if (contexte == null) return;
    _proposee = true;
    showModalBottomSheet<void>(
      context: contexte,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (feuille) => _FeuilleNouvelleVersion(
        etat: etat,
        onMettreAJour: () {
          Navigator.of(feuille).pop();
          ref.read(miseAJourProvider.notifier).telecharger();
          ouvrirMisesAJour(contexte);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Lire le fournisseur lance la vérification au démarrage.
    ref.listen<EtatMiseAJour>(miseAJourProvider, (_, etat) => _proposer(etat));
    return widget.child;
  }
}

class _FeuilleNouvelleVersion extends StatelessWidget {
  const _FeuilleNouvelleVersion({required this.etat, required this.onMettreAJour});

  final EtatMiseAJour etat;
  final VoidCallback onMettreAJour;

  @override
  Widget build(BuildContext context) {
    final v = etat.publiee!;
    final notes = (v.description ?? '').trim();
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(child: ApsIconTile(Icons.system_update_rounded, size: 52)),
            const SizedBox(height: 12),
            Text('Nouvelle version disponible', textAlign: TextAlign.center, style: AppTextStyles.h3),
            const SizedBox(height: 6),
            Text(
              'ApSa ${v.nom ?? ''} est disponible (vous avez la version ${etat.installee?.nom ?? '—'}). '
              'La mise à jour ne prend qu’un instant et conserve vos données.',
              textAlign: TextAlign.center,
              style: AppTextStyles.small,
            ),
            if (notes.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.bg,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(notes, maxLines: 5, overflow: TextOverflow.ellipsis, style: AppTextStyles.small),
              ),
            ],
            const SizedBox(height: 18),
            ApsButton(label: 'Mettre à jour', icon: Icons.download_rounded, onPressed: onMettreAJour),
            const SizedBox(height: 8),
            ApsButton(
              label: 'Plus tard',
              variant: ApsButtonVariant.ghost,
              small: true,
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    );
  }
}
