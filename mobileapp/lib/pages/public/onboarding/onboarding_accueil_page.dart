import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../components/components.dart';
import '../publicAcceuil.dart';
import 'onboarding_pro_choix_page.dart';
import 'onboarding_services_page.dart';
import '../../../utils/marque.dart';

/// Écran 01 — Accueil au premier lancement (refonte 2026).
///
/// Point d'entrée de l'app (voir main.dart). Fond vert profond, la
/// promesse en une phrase (centrée verticalement), puis deux actions,
/// comme l'onboarding du site public (aucune mention de paiement sur cet écran) :
///   - « Je recherche un professionnel » -> [OnboardingServicesPage] ;
///   - « Je suis professionnel » -> [OnboardingProChoixPage] (connexion
///     ou création de fiche).
/// « Passer » rejoint directement [PublicAcceuilPage].
class OnboardingAccueilPage extends StatelessWidget {
  const OnboardingAccueilPage({super.key});

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: AppColors.b9,
        body: Stack(
          children: [
            // Halo vert en haut à droite, halo plus sombre à gauche.
            const Positioned.fill(child: _Fond()),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(22, 6, 22, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _EnTete(
                      onPasser: () => Navigator.of(context).pushReplacement(
                        MaterialPageRoute(
                          builder: (_) => const PublicAcceuilPage(),
                        ),
                      ),
                    ),
                    Expanded(
                      child: Center(
                        child: SingleChildScrollView(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text.rich(
                                TextSpan(
                                  children: [
                                    const TextSpan(text: 'Votre santé,\n'),
                                    TextSpan(
                                      text: 'à portée de main.',
                                      style: AppTextStyles.serif.copyWith(
                                        fontSize: 40,
                                        color: AppColors.mint,
                                      ),
                                    ),
                                  ],
                                ),
                                style: const TextStyle(
                                  fontFamily: AppTextStyles.fontSans,
                                  color: Colors.white,
                                  fontSize: 34,
                                  height: 1.04,
                                  letterSpacing: -1.5,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 10),
                              Text(
                                'Trouvez un médecin disponible, une pharmacie de garde ou un centre de santé, en quelques gestes.',
                                style: AppTextStyles.small.copyWith(
                                  fontSize: 14,
                                  height: 1.55,
                                  color: Colors.white.withValues(alpha: 0.72),
                                ),
                              ),
                              const SizedBox(height: 24),
                              // Mêmes choix que l'onboarding du site public
                              // (OnboardingAccueil.jsx).
                              ApsButton(
                                label: 'Je recherche un professionnel',
                                icon: Icons.search_rounded,
                                variant: ApsButtonVariant.white,
                                onPressed: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        const OnboardingServicesPage(),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              ApsButton(
                                label: 'Je suis professionnel',
                                icon: Icons.medical_services_outlined,
                                variant: ApsButtonVariant.ghostWhite,
                                onPressed: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        const OnboardingProChoixPage(),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Fond extends StatelessWidget {
  const _Fond();

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned(
          right: -140,
          top: -120,
          child: Container(
            width: 440,
            height: 400,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: [Color(0xFF1FA673), Color(0x001FA673)],
                stops: [0, 0.62],
              ),
            ),
          ),
        ),
        Positioned(
          left: -200,
          top: 120,
          child: Container(
            width: 420,
            height: 420,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: [AppColors.b7, Color(0x000E6A4A)],
                stops: [0, 0.66],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _EnTete extends StatelessWidget {
  const _EnTete({required this.onPasser});
  final VoidCallback onPasser;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const ApsLogo(size: 40),
        const SizedBox(width: 10),
        const Text(
          nomMarque,
          style: TextStyle(
            fontFamily: AppTextStyles.fontSans,
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.3,
          ),
        ),
        const Spacer(),
        GestureDetector(
          onTap: onPasser,
          child: const ApsPill('Passer', tone: ApsTone.white),
        ),
      ],
    );
  }
}
