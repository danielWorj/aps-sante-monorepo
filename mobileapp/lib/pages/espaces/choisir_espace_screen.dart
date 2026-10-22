// lib/pages/espaces/choisir_espace_screen.dart
//
// « Choisir mon espace » : affiché après la connexion quand le compte a
// plusieurs espaces (patient, médecin, structure gérée, publicités…), et
// ouvert ensuite par « Changer d'espace ». Le dernier espace utilisé est
// en tête ; le choix est retenu côté serveur.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../models/authentification_models.dart';
import '../home_router_for_role.dart';
import 'confirmation_pin.dart';

IconData iconeEspace(String type) {
  switch (type) {
    case 'patient':
      return Icons.person_outline_rounded;
    case 'medecin':
      return Icons.medical_services_outlined;
    case 'pharmacie':
      return Icons.local_pharmacy_outlined;
    case 'structure':
      return Icons.local_hospital_outlined;
    case 'assurance':
      return Icons.shield_outlined;
    case 'laboratoire':
      return Icons.biotech_outlined;
    case 'publicites':
      return Icons.campaign_outlined;
    default:
      return Icons.account_circle_outlined;
  }
}

/// Ouvre l'espace [espace] à la place de l'écran courant : le serveur ouvre
/// une session sur cet espace (rôle de l'espace), le PIN étant demandé pour
/// un espace professionnel. Le choix est retenu côté serveur.
Future<void> ouvrirEspace(BuildContext context, WidgetRef ref, EspaceCompte espace) async {
  if (!await basculerVersEspace(context, ref, espace) || !context.mounted) return;
  final role = ref.read(authUtilisateurProvider)?.role;
  if (role == null) return;
  Navigator.of(context).pushAndRemoveUntil(
    MaterialPageRoute(builder: (_) => ecranEspace(espace, role)),
    (route) => route.isFirst,
  );
}

class ChoisirEspaceScreen extends ConsumerWidget {
  const ChoisirEspaceScreen({super.key, this.espaces});

  /// Liste déjà connue (réponse de connexion) ; sinon chargée.
  final List<EspaceCompte>? espaces;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final etat = espaces != null ? AsyncData(espaces!) : ref.watch(espacesCompteProvider);

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
          children: [
            const ApsTopBar(title: 'Choisir mon espace', overline: 'Mon compte'),
            Text(
              'Où souhaitez-vous aller ? Vous pourrez changer d’espace à tout moment.',
              style: AppTextStyles.small.copyWith(fontSize: 14),
            ),
            const SizedBox(height: 16),
            ...etat.when(
              loading: () => const [Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))],
              error: (e, _) => [
                ApsEmptyState(
                  icon: Icons.wifi_off_rounded,
                  tone: ApsTone.neutral,
                  title: 'Espaces indisponibles',
                  message: '$e',
                  actionLabel: 'Réessayer',
                  onAction: () => ref.invalidate(espacesCompteProvider),
                ),
              ],
              data: (liste) => [
                for (final e in liste) ...[
                  ApsCard(
                    flat: true,
                    radius: 10,
                    borderColor: e.dernier ? AppColors.b6 : null,
                    onTap: () => ouvrirEspace(context, ref, e),
                    child: Row(
                      children: [
                        ApsIconTile(iconeEspace(e.type), tone: e.professionnel ? ApsTone.green : ApsTone.sky),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(e.libelle, style: AppTextStyles.strong.copyWith(fontSize: 14)),
                              if (e.detail != null) Text(e.detail!, style: AppTextStyles.xs),
                            ],
                          ),
                        ),
                        if (e.dernier) const ApsPill('Dernier utilisé'),
                        if (e.professionnel)
                          const Padding(
                            padding: EdgeInsets.only(left: 6),
                            child: Icon(Icons.lock_outline_rounded, size: 16, color: AppColors.ink3),
                          ),
                        const Icon(Icons.chevron_right_rounded, color: AppColors.ink3),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
