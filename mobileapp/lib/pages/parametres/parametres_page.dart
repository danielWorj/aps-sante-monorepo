// lib/pages/parametres/parametres_page.dart
//
// Paramètres de l'application (volontairement simple) : mise à jour de
// l'application, version installée, pages d'information et déconnexion.
// Accès : icône engrenage en haut de l'accueil public et des tableaux de
// bord (BoutonParametres).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../controllers/mise_a_jour_controller.dart';
import '../espaces/carte_connexion_compte.dart' show LigneMisesAJour;
import '../public/apropos.dart';

void ouvrirParametres(BuildContext context) {
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ParametresPage()));
}

class ParametresPage extends ConsumerWidget {
  const ParametresPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final connecte = ref.watch(authUtilisateurProvider) != null;
    final installee = ref.watch(miseAJourProvider.select((e) => e.installee));

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 32),
          children: [
            const ApsTopBar(title: 'Paramètres', overline: 'APS Santé'),
            const _Section(
              titre: 'Application',
              lignes: [LigneMisesAJour()],
            ),
            const SizedBox(height: 16),
            _Section(
              titre: 'Informations',
              lignes: [
                ApsMenuItem(
                  icon: Icons.info_outline_rounded,
                  title: 'À propos d’ApSa',
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AProposPage())),
                ),
                ApsMenuItem(
                  icon: Icons.description_outlined,
                  title: 'Conditions générales d’utilisation',
                  onTap: () => ouvrirPageLegale(context, '/cgu'),
                ),
                ApsMenuItem(
                  icon: Icons.privacy_tip_outlined,
                  title: 'Politique de confidentialité',
                  onTap: () => ouvrirPageLegale(context, '/confidentialite'),
                ),
              ],
            ),
            if (connecte) ...[
              const SizedBox(height: 16),
              _Section(
                titre: 'Compte',
                lignes: [
                  ApsMenuItem(
                    icon: Icons.logout_rounded,
                    title: 'Se déconnecter',
                    destructive: true,
                    showChevron: false,
                    onTap: () => deconnecterEspace(context, ref),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 24),
            Text(
              installee == null ? 'ApSa' : 'ApSa ${installee.nom} · build ${installee.build}',
              textAlign: TextAlign.center,
              style: AppTextStyles.xs,
            ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.titre, required this.lignes});

  final String titre;
  final List<Widget> lignes;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(titre.toUpperCase(), style: AppTextStyles.xs.copyWith(letterSpacing: 0.6)),
        ),
        ApsCard(
          flat: true,
          radius: 10,
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < lignes.length; i++) ...[
                if (i > 0) const Divider(height: 1, thickness: 1, color: AppColors.line),
                lignes[i],
              ],
            ],
          ),
        ),
      ],
    );
  }
}
