import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

// Adaptez ces chemins selon l'emplacement réel des fichiers dans votre
// projet (ex: 'package:aps/components/components.dart',
// 'package:aps/screens/Medecinpage.dart', etc.). Les 4 écrans ci-dessous
// sont ceux fournis dans le projet (Médecins, Pharmacie, Structures,
// Assurances) et sont ici branchés sur de VRAIES navigations
// (`Navigator.push`), pas de simples callbacks vides.
import '../../components/components.dart';
import '../../controllers/publicite_controller.dart';
import '../../models/publicite_models.dart' show Publicite;
import 'Medecinpage.dart';
import 'Pharmaciepage.dart';
import 'Centresantepage.dart';
import 'Assurancepage.dart';

/// Écran d'accueil public de l'application APS Santé.
///
/// Reproduit fidèlement l'écran « 1. Accueil » de la maquette `ui-mobile.html` :
/// - bandeau de bienvenue (hero) avec salutation + localisation,
/// - champ de recherche (ouvre un choix rapide Médecins / Pharmacie / Structures),
/// - raccourcis rapides (Médecins, Pharmacie, Structures, Urgence),
/// - carrousel horizontal de publicités/actualités partenaires,
/// - section « Pharmacies de garde »,
/// - barre de navigation basse flottante avec bouton « Rendez-vous ».
///
/// Contrairement à la version de démonstration initiale, cet écran ne se
/// contente plus de callbacks vides : il pousse directement les vrais
/// écrans du projet via `Navigator.push` :
/// - « Médecins »   -> [MedecinPage]      (Medecinpage.dart)
/// - « Pharmacie »  -> [PharmaciePage]    (Pharmaciepage.dart)
/// - « Structures » -> [CentreSantePage]  (Centresantepage.dart)
/// - rubrique basse « Assurance »  -> [AssurancePage] (Assurancepage.dart)
/// - « Urgence »    -> feuille modale avec les vrais numéros officiels
///   (SAMU 1515, Police secours 117), appelés en direct via `url_launcher`
///   (`tel:`). Aucune page `UrgencePage.dart` dédiée n'a été fournie dans
///   le projet : dès qu'elle existera, remplacez `_ouvrirUrgence` par un
///   `Navigator.push(context, MaterialPageRoute(builder: (_) => const UrgencePage()))`.
///
/// Chaque action reste malgré tout surchargeable depuis l'extérieur via les
/// callbacks du constructeur (`onMedecinsTap`, `onPharmaciesTap`, ...) : si
/// vous fournissez un callback, il est utilisé à la place de la navigation
/// par défaut (utile pour brancher `go_router`, un routing nommé, etc.).
class PublicAcceuilPage extends ConsumerStatefulWidget {
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

  /// Publicités / actualités partenaires du carrousel.
  ///
  /// Par défaut (liste vide, cas normal), l'écran charge lui-même
  /// TOUTES les publicités depuis l'API via
  /// [listePublicitesControllerProvider] (module « Présence, publicité
  /// & boost commercial », voir publicite_controller.dart) — sans
  /// filtre d'emplacement ni de période de diffusion, l'API publique
  /// ne renvoyant déjà que les publicités "validee". Ne renseignez ce
  /// paramètre que pour forcer un contenu précis (ex : prévisualisation
  /// admin, tests) — il prend alors le pas sur l'API. Si l'API ne
  /// renvoie encore rien (chargement, erreur réseau, aucune publicité
  /// en base pour le moment), une liste de démonstration est utilisée
  /// pour ne jamais afficher un écran vide.
  final List<HomeAdItem> ads;

  /// Pharmacies de garde à afficher sous le carrousel. Si vide, une entrée
  /// de démonstration est utilisée.
  final List<HomePharmacieItem> pharmaciesDeGarde;

  /// Tap sur le champ de recherche. Par défaut, ouvre une feuille de choix
  /// rapide (Médecins / Pharmacie / Structures) qui pousse le vrai écran
  /// correspondant.
  final VoidCallback? onSearchTap;

  /// Tap sur le raccourci « Médecins ». Par défaut : `Navigator.push` vers
  /// [MedecinPage].
  final VoidCallback? onMedecinsTap;

  /// Tap sur le raccourci « Pharmacie ». Par défaut : `Navigator.push` vers
  /// [PharmaciePage].
  final VoidCallback? onPharmaciesTap;

  /// Tap sur le raccourci « Structures ». Par défaut : `Navigator.push` vers
  /// [CentreSantePage].
  final VoidCallback? onStructuresTap;

  /// Tap sur le raccourci « Urgence ». Par défaut : ouvre la feuille des
  /// numéros officiels (SAMU / Police), avec appel réel via `tel:`.
  final VoidCallback? onUrgenceTap;

  /// Tap sur « Voir tout » (section Pharmacies de garde). Par défaut :
  /// `Navigator.push` vers [PharmaciePage].
  final VoidCallback? onVoirToutesPharmacies;

  /// Tap sur une carte de publicité du carrousel.
  final ValueChanged<HomeAdItem>? onAdTap;

  /// Tap sur une rubrique de la barre de navigation basse (0 à 3).
  /// Par défaut : 0=Accueil (reste sur place), 1=Médecin -> [MedecinPage],
  /// 2=Assurance -> [AssurancePage], 3=À propos -> aucun écran fourni pour
  /// l'instant (un message le signale).
  final ValueChanged<int>? onBottomNavTap;

  /// Tap sur le bouton flottant central « Rendez-vous ». Par défaut, ouvre
  /// [MedecinPage] : c'est cet écran qui, une fois un médecin choisi,
  /// pousse lui-même l'écran de prise de rendez-vous (voir la docstring de
  /// `MedecinPage`).
  final VoidCallback? onRdvPressed;

  @override
  ConsumerState<PublicAcceuilPage> createState() => _PublicAcceuilPageState();
}

class _PublicAcceuilPageState extends ConsumerState<PublicAcceuilPage> {
  final PageController _adController = PageController(viewportFraction: 0.78);
  int _adIndex = 0;
  int _navIndex = 0;

  late final List<HomePharmacieItem> _pharmacies =
  widget.pharmaciesDeGarde.isNotEmpty ? widget.pharmaciesDeGarde : _demoPharmacies;

  /// Résout la liste des publicités à afficher dans le carrousel :
  /// - si `widget.ads` a été fourni explicitement, il est prioritaire ;
  /// - sinon, on affiche TOUTES les publicités renvoyées par l'API
  ///   ([listePublicitesControllerProvider]), sans filtre d'emplacement
  ///   ni de fenêtre de diffusion — l'API publique ne renvoie déjà que
  ///   les publicités "validee" (voir publicite_repository.dart) ;
  /// - si l'API n'a encore rien à montrer (chargement, erreur, aucune
  ///   publicité en base), on retombe sur la liste de démonstration
  ///   pour ne jamais afficher un carrousel vide.
  List<HomeAdItem> _resoudreAds() {
    if (widget.ads.isNotEmpty) return widget.ads;

    final publicites = ref
        .watch(listePublicitesControllerProvider)
        .maybeWhen(
      data: (data) => data,
      orElse: () => const <Publicite>[],
    );

    // Demande explicite : TOUTES les publicités renvoyées par l'API
    // doivent apparaître, sans filtre d'emplacement ni de fenêtre de
    // diffusion (l'API publique filtre déjà sur "validee" côté
    // backend — voir publicite_repository.dart). On ne retombe sur la
    // liste de démonstration que si l'API n'a encore rien à montrer
    // (chargement initial, erreur réseau, aucune publicité en base).
    if (publicites.isEmpty) return _demoAds;
    return publicites.map(_adDepuisPublicite).toList();
  }

  /// Convertit une [Publicite] de l'API en [HomeAdItem] pour le carrousel.
  /// `visuelUrl` (posé par le backend, Cloudinary) alimente directement
  /// l'image réelle ; la description affichée reprend la période de
  /// diffusion, seule information textuelle secondaire portée par le
  /// modèle `Publicite` (pas de champ "description" côté API).
  HomeAdItem _adDepuisPublicite(Publicite p) {
    return HomeAdItem(
      titre: p.titre,
      description: 'Offre valable jusqu\'au ${_formaterDateCourte(p.dateFin)}',
      imageUrl: p.visuelUrl,
    );
  }

  String _formaterDateCourte(DateTime d) {
    final jj = d.day.toString().padLeft(2, '0');
    final mm = d.month.toString().padLeft(2, '0');
    return '$jj/$mm/${d.year}';
  }

  @override
  void dispose() {
    _adController.dispose();
    super.dispose();
  }

  // =========================================================
  // NAVIGATION RÉELLE — écrans du projet
  // =========================================================

  void _ouvrirMedecins() {
    Navigator.push(context, MaterialPageRoute(builder: (_) => const MedecinPage()));
  }

  void _ouvrirPharmacies() {
    Navigator.push(context, MaterialPageRoute(builder: (_) => const PharmaciePage()));
  }

  void _ouvrirStructures() {
    Navigator.push(context, MaterialPageRoute(builder: (_) => const CentreSantePage()));
  }

  void _ouvrirAssurances() {
    Navigator.push(context, MaterialPageRoute(builder: (_) => const AssurancePage()));
  }

  /// Feuille de choix rapide ouverte depuis le champ de recherche : la
  /// maquette ne propose pas d'écran de recherche globale dédié, donc on
  /// oriente directement vers l'un des 3 vrais annuaires.
  void _ouvrirRecherche() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 14),
                    decoration: BoxDecoration(
                      color: AppColors.lineStrong,
                      borderRadius: BorderRadius.circular(100),
                    ),
                  ),
                ),
                const Text('Que recherchez-vous ?', style: AppTextStyles.cardTitle),
                const SizedBox(height: 12),
                _SearchChoiceTile(
                  icon: Icons.medical_services_outlined,
                  label: 'Un médecin',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _ouvrirMedecins();
                  },
                ),
                _SearchChoiceTile(
                  icon: Icons.medication_outlined,
                  label: 'Une pharmacie',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _ouvrirPharmacies();
                  },
                ),
                _SearchChoiceTile(
                  icon: Icons.local_hospital_outlined,
                  label: 'Une structure de santé',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _ouvrirStructures();
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  /// Ouvre la feuille « Urgence » avec les vrais numéros officiels du
  /// Cameroun (SAMU, Police secours) + la pharmacie de garde la plus
  /// proche, chacun avec un bouton d'appel réel (`tel:` via `url_launcher`).
  /// Conforme à l'écran 6 de la maquette (§12 : aucun contenu commercial).
  void _ouvrirUrgence() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => _UrgenceSheet(
        pharmacieDeGarde: _pharmacies.isNotEmpty ? _pharmacies.first : null,
        onAppelerPharmacie: _appelerPharmacie,
      ),
    );
  }

  /// Compose un numéro d'urgence officiel (SAMU: 1515, Police: 117...).
  Future<void> _appelerNumero(String numero) async {
    final uri = Uri(scheme: 'tel', path: numero);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else if (mounted) {
      _showSnack("Impossible de lancer l'appel.");
    }
  }

  /// Appelle une pharmacie de la liste « Pharmacies de garde », si un
  /// numéro réel est renseigné sur l'item.
  Future<void> _appelerPharmacie(HomePharmacieItem p) async {
    final numero = p.telephone?.trim();
    if (numero == null || numero.isEmpty) {
      _showSnack('Numéro non disponible pour cette pharmacie.');
      return;
    }
    await _appelerNumero(numero);
  }

  /// Ouvre l'itinéraire Google Maps réel vers une pharmacie de la liste :
  /// coordonnées GPS si connues, sinon recherche par nom + quartier.
  Future<void> _itinerairePharmacie(HomePharmacieItem p) async {
    final Uri uri;
    if (p.latitude != null && p.longitude != null) {
      uri = Uri.parse(
        'https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}',
      );
    } else {
      final query = Uri.encodeComponent('${p.nom}, ${p.quartier}');
      uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$query');
    }
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else if (mounted) {
      _showSnack("Impossible d'ouvrir l'itinéraire.");
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  void _onBottomNavTap(int index) {
    setState(() => _navIndex = index);
    if (widget.onBottomNavTap != null) {
      widget.onBottomNavTap!(index);
      return;
    }
    switch (index) {
      case 0: // Accueil : déjà sur cet écran.
        break;
      case 1: // Médecin
        _ouvrirMedecins();
        break;
      case 2: // Assurance
        _ouvrirAssurances();
        break;
      case 3: // À propos — aucun écran fourni pour l'instant.
        _showSnack('Écran « À propos » bientôt disponible.');
        break;
    }
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
                onTap: _onBottomNavTap,
                onRdvPressed: widget.onRdvPressed ?? _ouvrirMedecins,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    // Recalculé à chaque build : `ref.watch` dans `_resoudreAds()` fait que
    // ce widget se reconstruit automatiquement dès que l'API renvoie les
    // publicités (fin de chargement, rafraîchissement, invalidation...).
    final ads = _resoudreAds();

    return RefreshIndicator(
      color: AppColors.green700,
      onRefresh: () async {
        // Ne rafraîchit l'appel API que si on affiche bien les vraies
        // publicités (pas une liste `ads` imposée explicitement au widget).
        if (widget.ads.isEmpty) {
          await Future.wait([
            ref
                .read(listePublicitesControllerProvider.notifier)
                .rafraichir(),
            ref
                .read(listeEmplacementsPublicitairesControllerProvider.notifier)
                .rafraichir(),
          ]);
        }
      },
      child: ListView(
        // Padding bas généreux pour ne pas passer sous la barre flottante.
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 110),
        children: [
          _HomeHero(prenom: widget.prenomUtilisateur, localisation: widget.localisation),
          const SizedBox(height: 6),
          _SearchField(onTap: widget.onSearchTap ?? _ouvrirRecherche),
          const SizedBox(height: 8),
          _QuickActionsGrid(
            onMedecinsTap: widget.onMedecinsTap ?? _ouvrirMedecins,
            onPharmaciesTap: widget.onPharmaciesTap ?? _ouvrirPharmacies,
            onStructuresTap: widget.onStructuresTap ?? _ouvrirStructures,
            onUrgenceTap: widget.onUrgenceTap ?? _ouvrirUrgence,
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              const Text('Offres & actualités partenaires', style: AppTextStyles.cardTitle),
              Text(
                '${ads.length} · Publicité',
                style: AppTextStyles.cardMeta.copyWith(fontSize: 10.5),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _PartnerAdsCarousel(
            controller: _adController,
            ads: ads,
            onPageChanged: (i) => setState(() => _adIndex = i),
            onAdTap: widget.onAdTap,
          ),
          const SizedBox(height: 10),
          _CarouselDots(count: ads.length, activeIndex: _adIndex),
          const SizedBox(height: 4),
          const _SwipeHint(),
          const SizedBox(height: 8),
          _SectionTitle(
            title: 'Pharmacies de garde',
            onVoirTout: widget.onVoirToutesPharmacies ?? _ouvrirPharmacies,
          ),
          for (final pharmacie in _pharmacies)
            CardPharmacie(
              nom: pharmacie.nom,
              quartier: pharmacie.quartier,
              deGarde: pharmacie.deGarde,
              verifiee: pharmacie.verifiee,
              numeroOrdre: pharmacie.numeroOrdre,
              distanceKm: pharmacie.distanceKm,
              onAppeler: pharmacie.onAppeler ?? () => _appelerPharmacie(pharmacie),
              onItineraire: pharmacie.onItineraire ?? () => _itinerairePharmacie(pharmacie),
            ),
        ],
      ),
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
    this.telephone,
    this.latitude,
    this.longitude,
    this.onAppeler,
    this.onItineraire,
  });

  final String nom;
  final String quartier;
  final bool deGarde;
  final bool verifiee;
  final String? numeroOrdre;
  final double? distanceKm;

  /// Numéro réel de la pharmacie (format `tel:`, ex: `+237679001122`).
  /// Utilisé par l'action « Appeler » par défaut si `onAppeler` n'est pas
  /// fourni.
  final String? telephone;

  /// Coordonnées GPS réelles, utilisées par l'action « Itinéraire » par
  /// défaut (sinon recherche Google Maps par nom + quartier).
  final double? latitude;
  final double? longitude;

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
    telephone: '+237679001122',
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

/// Champ de recherche — `.search-field`. Ouvre par défaut la feuille de
/// choix rapide (voir `_ouvrirRecherche` sur l'écran parent).
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

/// Une ligne de choix dans la feuille de recherche rapide.
class _SearchChoiceTile extends StatelessWidget {
  const _SearchChoiceTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.green100,
                borderRadius: BorderRadius.circular(10),
              ),
              alignment: Alignment.center,
              child: Icon(icon, size: 18, color: AppColors.green700),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(label, style: AppTextStyles.body.copyWith(fontSize: 13.5)),
            ),
            const Icon(Icons.chevron_right, size: 18, color: AppColors.inkFaint),
          ],
        ),
      ),
    );
  }
}

/// Feuille modale « Urgence » — numéros officiels réels (Cameroun) +
/// pharmacie de garde la plus proche, chacun avec un bouton d'appel réel.
/// Conforme à l'écran 6 de la maquette : aucun contenu commercial ici
/// (§12 — primauté de la santé publique).
class _UrgenceSheet extends StatelessWidget {
  const _UrgenceSheet({
    required this.pharmacieDeGarde,
    required this.onAppelerPharmacie,
  });

  final HomePharmacieItem? pharmacieDeGarde;
  final ValueChanged<HomePharmacieItem> onAppelerPharmacie;

  Future<void> _appeler(BuildContext context, String numero) async {
    final uri = Uri(scheme: 'tel', path: numero);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text("Impossible de lancer l'appel.")));
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: AppColors.lineStrong,
                  borderRadius: BorderRadius.circular(100),
                ),
              ),
            ),
            Row(
              children: [
                const Icon(Icons.call, color: AppColors.coral500, size: 18),
                const SizedBox(width: 8),
                const Text('Besoin d\'aide maintenant ?', style: AppTextStyles.cardTitle),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Services officiels — Cameroun',
              style: AppTextStyles.cardMeta.copyWith(color: AppColors.inkFaint),
            ),
            const SizedBox(height: 12),
            _UrgenceRow(
              titre: 'SAMU',
              soustitre: 'Urgences médicales nationales',
              numero: '1515',
              onAppeler: () => _appeler(context, '1515'),
            ),
            _UrgenceRow(
              titre: 'Police secours',
              soustitre: 'Intervention rapide',
              numero: '117',
              onAppeler: () => _appeler(context, '117'),
            ),
            if (pharmacieDeGarde != null)
              _UrgenceRow(
                titre: pharmacieDeGarde!.nom,
                soustitre: 'De garde — ${pharmacieDeGarde!.quartier}',
                numero: null,
                onAppeler: () => onAppelerPharmacie(pharmacieDeGarde!),
              ),
            const SizedBox(height: 4),
            AppAlert(
              type: AppAlertType.secondary,
              message: 'Les numéros d\'urgence restent accessibles même hors connexion.',
            ),
          ],
        ),
      ),
    );
  }
}

class _UrgenceRow extends StatelessWidget {
  const _UrgenceRow({
    required this.titre,
    required this.soustitre,
    required this.numero,
    required this.onAppeler,
  });

  final String titre;
  final String soustitre;
  final String? numero;
  final VoidCallback onAppeler;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: AppColors.coral100,
              borderRadius: BorderRadius.circular(10),
            ),
            alignment: Alignment.center,
            child: const Icon(Icons.local_hospital_outlined, size: 17, color: AppColors.coral500),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(titre, style: AppTextStyles.cardTitle.copyWith(fontSize: 12.5)),
                Text(soustitre, style: AppTextStyles.cardMeta),
              ],
            ),
          ),
          if (numero != null) ...[
            Text(
              numero!,
              style: AppTextStyles.price.copyWith(fontSize: 13, color: AppColors.ink),
            ),
            const SizedBox(width: 8),
          ],
          CallButton(onPressed: onAppeler),
        ],
      ),
    );
  }
}