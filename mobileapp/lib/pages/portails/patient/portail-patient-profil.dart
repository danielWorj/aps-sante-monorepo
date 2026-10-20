import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// Bibliothèque de composants partagée (design tokens, cartes, boutons,
// badges, navigation basse) — même import que portail-medecin-profil.dart.
// Adapter le chemin selon l'emplacement réel de ce fichier dans le projet.
import '../../../components/components.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/patient_controller.dart';
import '../../../models/patient_models.dart';
import '../../../repositories/patient_repository.dart' show ApiException;
import '../../espaces/carte_connexion_compte.dart';

/// ============================================================
/// portail-patient-profil.dart
///
/// Affiche le profil RÉEL du patient connecté (GET
/// /patients/mon-profil), en miroir exact de
/// portail-medecin-profil.dart (voir son en-tête pour le patron
/// général), mais côté module "fiche patient" :
/// - `authTokenProvider` fournit le token du patient connecté.
/// - `monProfilPatientControllerProvider`
///   (`MonProfilPatientController.charger`) récupère la fiche +
///   statistiques d'activité depuis le backend et porte tout l'état
///   (chargement / erreur / données) — ce widget ne fait aucun appel
///   HTTP lui-même.
/// - `MonProfilPatientController.charger` utilise
///   `AsyncLoading.copyWithPrevious` : pendant un rafraîchissement
///   (pull-to-refresh), l'ancien profil reste affiché au lieu d'être
///   remplacé par un écran de chargement plein écran.
/// - L'action "Modifier" de cette page est pour l'instant un simple
///   TODO ; aucun ModificationPatientController n'existe encore dans
///   ce périmètre (voir patient_repository.dart : seules les routes
///   de lecture — profil, fiche par id, rendez-vous — sont couvertes).
///
/// ⚠️ Ce widget ne gère pas sa propre barre de navigation basse : il
/// est destiné à être affiché comme un onglet parmi d'autres à
/// l'intérieur d'un shell dédié (ex. PatientHomeShell), seul
/// responsable du `Scaffold` et de la navigation basse — même
/// convention que PortailMedecinProfil / MedecinHomeShell.
///
/// ⚠️ Périmètre des données réellement disponibles ici (voir
/// patient_models.dart / patient_repository.dart / patient_controller.dart) :
/// - Identité, date de naissance/âge, statut du compte, coordonnées
///   (email/téléphone/pays) : RÉELS (UtilisateurPatient, vue
///   "complète" — voir [UtilisateurPatient.estVueComplete] ; toujours
///   vraie ici puisque `mon-profil` est réservé au titulaire du
///   compte, jamais à un tiers en vue restreinte).
/// - Nombre total de rendez-vous, nombre total d'ordonnances,
///   prochain rendez-vous à venir (médecin, date, type, statut) :
///   RÉELS (StatistiquesPatient).
/// - Le DÉTAIL des ordonnances (contenu, médicaments) et l'HISTORIQUE
///   complet des rendez-vous ne sont pas affichés sur cet écran :
///   seul le PROCHAIN rendez-vous est modélisé par
///   `obtenirMonProfil` — l'historique complet existe déjà côté
///   client via [rendezVousPatientProvider] / [rendezVousAVenirPatientProvider]
///   (patient_controller.dart) mais relève d'un écran dédié "Mes
///   rendez-vous", pas de cette fiche de profil. Les ordonnances ne
///   sont pas du tout modélisées dans ce périmètre backend (module
///   Ordonnances, hors scope de patient_repository.dart — voir son
///   en-tête) : ces sections affichent donc un état vide explicite
///   plutôt que des données inventées, avec un TODO pointant vers le
///   repository/écran dédié à brancher plus tard.
/// ============================================================

/// ------------------------------------------------------------
/// Page principale
/// ------------------------------------------------------------
class PortailPatientProfil extends ConsumerStatefulWidget {
  const PortailPatientProfil({super.key});

  @override
  ConsumerState<PortailPatientProfil> createState() =>
      _PortailPatientProfilState();
}

class _PortailPatientProfilState extends ConsumerState<PortailPatientProfil>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    // Au montage du widget, demander au controller de charger le
    // profil réel du patient connecté.
    WidgetsBinding.instance.addPostFrameCallback((_) => _chargerProfil());
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  /// Déclenche `MonProfilPatientController.charger`. Utilisé au
  /// montage ET comme callback de `RefreshIndicator` / bouton
  /// "Réessayer" : le controller gère lui-même le
  /// chargement/erreur/données (`AsyncNotifier<MonProfilPatientResponse?>`).
  Future<void> _chargerProfil() async {
    final token = ref.read(authTokenProvider);
    if (token == null) return; // Session absente : rien à charger.
    await ref
        .read(monProfilPatientControllerProvider.notifier)
        .charger(token: token);
  }

  List<_TabDef> _tabsAvec(StatistiquesPatient statistiques) => [
    const _TabDef(label: 'Informations'),
    _TabDef(label: 'Rendez-vous', count: statistiques.totalRendezVous),
    _TabDef(label: 'Ordonnances', count: statistiques.totalOrdonnances),
  ];

  @override
  Widget build(BuildContext context) {
    final profilAsync = ref.watch(monProfilPatientControllerProvider);

    // Pas de Scaffold/SafeArea/AppBottomNav ici : ce widget est un
    // onglet du shell (PatientHomeShell), qui fournit déjà le
    // Scaffold et la barre de navigation basse.
    return Container(
      color: AppColors.bg,
      child: _buildCorps(context, profilAsync),
    );
  }

  Widget _buildCorps(
      BuildContext context,
      AsyncValue<MonProfilPatientResponse?> profilAsync,
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
    final patient = profil.patient;
    final statistiques = profil.statistiques;
    final tabs = _tabsAvec(statistiques);

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _chargerProfil,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 120),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _PageHead(),
            _ProfileHero(patient: patient, statistiques: statistiques),
            const SizedBox(height: 14),
            const CarteConnexionCompte(),
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
                  _PanelInformations(patient: patient),
                  _PanelRendezVous(statistiques: statistiques),
                  _PanelOrdonnances(statistiques: statistiques),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Affiché uniquement quand `monProfilPatientControllerProvider` n'a
  /// jamais eu de valeur (échec du tout premier chargement) : sinon
  /// `_buildCorps` continue d'afficher les dernières données connues.
  Widget _buildErreur(Object erreur) {
    final message = erreur is ApiException
        ? erreur.message
        : 'Impossible de charger le profil pour le moment.';
    return Center(
      child: ApsEmptyState(
        icon: Icons.error_outline_rounded,
        tone: ApsTone.neutral,
        title: 'Profil indisponible',
        message: message,
        actionLabel: 'Réessayer',
        onAction: _chargerProfil,
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
    // La cloche du shell flotte en haut à droite : place réservée.
    return const ApsPageTitle('Compte', trailing: SizedBox(width: 42));
  }
}

/// ------------------------------------------------------------
/// En-tête du profil — équivalent de `.profile-hero` côté médecin,
/// alimenté par la fiche `Patient` réelle (utilisateur, date de
/// naissance, statut du compte) et les statistiques d'activité.
/// ------------------------------------------------------------
class _ProfileHero extends StatelessWidget {
  final Patient patient;
  final StatistiquesPatient statistiques;

  const _ProfileHero({required this.patient, required this.statistiques});

  String get _nomAffiche {
    final u = patient.utilisateur;
    if (u.nom.isEmpty && u.prenom.isEmpty) return 'Patient';
    return u.nomComplet.trim();
  }

  String get _sousTitre => '${patient.age} ans';

  @override
  Widget build(BuildContext context) {
    final utilisateur = patient.utilisateur;
    final compteSuspendu = utilisateur.statutCompte == 'suspendu';
    final prochain = statistiques.prochainRendezVous;

    Widget tuile(String libelle, String valeur) => Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(libelle,
                    style: TextStyle(
                      fontFamily: AppTextStyles.fontSans,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: Colors.white.withValues(alpha: 0.65),
                    )),
                Text(valeur,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontFamily: AppTextStyles.fontSans,
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    )),
              ],
            ),
          ),
        );

    return Column(
      children: [
        Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            gradient: AppColors.gradientForest,
            borderRadius: BorderRadius.circular(16),
            boxShadow: AppColors.shadowSoft,
          ),
          child: Stack(
            children: [
              Positioned(
                right: -60,
                top: -60,
                child: Container(
                  width: 220,
                  height: 180,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [Color(0x597FE0B5), Color(0x007FE0B5)],
                    ),
                  ),
                ),
              ),
              Positioned(
                right: 16,
                bottom: 10,
                child: Icon(Icons.add_rounded,
                    size: 80, color: Colors.white.withValues(alpha: 0.08)),
              ),
              Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text('CARTE SANTÉ APS',
                            style: AppTextStyles.over.copyWith(
                                color: Colors.white.withValues(alpha: 0.7))),
                        const Spacer(),
                        ApsPill(
                          compteSuspendu ? 'Compte suspendu' : 'Compte actif',
                          tone: ApsTone.white,
                          dot: true,
                          foreground: compteSuspendu
                              ? const Color(0xFFFFC66B)
                              : AppColors.mint,
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        ApsAvatar(
                          name: _nomAffiche,
                          size: 54,
                          round: true,
                          variant: 2,
                          border: Border.all(
                              color: Colors.white.withValues(alpha: 0.4), width: 2),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(_nomAffiche,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontFamily: AppTextStyles.fontSans,
                                    fontSize: 17,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -0.3,
                                    color: Colors.white,
                                  )),
                              Text(
                                [_sousTitre, if (utilisateur.email?.isNotEmpty ?? false) utilisateur.email!]
                                    .join(' · '),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontFamily: AppTextStyles.fontSans,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                  color: Colors.white.withValues(alpha: 0.7),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        tuile('Rendez-vous', '${statistiques.totalRendezVous}'),
                        const SizedBox(width: 8),
                        tuile('Ordonnances', '${statistiques.totalOrdonnances}'),
                        const SizedBox(width: 8),
                        tuile('Prochain',
                            prochain != null ? _formaterDateCourte(prochain.dateCreneau) : '—'),
                      ],
                    ),
                  ],
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
/// Onglets façon pilule segmentée — repris à l'identique de
/// portail-medecin-profil.dart pour rester cohérent visuellement.
/// ------------------------------------------------------------
class _SegmentedTabs extends StatelessWidget {
  final TabController controller;
  final List<_TabDef> tabs;

  const _SegmentedTabs({required this.controller, required this.tabs});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) => ApsSegmented<int>(
        value: controller.index,
        onChanged: controller.animateTo,
        segments: [
          for (var i = 0; i < tabs.length; i++)
            ApsSegment(
              i,
              tabs[i].count != null ? '${tabs[i].label} · ${tabs[i].count}' : tabs[i].label,
            ),
        ],
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

/// Ligne "clé / valeur" — équivalent de `.hours-row` côté médecin.
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

/// Puce ronde — équivalent de `.pill` côté médecin.
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

/* ===========================================================
 * Aides de formatage (pas de dépendance à `intl` — même patron que
 * `_formaterMontant` dans portail-medecin-profil.dart).
 * =========================================================== */

const List<String> _moisAbreges = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

String _deuxChiffres(int n) => n.toString().padLeft(2, '0');

/// Ex. "12 sept."  — utilisé dans la stat "PROCHAIN RDV" (compacte).
String _formaterDateCourte(DateTime dt) {
  return '${dt.day} ${_moisAbreges[dt.month - 1]}';
}

/// Ex. "12 sept. 2026 · 09:30" — utilisé dans la carte de rendez-vous.
String _formaterDateHeure(DateTime dt) {
  return '${dt.day} ${_moisAbreges[dt.month - 1]} ${dt.year} · '
      '${_deuxChiffres(dt.hour)}:${_deuxChiffres(dt.minute)}';
}

/// Ex. "14/03/1990" — utilisé pour la date de naissance.
String _formaterDate(DateTime dt) {
  return '${_deuxChiffres(dt.day)}/${_deuxChiffres(dt.month)}/${dt.year}';
}

String _libelleStatutRdv(StatutRendezVous statut) {
  switch (statut) {
    case StatutRendezVous.cree:
      return 'Créé';
    case StatutRendezVous.confirme:
      return 'Confirmé';
    case StatutRendezVous.enAttentePresence:
      return 'En attente de présence';
    case StatutRendezVous.aReprogrammer:
      return 'À reprogrammer';
    case StatutRendezVous.honore:
      return 'Honoré';
    case StatutRendezVous.nonHonore:
      return 'Non honoré';
    case StatutRendezVous.annule:
      return 'Annulé';
    case StatutRendezVous.conteste:
      return 'Contesté';
    case StatutRendezVous.inconnu:
      // Statut renvoyé par le serveur mais pas encore connu de l'app :
      // libellé neutre, jamais « Créé ».
      return 'Statut inconnu';
  }
}

BadgeChipStyle _styleStatutRdv(StatutRendezVous statut) {
  switch (statut) {
    case StatutRendezVous.confirme:
    case StatutRendezVous.honore:
      return BadgeChipStyle.green;
    case StatutRendezVous.cree:
    case StatutRendezVous.enAttentePresence:
    case StatutRendezVous.nonHonore:
    case StatutRendezVous.annule:
    case StatutRendezVous.conteste:
      return BadgeChipStyle.amber;
    case StatutRendezVous.aReprogrammer:
      return BadgeChipStyle.coral;
    case StatutRendezVous.inconnu:
      return BadgeChipStyle.outline;
  }
}

/// ------------------------------------------------------------
/// Panneau "Informations" — identité, date de naissance/âge,
/// coordonnées et statut du compte. Toutes ces données sont réelles
/// (UtilisateurPatient en vue complète, systématique sur mon-profil).
/// ------------------------------------------------------------
class _PanelInformations extends StatelessWidget {
  final Patient patient;
  const _PanelInformations({required this.patient});

  @override
  Widget build(BuildContext context) {
    final utilisateur = patient.utilisateur;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InfoBlock(
          icon: Icons.badge_outlined,
          title: 'Identité',
          child: Column(
            children: [
              _HoursRow(label: 'Nom', value: utilisateur.nom),
              _HoursRow(label: 'Prénom', value: utilisateur.prenom),
              _HoursRow(
                label: 'Date de naissance',
                value: _formaterDate(patient.dateNaissance),
              ),
              _HoursRow(label: 'Âge', value: '${patient.age} ans'),
            ],
          ),
        ),
        _InfoBlock(
          icon: Icons.contact_mail_outlined,
          title: 'Coordonnées',
          actionLabel: 'Modifier',
          onAction: () {
            // TODO: brancher l'édition des coordonnées (email,
            // téléphone) une fois une route d'écriture exposée côté
            // backend pour ce périmètre.
          },
          child: utilisateur.estVueComplete
              ? Column(
            children: [
              _HoursRow(
                label: 'Email',
                value: utilisateur.email ?? '—',
              ),
              _HoursRow(
                label: 'Téléphone',
                value: utilisateur.telephone ?? 'Non renseigné',
              ),
              _HoursRow(
                label: 'Pays',
                value: utilisateur.paysId ?? 'Non renseigné',
              ),
            ],
          )
              : const _EtatVide(
            message: 'Les coordonnées ne sont pas disponibles sur '
                'cette fiche.',
          ),
        ),
        _InfoBlock(
          icon: Icons.verified_user_outlined,
          title: 'Statut du compte',
          child: Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _Pill(
                label: utilisateur.statutCompte ?? 'Inconnu',
                actif: utilisateur.statutCompte != 'suspendu',
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// ------------------------------------------------------------
/// Panneau "Rendez-vous" — le prochain rendez-vous à venir est réel
/// (StatistiquesPatient.prochainRendezVous, GET /patients/mon-profil).
/// L'historique complet des rendez-vous n'est volontairement PAS
/// dupliqué ici : il est déjà exposé par
/// [rendezVousPatientProvider] / [rendezVousAVenirPatientProvider]
/// (patient_controller.dart), destinés à un écran dédié "Mes
/// rendez-vous" plutôt qu'à cette fiche de profil.
/// ------------------------------------------------------------
class _PanelRendezVous extends StatelessWidget {
  final StatistiquesPatient statistiques;
  const _PanelRendezVous({required this.statistiques});

  @override
  Widget build(BuildContext context) {
    final prochain = statistiques.prochainRendezVous;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InfoBlock(
          icon: Icons.event_available_outlined,
          title: 'Prochain rendez-vous',
          child: prochain != null
              ? _RendezVousCard(rendezVous: prochain)
              : const _EtatVide(
            message: "Vous n'avez aucun rendez-vous à venir pour "
                'le moment.',
          ),
        ),
        _InfoBlock(
          icon: Icons.history_outlined,
          title: 'Historique',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _EtatVide(
                message: '${statistiques.totalRendezVous} rendez-vous au '
                    "total. L'historique détaillé (à venir, honorés, "
                    "annulés) est disponible depuis l'écran dédié "
                    '"Mes rendez-vous".',
                // TODO: remplacer par une navigation réelle vers
                // l'écran listant rendezVousPatientProvider /
                // filtreStatutRendezVousProvider, une fois cet écran
                // construit.
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: AppOutlineButton(
                  label: 'Voir tous mes rendez-vous',
                  icon: Icons.calendar_month_outlined,
                  onPressed: () {
                    // TODO: naviguer vers l'écran "Mes rendez-vous",
                    // alimenté par rendezVousPatientProvider.
                  },
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Carte compacte pour un rendez-vous, utilisée pour le prochain
/// rendez-vous du profil — médecin, date/heure, type et statut réels.
class _RendezVousCard extends StatelessWidget {
  final RendezVousPatient rendezVous;
  const _RendezVousCard({required this.rendezVous});

  @override
  Widget build(BuildContext context) {
    final medecin = rendezVous.medecin.utilisateur;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Dr. ${medecin.nomComplet}',
                  style: const TextStyle(
                    fontFamily: AppTextStyles.fontDisplay,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
              ),
              BadgeChip(
                label: _libelleStatutRdv(rendezVous.statut),
                icon: rendezVous.estTeleconsultation
                    ? Icons.video_call_outlined
                    : Icons.event_outlined,
                style: _styleStatutRdv(rendezVous.statut),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _HoursRow(
            label: 'Date',
            value: _formaterDateHeure(rendezVous.dateCreneau),
          ),
          _HoursRow(
            label: 'Type',
            value: rendezVous.estTeleconsultation
                ? 'Téléconsultation'
                : 'Consultation physique',
          ),
          if (rendezVous.structure != null)
            _HoursRow(label: 'Structure', value: rendezVous.structure!.nom),
          if (rendezVous.motif != null && rendezVous.motif!.isNotEmpty)
            _HoursRow(label: 'Motif', value: rendezVous.motif!),
          _HoursRow(label: 'Code', value: rendezVous.codeUnique),
        ],
      ),
    );
  }
}

/// ------------------------------------------------------------
/// Panneau "Ordonnances" — seul le NOMBRE total d'ordonnances est
/// exposé par GET /patients/mon-profil (StatistiquesPatient) ; le
/// module Ordonnances (contenu, médicaments, téléchargement) n'est
/// pas modélisé dans ce périmètre backend (patient_repository.dart).
/// ------------------------------------------------------------
class _PanelOrdonnances extends StatelessWidget {
  final StatistiquesPatient statistiques;
  const _PanelOrdonnances({required this.statistiques});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CardSurface(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(14),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Ordonnances reçues',
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.inkSoft,
                ),
              ),
              Text(
                '${statistiques.totalOrdonnances}',
                style: const TextStyle(
                  fontFamily: AppTextStyles.fontDisplay,
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                ),
              ),
            ],
          ),
        ),
        const _EtatVide(
          message: "Le détail des ordonnances (médicaments, posologie, "
              "téléchargement) n'est pas encore disponible dans cet "
              'espace. Il apparaîtra ici une fois le module '
              'Ordonnances branché.',
          // TODO: brancher un futur OrdonnanceRepository pour lister
          // et consulter le détail de chaque ordonnance du patient.
        ),
      ],
    );
  }
}