import 'dart:async';

import 'package:flutter/material.dart';
import 'package:riverpod/riverpod.dart';

// Si votre projet utilise des imports package (ex: package:aps/...),
// remplacez les lignes ci-dessous par les équivalents package:aps/...
import '../../components/components.dart';
import '../../controllers/medecin_controller.dart';
import '../../models/medecin_models.dart';
// ⚠️ Chemin à ajuster à l'emplacement réel de Rendezvous.dart dans votre
// arborescence : ce fichier (Medecinpage.dart) importe `components.dart`
// avec 2 niveaux ('../../'), tandis que Rendezvous.dart en utilise 3
// ('../../../') — ils ne sont donc a priori PAS dans le même dossier.
// Exemple si Rendezvous.dart vit dans un sous-dossier `rendezvous/` :
import './utils/Rendezvous.dart';

/// Container Riverpod utilisé par ce module.
///
/// ⚠️ `medecin_controller.dart` importe `package:riverpod/riverpod.dart`
/// (le cœur de Riverpod, indépendant de Flutter) et NON
/// `package:flutter_riverpod/flutter_riverpod.dart` — il n'y a donc pas
/// de `ProviderScope` / `ConsumerWidget` / `WidgetRef` disponibles dans
/// ce projet. Cet écran s'appuie à la place sur un [ProviderContainer]
/// explicite, écouté manuellement via `container.listen(...)`.
///
/// Idéalement, ce container est UNIQUE pour toute l'app (créé une seule
/// fois au démarrage, ex: dans `main.dart`, et transmis explicitement
/// aux écrans qui en ont besoin) plutôt que redéclaré ici. Si un tel
/// singleton existe déjà ailleurs dans le projet, SUPPRIMER cette
/// déclaration et passer l'instance existante via [MedecinPage.container]
/// à la place — la valeur ci-dessous ne sert que de repli pour que ce
/// fichier compile de façon autonome.
final ProviderContainer medecinProviderContainer = ProviderContainer();

/// Pousse [RendezVousPage] pour [medecin], liée à son vrai `medecin_id`
/// (jamais un autre) — comportement par défaut de « Prendre rendez-vous »
/// tant qu'aucun [MedecinPage.onPrendreRendezVous] n'est fourni par l'app
/// hôte.
///
/// Réutilise le même [ProviderContainer] que l'annuaire (partage
/// l'[ApiClient]) et transmet [token] tel quel : ce n'est PAS forcément un
/// token patient (voir la doc de [MedecinPage.token], qui sert avant tout
/// à la vue enrichie admin/superadmin) — si l'utilisateur connecté n'est
/// pas un patient, la réservation échouera côté backend avec une
/// [ApiException] (403), affichée telle quelle par [RendezVousPage].
void _pousserRendezVous(
    BuildContext context, {
      required ProviderContainer container,
      required String? token,
      required Medecin medecin,
    }) {
  Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => RendezVousPage(
        container: container,
        token: token,
        medecinId: medecin.medecinId,
        medecinNom:
        '${medecin.utilisateur?.prenom ?? ''} ${medecin.utilisateur?.nom ?? ''}'
            .trim(),
        medecinSpecialite: medecin.specialite?.nom ?? '',
        medecinVille: medecin.villeExercice?.nom,
        tarifFcfa: medecin.tarifIndicatif.round(),
        teleconsultationDisponible: medecin.teleconsultationActivee,
      ),
    ),
  );
}

/// Page publique — **Annuaire des médecins**.
///
/// Reproduit l'écran « Rechercher un médecin » de la maquette
/// `ui-mobile.html` (device n°2) : en-tête, champ de recherche, puces de
/// filtre (ville, vérification ONMC, télé-consultation), liste de
/// [CardMedecin] et barre de navigation basse flottante.
///
/// Consomme les vraies APIs exposées par `medecin_controller.dart` :
///   - **Annuaire** : GET /medecins via [listeMedecinsControllerProvider],
///     piloté par [filtresMedecinsProvider] (recherche texte envoyée au
///     backend ; ville et téléconsultation restent filtrées côté client
///     faute d'un référentiel villes dédié branché ici).
///   - **Voir médecin** : GET /medecins/:id via [medecinParIdProvider],
///     affiché dans [_MedecinDetailPage] au tap sur « Voir le profil ».
///   - **Candidature (création)** : POST /medecins via
///     [creationMedecinControllerProvider] — le formulaire complet
///     (upload CNI/attestation/photo) est un écran à part entière
///     ([onDevenirMedecin]) ; ce fichier ne fait qu'exposer le point
///     d'entrée.
///   - **Prendre rendez-vous** : pousse par défaut [RendezVousPage]
///     (`Rendezvous.dart`), réellement liée au [Medecin] tapé (son vrai
///     `medecin_id`, sa téléconsultation, son tarif) — voir
///     [_pousserRendezVous]. Le callback [onPrendreRendezVous] reste
///     disponible pour que l'app hôte substitue son propre écran si
///     besoin (ex: routing nommé plutôt que `Navigator.push` direct).
///
/// Écran consultable sans compte, comme le reste de l'annuaire public de
/// l'application (médecins, structures, pharmacies, assurances). Si un
/// [token] est fourni (utilisateur admin/superadmin connecté), la liste
/// bénéficie de la vue enrichie (email/téléphone) exposée par l'API.
class MedecinPage extends StatefulWidget {
  const MedecinPage({
    super.key,
    this.container,
    this.token,
    this.onDevenirMedecin,
    this.onPrendreRendezVous,
  });

  /// Container Riverpod à utiliser. Si `null`, replie sur
  /// [medecinProviderContainer] — à remplacer par le container global
  /// de l'app dès qu'il existe (voir la note sur cette variable).
  final ProviderContainer? container;

  /// Token de session optionnel (vue enrichie admin/superadmin).
  final String? token;

  /// Navigation vers l'écran de candidature médecin (POST /medecins).
  /// Laissé injectable car le formulaire (upload CNI/attestation/photo)
  /// est un écran dédié, hors périmètre de ce fichier.
  final VoidCallback? onDevenirMedecin;

  /// Personnalise la navigation vers la prise de rendez-vous. Optionnel :
  /// si `null`, [MedecinPage] pousse déjà [RendezVousPage] elle-même (voir
  /// [_pousserRendezVous]) — ne fournir ce callback que pour substituer un
  /// autre écran/une autre navigation (ex: routing nommé).
  final ValueChanged<Medecin>? onPrendreRendezVous;

  @override
  State<MedecinPage> createState() => _MedecinPageState();
}

class _MedecinPageState extends State<MedecinPage> {
  final TextEditingController _searchController = TextEditingController();
  Timer? _debounce;

  late final ProviderContainer _container =
      widget.container ?? medecinProviderContainer;

  late ProviderSubscription<AsyncValue<List<Medecin>>> _medecinsSub;
  AsyncValue<List<Medecin>> _medecinsState = const AsyncLoading();

  /// Index de la rubrique active dans [AppBottomNav] (1 = Médecin).
  int _navIndex = 1;

  // Filtres appliqués côté client sur les résultats déjà renvoyés par
  // l'API (la recherche texte, elle, est envoyée au backend — voir
  // _onSearchChanged).
  String _selectedVille = 'Toutes les villes';
  bool _filtreVerifie = false;
  bool _filtreTele = false;

  @override
  void initState() {
    super.initState();
    // S'abonne manuellement au provider (pas de ConsumerWidget
    // disponible sans flutter_riverpod) : chaque changement d'état
    // déclenche un setState avec la nouvelle AsyncValue.
    _medecinsSub = _container.listen<AsyncValue<List<Medecin>>>(
      listeMedecinsControllerProvider,
          (previous, next) => setState(() => _medecinsState = next),
      fireImmediately: true,
    );

    // Active la vue enrichie (email/téléphone) si un token est fourni.
    if (widget.token != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _container
            .read(listeMedecinsControllerProvider.notifier)
            .definirToken(widget.token);
      });
    }
  }

  @override
  void dispose() {
    _medecinsSub.close();
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  /// Débounce la recherche texte avant de mettre à jour
  /// [filtresMedecinsProvider], qui déclenche automatiquement un
  /// rechargement de [listeMedecinsControllerProvider] (GET /medecins).
  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      final actuel =
          _container.read(filtresMedecinsProvider) ?? const MedecinFiltres();
      _container.read(filtresMedecinsProvider.notifier).state =
          actuel.copyWith(recherche: value.trim());
    });
  }

  void _reinitialiserFiltres() {
    _debounce?.cancel();
    _searchController.clear();
    setState(() {
      _selectedVille = 'Toutes les villes';
      _filtreVerifie = false;
      _filtreTele = false;
    });
    _container.read(filtresMedecinsProvider.notifier).state = null;
  }

  /// Villes disponibles pour le filtre, déduites des résultats
  /// actuellement chargés (pas de référentiel villes public branché ici
  /// — voir referentiel_models.dart pour un futur module dédié).
  List<String> _villesDepuis(List<Medecin> medecins) {
    final villes = medecins
        .map((m) => m.villeExercice?.nom)
        .whereType<String>()
        .toSet()
        .toList()
      ..sort();
    return ['Toutes les villes', ...villes];
  }

  /// Applique les filtres client (ville, téléconsultation, vérification
  /// ONMC) sur les résultats déjà remontés par l'API.
  List<Medecin> _filtrer(List<Medecin> medecins) {
    return medecins.where((m) {
      final matchVille = _selectedVille == 'Toutes les villes' ||
          m.villeExercice?.nom == _selectedVille;
      final matchTele = !_filtreTele || m.teleconsultationActivee;
      final matchVerifie = !_filtreVerifie || m.estPublie;
      return matchVille && matchTele && matchVerifie;
    }).toList();
  }

  void _voirProfil(Medecin medecin) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _MedecinDetailPage(
          container: _container,
          medecinId: medecin.medecinId,
          token: widget.token,
          onPrendreRendezVous: widget.onPrendreRendezVous,
        ),
      ),
    );
  }

  void _prendreRendezVous(Medecin medecin) {
    if (widget.onPrendreRendezVous != null) {
      widget.onPrendreRendezVous!(medecin);
      return;
    }
    _pousserRendezVous(context, container: _container, token: widget.token, medecin: medecin);
  }

  Future<void> _rafraichir() {
    return _container
        .read(listeMedecinsControllerProvider.notifier)
        .rafraichir();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      extendBody: true,
      body: Stack(
        children: [
          SafeArea(
            bottom: false,
            child: RefreshIndicator(
              onRefresh: _rafraichir,
              child: _medecinsState.when(
                loading: () => const _ChargementAnnuaire(),
                error: (erreur, _) => _ErreurAnnuaire(
                  erreur: erreur,
                  onReessayer: _rafraichir,
                ),
                data: (medecins) {
                  final resultats = _filtrer(medecins);
                  final villes = _villesDepuis(medecins);
                  if (_selectedVille != 'Toutes les villes' &&
                      !villes.contains(_selectedVille)) {
                    villes.add(_selectedVille);
                  }

                  return ListView(
                    // Padding bas augmenté pour ne pas passer sous la
                    // barre flottante.
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
                    children: [
                      _buildHeader(),
                      const SizedBox(height: 2),
                      _SearchField(
                        controller: _searchController,
                        hint: 'Rechercher un médecin, une spécialité…',
                        onChanged: _onSearchChanged,
                      ),
                      const SizedBox(height: 4),
                      _buildFilterChips(villes),
                      const SizedBox(height: 4),
                      _buildResultHeader(resultats.length),
                      if (resultats.isEmpty)
                        _buildEmptyState()
                      else
                        ...resultats.map(
                              (m) => CardMedecin(
                            nom: '${m.utilisateur?.prenom ?? ''} '
                                '${m.utilisateur?.nom ?? ''}'
                                .trim(),
                            specialite: m.specialite?.nom ?? '',
                            ville: m.villeExercice?.nom ?? '',
                            photoUrl: m.photoUrl,
                            prixFcfa: m.tarifIndicatif.round(),
                            verifieOrdre: m.estPublie,
                            teleconsultation: m.teleconsultationActivee,
                            // TODO(agenda): brancher la disponibilité du
                            // jour dès que le module Agenda/Créneau est
                            // exposé côté API — non disponible sur la
                            // fiche Medecin elle-même.
                            disponibleAujourdhui: false,
                            onVoirProfil: () => _voirProfil(m),
                            onPrendreRdv: () => _prendreRendezVous(m),
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ),
          Positioned(
            left: 10,
            right: 10,
            bottom: 10,
            child: AppBottomNav(
              currentIndex: _navIndex,
              onTap: (i) => setState(() => _navIndex = i),
              onRdvPressed: () {
                // TODO(nav): brancher la navigation vers la prise de
                // rendez-vous générale (sans médecin présélectionné).
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 14, 2, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'ANNUAIRE',
                style: TextStyle(
                  fontFamily: AppTextStyles.fontDisplay,
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                  color: AppColors.green700,
                ),
              ),
              if (widget.onDevenirMedecin != null)
                GestureDetector(
                  onTap: widget.onDevenirMedecin,
                  child: const Text(
                    'Devenir médecin partenaire →',
                    style: TextStyle(
                      fontFamily: AppTextStyles.fontDisplay,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      color: AppColors.green700,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          const Text('Médecins & professionnels', style: AppTextStyles.h3),
          const SizedBox(height: 4),
          const Text(
            "Douala, Yaoundé et au-delà — filtrez par spécialité et disponibilité.",
            style: AppTextStyles.body,
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChips(List<String> villes) {
    return SizedBox(
      height: 34,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          for (final ville in villes) ...[
            _FilterChip(
              label: ville,
              icon: Icons.location_on_outlined,
              active: _selectedVille == ville,
              onTap: () => setState(() => _selectedVille = ville),
            ),
            const SizedBox(width: 8),
          ],
          _FilterChip(
            label: 'Vérifiés ONMC',
            icon: Icons.verified_outlined,
            active: _filtreVerifie,
            onTap: () => setState(() => _filtreVerifie = !_filtreVerifie),
          ),
          const SizedBox(width: 8),
          _FilterChip(
            label: 'Téléconsultation',
            icon: Icons.videocam_outlined,
            active: _filtreTele,
            onTap: () => setState(() => _filtreTele = !_filtreTele),
          ),
        ],
      ),
    );
  }

  Widget _buildResultHeader(int count) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12, top: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            count > 1
                ? '$count professionnels trouvés'
                : '$count professionnel trouvé',
            style: AppTextStyles.cardMeta
                .copyWith(fontWeight: FontWeight.w600, color: AppColors.inkSoft),
          ),
          GestureDetector(
            onTap: () {
              // TODO(ui): ouvrir un panneau de tri (ex: bottom sheet "Trier par...").
            },
            child: const Text(
              'Trier ▾',
              style: TextStyle(
                fontFamily: AppTextStyles.fontDisplay,
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.green700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        children: [
          const Icon(Icons.search_off_rounded, size: 34, color: AppColors.inkFaint),
          const SizedBox(height: 10),
          const Text(
            'Aucun médecin ne correspond à votre recherche.',
            textAlign: TextAlign.center,
            style: AppTextStyles.body,
          ),
          const SizedBox(height: 14),
          AppOutlineButton(
            label: 'Réinitialiser les filtres',
            onPressed: _reinitialiserFiltres,
          ),
        ],
      ),
    );
  }
}

/// État de chargement de l'annuaire (premier fetch, sans données
/// précédentes à afficher).
class _ChargementAnnuaire extends StatelessWidget {
  const _ChargementAnnuaire();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.only(top: 120),
        child: CircularProgressIndicator(color: AppColors.green700),
      ),
    );
  }
}

/// État d'erreur de l'annuaire (ex: réseau indisponible), avec action de
/// nouvelle tentative.
class _ErreurAnnuaire extends StatelessWidget {
  const _ErreurAnnuaire({required this.erreur, required this.onReessayer});

  final Object erreur;
  final Future<void> Function() onReessayer;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 120),
      children: [
        const Icon(Icons.wifi_off_rounded, size: 34, color: AppColors.inkFaint),
        const SizedBox(height: 10),
        const Text(
          "Impossible de charger l'annuaire des médecins pour le moment.",
          textAlign: TextAlign.center,
          style: AppTextStyles.body,
        ),
        const SizedBox(height: 4),
        Text(
          erreur.toString(),
          textAlign: TextAlign.center,
          style: AppTextStyles.cardMeta.copyWith(color: AppColors.inkFaint),
        ),
        const SizedBox(height: 14),
        Center(
          child: AppOutlineButton(
            label: 'Réessayer',
            onPressed: onReessayer,
          ),
        ),
      ],
    );
  }
}

/// Fiche détaillée d'un médecin — **Voir médecin** (GET /medecins/:id).
///
/// Poussée depuis [MedecinPage] au tap sur « Voir le profil ». S'abonne
/// manuellement à [medecinParIdProvider] via le même [ProviderContainer]
/// que la page parente (transmis explicitement, faute de
/// `ProviderScope`) et se désabonne à la fermeture de l'écran — miroir
/// du comportement `autoDispose` du provider.
class _MedecinDetailPage extends StatefulWidget {
  const _MedecinDetailPage({
    required this.container,
    required this.medecinId,
    required this.token,
    required this.onPrendreRendezVous,
  });

  final ProviderContainer container;
  final String medecinId;
  final String? token;
  final ValueChanged<Medecin>? onPrendreRendezVous;

  @override
  State<_MedecinDetailPage> createState() => _MedecinDetailPageState();
}

class _MedecinDetailPageState extends State<_MedecinDetailPage> {
  late final _provider =
  medecinParIdProvider((id: widget.medecinId, token: widget.token));
  late ProviderSubscription<AsyncValue<Medecin>> _sub;
  AsyncValue<Medecin> _state = const AsyncLoading();

  @override
  void initState() {
    super.initState();
    _sub = widget.container.listen<AsyncValue<Medecin>>(
      _provider,
          (previous, next) => setState(() => _state = next),
      fireImmediately: true,
    );
  }

  @override
  void dispose() {
    _sub.close();
    super.dispose();
  }

  void _reessayer() {
    widget.container.invalidate(_provider);
  }

  void _prendreRendezVous(Medecin medecin) {
    if (widget.onPrendreRendezVous != null) {
      widget.onPrendreRendezVous!(medecin);
      return;
    }
    _pousserRendezVous(
      context,
      container: widget.container,
      token: widget.token,
      medecin: medecin,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(
        backgroundColor: AppColors.paper,
        elevation: 0,
        foregroundColor: AppColors.ink,
        title: const Text('Profil du médecin'),
      ),
      body: _state.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.green700),
        ),
        error: (erreur, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline_rounded,
                    size: 34, color: AppColors.inkFaint),
                const SizedBox(height: 10),
                Text(
                  "Impossible de charger ce profil.\n$erreur",
                  textAlign: TextAlign.center,
                  style: AppTextStyles.body,
                ),
                const SizedBox(height: 14),
                AppOutlineButton(label: 'Réessayer', onPressed: _reessayer),
              ],
            ),
          ),
        ),
        data: (medecin) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            Text(
              '${medecin.utilisateur?.prenom ?? ''} ${medecin.utilisateur?.nom ?? ''}'
                  .trim(),
              style: AppTextStyles.h3,
            ),
            const SizedBox(height: 4),
            Text(
              medecin.specialite?.nom ?? '',
              style: AppTextStyles.body.copyWith(color: AppColors.green700),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (medecin.estPublie)
                  const _Badge(label: 'Vérifié ONMC', icon: Icons.verified_outlined),
                if (medecin.teleconsultationActivee)
                  const _Badge(
                      label: 'Téléconsultation', icon: Icons.videocam_outlined),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              '${medecin.villeExercice?.nom ?? ''}'
                  '${medecin.paysExercice?.nom != null ? ', ${medecin.paysExercice!.nom}' : ''}',
              style: AppTextStyles.body,
            ),
            const SizedBox(height: 4),
            Text(
              '${medecin.tarifIndicatif.round()} FCFA (tarif indicatif)',
              style: AppTextStyles.body,
            ),
            const SizedBox(height: 16),
            if (medecin.biographie.isNotEmpty) ...[
              const Text('À propos', style: AppTextStyles.h3),
              const SizedBox(height: 6),
              Text(medecin.biographie, style: AppTextStyles.body),
              const SizedBox(height: 20),
            ],
            AppOutlineButton(
              label: 'Prendre rendez-vous',
              onPressed: () => _prendreRendezVous(medecin),
            ),
          ],
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.icon});

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.green700,
        borderRadius: BorderRadius.circular(100),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: Colors.white),
          const SizedBox(width: 6),
          Text(
            label,
            style: AppTextStyles.badge.copyWith(fontSize: 12, color: Colors.white),
          ),
        ],
      ),
    );
  }
}

/// Champ de recherche — `.search-field` de la maquette.
class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.hint,
    required this.onChanged,
  });

  final TextEditingController controller;
  final String hint;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.line),
        borderRadius: AppRadius.smRadius,
      ),
      child: Row(
        children: [
          const Icon(Icons.search_rounded, size: 18, color: AppColors.inkFaint),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              style: AppTextStyles.body.copyWith(
                fontSize: 13,
                color: AppColors.ink,
                height: 1,
              ),
              decoration: InputDecoration(
                hintText: hint,
                hintStyle: AppTextStyles.body.copyWith(fontSize: 13),
                border: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 13),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Puce de filtre — `.chip` / `.chip.active` de la maquette.
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
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(100),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
        decoration: BoxDecoration(
          color: active ? AppColors.green700 : AppColors.card,
          border: Border.all(
            color: active ? AppColors.green700 : AppColors.lineStrong,
          ),
          borderRadius: BorderRadius.circular(100),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 13, color: active ? Colors.white : AppColors.inkSoft),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: AppTextStyles.badge.copyWith(
                fontSize: 12,
                color: active ? Colors.white : AppColors.inkSoft,
              ),
            ),
          ],
        ),
      ),
    );
  }
}