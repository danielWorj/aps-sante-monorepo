import 'package:flutter/material.dart';

import '../../../components/components.dart';
import '../../../utils/mon_espace_navigation.dart';
import '../login.dart';
import 'onboarding_passer.dart';

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
/// Les structures (pharmacie, centre de santé, assurance) se déclarent via
/// [CreatePharmacieScreen], [CreateCentreSanteScreen] et
/// [CreateAssuranceScreen]. Contrairement à `POST /medecins` (publique),
/// ces trois routes exigent une session ouverte : sans session, on passe
/// d'abord par [LoginScreen], puis on reprend automatiquement sur l'écran
/// demandé (voir [ouvrirAvecSession], mon_espace_navigation.dart).
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
        actions: const [OnboardingPasser()],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'PROFESSIONNELS DE SANTÉ',
                style: AppTextStyles.over.copyWith(color: AppColors.b6),
              ),
              const SizedBox(height: 8),
              Text(
                'Comment souhaitez-vous continuer ?',
                style: AppTextStyles.l,
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
                onTap: () => ouvrirDevenirMedecin(context),
              ),
              const SizedBox(height: 14),
              _ProChoiceCard(
                icon: Icons.local_pharmacy_outlined,
                title: 'Déclarer ma pharmacie',
                subtitle: 'Fiche pharmacie — inscription en 5 étapes',
                onTap: () => ouvrirDeclarerPharmacie(context),
              ),
              const SizedBox(height: 14),
              _ProChoiceCard(
                icon: Icons.local_hospital_outlined,
                title: 'Déclarer mon centre de santé',
                subtitle: 'Clinique, hôpital, dispensaire…',
                onTap: () => ouvrirDeclarerCentreSante(context),
              ),
              const SizedBox(height: 14),
              _ProChoiceCard(
                icon: Icons.biotech_outlined,
                title: 'Inscrire mon laboratoire',
                subtitle: "Laboratoire d'analyses — examens et centres de prélèvement",
                onTap: () => ouvrirDeclarerLaboratoire(context),
              ),
              const SizedBox(height: 14),
              _ProChoiceCard(
                icon: Icons.shield_outlined,
                title: 'Déclarer mon assurance',
                subtitle: 'Compagnie ou courtier',
                onTap: () => ouvrirDeclarerAssurance(context),
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
      borderRadius: AppRadius.lgRadius,
      child: InkWell(
        borderRadius: AppRadius.lgRadius,
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
          decoration: BoxDecoration(
            borderRadius: AppRadius.lgRadius,
            boxShadow: AppColors.shadowCard,
            
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.primarySurface,
                  borderRadius: BorderRadius.circular(10),
                ),
                alignment: Alignment.center,
                child: Icon(icon, color: AppColors.primary, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: AppTextStyles.strong.copyWith(fontSize: 15)),
                    const SizedBox(height: 3),
                    Text(subtitle, style: AppTextStyles.body),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.ink4),
            ],
          ),
        ),
      ),
    );
  }
}
