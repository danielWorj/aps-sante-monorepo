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
  // Pays / ville : envoyés au serveur via [filtresServicesAssuranceProvider]
  // (identifiants du référentiel, comme l'annuaire des médecins). Type
  // d'acteur, vérification et tri s'appliquent côté client.
  TypeActeurAssurance? _typeActeur;
  String _tri = 'pertinence';
  bool _verifieesUniquement = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  /// Villes réellement présentes dans les fiches chargées, déduites de
  /// `ServiceAssurance.ville` (inclus par le backend sur cette route).
  ServicesAssuranceFiltre get _filtresServeur =>
      ref.read(filtresServicesAssuranceProvider) ?? const ServicesAssuranceFiltre();

  void _appliquerPaysVille(String? paysId, String? villeId) {
    final actuel = _filtresServeur;
    ref.read(filtresServicesAssuranceProvider.notifier).state = ServicesAssuranceFiltre(
      paysId: paysId,
      villeId: villeId,
      typeActeur: actuel.typeActeur,
      statutVerification: actuel.statutVerification,
      recherche: actuel.recherche,
    );
  }

  List<ServiceAssurance> _filtrer(List<ServiceAssurance> services) {
    final q = _query.toLowerCase();
    final liste = services.where((s) {
      final ville = s.ville?.nom ?? '';
      final description = s.description ?? '';
      final matchRecherche = q.isEmpty ||
          s.nom.toLowerCase().contains(q) ||
          ville.toLowerCase().contains(q) ||
          description.toLowerCase().contains(q);
      final matchType = _typeActeur == null || s.typeActeur == _typeActeur;
      final matchVerifiee = !_verifieesUniquement ||
          s.statutVerification == StatutVerificationAssurance.publie;
      return matchRecherche && matchType && matchVerifiee;
    }).toList();
    if (_tri == 'nom') {
      liste.sort((a, b) => a.nom.toLowerCase().compareTo(b.nom.toLowerCase()));
    }
    return liste;
  }

  static String _libelleType(TypeActeurAssurance t) =>
      t == TypeActeurAssurance.courtier ? 'Courtiers' : 'Compagnies';

  /// Feuille de filtres, sur le modèle de celle des médecins.
  Future<void> _ouvrirFiltres() async {
    final f = _filtresServeur;
    final choix = await showApsFilterSheet<_FiltresAssuranceSheet>(
      context: context,
      initial: (
        type: _typeActeur,
        paysId: f.paysId,
        villeId: f.villeId,
        verifiees: _verifieesUniquement,
        tri: _tri,
      ),
      reset: (type: null, paysId: null, villeId: null, verifiees: false, tri: 'pertinence'),
      builder: (c, maj) => [
        ApsFilterSection(
          title: "Type d'acteur",
          child: ApsFilterChoices<TypeActeurAssurance?>(
            value: c.type,
            onChanged: (v) => maj((type: v, paysId: c.paysId, villeId: c.villeId, verifiees: c.verifiees, tri: c.tri)),
            options: [
              const ApsFilterOption(null, 'Tous'),
              for (final t in TypeActeurAssurance.values)
                ApsFilterOption(t, _libelleType(t), icon: Icons.shield_outlined),
            ],
          ),
        ),
        ApsFiltrePaysVille(
          paysId: c.paysId,
          villeId: c.villeId,
          onChanged: (paysId, villeId) => maj((type: c.type, paysId: paysId, villeId: villeId, verifiees: c.verifiees, tri: c.tri)),
        ),
        ApsFilterSwitch(
          label: 'Vérifiées APS uniquement',
          subtitle: 'Fiches vérifiées par APS Santé',
          icon: Icons.verified_outlined,
          value: c.verifiees,
          onChanged: (v) => maj((type: c.type, paysId: c.paysId, villeId: c.villeId, verifiees: v, tri: c.tri)),
        ),
        ApsFilterSection(
          title: 'Trier par',
          child: ApsFilterChoices<String>(
            value: c.tri,
            onChanged: (v) => maj((type: c.type, paysId: c.paysId, villeId: c.villeId, verifiees: c.verifiees, tri: v)),
            options: [
              for (final e in apsLibellesTriAnnuaire.entries) ApsFilterOption(e.key, e.value),
            ],
          ),
        ),
      ],
    );
    if (choix == null || !mounted) return;
    setState(() {
      _typeActeur = choix.type;
      _verifieesUniquement = choix.verifiees;
      _tri = choix.tri;
    });
    if (choix.paysId != f.paysId || choix.villeId != f.villeId) {
      _appliquerPaysVille(choix.paysId, choix.villeId);
    }
  }

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
        Builder(builder: (context) {
          final f = ref.watch(filtresServicesAssuranceProvider);
          return ApsFilterBar(
            onOpen: _ouvrirFiltres,
            actifs: [
              if (_typeActeur != null)
                (
                  label: _libelleType(_typeActeur!),
                  icon: Icons.shield_outlined,
                  onRemove: () => setState(() => _typeActeur = null),
                ),
              if (f?.paysId != null)
                (
                  label: apsNomPays(ref, f!.paysId!),
                  icon: Icons.public_rounded,
                  onRemove: () => _appliquerPaysVille(null, null),
                ),
              if (f?.paysId != null && f?.villeId != null)
                (
                  label: apsNomVille(ref, f!.paysId!, f.villeId!),
                  icon: Icons.location_on_outlined,
                  onRemove: () => _appliquerPaysVille(f.paysId, null),
                ),
              if (_verifieesUniquement)
                (
                  label: 'Vérifiées APS',
                  icon: Icons.verified_outlined,
                  onRemove: () => setState(() => _verifieesUniquement = false),
                ),
              if (_tri != 'pertinence')
                (
                  label: apsLibellesTriAnnuaire[_tri]!,
                  icon: Icons.sort_rounded,
                  onRemove: () => setState(() => _tri = 'pertinence'),
                ),
            ],
          );
        }),
        const SizedBox(height: 14),

        ApsNote.text(
          'aucune souscription en ligne ni gestion de sinistre sur APS.',
          bold: 'Présentation seulement :',
          icon: Icons.info_outline_rounded,
        ),
        const SizedBox(height: 16),

        // ---- Publicité (encart réel de PAGE_ASSURANCES, placé au-dessus de la liste) ----
        _InsuranceAdBanner(token: ref.read(authTokenProvider)),

        ApsInvitationPro(
          question: 'Vous êtes assureur ou courtier ?',
          libelle: 'Inscrire mon assurance',
          icone: Icons.shield_outlined,
          onPressed: () => ouvrirDeclarerAssurance(context),
        ),
        const SizedBox(height: 16),

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
            onReset: () {
              setState(() {
                _searchController.clear();
                _query = '';
                _typeActeur = null;
                _verifieesUniquement = false;
                _tri = 'pertinence';
              });
              _appliquerPaysVille(null, null);
            },
          )
        else
          // 5 compagnies par page, pagination sous la liste.
          ApsListePaginee<ServiceAssurance>(
            elements: resultats,
            cleReinitialisation: Object.hash(
              identityHashCode(services),
              _query,
              _typeActeur,
              _verifieesUniquement,
              _tri,
            ),
            construirePage: (context, page) => [
              for (final service in page) _buildCarte(service),
            ],
          ),
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
      imageUrl: service.imageUrl,
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

/// Brouillon de la feuille de filtres de [AssurancePage].
typedef _FiltresAssuranceSheet = ({
  TypeActeurAssurance? type,
  String? paysId,
  String? villeId,
  bool verifiees,
  String tri,
});
