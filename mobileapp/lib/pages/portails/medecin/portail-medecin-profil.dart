import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// Bibliothèque de composants partagée (design tokens, cartes, boutons,
// alertes, navigation basse). Adapter le chemin selon l'emplacement réel
// de ce fichier dans le projet, comme dans portail-medecin-rdv.dart.
import '../../../components/components.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/medecin_controller.dart';
import '../../../models/medecin_models.dart';
import '../../../repositories/medecin_repository.dart' show ApiException;

/// ============================================================
/// portail-medecin-profil.dart — VERSION ADAPTÉE
///
/// Affiche le profil RÉEL du médecin connecté (GET
/// /medecins/mon-profil), dans le même esprit que
/// portail-medecin-rdv.dart, mais cette fois via le controller
/// Riverpod dédié du module "Gestion des médecins" :
/// - `authTokenProvider` fournit le token du médecin connecté.
/// - `monProfilMedecinControllerProvider`
///   (`MonProfilMedecinController.charger`) récupère la fiche + les
///   statistiques d'avis depuis le backend et porte tout l'état
///   (chargement / erreur / données) — ce widget ne fait plus lui-même
///   d'appel HTTP.
/// - `MonProfilMedecinController.charger` utilise
///   `AsyncLoading.copyWithPrevious` : pendant un rafraîchissement
///   (pull-to-refresh), l'ancien profil reste affiché au lieu d'être
///   remplacé par un écran de chargement plein écran.
/// - Les actions "Modifier" de cette page sont pour l'instant de
///   simples TODO ; elles sont destinées à s'appuyer sur
///   `modificationMedecinControllerProvider`
///   (`ModificationMedecinController.modifier`) une fois les écrans
///   d'édition construits.
///
/// ⚠️ Périmètre des données réellement disponibles ici (voir
/// medecin_models.dart / medecin_repository.dart / medecin_controller.dart) :
/// - Identité, spécialité, ville/pays d'exercice, numéro d'ordre,
///   statut de vérification, biographie, tarif indicatif,
///   téléconsultation, LinkedIn, documents (CNI/attestation/CV),
///   photo : RÉELS (fiche Medecin).
/// - Note moyenne + nombre total d'avis publiés : RÉELS
///   (StatistiquesAvisMedecin).
/// - Le DÉTAIL des avis (auteur, commentaire, note individuelle),
///   les HORAIRES d'ouverture et les ASSURANCES acceptées ne sont PAS
///   modélisés dans ce périmètre backend (modules Avis médecin /
///   Agenda / Moyens de paiement, hors scope de medecin_repository.dart
///   — voir son en-tête) : ces sections affichent donc un état vide
///   explicite plutôt que des données inventées, avec un TODO pointant
///   vers le repository dédié à brancher plus tard.
/// ============================================================

/// ------------------------------------------------------------
/// Page principale
/// ------------------------------------------------------------
class PortailMedecinProfil extends ConsumerStatefulWidget {
  const PortailMedecinProfil({super.key});

  @override
  ConsumerState<PortailMedecinProfil> createState() =>
      _PortailMedecinProfilState();
}

class _PortailMedecinProfilState extends ConsumerState<PortailMedecinProfil>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  /// Rubrique active de la barre de navigation basse (3 = "Profil",
  /// puisque c'est l'écran courant).
  int _navIndex = 3;

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
    _tabController = TabController(length: 4, vsync: this);
    // Au montage du widget, demander au controller de charger le
    // profil réel du médecin connecté.
    WidgetsBinding.instance.addPostFrameCallback((_) => _chargerProfil());
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  /// Déclenche `MonProfilMedecinController.charger`. Utilisé au
  /// montage ET comme callback de `RefreshIndicator` / bouton
  /// "Réessayer" : le controller gère lui-même le
  /// chargement/erreur/données (`AsyncNotifier<MonProfilMedecin?>`).
  Future<void> _chargerProfil() async {
    final token = ref.read(authTokenProvider);
    if (token == null) return; // Session absente : rien à charger.
    await ref
        .read(monProfilMedecinControllerProvider.notifier)
        .charger(token: token);
  }

  List<_TabDef> _tabsAvec(int? avisCount) => [
    const _TabDef(label: 'Présentation'),
    const _TabDef(label: 'Horaires'),
    _TabDef(label: 'Avis', count: avisCount),
    const _TabDef(label: 'Tarifs'),
  ];

  @override
  Widget build(BuildContext context) {
    final profilAsync = ref.watch(monProfilMedecinControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.paper,
      extendBody: true,
      body: SafeArea(
        child: Stack(
          children: [
            _buildCorps(context, profilAsync),
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

  Widget _buildCorps(
      BuildContext context,
      AsyncValue<MonProfilMedecin?> profilAsync,
      ) {
    final profil = profilAsync.value;

    // Aucune donnée encore disponible (premier chargement, ou session
    // absente tant que le token n'a pas été résolu).
    if (profil == null) {
      if (profilAsync.hasError) {
        return _buildErreur(profilAsync.error!);
      }
      return const Center(child: CircularProgressIndicator());
    }

    // Le controller conserve les données précédentes pendant un
    // rafraîchissement (`copyWithPrevious`) : on affiche donc toujours
    // le contenu dès qu'on a une valeur, même si `profilAsync` est en
    // cours de chargement ou est passé en erreur en tâche de fond — le
    // pull-to-refresh porte alors son propre indicateur.
    final medecin = profil.medecin;
    final statistiques = profil.statistiques;
    final tabs = _tabsAvec(statistiques.totalAvis);

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _chargerProfil,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 110),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _PageHead(),
            _ProfileHero(medecin: medecin, statistiques: statistiques),
            const SizedBox(height: 2),
            _SegmentedTabs(controller: _tabController, tabs: tabs),
            const SizedBox(height: 16),
            // Hauteur fixe simple : sur un vrai écran, préférer un
            // IndexedStack ou laisser le TabBarView dans un Expanded
            // si la page entière n'est pas scrollable.
            SizedBox(
              height: MediaQuery.of(context).size.height,
              child: TabBarView(
                controller: _tabController,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _PanelPresentation(medecin: medecin),
                  _PanelHoraires(medecin: medecin),
                  _PanelAvis(statistiques: statistiques),
                  _PanelTarifs(medecin: medecin),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Affiché uniquement quand `monProfilMedecinControllerProvider` n'a
  /// jamais eu de valeur (échec du tout premier chargement) : sinon
  /// `_buildCorps` continue d'afficher les dernières données connues.
  Widget _buildErreur(Object erreur) {
    final message = erreur is ApiException
        ? erreur.message
        : 'Impossible de charger le profil pour le moment.';
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 32, color: AppColors.inkFaint),
            const SizedBox(height: 10),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft),
            ),
            const SizedBox(height: 14),
            AppOutlineButton(
              label: 'Réessayer',
              icon: Icons.refresh_rounded,
              onPressed: _chargerProfil,
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
/// En-tête du profil — équivalent de `.profile-hero`, alimenté par la
/// fiche `Medecin` réelle (utilisateur, spécialité, ville/pays
/// d'exercice, photo, statut de vérification).
/// ------------------------------------------------------------
class _ProfileHero extends StatelessWidget {
  final Medecin medecin;
  final StatistiquesAvisMedecin statistiques;

  const _ProfileHero({required this.medecin, required this.statistiques});

  String get _nomAffiche {
    final u = medecin.utilisateur;
    if (u == null || (u.nom.isEmpty && u.prenom.isEmpty)) return 'Médecin';
    return 'Dr. ${u.prenom} ${u.nom}'.trim();
  }

  String get _initiales {
    final u = medecin.utilisateur;
    var init = '';
    if (u?.prenom.isNotEmpty == true) init += u!.prenom[0].toUpperCase();
    if (u?.nom.isNotEmpty == true) init += u!.nom[0].toUpperCase();
    return init.isNotEmpty ? init : '?';
  }

  String get _sousTitre {
    final specialite = medecin.specialite?.nom;
    final ville = medecin.villeExercice?.nom;
    if (specialite == null && ville == null) return '';
    if (specialite == null) return ville!;
    if (ville == null) return specialite;
    return '$specialite · $ville';
  }

  @override
  Widget build(BuildContext context) {
    final photoUrl = medecin.photoUrl;

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
                clipBehavior: Clip.antiAlias,
                child: (photoUrl != null && photoUrl.isNotEmpty)
                    ? Image.network(
                  photoUrl,
                  width: 72,
                  height: 72,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) => Text(
                    _initiales,
                    style: const TextStyle(
                      fontFamily: AppTextStyles.fontDisplay,
                      fontWeight: FontWeight.w700,
                      fontSize: 22,
                      color: AppColors.green700,
                    ),
                  ),
                )
                    : Text(
                  _initiales,
                  style: const TextStyle(
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
                    // TODO: brancher le changement de photo de profil
                    // (MedecinRepository.modifierMedecin, champ photo).
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
          Text(
            _nomAffiche,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          if (_sousTitre.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(
              _sousTitre,
              style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft),
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 6,
            runSpacing: 6,
            children: [
              if (medecin.statutVerification ==
                  StatutVerificationMedecin.publie)
                const BadgeChip(
                  label: "Vérifiée à l'Ordre",
                  icon: Icons.verified_outlined,
                  style: BadgeChipStyle.green,
                )
              else if (medecin.statutVerification ==
                  StatutVerificationMedecin.enCours)
                const BadgeChip(
                  label: 'Vérification en cours',
                  icon: Icons.hourglass_top_outlined,
                  style: BadgeChipStyle.amber,
                )
              else
                const BadgeChip(
                  label: 'Non vérifiée',
                  icon: Icons.error_outline,
                  style: BadgeChipStyle.amber,
                ),
              if (medecin.compteSuspendu)
                const BadgeChip(
                  label: 'Compte suspendu',
                  icon: Icons.block_outlined,
                  style: BadgeChipStyle.amber,
                )
              else if (medecin.estPublie)
                const BadgeChip(
                  label: 'Visible par les patients',
                  icon: Icons.visibility_outlined,
                  style: BadgeChipStyle.green,
                )
              else
                const BadgeChip(
                  label: 'Profil non publié',
                  icon: Icons.visibility_off_outlined,
                  style: BadgeChipStyle.amber,
                ),
            ],
          ),
          const SizedBox(height: 16),
          _StatRow(medecin: medecin, statistiques: statistiques),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: AppOutlineButton(
              label: 'Modifier le profil',
              icon: Icons.edit_outlined,
              onPressed: () {
                // TODO: brancher l'écran d'édition du profil public
                // (MedecinRepository.modifierMedecin).
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Ligne de statistiques du profil — équivalent de `.stat-row` (note,
/// avis, ancienneté), alimentée par les statistiques d'avis réelles
/// et par la date de création de la fiche (proxy pour l'ancienneté,
/// faute d'un champ "années d'exercice" dédié côté backend).
class _StatRow extends StatelessWidget {
  final Medecin medecin;
  final StatistiquesAvisMedecin statistiques;

  const _StatRow({required this.medecin, required this.statistiques});

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

  String get _ancienneteAffichee {
    final creation = medecin.dateCreation;
    if (creation == null) return '—';
    final jours = DateTime.now().difference(creation).inDays;
    final annees = jours ~/ 365;
    if (annees < 1) return 'Nouveau';
    return '$annees an${annees > 1 ? 's' : ''}';
  }

  @override
  Widget build(BuildContext context) {
    final note = statistiques.noteMoyenne;
    return Container(
      padding: const EdgeInsets.only(top: 14),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          _stat(note != null ? note.toStringAsFixed(1) : '—', 'NOTE'),
          _stat('${statistiques.totalAvis}', 'AVIS'),
          _stat(_ancienneteAffichee, 'SUR APS'),
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
/// Bloc d'information générique — équivalent de `.info-block`, avec
/// une icône de titre et une action "Modifier" optionnelle.
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

/// État vide générique pour les sections dont les données ne sont pas
/// (encore) exposées par le backend dans ce périmètre (voir en-tête
/// de fichier) — plutôt que d'afficher de fausses données.
class _EtatVide extends StatelessWidget {
  final String message;
  const _EtatVide({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
      decoration: BoxDecoration(
        color: AppColors.paper,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        message,
        style: const TextStyle(
          fontSize: 11.5,
          color: AppColors.inkFaint,
          height: 1.5,
        ),
      ),
    );
  }
}

/// Ligne "clé / valeur" — équivalent de `.hours-row`.
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
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                fontFamily: AppTextStyles.fontMono,
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: dimmed ? AppColors.inkFaint : AppColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Puce ronde — équivalent de `.pill`.
class _Pill extends StatelessWidget {
  final String label;
  final bool actif;
  const _Pill({required this.label, this.actif = true});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(
        color: actif ? AppColors.green50 : AppColors.paper,
        border: Border.all(
          color: actif ? AppColors.green700 : AppColors.lineStrong,
        ),
        borderRadius: BorderRadius.circular(100),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontFamily: AppTextStyles.fontDisplay,
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: actif ? AppColors.green700 : AppColors.inkSoft,
        ),
      ),
    );
  }
}

/// ------------------------------------------------------------
/// Panneau "Présentation" — équivalent de `#p-presentation`, alimenté
/// par la biographie, le numéro d'ordre, la spécialité, le statut de
/// vérification, le LinkedIn et les documents réels du médecin.
/// ------------------------------------------------------------
class _PanelPresentation extends StatelessWidget {
  final Medecin medecin;
  const _PanelPresentation({required this.medecin});

  String get _statutLisible {
    switch (medecin.statutVerification) {
      case StatutVerificationMedecin.publie:
        return 'Vérifié';
      case StatutVerificationMedecin.enCours:
        return 'En cours';
      case StatutVerificationMedecin.nonPublie:
        return 'Non vérifié';
    }
  }

  @override
  Widget build(BuildContext context) {
    final documents = <MapEntry<String, String>>[
      if (medecin.attestationUrl.isNotEmpty)
        MapEntry("Attestation d'exercice", medecin.attestationUrl),
      if (medecin.cvUrl != null && medecin.cvUrl!.isNotEmpty)
        MapEntry('CV', medecin.cvUrl!),
    ];

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
          child: Text(
            medecin.biographie.isNotEmpty
                ? medecin.biographie
                : 'Aucune présentation renseignée pour le moment.',
            style: const TextStyle(
              fontSize: 12,
              height: 1.6,
              color: AppColors.inkSoft,
            ),
          ),
        ),
        _InfoBlock(
          icon: Icons.school_outlined,
          title: 'Formation & vérification',
          child: Column(
            children: [
              _HoursRow(
                label: 'Spécialité',
                value: medecin.specialite?.nom ?? '—',
              ),
              _HoursRow(
                label: "Numéro à l'Ordre",
                value: medecin.numeroOrdre,
              ),
              _HoursRow(
                label: 'Statut de vérification',
                value: _statutLisible,
                dimmed: medecin.statutVerification !=
                    StatutVerificationMedecin.publie,
              ),
            ],
          ),
        ),
        if (medecin.linkedInUrl != null && medecin.linkedInUrl!.isNotEmpty)
          _InfoBlock(
            icon: Icons.link_outlined,
            title: 'LinkedIn',
            child: Text(
              medecin.linkedInUrl!,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.green700,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        if (documents.isNotEmpty)
          _InfoBlock(
            icon: Icons.folder_outlined,
            title: 'Mes documents',
            child: Column(
              children: documents
                  .map((doc) => _HoursRow(label: doc.key, value: 'Voir'))
                  .toList(),
            ),
          ),
      ],
    );
  }
}

/// ------------------------------------------------------------
/// Panneau "Horaires" — équivalent de `#p-horaires`. La localisation
/// (ville/pays d'exercice) est réelle ; les horaires détaillés
/// relèvent du module Agenda, hors périmètre de ce repository — état
/// vide explicite en attendant son intégration.
/// ------------------------------------------------------------
class _PanelHoraires extends StatelessWidget {
  final Medecin medecin;
  const _PanelHoraires({required this.medecin});

  @override
  Widget build(BuildContext context) {
    final ville = medecin.villeExercice?.nom;
    final pays = medecin.paysExercice?.nom;
    final localisation = [
      if (ville != null && ville.isNotEmpty) ville,
      if (pays != null && pays.isNotEmpty) pays,
    ].join(', ');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InfoBlock(
          icon: Icons.access_time,
          title: "Horaires d'ouverture",
          child: const _EtatVide(
            message: "Vos horaires d'ouverture ne sont pas encore "
                'configurés. Cette section sera alimentée par le module '
                'Agenda du praticien.',
            // TODO: brancher AgendaRepository (créneaux/disponibilités)
            // quand ce module sera exposé côté client.
          ),
        ),
        _InfoBlock(
          icon: Icons.location_on_outlined,
          title: 'Localisation',
          actionLabel: 'Modifier',
          onAction: () {
            // TODO: brancher l'édition de la ville/pays d'exercice
            // (MedecinRepository.modifierMedecin).
          },
          child: Text(
            localisation.isNotEmpty
                ? localisation
                : 'Aucune localisation renseignée.',
            style: const TextStyle(fontSize: 12, color: AppColors.inkSoft),
          ),
        ),
      ],
    );
  }
}

/// ------------------------------------------------------------
/// Panneau "Avis" — équivalent de `#p-avis`. Seules la note moyenne
/// et le nombre total d'avis publiés sont exposés par
/// GET /medecins/mon-profil ; la liste détaillée des avis relève d'un
/// module Avis médecin non encore branché ici.
/// ------------------------------------------------------------
class _PanelAvis extends StatelessWidget {
  final StatistiquesAvisMedecin statistiques;
  const _PanelAvis({required this.statistiques});

  @override
  Widget build(BuildContext context) {
    final note = statistiques.noteMoyenne;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CardSurface(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      note != null ? note.toStringAsFixed(1) : '—',
                      style: const TextStyle(
                        fontFamily: AppTextStyles.fontDisplay,
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: List.generate(5, (i) {
                        final seuil = note ?? 0;
                        return Icon(
                          Icons.star_rounded,
                          size: 14,
                          color: i < seuil.round()
                              ? AppColors.amber500
                              : AppColors.lineStrong,
                        );
                      }),
                    ),
                  ],
                ),
              ),
              Text(
                '${statistiques.totalAvis} avis',
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.inkSoft,
                ),
              ),
            ],
          ),
        ),
        const _EtatVide(
          message: "Le détail des avis (commentaires, notes par patient) "
              "n'est pas encore disponible dans cet espace. Il "
              "apparaîtra ici une fois le module Avis médecin branché.",
          // TODO: brancher un futur AvisMedecinRepository pour lister
          // les avis individuels (auteur, note, commentaire).
        ),
      ],
    );
  }
}

/// ------------------------------------------------------------
/// Panneau "Tarifs" — équivalent de `#p-tarifs`, alimenté par le
/// tarif indicatif et l'activation de la téléconsultation, réels.
/// Les assurances acceptées ne sont pas modélisées dans ce périmètre
/// backend.
/// ------------------------------------------------------------
class _PanelTarifs extends StatelessWidget {
  final Medecin medecin;
  const _PanelTarifs({required this.medecin});

  static String _formaterMontant(double valeur) {
    final entier = valeur.round().toString();
    final tampon = StringBuffer();
    for (var i = 0; i < entier.length; i++) {
      final positionDepuisLaFin = entier.length - i;
      if (i > 0 && positionDepuisLaFin % 3 == 0) tampon.write(' ');
      tampon.write(entier[i]);
    }
    return '${tampon.toString()} FCFA';
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InfoBlock(
          icon: Icons.payments_outlined,
          title: 'Tarif indicatif',
          actionLabel: 'Modifier',
          onAction: () {
            // TODO: brancher l'édition du tarif indicatif
            // (MedecinRepository.modifierMedecin, champ tarifIndicatif).
          },
          child: Column(
            children: [
              _PriceRow(
                label: 'Consultation',
                price: _formaterMontant(medecin.tarifIndicatif),
              ),
            ],
          ),
        ),
        _InfoBlock(
          icon: Icons.video_call_outlined,
          title: 'Téléconsultation',
          child: Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _Pill(
                label: medecin.teleconsultationActivee
                    ? 'Disponible'
                    : 'Non proposée',
                actif: medecin.teleconsultationActivee,
              ),
            ],
          ),
        ),
        _InfoBlock(
          icon: Icons.shield_outlined,
          title: 'Assurances acceptées',
          child: const _EtatVide(
            message: 'Les assurances acceptées ne sont pas encore '
                'configurables depuis cet espace.',
            // TODO: brancher le module Moyens de paiement / assurances
            // quand il sera exposé côté client.
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