// lib/pages/portails/presence/presence_home_shell.dart
//
// Shell des espaces pharmacie (rôle agent_pharmacie) et centre de santé
// (agent_structure_sante) — pendant mobile de /portail/pharmacie et
// /portail/structure : Accueil, Ma fiche, Horaires, Messages, Plus (photos,
// actualités, gardes / prestations, avis, abonnement, annonces ApSa).
// Même structure que LaboratoireHomeShell : pas d'AppBar, cloche flottante
// en haut à droite, barre basse flottante.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/cards/notifications_bell.dart';
import '../../../components/navigation/role-bottom-navigation.dart';
import '../../../components/style/colors.dart';
import '../../../components/style/text_styles.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/espace_presence_controller.dart';
import '../../../models/espace_presence_models.dart';
import 'portail-presence-dashboard.dart';
import 'portail-presence-fiche.dart';
import 'portail-presence-horaires.dart';
import 'portail-presence-messages.dart';
import 'portail-presence-plus.dart';
import 'presence_commun.dart';

class PresenceHomeShell extends ConsumerStatefulWidget {
  const PresenceHomeShell({super.key, required this.type});

  final TypeEspacePresence type;

  @override
  ConsumerState<PresenceHomeShell> createState() => _PresenceHomeShellState();
}

class _PresenceHomeShellState extends ConsumerState<PresenceHomeShell> {
  static const int indexMessages = 3;

  int _index = 0;

  void _ouvrir(int i) {
    setState(() => _index = i);
    if (i == indexMessages) ref.invalidate(messagesNonLusPresenceProvider(widget.type));
  }

  @override
  Widget build(BuildContext context) {
    final type = widget.type;
    final fiche = ref.watch(maFichePresenceProvider(type));
    final nonLus = ref.watch(messagesNonLusPresenceProvider(type)).value ?? 0;

    final pages = <Widget>[
      PortailPresenceDashboard(type: type, onOuvrirOnglet: _ouvrir),
      PortailPresenceFiche(type: type),
      PortailPresenceHoraires(type: type),
      PortailPresenceMessages(type: type),
      PortailPresencePlus(type: type),
    ];

    return Scaffold(
      extendBody: true,
      backgroundColor: AppColors.paper,
      body: SafeArea(
        bottom: false,
        child: fiche.when(
          loading: () => const ChargementPortail(),
          error: (e, _) => _SansFiche(type: type, erreur: e),
          data: (_) => Stack(
            children: [
              IndexedStack(index: _index, children: pages),
              Positioned(
                top: 12,
                right: 18,
                child: NotificationsBell(
                  onOuvrirRendezVous: () => _ouvrir(0),
                  onOuvrirDemandes: () => _ouvrir(indexMessages),
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
                RoleNavItem(icon: iconeEspace(type), label: 'Ma fiche'),
                const RoleNavItem(icon: Icons.schedule_outlined, label: 'Horaires'),
                RoleNavItem(icon: Icons.mail_outline_rounded, label: 'Messages', badgeCount: nonLus > 0 ? nonLus : null),
                const RoleNavItem(icon: Icons.menu_rounded, label: 'Plus'),
              ],
            )
          : null,
    );
  }
}

class _SansFiche extends ConsumerWidget {
  const _SansFiche({required this.type, required this.erreur});

  final TypeEspacePresence type;
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
            Icon(iconeEspace(type), size: 44, color: AppColors.primary),
            const SizedBox(height: 10),
            Text(type == TypeEspacePresence.pharmacie ? 'Aucune pharmacie' : 'Aucun centre de santé', style: AppTextStyles.h3),
            const SizedBox(height: 6),
            Text(
              aucune ? "Votre compte n'est rattaché à aucune fiche ${type.libelle} dans cet espace." : messageErreur(erreur),
              textAlign: TextAlign.center,
              style: AppTextStyles.body,
            ),
            const SizedBox(height: 12),
            if (!aucune) TextButton(onPressed: () => ref.invalidate(maFichePresenceProvider(type)), child: const Text('Réessayer')),
            TextButton.icon(
              onPressed: () async {
                if (!await confirmerPortail(context, 'Déconnexion', 'Se déconnecter de votre espace ?', action: 'Se déconnecter')) return;
                try {
                  await ref.read(sessionControllerProvider.notifier).deconnecter();
                } catch (_) {
                  // Session déjà fermée localement.
                }
                ref.invalidate(maFichePresenceProvider(type));
                if (context.mounted) Navigator.of(context).popUntil((r) => r.isFirst);
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
