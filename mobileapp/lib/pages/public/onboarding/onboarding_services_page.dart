import 'package:flutter/material.dart';

import '../../../components/components.dart';
import '../Centresantepage.dart';
import '../Pharmaciepage.dart';
import '../urgence.dart';
import 'onboarding_assurance_ville_page.dart';
import 'onboarding_medecin_ville_page.dart';

/// Écran 1.1 — Liste des services de ApSa Santé.
///
/// Portage de `OnboardingServices.jsx`. "Médecins et professionnels" et
/// "Assurances" ouvrent chacun le sous-parcours guidé en 2 étapes
/// (ville puis spécialité/type — voir [OnboardingMedecinVillePage] /
/// [OnboardingAssuranceVillePage]) ; les autres services, déjà pourvus
/// d'un annuaire complet dans l'app, y renvoient directement.
/// "Pompes funèbres" reste affichée mais désactivée : comme côté web,
/// aucun annuaire dédié n'existe encore côté client pour ce service.
///
/// ⚠️ Fichier ajouté pour que [OnboardingAccueilPage] ("Rechercher un
/// professionnel") ait une destination cohérente qui laisse le choix
/// entre les DEUX sous-parcours fournis (Médecins, Assurances) — sans
/// lui, seul l'un des deux aurait été atteignable depuis l'accueil.
class OnboardingServicesPage extends StatelessWidget {
  const OnboardingServicesPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(
        backgroundColor: AppColors.paper,
        elevation: 0,
        foregroundColor: AppColors.ink,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'APS SANTÉ',
                style: AppTextStyles.cardMeta.copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Liste des services de ApSa Santé',
                style: AppTextStyles.h3.copyWith(fontSize: 20),
              ),
              const SizedBox(height: 22),
              _ServiceCard(
                icon: Icons.medical_services_outlined,
                title: 'Médecins et professionnels',
                subtitle: 'Généralistes, spécialistes, dentistes…',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const OnboardingMedecinVillePage(),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              _ServiceCard(
                icon: Icons.local_pharmacy_outlined,
                title: 'Pharmacie',
                subtitle: 'De garde ou horaires classiques',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const PharmaciePage()),
                ),
              ),
              const SizedBox(height: 10),
              _ServiceCard(
                icon: Icons.health_and_safety_outlined,
                title: 'Assurances',
                subtitle: 'Compagnies et courtiers santé',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const OnboardingAssuranceVillePage(),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              _ServiceCard(
                icon: Icons.local_hospital_outlined,
                title: 'Structures de santé',
                subtitle: 'Cliniques, hôpitaux, centres de santé',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const CentreSantePage()),
                ),
              ),
              const SizedBox(height: 10),
              _ServiceCard(
                icon: Icons.emergency_outlined,
                title: 'Ambulances',
                subtitle: 'Appel direct, intervention rapide',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const UrgencePage()),
                ),
              ),
              const SizedBox(height: 10),
              const _ServiceCard(
                icon: Icons.volunteer_activism_outlined,
                title: 'Pompes funèbres',
                subtitle: 'Bientôt disponible',
                onTap: null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ServiceCard extends StatelessWidget {
  const _ServiceCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    return Material(
      color: AppColors.card,
      borderRadius: AppRadius.mdRadius,
      child: InkWell(
        borderRadius: AppRadius.mdRadius,
        onTap: onTap,
        child: Opacity(
          opacity: disabled ? 0.5 : 1,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            decoration: BoxDecoration(
              borderRadius: AppRadius.mdRadius,
              border: Border.all(color: AppColors.line),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: const BoxDecoration(
                    color: AppColors.primarySurface,
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Icon(icon, color: AppColors.primary, size: 22),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: AppTextStyles.cardTitle.copyWith(fontSize: 15.5)),
                      const SizedBox(height: 3),
                      Text(subtitle, style: AppTextStyles.body),
                    ],
                  ),
                ),
                if (!disabled)
                  const Icon(Icons.chevron_right, color: AppColors.inkFaint),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
