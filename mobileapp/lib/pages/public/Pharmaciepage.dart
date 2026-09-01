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

  @override
  Widget build(BuildContext context) {
    final pharmaciesAsync = ref.watch(listePharmaciesControllerProvider);
    final gardesAsync = ref.watch(listeGardesPharmacieControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.paper,
      extendBody: true,
      body: Stack(
        children: [
          _buildContent(pharmaciesAsync, gardesAsync),
          Positioned(
            left: 10,
            right: 10,
            bottom: 10,
            child: AppBottomNav(
              items: _navItems,
              currentIndex: _navIndex,
              onTap: (i) => setState(() => _navIndex = i),
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

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
      children: [
        // ---------- En-tête ----------
        Text(
          'ANNUAIRE',
          style: AppTextStyles.badge.copyWith(
            fontSize: 10.5,
            letterSpacing: 1.2,
            color: AppColors.primary,
          ),
        ),
        const SizedBox(height: 6),
        const Text('Trouver une pharmacie', style: AppTextStyles.h3),
        const SizedBox(height: 4),
        const Text(
          'Pharmacies vérifiées et pharmacies de garde près de chez vous, '
              'avec appel direct et itinéraire.',
          style: AppTextStyles.body,
        ),
        const SizedBox(height: 14),

        // ---------- Recherche ----------
        _SearchField(controller: _searchCtrl, onChanged: _onSearchChanged),
        const SizedBox(height: 10),

        // ---------- Filtres ----------
        pharmaciesAsync.maybeWhen(
          data: (liste) => _FilterChipsRow(
            deGardeUniquement: _deGardeUniquement,
            ville: _villeSelectionnee,
            villes: _villesDisponibles(liste),
            onToggleGarde: () =>
                setState(() => _deGardeUniquement = !_deGardeUniquement),
            onPickVille: (v) => setState(() => _villeSelectionnee = v),
          ),
          orElse: () => _FilterChipsRow(
            deGardeUniquement: _deGardeUniquement,
            ville: _villeSelectionnee,
            villes: const ['Toutes les villes'],
            onToggleGarde: () =>
                setState(() => _deGardeUniquement = !_deGardeUniquement),
            onPickVille: (v) => setState(() => _villeSelectionnee = v),
          ),
        ),
        const SizedBox(height: 16),

        // ---------- Alerte info (réutilise AppAlert existant) ----------
        const AppAlert(
          type: AppAlertType.primary,
          message:
          'Fiches vérifiées à l’Ordre des pharmaciens. Aucune vente en '
              'ligne : APS oriente uniquement vers l’officine la plus proche.',
        ),
        if (gardesIndisponibles) ...[
          const SizedBox(height: 10),
          AppAlert(
            type: AppAlertType.primary,
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
        SecondaryButton(
          label: 'Voir toutes les pharmacies vérifiées',
          icon: Icons.list_alt_outlined,
          onPressed: _voirTouteVerifiees,
        ),
      ],
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
              ? '1 pharmacie trouvée'
              : '${resultats.length} pharmacies trouvées',
          style: AppTextStyles.cardMeta.copyWith(
            fontWeight: FontWeight.w600,
            color: AppColors.inkSoft,
          ),
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
              distanceKm: 0.0,
              onAppeler: () => _appeler(p),
              onItineraire: () => _itineraire(p),
            ),
          ),
      ],
    );
  }
}

/// ---------------- Champ de recherche ----------------
/// N'existe pas encore dans la librairie de composants : reproduit ici en
/// respectant `CardSurface`/`AppColors`/`AppTextStyles` pour rester cohérent.
class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.onChanged});

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return CardSurface(
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 2),
      child: Row(
        children: [
          const Icon(Icons.search, size: 18, color: AppColors.inkFaint),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              style: AppTextStyles.body.copyWith(
                fontSize: 13,
                color: AppColors.ink,
                fontWeight: FontWeight.w500,
                height: 1,
              ),
              decoration: InputDecoration(
                isDense: true,
                border: InputBorder.none,
                hintText: 'Nom de pharmacie, quartier, ville…',
                hintStyle: AppTextStyles.body.copyWith(fontSize: 13, height: 1),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// ---------------- Puces de filtre (garde / ville) ----------------
/// Utilise `GuardDot` (déjà fourni par `badge_chip.dart`) pour l'indicateur
/// « de garde », et les mêmes couleurs que `BadgeChip` pour l'état actif.
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
    return SizedBox(
      height: 38,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          _FilterChip(
            label: 'De garde uniquement',
            active: deGardeUniquement,
            leading: GuardDot(active: deGardeUniquement),
            onTap: onToggleGarde,
          ),
          const SizedBox(width: 8),
          ...villes.map(
                (v) => Padding(
              padding: const EdgeInsets.only(right: 8),
              child: _FilterChip(
                label: v,
                active: ville == v,
                onTap: () => onPickVille(v),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.active,
    required this.onTap,
    this.leading,
  });

  final String label;
  final bool active;
  final Widget? leading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
        decoration: BoxDecoration(
          color: active ? AppColors.primary : AppColors.card,
          border: Border.all(
            color: active ? AppColors.primary : AppColors.lineStrong,
          ),
          borderRadius: BorderRadius.circular(100),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (leading != null) ...[leading!, const SizedBox(width: 2)],
            Text(
              label,
              style: AppTextStyles.buttonLabel.copyWith(
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

/// ---------------- État vide ----------------
class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Column(
        children: [
          const Icon(Icons.search_off, size: 32, color: AppColors.inkFaint),
          const SizedBox(height: 10),
          Text(
            'Aucune pharmacie ne correspond à vos filtres.\n'
                'Essayez une autre ville ou désactivez « De garde uniquement ».',
            textAlign: TextAlign.center,
            style: AppTextStyles.body,
          ),
        ],
      ),
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
      child: Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      ),
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
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Column(
        children: [
          const Icon(Icons.wifi_off_rounded, size: 32, color: AppColors.inkFaint),
          const SizedBox(height: 10),
          Text(
            message,
            textAlign: TextAlign.center,
            style: AppTextStyles.body,
          ),
          const SizedBox(height: 12),
          SecondaryButton(
            label: 'Réessayer',
            icon: Icons.refresh_rounded,
            onPressed: onRetry,
          ),
        ],
      ),
    );
  }
}