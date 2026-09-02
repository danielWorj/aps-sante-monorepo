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
  String? _selectedVilleId; // null = « Toutes les villes »

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
      case 3: // À propos — aucun écran fourni pour l'instant.
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Écran « À propos » bientôt disponible.')),
        );
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

  /// Villes disponibles pour le filtre, dérivées de la liste actuellement
  /// chargée (déjà limitée aux fiches publiées côté serveur). Clé =
  /// `ville_id` réel (fiable, contrairement à un nom qui peut se répéter
  /// entre pays) ; valeur = libellé affiché.
  Map<String, String> _villesDisponibles(List<CentreSante> centres) {
    final villes = <String, String>{};
    for (final c in centres) {
      final ville = c.ville;
      if (ville != null) villes[ville.villeId] = ville.nom;
    }
    return villes;
  }

  List<CentreSante> _filtrer(List<CentreSante> centres) {
    final query = _query.trim().toLowerCase();
    return centres.where((c) {
      final matchType =
          _selectedType == null || c.typeStructure == _selectedType;
      final matchVille =
          _selectedVilleId == null || c.villeId == _selectedVilleId;
      final matchQuery = query.isEmpty ||
          c.nom.toLowerCase().contains(query) ||
          (c.ville?.nom.toLowerCase().contains(query) ?? false) ||
          (c.pays?.nom.toLowerCase().contains(query) ?? false);
      return matchType && matchVille && matchQuery;
    }).toList();
  }

  String get _typeLabel => _selectedType?.libelle ?? 'Tous les types';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      extendBody: widget.showBottomNav,
      appBar: widget.showAppBar
          ? AppBar(
        backgroundColor: AppColors.paper,
        elevation: 0,
        foregroundColor: AppColors.ink,
        centerTitle: false,
        titleSpacing: 0,
      )
          : null,
      body: Stack(
        children: [
          _buildBody(context),
          if (widget.showBottomNav)
            Positioned(
              left: 10,
              right: 10,
              bottom: 10,
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
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 24),
      children: [
        _buildPageTitle(),
        const SizedBox(height: 20),
        AppAlert(
          type: AppAlertType.secondary,
          title: "Impossible de charger l'annuaire",
          message: _messageErreur(erreur),
        ),
        const SizedBox(height: 12),
        AppOutlineButton(
          label: 'Réessayer',
          icon: Icons.refresh,
          expanded: true,
          onPressed: () => ref
              .read(listeCentresSanteControllerProvider.notifier)
              .rafraichir(),
        ),
      ],
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

    return ListView(
      padding: EdgeInsets.fromLTRB(
          16, widget.showAppBar ? 0 : 16, 16, widget.showBottomNav ? 110 : 24),
      children: [
        _buildPageTitle(),
        const SizedBox(height: 14),
        _buildSearchField(),
        const SizedBox(height: 14),
        _buildFilterChips(centresBruts),
        if (widget.adBanner != null) ...[
          const SizedBox(height: 16),
          widget.adBanner!,
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: Text(
                '${resultats.length} structure${resultats.length > 1 ? 's' : ''} trouvée${resultats.length > 1 ? 's' : ''}',
                style: AppTextStyles.cardMeta
                    .copyWith(fontWeight: FontWeight.w600, color: AppColors.inkSoft),
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
        if (resultats.isEmpty) _buildEmptyState() else ..._buildList(resultats),
      ],
    );
  }

  Widget _buildPageTitle() {
    return Padding(
      padding: const EdgeInsets.only(top: 14, bottom: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'ANNUAIRE',
            style: AppTextStyles.badge.copyWith(
              fontSize: 10.5,
              letterSpacing: 1.2,
              color: AppColors.green700,
            ),
          ),
          const SizedBox(height: 6),
          const Text('Trouver une structure de santé', style: AppTextStyles.h3),
          const SizedBox(height: 4),
          Text(
            'Hôpitaux, cliniques et centres de santé avec coordonnées, appel direct et itinéraire.',
            style: AppTextStyles.body,
          ),
        ],
      ),
    );
  }

  Widget _buildSearchField() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.lineStrong),
        borderRadius: BorderRadius.circular(100),
      ),
      child: Row(
        children: [
          const Icon(Icons.search, size: 18, color: AppColors.inkFaint),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: _searchController,
              onChanged: (v) => setState(() => _query = v),
              textInputAction: TextInputAction.search,
              style: AppTextStyles.body.copyWith(color: AppColors.ink, fontSize: 13),
              decoration: const InputDecoration(
                isCollapsed: true,
                border: InputBorder.none,
                hintText: 'Nom, ville, quartier…',
                hintStyle: TextStyle(color: AppColors.inkFaint),
              ),
            ),
          ),
          if (_query.isNotEmpty)
            GestureDetector(
              onTap: () => setState(() {
                _query = '';
                _searchController.clear();
              }),
              child: const Padding(
                padding: EdgeInsets.symmetric(vertical: 12, horizontal: 2),
                child: Icon(Icons.close, size: 16, color: AppColors.inkFaint),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildFilterChips(List<CentreSante> centresBruts) {
    final villesDisponibles = _villesDisponibles(centresBruts);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _FilterChip(
            label: _typeLabel,
            active: true,
            icon: Icons.local_hospital_outlined,
            onTap: _pickType,
          ),
          const SizedBox(width: 8),
          _FilterChip(
            label: _selectedVilleId == null
                ? 'Toutes les villes'
                : (villesDisponibles[_selectedVilleId!] ?? 'Toutes les villes'),
            active: _selectedVilleId != null,
            icon: Icons.location_on_outlined,
            onTap: () => _pickVille(centresBruts),
          ),
          if (_selectedType != null || _selectedVilleId != null) ...[
            const SizedBox(width: 8),
            _FilterChip(
              label: 'Réinitialiser',
              active: false,
              icon: Icons.refresh,
              onTap: () => setState(() {
                _selectedType = null;
                _selectedVilleId = null;
              }),
            ),
          ],
        ],
      ),
    );
  }

  List<Widget> _buildList(List<CentreSante> resultats) {
    return resultats
        .map(
          (c) => CardStructure(
        nom: c.nom,
        ville: _villePays(c),
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
    return Column(
      children: [
        const AppAlert(
          type: AppAlertType.secondary,
          title: 'Aucun résultat',
          message:
          'Aucune structure ne correspond à votre recherche. Essayez un autre type ou une autre ville.',
        ),
        const SizedBox(height: 12),
        AppOutlineButton(
          label: 'Réinitialiser les filtres',
          icon: Icons.refresh,
          expanded: true,
          onPressed: () => setState(() {
            _selectedType = null;
            _selectedVilleId = null;
            _query = '';
            _searchController.clear();
          }),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------
  // Sélection des filtres
  // ---------------------------------------------------------------------

  Future<void> _pickType() async {
    final options = <TypeStructure?>[null, ...TypeStructure.values];
    final labels = <String>[
      'Tous les types',
      ...TypeStructure.values.map((t) => t.libelle),
    ];

    final selected = await showModalBottomSheet<_Sentinel<TypeStructure?>>(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: ListView.builder(
          shrinkWrap: true,
          itemCount: options.length,
          itemBuilder: (ctx, i) {
            final value = options[i];
            return ListTile(
              title: Text(labels[i],
                  style: AppTextStyles.body.copyWith(color: AppColors.ink, fontSize: 13.5)),
              trailing:
              _selectedType == value ? const Icon(Icons.check, color: AppColors.primary) : null,
              onTap: () => Navigator.pop(ctx, _Sentinel(value)),
            );
          },
        ),
      ),
    );

    if (selected != null) {
      setState(() => _selectedType = selected.value);
    }
  }

  Future<void> _pickVille(List<CentreSante> centresBruts) async {
    final villesMap = _villesDisponibles(centresBruts);
    final entries = villesMap.entries.toList()
      ..sort((a, b) => a.value.compareTo(b.value));
    final ids = <String?>[null, ...entries.map((e) => e.key)];
    final labels = <String>['Toutes les villes', ...entries.map((e) => e.value)];

    final selected = await showModalBottomSheet<_Sentinel<String?>>(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: ListView.builder(
          shrinkWrap: true,
          itemCount: ids.length,
          itemBuilder: (ctx, i) {
            final value = ids[i];
            return ListTile(
              title: Text(labels[i],
                  style: AppTextStyles.body.copyWith(color: AppColors.ink, fontSize: 13.5)),
              trailing: _selectedVilleId == value
                  ? const Icon(Icons.check, color: AppColors.primary)
                  : null,
              onTap: () => Navigator.pop(ctx, _Sentinel(value)),
            );
          },
        ),
      ),
    );

    if (selected != null) {
      setState(() => _selectedVilleId = selected.value);
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

/// Petit wrapper pour distinguer « aucune sélection » (bottom sheet fermée
/// sans choix) de « sélection explicite de null » (ex : « Toutes les villes »).
class _Sentinel<T> {
  const _Sentinel(this.value);
  final T value;
}

/// Puce de filtre — `.chip` / `.chip.active` de la maquette.
///
/// Distincte de [BadgeChip] (qui sert d'étiquette statique sur les cartes) :
/// celle-ci est un contrôle tappable ouvrant un sélecteur (type, ville…).
class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.active,
    required this.onTap,
    this.icon,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final fg = active ? Colors.white : AppColors.inkSoft;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(100),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
        decoration: BoxDecoration(
          color: active ? AppColors.primary : AppColors.card,
          border: Border.all(color: active ? AppColors.primary : AppColors.lineStrong),
          borderRadius: BorderRadius.circular(100),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 13, color: fg),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: AppTextStyles.buttonLabel.copyWith(fontSize: 12, color: fg),
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}