import 'package:flutter/material.dart';
import '../../components/components.dart';

/// Écran public — **Annuaire des assurances** (`5 · Annuaire assurances`
/// dans la maquette `ui-mobile.html`).
///
/// Consultable sans compte. Liste les compagnies et courtiers santé
/// référencés sur APS, avec recherche, filtres (ville / vérifiées APS)
/// et accès à la fiche détaillée de chaque assureur.
///
/// ```dart
/// Navigator.push(
///   context,
///   MaterialPageRoute(builder: (_) => const AssurancePage()),
/// );
/// ```
class AssurancePage extends StatefulWidget {
  const AssurancePage({super.key});

  @override
  State<AssurancePage> createState() => _AssurancePageState();
}

class _AssurancePageState extends State<AssurancePage> {
  int _navIndex = 2; // 0=Accueil, 1=Médecin, 2=Assurance, 3=À propos

  final TextEditingController _searchController = TextEditingController();
  String _query = '';
  String _villeSelectionnee = 'Toutes les villes';
  bool _verifieesUniquement = false;

  // ---------------------------------------------------------------
  // Données de démonstration — à remplacer par un appel API réel
  // (ex: InsuranceRepository.fetchAll()) branché depuis un provider
  // ou un FutureBuilder autour de ce même contenu de liste.
  // ---------------------------------------------------------------
  final List<_Insurer> _insurers = const [
    _Insurer(
      nom: 'AXA',
      sigle: 'AXA',
      ville: 'Douala',
      description:
      "Leader mondial de l'assurance et de la gestion d'actifs, solutions santé pour particuliers et entreprises.",
      numeroAgrement: 'RCM-07MEICOM',
      verifieeAps: false,
      couleurLogo: Color(0xFF0B2C9E),
      fondLogo: Color(0xFFEDF1FB),
    ),
    _Insurer(
      nom: 'BEDI',
      sigle: 'BE',
      ville: 'Douala',
      description:
      'Courtier régional dédié aux couvertures santé, adapté aux besoins locaux et régimes de prévoyance.',
      numeroAgrement: 'REN-09032',
      verifieeAps: true,
      couleurLogo: Color(0xFF6B2E8F),
      fondLogo: Color(0xFFF1E9F7),
    ),
    _Insurer(
      nom: 'Activa Assurances',
      sigle: 'AC',
      ville: 'Yaoundé',
      description:
      'Compagnie panafricaine proposant des couvertures santé individuelles et collectives.',
      numeroAgrement: 'RCM-11ACT',
      verifieeAps: true,
      couleurLogo: Color(0xFF1E8A63),
      fondLogo: Color(0xFFE4F3EC),
    ),
    _Insurer(
      nom: 'Chanas Assurances',
      sigle: 'CH',
      ville: 'Yaoundé',
      description:
      "Courtier historique au Cameroun, spécialisé dans les régimes de prévoyance et l'assurance maladie.",
      numeroAgrement: 'RCM-04CHA',
      verifieeAps: false,
      couleurLogo: Color(0xFFC94E3A),
      fondLogo: Color(0xFFFBE7E2),
    ),
  ];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<String> get _villes => [
    'Toutes les villes',
    ...{for (final a in _insurers) a.ville}
  ];

  List<_Insurer> get _filtres {
    return _insurers.where((a) {
      final matchRecherche = _query.isEmpty ||
          a.nom.toLowerCase().contains(_query.toLowerCase()) ||
          a.ville.toLowerCase().contains(_query.toLowerCase()) ||
          a.description.toLowerCase().contains(_query.toLowerCase());
      final matchVille =
          _villeSelectionnee == 'Toutes les villes' || a.ville == _villeSelectionnee;
      final matchVerifiee = !_verifieesUniquement || a.verifieeAps;
      return matchRecherche && matchVille && matchVerifiee;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
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
          _buildContent(context),
          Positioned(
            left: 10,
            right: 10,
            bottom: 10,
            child: AppBottomNav(
              currentIndex: _navIndex,
              onTap: (i) => setState(() => _navIndex = i),
              onRdvPressed: () {
                // Brancher ici la navigation vers le flux de prise de RDV.
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    final resultats = _filtres;

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
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              for (final ville in _villes)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _FilterChip(
                    label: ville,
                    icon: ville == 'Toutes les villes' ? Icons.place_outlined : null,
                    active: _villeSelectionnee == ville,
                    onTap: () => setState(() => _villeSelectionnee = ville),
                  ),
                ),
              _FilterChip(
                label: 'Vérifiées APS',
                icon: Icons.verified_outlined,
                active: _verifieesUniquement,
                onTap: () => setState(() => _verifieesUniquement = !_verifieesUniquement),
              ),
            ],
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
          for (final assureur in resultats)
            CardAssurance(
              nom: assureur.nom,
              sigle: assureur.sigle,
              ville: assureur.ville,
              description: assureur.description,
              numeroAgrement: assureur.numeroAgrement,
              verifieeAps: assureur.verifieeAps,
              couleurLogo: assureur.couleurLogo,
              fondLogo: assureur.fondLogo,
              onVoirFiche: () {
                // Brancher ici la navigation vers la fiche assurance
                // (ex: Navigator.push(context, MaterialPageRoute(
                //   builder: (_) => AssuranceFichePage(id: assureur.nom))));
              },
            ),
      ],
    );
  }
}

/// Modèle local minimal représentant un assureur dans la liste.
/// À remplacer par le modèle de données réel de l'application
/// (ex: issu d'un repository / d'une réponse API).
class _Insurer {
  const _Insurer({
    required this.nom,
    required this.sigle,
    required this.ville,
    required this.description,
    required this.numeroAgrement,
    required this.verifieeAps,
    required this.couleurLogo,
    required this.fondLogo,
  });

  final String nom;
  final String sigle;
  final String ville;
  final String description;
  final String numeroAgrement;
  final bool verifieeAps;
  final Color couleurLogo;
  final Color fondLogo;
}

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