import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/assurance_controller.dart';
import '../../models/assurance_models.dart';
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
      case 3: // À propos — aucun écran fourni pour l'instant.
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Écran « À propos » bientôt disponible.')),
        );
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final servicesAsync = ref.watch(listeServicesAssuranceControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.paper,
      extendBody: true,
      appBar: AppBar(
        backgroundColor: AppColors.paper,
        elevation: 0,
        foregroundColor: AppColors.ink,
        title: const Text('Annuaire', style: AppTextStyles.h3),
      ),
      body: Stack(
        children: [
          RefreshIndicator(
            onRefresh: () => ref
                .read(listeServicesAssuranceControllerProvider.notifier)
                .rafraichir(),
            child: _buildContent(context, servicesAsync),
          ),
          Positioned(
            left: 10,
            right: 10,
            bottom: 10,
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
    return ListView(
      // padding bas augmenté pour ne pas passer sous la barre flottante
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 110),
      children: [
        // ---- En-tête ------------------------------------------------
        Padding(
          padding: const EdgeInsets.fromLTRB(2, 14, 2, 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'ANNUAIRE PUBLIC',
                style: AppTextStyles.badge.copyWith(
                  fontSize: 10.5,
                  letterSpacing: 1.2,
                  color: AppColors.green700,
                ),
              ),
              const SizedBox(height: 6),
              const Text('Assurances', style: AppTextStyles.h3),
              const SizedBox(height: 4),
              Text(
                'Toutes les compagnies et courtiers santé référencés sur APS.',
                style: AppTextStyles.body.copyWith(fontSize: 12.5),
              ),
            ],
          ),
        ),

        // ---- Recherche ------------------------------------------------
        const SizedBox(height: 10),
        _SearchField(
          controller: _searchController,
          hint: 'Rechercher une compagnie, une ville...',
          onChanged: (value) => setState(() => _query = value),
        ),

        // ---- Filtres ------------------------------------------------
        const SizedBox(height: 10),
        SizedBox(
          height: 34,
          child: servicesAsync.when(
            data: (services) => ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (final ville in _villesDisponibles(services))
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: _FilterChip(
                      label: ville,
                      icon: ville == 'Toutes les villes'
                          ? Icons.place_outlined
                          : null,
                      active: _villeSelectionnee == ville,
                      onTap: () => setState(() => _villeSelectionnee = ville),
                    ),
                  ),
                _FilterChip(
                  label: 'Vérifiées APS',
                  icon: Icons.verified_outlined,
                  active: _verifieesUniquement,
                  onTap: () =>
                      setState(() => _verifieesUniquement = !_verifieesUniquement),
                ),
              ],
            ),
            // Filtres non disponibles tant que la liste n'a pas répondu au
            // moins une fois — on évite un flash de puces vides.
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
        ),
        const SizedBox(height: 14),

        // ---- Bandeau d'information ------------------------------------------------
        const AppAlert(
          type: AppAlertType.primary,
          message:
          'Présentation seulement : aucune souscription en ligne, aucune gestion de sinistre sur APS.',
        ),
        const SizedBox(height: 16),

        // ---- Publicité (visuel réel de la campagne, placée au-dessus de la liste) ----
        const _InsuranceAdBanner(),

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
    );
  }

  Widget _buildResultats(List<ServiceAssurance> services) {
    final resultats = _filtrer(services);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '${resultats.length} compagnie${resultats.length > 1 ? 's' : ''} référencée${resultats.length > 1 ? 's' : ''}',
              style: AppTextStyles.cardTitle.copyWith(fontSize: 14),
            ),
            GestureDetector(
              onTap: () {
                // Brancher ici un tri (alphabétique, proximité, vérifiées d'abord...).
              },
              child: Text(
                'Filtrer',
                style: AppTextStyles.buttonLabel.copyWith(
                  fontSize: 11.5,
                  color: AppColors.green700,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

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
      description: service.description ?? '',
      numeroAgrement: service.agrement,
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
  _PaletteCouleur(Color(0xFF0B2C9E), Color(0xFFEDF1FB)),
  _PaletteCouleur(Color(0xFF6B2E8F), Color(0xFFF1E9F7)),
  _PaletteCouleur(Color(0xFF1E8A63), Color(0xFFE4F3EC)),
  _PaletteCouleur(Color(0xFFC94E3A), Color(0xFFFBE7E2)),
  _PaletteCouleur(Color(0xFF9A6A1D), Color(0xFFF6ECDD)),
  _PaletteCouleur(Color(0xFF1F6F8B), Color(0xFFE3F1F5)),
];

/// Couleur déterministe (dérivée de l'id) tant que le backend ne fournit
/// pas de couleur de marque dédiée pour `service_assurance`.
_PaletteCouleur _couleursPour(String serviceAssuranceId) =>
    _paletteLogos[serviceAssuranceId.hashCode.abs() % _paletteLogos.length];

/// Champ de recherche — `.search-field` / `.ins-search-field` de la maquette.
class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.hint, required this.onChanged});

  final TextEditingController controller;
  final String hint;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.search, size: 18, color: AppColors.inkFaint),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              style: AppTextStyles.body.copyWith(fontSize: 13, color: AppColors.ink),
              decoration: InputDecoration(
                isDense: true,
                border: InputBorder.none,
                hintText: hint,
                hintStyle: AppTextStyles.body.copyWith(fontSize: 13, color: AppColors.inkSoft),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Puce de filtre — `.filter-chips .chip` / `.chip.active` de la maquette.
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
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: active ? AppColors.primaryLight : AppColors.card,
          border: Border.all(color: active ? AppColors.primary : AppColors.lineStrong),
          borderRadius: BorderRadius.circular(100),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 13, color: active ? AppColors.primary : AppColors.inkFaint),
              const SizedBox(width: 5),
            ],
            Text(
              label,
              style: AppTextStyles.badge.copyWith(
                fontSize: 11,
                color: active ? AppColors.green900 : AppColors.inkSoft,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Bandeau publicitaire — `.ad-mobile.ad-top` de la maquette.
///
/// Contenu illustratif uniquement : brancher ici le module de régie
/// publicitaire réel de l'application (image, lien, désactivable selon
/// l'écran — jamais affiché sur l'écran Urgence).
class _InsuranceAdBanner extends StatelessWidget {
  const _InsuranceAdBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 18),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.green100),
        boxShadow: AppColors.shadowCard,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
            child: Row(
              children: [
                const Icon(Icons.info_outline, size: 11, color: AppColors.green700),
                const SizedBox(width: 5),
                Text(
                  'PUBLICITÉ',
                  style: AppTextStyles.badge.copyWith(
                    fontSize: 9,
                    letterSpacing: 1.0,
                    color: AppColors.green700,
                  ),
                ),
              ],
            ),
          ),
          Container(
            margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            height: 96,
            decoration: BoxDecoration(
              color: AppColors.paper,
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: const Icon(Icons.image_outlined, size: 28, color: AppColors.inkFaint),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('AXA Assurances', style: AppTextStyles.cardTitle),
                const SizedBox(height: 4),
                Text(
                  'Professionnalisme, proximité et expertise — découvrez les offres santé AXA.',
                  style: AppTextStyles.body.copyWith(fontSize: 10.5),
                ),
                const SizedBox(height: 9),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'En savoir plus',
                      style: AppTextStyles.buttonLabel.copyWith(fontSize: 11, color: AppColors.green700),
                    ),
                    const SizedBox(width: 4),
                    const Icon(Icons.arrow_forward, size: 12, color: AppColors.green700),
                  ],
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Center(
              child: Text(
                'APS ne garantit pas les offres de ses annonceurs.',
                style: AppTextStyles.badge.copyWith(fontSize: 9, color: AppColors.inkFaint),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// État vide — aucune compagnie ne correspond à la recherche / aux filtres.
class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onReset});

  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
      alignment: Alignment.center,
      child: Column(
        children: [
          const Icon(Icons.search_off_rounded, size: 30, color: AppColors.inkFaint),
          const SizedBox(height: 10),
          Text(
            'Aucune compagnie trouvée',
            style: AppTextStyles.cardTitle.copyWith(fontSize: 13.5),
          ),
          const SizedBox(height: 4),
          Text(
            'Essayez une autre ville ou réinitialisez les filtres.',
            textAlign: TextAlign.center,
            style: AppTextStyles.body.copyWith(fontSize: 11.5),
          ),
          const SizedBox(height: 12),
          AppOutlineButton(label: 'Réinitialiser', onPressed: onReset, icon: Icons.refresh),
        ],
      ),
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
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
      alignment: Alignment.center,
      child: Column(
        children: [
          const Icon(Icons.wifi_off_rounded, size: 30, color: AppColors.inkFaint),
          const SizedBox(height: 10),
          Text(
            message,
            textAlign: TextAlign.center,
            style: AppTextStyles.cardTitle.copyWith(fontSize: 13.5),
          ),
          const SizedBox(height: 12),
          AppOutlineButton(label: 'Réessayer', onPressed: onRetry, icon: Icons.refresh),
        ],
      ),
    );
  }
}