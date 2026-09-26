import 'package:flutter/material.dart';

import '../../../components/components.dart';
import '../publicAcceuil.dart';
import 'onboarding_pro_choix_page.dart';
import 'onboarding_services_page.dart';

/// Écran 1 — Accueil / choix initial du parcours d'onboarding.
///
/// Portage de `OnboardingAccueil.jsx`. Point d'entrée de l'app (voir
/// main.dart) : oriente un nouvel arrivant entre "Rechercher un
/// professionnel" ([OnboardingServicesPage], Écran 1.1) et "Je suis
/// professionnel" ([OnboardingProChoixPage], Écran 1.2 — déjà fourni).
/// Un lien "Passer" permet de rejoindre directement [PublicAcceuilPage]
/// sans passer par le reste du parcours.
class OnboardingAccueilPage extends StatelessWidget {
  const OnboardingAccueilPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                'BIENVENUE SUR APS SANTÉ',
                style: AppTextStyles.cardMeta.copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                ),
              ),
              const SizedBox(height: 8),
              Text('Que souhaitez-vous faire ?',
                  style: AppTextStyles.h3.copyWith(fontSize: 22)),
              const SizedBox(height: 6),
              Text(
                "Choisissez une option pour démarrer, ou passez directement à l'accueil.",
                style: AppTextStyles.body.copyWith(color: AppColors.inkSoft),
              ),
              const SizedBox(height: 28),
              _ChoiceCard(
                icon: Icons.search_rounded,
                title: 'Rechercher un professionnel',
                subtitle: 'Médecins, pharmacies, structures de santé…',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const OnboardingServicesPage(),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              _ChoiceCard(
                icon: Icons.medical_information_outlined,
                title: 'Je suis professionnel',
                subtitle: 'Connexion à mon espace professionnel',
                highlighted: true,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const OnboardingProChoixPage(),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Center(
                child: TextButton.icon(
                  onPressed: () => Navigator.of(context).pushReplacement(
                    MaterialPageRoute(builder: (_) => const PublicAcceuilPage()),
                  ),
                  icon: const Icon(Icons.arrow_forward_rounded, size: 16),
                  label: const Text('Passer'),
                  style: TextButton.styleFrom(foregroundColor: AppColors.inkSoft),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChoiceCard extends StatelessWidget {
  const _ChoiceCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.highlighted = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: highlighted ? AppColors.primarySurface : AppColors.card,
      borderRadius: AppRadius.mdRadius,
      child: InkWell(
        borderRadius: AppRadius.mdRadius,
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
          decoration: BoxDecoration(
            borderRadius: AppRadius.mdRadius,
            border: Border.all(
              color: highlighted ? AppColors.primary : AppColors.line,
            ),
            boxShadow: AppColors.shadowSoft,
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: highlighted ? AppColors.primary : AppColors.primarySurface,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Icon(
                  icon,
                  color: highlighted ? Colors.white : AppColors.primary,
                  size: 22,
                ),
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
              const Icon(Icons.chevron_right, color: AppColors.inkFaint),
            ],
          ),
        ),
      ),
    );
  }
}
