// lib/pages/portails/laboratoire/laboratoire_home_shell.dart
//
// Shell du portail laboratoire (rôle agent_laboratoire) — pendant mobile de
// /portail/laboratoire : Tableau de bord, Examens, Centres, Médias, Profil.
// Même structure que AssuranceHomeShell : pas d'AppBar, cloche flottante en
// haut à droite, barre basse flottante.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/navigation/bouton_accueil_public.dart';
import '../../../components/cards/notifications_bell.dart';
import '../../../components/navigation/bouton_deconnexion.dart';
import '../../../components/navigation/role-bottom-navigation.dart';
import '../../../components/style/colors.dart';
import '../../../components/style/text_styles.dart';
import '../../../controllers/laboratoire_controller.dart';
import 'portail-laboratoire-centres.dart';
import 'portail-laboratoire-dashboard.dart';
import 'portail-laboratoire-examens.dart';
import 'portail-laboratoire-medias.dart';
import 'portail-laboratoire-profil.dart';
import 'portail_laboratoire_commun.dart';

class LaboratoireHomeShell extends ConsumerStatefulWidget {
  const LaboratoireHomeShell({super.key});

  @override
  ConsumerState<LaboratoireHomeShell> createState() => _LaboratoireHomeShellState();
}

class _LaboratoireHomeShellState extends ConsumerState<LaboratoireHomeShell> {
  int _index = 0;

  void _ouvrir(int i) => setState(() => _index = i);

  @override
  Widget build(BuildContext context) {
    final fiche = ref.watch(monLaboratoireProvider);
    final pages = <Widget>[
      PortailLaboratoireDashboard(onOuvrirOnglet: _ouvrir),
      const PortailLaboratoireExamens(),
      const PortailLaboratoireCentres(),
      const PortailLaboratoireMedias(),
      const PortailLaboratoireProfil(),
    ];

    return Scaffold(
      extendBody: true,
      backgroundColor: AppColors.paper,
      body: SafeArea(
        bottom: false,
        child: fiche.when(
          loading: () => const ChargementPortail(),
          error: (e, _) => _SansFiche(erreur: e),
          data: (_) => Stack(
            children: [
              IndexedStack(index: _index, children: pages),
              Positioned(
                top: 12,
                right: 18,
                child: NotificationsBell(onOuvrirRendezVous: () => _ouvrir(0)),
              ),
            ],
          ),
        ),
      ),
      // Retour à l'accueil public sans se déconnecter.
      floatingActionButton: const BoutonAccueilPublic(),
      bottomNavigationBar: fiche.hasValue
          ? RoleBottomNavigationBar(
              currentIndex: _index,
              onTap: _ouvrir,
              items: const [
                RoleNavItem(icon: Icons.dashboard_outlined, label: 'Accueil'),
                RoleNavItem(icon: Icons.science_outlined, label: 'Examens'),
                RoleNavItem(icon: Icons.place_outlined, label: 'Centres'),
                RoleNavItem(icon: Icons.perm_media_outlined, label: 'Médias'),
                RoleNavItem(icon: Icons.biotech_outlined, label: 'Profil'),
              ],
            )
          : null,
    );
  }
}

class _SansFiche extends ConsumerWidget {
  const _SansFiche({required this.erreur});

  final Object erreur;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final aucune = (erreur as dynamic).statusCode == 404;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.biotech_outlined, size: 44, color: AppColors.primary),
            const SizedBox(height: 10),
            const Text('Aucun laboratoire', style: AppTextStyles.h3),
            const SizedBox(height: 6),
            Text(
              aucune ? "Votre compte n'est rattaché à aucun laboratoire d'analyses." : messageErreur(erreur),
              textAlign: TextAlign.center,
              style: AppTextStyles.body,
            ),
            const SizedBox(height: 12),
            if (!aucune) TextButton(onPressed: () => ref.invalidate(monLaboratoireProvider), child: const Text('Réessayer')),
            TextButton.icon(
              onPressed: () async {
                if (!await confirmerPortail(context, 'Déconnexion', 'Se déconnecter de votre espace ?', action: 'Se déconnecter')) return;
                if (!context.mounted) return;
                await fermerSessionEtRevenirAccueil(context, nettoyer: (c) => c.invalidate(monLaboratoireProvider));
              },
              icon: const Icon(Icons.logout, size: 18),
              label: const Text('Déconnexion'),
            ),
          ],
        ),
      ),
    );
  }
}
