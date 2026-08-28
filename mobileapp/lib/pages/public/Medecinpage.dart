import 'package:flutter/material.dart';

// Si votre projet utilise des imports package (ex: package:aps/...),
// remplacez la ligne ci-dessous par :
// import 'package:aps/components/components.dart';
import '../../components/components.dart';

/// Modèle minimal représentant un médecin de l'annuaire.
///
/// Dans l'application réelle, ces données proviendront de l'API
/// (ex: `MedecinRepository` / `MedecinService`) — la liste statique
/// ci-dessous ne sert qu'à démontrer l'écran en attendant le branchement
/// réseau.
class _Medecin {
  const _Medecin({
    required this.nom,
    required this.specialite,
    required this.ville,
    required this.prixFcfa,
    this.photoUrl,
    this.verifieOrdre = false,
    this.teleconsultation = false,
    this.disponibleAujourdhui = false,
  });

  final String nom;
  final String specialite;
  final String ville;
  final int prixFcfa;
  final String? photoUrl;
  final bool verifieOrdre;
  final bool teleconsultation;
  final bool disponibleAujourdhui;
}

/// Page publique — **Annuaire des médecins**.
///
/// Reproduit l'écran « Rechercher un médecin » de la maquette
/// `ui-mobile.html` (device n°2) : en-tête, champ de recherche, puces de
/// filtre (ville, disponibilité, télé-consultation), liste de
/// [CardMedecin] et barre de navigation basse flottante.
///
/// Écran consultable sans compte, comme le reste de l'annuaire public de
/// l'application (médecins, structures, pharmacies, assurances).
class MedecinPage extends StatefulWidget {
  const MedecinPage({super.key});

  @override
  State<MedecinPage> createState() => _MedecinPageState();
}

class _MedecinPageState extends State<MedecinPage> {
  final TextEditingController _searchController = TextEditingController();

  /// Index de la rubrique active dans [AppBottomNav] (1 = Médecin).
  int _navIndex = 1;

  String _query = '';
  String _selectedVille = 'Toutes les villes';
  bool _filtreDisponible = false;
  bool _filtreTele = false;

  // TODO(api): remplacer cette liste statique par les données réelles
  // (ex: appel à MedecinRepository.rechercher(...)).
  static const List<_Medecin> _medecins = [
    _Medecin(
      nom: 'Dr. Landry Amari',
      specialite: 'Cardiologie',
      ville: 'Garoua',
      prixFcfa: 12000,
      verifieOrdre: true,
      teleconsultation: true,
      disponibleAujourdhui: true,
    ),
    _Medecin(
      nom: 'Dr. Martin Ebodé',
      specialite: 'Cardiologie',
      ville: 'Douala',
      prixFcfa: 10000,
      teleconsultation: true,
    ),
    _Medecin(
      nom: 'Dr. Chantal Mballa',
      specialite: 'Gynécologie',
      ville: 'Yaoundé',
      prixFcfa: 15000,
      verifieOrdre: true,
      disponibleAujourdhui: true,
    ),
    _Medecin(
      nom: 'Dr. Serge Fotso',
      specialite: 'Pédiatrie',
      ville: 'Douala',
      prixFcfa: 8000,
      verifieOrdre: true,
    ),
    _Medecin(
      nom: 'Dr. Aïcha Njoya',
      specialite: 'Dermatologie',
      ville: 'Yaoundé',
      prixFcfa: 11000,
      teleconsultation: true,
      disponibleAujourdhui: true,
    ),
    _Medecin(
      nom: 'Dr. Paul Biloa',
      specialite: 'Médecine générale',
      ville: 'Douala',
      prixFcfa: 6000,
      verifieOrdre: true,
      disponibleAujourdhui: true,
    ),
  ];

  /// Villes disponibles pour le filtre, déduites des données + « Toutes les villes ».
  List<String> get _villes {
    final villes = _medecins.map((m) => m.ville).toSet().toList()..sort();
    return ['Toutes les villes', ...villes];
  }

  /// Applique la recherche texte + les filtres actifs à la liste des médecins.
  List<_Medecin> get _resultats {
    return _medecins.where((m) {
      final matchQuery = _query.isEmpty ||
          m.nom.toLowerCase().contains(_query) ||
          m.specialite.toLowerCase().contains(_query);
      final matchVille =
          _selectedVille == 'Toutes les villes' || m.ville == _selectedVille;
      final matchDispo = !_filtreDisponible || m.disponibleAujourdhui;
      final matchTele = !_filtreTele || m.teleconsultation;
      return matchQuery && matchVille && matchDispo && matchTele;
    }).toList();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final resultats = _resultats;

    return Scaffold(
      backgroundColor: AppColors.paper,
      extendBody: true,
      body: Stack(
        children: [
          SafeArea(
            bottom: false,
            child: ListView(
              // Padding bas augmenté pour ne pas passer sous la barre flottante.
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
              children: [
                _buildHeader(),
                const SizedBox(height: 2),
                _SearchField(
                  controller: _searchController,
                  hint: 'Rechercher un médecin, une spécialité…',
                  onChanged: (value) =>
                      setState(() => _query = value.trim().toLowerCase()),
                ),
                const SizedBox(height: 4),
                _buildFilterChips(),
                const SizedBox(height: 4),
                _buildResultHeader(resultats.length),
                if (resultats.isEmpty)
                  _buildEmptyState()
                else
                  ...resultats.map(
                        (m) => CardMedecin(
                      nom: m.nom,
                      specialite: m.specialite,
                      ville: m.ville,
                      photoUrl: m.photoUrl,
                      prixFcfa: m.prixFcfa,
                      verifieOrdre: m.verifieOrdre,
                      teleconsultation: m.teleconsultation,
                      disponibleAujourdhui: m.disponibleAujourdhui,
                      onVoirProfil: () {
                        // TODO(nav): naviguer vers la fiche détaillée du médecin.
                      },
                      onPrendreRdv: () {
                        // TODO(nav): naviguer vers le flux de prise de rendez-vous.
                      },
                    ),
                  ),
              ],
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
                // TODO(nav): brancher la navigation vers la prise de rendez-vous.
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

  Widget _buildFilterChips() {
    return SizedBox(
      height: 34,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          for (final ville in _villes) ...[
            _FilterChip(
              label: ville,
              icon: Icons.location_on_outlined,
              active: _selectedVille == ville,
              onTap: () => setState(() => _selectedVille = ville),
            ),
            const SizedBox(width: 8),
          ],
          _FilterChip(
            label: "Disponible aujourd'hui",
            icon: Icons.event_available_outlined,
            active: _filtreDisponible,
            onTap: () =>
                setState(() => _filtreDisponible = !_filtreDisponible),
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
            onPressed: () {
              setState(() {
                _query = '';
                _searchController.clear();
                _selectedVille = 'Toutes les villes';
                _filtreDisponible = false;
                _filtreTele = false;
              });
            },
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