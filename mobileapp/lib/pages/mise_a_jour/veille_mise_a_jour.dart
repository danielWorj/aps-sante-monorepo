// lib/pages/mise_a_jour/veille_mise_a_jour.dart
//
// Monté au-dessus de toute l'application (MaterialApp.builder) :
//   - au démarrage, vérifie la version publiée et, si elle est plus récente
//     et que l'appareil fait partie du déploiement, propose la mise à jour
//     (une fois par version et par lancement) — après le pré-téléchargement
//     silencieux s'il a lieu : il ne reste alors qu'à installer ;
//   - build sous le minimum requis : remplace l'application par l'écran
//     « Mise à jour obligatoire » (MiseAJourPage, non quittable) ;
//   - au retour au premier plan, reprend l'installation si l'utilisateur
//     revient des réglages « installer des applications inconnues », ou
//     vérifie de nouveau après quelques heures.

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
  /// Version déjà proposée pendant ce lancement (id de la version publiée).
  String? _proposee;

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
    final id = etat.publiee?.id;
    if (id == null || _proposee == id) return;
    if (!etat.nouvelleVersion || !etat.installable || !etat.dansDeploiement || etat.obligatoire) return;
    // Pré-téléchargement en cours : on attend qu'il aboutisse (phase prêt),
    // ou qu'il échoue (retour à « disponible » sans automatique).
    final pret = etat.phase == PhaseMiseAJour.pret;
    if (!pret && (etat.phase != PhaseMiseAJour.disponible || etat.automatique)) return;
    final contexte = cleNavigateurApp.currentContext;
    if (contexte == null) return;
    _proposee = id;
    showModalBottomSheet<void>(
      context: contexte,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (feuille) => _FeuilleNouvelleVersion(
        etat: etat,
        onMettreAJour: () {
          Navigator.of(feuille).pop();
          final controleur = ref.read(miseAJourProvider.notifier);
          pret ? controleur.installer() : controleur.telecharger();
          ouvrirMisesAJour(contexte);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Lire le fournisseur lance la vérification au démarrage.
    ref.listen<EtatMiseAJour>(miseAJourProvider, (_, etat) => _proposer(etat));
    final obligatoire = ref.watch(miseAJourProvider.select((e) => e.obligatoire));
    if (!obligatoire) return widget.child;
    // Navigateur propre : la page (ApsTopBar, feuilles) en a besoin, et celui
    // de l'application est retiré tant que la mise à jour n'est pas faite.
    return Navigator(
      onGenerateRoute: (_) => MaterialPageRoute(builder: (_) => const MiseAJourPage(obligatoire: true)),
    );
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
              '${etat.phase == PhaseMiseAJour.pret ? 'Elle est déjà téléchargée : il ne reste qu’à l’installer. ' : ''}'
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
            etat.phase == PhaseMiseAJour.pret
                ? ApsButton(label: 'Installer', icon: Icons.install_mobile_rounded, onPressed: onMettreAJour)
                : ApsButton(label: 'Mettre à jour', icon: Icons.download_rounded, onPressed: onMettreAJour),
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
