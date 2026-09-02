import 'package:flutter/material.dart';

// Design system fourni (components.zip). Ajustez le chemin d'import selon
// l'emplacement réel du dossier `components/` dans votre projet, par ex. :
//   import 'package:aps/components/components.dart';
// ou, si ce fichier est placé à côté du dossier `components/` :
import '../../components/components.dart';

// Écrans réels du projet, pour que la barre de navigation basse navigue
// vraiment (et pas seulement change l'icône active). Adaptez ces chemins
// si `apropos.dart` n'est pas placé dans le même dossier que ces fichiers.
import 'publicAcceuil.dart';
import 'Medecinpage.dart';
import 'Assurancepage.dart';

/// ============================================================
/// PAGE "À PROPOS" — APS Santé
/// Reprend l'écran "11. À propos" de la maquette HTML, construite
/// avec les composants du design system fourni (AppColors,
/// AppTextStyles, CardSurface, BadgeChip, AppAlert, AppBottomNav...).
/// ============================================================

class AProposPage extends StatefulWidget {
  const AProposPage({super.key});

  @override
  State<AProposPage> createState() => _AProposPageState();
}

class _AProposPageState extends State<AProposPage> {
  // Rubrique "À propos" = index 3 dans AppBottomNav.defaultItems.
  int _navIndex = 3;

  // =========================================================
  // NAVIGATION RÉELLE — mêmes cibles que publicAcceuil.dart, pour que
  // la barre du bas fonctionne aussi depuis l'écran "À propos".
  // =========================================================
  void _onBottomNavTap(int index) {
    if (index == _navIndex) return; // déjà sur cette rubrique

    switch (index) {
      case 0: // Accueil
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const PublicAcceuilPage()),
        );
        break;
      case 1: // Médecin
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const MedecinPage()),
        );
        break;
      case 2: // Assurance
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const AssurancePage()),
        );
        break;
      case 3: // À propos : déjà sur cet écran.
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      extendBody: true,
      appBar: AppBar(
        backgroundColor: AppColors.paper,
        elevation: 0,
        foregroundColor: AppColors.ink,
        title: const Text('À propos', style: AppTextStyles.h3),
      ),
      body: Stack(
        children: [
          ListView(
            // padding bas augmenté pour ne pas passer sous la barre flottante
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 110),
            children: const [
              _HeroSection(),
              SizedBox(height: 18),
              _StatsGrid(),
              SizedBox(height: 18),
              _MissionBanner(),
              _SectionHead(
                icon: Icons.grid_view_rounded,
                title: 'Ce que vous pouvez faire',
              ),
              _FeatureRow(
                icon: Icons.search_rounded,
                title: 'Trouver un médecin vérifié',
                description:
                'Filtrez par spécialité, ville ou disponibilité et '
                    'réservez un créneau en quelques secondes.',
              ),
              _FeatureRow(
                icon: Icons.local_pharmacy_outlined,
                title: 'Localiser une pharmacie de garde',
                description:
                "Fiches vérifiées et statut d'ouverture en temps réel, "
                    'même la nuit et les jours fériés.',
              ),
              _FeatureRow(
                icon: Icons.shield_outlined,
                title: "Consulter l'annuaire des assurances",
                description:
                'Comparez les garanties santé et contactez une agence, '
                    'sans créer de compte.',
              ),
              _FeatureRow(
                icon: Icons.warning_amber_rounded,
                title: "Alerter en cas d'urgence",
                description:
                'Un bouton unique, géolocalisé, relié aux numéros '
                    'officiels — gratuit et sans publicité.',
                isLast: true,
                badgeStyle: BadgeChipStyle.coral,
              ),
              _SectionHead(
                icon: Icons.shield_moon_outlined,
                title: 'Nos engagements',
              ),
              _ValuesCard(),
              _SectionHead(
                icon: Icons.groups_outlined,
                title: 'Qui est derrière APS',
              ),
              _TeamCard(),
              _SectionHead(
                icon: Icons.description_outlined,
                title: 'Informations légales',
              ),
              _LegalLinksCard(),
              SizedBox(height: 12),
              AppAlert(
                type: AppAlertType.secondary,
                message:
                'Mode dégradé hors connexion : les numéros restent '
                    'accessibles même sans réseau.',
              ),
              SizedBox(height: 8),
              _Footer(),
            ],
          ),
          Positioned(
            left: 10,
            right: 10,
            bottom: 10,
            child: AppBottomNav(
              currentIndex: _navIndex,
              onTap: _onBottomNavTap,
              onRdvPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const MedecinPage()),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// ---------------- HERO ----------------

class _HeroSection extends StatelessWidget {
  const _HeroSection();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 60,
          height: 60,
          decoration: BoxDecoration(
            borderRadius: AppRadius.mdRadius,
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.green600, AppColors.green900],
            ),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withOpacity(0.45),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: const Icon(
            Icons.health_and_safety_outlined,
            color: Colors.white,
            size: 28,
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          'APS Santé',
          style: TextStyle(
            fontFamily: AppTextStyles.fontDisplay,
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: AppColors.ink,
            letterSpacing: -0.2,
          ),
        ),
        const SizedBox(height: 8),
        const BadgeChip(
          label: 'Version 2.4.1',
          style: BadgeChipStyle.outline,
          mono: true,
        ),
        const SizedBox(height: 12),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 20),
          child: Text(
            'Trouver un médecin, une pharmacie de garde ou une assurance — '
                'et être aidé en urgence, partout au Cameroun.',
            textAlign: TextAlign.center,
            style: AppTextStyles.body,
          ),
        ),
      ],
    );
  }
}

/// ---------------- STATS ----------------

class _StatsGrid extends StatelessWidget {
  const _StatsGrid();

  static const _stats = [
    ('2 300+', 'médecins vérifiés'),
    ('640', 'pharmacies suivies'),
    ('18', 'villes couvertes'),
    ('120k', 'patients inscrits'),
  ];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (final stat in _stats) ...[
          Expanded(child: _StatCard(number: stat.$1, label: stat.$2)),
          if (stat != _stats.last) const SizedBox(width: 8),
        ],
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.number, required this.label});
  final String number;
  final String label;

  @override
  Widget build(BuildContext context) {
    return CardSurface(
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
      child: Column(
        children: [
          Text(
            number,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            textAlign: TextAlign.center,
            style: AppTextStyles.cardMeta.copyWith(fontSize: 9, height: 1.3),
          ),
        ],
      ),
    );
  }
}

/// ---------------- MISSION ----------------

class _MissionBanner extends StatelessWidget {
  const _MissionBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: AppRadius.mdRadius,
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primary, AppColors.primaryDark],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'NOTRE MISSION',
            style: TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
              color: Colors.white.withOpacity(0.75),
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            "Rendre l'accès aux soins simple et digne de confiance, en "
                'donnant à chaque famille camerounaise les bons contacts au '
                'bon moment.',
            style: TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontSize: 14,
              fontWeight: FontWeight.w600,
              height: 1.5,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

/// ---------------- SECTION HEAD ----------------

class _SectionHead extends StatelessWidget {
  const _SectionHead({required this.icon, required this.title});
  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 22, bottom: 12),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.primaryLight,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 15, color: AppColors.primary),
          ),
          const SizedBox(width: 8),
          Text(title, style: AppTextStyles.cardTitle.copyWith(fontSize: 13.5)),
        ],
      ),
    );
  }
}

/// ---------------- FEATURES ----------------

class _FeatureRow extends StatelessWidget {
  const _FeatureRow({
    required this.icon,
    required this.title,
    required this.description,
    this.isLast = false,
    this.badgeStyle = BadgeChipStyle.green,
  });

  final IconData icon;
  final String title;
  final String description;
  final bool isLast;

  /// Réutilise les couleurs de [BadgeChipStyle] pour teinter l'icône
  /// (green = vert par défaut, coral = urgence).
  final BadgeChipStyle badgeStyle;

  @override
  Widget build(BuildContext context) {
    final bg = badgeStyle == BadgeChipStyle.coral
        ? AppColors.coral100
        : AppColors.primaryLight;
    final fg = badgeStyle == BadgeChipStyle.coral
        ? AppColors.danger
        : AppColors.primary;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : const Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, size: 17, color: fg),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppTextStyles.cardTitle.copyWith(fontSize: 13)),
                const SizedBox(height: 3),
                Text(
                  description,
                  style: AppTextStyles.body.copyWith(fontSize: 11.5, height: 1.55),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// ---------------- VALUES / ENGAGEMENTS ----------------

class _ValuesCard extends StatelessWidget {
  const _ValuesCard();

  static const _values = [
    (
    Icons.check_circle_outline,
    'Professionnels vérifiés',
    "Chaque médecin est contrôlé auprès de l'Ordre national avant "
        "d'apparaître dans l'app.",
    ),
    (
    Icons.info_outline,
    'Zéro publicité en urgence',
    "L'écran d'urgence reste toujours libre de toute publicité, "
        'sans exception.',
    ),
    (
    Icons.lock_outline,
    'Paiement en séquestre',
    "Les fonds d'un rendez-vous sont bloqués et libérés uniquement "
        'après la consultation.',
    ),
    (
    Icons.verified_user_outlined,
    'Données protégées',
    'Vos informations médicales et personnelles ne sont jamais '
        'revendues à des tiers.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return CardSurface(
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          for (final v in _values) ...[
            _ValueRow(icon: v.$1, title: v.$2, description: v.$3),
            if (v != _values.last)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 9),
                child: Divider(height: 1, color: AppColors.line),
              ),
          ],
        ],
      ),
    );
  }
}

class _ValueRow extends StatelessWidget {
  const _ValueRow({
    required this.icon,
    required this.title,
    required this.description,
  });
  final IconData icon;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 22,
          height: 22,
          margin: const EdgeInsets.only(top: 1),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.primarySurface,
            borderRadius: BorderRadius.circular(7),
          ),
          child: Icon(icon, size: 12, color: AppColors.primary),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: AppTextStyles.cardTitle.copyWith(fontSize: 12)),
              const SizedBox(height: 2),
              Text(
                description,
                style: AppTextStyles.body.copyWith(fontSize: 11, height: 1.5),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// ---------------- TEAM ----------------

class _TeamCard extends StatelessWidget {
  const _TeamCard();

  @override
  Widget build(BuildContext context) {
    return CardSurface(
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.all(13),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.warningLight,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.flag_outlined,
              size: 18,
              color: AppColors.warning,
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: AppTextStyles.body.copyWith(fontSize: 11, height: 1.5),
                children: const [
                  TextSpan(
                    text: 'Une équipe basée à Yaoundé',
                    style: TextStyle(
                      color: AppColors.ink,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  TextSpan(
                    text:
                    ', en lien direct avec des médecins, pharmaciens '
                        'et assureurs locaux, pour une information '
                        'toujours à jour.',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// ---------------- LEGAL LINKS ----------------

class _LegalLinksCard extends StatelessWidget {
  const _LegalLinksCard();

  static const _links = [
    (Icons.description_outlined, "Conditions d'utilisation"),
    (Icons.privacy_tip_outlined, 'Politique de confidentialité'),
    (Icons.chat_bubble_outline, 'Nous contacter'),
  ];

  @override
  Widget build(BuildContext context) {
    return CardSurface(
      margin: EdgeInsets.zero,
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (final link in _links)
            _LegalLinkRow(
              icon: link.$1,
              label: link.$2,
              isLast: link == _links.last,
              onTap: () {
                // TODO: naviguer vers l'écran correspondant.
              },
            ),
        ],
      ),
    );
  }
}

class _LegalLinkRow extends StatelessWidget {
  const _LegalLinkRow({
    required this.icon,
    required this.label,
    required this.isLast,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final bool isLast;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: isLast ? AppRadius.mdRadius : BorderRadius.zero,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        decoration: BoxDecoration(
          border: isLast
              ? null
              : const Border(bottom: BorderSide(color: AppColors.line)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 16, color: AppColors.inkSoft),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: AppTextStyles.cardTitle.copyWith(fontSize: 12),
              ),
            ),
            const Icon(
              Icons.chevron_right_rounded,
              size: 16,
              color: AppColors.inkFaint,
            ),
          ],
        ),
      ),
    );
  }
}

/// ---------------- FOOTER ----------------

class _Footer extends StatelessWidget {
  const _Footer();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Center(
        child: RichText(
          textAlign: TextAlign.center,
          text: const TextSpan(
            style: TextStyle(fontSize: 10, color: AppColors.inkFaint, height: 1.6),
            children: [
              TextSpan(text: 'Conçu '),
              WidgetSpan(
                alignment: PlaceholderAlignment.middle,
                child: Icon(Icons.favorite, size: 11, color: AppColors.danger),
              ),
              TextSpan(text: ' au Cameroun · © 2026 APS Santé'),
            ],
          ),
        ),
      ),
    );
  }
}