// lib/screens/pharmacie_page.dart
//
// Écran « Annuaire des pharmacies » — connecté aux VRAIES APIs du module
// pharmacie via lib/controllers/pharmacie_controller.dart (Riverpod) :
//   - listePharmaciesControllerProvider / filtresPharmaciesProvider
//     -> GET /pharmacies (recherche serveur, statut_verification)
//   - listeGardesPharmacieControllerProvider / filtresGardesPharmacieProvider
//     -> GET /gardes-pharmacie?date=<maintenant> : c'est CE sous-module qui
//        détermine quelles pharmacies sont "de garde" en ce moment, la fiche
//        Pharmacie elle-même n'a pas de champ "de garde".
//
// Composants réutilisés tels quels, SANS duplication de leur style/logique :
//   - AppColors, AppTextStyles, AppRadius   (style/)
//   - CardSurface, BadgeChip, GuardDot      (cards/badge_chip.dart)
//   - CardPharmacie                         (cards/card_pharmacie.dart)
//   - CallButton, ItineraryButton           (buttons/)
//   - PrimaryButton / SecondaryButton       (buttons/app_buttons.dart)
//   - AppAlert                              (alert/app_alert.dart)
//   - AppBottomNav                          (navigation/app_bottom_nav.dart)
//
// ⚠️ Adaptez les imports ci-dessous au nom réel de votre package si besoin :

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/pharmacie_controller.dart';
import '../../models/pharmacie_models.dart';
import '../../utils/mon_espace_navigation.dart';
import 'publicAcceuil.dart';
import 'Assurancepage.dart';

/// `AsyncValue.valueOrNull` n'existe qu'à partir de riverpod 2.3.0 ; la
/// version résolue par ce projet (voir l'import direct de
/// `package:riverpod/riverpod.dart` dans pharmacie_controller.dart) ne
/// l'expose pas encore. On repasse donc par `maybeWhen`, disponible dans
/// toutes les versions, pour récupérer la dernière donnée connue sans
/// planter à la compilation.
extension _AsyncValueSansValueOrNull<T> on AsyncValue<T> {
  T? get donneeOuNull => maybeWhen(orElse: () => null, data: (d) => d);
}

/// ============================= PAGE =============================
class PharmaciePage extends ConsumerStatefulWidget {
  const PharmaciePage({super.key});

  @override
  ConsumerState<PharmaciePage> createState() => _PharmaciePageState();
}

class _PharmaciePageState extends ConsumerState<PharmaciePage> {
  /// État d'affichage local du chip "De garde uniquement". Le filtrage
  /// réel se fait côté client sur le résultat de
  /// [listeGardesPharmacieControllerProvider] (voir [_filtrer]).
  bool _deGardeUniquement = false;

  /// Filtre ville : appliqué côté client sur `pharmacie.ville?.nom`, faute
  /// d'un référentiel des villes (avec leur `ville_id`) disponible ici.
  /// ⚠️ Si un provider de référentiel (ex: `villesProvider`) existe déjà
  /// ailleurs dans l'app, préférez-le pour filtrer via `villeId` côté
  /// serveur (paramètre `villeId` de [PharmaciesFiltre]).
  String _villeSelectionnee = 'Toutes les villes';

  int _navIndex = 1; // "Pharmacies" actif
  final _searchCtrl = TextEditingController();
  Timer? _debounce;

  static const _navItems = [
    AppBottomNavItem(label: 'Accueil', icon: Icons.home_rounded),
    AppBottomNavItem(
        label: 'Pharmacies', icon: Icons.medication_outlined),
    AppBottomNavItem(label: 'Assurance', icon: Icons.shield_outlined),
    AppBottomNavItem(label: 'Profil', icon: Icons.person_outline),
  ];

  @override
  void initState() {
    super.initState();
    // Charge les gardes en cours (instant = maintenant) dès l'ouverture de
    // l'écran, pour pouvoir afficher le badge/le filtre "De garde" sans
    // attendre une action de l'utilisateur.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(filtresGardesPharmacieProvider.notifier).state =
          GardesPharmacieFiltre(instant: DateTime.now());
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  /// Recherche texte : debounce avant de mettre à jour
  /// [filtresPharmaciesProvider], qui déclenche automatiquement un
  /// rechargement de [listePharmaciesControllerProvider] (GET /pharmacies
  /// avec `recherche=...`).
  void _onSearchChanged(String valeur) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      final actuel = ref.read(filtresPharmaciesProvider);
      ref.read(filtresPharmaciesProvider.notifier).state = PharmaciesFiltre(
        paysId: actuel?.paysId,
        villeId: actuel?.villeId,
        statutVerification: actuel?.statutVerification,
        recherche: valeur.trim().isEmpty ? null : valeur.trim(),
      );
    });
  }

  void _appeler(Pharmacie p) {
    // TODO: url_launcher -> launchUrl(Uri(scheme: 'tel', path: p.telephone))
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text('Appel de ${p.nom}…')));
  }

  void _itineraire(Pharmacie p) {
    // TODO: url_launcher / maps_launcher vers p.geolocalisation
    // (latitude/longitude), si renseignée côté fiche.
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text('Itinéraire vers ${p.nom}…')));
  }

  /// Réinitialise les filtres locaux et bascule
  /// [filtresPharmaciesProvider] sur `statutVerification: publie`, seul
  /// filtre server-side réellement disponible pour "pharmacies vérifiées".
  void _voirTouteVerifiees() {
    _debounce?.cancel();
    _searchCtrl.clear();
    setState(() {
      _villeSelectionnee = 'Toutes les villes';
      _deGardeUniquement = false;
    });
    ref.read(filtresPharmaciesProvider.notifier).state =
    const PharmaciesFiltre(
      statutVerification: StatutVerificationPharmacie.publie,
    );
  }

  /// Villes disponibles pour les chips de filtre, dérivées des pharmacies
  /// effectivement chargées (faute de référentiel villes injecté ici).
  List<String> _villesDisponibles(List<Pharmacie> pharmacies) {
    final noms = pharmacies
        .map((p) => p.ville?.nom)
        .whereType<String>()
        .toSet()
        .toList()
      ..sort();
    return ['Toutes les villes', ...noms];
  }

  List<Pharmacie> _filtrer(List<Pharmacie> pharmacies, Set<String> deGardeIds) {
    return pharmacies.where((p) {
      final matchGarde = !_deGardeUniquement || deGardeIds.contains(p.pharmacieId);
      final matchVille = _villeSelectionnee == 'Toutes les villes' ||
          p.ville?.nom == _villeSelectionnee;
      return matchGarde && matchVille;
    }).toList();
  }

  String _messageErreur(Object erreur) {
    final texte = erreur.toString();
    return texte.isEmpty
        ? 'Une erreur est survenue. Veuillez réessayer.'
        : texte.replaceFirst('ApiException: ', '');
  }

  /// Gère un tap sur la barre de navigation basse : met à jour l'index actif
  /// ET navigue réellement vers l'écran correspondant. Ici les rubriques
  /// sont : 0=Accueil, 1=Pharmacies [écran courant], 2=Assurance, 3=Mon espace.
  void _onBottomNavTap(int index) {
    setState(() => _navIndex = index);
    switch (index) {
      case 0: // Accueil
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const PublicAcceuilPage()),
        );
        break;
      case 1: // Pharmacies — déjà sur cet écran.
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
    final pharmaciesAsync = ref.watch(listePharmaciesControllerProvider);
    final gardesAsync = ref.watch(listeGardesPharmacieControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.bg,
      extendBody: true,
      body: Stack(
        children: [
          _buildContent(pharmaciesAsync, gardesAsync),
          Positioned(
            left: 16,
            right: 16,
            bottom: 12 + MediaQuery.paddingOf(context).bottom,
            child: AppBottomNav(
              items: _navItems,
              currentIndex: _navIndex,
              onTap: _onBottomNavTap,
              onRdvPressed: () {
                // Brancher ici la navigation vers la prise de RDV.
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(
      AsyncValue<List<Pharmacie>> pharmaciesAsync,
      AsyncValue<List<GardePharmacie>> gardesAsync,
      ) {
    // Le sous-module "gardes" est secondaire à l'affichage : s'il échoue,
    // on continue d'afficher les pharmacies, simplement sans badge/filtre
    // "de garde" fiable.
    final deGardeIds = gardesAsync.maybeWhen(
      data: (gardes) => gardes.map((g) => g.pharmacieId).toSet(),
      orElse: () => const <String>{},
    );
    final gardesIndisponibles =
        gardesAsync.hasError && !gardesAsync.hasValue && _deGardeUniquement;

    final nbGardes = deGardeIds.length;
    return SafeArea(
      bottom: false,
      child: ListView(
      padding: EdgeInsets.fromLTRB(
          18, 6, 18, AppBottomNav.reservedHeight + MediaQuery.paddingOf(context).bottom),
      children: [
        // ---------- En-tête : retour + De garde / Toutes ----------
        Row(
          children: [
            if (Navigator.of(context).canPop()) ...[
              ApsIconButton.back(context),
              const SizedBox(width: 8),
            ],
            Expanded(
              child: ApsSegmented<bool>(
                value: _deGardeUniquement,
                onChanged: (v) => setState(() => _deGardeUniquement = v),
                segments: const [
                  ApsSegment(true, 'De garde', icon: Icons.nightlight_outlined),
                  ApsSegment(false, 'Toutes'),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _deGardeUniquement
                        ? (nbGardes > 1
                            ? '$nbGardes pharmacies de garde'
                            : '$nbGardes pharmacie de garde')
                        : 'Pharmacies',
                    style: AppTextStyles.l.copyWith(fontSize: 20),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _villeSelectionnee == 'Toutes les villes'
                        ? 'Fiches vérifiées · appel direct et itinéraire'
                        : _villeSelectionnee,
                    style: AppTextStyles.xs,
                  ),
                ],
              ),
            ),
            if (_deGardeUniquement && !gardesAsync.hasError)
              const ApsPill('En direct', dot: true),
          ],
        ),
        const SizedBox(height: 14),

        // ---------- Recherche ----------
        _SearchField(controller: _searchCtrl, onChanged: _onSearchChanged),
        const SizedBox(height: 12),

        // ---------- Villes ----------
        pharmaciesAsync.maybeWhen(
          data: (liste) => _FilterChipsRow(
            deGardeUniquement: _deGardeUniquement,
            ville: _villeSelectionnee,
            villes: _villesDisponibles(liste),
            onToggleGarde: () =>
                setState(() => _deGardeUniquement = !_deGardeUniquement),
            onPickVille: (v) => setState(() => _villeSelectionnee = v),
          ),
          orElse: () => const SizedBox.shrink(),
        ),
        if (gardesIndisponibles) ...[
          const SizedBox(height: 12),
          AppAlert(
            type: AppAlertType.warning,
            message: 'Impossible de vérifier les pharmacies de garde pour '
                'le moment (${_messageErreur(gardesAsync.error!)}).',
          ),
        ],
        const SizedBox(height: 16),

        // ---------- Liste (branchée sur l'API) ----------
        pharmaciesAsync.when(
          data: (liste) => _buildListe(liste, deGardeIds),
          loading: () {
            final precedent = pharmaciesAsync.donneeOuNull;
            return precedent != null
                ? _buildListe(precedent, deGardeIds)
                : const _LoadingState();
          },
          error: (erreur, _) {
            final precedent = pharmaciesAsync.donneeOuNull;
            if (precedent != null) return _buildListe(precedent, deGardeIds);
            return _ErrorState(
              message: _messageErreur(erreur),
              onRetry: () => ref
                  .read(listePharmaciesControllerProvider.notifier)
                  .rafraichir(),
            );
          },
        ),

        const SizedBox(height: 4),
        ApsNote.text(
          "APS oriente uniquement vers l'officine la plus proche : aucune vente en ligne.",
          bold: "Fiches vérifiées à l'Ordre.",
          icon: Icons.verified_user_outlined,
        ),
        const SizedBox(height: 12),
        ApsButton(
          label: 'Toutes les pharmacies vérifiées',
          variant: ApsButtonVariant.ghost,
          onPressed: _voirTouteVerifiees,
        ),
      ],
      ),
    );
  }

  Widget _buildListe(List<Pharmacie> pharmacies, Set<String> deGardeIds) {
    final resultats = _filtrer(pharmacies, deGardeIds);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ---------- Compteur de résultats ----------
        Text(
          resultats.isEmpty
              ? 'Aucune pharmacie trouvée'
              : resultats.length == 1
              ? '1 pharmacie'
              : '${resultats.length} pharmacies',
          style: AppTextStyles.xs.copyWith(fontSize: 12),
        ),
        const SizedBox(height: 10),

        if (resultats.isEmpty)
          const _EmptyState()
        else
          ...resultats.map(
                (p) => CardPharmacie(
              nom: p.nom,
              quartier: p.ville?.nom ?? p.villeId,
              deGarde: deGardeIds.contains(p.pharmacieId),
              verifiee:
              p.statutVerification == StatutVerificationPharmacie.publie,
              numeroOrdre: p.numeroOrdreTitulaire,
              // TODO: remplacer par une vraie distance (Haversine) une fois
              // la position de l'utilisateur disponible (ex: Geolocator),
              // combinée à p.geolocalisation quand elle est renseignée.
              distanceKm: null,
              onAppeler: () => _appeler(p),
              onItineraire: () => _itineraire(p),
            ),
          ),
      ],
    );
  }
}

/// ---------------- Champ de recherche ----------------
class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.onChanged});

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return ApsSearchField(
      controller: controller,
      onChanged: onChanged,
      hint: 'Pharmacie, quartier, ville…',
    );
  }
}

/// ---------------- Puces de ville ----------------
class _FilterChipsRow extends StatelessWidget {
  const _FilterChipsRow({
    required this.deGardeUniquement,
    required this.ville,
    required this.villes,
    required this.onToggleGarde,
    required this.onPickVille,
  });

  final bool deGardeUniquement;
  final String ville;
  final List<String> villes;
  final VoidCallback onToggleGarde;
  final ValueChanged<String> onPickVille;

  @override
  Widget build(BuildContext context) {
    return ApsChipRow(
      children: [
        for (final v in villes)
          ApsChip(
            v,
            selected: ville == v,
            icon: v == 'Toutes les villes' ? null : Icons.location_on_outlined,
            onTap: () => onPickVille(v),
          ),
      ],
    );
  }
}

/// ---------------- État vide ----------------
class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return const ApsEmptyState(
      icon: Icons.search_off_rounded,
      tone: ApsTone.neutral,
      title: 'Aucune pharmacie',
      message: 'Essayez une autre ville ou affichez toutes les pharmacies.',
    );
  }
}

/// ---------------- État de chargement (premier chargement) ----------------
class _LoadingState extends StatelessWidget {
  const _LoadingState();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 40),
      child: Center(child: CircularProgressIndicator()),
    );
  }
}

/// ---------------- État d'erreur (échec sans données précédentes) --------
class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ApsEmptyState(
      icon: Icons.wifi_off_rounded,
      tone: ApsTone.neutral,
      title: 'Liste indisponible',
      message: message,
      actionLabel: 'Réessayer',
      onAction: onRetry,
    );
  }
}
