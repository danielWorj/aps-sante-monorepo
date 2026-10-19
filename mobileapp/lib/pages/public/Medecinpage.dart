import '../../components/publicite/slider_publicite.dart';
import '../../models/annonceur_publicite_models.dart' show PagesPublicite;
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:riverpod/riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

// Si votre projet utilise des imports package (ex: package:aps/...),
// remplacez les lignes ci-dessous par les équivalents package:aps/...
import '../../components/components.dart';
import '../../controllers/medecin_controller.dart';
import '../../models/medecin_models.dart';
import '../../utils/mon_espace_navigation.dart';
import 'publicAcceuil.dart';
import 'Assurancepage.dart';
// ⚠️ Chemin à ajuster à l'emplacement réel de Rendezvous.dart dans votre
// arborescence : ce fichier (Medecinpage.dart) importe `components.dart`
// avec 2 niveaux ('../../'), tandis que Rendezvous.dart en utilise 3
// ('../../../') — ils ne sont donc a priori PAS dans le même dossier.
// Exemple si Rendezvous.dart vit dans un sous-dossier `rendezvous/` :
import './utils/Rendezvous.dart';
import '../../components/reputation/avis_publics.dart';
import '../../components/reputation/reputation_ui.dart' show decimalFr;
import '../../repositories/reputation_medecin_repository.dart';

/// Engagements des visiteurs sur la fiche (statistiques du médecin) :
/// envoyés sans attendre, jamais bloquants.
final _reputation = ReputationMedecinRepository();

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
  _reputation.signalerEngagement(medecin.medecinId, 'clic_rdv', token: token);
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

  /// Gère un tap sur la barre de navigation basse : met à jour l'index actif
  /// ET navigue réellement vers l'écran correspondant (0=Accueil,
  /// 1=Médecin [écran courant], 2=Assurance, 3=À propos).
  void _onBottomNavTap(int index) {
    setState(() => _navIndex = index);
    switch (index) {
      case 0: // Accueil
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const PublicAcceuilPage()),
        );
        break;
      case 1: // Médecin — déjà sur cet écran.
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
  Widget build(BuildContext context) {
    final basBarre =
        AppBottomNav.reservedHeight + MediaQuery.paddingOf(context).bottom;
    return Scaffold(
      backgroundColor: AppColors.bg,
      extendBody: true,
      body: Stack(
        children: [
          SafeArea(
            bottom: false,
            child: RefreshIndicator(
              color: AppColors.b6,
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
                    padding: EdgeInsets.fromLTRB(18, 6, 18, basBarre),
                    children: [
                      _buildHeader(),
                      _SearchField(
                        controller: _searchController,
                        hint: 'Médecin, spécialité…',
                        onChanged: _onSearchChanged,
                      ),
                      const SizedBox(height: 12),
                      _buildFilterChips(villes),
                      const SizedBox(height: 12),
                      const _BandeauDemandeRapide(),
                      _buildResultHeader(resultats.length),
                      if (resultats.isEmpty)
                        _buildEmptyState()
                      else
                        for (var i = 0; i < resultats.length; i++) ...[
                          // Publicité de PAGE_MEDECIN glissée après les
                          // deux premiers résultats.
                          if (i == 2) _buildPublicites(),
                          _carte(resultats[i]),
                        ],
                      if (resultats.isNotEmpty && resultats.length <= 2)
                        _buildPublicites(),
                    ],
                  );
                },
              ),
            ),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 12 + MediaQuery.paddingOf(context).bottom,
            child: AppBottomNav(
              currentIndex: _navIndex,
              onTap: _onBottomNavTap,
              onRdvPressed: () {
                // Déjà sur l'annuaire : on remonte en haut de la liste
                // pour choisir un médecin.
                FocusScope.of(context).unfocus();
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _carte(Medecin m) {
    return CardMedecin(
      nom: 'Dr ${m.utilisateur?.prenom ?? ''} ${m.utilisateur?.nom ?? ''}'.trim(),
      specialite: m.specialite?.nom ?? '',
      ville: m.villeExercice?.nom ?? '',
      photoUrl: m.photoUrl,
      prixFcfa: m.tarifIndicatif.round(),
      verifieOrdre: m.estPublie,
      teleconsultation: m.teleconsultationActivee,
      noteMoyenne: m.noteMoyenne,
      nombreAvis: m.nombreAvis,
      // TODO(agenda): brancher la disponibilité du jour dès que le module
      // Agenda/Créneau est exposé sur la fiche Medecin.
      disponibleAujourdhui: false,
      onVoirProfil: () => _voirProfil(m),
      // Abonnement de présence : RDV en ligne fermé par le serveur => pas
      // de bouton.
      onPrendreRdv: m.priseRdvEnLigne ? () => _prendreRendezVous(m) : null,
    );
  }

  /// Carrousel des positions payées de PAGE_MEDECIN + carte « Réserver
  /// cet espace » (voir slider_publicite.dart).
  Widget _buildPublicites() {
    return const Padding(
      padding: EdgeInsets.only(bottom: 12),
      child: SliderPublicite(code: PagesPublicite.medecin),
    );
  }

  Widget _buildHeader() {
    final peutRevenir = Navigator.of(context).canPop();
    return ApsTopBar(
      showBack: peutRevenir,
      leading: peutRevenir ? null : const SizedBox.shrink(),
      title: 'Médecins',
      overline: _selectedVille == 'Toutes les villes' ? 'Toutes les villes' : _selectedVille,
      trailing: widget.onDevenirMedecin != null
          ? ApsIconButton(
              icon: Icons.person_add_alt_rounded,
              tooltip: 'Devenir médecin partenaire',
              onPressed: widget.onDevenirMedecin,
            )
          : const SizedBox(width: 42),
    );
  }

  Widget _buildFilterChips(List<String> villes) {
    return ApsFilterBar(
      onOpen: () => _ouvrirFiltres(villes),
      actifs: [
        if (_selectedVille != 'Toutes les villes')
          (
            label: _selectedVille,
            icon: Icons.location_on_outlined,
            onRemove: () => setState(() => _selectedVille = 'Toutes les villes'),
          ),
        if (_filtreVerifie)
          (
            label: 'Vérifiés',
            icon: Icons.verified_outlined,
            onRemove: () => setState(() => _filtreVerifie = false),
          ),
        if (_filtreTele)
          (
            label: 'Vidéo',
            icon: Icons.videocam_outlined,
            onRemove: () => setState(() => _filtreTele = false),
          ),
      ],
    );
  }

  Future<void> _ouvrirFiltres(List<String> villes) async {
    final choix = await showApsFilterSheet<({String ville, bool verifie, bool tele})>(
      context: context,
      initial: (ville: _selectedVille, verifie: _filtreVerifie, tele: _filtreTele),
      reset: (ville: 'Toutes les villes', verifie: false, tele: false),
      builder: (f, maj) => [
        ApsFilterSection(
          title: 'Ville',
          child: ApsFilterChoices<String>(
            value: f.ville,
            onChanged: (v) => maj((ville: v, verifie: f.verifie, tele: f.tele)),
            options: [
              for (final v in villes)
                ApsFilterOption(v, v,
                    icon: v == 'Toutes les villes' ? null : Icons.location_on_outlined),
            ],
          ),
        ),
        ApsFilterSwitch(
          label: 'Vérifiés uniquement',
          subtitle: 'Profils vérifiés par APS Santé',
          icon: Icons.verified_outlined,
          value: f.verifie,
          onChanged: (v) => maj((ville: f.ville, verifie: v, tele: f.tele)),
        ),
        ApsFilterSwitch(
          label: 'Téléconsultation',
          subtitle: 'Consultation en vidéo possible',
          icon: Icons.videocam_outlined,
          value: f.tele,
          onChanged: (v) => maj((ville: f.ville, verifie: f.verifie, tele: v)),
        ),
      ],
    );
    if (choix == null || !mounted) return;
    setState(() {
      _selectedVille = choix.ville;
      _filtreVerifie = choix.verifie;
      _filtreTele = choix.tele;
    });
  }

  Widget _buildResultHeader(int count) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12, top: 14),
      child: Text.rich(
        TextSpan(children: [
          TextSpan(
            text: count > 1 ? '$count médecins' : '$count médecin',
            style: const TextStyle(color: AppColors.ink, fontWeight: FontWeight.w800),
          ),
          TextSpan(text: count > 1 ? ' trouvés' : ' trouvé'),
        ]),
        style: AppTextStyles.xs.copyWith(fontSize: 12),
      ),
    );
  }

  Widget _buildEmptyState() {
    return ApsEmptyState(
      icon: Icons.search_off_rounded,
      title: 'Aucun résultat',
      message: 'Aucun médecin ne correspond à votre recherche.',
      actionLabel: 'Réinitialiser les filtres',
      onAction: _reinitialiserFiltres,
    );
  }
}

/// État de chargement de l'annuaire (premier fetch, sans données
/// précédentes à afficher).
/// Accès public au RDV aléatoire (« Demande rapide ») au-dessus de
/// l'annuaire : le patient publie spécialité, ville, jour et heure, les
/// médecins disponibles répondent. Connexion demandée au besoin.
class _BandeauDemandeRapide extends StatelessWidget {
  const _BandeauDemandeRapide();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => ouvrirDemandeRapide(context),
          child: Ink(
            decoration: BoxDecoration(
              gradient: AppColors.gradientViolet,
              borderRadius: BorderRadius.circular(14),
            ),
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.campaign_outlined, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Pas de médecin précis ?',
                        style: TextStyle(
                          fontFamily: AppTextStyles.fontSans,
                          fontSize: 14.5,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Publiez une demande rapide : les médecins disponibles vous répondent.',
                        style: TextStyle(
                          fontFamily: AppTextStyles.fontSans,
                          fontSize: 12,
                          height: 1.35,
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withValues(alpha: 0.85),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(Icons.chevron_right_rounded, color: Colors.white),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ChargementAnnuaire extends StatelessWidget {
  const _ChargementAnnuaire();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.only(top: 120),
        child: CircularProgressIndicator(),
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
      padding: const EdgeInsets.only(top: 80),
      children: [
        ApsEmptyState(
          icon: Icons.wifi_off_rounded,
          tone: ApsTone.neutral,
          title: 'Annuaire indisponible',
          message: "Impossible de charger les médecins pour le moment.\n$erreur",
          actionLabel: 'Réessayer',
          onAction: onReessayer,
        ),
      ],
    );
  }
}

/// Fiche praticien — **Voir médecin** (GET /medecins/:id), écran 10.
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

  static String _fcfa(num v) {
    final s = v.round().toString();
    final b = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) b.write(' ');
      b.write(s[i]);
    }
    return b.toString();
  }

  @override
  Widget build(BuildContext context) {
    final medecin = _state.value;
    return Scaffold(
      backgroundColor: AppColors.bg,
      extendBodyBehindAppBar: true,
      bottomNavigationBar: medecin == null
          ? null
          : ApsCtaBar(
              priceLabel: 'Tarif indicatif',
              priceValue: '${_fcfa(medecin.tarifIndicatif)} F',
              child: medecin.priseRdvEnLigne
                  ? ApsButton(
                      label: 'Prendre rendez-vous',
                      onPressed: () => _prendreRendezVous(medecin),
                    )
                  : (medecin.contactTelephone?.isNotEmpty ?? false)
                      ? ApsButton(
                          label: 'Appeler le cabinet',
                          icon: Icons.call_rounded,
                          variant: ApsButtonVariant.dark,
                          onPressed: () {
                            _reputation.signalerEngagement(medecin.medecinId, 'clic_contact', token: widget.token);
                            launchUrl(Uri.parse('tel:${medecin.contactTelephone}'));
                          },
                        )
                      : const ApsButton(
                          label: 'RDV en ligne indisponible',
                          onPressed: null,
                          variant: ApsButtonVariant.ghost,
                        ),
            ),
      body: _state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (erreur, _) => SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18),
                child: ApsTopBar(title: 'Profil du médecin'),
              ),
              Expanded(
                child: Center(
                  child: ApsEmptyState(
                    icon: Icons.error_outline_rounded,
                    tone: ApsTone.neutral,
                    title: 'Profil indisponible',
                    message: '$erreur',
                    actionLabel: 'Réessayer',
                    onAction: _reessayer,
                  ),
                ),
              ),
            ],
          ),
        ),
        data: (medecin) => _ProfilMedecin(medecin: medecin, token: widget.token),
      ),
    );
  }
}

class _ProfilMedecin extends StatelessWidget {
  const _ProfilMedecin({required this.medecin, this.token});
  final Medecin medecin;
  final String? token;

  @override
  Widget build(BuildContext context) {
    final nom =
        'Dr ${medecin.utilisateur?.prenom ?? ''} ${medecin.utilisateur?.nom ?? ''}'.trim();
    final lieu = [medecin.villeExercice?.nom, medecin.paysExercice?.nom]
        .whereType<String>()
        .join(', ');
    final haut = MediaQuery.paddingOf(context).top;

    return Stack(
      children: [
        // Bandeau vert profond (230 px) derrière la carte de profil.
        Container(
          height: 230 + haut,
          decoration: const BoxDecoration(gradient: AppColors.gradientForest),
          child: Align(
            alignment: Alignment.topRight,
            child: Container(
              width: 300,
              height: 200,
              decoration: const BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.topRight,
                  radius: 1,
                  colors: [Color(0x992CC286), Color(0x002CC286)],
                ),
              ),
            ),
          ),
        ),
        ListView(
          padding: EdgeInsets.fromLTRB(18, haut + 6, 18, 24),
          children: [
            ApsTopBar(
              glass: true,
              trailing: (medecin.contactTelephone?.isNotEmpty ?? false)
                  ? ApsIconButton(
                      icon: Icons.call_outlined,
                      glass: true,
                      tooltip: 'Appeler',
                      onPressed: () {
                        _reputation.signalerEngagement(medecin.medecinId, 'clic_contact', token: token);
                        launchUrl(Uri.parse('tel:${medecin.contactTelephone}'));
                      },
                    )
                  : null,
            ),
            const SizedBox(height: 28),
            Container(
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                boxShadow: AppColors.shadowSoft,
              ),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Transform.translate(
                        offset: const Offset(0, -46),
                        child: ApsAvatar(
                          name: nom,
                          photoUrl: medecin.photoUrl,
                          size: 84,
                          border: Border.all(color: Colors.white, width: 4),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            if (medecin.priseRdvEnLigne)
                              const ApsPill('RDV en ligne', dot: true),
                            if (medecin.teleconsultationActivee)
                              const ApsPill('Vidéo',
                                  tone: ApsTone.sky, icon: Icons.videocam_outlined),
                          ],
                        ),
                      ),
                    ],
                  ),
                  Transform.translate(
                    offset: const Offset(0, -30),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(child: Text(nom, style: AppTextStyles.m)),
                            if (medecin.estPublie) ...[
                              const SizedBox(width: 5),
                              const ApsVerified(size: 16),
                            ],
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          [
                            medecin.specialite?.nom,
                            if (medecin.numeroOrdre.isNotEmpty)
                              'Ordre n° ${medecin.numeroOrdre}',
                          ].whereType<String>().join(' · '),
                          style: AppTextStyles.small,
                        ),
                      ],
                    ),
                  ),
                  Transform.translate(
                    offset: const Offset(0, -16),
                    child: IntrinsicHeight(
                      child: Row(
                        children: [
                          medecin.nombreAvis > 0
                              ? _Stat(
                                  valeur: '★ ${decimalFr(medecin.noteMoyenne)}',
                                  libelle: '${medecin.nombreAvis} avis',
                                )
                              : _Stat(
                                  valeur: medecin.estPublie ? 'Vérifié' : '—',
                                  libelle: 'Ordre',
                                ),
                          const VerticalDivider(color: AppColors.line, width: 1),
                          _Stat(
                            valeur: medecin.villeExercice?.nom ?? '—',
                            libelle: 'Ville',
                          ),
                          const VerticalDivider(color: AppColors.line, width: 1),
                          _Stat(
                            valeur: medecin.teleconsultationActivee
                                ? 'Cabinet · Vidéo'
                                : 'Cabinet',
                            libelle: 'Consultation',
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (lieu.isNotEmpty) ...[
              const SizedBox(height: 14),
              ApsCard(
                child: Row(
                  children: [
                    const ApsIconTile(Icons.location_on_outlined, small: true),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text("Lieu d'exercice",
                              style: AppTextStyles.strong.copyWith(fontSize: 13)),
                          Text(lieu, style: AppTextStyles.xs),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (!medecin.priseRdvEnLigne) ...[
              const SizedBox(height: 12),
              ApsNote.text(
                "Ce médecin ne propose pas encore la prise de rendez-vous en ligne.",
                icon: Icons.info_outline_rounded,
                tone: ApsTone.amber,
              ),
            ] else ...[
              const SizedBox(height: 12),
              ApsNote.text(
                "APS conserve les fonds jusqu'à la consultation. Remboursement intégral si le médecin annule.",
                bold: 'Paiement protégé.',
                icon: Icons.verified_user_outlined,
              ),
            ],
            if (medecin.biographie.isNotEmpty) ...[
              const SizedBox(height: 18),
              Text('À propos', style: AppTextStyles.strong.copyWith(fontSize: 13.5)),
              const SizedBox(height: 6),
              Text(medecin.biographie, style: AppTextStyles.small),
            ],
            const SizedBox(height: 20),
            SectionAvisPublics(medecinId: medecin.medecinId, nomMedecin: nom, token: token),
          ],
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.valeur, required this.libelle});
  final String valeur;
  final String libelle;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            valeur,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: AppTextStyles.strong.copyWith(fontSize: 14),
          ),
          Text(libelle, style: AppTextStyles.xs),
        ],
      ),
    );
  }
}

/// Champ de recherche — `.search` de la maquette (56 px).
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
      height: 56,
      padding: const EdgeInsets.only(left: 16, right: 6),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppColors.shadowCard,
      ),
      child: Row(
        children: [
          const Icon(Icons.search_rounded, size: 20, color: AppColors.ink3),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              textInputAction: TextInputAction.search,
              style: AppTextStyles.strong.copyWith(fontSize: 14),
              decoration: InputDecoration(
                hintText: hint,
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
          ValueListenableBuilder<TextEditingValue>(
            valueListenable: controller,
            builder: (context, v, _) => v.text.isEmpty
                ? const SizedBox(width: 10)
                : IconButton(
                    tooltip: 'Effacer',
                    icon: const Icon(Icons.cancel_rounded, size: 20, color: AppColors.ink4),
                    onPressed: () {
                      controller.clear();
                      onChanged('');
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
