import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/cards/info_liberation_fonds.dart';
import '../../../components/components.dart';
import '../../../components/panels/panneau_reprogrammation.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/rendez_vous_controller.dart';
import '../../../models/authentification_models.dart';
import '../../../models/rendez_vous_models.dart';
import '../../../utils/fonds.dart';
import '../teleconsultation_screen.dart';
import 'terminer_rdv_sheet.dart';
import 'accepter_rdv_sheet.dart';

/// ============================================================
/// portail-medecin-rdv.dart - VERSION ADAPTÉE
///
/// Affiche les rendez-vous RÉELS du médecin connecté
/// via Riverpod et les API du backend.
///
/// Architecture:
/// - SessionController fournit le token du médecin
/// - ListeRendezVousController récupère les RDV via l'API
/// - Filtrage par statut dans les panels
///
/// Politique de fonds v2 — D8 : un RDV NON PAYÉ (statut `cree`) est en
/// LECTURE SEULE pour le médecin. Le serveur ne renvoie pour lui que
/// { rdv_id, date_creneau, statut, non_paye: true } (aucune identité patient,
/// aucun motif, aucun lien de visio) ; l'écran l'affiche grisé, « En attente
/// de paiement », avec toutes les actions désactivées. Le médecin n'« accepte »
/// ni ne « refuse » plus un RDV : la confirmation `cree → confirme` résulte du
/// seul paiement du patient (il est alors notifié). Un 409 `RDV_NON_PAYE`
/// éventuel (visio) est géré dans teleconsultation_screen.dart.
///
/// Fin de consultation PHYSIQUE : le médecin clique sur « Terminé » et saisit
/// le code de consultation que le patient lui communique (feuille
/// terminer_rdv_sheet.dart). Le code n'est jamais renvoyé au médecin. Une fois
/// validé, le RDV passe `honore` et les fonds sont libérés après T heures
/// (date « Fonds libérés le … » affichée dans l'onglet « Terminés »). Les
/// téléconsultations n'ont pas de code : leur fin est détectée par la visio.
///
/// ⚠️ Ce widget ne gère plus sa propre barre de navigation basse :
/// il est destiné à être affiché comme un onglet parmi d'autres à
/// l'intérieur de `MedecinHomeShell`, qui est seul responsable du
/// `Scaffold` et de `MedecinBottomNavigationBar`.
/// ============================================================

/// Page principale
class PortailMedecinRdv extends ConsumerStatefulWidget {
    const PortailMedecinRdv({super.key});

    @override
    ConsumerState<PortailMedecinRdv> createState() =>
        _PortailMedecinRdvState();
}

class _PortailMedecinRdvState extends ConsumerState<PortailMedecinRdv>
    with SingleTickerProviderStateMixin {
    late final TabController _tabController;

    @override
    void initState() {
        super.initState();
        _tabController = TabController(length: 4, vsync: this);

        // Au montage du widget, initialiser les controllers avec le token
        WidgetsBinding.instance.addPostFrameCallback((_) {
            final token = ref.read(authTokenProvider);
            if (token != null) {
                // Initialiser le controller des RDV avec le token du médecin
                ref
                    .read(listeRendezVousControllerProvider.notifier)
                    .definirToken(token);
            }
        });
    }

    @override
    void dispose() {
        _tabController.dispose();
        super.dispose();
    }

    @override
    Widget build(BuildContext context) {
        // Observer l'état du médecin connecté
        final medecinProfile = ref.watch(authUtilisateurProvider);

        // Pas de Scaffold/SafeArea/AppBottomNav ici : ce widget est un
        // onglet du shell (MedecinHomeShell), qui fournit déjà le
        // Scaffold et la barre de navigation basse.
        return Container(
            color: AppColors.bg,
            child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(18, 0, 18, 120),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                        // Salutation : avatar, date du jour, nom du médecin.
                        _DoctorStrip(medecin: medecinProfile),
                        // Indicateurs du jour et de la semaine.
                        _StatLine(ref: ref),
                        const SizedBox(height: 18),
                        _SegmentedTabs(controller: _tabController),
                        const SizedBox(height: 16),
                        SizedBox(
                            height: MediaQuery.of(context).size.height,
                            child: TabBarView(
                                controller: _tabController,
                                physics: const NeverScrollableScrollPhysics(),
                                children: [
                                    const _PanelConfirme(),
                                    // D8 : RDV non payés, lecture seule (aucune action).
                                    const _PanelAttente(),
                                    const _PanelTermines(),
                                    const _PanelAnnules(),
                                ],
                            ),
                        ),
                    ],
                ),
            ),
        );
    }
}

/// ════════════════════════════════════════════════════════════
/// Bandeau praticien (affiche le médecin connecté)
/// ════════════════════════════════════════════════════════════
class _DoctorStrip extends StatelessWidget {
    final Utilisateur? medecin;

    const _DoctorStrip({this.medecin});

    @override
    Widget build(BuildContext context) {
        final nom = [medecin?.prenom, medecin?.nom]
            .whereType<String>()
            .where((e) => e.isNotEmpty)
            .join(' ');
        const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
        const mois = [
          'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
          'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
        ];
        final d = DateTime.now();

        // La cloche du shell flotte en haut à droite : place réservée.
        return Padding(
          padding: const EdgeInsets.fromLTRB(0, 6, 54, 14),
          child: Row(
            children: [
              ApsAvatar(name: nom.isEmpty ? 'Dr' : nom, size: 40),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${jours[d.weekday - 1]} ${d.day} ${mois[d.month - 1]}',
                        style: AppTextStyles.xs),
                    Text(
                      nom.isEmpty ? 'Espace médecin' : 'Dr $nom',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTextStyles.strong.copyWith(fontSize: 15),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
    }

}

/// ════════════════════════════════════════════════════════════
/// Ligne de statistiques (dynamique basée sur les RDV)
/// ════════════════════════════════════════════════════════════
class _StatLine extends ConsumerWidget {
    final WidgetRef ref;

    const _StatLine({required this.ref});

    @override
    Widget build(BuildContext context, WidgetRef ref) {
        // Observer la liste des RDV
        final rdvAsync = ref.watch(listeRendezVousControllerProvider);

        return rdvAsync.when(
            loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 10),
                child: Center(child: CircularProgressIndicator()),
            ),
            error: (err, stack) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Text('Erreur: $err', style: const TextStyle(color: Colors.red)),
            ),
            data: (rdvList) {
                // Compter les RDV par statut
                final aujourd_hui = _compterAujourdhui(rdvList);
                final cette_semaine = _compterCetteSemaine(rdvList);
                final en_visio =
                    rdvList
                        .where((rdv) =>
                            !rdv.estNonPaye &&
                            rdv.typeRdv == TypeRdv.teleconsultation &&
                            !rdv.estAReprogrammer)
                        .length;

                return IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: ApsCard(
                          color: AppColors.ink,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text("Aujourd'hui",
                                  style: AppTextStyles.xs.copyWith(color: Colors.white60)),
                              Text.rich(
                                TextSpan(children: [
                                  TextSpan(text: '$aujourd_hui '),
                                  const TextSpan(
                                    text: 'RDV',
                                    style: TextStyle(fontSize: 13, color: Colors.white60),
                                  ),
                                ]),
                                style: const TextStyle(
                                  fontFamily: AppTextStyles.fontSans,
                                  fontSize: 26,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -1,
                                  color: Colors.white,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  for (var i = 0; i < (aujourd_hui == 0 ? 4 : aujourd_hui.clamp(1, 8)); i++) ...[
                                    if (i > 0) const SizedBox(width: 3),
                                    Expanded(
                                      child: Container(
                                        height: 5,
                                        decoration: BoxDecoration(
                                          color: aujourd_hui == 0
                                              ? Colors.white24
                                              : AppColors.mint,
                                          borderRadius: BorderRadius.circular(5),
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: ApsCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('7 prochains jours', style: AppTextStyles.xs),
                              Text.rich(
                                TextSpan(children: [
                                  TextSpan(text: '$cette_semaine '),
                                  const TextSpan(
                                    text: 'RDV',
                                    style: TextStyle(fontSize: 13, color: AppColors.ink3),
                                  ),
                                ]),
                                style: AppTextStyles.strong.copyWith(
                                    fontSize: 22, letterSpacing: -0.9),
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  const Icon(Icons.videocam_outlined,
                                      size: 13, color: AppColors.b6),
                                  const SizedBox(width: 4),
                                  Text('$en_visio en vidéo',
                                      style: AppTextStyles.xs.copyWith(
                                          color: AppColors.b6,
                                          fontWeight: FontWeight.w800)),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                );
            },
        );
    }

    /// Compter les RDV d'aujourd'hui
    int _compterAujourdhui(List<RendezVous> rdvList) {
        final aujourd_hui = DateTime.now();
        return rdvList
            .where((rdv) =>
        !rdv.estNonPaye &&
        !rdv.estAReprogrammer &&
            rdv.dateCreneau.year == aujourd_hui.year &&
            rdv.dateCreneau.month == aujourd_hui.month &&
            rdv.dateCreneau.day == aujourd_hui.day)
            .length;
    }

    /// Compter les RDV de cette semaine
    int _compterCetteSemaine(List<RendezVous> rdvList) {
        final maintenant = DateTime.now();
        final finSemaine = maintenant.add(const Duration(days: 7));
        return rdvList
            .where((rdv) =>
        !rdv.estNonPaye &&
        !rdv.estAReprogrammer &&
            rdv.dateCreneau.isAfter(maintenant) &&
            rdv.dateCreneau.isBefore(finSemaine))
            .length;
    }

}

/// ════════════════════════════════════════════════════════════
/// Onglets segmentés (les 4 statuts)
/// ════════════════════════════════════════════════════════════
class _SegmentedTabs extends ConsumerWidget {
    final TabController controller;

    const _SegmentedTabs({required this.controller});

    @override
    Widget build(BuildContext context, WidgetRef ref) {
        // Observer les RDV pour mettre à jour les counts
        final rdvAsync = ref.watch(listeRendezVousControllerProvider);

        final tabs = rdvAsync.when(
            loading: () => const [
                _TabDef(label: 'À venir', count: null),
                _TabDef(label: 'En attente', count: null),
                _TabDef(label: 'Terminés', count: null),
                _TabDef(label: 'Annulés', count: null),
            ],
            error: (_, __) => const [
                _TabDef(label: 'À venir', count: 0),
                _TabDef(label: 'En attente', count: 0),
                _TabDef(label: 'Terminés', count: 0),
                _TabDef(label: 'Annulés', count: 0),
            ],
            data: (rdvList) => [
                _TabDef(
                    label: 'À venir',
                    count: rdvList
                        .where((r) =>
                            r.statut == StatutRendezVous.confirme ||
                            r.statut == StatutRendezVous.enAttentePresence ||
                            r.statut == StatutRendezVous.aReprogrammer)
                        .length,
                ),
                _TabDef(
                    label: 'En attente',
                    count: rdvList
                        .where((r) => r.statut == StatutRendezVous.cree)
                        .length,
                ),
                _TabDef(
                    label: 'Terminés',
                    count: rdvList
                        .where((r) =>
                    r.statut == StatutRendezVous.honore ||
                        r.statut == StatutRendezVous.nonHonore)
                        .length,
                ),
                _TabDef(
                    label: 'Annulés',
                    count: rdvList.where((r) => r.statut == StatutRendezVous.annule).length,
                ),
            ],
        );

        return AnimatedBuilder(
          animation: controller,
          builder: (context, _) => ApsSegmented<int>(
            value: controller.index,
            onChanged: controller.animateTo,
            segments: [
              for (var i = 0; i < tabs.length; i++)
                ApsSegment(
                  i,
                  (tabs[i].count != null && tabs[i].count! > 0)
                      ? '${tabs[i].label} · ${tabs[i].count}'
                      : tabs[i].label,
                ),
            ],
          ),
        );
    }
}

/// ════════════════════════════════════════════════════════════
/// Modèle pour les onglets
/// ════════════════════════════════════════════════════════════
class _TabDef {
    final String label;
    final int? count;
    const _TabDef({required this.label, this.count});
}

/// ════════════════════════════════════════════════════════════
/// En-tête de section
/// ════════════════════════════════════════════════════════════
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
                children: [
                    Text(title.toUpperCase(), style: AppTextStyles.over),
                    if (actionLabel != null && onAction != null) ...[
                        const Spacer(),
                        GestureDetector(
                            onTap: onAction,
                            child: Text(
                                actionLabel!,
                                style: const TextStyle(
                                    fontFamily: AppTextStyles.fontDisplay,
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.primary,
                                ),
                            ),
                        ),
                    ],
                ],
            ),
        );
    }
}

/// ════════════════════════════════════════════════════════════
/// PANELS - ConsumerWidget pour accéder aux données Riverpod
/// ════════════════════════════════════════════════════════════

/// Panneau "À venir" : RDV confirmés + RDV `a_reprogrammer` (comme le web)
class _PanelConfirme extends ConsumerWidget {
    const _PanelConfirme();

    @override
    Widget build(BuildContext context, WidgetRef ref) {
        final rdvAsync = ref.watch(listeRendezVousControllerProvider);

        return rdvAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, stack) => Center(child: Text('Erreur: $err')),
            data: (rdvList) {
                // Filtrer: RDV à venir (confirmés + à reprogrammer), groupés par date
                final rdvConfirmes = rdvList
                    .where((r) =>
                        r.statut == StatutRendezVous.confirme ||
                        r.statut == StatutRendezVous.enAttentePresence ||
                        r.statut == StatutRendezVous.aReprogrammer)
                    .toList();

                if (rdvConfirmes.isEmpty) {
                    return const Align(
                      alignment: Alignment.topCenter,
                      child: ApsEmptyState(icon: Icons.event_note_outlined, tone: ApsTone.neutral, title: 'Aucun rendez-vous à venir'),
                    );
                }

                final nbARepro =
                    rdvConfirmes.where((r) => r.estAReprogrammer).length;
                final nbLieuAPreciser =
                    rdvConfirmes.where((r) => r.lieuAPreciser).length;

                // Grouper par date
                final groupesParDate = _grouperParDate(rdvConfirmes);

                return SingleChildScrollView(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                            // Bandeau d'alerte visible sans ouvrir le détail.
                            if (nbARepro > 0) ...[
                                AppAlert(
                                    type: AppAlertType.warning,
                                    message: nbARepro == 1
                                        ? '1 rendez-vous à reprogrammer : ouvrez-le pour '
                                            'proposer ou accepter une date (délai de 48 h).'
                                        : '$nbARepro rendez-vous à reprogrammer : ouvrez-les '
                                            'pour proposer ou accepter une date (délai de 48 h).',
                                ),
                                const SizedBox(height: 4),
                            ],
                            // RDV physiques payés pas encore acceptés : le patient
                            // attend le lieu de la consultation.
                            if (nbLieuAPreciser > 0) ...[
                                AppAlert(
                                    type: AppAlertType.warning,
                                    message: nbLieuAPreciser == 1
                                        ? '1 rendez-vous payé à accepter : précisez le lieu '
                                            'de la consultation, le patient en sera prévenu.'
                                        : '$nbLieuAPreciser rendez-vous payés à accepter : précisez '
                                            'le lieu de chaque consultation, les patients en seront prévenus.',
                                ),
                                const SizedBox(height: 4),
                            ],
                            ...groupesParDate.entries.map((entry) {
                                final dateStr = entry.key;
                                final rdvsDate = entry.value;
                                return Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                        _SectionHead(
                                            title: dateStr,
                                            margin: const EdgeInsets.fromLTRB(2, 16, 2, 9),
                                        ),
                                        ...rdvsDate.map((rdv) {
                                            return _AppointmentCard(
                                                time: _formatTime(rdv.dateCreneau),
                                                dateLabel: _formatDateLabel(rdv.dateCreneau),
                                                initials: _genererInitiales(
                                                    rdv.patient?.utilisateur?.prenom,
                                                    rdv.patient?.utilisateur?.nom,
                                                ),
                                                name:
                                                '${rdv.patient?.utilisateur?.prenom ?? ''} ${rdv.patient?.utilisateur?.nom ?? ''}'
                                                    .trim(),
                                                subtitle: 'Consultation',
                                                subtitle2: rdv.typeRdv == TypeRdv.teleconsultation
                                                    ? 'Téléconsultation'
                                                    : rdv.lieuRdv ?? 'Lieu à préciser',
                                                footer: rdv.estAReprogrammer
                                                    ? PanneauReprogrammation(
                                                        key: ValueKey('repro-${rdv.rdvId}'),
                                                        rdv: rdv,
                                                        role: PartieRendezVous.medecin,
                                                      )
                                                    // RDV déjà accepté : le lieu reste modifiable
                                                    // tant qu'il est `confirme` (patient renotifié).
                                                    : rdv.peutEtreAccepte && rdv.accepteLe != null
                                                        ? Align(
                                                            alignment: Alignment.centerLeft,
                                                            child: TextButton.icon(
                                                                onPressed: () => afficherAccepterRdv(
                                                                    context,
                                                                    rdv: rdv,
                                                                    nomPatient: '${rdv.patient?.utilisateur?.prenom ?? ''} ${rdv.patient?.utilisateur?.nom ?? ''}',
                                                                ),
                                                                icon: const Icon(Icons.edit_location_alt_outlined, size: 16),
                                                                label: const Text('Modifier le lieu', style: TextStyle(fontSize: 12)),
                                                            ),
                                                          )
                                                        : null,
                                                bottom: _Frow(
                                                    badge: rdv.estAReprogrammer
                                                        ? const BadgeChip(
                                                            label: 'À reprogrammer',
                                                            style: BadgeChipStyle.coral,
                                                            icon: Icons.event_busy_outlined,
                                                        )
                                                        : rdv.lieuAPreciser
                                                            ? const BadgeChip(
                                                                label: 'Lieu à préciser',
                                                                style: BadgeChipStyle.amber,
                                                                icon: Icons.location_on_outlined,
                                                            )
                                                        : rdv.statut ==
                                                                StatutRendezVous.enAttentePresence
                                                            ? const BadgeChip(
                                                                label: 'En cours',
                                                                style: BadgeChipStyle.amber,
                                                            )
                                                            : const BadgeChip(
                                                                label: 'Confirmé',
                                                                style: BadgeChipStyle.green,
                                                            ),
                                                    // Ni visio ni dossier pour `a_reprogrammer`
                                                    // (créneau initial passé).
                                                    // Téléconsultation : « Démarrer » (fin détectée par
                                                    // la visio, aucun code). RDV physique : « Terminé »
                                                    // (saisie du code donné par le patient).
                                                    // RDV physique payé non accepté : « Accepter »
                                                    // (saisie du lieu) avant toute autre action.
                                                    action: rdv.estAReprogrammer
                                                        ? null
                                                        : rdv.lieuAPreciser
                                                            ? RdvButton(
                                                                label: 'Accepter',
                                                                icon: Icons.location_on_outlined,
                                                                onPressed: () => afficherAccepterRdv(
                                                                    context,
                                                                    rdv: rdv,
                                                                    nomPatient: '${rdv.patient?.utilisateur?.prenom ?? ''} ${rdv.patient?.utilisateur?.nom ?? ''}',
                                                                ),
                                                            )
                                                        : rdv.typeRdv == TypeRdv.teleconsultation
                                                            ? RdvButton(
                                                                label: 'Démarrer',
                                                                icon: Icons.videocam_outlined,
                                                                onPressed: () {
                                                                    Navigator.of(context).push(
                                                                        MaterialPageRoute(
                                                                            builder: (_) =>
                                                                                TeleconsultationScreen(
                                                                                    rdv: rdv,
                                                                                ),
                                                                        ),
                                                                    );
                                                                },
                                                            )
                                                            : Row(
                                                                mainAxisSize: MainAxisSize.min,
                                                                children: [
                                                                    AppOutlineButton(
                                                                        label: 'Dossier',
                                                                        icon: Icons.description_outlined,
                                                                        onPressed: () {
                                                                            // TODO: Naviguer vers le dossier
                                                                            // patient (RDV en cabinet).
                                                                        },
                                                                    ),
                                                                    const SizedBox(width: 8),
                                                                    RdvButton(
                                                                        label: 'Terminé',
                                                                        icon: Icons.check_circle_outline,
                                                                        onPressed: () => afficherTerminerRdv(
                                                                            context,
                                                                            rdv: rdv,
                                                                            nomPatient:
                                                                                '${rdv.patient?.utilisateur?.prenom ?? ''} ${rdv.patient?.utilisateur?.nom ?? ''}',
                                                                        ),
                                                                    ),
                                                                ],
                                                            ),
                                                ),
                                            );
                                        }).toList(),
                                    ],
                                );
                            }).toList(),
                            const Padding(
                                padding: EdgeInsets.only(top: 16, bottom: 4),
                                child: Center(
                                    child: Text(
                                        'Les rendez-vous non payés apparaissent dans l\'onglet « En attente »',
                                        style: TextStyle(fontSize: 11, color: AppColors.inkFaint),
                                    ),
                                ),
                            ),
                        ],
                    ),
                );
            },
        );
    }
}

/// Panneau "En attente" (de paiement) — D8 : LECTURE SEULE.
///
/// Les RDV `cree` n'ont ni fonds, ni commission : le médecin ne peut ni les
/// confirmer, ni les refuser, ni déclarer d'absence, ni reprogrammer, ni
/// lancer la visio (le serveur refuse de toute façon : 409 `RDV_NON_PAYE`).
/// Pour lui, le serveur ne renvoie que l'identifiant, le créneau, le statut
/// et `non_paye: true` : on n'affiche donc ni patient ni motif.
class _PanelAttente extends ConsumerWidget {
    const _PanelAttente();

    @override
    Widget build(BuildContext context, WidgetRef ref) {
        final rdvAsync = ref.watch(listeRendezVousControllerProvider);

        return rdvAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, stack) => Center(child: Text('Erreur: $err')),
            data: (rdvList) {
                final rdvAttente =
                    rdvList.where((r) => r.estNonPaye).toList();

                if (rdvAttente.isEmpty) {
                    return const Align(
                      alignment: Alignment.topCenter,
                      child: ApsEmptyState(icon: Icons.event_note_outlined, tone: ApsTone.neutral, title: 'Aucun rendez-vous en attente de paiement'),
                    );
                }

                return SingleChildScrollView(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                            const AppAlert(
                                type: AppAlertType.primary,
                                message:
                                'Ces rendez-vous ne sont pas encore payés : vous ne '
                                    'pouvez pas agir dessus. Vous serez notifié et les '
                                    'détails vous seront communiqués dès que le patient '
                                    'aura réglé.',
                            ),
                            const SizedBox(height: 14),
                            const _SectionHead(title: 'En attente de paiement'),
                            ...rdvAttente.map((rdv) {
                                return _RdvNonPayeCard(
                                    key: ValueKey('non-paye-${rdv.rdvId}'),
                                    time: _formatTime(rdv.dateCreneau),
                                    dateLabel: _formatDateLabel(rdv.dateCreneau),
                                );
                            }).toList(),
                        ],
                    ),
                );
            },
        );
    }
}

/// Carte d'un RDV non payé (D8) : grisée, sans aucune donnée patient, avec les
/// actions visibles mais désactivées. Les interactions sont bloquées
/// ([IgnorePointer]) et le serveur refuse de toute façon toute action.
class _RdvNonPayeCard extends StatelessWidget {
    final String time;
    final String dateLabel;

    const _RdvNonPayeCard({super.key, required this.time, required this.dateLabel});

    @override
    Widget build(BuildContext context) {
        return Semantics(
            label: 'Rendez-vous en attente de paiement, $dateLabel à $time. '
                'Aucune action possible.',
            child: IgnorePointer(
                child: Opacity(
                    opacity: 0.6,
                    child: CardSurface(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(12),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                                Row(
                                    children: [
                                        Text(
                                            time,
                                            style: const TextStyle(
                                                fontFamily: AppTextStyles.fontMono,
                                                fontSize: 13,
                                                fontWeight: FontWeight.w700,
                                                color: AppColors.ink,
                                            ),
                                        ),
                                        const SizedBox(width: 8),
                                        Text(
                                            dateLabel,
                                            style: const TextStyle(
                                                fontSize: 11,
                                                color: AppColors.inkSoft,
                                            ),
                                        ),
                                        const Spacer(),
                                        Container(
                                            width: 32,
                                            height: 32,
                                            alignment: Alignment.center,
                                            decoration: const BoxDecoration(
                                                color: AppColors.inkFaint,
                                                shape: BoxShape.circle,
                                            ),
                                            child: const Icon(
                                                Icons.hourglass_empty_rounded,
                                                size: 16,
                                                color: Colors.white,
                                            ),
                                        ),
                                    ],
                                ),
                                const SizedBox(height: 10),
                                const Text(
                                    'Rendez-vous en attente de paiement',
                                    style: TextStyle(
                                        fontFamily: AppTextStyles.fontDisplay,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.ink,
                                    ),
                                ),
                                const SizedBox(height: 4),
                                const Text(
                                    'Les détails seront visibles après le paiement.',
                                    style: TextStyle(
                                        fontSize: 11,
                                        color: AppColors.inkSoft,
                                    ),
                                ),
                                const SizedBox(height: 12),
                                const _Frow(
                                    badge: BadgeChip(
                                        label: 'En attente de paiement',
                                        style: BadgeChipStyle.amber,
                                        icon: Icons.hourglass_empty_rounded,
                                    ),
                                    action: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                            _ActionDesactivee(
                                                label: 'Confirmer',
                                                icon: Icons.check,
                                            ),
                                            SizedBox(width: 8),
                                            _ActionDesactivee(
                                                label: 'Refuser',
                                                icon: Icons.close,
                                            ),
                                        ],
                                    ),
                                ),
                            ],
                        ),
                    ),
                ),
            ),
        );
    }
}

/// Bouton d'action désactivé (D8) : visible mais inerte, disponible une fois
/// le paiement confirmé.
class _ActionDesactivee extends StatelessWidget {
    final String label;
    final IconData icon;

    const _ActionDesactivee({required this.label, required this.icon});

    @override
    Widget build(BuildContext context) {
        return Tooltip(
            message: 'Disponible une fois le paiement confirmé',
            child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                    border: Border.all(color: AppColors.line),
                    borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                        Icon(icon, size: 13, color: AppColors.inkFaint),
                        const SizedBox(width: 5),
                        Text(
                            label,
                            style: const TextStyle(
                                fontFamily: AppTextStyles.fontDisplay,
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                                color: AppColors.inkFaint,
                            ),
                        ),
                    ],
                ),
            ),
        );
    }
}

/// Panneau "Terminés"
class _PanelTermines extends ConsumerWidget {
    const _PanelTermines();

    @override
    Widget build(BuildContext context, WidgetRef ref) {
        final rdvAsync = ref.watch(listeRendezVousControllerProvider);

        return rdvAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, stack) => Center(child: Text('Erreur: $err')),
            data: (rdvList) {
                // Filtrer: RDV terminés (honores ou non honores)
                final rdvTermines = rdvList
                    .where((r) =>
                r.statut == StatutRendezVous.honore ||
                    r.statut == StatutRendezVous.nonHonore)
                    .toList();

                if (rdvTermines.isEmpty) {
                    return const Align(
                      alignment: Alignment.topCenter,
                      child: ApsEmptyState(icon: Icons.event_note_outlined, tone: ApsTone.neutral, title: 'Aucun rendez-vous terminé'),
                    );
                }

                return SingleChildScrollView(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                            const _SectionHead(title: 'Rendez-vous terminés'),
                            ...rdvTermines.map((rdv) {
                                return _AppointmentCard(
                                    time: _formatTime(rdv.dateCreneau),
                                    dateLabel: _formatDateLabel(rdv.dateCreneau),
                                    initials: _genererInitiales(
                                        rdv.patient?.utilisateur?.prenom,
                                        rdv.patient?.utilisateur?.nom,
                                    ),
                                    name:
                                    '${rdv.patient?.utilisateur?.prenom ?? ''} ${rdv.patient?.utilisateur?.nom ?? ''}'
                                        .trim(),
                                    subtitle: rdv.statut == StatutRendezVous.honore
                                        ? 'Consulté'
                                        : 'Non honoré',
                                    subtitle2: rdv.typeRdv == TypeRdv.teleconsultation
                                        ? 'Téléconsultation'
                                        : 'Cabinet',
                                    // Fonds encore en séquestre : date de libération prévue.
                                    footer: rdv.fondsEnAttenteDeLiberation
                                        ? InfoLiberationFonds(
                                            message:
                                                'Fonds libérés le ${dateCourte(rdv.liberationPrevueLe)}',
                                        )
                                        : null,
                                    bottom: _Frow(
                                        badge: BadgeChip(
                                            label: rdv.statut == StatutRendezVous.honore
                                                ? 'Complété'
                                                : 'Non présenté',
                                            style: rdv.statut == StatutRendezVous.honore
                                                ? BadgeChipStyle.green
                                                : BadgeChipStyle.amber,
                                        ),
                                        action: AppOutlineButton(
                                            label: 'Dossier',
                                            icon: Icons.description_outlined,
                                            onPressed: () {
                                                // TODO: Voir le dossier patient
                                            },
                                        ),
                                    ),
                                );
                            }).toList(),
                        ],
                    ),
                );
            },
        );
    }
}

/// Panneau "Annulés"
class _PanelAnnules extends ConsumerWidget {
    const _PanelAnnules();

    @override
    Widget build(BuildContext context, WidgetRef ref) {
        final rdvAsync = ref.watch(listeRendezVousControllerProvider);

        return rdvAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, stack) => Center(child: Text('Erreur: $err')),
            data: (rdvList) {
                // Filtrer: RDV annulés
                final rdvAnnules =
                rdvList.where((r) => r.statut == StatutRendezVous.annule).toList();

                if (rdvAnnules.isEmpty) {
                    return const Align(
                      alignment: Alignment.topCenter,
                      child: ApsEmptyState(icon: Icons.event_note_outlined, tone: ApsTone.neutral, title: 'Aucun rendez-vous annulé'),
                    );
                }

                return SingleChildScrollView(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                            const _SectionHead(title: 'Rendez-vous annulés'),
                            ...rdvAnnules.map((rdv) {
                                return _AppointmentCard(
                                    time: _formatTime(rdv.dateCreneau),
                                    dateLabel: _formatDateLabel(rdv.dateCreneau),
                                    initials: _genererInitiales(
                                        rdv.patient?.utilisateur?.prenom,
                                        rdv.patient?.utilisateur?.nom,
                                    ),
                                    name:
                                    '${rdv.patient?.utilisateur?.prenom ?? ''} ${rdv.patient?.utilisateur?.nom ?? ''}'
                                        .trim(),
                                    subtitle: 'Consultation',
                                    subtitle2: rdv.typeRdv == TypeRdv.teleconsultation
                                        ? 'Téléconsultation'
                                        : 'Cabinet',
                                    bottom: const _Frow(
                                        badge: BadgeChip(
                                            label: 'Annulé',
                                            style: BadgeChipStyle.coral,
                                        ),
                                    ),
                                );
                            }).toList(),
                        ],
                    ),
                );
            },
        );
    }
}

/// ════════════════════════════════════════════════════════════
/// Composants réutilisables
/// ════════════════════════════════════════════════════════════

class _AppointmentCard extends StatelessWidget {
    final String time;
    final String dateLabel;
    final String initials;
    final String name;
    final String subtitle;
    final String subtitle2;
    final Widget? bottom;
  /// Contenu additionnel sous la ligne du bas (panneau de reprogrammation).
  final Widget? footer;

    const _AppointmentCard({
        required this.time,
        required this.dateLabel,
        required this.initials,
        required this.name,
        required this.subtitle,
        required this.subtitle2,
        this.bottom,
    this.footer,
    });

    @override
    Widget build(BuildContext context) {
        return ApsCard(
          margin: const EdgeInsets.only(bottom: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  SizedBox(
                    width: 50,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(time, style: AppTextStyles.mono.copyWith(fontSize: 13)),
                        Text(dateLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTextStyles.xs.copyWith(fontSize: 10)),
                      ],
                    ),
                  ),
                  ApsAvatar(name: name, size: 36),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTextStyles.strong.copyWith(fontSize: 13.5)),
                        Text(
                          [subtitle, subtitle2].where((e) => e.isNotEmpty).join(' · '),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppTextStyles.xs,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (bottom != null) ...[
                const ApsDivider(),
                bottom!,
              ],
              if (footer != null) ...[
                const SizedBox(height: 12),
                footer!,
              ],
            ],
          ),
        );
    }
}

class _Frow extends StatelessWidget {
    final Widget? badge;
    final Widget? action;

    const _Frow({this.badge, this.action});

    @override
    Widget build(BuildContext context) {
        return Row(
            children: [
                if (badge != null) badge!,
                const Spacer(),
                if (action != null) action!,
            ],
        );
    }
}

/// ════════════════════════════════════════════════════════════
/// Utilitaires
/// ════════════════════════════════════════════════════════════

/// Format l'heure (ex: "09:30")
String _formatTime(DateTime dateHeure) {
    return '${dateHeure.hour.toString().padLeft(2, '0')}:${dateHeure.minute.toString().padLeft(2, '0')}';
}

/// Format le label de date (ex: "Auj.", "Demain", "Jeu 20")
String _formatDateLabel(DateTime dateHeure) {
    final maintenant = DateTime.now();
    final demain = maintenant.add(const Duration(days: 1));

    if (dateHeure.year == maintenant.year &&
        dateHeure.month == maintenant.month &&
        dateHeure.day == maintenant.day) {
        return 'Auj.';
    }

    if (dateHeure.year == demain.year &&
        dateHeure.month == demain.month &&
        dateHeure.day == demain.day) {
        return 'Demain';
    }

    const jours = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    final jour = jours[dateHeure.weekday - 1];
    return '$jour ${dateHeure.day}';
}

/// Génère les initiales (ex: "EK" pour "Émile Kammogne")
String _genererInitiales(String? prenom, String? nom) {
    String init = '';
    if (prenom != null && prenom.isNotEmpty) {
        init += prenom[0].toUpperCase();
    }
    if (nom != null && nom.isNotEmpty) {
        init += nom[0].toUpperCase();
    }
    return init.isNotEmpty ? init : '?';
}

/// Groupe les RDV par date
Map<String, List<RendezVous>> _grouperParDate(List<RendezVous> rdvList) {
    final groupes = <String, List<RendezVous>>{};

    for (final rdv in rdvList) {
        final dateLabel = _formatDateLabel(rdv.dateCreneau);
        if (!groupes.containsKey(dateLabel)) {
            groupes[dateLabel] = [];
        }
        groupes[dateLabel]!.add(rdv);
    }

    return groupes;
}