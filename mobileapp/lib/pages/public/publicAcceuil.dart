import '../../components/publicite/slider_publicite.dart';
import '../../models/annonceur_publicite_models.dart' show PagesPublicite;
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
import '../../utils/mon_espace_navigation.dart';
import 'Medecinpage.dart';
import 'Pharmaciepage.dart';
import 'Centresantepage.dart';
import 'Assurancepage.dart';
import 'urgence.dart';

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
  /// 2=Assurance -> [AssurancePage], 3=Mon espace -> espace personnel de
  /// l'utilisateur s'il est connecté, sinon écran de connexion (voir
  /// `ouvrirMonEspace`).
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

  /// Rubrique basse « Mon espace » (ex « À propos ») : ouvre l'espace
  /// personnel de l'utilisateur s'il est connecté, sinon l'écran de
  /// connexion — voir `ouvrirMonEspace`.
  void _ouvrirMonEspace() {
    ouvrirMonEspace(context);
  }

  /// Feuille de choix rapide ouverte depuis le champ de recherche : la
  /// maquette ne propose pas d'écran de recherche globale dédié, donc on
  /// oriente directement vers l'un des vrais annuaires.
  void _ouvrirRecherche() {
    showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ApsSheetHeader(
                  title: 'Que recherchez-vous ?',
                  onClose: () => Navigator.pop(sheetContext),
                ),
                const SizedBox(height: 14),
                ApsMenu(children: [
                  _SearchChoiceTile(
                    icon: Icons.medical_services_outlined,
                    label: 'Un médecin',
                    meta: 'Généralistes et spécialistes',
                    tone: ApsTone.green,
                    onTap: () {
                      Navigator.pop(sheetContext);
                      _ouvrirMedecins();
                    },
                  ),
                  _SearchChoiceTile(
                    icon: Icons.local_pharmacy_outlined,
                    label: 'Une pharmacie',
                    meta: 'De garde ou horaires classiques',
                    tone: ApsTone.amber,
                    onTap: () {
                      Navigator.pop(sheetContext);
                      _ouvrirPharmacies();
                    },
                  ),
                  _SearchChoiceTile(
                    icon: Icons.local_hospital_outlined,
                    label: 'Une structure de santé',
                    meta: 'Hôpitaux, cliniques, centres',
                    tone: ApsTone.sky,
                    onTap: () {
                      Navigator.pop(sheetContext);
                      _ouvrirStructures();
                    },
                  ),
                  _SearchChoiceTile(
                    icon: Icons.shield_outlined,
                    label: 'Une assurance',
                    meta: 'Compagnies et courtiers',
                    tone: ApsTone.violet,
                    onTap: () {
                      Navigator.pop(sheetContext);
                      _ouvrirAssurances();
                    },
                  ),
                ]),
              ],
            ),
          ),
        );
      },
    );
  }

  /// Ouvre l'écran « Urgence » (numéros officiels, appel direct,
  /// pharmacie et hôpital les plus proches).
  void _ouvrirUrgence() {
    Navigator.push(context, MaterialPageRoute(builder: (_) => const UrgencePage()));
  }

  /// Compose un numéro (pharmacie de la liste).
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
      case 3: // Mon espace
        _ouvrirMonEspace();
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      extendBody: true,
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            _buildContent(context),
            Positioned(
              left: 16,
              right: 16,
              bottom: 12 + MediaQuery.paddingOf(context).bottom,
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
    final nbGardes = _pharmacies.where((p) => p.deGarde).length;

    return RefreshIndicator(
      color: AppColors.b6,
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
        padding: EdgeInsets.fromLTRB(
            18, 6, 18, AppBottomNav.reservedHeight + MediaQuery.paddingOf(context).bottom),
        children: [
          _HomeHeader(
            prenom: widget.prenomUtilisateur,
            localisation: widget.localisation,
            onCompte: _ouvrirMonEspace,
          ),
          _SearchField(onTap: widget.onSearchTap ?? _ouvrirRecherche),
          const SizedBox(height: 16),
          _HeroCard(onTap: widget.onMedecinsTap ?? _ouvrirMedecins),
          const SizedBox(height: 12),
          _QuickActionsGrid(
            onMedecinsTap: widget.onMedecinsTap ?? _ouvrirMedecins,
            onPharmaciesTap: widget.onPharmaciesTap ?? _ouvrirPharmacies,
            onStructuresTap: widget.onStructuresTap ?? _ouvrirStructures,
            onAssurancesTap: _ouvrirAssurances,
            onUrgenceTap: widget.onUrgenceTap ?? _ouvrirUrgence,
            nbGardes: nbGardes,
          ),
          // Carrousel réel de PAGE_ACCUEIL (positions payées + « Réserver cet
          // espace ») ; l'ancien carrousel ne sert plus que si `ads` est imposé.
          if (widget.ads.isEmpty) ...[
            const ApsSectionTitle('Offres partenaires'),
            const SliderPublicite(code: PagesPublicite.accueil),
          ] else ...[
            ApsSectionTitle(
              'Offres partenaires',
              trailing: Text('${ads.length} · Publicité', style: AppTextStyles.xs),
            ),
            _PartnerAdsCarousel(
              controller: _adController,
              ads: ads,
              onPageChanged: (i) => setState(() => _adIndex = i),
              onAdTap: widget.onAdTap,
            ),
            const SizedBox(height: 12),
            _CarouselDots(count: ads.length, activeIndex: _adIndex),
          ],
          ApsSectionTitle(
            'Pharmacies de garde',
            action: 'Tout voir',
            onAction: widget.onVoirToutesPharmacies ?? _ouvrirPharmacies,
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
    this.couleurFond = AppColors.b1,
    this.couleurIcone = AppColors.b7,
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
    couleurFond: AppColors.b1,
    couleurIcone: AppColors.b7,
    icone: Icons.flight_takeoff_outlined,
  ),
  HomeAdItem(
    titre: 'AXA Assurances',
    description: 'Professionnalisme, proximité, expertise.',
    couleurFond: AppColors.sky100,
    couleurIcone: AppColors.sky,
    icone: Icons.shield_outlined,
  ),
  HomeAdItem(
    titre: 'Journée des infirmières',
    description: '12 mai — Croix-Rouge du Wouri.',
    couleurFond: AppColors.coral100,
    couleurIcone: AppColors.coral600,
    icone: Icons.favorite_outline,
  ),
  HomeAdItem(
    titre: 'Nourishka Greenlife',
    description: 'Le collagène peau, cheveux, articulations.',
    couleurFond: AppColors.amber100,
    couleurIcone: AppColors.amber700,
    icone: Icons.eco_outlined,
  ),
  HomeAdItem(
    titre: 'MTN — Bonus imbattables',
    description: "Plus de data, plus d'appels dès 237 FCFA.",
    couleurFond: AppColors.amber100,
    couleurIcone: AppColors.amber700,
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

/// En-tête : avatar, salutation, localisation, accès au compte.
class _HomeHeader extends StatelessWidget {
  const _HomeHeader({
    required this.prenom,
    required this.localisation,
    required this.onCompte,
  });

  final String prenom;
  final String localisation;
  final VoidCallback onCompte;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 6, 0, 14),
      child: Row(
        children: [
          ApsAvatar(name: prenom, size: 40, round: true, variant: 2),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Bonjour 👋', style: AppTextStyles.xs),
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        prenom,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTextStyles.strong.copyWith(fontSize: 15),
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Icon(Icons.location_on_outlined, size: 13, color: AppColors.ink3),
                    const SizedBox(width: 2),
                    Flexible(
                      child: Text(
                        localisation,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTextStyles.xs,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          ApsIconButton(
            icon: Icons.notifications_none_rounded,
            tooltip: 'Mon espace',
            onPressed: onCompte,
          ),
        ],
      ),
    );
  }
}

/// Champ de recherche — `.search` (56 px, bouton sombre à droite).
class _SearchField extends StatelessWidget {
  const _SearchField({this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(18);
    return Container(
      height: 56,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: r,
        boxShadow: AppColors.shadowCard,
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          borderRadius: r,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 6, 6),
            child: Row(
              children: [
                const Icon(Icons.search_rounded, size: 20, color: AppColors.ink3),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Médecin, pharmacie, structure…',
                    style: AppTextStyles.small.copyWith(fontSize: 14, color: AppColors.ink3),
                  ),
                ),
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.ink,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.tune_rounded, size: 18, color: Colors.white),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Carte d'accroche vert profond — reprend le style de la carte
/// « prochain RDV » de la maquette pour mettre en avant la réservation.
class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(24);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(gradient: AppColors.gradientForest, borderRadius: r),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          child: Stack(
            children: [
              Positioned(
                right: -40,
                top: -40,
                child: Container(
                  width: 160,
                  height: 160,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.06),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const ApsPill('Disponible aujourd\'hui',
                            tone: ApsTone.white, dot: true, foreground: AppColors.mint),
                        const Spacer(),
                        Icon(Icons.chevron_right_rounded,
                            size: 20, color: Colors.white.withValues(alpha: 0.6)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Un médecin, sans attendre.',
                      style: TextStyle(
                        fontFamily: AppTextStyles.fontSans,
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Choisissez un créneau, payez en Mobile Money : les fonds sont protégés jusqu\'à la consultation.',
                      style: TextStyle(
                        fontFamily: AppTextStyles.fontSans,
                        color: Colors.white.withValues(alpha: 0.72),
                        fontSize: 12.5,
                        height: 1.45,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        const _HeroTag(icon: Icons.verified_user_outlined, label: 'Vérifiés'),
                        const SizedBox(width: 6),
                        const _HeroTag(icon: Icons.lock_outline_rounded, label: 'Séquestre'),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text('Réserver',
                              style: AppTextStyles.strong.copyWith(fontSize: 12)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroTag extends StatelessWidget {
  const _HeroTag({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 13, color: Colors.white),
            const SizedBox(width: 6),
            Text(
              label,
              style: const TextStyle(
                fontFamily: AppTextStyles.fontSans,
                color: Colors.white,
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
    );
  }
}

/// Grille de raccourcis en mosaïque : grande tuile « Prendre
/// rendez-vous » à gauche, quatre petites tuiles à droite et dessous.
class _QuickActionsGrid extends StatelessWidget {
  const _QuickActionsGrid({
    required this.onMedecinsTap,
    required this.onPharmaciesTap,
    required this.onStructuresTap,
    required this.onAssurancesTap,
    required this.onUrgenceTap,
    required this.nbGardes,
  });

  final VoidCallback onMedecinsTap;
  final VoidCallback onPharmaciesTap;
  final VoidCallback onStructuresTap;
  final VoidCallback onAssurancesTap;
  final VoidCallback onUrgenceTap;
  final int nbGardes;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                flex: 115,
                child: _BigTile(onTap: onMedecinsTap),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 100,
                child: Column(
                  children: [
                    _SmallTile(
                      icon: Icons.local_pharmacy_outlined,
                      label: 'Pharmacies',
                      meta: nbGardes > 0 ? '$nbGardes de garde' : 'De garde',
                      metaColor: AppColors.b6,
                      tone: ApsTone.green,
                      onTap: onPharmaciesTap,
                    ),
                    const SizedBox(height: 8),
                    _SmallTile(
                      icon: Icons.local_hospital_outlined,
                      label: 'Structures',
                      meta: 'Hôpitaux, cliniques',
                      tone: ApsTone.sky,
                      onTap: onStructuresTap,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _SmallTile(
                icon: Icons.shield_outlined,
                label: 'Assurances',
                meta: 'Formules santé',
                metaColor: AppColors.violet700,
                tone: ApsTone.violet,
                filled: AppColors.violet100,
                onTap: onAssurancesTap,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _SmallTile(
                icon: Icons.emergency_outlined,
                label: 'Urgence',
                meta: 'SAMU, police',
                metaColor: AppColors.red,
                tone: ApsTone.red,
                filled: AppColors.red100,
                onTap: onUrgenceTap,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _BigTile extends StatelessWidget {
  const _BigTile({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ApsCard(
      color: AppColors.b1,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const ApsIconTile(Icons.medical_services_outlined, background: Colors.white),
          const SizedBox(height: 18),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Prendre\nrendez-vous',
                  style: AppTextStyles.strong.copyWith(fontSize: 15, letterSpacing: -0.3)),
              const SizedBox(height: 4),
              Text('Médecins et spécialistes',
                  style: AppTextStyles.xs.copyWith(color: AppColors.b7)),
            ],
          ),
        ],
      ),
    );
  }
}

class _SmallTile extends StatelessWidget {
  const _SmallTile({
    required this.icon,
    required this.label,
    required this.meta,
    required this.tone,
    required this.onTap,
    this.metaColor,
    this.filled,
  });

  final IconData icon;
  final String label;
  final String meta;
  final ApsTone tone;
  final VoidCallback onTap;
  final Color? metaColor;

  /// Fond teinté ; sinon carte blanche bordée.
  final Color? filled;

  @override
  Widget build(BuildContext context) {
    return ApsCard(
      flat: filled == null,
      color: filled,
      padding: const EdgeInsets.all(11),
      onTap: onTap,
      child: Row(
        children: [
          ApsIconTile(icon,
              tone: tone, small: true, background: filled != null ? Colors.white : null),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTextStyles.strong.copyWith(fontSize: 12.5)),
                Text(meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTextStyles.xs.copyWith(color: metaColor)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Carrousel horizontal de publicités / actualités partenaires.
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
      height: 196,
      child: PageView.builder(
        controller: controller,
        onPageChanged: onPageChanged,
        padEnds: false,
        itemCount: ads.length,
        itemBuilder: (context, index) {
          final ad = ads[index];
          return Padding(
            padding: const EdgeInsets.only(right: 10, bottom: 6),
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
    return ApsCard(
      onTap: onTap,
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: SizedBox(
              height: 100,
              width: double.infinity,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ad.imageUrl != null
                      ? Image.network(
                          ad.imageUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => _AdPlaceholder(ad: ad),
                        )
                      : _AdPlaceholder(ad: ad),
                  const Positioned(
                    left: 8,
                    top: 8,
                    child: ApsPill('Publicité', tone: ApsTone.ink),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(ad.titre,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTextStyles.strong.copyWith(fontSize: 13)),
                const SizedBox(height: 2),
                Text(ad.description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTextStyles.xs.copyWith(height: 1.4)),
              ],
            ),
          ),
        ],
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

/// Puces de pagination du carrousel.
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
            width: i == activeIndex ? 22 : 6,
            height: 6,
            decoration: BoxDecoration(
              color: i == activeIndex ? AppColors.ink : AppColors.lineStrong,
              borderRadius: BorderRadius.circular(6),
            ),
          ),
          if (i != count - 1) const SizedBox(width: 6),
        ],
      ],
    );
  }
}

/// Une ligne de choix dans la feuille de recherche rapide.
class _SearchChoiceTile extends StatelessWidget {
  const _SearchChoiceTile({
    required this.icon,
    required this.label,
    required this.meta,
    required this.tone,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String meta;
  final ApsTone tone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ApsMenuItem(
      icon: icon,
      tone: tone,
      title: label,
      subtitle: meta,
      onTap: onTap,
    );
  }
}
