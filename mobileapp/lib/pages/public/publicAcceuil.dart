import 'package:flutter/material.dart';

// Adaptez ce chemin d'import selon l'emplacement réel du dossier
// `components/` dans votre projet (ex: 'package:aps/components/components.dart').
import '../../components/components.dart';

/// Écran d'accueil public de l'application APS Santé.
///
/// Reproduit fidèlement l'écran « 1. Accueil » de la maquette `ui-mobile.html` :
/// - bandeau de bienvenue (hero) avec salutation + localisation,
/// - champ de recherche (lecture seule, ouvre l'écran de recherche),
/// - raccourcis rapides (Médecins, Pharmacie, Structures, Urgence),
/// - carrousel horizontal de publicités/actualités partenaires,
/// - section « Pharmacies de garde »,
/// - barre de navigation basse flottante avec bouton « Rendez-vous ».
///
/// Cette page ne contient aucune logique réseau : les données (pharmacies,
/// publicités, nom de l'utilisateur...) sont injectables via le constructeur,
/// et toutes les actions sont exposées sous forme de callbacks à brancher
/// depuis la couche de navigation/données de l'application (ex: `go_router`,
/// providers, etc.).
class PublicAcceuilPage extends StatefulWidget {
  const PublicAcceuilPage({
    super.key,
    this.prenomUtilisateur = 'Fabrice',
    this.localisation = 'Douala, Cameroun',
    this.ads = const [],
    this.pharmaciesDeGarde = const [],
    this.onSearchTap,
    this.onMedecinsTap,
    this.onPharmaciesTap,
    this.onStructuresTap,
    this.onUrgenceTap,
    this.onVoirToutesPharmacies,
    this.onAdTap,
    this.onBottomNavTap,
    this.onRdvPressed,
  });

  /// Prénom affiché dans le message de bienvenue (« Bonjour, {prénom} »).
  final String prenomUtilisateur;

  /// Ville / pays affiché sous la salutation.
  final String localisation;

  /// Publicités / actualités partenaires du carrousel. Si vide, une liste
  /// de démonstration est utilisée pour ne jamais afficher un écran vide.
  final List<HomeAdItem> ads;

  /// Pharmacies de garde à afficher sous le carrousel. Si vide, une entrée
  /// de démonstration est utilisée.
  final List<HomePharmacieItem> pharmaciesDeGarde;

  /// Tap sur le champ de recherche → ouvrir l'écran de recherche globale.
  final VoidCallback? onSearchTap;

  /// Tap sur le raccourci « Médecins ».
  final VoidCallback? onMedecinsTap;

  /// Tap sur le raccourci « Pharmacie ».
  final VoidCallback? onPharmaciesTap;

  /// Tap sur le raccourci « Structures ».
  final VoidCallback? onStructuresTap;

  /// Tap sur le raccourci « Urgence ».
  final VoidCallback? onUrgenceTap;

  /// Tap sur « Voir tout » (section Pharmacies de garde).
  final VoidCallback? onVoirToutesPharmacies;

  /// Tap sur une carte de publicité du carrousel.
  final ValueChanged<HomeAdItem>? onAdTap;

  /// Tap sur une rubrique de la barre de navigation basse (0 à 3).
  final ValueChanged<int>? onBottomNavTap;

  /// Tap sur le bouton flottant central « Rendez-vous ».
  final VoidCallback? onRdvPressed;

  @override
  State<PublicAcceuilPage> createState() => _PublicAcceuilPageState();
}

class _PublicAcceuilPageState extends State<PublicAcceuilPage> {
  final PageController _adController = PageController(viewportFraction: 0.78);
  int _adIndex = 0;
  int _navIndex = 0;

  late final List<HomeAdItem> _ads =
      widget.ads.isNotEmpty ? widget.ads : _demoAds;
  late final List<HomePharmacieItem> _pharmacies =
      widget.pharmaciesDeGarde.isNotEmpty ? widget.pharmaciesDeGarde : _demoPharmacies;

  @override
  void dispose() {
    _adController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      extendBody: true,
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            _buildContent(context),
            Positioned(
              left: 10,
              right: 10,
              bottom: 10,
              child: AppBottomNav(
                currentIndex: _navIndex,
                onTap: (i) {
                  setState(() => _navIndex = i);
                  widget.onBottomNavTap?.call(i);
                },
                onRdvPressed: widget.onRdvPressed ?? () {},
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    return ListView(
      // Padding bas généreux pour ne pas passer sous la barre flottante.
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 110),
      children: [
        _HomeHero(prenom: widget.prenomUtilisateur, localisation: widget.localisation),
        const SizedBox(height: 6),
        _SearchField(onTap: widget.onSearchTap),
        const SizedBox(height: 8),
        _QuickActionsGrid(
          onMedecinsTap: widget.onMedecinsTap,
          onPharmaciesTap: widget.onPharmaciesTap,
          onStructuresTap: widget.onStructuresTap,
          onUrgenceTap: widget.onUrgenceTap,
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            const Text('Offres & actualités partenaires', style: AppTextStyles.cardTitle),
            Text(
              '${_ads.length} · Publicité',
              style: AppTextStyles.cardMeta.copyWith(fontSize: 10.5),
            ),
          ],
        ),
        const SizedBox(height: 10),
        _PartnerAdsCarousel(
          controller: _adController,
          ads: _ads,
          onPageChanged: (i) => setState(() => _adIndex = i),
          onAdTap: widget.onAdTap,
        ),
        const SizedBox(height: 10),
        _CarouselDots(count: _ads.length, activeIndex: _adIndex),
        const SizedBox(height: 4),
        const _SwipeHint(),
        const SizedBox(height: 8),
        _SectionTitle(
          title: 'Pharmacies de garde',
          onVoirTout: widget.onVoirToutesPharmacies,
        ),
        for (final pharmacie in _pharmacies)
          CardPharmacie(
            nom: pharmacie.nom,
            quartier: pharmacie.quartier,
            deGarde: pharmacie.deGarde,
            verifiee: pharmacie.verifiee,
            numeroOrdre: pharmacie.numeroOrdre,
            distanceKm: pharmacie.distanceKm,
            onAppeler: pharmacie.onAppeler ?? () {},
            onItineraire: pharmacie.onItineraire ?? () {},
          ),
      ],
    );
  }
}

// ===========================================================
// MODÈLES DE DONNÉES
// ===========================================================

/// Une publicité / actualité partenaire du carrousel de l'accueil.
class HomeAdItem {
  const HomeAdItem({
    required this.titre,
    required this.description,
    this.imageUrl,
    this.couleurFond = AppColors.green100,
    this.couleurIcone = AppColors.green700,
    this.icone = Icons.campaign_outlined,
  });

  final String titre;
  final String description;

  /// URL de l'image réelle de la campagne (facultative). En son absence,
  /// une vignette colorée avec icône est affichée à la place.
  final String? imageUrl;
  final Color couleurFond;
  final Color couleurIcone;
  final IconData icone;
}

/// Une entrée « pharmacie de garde » affichée sur l'accueil.
class HomePharmacieItem {
  const HomePharmacieItem({
    required this.nom,
    required this.quartier,
    this.deGarde = true,
    this.verifiee = true,
    this.numeroOrdre,
    this.distanceKm,
    this.onAppeler,
    this.onItineraire,
  });

  final String nom;
  final String quartier;
  final bool deGarde;
  final bool verifiee;
  final String? numeroOrdre;
  final double? distanceKm;
  final VoidCallback? onAppeler;
  final VoidCallback? onItineraire;
}

const List<HomeAdItem> _demoAds = [
  HomeAdItem(
    titre: 'Tourisme médical',
    description: "Soins à l'étranger, voyage inclus.",
    couleurFond: AppColors.green100,
    couleurIcone: AppColors.green700,
    icone: Icons.flight_takeoff_outlined,
  ),
  HomeAdItem(
    titre: 'AXA Assurances',
    description: 'Professionnalisme, proximité, expertise.',
    couleurFond: Color(0xFFEDF1FB),
    couleurIcone: Color(0xFF0B2C9E),
    icone: Icons.shield_outlined,
  ),
  HomeAdItem(
    titre: 'Journée des infirmières',
    description: '12 mai — Croix-Rouge du Wouri.',
    couleurFond: AppColors.coral100,
    couleurIcone: AppColors.coral500,
    icone: Icons.favorite_outline,
  ),
  HomeAdItem(
    titre: 'Nourishka Greenlife',
    description: 'Le collagène peau, cheveux, articulations.',
    couleurFond: AppColors.amber100,
    couleurIcone: AppColors.amber500,
    icone: Icons.eco_outlined,
  ),
  HomeAdItem(
    titre: 'MTN — Bonus imbattables',
    description: "Plus de data, plus d'appels dès 237 FCFA.",
    couleurFond: Color(0xFFFDF0E0),
    couleurIcone: Color(0xFFC97A0E),
    icone: Icons.sim_card_outlined,
  ),
];

const List<HomePharmacieItem> _demoPharmacies = [
  HomePharmacieItem(
    nom: 'Pharmacie Soleil',
    quartier: 'Akwa Nord',
    deGarde: true,
    verifiee: true,
    numeroOrdre: 'RCM-002E',
    distanceKm: 1.2,
  ),
];

// ===========================================================
// WIDGETS PRIVÉS
// ===========================================================

/// Bandeau de bienvenue — `.home-hero` (dégradé vert).
class _HomeHero extends StatelessWidget {
  const _HomeHero({required this.prenom, required this.localisation});

  final String prenom;
  final String localisation;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.green700, AppColors.green900],
        ),
        borderRadius: AppRadius.mdRadius,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Bonjour, $prenom 👋',
            style: const TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontWeight: FontWeight.w700,
              fontSize: 15,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            '$localisation · que recherchez-vous aujourd\'hui ?',
            style: const TextStyle(
              fontFamily: AppTextStyles.fontBody,
              fontSize: 11.5,
              color: Color(0xC7FFFFFF),
            ),
          ),
        ],
      ),
    );
  }
}

/// Champ de recherche en lecture seule — `.search-field`.
class _SearchField extends StatelessWidget {
  const _SearchField({this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: AppRadius.smRadius,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.card,
          border: Border.all(color: AppColors.line),
          borderRadius: AppRadius.smRadius,
        ),
        child: Row(
          children: [
            const Icon(Icons.search, size: 18, color: AppColors.inkFaint),
            const SizedBox(width: 10),
            Text(
              'Médecin, pharmacie, structure…',
              style: AppTextStyles.body.copyWith(fontSize: 13, color: AppColors.inkSoft),
            ),
          ],
        ),
      ),
    );
  }
}

/// Grille de raccourcis rapides — `.quick-grid` / `.quick-tile`.
class _QuickActionsGrid extends StatelessWidget {
  const _QuickActionsGrid({
    this.onMedecinsTap,
    this.onPharmaciesTap,
    this.onStructuresTap,
    this.onUrgenceTap,
  });

  final VoidCallback? onMedecinsTap;
  final VoidCallback? onPharmaciesTap;
  final VoidCallback? onStructuresTap;
  final VoidCallback? onUrgenceTap;

  @override
  Widget build(BuildContext context) {
    final tiles = [
      _QuickTile(
        icon: Icons.medical_services_outlined,
        label: 'Médecins',
        onTap: onMedecinsTap,
      ),
      _QuickTile(
        icon: Icons.medication_outlined,
        label: 'Pharmacie',
        onTap: onPharmaciesTap,
      ),
      _QuickTile(
        icon: Icons.local_hospital_outlined,
        label: 'Structures',
        onTap: onStructuresTap,
      ),
      _QuickTile(
        icon: Icons.call,
        label: 'Urgence',
        coral: true,
        onTap: onUrgenceTap,
      ),
    ];

    return Padding(
      padding: const EdgeInsets.only(bottom: 20, top: 2),
      child: Row(
        children: [
          for (final tile in tiles) ...[
            Expanded(child: tile),
            if (tile != tiles.last) const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _QuickTile extends StatelessWidget {
  const _QuickTile({
    required this.icon,
    required this.label,
    this.coral = false,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final bool coral;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final bg = coral ? AppColors.coral100 : AppColors.green100;
    final fg = coral ? AppColors.coral500 : AppColors.green700;

    return InkWell(
      onTap: onTap,
      borderRadius: AppRadius.smRadius,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        decoration: BoxDecoration(
          color: AppColors.card,
          border: Border.all(color: AppColors.line),
          borderRadius: AppRadius.smRadius,
          boxShadow: AppColors.shadowCard,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
              alignment: Alignment.center,
              child: Icon(icon, size: 17, color: fg),
            ),
            const SizedBox(height: 6),
            Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontFamily: AppTextStyles.fontDisplay,
                fontSize: 9.5,
                fontWeight: FontWeight.w600,
                color: AppColors.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Carrousel horizontal de publicités / actualités partenaires — `.ad-carousel`.
class _PartnerAdsCarousel extends StatelessWidget {
  const _PartnerAdsCarousel({
    required this.controller,
    required this.ads,
    required this.onPageChanged,
    this.onAdTap,
  });

  final PageController controller;
  final List<HomeAdItem> ads;
  final ValueChanged<int> onPageChanged;
  final ValueChanged<HomeAdItem>? onAdTap;

  @override
  Widget build(BuildContext context) {
    if (ads.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 190,
      child: PageView.builder(
        controller: controller,
        onPageChanged: onPageChanged,
        padEnds: false,
        itemCount: ads.length,
        itemBuilder: (context, index) {
          final ad = ads[index];
          return Padding(
            padding: const EdgeInsets.only(right: 12),
            child: _AdSlide(ad: ad, onTap: onAdTap == null ? null : () => onAdTap!(ad)),
          );
        },
      ),
    );
  }
}

class _AdSlide extends StatelessWidget {
  const _AdSlide({required this.ad, this.onTap});

  final HomeAdItem ad;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: AppRadius.mdRadius,
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.card,
          border: Border.all(color: AppColors.line),
          borderRadius: AppRadius.mdRadius,
          boxShadow: AppColors.shadowCard,
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.info_outline, size: 11, color: AppColors.inkFaint),
                  const SizedBox(width: 5),
                  Text(
                    'PUBLICITÉ',
                    style: TextStyle(
                      fontFamily: AppTextStyles.fontDisplay,
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.1,
                      color: AppColors.inkFaint,
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  height: 88,
                  width: double.infinity,
                  child: ad.imageUrl != null
                      ? Image.network(
                          ad.imageUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => _AdPlaceholder(ad: ad),
                        )
                      : _AdPlaceholder(ad: ad),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    ad.titre,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTextStyles.cardTitle.copyWith(fontSize: 12),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    ad.description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTextStyles.body.copyWith(fontSize: 10, height: 1.45),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AdPlaceholder extends StatelessWidget {
  const _AdPlaceholder({required this.ad});

  final HomeAdItem ad;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: ad.couleurFond,
      alignment: Alignment.center,
      child: Icon(ad.icone, size: 30, color: ad.couleurIcone),
    );
  }
}

/// Puces de pagination du carrousel — `.carousel-dots`.
class _CarouselDots extends StatelessWidget {
  const _CarouselDots({required this.count, required this.activeIndex});

  final int count;
  final int activeIndex;

  @override
  Widget build(BuildContext context) {
    if (count <= 1) return const SizedBox.shrink();
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++) ...[
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            width: i == activeIndex ? 14 : 5,
            height: 5,
            decoration: BoxDecoration(
              color: i == activeIndex ? AppColors.green600 : AppColors.lineStrong,
              borderRadius: BorderRadius.circular(100),
            ),
          ),
          if (i != count - 1) const SizedBox(width: 5),
        ],
      ],
    );
  }
}

/// Indice de glissement sous le carrousel — `.swipe-hint`.
class _SwipeHint extends StatelessWidget {
  const _SwipeHint();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.arrow_forward, size: 12, color: AppColors.inkFaint),
        const SizedBox(width: 5),
        Text(
          "Glissez vers la gauche pour voir plus d'offres",
          style: AppTextStyles.cardMeta.copyWith(fontSize: 9.5, color: AppColors.inkFaint),
        ),
      ],
    );
  }
}

/// En-tête de section avec lien « Voir tout » — `.section-title`.
class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, this.onVoirTout});

  final String title;
  final VoidCallback? onVoirTout;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12, top: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: AppTextStyles.cardTitle.copyWith(fontSize: 14)),
          if (onVoirTout != null)
            GestureDetector(
              onTap: onVoirTout,
              child: Text(
                'Voir tout',
                style: TextStyle(
                  fontFamily: AppTextStyles.fontDisplay,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.green700,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
