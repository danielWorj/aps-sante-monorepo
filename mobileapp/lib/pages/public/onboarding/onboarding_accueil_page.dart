import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../components/components.dart';
import '../../../utils/mon_espace_navigation.dart';
import '../publicAcceuil.dart';
import 'onboarding_pro_choix_page.dart';
import 'onboarding_services_page.dart';

/// Écran 01 — Accueil au premier lancement (refonte 2026).
///
/// Point d'entrée de l'app (voir main.dart). Fond vert profond, la
/// promesse en une phrase illustrée par de vrais composants de l'app
/// (carte médecin avec créneaux, paiement Mobile Money, pharmacie de
/// garde), puis deux actions :
///   - « Commencer » -> [OnboardingServicesPage] (parcours de recherche) ;
///   - « J'ai déjà un compte » -> [ouvrirMonEspace] (connexion, puis
///     l'espace du rôle connecté).
/// Les professionnels ont leur entrée dédiée ([OnboardingProChoixPage]),
/// et « Passer » rejoint directement [PublicAcceuilPage].
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
                            builder: (_) => const PublicAcceuilPage()),
                      ),
                    ),
                    const Expanded(child: _Illustration()),
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
                      'Trouvez un médecin disponible, réservez et payez en Mobile Money, en quelques gestes.',
                      style: AppTextStyles.small.copyWith(
                        fontSize: 14,
                        height: 1.55,
                        color: Colors.white.withValues(alpha: 0.72),
                      ),
                    ),
                    const SizedBox(height: 24),
                    ApsButton(
                      label: 'Commencer',
                      trailingIcon: Icons.arrow_forward_rounded,
                      variant: ApsButtonVariant.white,
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => const OnboardingServicesPage(),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    ApsButton(
                      label: "J'ai déjà un compte",
                      variant: ApsButtonVariant.ghostWhite,
                      onPressed: () => ouvrirMonEspace(context),
                    ),
                    const SizedBox(height: 12),
                    Center(
                      child: TextButton.icon(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const OnboardingProChoixPage(),
                          ),
                        ),
                        style: TextButton.styleFrom(
                          foregroundColor: Colors.white.withValues(alpha: 0.8),
                        ),
                        icon: const Icon(Icons.medical_services_outlined, size: 16),
                        label: const Text('Je suis professionnel de santé'),
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
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(Icons.add_rounded, color: Colors.white, size: 22),
        ),
        const SizedBox(width: 8),
        const Text(
          'APS Santé',
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

/// Composants « réels » qui flottent doucement au-dessus du fond.
class _Illustration extends StatefulWidget {
  const _Illustration();

  @override
  State<_Illustration> createState() => _IllustrationState();
}

class _IllustrationState extends State<_Illustration>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 6),
  );

  @override
  void initState() {
    super.initState();
    final reduire = WidgetsBinding
        .instance.platformDispatcher.accessibilityFeatures.disableAnimations;
    if (!reduire) _ctrl.repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  /// Aller-retour doux de 6 px (`@keyframes fl` de la maquette).
  double _dy(double phase) {
    final t = (_ctrl.value + phase) % 1.0;
    return -6 * (0.5 - 0.5 * math.cos(t * 2 * math.pi));
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final h = c.maxHeight;
      if (h < 220) return const SizedBox.shrink();
      return AnimatedBuilder(
        animation: _ctrl,
        builder: (context, _) => Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              left: 0,
              right: 22,
              top: h * 0.08 + _dy(0),
              child: const _CarteMedecin(),
            ),
            Positioned(
              right: 0,
              top: h * 0.52 + _dy(0.33),
              child: const _CartePaiement(),
            ),
            if (h > 300)
              Positioned(
                left: 8,
                top: h * 0.74 + _dy(0.66),
                child: const _CartePharmacie(),
              ),
          ],
        ),
      );
    });
  }
}

class _CarteMedecin extends StatelessWidget {
  const _CarteMedecin();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.45),
            blurRadius: 60,
            offset: const Offset(0, 30),
            spreadRadius: -20,
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              const ApsAvatar(name: 'Arielle Mbarga', size: 40, variant: 1),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Flexible(
                        child: Text('Dr Arielle Mbarga',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTextStyles.strong),
                      ),
                      const SizedBox(width: 4),
                      const ApsVerified(size: 13),
                    ]),
                    Text('Cardiologue · Bonapriso', style: AppTextStyles.xs),
                  ],
                ),
              ),
              const ApsStars(4.9),
            ],
          ),
          const SizedBox(height: 12),
          const ApsSlotGrid(children: [
            ApsSlot('09:00'),
            ApsSlot('10:30', state: ApsSlotState.selected),
            ApsSlot('14:00'),
            ApsSlot('+6', state: ApsSlotState.more),
          ]),
        ],
      ),
    );
  }
}

class _CartePaiement extends StatelessWidget {
  const _CartePaiement();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 210,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: const Color(0xFFFFCC00),
              borderRadius: BorderRadius.circular(11),
            ),
            child: const Text('MoMo',
                style: TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: Colors.black)),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Paiement sécurisé',
                    style: TextStyle(
                        fontFamily: AppTextStyles.fontSans,
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: Colors.white)),
                Text("Fonds protégés jusqu'au RDV",
                    style: TextStyle(
                        fontFamily: AppTextStyles.fontSans,
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: Colors.white.withValues(alpha: 0.7))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CartePharmacie extends StatelessWidget {
  const _CartePharmacie();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 14, 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.45),
            blurRadius: 40,
            offset: const Offset(0, 20),
            spreadRadius: -16,
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const ApsIconTile(Icons.local_pharmacy_outlined, small: true),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Pharmacie de garde',
                  style: AppTextStyles.strong.copyWith(fontSize: 12.5)),
              Text('Ouverte · 600 m', style: AppTextStyles.xs),
            ],
          ),
        ],
      ),
    );
  }
}
