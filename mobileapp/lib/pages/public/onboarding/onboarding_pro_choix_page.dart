import 'package:flutter/material.dart';

import '../../../components/components.dart';
import '../Medecinpage.dart' show medecinProviderContainer;
import '../login.dart';
import '../utils/createmedecinpage.dart';

/// Écran 1.2 — Parcours « Je suis professionnel ».
///
/// N'a pas d'équivalent direct côté client-plateform : sur le web,
/// « Je suis professionnel » (`OnboardingAccueil.jsx`) renvoie
/// directement vers `/login`, la création de fiche (`/devenir-medecin`)
/// restant accessible séparément depuis `/inscription`
/// (`inscriptionportail.jsx`). Cet écran regroupe les deux dans l'app
/// mobile, comme demandé : un professionnel qui a déjà un compte se
/// connecte ([LoginScreen]), un professionnel qui n'en a pas encore crée
/// sa fiche ([CreateMedecinScreen], parcours en 6 étapes déjà existant).
///
/// [CreateMedecinScreen] reçoit explicitement [medecinProviderContainer]
/// (le même [ProviderContainer] que [MedecinPage]/l'onboarding médecin)
/// plutôt que son container de repli par défaut : la création de fiche
/// invalide [listeMedecinsControllerProvider] en interne au succès, ce
/// qui ne profite à l'annuaire déjà ouvert par ailleurs dans l'app que
/// si tout le monde partage le même container.
class OnboardingProChoixPage extends StatelessWidget {
  const OnboardingProChoixPage({super.key});

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
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'PROFESSIONNELS DE SANTÉ',
                style: AppTextStyles.cardMeta.copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Comment souhaitez-vous continuer ?',
                style: AppTextStyles.h3.copyWith(fontSize: 20),
              ),
              const SizedBox(height: 24),
              _ProChoiceCard(
                icon: Icons.login_rounded,
                title: 'Connexion',
                subtitle: "J'ai déjà un compte professionnel",
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                ),
              ),
              const SizedBox(height: 14),
              _ProChoiceCard(
                icon: Icons.add_circle_outline_rounded,
                title: 'Créer ma fiche professionnelle',
                subtitle: 'Médecin, spécialiste — inscription en 6 étapes',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => CreateMedecinScreen(
                      container: medecinProviderContainer,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProChoiceCard extends StatelessWidget {
  const _ProChoiceCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
      borderRadius: AppRadius.mdRadius,
      child: InkWell(
        borderRadius: AppRadius.mdRadius,
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
          decoration: BoxDecoration(
            borderRadius: AppRadius.mdRadius,
            border: Border.all(color: AppColors.line),
            boxShadow: AppColors.shadowSoft,
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
                    Text(title, style: AppTextStyles.cardTitle.copyWith(fontSize: 15.5)),
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
