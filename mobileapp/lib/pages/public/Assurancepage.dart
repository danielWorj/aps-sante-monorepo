import '../../components/publicite/slider_publicite.dart';
import '../../models/annonceur_publicite_models.dart' show PagesPublicite;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/assurance_controller.dart';
import '../../controllers/authentification_controller.dart' show authTokenProvider;
import '../../controllers/publicite_controller.dart';
import '../../models/assurance_models.dart';
import '../../utils/mon_espace_navigation.dart';
import './utils/DetailAssurance.dart'; // ⚠️ adapter ce chemin à l'emplacement réel du fichier dans le projet.
import 'publicAcceuil.dart';
import 'Medecinpage.dart';

/// Écran public — **Annuaire des assurances** (`5 · Annuaire assurances`
/// dans la maquette `ui-mobile.html`).
///
/// Consultable sans compte. Liste les compagnies et courtiers santé
/// référencés sur APS (via GET /api/services-assurance, route publique —
/// voir [listeServicesAssuranceControllerProvider]), avec recherche,
/// filtres (ville / vérifiées APS) et accès à la fiche détaillée de
/// chaque assureur ([AssuranceDetailPage]).
///
/// ```dart
/// Navigator.push(
///   context,
///   MaterialPageRoute(builder: (_) => const AssurancePage()),
/// );
/// ```
class AssurancePage extends ConsumerStatefulWidget {
  const AssurancePage({super.key});

  @override
  ConsumerState<AssurancePage> createState() => _AssurancePageState();
}

class _AssurancePageState extends ConsumerState<AssurancePage> {
  int _navIndex = 2; // 0=Accueil, 1=Médecin, 2=Assurance, 3=À propos

  final TextEditingController _searchController = TextEditingController();
  String _query = '';
  String _villeSelectionnee = 'Toutes les villes';
  bool _verifieesUniquement = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  /// Villes réellement présentes dans les fiches chargées, déduites de
  /// `ServiceAssurance.ville` (inclus par le backend sur cette route).
  List<String> _villesDisponibles(List<ServiceAssurance> services) {
    final noms = <String>{
      for (final s in services)
        if ((s.ville?.nom ?? '').isNotEmpty) s.ville!.nom,
    }.toList()
      ..sort();
    return ['Toutes les villes', ...noms];
  }

  /// Filtrage client (recherche + ville + « vérifiées APS ») sur la liste
  /// déjà récupérée du backend. « Vérifiée APS » correspond au statut
  /// `StatutVerificationAssurance.publie`.
  List<ServiceAssurance> _filtrer(List<ServiceAssurance> services) {
    return services.where((s) {
      final ville = s.ville?.nom ?? '';
      final description = s.description ?? '';
      final matchRecherche = _query.isEmpty ||
          s.nom.toLowerCase().contains(_query.toLowerCase()) ||
          ville.toLowerCase().contains(_query.toLowerCase()) ||
          description.toLowerCase().contains(_query.toLowerCase());
      final matchVille = _villeSelectionnee == 'Toutes les villes' ||
          ville == _villeSelectionnee;
      final matchVerifiee = !_verifieesUniquement ||
          s.statutVerification == StatutVerificationAssurance.publie;
      return matchRecherche && matchVille && matchVerifiee;
    }).toList();
  }

  /// Gère un tap sur la barre de navigation basse : met à jour l'index actif
  /// ET navigue réellement vers l'écran correspondant (0=Accueil,
  /// 1=Médecin, 2=Assurance [écran courant], 3=À propos).
  void _onBottomNavTap(int index) {
    setState(() => _navIndex = index);
    switch (index) {
      case 0: // Accueil
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const PublicAcceuilPage()),
        );
        break;
      case 1: // Médecin
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const MedecinPage()),
        );
        break;
      case 2: // Assurance — déjà sur cet écran.
        break;
      case 3: // Mon espace
        ouvrirMonEspace(context);
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final servicesAsync = ref.watch(listeServicesAssuranceControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.bg,
      extendBody: true,
      body: Stack(
        children: [
          RefreshIndicator(
            color: AppColors.b6,
            onRefresh: () => ref
                .read(listeServicesAssuranceControllerProvider.notifier)
                .rafraichir(),
            child: _buildContent(context, servicesAsync),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 12 + MediaQuery.paddingOf(context).bottom,
            child: AppBottomNav(
              currentIndex: _navIndex,
              onTap: _onBottomNavTap,
              onRdvPressed: () {
                // Brancher ici la navigation vers le flux de prise de RDV.
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(
      BuildContext context,
      AsyncValue<List<ServiceAssurance>> servicesAsync,
      ) {
    return SafeArea(
      bottom: false,
      child: ListView(
      padding: EdgeInsets.fromLTRB(
          18, 6, 18, AppBottomNav.reservedHeight + MediaQuery.paddingOf(context).bottom),
      children: [
        // ---- En-tête ------------------------------------------------
        ApsPageTitle(
          'Assurances',
          subtitle: 'Compagnies et courtiers santé référencés',
          trailing: Navigator.of(context).canPop()
              ? ApsIconButton(
                  icon: Icons.close_rounded,
                  tooltip: 'Fermer',
                  onPressed: () => Navigator.of(context).maybePop(),
                )
              : null,
        ),

        // ---- Recherche ------------------------------------------------
        _SearchField(
          controller: _searchController,
          hint: 'Compagnie, ville…',
          onChanged: (value) => setState(() => _query = value),
        ),

        // ---- Filtres ------------------------------------------------
        const SizedBox(height: 12),
        servicesAsync.when(
          data: (services) => ApsChipRow(
            children: [
              ApsChip(
                'Vérifiées APS',
                icon: Icons.verified_outlined,
                soft: _verifieesUniquement,
                onTap: () =>
                    setState(() => _verifieesUniquement = !_verifieesUniquement),
              ),
              for (final ville in _villesDisponibles(services))
                ApsChip(
                  ville,
                  icon: ville == 'Toutes les villes' ? null : Icons.location_on_outlined,
                  selected: _villeSelectionnee == ville,
                  onTap: () => setState(() => _villeSelectionnee = ville),
                ),
            ],
          ),
          // Filtres non disponibles tant que la liste n'a pas répondu au
          // moins une fois — on évite un flash de puces vides.
          loading: () => const SizedBox.shrink(),
          error: (_, _) => const SizedBox.shrink(),
        ),
        const SizedBox(height: 14),

        ApsNote.text(
          'aucune souscription en ligne ni gestion de sinistre sur APS.',
          bold: 'Présentation seulement :',
          icon: Icons.info_outline_rounded,
        ),
        const SizedBox(height: 16),

        // ---- Publicité (encart réel de PAGE_ASSURANCES, placé au-dessus de la liste) ----
        _InsuranceAdBanner(token: ref.read(authTokenProvider)),

        // ---- Résultats ------------------------------------------------
        servicesAsync.when(
          data: (services) => _buildResultats(services),
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 48),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (erreur, _) => _ErrorState(
            message: "Impossible de charger l'annuaire des assurances.",
            onRetry: () => ref
                .read(listeServicesAssuranceControllerProvider.notifier)
                .rafraichir(),
          ),
        ),
      ],
      ),
    );
  }

  Widget _buildResultats(List<ServiceAssurance> services) {
    final resultats = _filtrer(services);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ApsSectionTitle(
          'Compagnies',
          padding: const EdgeInsets.only(bottom: 12),
          trailing: Text('${resultats.length} au total', style: AppTextStyles.xs),
        ),

        if (resultats.isEmpty)
          _EmptyState(
            onReset: () => setState(() {
              _searchController.clear();
              _query = '';
              _villeSelectionnee = 'Toutes les villes';
              _verifieesUniquement = false;
            }),
          )
        else
          for (final service in resultats) _buildCarte(service),
      ],
    );
  }

  Widget _buildCarte(ServiceAssurance service) {
    final couleurs = _couleursPour(service.serviceAssuranceId);
    final sigle = _sigleAssurance(service.nom);
    final verifiee =
        service.statutVerification == StatutVerificationAssurance.publie;

    return CardAssurance(
      nom: service.nom,
      sigle: sigle,
      ville: service.ville?.nom ?? '',
      // Présence minimale (sans abonnement) : ni description ni agrément,
      // le serveur ne les envoie pas (guide abonnements v3, §4.1.2).
      description: service.description ?? '',
      numeroAgrement: service.agrement,
      typeStructure: service.typeActeur == TypeActeurAssurance.courtier
          ? 'Courtier'
          : "Compagnie d'assurance",
      verifieeAps: verifiee,
      couleurLogo: couleurs.logo,
      fondLogo: couleurs.fond,
      onVoirFiche: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => AssuranceDetailPage(
              serviceAssuranceId: service.serviceAssuranceId,
              // Jeton de l'utilisateur connecté (`null` si personne n'est
              // connecté) — sans lui, le bouton « Envoyer la demande » de
              // la fiche de détail resterait bloqué même pour un
              // utilisateur authentifié.
              authToken: ref.read(authTokenProvider),
              // Aperçu utilisé pour afficher immédiatement l'en-tête de la
              // fiche pendant que le détail complet se charge.
              apercu: ApercuAssurance(
                nom: service.nom,
                sigle: sigle,
                ville: service.ville?.nom ?? '',
                pays: service.pays?.nom ?? '',
                verifieeAps: verifiee,
                couleurLogo: couleurs.logo,
                fondLogo: couleurs.fond,
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Deux premières initiales du nom, utilisées comme « logo » textuel
/// (`CardAssurance.sigle`) tant qu'aucune image dédiée n'est affichée.
String _sigleAssurance(String nom) {
  final mots =
  nom.trim().split(RegExp(r'\s+')).where((m) => m.isNotEmpty).toList();
  if (mots.isEmpty) return '?';
  if (mots.length == 1) {
    final mot = mots.first;
    return mot.substring(0, mot.length >= 2 ? 2 : 1).toUpperCase();
  }
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

/// Couleur de logo + couleur de fond associées à une fiche.
class _PaletteCouleur {
  const _PaletteCouleur(this.logo, this.fond);
  final Color logo;
  final Color fond;
}

const List<_PaletteCouleur> _paletteLogos = [
  _PaletteCouleur(AppColors.sky, AppColors.sky100),
  _PaletteCouleur(AppColors.violet700, AppColors.violet100),
  _PaletteCouleur(AppColors.b7, AppColors.b1),
  _PaletteCouleur(AppColors.coral600, AppColors.coral100),
  _PaletteCouleur(AppColors.amber700, AppColors.amber100),
  _PaletteCouleur(AppColors.ink2, AppColors.segment),
];

/// Couleur déterministe (dérivée de l'id) tant que le backend ne fournit
/// pas de couleur de marque dédiée pour `service_assurance`.
_PaletteCouleur _couleursPour(String serviceAssuranceId) =>
    _paletteLogos[serviceAssuranceId.hashCode.abs() % _paletteLogos.length];

/// Champ de recherche — `.search` de la maquette.
class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.hint, required this.onChanged});

  final TextEditingController controller;
  final String hint;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) =>
      ApsSearchField(controller: controller, hint: hint, onChanged: onChanged);
}

/// Bandeau publicitaire — `.ad-mobile.ad-top` de la maquette.
///
/// Publicité RÉELLE de l'emplacement `PAGE_ASSURANCES`, récupérée via
/// GET /publicites/par-page/PAGE_ASSURANCES
/// ([publicitesParCodePageProvider] — voir publicite_controller.dart /
/// publicite_repository.dart). Affiche la première publicité "validee"
/// renvoyée par le backend pour cette page ; si aucune publicité n'est
/// active (ou en cas d'erreur réseau), le bandeau ne s'affiche
/// simplement pas — un encart vide serait plus perturbant que son
/// absence.
///
/// [token] permet à un admin/superadmin connecté de voir aussi les
/// publicités non "validee" de cet emplacement (mêmes règles de
/// visibilité que côté backend, voir listerPublicitesParCodePage) ;
/// laisser à `null` pour le comportement public standard.
class _InsuranceAdBanner extends StatelessWidget {
  // v9 : carrousel des positions payées de PAGE_ASSURANCES + carte
  // « Réserver cet espace » (voir slider_publicite.dart).
  const _InsuranceAdBanner({this.token});

  /// Conservé pour la compatibilité des appels existants (inutile : le
  /// carrousel public ne montre que les publicités en diffusion).
  final String? token;

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.only(bottom: 12),
        child: SliderPublicite(code: PagesPublicite.assurances),
      );
}

/// État vide — aucune compagnie ne correspond à la recherche / aux filtres.
class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onReset});

  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    return ApsEmptyState(
      icon: Icons.search_off_rounded,
      tone: ApsTone.neutral,
      title: 'Aucune compagnie trouvée',
      message: 'Essayez une autre ville ou réinitialisez les filtres.',
      actionLabel: 'Réinitialiser',
      onAction: onReset,
    );
  }
}

/// État d'erreur réseau/API — affiché quand le chargement de l'annuaire
/// échoue (ex: backend indisponible).
class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ApsEmptyState(
      icon: Icons.wifi_off_rounded,
      tone: ApsTone.neutral,
      title: 'Annuaire indisponible',
      message: message,
      actionLabel: 'Réessayer',
      onAction: onRetry,
    );
  }
}
