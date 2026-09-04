import 'package:flutter/material.dart';
// Bibliothèque de composants partagée (design tokens, cartes, boutons,
// alertes, navigation basse). Adapter le chemin selon l'emplacement réel
// de ce fichier dans le projet (ex: 'package:aps/components/components.dart'
// ou '../components/components.dart').
import '../../../components/components.dart';

/// ============================================================
/// portail-medecin-rdv.dart
///
/// Portage Flutter de la maquette HTML "APS — Rendez-vous
/// (espace médecin, mobile)".
///
/// Cette version est reconstruite sur la bibliothèque de composants
/// partagée (`lib/components/`) plutôt que de dupliquer ses propres
/// design tokens et widgets :
/// - `AppColors` / `AppTextStyles` / `AppRadius` remplacent l'ancienne
///   classe privée `_C`.
/// - `BadgeChip` remplace l'ancien `_Badge`.
/// - `RdvButton` / `AppOutlineButton` remplacent l'ancien `_AppBtn`
///   (types primary / ghost). Seul le type "danger" (bouton "Refuser")
///   n'a pas d'équivalent direct dans la bibliothèque : il est repris
///   ici via `_DangerOutlineButton`, construit sur le même gabarit
///   visuel que `CallButton` / `AppOutlineButton`.
/// - `AppAlert` remplace l'ancien bandeau `_Notice`.
/// - `CardSurface` / `GuardDot` habillent le bandeau praticien.
/// - `AppBottomNav` remplace `MedecinBottomNavigationBar`, avec des
///   rubriques adaptées à l'espace médecin (Accueil, Rendez-vous,
///   Patients, Profil) et un bouton flottant central "Nouveau".
///
/// Un seul écran à onglets : À venir / En attente / Terminés / Annulés.
/// ============================================================

/// ------------------------------------------------------------
/// Page principale
/// ------------------------------------------------------------
class PortailMedecinRdv extends StatefulWidget {
  const PortailMedecinRdv({super.key});

  @override
  State<PortailMedecinRdv> createState() => _PortailMedecinRdvState();
}

class _PortailMedecinRdvState extends State<PortailMedecinRdv>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  /// Rubrique active de la barre de navigation basse (1 = "Rendez-vous",
  /// puisque c'est l'écran courant).
  int _navIndex = 1;

  final List<_TabDef> _tabs = const [
    _TabDef(label: 'À venir', count: 5),
    _TabDef(label: 'En attente', count: 3),
    _TabDef(label: 'Terminés', count: null),
    _TabDef(label: 'Annulés', count: null),
  ];

  /// Rubriques de l'espace médecin (distinctes de celles de l'espace
  /// patient définies par défaut dans `AppBottomNav.defaultItems`).
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
                  const _DoctorStrip(),
                  const SizedBox(height: 2),
                  const _StatLine(),
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
                        _PanelAvenir(),
                        _PanelAttente(),
                        _PanelTermines(),
                        _PanelAnnules(),
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
                  // TODO: brancher le flux "Nouveau rendez-vous" (créneau
                  // ajouté manuellement par le médecin).
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
            'Rendez-vous',
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
/// Bandeau praticien — construit sur `CardSurface`, le même
/// conteneur "carte" (fond blanc, bordure, radius, ombre) que
/// `CardMedecin` / `CardStructure` etc.
/// ------------------------------------------------------------
class _DoctorStrip extends StatelessWidget {
  const _DoctorStrip();

  @override
  Widget build(BuildContext context) {
    return CardSurface(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.primary,
              shape: BoxShape.circle,
            ),
            child: const Text(
              'EK',
              style: TextStyle(
                fontFamily: AppTextStyles.fontDisplay,
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: const [
                    Flexible(
                      child: Text(
                        'Dr Émile Kammogne',
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontFamily: AppTextStyles.fontDisplay,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink,
                        ),
                      ),
                    ),
                    SizedBox(width: 5),
                    Icon(Icons.check_circle, size: 14, color: AppColors.green600),
                  ],
                ),
                const SizedBox(height: 2),
                const Text(
                  'Médecine générale · Douala, Akwa',
                  style: TextStyle(fontSize: 11.5, color: AppColors.inkSoft),
                ),
              ],
            ),
          ),
          // Statut "Disponible" — même logique que le `GuardDot` utilisé
          // par `CardPharmacie`, appliquée ici au praticien.
          Container(
            padding: const EdgeInsets.fromLTRB(7, 5, 9, 5),
            decoration: BoxDecoration(
              color: AppColors.green50,
              border: Border.all(color: AppColors.green100),
              borderRadius: BorderRadius.circular(100),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                GuardDot(active: true),
                Text(
                  'Disponible',
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontDisplay,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.green700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// ------------------------------------------------------------
/// Ligne de statistiques discrète
/// ------------------------------------------------------------
class _StatLine extends StatelessWidget {
  const _StatLine();

  Widget _sep() => Container(
    width: 3,
    height: 3,
    decoration: const BoxDecoration(
      color: AppColors.lineStrong,
      shape: BoxShape.circle,
    ),
  );

  Widget _stat(String value, String label) => Text.rich(
    TextSpan(
      children: [
        TextSpan(
          text: '$value ',
          style: const TextStyle(
            fontFamily: AppTextStyles.fontMono,
            fontWeight: FontWeight.w600,
            color: AppColors.ink,
            fontSize: 12,
          ),
        ),
        TextSpan(
          text: label,
          style: const TextStyle(color: AppColors.inkSoft, fontSize: 12),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 2, 4, 14),
      child: Row(
        children: [
          _stat('8', "aujourd'hui"),
          const SizedBox(width: 14),
          _sep(),
          const SizedBox(width: 14),
          _stat('32', 'cette semaine'),
          const SizedBox(width: 14),
          _sep(),
          const SizedBox(width: 14),
          _stat('5', 'en visio'),
        ],
      ),
    );
  }
}

/// ------------------------------------------------------------
/// Onglets façon pilule segmentée
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
                                color: active ? Colors.white : AppColors.green700,
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
/// En-tête de section
/// ------------------------------------------------------------
class _SectionHead extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;
  final EdgeInsets margin;

  const _SectionHead({
    required this.title,
    this.actionLabel,
    this.onAction,
    this.margin = const EdgeInsets.fromLTRB(2, 4, 2, 9),
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: margin,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppColors.inkSoft,
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
    );
  }
}

/// ------------------------------------------------------------
/// Bouton "Refuser" — variante danger du bouton contour.
///
/// La bibliothèque partagée ne fournit pas de bouton contour
/// "danger" (`AppOutlineButton` est neutre, `CallButton` est plein
/// et dédié à l'appel). Repris ici sur le même gabarit visuel
/// (radius 9, padding 12/8) pour rester cohérent avec `CallButton` /
/// `RdvButton` / `AppOutlineButton`.
/// ------------------------------------------------------------
class _DangerOutlineButton extends StatelessWidget {
  const _DangerOutlineButton({
    required this.label,
    required this.onPressed,
    this.icon,
  });

  final String label;
  final VoidCallback onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon ?? Icons.close, size: 13, color: AppColors.dangerDark),
      label: Text(
        label,
        style: AppTextStyles.buttonLabel
            .copyWith(fontSize: 12, color: AppColors.dangerDark),
      ),
      style: OutlinedButton.styleFrom(
        backgroundColor: AppColors.card,
        side: const BorderSide(color: AppColors.dangerLight),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: RoundedRectangleBorder(borderRadius: AppRadius.smRadius),
      ),
    );
  }
}

/// ------------------------------------------------------------
/// Carte rendez-vous
///
/// Pas d'équivalent direct dans la bibliothèque (créneau horaire +
/// avatar + double sous-titre + bordure de gauche en cas d'urgence),
/// mais entièrement réalisée avec les design tokens `AppColors` /
/// `AppTextStyles` / `AppRadius` pour rester cohérente avec le reste
/// de l'app.
/// ------------------------------------------------------------
class _AppointmentCard extends StatelessWidget {
  final String time;
  final String dateLabel;
  final String initials;
  final String name;
  final String subtitle;
  final String subtitle2;

  /// Contenu libre affiché sous le sous-titre (badge seul, `_Frow`
  /// badge + bouton, ou paire de boutons Accepter/Refuser).
  final Widget bottom;

  final bool urgent;
  final bool past;

  const _AppointmentCard({
    required this.time,
    required this.dateLabel,
    required this.initials,
    required this.name,
    required this.subtitle,
    required this.subtitle2,
    required this.bottom,
    this.urgent = false,
    this.past = false,
  });

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: past ? 0.85 : 1,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: AppColors.card,
          border: Border(
            top: const BorderSide(color: AppColors.line),
            right: const BorderSide(color: AppColors.line),
            bottom: const BorderSide(color: AppColors.line),
            left: BorderSide(
              color: urgent ? AppColors.warning : AppColors.line,
              width: urgent ? 3 : 1,
            ),
          ),
          borderRadius: AppRadius.mdRadius,
          boxShadow: AppColors.shadowCard,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 46,
              child: Column(
                children: [
                  Text(
                    time,
                    style: const TextStyle(
                      fontFamily: AppTextStyles.fontMono,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.ink,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    dateLabel,
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppColors.inkFaint,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 26,
                        height: 26,
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
                            fontSize: 10,
                            color: AppColors.green700,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          name,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: AppTextStyles.fontDisplay,
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                            color: AppColors.ink,
                          ),
                        ),
                      ),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 5, bottom: 9),
                    child: Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          subtitle,
                          style: const TextStyle(
                            fontSize: 11.5,
                            color: AppColors.inkSoft,
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 5),
                          child: Container(
                            width: 2.5,
                            height: 2.5,
                            decoration: const BoxDecoration(
                              color: AppColors.inkFaint,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                        Text(
                          subtitle2,
                          style: const TextStyle(
                            fontSize: 11.5,
                            color: AppColors.inkSoft,
                          ),
                        ),
                      ],
                    ),
                  ),
                  bottom,
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Ligne badge (+ éventuel bouton) alignée en `space-between`.
class _Frow extends StatelessWidget {
  final Widget badge;
  final Widget? action;
  const _Frow({required this.badge, this.action});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      alignment: WrapAlignment.spaceBetween,
      runSpacing: 8,
      children: [
        badge,
        if (action != null) action!,
      ],
    );
  }
}

/// Paire de boutons Accepter / Refuser — `RdvButton` (primary) et
/// `_DangerOutlineButton` (danger), tous deux étirés par `Expanded`.
class _TwoActions extends StatelessWidget {
  final VoidCallback? onAccept;
  final VoidCallback? onDecline;
  const _TwoActions({this.onAccept, this.onDecline});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        children: [
          Expanded(
            child: RdvButton(
              label: 'Accepter',
              icon: Icons.check,
              onPressed: onAccept ?? () {},
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _DangerOutlineButton(
              label: 'Refuser',
              icon: Icons.close,
              onPressed: onDecline ?? () {},
            ),
          ),
        ],
      ),
    );
  }
}

/// ------------------------------------------------------------
/// Panneau "À venir"
/// ------------------------------------------------------------
class _PanelAvenir extends StatelessWidget {
  const _PanelAvenir();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHead(title: "Aujourd'hui", actionLabel: 'Agenda complet'),
        _AppointmentCard(
          time: '09:30',
          dateLabel: 'Auj.',
          initials: 'MN',
          name: 'Marie Ngo Bell',
          subtitle: 'Consultation générale',
          subtitle2: 'Cabinet',
          bottom: _Frow(
            badge: BadgeChip(
              label: 'Payé · séquestre',
              style: BadgeChipStyle.green,
              icon: Icons.account_balance_wallet_outlined,
            ),
            action: AppOutlineButton(
              label: 'Dossier',
              icon: Icons.description_outlined,
              onPressed: () {},
            ),
          ),
        ),
        _AppointmentCard(
          time: '10:15',
          dateLabel: 'Auj.',
          initials: 'JM',
          name: 'Jean-Paul Mbarga',
          subtitle: 'Consultation générale',
          subtitle2: 'Téléconsultation',
          bottom: _Frow(
            badge: BadgeChip(
              label: 'Payé · séquestre',
              style: BadgeChipStyle.green,
              icon: Icons.account_balance_wallet_outlined,
            ),
            action: RdvButton(
              label: 'Démarrer la visio',
              icon: Icons.videocam_outlined,
              onPressed: () {},
            ),
          ),
        ),
        _AppointmentCard(
          time: '14:00',
          dateLabel: 'Auj.',
          initials: 'CE',
          name: 'Clarisse Etoundi',
          subtitle: 'Consultation de suivi',
          subtitle2: 'Cabinet',
          bottom: _Frow(
            badge: BadgeChip(label: 'Payé · séquestre', style: BadgeChipStyle.green),
            action: AppOutlineButton(label: 'Dossier', onPressed: () {}),
          ),
        ),
        const _SectionHead(
          title: 'À venir',
          margin: EdgeInsets.fromLTRB(2, 18, 2, 9),
        ),
        _AppointmentCard(
          time: '09:00',
          dateLabel: 'Jeu 20',
          initials: 'SN',
          name: 'Serge Nkolo',
          subtitle: 'Consultation générale',
          subtitle2: 'Téléconsultation',
          bottom: _Frow(
            badge: BadgeChip(label: 'Payé · séquestre', style: BadgeChipStyle.green),
            action: AppOutlineButton(label: 'Dossier', onPressed: () {}),
          ),
        ),
        _AppointmentCard(
          time: '11:30',
          dateLabel: 'Ven 21',
          initials: 'AD',
          name: 'Aïcha Diallo',
          subtitle: 'Vaccination',
          subtitle2: 'Cabinet',
          bottom: _Frow(
            badge: BadgeChip(label: 'Payé · séquestre', style: BadgeChipStyle.green),
            action: AppOutlineButton(label: 'Dossier', onPressed: () {}),
          ),
        ),
        const Padding(
          padding: EdgeInsets.only(top: 16, bottom: 4),
          child: Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.account_balance_wallet_outlined,
                    size: 12, color: AppColors.inkFaint),
                SizedBox(width: 6),
                Text(
                  'Fonds libérés après chaque consultation.',
                  style: TextStyle(fontSize: 11, color: AppColors.inkFaint),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// ------------------------------------------------------------
/// Panneau "En attente"
/// ------------------------------------------------------------
class _PanelAttente extends StatelessWidget {
  const _PanelAttente();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const AppAlert(
          type: AppAlertType.primary,
          message: 'Acceptez ou refusez chaque demande : les fonds sont '
              'capturés après votre acceptation uniquement.',
        ),
        const SizedBox(height: 14),
        const _SectionHead(title: 'Demandes en attente'),
        _AppointmentCard(
          time: '16:45',
          dateLabel: 'Auj.',
          initials: 'PB',
          name: 'Paul Biyong',
          subtitle: 'Consultation urgente',
          subtitle2: 'Cabinet',
          urgent: true,
          bottom: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BadgeChip(
                label: 'Réponse avant 18:00',
                icon: Icons.access_time,
                style: BadgeChipStyle.amber,
              ),
              _TwoActions(),
            ],
          ),
        ),
        _AppointmentCard(
          time: '15:30',
          dateLabel: 'Jeu 20',
          initials: 'FA',
          name: 'Florence Abena',
          subtitle: 'Consultation générale',
          subtitle2: 'Téléconsultation',
          bottom: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BadgeChip(
                label: 'Réponse avant demain 12:00',
                style: BadgeChipStyle.amber,
              ),
              _TwoActions(),
            ],
          ),
        ),
        _AppointmentCard(
          time: '10:00',
          dateLabel: 'Sam 22',
          initials: 'RT',
          name: 'Rodrigue Temgoua',
          subtitle: 'Consultation générale',
          subtitle2: 'Cabinet',
          bottom: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BadgeChip(
                label: 'Réponse avant vendredi 18:00',
                style: BadgeChipStyle.amber,
              ),
              _TwoActions(),
            ],
          ),
        ),
      ],
    );
  }
}

/// ------------------------------------------------------------
/// Panneau "Terminés"
/// ------------------------------------------------------------
class _PanelTermines extends StatelessWidget {
  const _PanelTermines();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionHead(title: 'Terminés · fonds libérés'),
        _AppointmentCard(
          time: '09:00',
          dateLabel: 'Mar 18',
          initials: 'HM',
          name: 'Hortense Manga',
          subtitle: 'Consultation de suivi',
          subtitle2: 'Cabinet',
          past: true,
          bottom: _Frow(
            badge: BadgeChip(label: '15 000 FCFA libérés', style: BadgeChipStyle.green),
            action: AppOutlineButton(
              label: 'Compte rendu',
              icon: Icons.description_outlined,
              onPressed: () {},
            ),
          ),
        ),
        _AppointmentCard(
          time: '11:00',
          dateLabel: 'Mar 18',
          initials: 'YK',
          name: 'Yves Kouam',
          subtitle: 'Certificat médical',
          subtitle2: 'Cabinet',
          past: true,
          bottom: _Frow(
            badge: BadgeChip(label: '20 000 FCFA libérés', style: BadgeChipStyle.green),
            action: AppOutlineButton(label: 'Compte rendu', onPressed: () {}),
          ),
        ),
        _AppointmentCard(
          time: '10:30',
          dateLabel: 'Lun 17',
          initials: 'SE',
          name: 'Solange Epée',
          subtitle: 'Consultation générale',
          subtitle2: 'Cabinet',
          past: true,
          bottom: _Frow(
            badge: BadgeChip(label: '15 000 FCFA libérés', style: BadgeChipStyle.green),
            action: AppOutlineButton(label: 'Compte rendu', onPressed: () {}),
          ),
        ),
      ],
    );
  }
}

/// ------------------------------------------------------------
/// Panneau "Annulés"
/// ------------------------------------------------------------
class _PanelAnnules extends StatelessWidget {
  const _PanelAnnules();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionHead(title: 'Annulés'),
        _AppointmentCard(
          time: '15:00',
          dateLabel: 'Lun 17',
          initials: 'DF',
          name: 'Didier Fouda',
          subtitle: 'Consultation générale',
          subtitle2: 'Annulé par le patient',
          past: true,
          bottom: _Frow(
            badge: BadgeChip(label: 'Remboursement automatique', style: BadgeChipStyle.outline),
            action: AppOutlineButton(
              label: 'Reprogrammer',
              icon: Icons.refresh,
              onPressed: () {},
            ),
          ),
        ),
        _AppointmentCard(
          time: '09:30',
          dateLabel: 'Sam 15',
          initials: 'JM',
          name: 'Justine Mvondo',
          subtitle: 'Consultation de suivi',
          subtitle2: 'Annulé par vous',
          past: true,
          bottom: _Frow(
            badge: BadgeChip(label: 'Annulé', style: BadgeChipStyle.outline),
            action: AppOutlineButton(label: 'Reprogrammer', onPressed: () {}),
          ),
        ),
      ],
    );
  }
}