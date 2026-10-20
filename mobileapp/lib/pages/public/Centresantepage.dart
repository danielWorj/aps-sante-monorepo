// =============================================================================
// centresantepage.dart
// -----------------------------------------------------------------------------
// Écran « Annuaire des structures de santé » (hôpitaux, cliniques, centres de
// santé) — branché sur la vraie API via Riverpod (voir
// controllers/centresante_controller.dart, repositories/centresante_repository.dart
// et models/centresante_models.dart).
//
// Emplacement suggéré : lib/pages/centresantepage.dart
// -> adaptez le chemin d'import ci-dessous à l'emplacement réel de
//    components.dart / centresante_controller.dart / centresante_models.dart
//    dans votre projet.
//
// Changements par rapport à la version de démonstration :
//   - Suppression du modèle local `StructureSante` et du jeu de données
//     `_demoStructures` : l'écran consomme désormais
//     `listeCentresSanteControllerProvider` (AsyncNotifier Riverpod), qui
//     appelle lui-même `CentreSanteRepository.lister()` -> GET /centres-sante.
//   - `CentreSantePage` devient un `ConsumerStatefulWidget` : nécessite
//     `flutter_riverpod` et que l'app soit enveloppée dans un `ProviderScope`.
//   - Filtre serveur : seules les fiches au statut `publie` sont demandées à
//     l'API (annuaire PUBLIC — les fiches en cours de vérification ou non
//     publiées ne doivent pas apparaître aux visiteurs), via
//     `filtresCentresSanteProvider`.
//   - Filtres « type » et « ville » + recherche texte restent appliqués côté
//     client sur la liste déjà chargée (pas de round-trip réseau à chaque
//     frappe), mais portent désormais sur les vraies données API
//     (`TypeStructure` à 5 valeurs, `ville_id` réel) plutôt que sur des
//     chaînes de démonstration.
//   - Prise en charge des états de chargement / erreur / vide via
//     `AsyncValue<List<CentreSante>>`, avec pull-to-refresh
//     (`RefreshIndicator`) et bouton « Réessayer » en cas d'erreur
//     (`CentreSanteException` typée, message déjà prêt pour l'UI).
//   - Actions « Appeler » / « Itinéraire » branchées sur les vrais champs
//     `telephone` et `geolocalisation` (latitude/longitude) du centre.
//
// Dépendances additionnelles : `flutter_riverpod`, `url_launcher`.
// =============================================================================

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../components/components.dart';
import '../../controllers/centresante_controller.dart';
import '../../models/centresante_models.dart';
import 'publicAcceuil.dart';
import 'Medecinpage.dart';
import 'Assurancepage.dart';
import '../../repositories/centresante_repository.dart';
import '../../utils/mon_espace_navigation.dart';


/// Écran « Trouver une structure de santé » — annuaire des hôpitaux,
/// cliniques et centres de santé, alimenté par l'API réelle.
///
/// Reprend fidèlement l'écran 3 de `ui-mobile.html` :
/// - en-tête `page-title` (Annuaire / titre / sous-titre),
/// - champ de recherche,
/// - filtres par type de structure + par ville (`filter-chips`),
/// - compteur de résultats,
/// - liste de [CardStructure],
/// - barre de navigation basse flottante.
///
/// ```dart
/// Navigator.push(context, MaterialPageRoute(builder: (_) => const CentreSantePage()));
/// ```
class CentreSantePage extends ConsumerStatefulWidget {
  const CentreSantePage({
    super.key,
    this.token,
    this.showAppBar = true,
    this.showBottomNav = true,
    this.bottomNavIndex = 0,
    this.onBottomNavTap,
    this.onRdvPressed,
    this.onStructureTap,
    this.adBanner,
  });

  /// Jeton de l'utilisateur connecté, optionnel — la lecture de
  /// l'annuaire est publique côté serveur (voir centreSante.routes.js),
  /// mais si un utilisateur est connecté on le transmet malgré tout au
  /// controller (voir `ListeCentresSanteController.definirToken`), au cas
  /// où l'API s'enrichirait un jour pour un visiteur authentifié.
  final String? token;

  /// Affiche une barre d'app minimale avec bouton retour.
  final bool showAppBar;

  /// Affiche la barre de navigation basse flottante (désactivable si l'écran
  /// est déjà intégré dans un shell de navigation parent).
  final bool showBottomNav;

  /// Index actif de la barre de navigation basse.
  final int bottomNavIndex;

  /// Callback appelé au tap sur une rubrique de la barre basse.
  final ValueChanged<int>? onBottomNavTap;

  /// Callback appelé au tap sur le bouton flottant « Rendez-vous ».
  final VoidCallback? onRdvPressed;

  /// Callback appelé au tap sur une fiche de la liste (ouvrir le détail).
  final ValueChanged<CentreSante>? onStructureTap;

  /// Emplacement publicitaire optionnel, affiché au-dessus de la liste —
  /// jamais entre les fiches, conformément à la règle produit de la maquette.
  final Widget? adBanner;

  @override
  ConsumerState<CentreSantePage> createState() => _CentreSantePageState();
}

class _CentreSantePageState extends ConsumerState<CentreSantePage> {
  final TextEditingController _searchController = TextEditingController();

  String _query = '';
  TypeStructure? _selectedType; // null = « Tous les types »
  // Pays / ville : envoyés au serveur via [filtresCentresSanteProvider]
  // (identifiants du référentiel, comme l'annuaire des médecins).
  String _tri = 'pertinence';

  /// Comportement PAR DÉFAUT de la barre de navigation basse, utilisé
  /// uniquement si l'écran parent n'a pas fourni `widget.onBottomNavTap`
  /// (ex: quand [CentreSantePage] est ouverte directement via
  /// `Navigator.push`, hors d'un shell de navigation). Sans ce fallback,
  /// `widget.onBottomNavTap ?? (_) {}` ne faisait strictement rien au tap.
  void _defaultOnBottomNavTap(int index) {
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
      case 2: // Assurance
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const AssurancePage()),
        );
        break;
      case 3: // Mon espace
        ouvrirMonEspace(context);
        break;
    }
  }

  @override
  void initState() {
    super.initState();
    // Annuaire public : on ne demande à l'API que les fiches déjà
    // vérifiées/publiées (voir StatutVerificationStructure côté modèle) —
    // une fiche « en_cours » ou « non_publie » ne doit pas être visible
    // dans l'annuaire grand public.
    // Ce filtre est partagé (filtresCentresSanteProvider) : le controller
    // recharge automatiquement dès qu'il change (voir ref.listen dans
    // ListeCentresSanteController.build()).
    ref.read(filtresCentresSanteProvider.notifier).state =
    const CentresSanteFiltre(
      statutVerification: StatutVerificationStructure.publie,
    );

    final token = widget.token;
    if (token != null) {
      ref
          .read(listeCentresSanteControllerProvider.notifier)
          .definirToken(token);
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  CentresSanteFiltre get _filtresServeur =>
      ref.read(filtresCentresSanteProvider) ?? const CentresSanteFiltre();

  /// Pays / ville côté serveur ; le filtre « publiées » posé à
  /// l'ouverture de l'écran est conservé.
  void _appliquerPaysVille(String? paysId, String? villeId) {
    final actuel = _filtresServeur;
    ref.read(filtresCentresSanteProvider.notifier).state = CentresSanteFiltre(
      paysId: paysId,
      villeId: villeId,
      typeStructure: actuel.typeStructure,
      statutVerification: actuel.statutVerification,
      recherche: actuel.recherche,
    );
  }

  List<CentreSante> _filtrer(List<CentreSante> centres) {
    final query = _query.trim().toLowerCase();
    final liste = centres.where((c) {
      final matchType =
          _selectedType == null || c.typeStructure == _selectedType;
      final matchQuery = query.isEmpty ||
          c.nom.toLowerCase().contains(query) ||
          (c.ville?.nom.toLowerCase().contains(query) ?? false) ||
          (c.pays?.nom.toLowerCase().contains(query) ?? false);
      return matchType && matchQuery;
    }).toList();
    if (_tri == 'nom') {
      liste.sort((a, b) => a.nom.toLowerCase().compareTo(b.nom.toLowerCase()));
    }
    return liste;
  }

  String get _typeLabel => _selectedType?.libelle ?? 'Tous les types';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      extendBody: widget.showBottomNav,
      body: Stack(
        children: [
          _buildBody(context),
          if (widget.showBottomNav)
            Positioned(
              left: 16,
              right: 16,
              bottom: 12 + MediaQuery.paddingOf(context).bottom,
              child: AppBottomNav(
                currentIndex: widget.bottomNavIndex,
                onTap: widget.onBottomNavTap ?? _defaultOnBottomNavTap,
                onRdvPressed: widget.onRdvPressed ?? () {},
              ),
            ),
        ],
      ),
    );
  }

  /// Bascule entre les 3 états d'un [AsyncValue] :
  /// - premier chargement (aucune donnée en mémoire) -> plein écran ;
  /// - erreur sans donnée précédente -> plein écran avec « Réessayer » ;
  /// - sinon (donnée présente, éventuellement en cours de rafraîchissement
  ///   grâce à `AsyncLoading.copyWithPrevious` côté controller) -> liste,
  ///   avec un petit indicateur de rafraîchissement plutôt que de masquer
  ///   la liste déjà connue.
  Widget _buildBody(BuildContext context) {
    final centresAsync = ref.watch(listeCentresSanteControllerProvider);

    if (!centresAsync.hasValue && centresAsync.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (centresAsync.hasError && !centresAsync.hasValue) {
      return _buildErreurPleinEcran(centresAsync.error!);
    }

    final centres = centresAsync.value ?? const <CentreSante>[];
    return RefreshIndicator(
      color: AppColors.b6,
      onRefresh: () =>
          ref.read(listeCentresSanteControllerProvider.notifier).rafraichir(),
      child: _buildContent(
        context,
        centres,
        rafraichissement: centresAsync.isLoading,
      ),
    );
  }

  Widget _buildErreurPleinEcran(Object erreur) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 6, 18, 24),
        children: [
          _buildPageTitle(),
          ApsEmptyState(
            icon: Icons.wifi_off_rounded,
            tone: ApsTone.neutral,
            title: "Annuaire indisponible",
            message: _messageErreur(erreur),
            actionLabel: 'Réessayer',
            onAction: () => ref
                .read(listeCentresSanteControllerProvider.notifier)
                .rafraichir(),
          ),
        ],
      ),
    );
  }

  /// [CentreSanteException] (voir centresante_repository.dart) porte déjà
  /// un message adapté à l'utilisateur ; on ne l'inspecte pas plus finement
  /// ici, la page se contentant d'afficher le message + un bouton
  /// « Réessayer » quel que soit le type d'erreur (réseau, serveur...).
  String _messageErreur(Object erreur) {
    if (erreur is CentreSanteException) return erreur.message;
    return 'Une erreur est survenue. Vérifiez votre connexion et réessayez.';
  }

  Widget _buildContent(
      BuildContext context,
      List<CentreSante> centresBruts, {
        required bool rafraichissement,
      }) {
    final resultats = _filtrer(centresBruts);

    return SafeArea(
      bottom: false,
      child: ListView(
      padding: EdgeInsets.fromLTRB(
          18,
          6,
          18,
          widget.showBottomNav
              ? AppBottomNav.reservedHeight + MediaQuery.paddingOf(context).bottom
              : 24),
      children: [
        _buildPageTitle(),
        _buildSearchField(),
        const SizedBox(height: 12),
        _buildFilterChips(centresBruts),
        if (widget.adBanner != null) ...[
          const SizedBox(height: 16),
          widget.adBanner!,
        ],
        const SizedBox(height: 16),
        ApsInvitationPro(
          question: 'Vous gérez une structure ?',
          libelle: 'Inscrire ma structure',
          icone: Icons.local_hospital_outlined,
          onPressed: () => ouvrirDeclarerCentreSante(context),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: Text(
                '${resultats.length} structure${resultats.length > 1 ? 's' : ''}',
                style: AppTextStyles.xs.copyWith(fontSize: 12),
              ),
            ),
            if (rafraichissement)
              const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
          ],
        ),
        const SizedBox(height: 10),
        if (resultats.isEmpty)
          _buildEmptyState()
        else
          // 5 structures par page, pagination sous la liste.
          ApsListePaginee<CentreSante>(
            elements: resultats,
            cleReinitialisation: Object.hash(
              identityHashCode(centresBruts),
              _selectedType,
              _tri,
              _query,
            ),
            construirePage: (context, page) => _buildList(page),
          ),
      ],
      ),
    );
  }

  Widget _buildPageTitle() {
    final peutRevenir = widget.showAppBar && Navigator.of(context).canPop();
    return ApsTopBar(
      showBack: peutRevenir,
      leading: peutRevenir ? null : const SizedBox.shrink(),
      overline: 'Hôpitaux, cliniques, centres',
      title: 'Structures de santé',
      trailing: const SizedBox(width: 42),
    );
  }

  Widget _buildSearchField() {
    return ApsSearchField(
      controller: _searchController,
      hint: 'Nom, ville, quartier…',
      onChanged: (v) => setState(() => _query = v),
    );
  }

  Widget _buildFilterChips(List<CentreSante> centresBruts) {
    final f = ref.watch(filtresCentresSanteProvider);
    return ApsFilterBar(
      onOpen: _ouvrirFiltres,
      actifs: [
        if (_selectedType != null)
          (
            label: _typeLabel,
            icon: Icons.local_hospital_outlined,
            onRemove: () => setState(() => _selectedType = null),
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
        if (_tri != 'pertinence')
          (
            label: apsLibellesTriAnnuaire[_tri]!,
            icon: Icons.sort_rounded,
            onRemove: () => setState(() => _tri = 'pertinence'),
          ),
      ],
    );
  }

  List<Widget> _buildList(List<CentreSante> resultats) {
    return resultats
        .map(
          (c) => CardStructure(
        nom: c.nom,
        ville: _villePays(c),
        imageUrl: c.imageUrl,
        type: _typeAffichageCarte(c.typeStructure),
        verifiee: c.statutVerification == StatutVerificationStructure.publie,
        onAppeler: () => _appeler(c),
        onItineraire: () => _ouvrirItineraire(c),
        onTap:
        widget.onStructureTap != null ? () => widget.onStructureTap!(c) : null,
      ),
    )
        .toList();
  }

  /// Libellé affiché sous le nom, ex. « Douala · Cameroun ».
  /// `ville`/`pays` peuvent être absents si l'API n'a pas pu les résoudre
  /// (référence orpheline côté données) — on affiche alors un tiret plutôt
  /// que de planter l'affichage.
  String _villePays(CentreSante c) {
    final ville = c.ville?.nom ?? '—';
    final pays = c.pays?.nom ?? '—';
    return '$ville · $pays';
  }

  /// [CardStructure] (composant existant) ne distingue visuellement que
  /// 3 familles de structures (hôpital / clinique / centre de santé),
  /// alors que l'API en expose 5 via [TypeStructure]. On y ramène les
  /// types plus spécifiques (centre médical, dispensaire, laboratoire)
  /// vers « centre de santé » pour le badge/icône de la carte ; le filtre
  /// « type », lui, reste fidèle aux 5 valeurs réelles de l'API.
  ///
  /// TODO(UI) : si `components.dart` évolue pour exposer les 5 valeurs de
  /// [TypeStructure] dans son propre enum, retirer ce mapping et passer
  /// directement `c.typeStructure` à [CardStructure].
  StructureType _typeAffichageCarte(TypeStructure type) {
    switch (type) {
      case TypeStructure.hopital:
        return StructureType.hopital;
      case TypeStructure.clinique:
        return StructureType.clinique;
      case TypeStructure.centreMedical:
      case TypeStructure.dispensaire:
      case TypeStructure.laboratoire:
        return StructureType.centreDeSante;
    }
  }

  Widget _buildEmptyState() {
    return ApsEmptyState(
      icon: Icons.search_off_rounded,
      tone: ApsTone.neutral,
      title: 'Aucun résultat',
      message: 'Aucune structure ne correspond à votre recherche.',
      actionLabel: 'Réinitialiser les filtres',
      onAction: () {
        setState(() {
          _selectedType = null;
          _tri = 'pertinence';
          _query = '';
          _searchController.clear();
        });
        _appliquerPaysVille(null, null);
      },
    );
  }

  // ---------------------------------------------------------------------
  // Sélection des filtres
  // ---------------------------------------------------------------------

  /// Feuille de filtres, sur le modèle de celle des médecins.
  Future<void> _ouvrirFiltres() async {
    final f = _filtresServeur;
    final choix = await showApsFilterSheet<_FiltresCentreSheet>(
      context: context,
      initial: (type: _selectedType, paysId: f.paysId, villeId: f.villeId, tri: _tri),
      reset: (type: null, paysId: null, villeId: null, tri: 'pertinence'),
      builder: (c, maj) => [
        ApsFilterSection(
          title: 'Type de structure',
          child: ApsFilterChoices<TypeStructure?>(
            value: c.type,
            onChanged: (v) => maj((type: v, paysId: c.paysId, villeId: c.villeId, tri: c.tri)),
            options: [
              const ApsFilterOption(null, 'Tous les types'),
              for (final t in TypeStructure.values)
                ApsFilterOption(t, t.libelle, icon: Icons.local_hospital_outlined),
            ],
          ),
        ),
        ApsFiltrePaysVille(
          paysId: c.paysId,
          villeId: c.villeId,
          onChanged: (paysId, villeId) =>
              maj((type: c.type, paysId: paysId, villeId: villeId, tri: c.tri)),
        ),
        ApsFilterSection(
          title: 'Trier par',
          child: ApsFilterChoices<String>(
            value: c.tri,
            onChanged: (v) => maj((type: c.type, paysId: c.paysId, villeId: c.villeId, tri: v)),
            options: [
              for (final e in apsLibellesTriAnnuaire.entries) ApsFilterOption(e.key, e.value),
            ],
          ),
        ),
      ],
    );
    if (choix == null || !mounted) return;
    setState(() {
      _selectedType = choix.type;
      _tri = choix.tri;
    });
    if (choix.paysId != f.paysId || choix.villeId != f.villeId) {
      _appliquerPaysVille(choix.paysId, choix.villeId);
    }
  }

  // ---------------------------------------------------------------------
  // Actions « Appeler » / « Itinéraire »
  // ---------------------------------------------------------------------

  Future<void> _appeler(CentreSante c) async {
    final numero = c.telephone.trim();
    if (numero.isEmpty) {
      _showSnack('Numéro non disponible pour cette structure.');
      return;
    }
    final uri = Uri(scheme: 'tel', path: numero);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      _showSnack("Impossible de lancer l'appel.");
    }
  }

  Future<void> _ouvrirItineraire(CentreSante c) async {
    final geo = c.geolocalisation;
    final Uri uri;
    if (geo != null) {
      uri = Uri.parse(
        'https://www.google.com/maps/search/?api=1&query=${geo.latitude},${geo.longitude}',
      );
    } else {
      final query = Uri.encodeComponent(
        '${c.nom}, ${c.ville?.nom ?? ''}, ${c.pays?.nom ?? ''}',
      );
      uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$query');
    }
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      _showSnack("Impossible d'ouvrir l'itinéraire.");
    }
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

/// Brouillon de la feuille de filtres de [CentreSantePage].
typedef _FiltresCentreSheet = ({
  TypeStructure? type,
  String? paysId,
  String? villeId,
  String tri,
});
