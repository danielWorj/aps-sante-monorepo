import 'package:flutter/material.dart';
// Bibliothèque de composants partagée (design tokens, cartes, boutons,
// alertes, navigation basse). Adapter le chemin selon l'emplacement réel
// de ce fichier dans le projet (ex: 'package:aps/components/components.dart'
// ou '../components/components.dart'), comme dans portail-medecin-rdv.dart.
import '../../../components/components.dart';

/// ============================================================
/// portail-medecin-profil.dart
///
/// Portage Flutter de la maquette HTML "APS — Fiche du praticien
/// (mobile)" (profil-medecin.html), adapté à l'espace médecin : ici
/// le praticien consulte ET modifie son propre profil public — le
/// même contenu que celui vu par les patients (présentation,
/// horaires, avis, tarifs), mais avec des actions "Modifier".
///
/// Construit sur la bibliothèque de composants partagée, dans la
/// continuité de `portail-medecin-rdv.dart` :
/// - `AppColors` / `AppTextStyles` remplacent les tokens CSS `:root`.
/// - `CardSurface` habille l'en-tête (`.profile-hero`) et les cartes
///   d'avis (`.review-card`).
/// - `BadgeChip` remplace `.badge` (vérifié / visibilité du profil).
/// - `AppOutlineButton` remplace les actions "Modifier le profil".
/// - `AppBottomNav` remplace `MedecinBottomNavigationBar` /
///   `.bottomnav`, avec les rubriques de l'espace médecin (Accueil,
///   Rendez-vous, Patients, Profil) — "Profil" actif sur cet écran.
///
/// Deux simplifications par rapport au CSS d'origine :
/// - les bordures pointillées (`border-bottom: dashed`) des lignes
///   `.hours-row` / `.price-row` sont reprises en traits pleins,
///   faute d'équivalent direct dans `BoxDecoration`.
/// - `AppColors.amber500` / `AppColors.green50` sont supposés exister
///   dans la bibliothèque partagée (mêmes tokens que `--amber-500`
///   et `--green-50` du CSS) ; à ajuster si les noms diffèrent.
///
/// Un seul écran à onglets : Présentation / Horaires / Avis / Tarifs.
/// ============================================================

/// ------------------------------------------------------------
/// Page principale
/// ------------------------------------------------------------
class PortailMedecinProfil extends StatefulWidget {
  const PortailMedecinProfil({super.key});

  @override
  State<PortailMedecinProfil> createState() => _PortailMedecinProfilState();
}

class _PortailMedecinProfilState extends State<PortailMedecinProfil>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  /// Rubrique active de la barre de navigation basse (3 = "Profil",
  /// puisque c'est l'écran courant).
  int _navIndex = 3;

  final List<_TabDef> _tabs = const [
    _TabDef(label: 'Présentation'),
    _TabDef(label: 'Horaires'),
    _TabDef(label: 'Avis', count: 126),
    _TabDef(label: 'Tarifs'),
  ];

  /// Rubriques de l'espace médecin, identiques à celles utilisées
  /// dans `portail-medecin-rdv.dart`.
  static const List<AppBottomNavItem> _navItems = [
    AppBottomNavItem(label: 'Accueil', icon: Icons.home_rounded),
    AppBottomNavItem(label: 'Rendez-vous', icon: Icons.event_note_outlined),
    AppBottomNavItem(label: 'Patients', icon: Icons.people_alt_outlined),
    AppBottomNavItem(label: 'Profil', icon: Icons.person_outline),
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: _tabs.length, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      extendBody: true,
      body: SafeArea(
        child: Stack(
          children: [
            SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 110),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _PageHead(),
                  const _ProfileHero(),
                  const SizedBox(height: 2),
                  _SegmentedTabs(controller: _tabController, tabs: _tabs),
                  const SizedBox(height: 16),
                  // Hauteur fixe simple : sur un vrai écran, préférer un
                  // IndexedStack ou laisser le TabBarView dans un
                  // Expanded si la page entière n'est pas scrollable.
                  SizedBox(
                    height: MediaQuery.of(context).size.height,
                    child: TabBarView(
                      controller: _tabController,
                      physics: const NeverScrollableScrollPhysics(),
                      children: const [
                        _PanelPresentation(),
                        _PanelHoraires(),
                        _PanelAvis(),
                        _PanelTarifs(),
                      ],
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
                items: _navItems,
                currentIndex: _navIndex,
                onTap: (i) => setState(() => _navIndex = i),
                onRdvPressed: () {
                  // TODO: brancher le flux "Nouveau rendez-vous".
                },
                rdvLabel: 'Nouveau',
                rdvIcon: Icons.add_rounded,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TabDef {
  final String label;
  final int? count;
  const _TabDef({required this.label, this.count});
}

/// ------------------------------------------------------------
/// En-tête de page
/// ------------------------------------------------------------
class _PageHead extends StatelessWidget {
  const _PageHead();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(2, 10, 2, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'ESPACE MÉDECIN',
            style: TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.1,
              color: AppColors.primary,
            ),
          ),
          SizedBox(height: 5),
          Text(
            'Mon profil',
            style: TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontSize: 22,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.2,
              color: AppColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}

/// ------------------------------------------------------------
/// En-tête du profil — équivalent de `.profile-hero`, construit
/// sur `CardSurface` (même conteneur "carte" que `_DoctorStrip`
/// dans portail-medecin-rdv.dart), avec un bouton de changement de
/// photo et un badge de visibilité éditable (au lieu du simple
/// badge "Disponible aujourd'hui" côté patient).
/// ------------------------------------------------------------
class _ProfileHero extends StatelessWidget {
  const _ProfileHero();

  @override
  Widget build(BuildContext context) {
    return CardSurface(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
      child: Column(
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 72,
                height: 72,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.green100,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'AN',
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontDisplay,
                    fontWeight: FontWeight.w700,
                    fontSize: 22,
                    color: AppColors.green700,
                  ),
                ),
              ),
              Positioned(
                right: -4,
                bottom: -4,
                child: GestureDetector(
                  onTap: () {
                    // TODO: brancher le changement de photo de profil.
                  },
                  child: Container(
                    width: 26,
                    height: 26,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.green700,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.card, width: 2),
                    ),
                    child: const Icon(
                      Icons.camera_alt_outlined,
                      size: 13,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Text(
            'Dr. Aïcha Ngo',
            style: TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 3),
          const Text(
            'Pédiatre · Douala — Bonapriso',
            style: TextStyle(fontSize: 12.5, color: AppColors.inkSoft),
          ),
          const SizedBox(height: 12),
          const Wrap(
            alignment: WrapAlignment.center,
            spacing: 6,
            runSpacing: 6,
            children: [
              BadgeChip(
                label: "Vérifiée à l'Ordre",
                icon: Icons.verified_outlined,
                style: BadgeChipStyle.green,
              ),
              BadgeChip(
                label: 'Visible par les patients',
                icon: Icons.visibility_outlined,
                style: BadgeChipStyle.amber,
              ),
            ],
          ),
          const SizedBox(height: 16),
          const _StatRow(),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: AppOutlineButton(
              label: 'Modifier le profil',
              icon: Icons.edit_outlined,
              onPressed: () {
                // TODO: brancher l'écran d'édition du profil public.
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Ligne de statistiques du profil — équivalent de `.stat-row`
/// (note, avis, ancienneté), séparée du reste par un simple filet.
class _StatRow extends StatelessWidget {
  const _StatRow();

  Widget _stat(String value, String label) => Expanded(
    child: Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            fontFamily: AppTextStyles.fontMono,
            fontWeight: FontWeight.w600,
            fontSize: 15,
            color: AppColors.ink,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(
            fontFamily: AppTextStyles.fontDisplay,
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: AppColors.inkFaint,
            letterSpacing: 0.3,
          ),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.only(top: 14),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          _stat('4.8', 'NOTE'),
          _stat('126', 'AVIS'),
          _stat('10 ans', 'EXERCICE'),
        ],
      ),
    );
  }
}

/// ------------------------------------------------------------
/// Onglets façon pilule segmentée — repris à l'identique de
/// `portail-medecin-rdv.dart` pour rester cohérent visuellement.
/// ------------------------------------------------------------
class _SegmentedTabs extends StatelessWidget {
  final TabController controller;
  final List<_TabDef> tabs;

  const _SegmentedTabs({required this.controller, required this.tabs});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(100),
        boxShadow: AppColors.shadowCard,
      ),
      child: AnimatedBuilder(
        animation: controller,
        builder: (context, _) {
          return Row(
            children: List.generate(tabs.length, (index) {
              final def = tabs[index];
              final active = controller.index == index;
              return Expanded(
                child: GestureDetector(
                  onTap: () => controller.animateTo(index),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding:
                    const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                    decoration: BoxDecoration(
                      color: active ? AppColors.primary : Colors.transparent,
                      borderRadius: BorderRadius.circular(100),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Flexible(
                          child: Text(
                            def.label,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontFamily: AppTextStyles.fontDisplay,
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                              color: active ? Colors.white : AppColors.inkSoft,
                            ),
                          ),
                        ),
                        if (def.count != null) ...[
                          const SizedBox(width: 5),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 1,
                            ),
                            decoration: BoxDecoration(
                              color: active
                                  ? Colors.white.withOpacity(0.22)
                                  : AppColors.green100,
                              borderRadius: BorderRadius.circular(100),
                            ),
                            child: Text(
                              '${def.count}',
                              style: TextStyle(
                                fontFamily: AppTextStyles.fontDisplay,
                                fontSize: 9.5,
                                fontWeight: FontWeight.w700,
                                color:
                                active ? Colors.white : AppColors.green700,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              );
            }),
          );
        },
      ),
    );
  }
}

/// ------------------------------------------------------------
/// Bloc d'information générique — équivalent de `.info-block`,
/// avec une icône de titre et une action "Modifier" optionnelle
/// (absente côté patient dans profil-medecin.html, ajoutée ici
/// puisqu'il s'agit du profil du praticien lui-même).
/// ------------------------------------------------------------
class _InfoBlock extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Widget child;

  const _InfoBlock({
    required this.icon,
    required this.title,
    required this.child,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: AppColors.green700),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontFamily: AppTextStyles.fontDisplay,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
              ),
              if (actionLabel != null)
                GestureDetector(
                  onTap: onAction,
                  child: Text(
                    actionLabel!,
                    style: const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.green700,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

/// Ligne "clé / valeur" — équivalent de `.hours-row` (formation,
/// horaires). Le filet du CSS est en pointillés ; repris ici en
/// trait plein (`AppColors.line`), faute d'équivalent direct.
class _HoursRow extends StatelessWidget {
  final String label;
  final String value;
  final bool dimmed;

  const _HoursRow({
    required this.label,
    required this.value,
    this.dimmed = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 6),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: AppColors.inkSoft,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontFamily: AppTextStyles.fontMono,
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: dimmed ? AppColors.inkFaint : AppColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}

/// Puce ronde — équivalent de `.pill` (langues, assurances).
class _Pill extends StatelessWidget {
  final String label;
  const _Pill({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.paper,
        border: Border.all(color: AppColors.lineStrong),
        borderRadius: BorderRadius.circular(100),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontFamily: AppTextStyles.fontDisplay,
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: AppColors.inkSoft,
        ),
      ),
    );
  }
}

/// ------------------------------------------------------------
/// Panneau "Présentation" — équivalent de `#p-presentation`.
/// ------------------------------------------------------------
class _PanelPresentation extends StatelessWidget {
  const _PanelPresentation();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InfoBlock(
          icon: Icons.description_outlined,
          title: 'À propos',
          actionLabel: 'Modifier',
          onAction: () {
            // TODO: brancher l'édition du texte de présentation.
          },
          child: const Text(
            "Le Dr. Aïcha Ngo exerce la pédiatrie depuis plus de 10 ans "
                "à Douala. Son cabinet accueille les enfants de la naissance "
                "à l'adolescence, pour le suivi de croissance, les "
                "vaccinations et les consultations générales. Consultations "
                "disponibles au cabinet ou en téléconsultation.",
            style: TextStyle(
              fontSize: 12,
              height: 1.6,
              color: AppColors.inkSoft,
            ),
          ),
        ),
        _InfoBlock(
          icon: Icons.school_outlined,
          title: 'Formation & expérience',
          child: const Column(
            children: [
              _HoursRow(
                label: 'Doctorat en médecine',
                value: 'Univ. de Douala',
              ),
              _HoursRow(
                label: 'Spécialisation pédiatrie',
                value: '10 ans',
              ),
              _HoursRow(
                label: 'Ordre National des Médecins',
                value: 'Membre',
                dimmed: true,
              ),
            ],
          ),
        ),
        _InfoBlock(
          icon: Icons.language_outlined,
          title: 'Langues parlées',
          actionLabel: 'Modifier',
          onAction: () {
            // TODO: brancher l'édition des langues parlées.
          },
          child: const Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _Pill(label: 'Français'),
              _Pill(label: 'Anglais'),
              _Pill(label: 'Douala'),
            ],
          ),
        ),
      ],
    );
  }
}

/// ------------------------------------------------------------
/// Panneau "Horaires" — équivalent de `#p-horaires`.
/// ------------------------------------------------------------
class _PanelHoraires extends StatelessWidget {
  const _PanelHoraires();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InfoBlock(
          icon: Icons.access_time,
          title: "Horaires d'ouverture",
          actionLabel: 'Modifier',
          onAction: () {
            // TODO: brancher l'édition des horaires d'ouverture.
          },
          child: const Column(
            children: [
              _HoursRow(label: 'Lundi – Vendredi', value: '08:00 – 17:00'),
              _HoursRow(label: 'Samedi', value: '08:00 – 13:00'),
              _HoursRow(label: 'Dimanche', value: 'Fermé', dimmed: true),
            ],
          ),
        ),
        _InfoBlock(
          icon: Icons.location_on_outlined,
          title: 'Localisation',
          actionLabel: 'Modifier',
          onAction: () {
            // TODO: brancher l'édition de l'adresse du cabinet.
          },
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Rue des Manguiers, Bonapriso, Douala',
                style: TextStyle(fontSize: 12, color: AppColors.inkSoft),
              ),
              const SizedBox(height: 10),
              Container(
                height: 120,
                width: double.infinity,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.green50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.lineStrong),
                ),
                child: const Icon(
                  Icons.map_outlined,
                  size: 26,
                  color: AppColors.green700,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// ------------------------------------------------------------
/// Panneau "Avis" — équivalent de `#p-avis`, construit sur
/// `CardSurface` pour chaque avis (`.review-card`).
/// ------------------------------------------------------------
class _PanelAvis extends StatelessWidget {
  const _PanelAvis();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _ReviewCard(
          initials: 'MT',
          name: 'Marie T.',
          rating: 5,
          comment:
          "Très à l'écoute, mon fils s'est senti en confiance dès la "
              "première visite.",
        ),
        _ReviewCard(
          initials: 'PK',
          name: 'Paul K.',
          rating: 4,
          comment:
          "Rendez-vous respecté à l'heure, explications claires sur "
              "le traitement.",
        ),
        _ReviewCard(
          initials: 'SN',
          name: 'Sarah N.',
          rating: 5,
          comment:
          'Téléconsultation très pratique, ordonnance reçue le jour '
              'même.',
        ),
      ],
    );
  }
}

class _ReviewCard extends StatelessWidget {
  final String initials;
  final String name;
  final int rating;
  final String comment;

  const _ReviewCard({
    required this.initials,
    required this.name,
    required this.rating,
    required this.comment,
  });

  @override
  Widget build(BuildContext context) {
    return CardSurface(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 30,
                height: 30,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: AppColors.green100,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  initials,
                  style: const TextStyle(
                    fontFamily: AppTextStyles.fontDisplay,
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                    color: AppColors.green700,
                  ),
                ),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: const TextStyle(
                        fontFamily: AppTextStyles.fontDisplay,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: List.generate(5, (i) {
                        return Icon(
                          Icons.star_rounded,
                          size: 11,
                          color: i < rating
                              ? AppColors.amber500
                              : AppColors.lineStrong,
                        );
                      }),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
          Text(
            comment,
            style: const TextStyle(
              fontSize: 11.5,
              height: 1.55,
              color: AppColors.inkSoft,
            ),
          ),
        ],
      ),
    );
  }
}

/// ------------------------------------------------------------
/// Panneau "Tarifs" — équivalent de `#p-tarifs`.
/// ------------------------------------------------------------
class _PanelTarifs extends StatelessWidget {
  const _PanelTarifs();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InfoBlock(
          icon: Icons.payments_outlined,
          title: 'Tarifs des consultations',
          actionLabel: 'Modifier',
          onAction: () {
            // TODO: brancher l'édition de la grille tarifaire.
          },
          child: const Column(
            children: [
              _PriceRow(label: 'Consultation standard', price: '15 000 FCFA'),
              _PriceRow(label: 'Téléconsultation', price: '10 000 FCFA'),
              _PriceRow(label: 'Suivi vaccinal', price: '8 000 FCFA'),
            ],
          ),
        ),
        _InfoBlock(
          icon: Icons.shield_outlined,
          title: 'Assurances acceptées',
          actionLabel: 'Modifier',
          onAction: () {
            // TODO: brancher l'édition des assurances acceptées.
          },
          child: const Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _Pill(label: 'Activa Assurances'),
              _Pill(label: 'Saham Assurance Cameroun'),
              _Pill(label: 'NSIA Assurances'),
            ],
          ),
        ),
      ],
    );
  }
}

/// Ligne "prestation / prix" — équivalent de `.price-row`.
class _PriceRow extends StatelessWidget {
  final String label;
  final String price;

  const _PriceRow({required this.label, required this.price});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 9),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.inkSoft,
            ),
          ),
          Text(
            price,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontMono,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: AppColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}