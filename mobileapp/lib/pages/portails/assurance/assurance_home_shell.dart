// lib/pages/portails/assurance/assurance_home_shell.dart
//
// Shell du portail assurance (rôle agent_assurance) — pendant mobile de
// /portail/assurance : Tableau de bord, Demandes, Profil, Multimédia,
// Abonnement. Même structure que MedecinHomeShell : pas d'AppBar, cloche
// flottante en haut à droite, barre basse flottante.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/cards/notifications_bell.dart';
import '../../../components/navigation/role-bottom-navigation.dart';
import '../../../components/style/colors.dart';
import '../../../components/style/text_styles.dart';
import '../../../controllers/portail_assurance_controller.dart';
import 'portail-assurance-abonnement.dart';
import 'portail-assurance-dashboard.dart';
import 'portail-assurance-demandes.dart';
import 'portail-assurance-medias.dart';
import 'portail-assurance-profil.dart';
import 'portail_assurance_commun.dart';

class AssuranceHomeShell extends ConsumerStatefulWidget {
  const AssuranceHomeShell({super.key});

  @override
  ConsumerState<AssuranceHomeShell> createState() => _AssuranceHomeShellState();
}

class _AssuranceHomeShellState extends ConsumerState<AssuranceHomeShell> {
  static const int _indexDemandes = 1;
  static const int _indexAbonnement = 4;

  int _index = 0;

  void _ouvrir(int i) {
    setState(() => _index = i);
    if (i == _indexDemandes) ref.invalidate(nouvellesDemandesAssuranceProvider);
  }

  @override
  Widget build(BuildContext context) {
    final fiche = ref.watch(maFicheAssuranceProvider);
    final nouvelles = ref.watch(nouvellesDemandesAssuranceProvider).value ?? 0;

    final pages = <Widget>[
      PortailAssuranceDashboard(onOuvrirOnglet: _ouvrir),
      PortailAssuranceDemandes(onOuvrirAbonnement: () => _ouvrir(_indexAbonnement)),
      const PortailAssuranceProfil(),
      PortailAssuranceMedias(onOuvrirAbonnement: () => _ouvrir(_indexAbonnement)),
      const PortailAssuranceAbonnement(),
    ];

    return Scaffold(
      extendBody: true,
      backgroundColor: AppColors.paper,
      body: SafeArea(
        bottom: false,
        child: fiche.when(
          loading: () => const ChargementPortail(),
          error: (e, _) => _SansFiche(erreur: e, onReessayer: () => ref.invalidate(maFicheAssuranceProvider)),
          data: (_) => Stack(
            children: [
              IndexedStack(index: _index, children: pages),
              Positioned(
                top: 12,
                right: 18,
                child: NotificationsBell(
                  onOuvrirRendezVous: () => _ouvrir(_indexDemandes),
                  onOuvrirDemandes: () => _ouvrir(_indexDemandes),
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: fiche.hasValue
          ? RoleBottomNavigationBar(
              currentIndex: _index,
              onTap: _ouvrir,
              items: [
                const RoleNavItem(icon: Icons.dashboard_outlined, label: 'Accueil'),
                RoleNavItem(icon: Icons.inbox_outlined, label: 'Demandes', badgeCount: nouvelles > 0 ? nouvelles : null),
                const RoleNavItem(icon: Icons.shield_outlined, label: 'Profil'),
                const RoleNavItem(icon: Icons.perm_media_outlined, label: 'Médias'),
                const RoleNavItem(icon: Icons.workspace_premium_outlined, label: 'Abonnement'),
              ],
            )
          : null,
    );
  }
}

class _SansFiche extends ConsumerWidget {
  final Object erreur;
  final VoidCallback onReessayer;

  const _SansFiche({required this.erreur, required this.onReessayer});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final aucune = (erreur as dynamic).statusCode == 404;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.shield_outlined, size: 44, color: AppColors.primary),
            const SizedBox(height: 10),
            const Text('Aucune fiche assurance', style: AppTextStyles.h3),
            const SizedBox(height: 6),
            Text(
              aucune
                  ? "Votre compte n'est rattaché à aucune compagnie d'assurance ni à aucun courtier."
                  : messageErreur(erreur),
              textAlign: TextAlign.center,
              style: AppTextStyles.body,
            ),
            const SizedBox(height: 12),
            if (!aucune) TextButton(onPressed: onReessayer, child: const Text('Réessayer')),
            TextButton.icon(
              onPressed: () => deconnecterPortail(context, ref),
              icon: const Icon(Icons.logout, size: 18),
              label: const Text('Déconnexion'),
            ),
          ],
        ),
      ),
    );
  }
}
