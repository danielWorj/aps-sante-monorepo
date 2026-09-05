import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/rendez_vous_controller.dart';
import '../../../models/authentification_models.dart';
import '../../../models/rendez_vous_models.dart';
import '../../../utils/api_client.dart' show ApiException;

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
            color: AppColors.paper,
            child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                        const _PageHead(),
                        // Afficher le bandeau du médecin connecté
                        _DoctorStrip(medecin: medecinProfile),
                        const SizedBox(height: 2),
                        // Statistiques (dynamiques basées sur les RDV récupérés)
                        _StatLine(ref: ref),
                        const SizedBox(height: 2),
                        _SegmentedTabs(controller: _tabController),
                        const SizedBox(height: 16),
                        SizedBox(
                            height: MediaQuery.of(context).size.height,
                            child: TabBarView(
                                controller: _tabController,
                                physics: const NeverScrollableScrollPhysics(),
                                children: [
                                    const _PanelConfirme(),
                                    // Après confirmation d'une demande, on bascule
                                    // automatiquement sur l'onglet "Confirmé" (index 0).
                                    _PanelAttente(
                                        onConfirme: () => _tabController.animateTo(0),
                                    ),
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
/// En-tête de page
/// ════════════════════════════════════════════════════════════
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

/// ════════════════════════════════════════════════════════════
/// Bandeau praticien (affiche le médecin connecté)
/// ════════════════════════════════════════════════════════════
class _DoctorStrip extends StatelessWidget {
    final Utilisateur? medecin;

    const _DoctorStrip({this.medecin});

    @override
    Widget build(BuildContext context) {
        final nom = medecin?.prenom ?? 'Dr';
        final initiales = _genererInitiales(medecin?.prenom, medecin?.nom);

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
                        child: Text(
                            initiales,
                            style: const TextStyle(
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
                                    children: [
                                        Flexible(
                                            child: Text(
                                                'Dr $nom',
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                    fontFamily: AppTextStyles.fontDisplay,
                                                    fontSize: 13.5,
                                                    fontWeight: FontWeight.w700,
                                                    color: AppColors.ink,
                                                ),
                                            ),
                                        ),
                                        const SizedBox(width: 5),
                                        const Icon(Icons.check_circle,
                                            size: 14, color: AppColors.green600),
                                    ],
                                ),
                                const SizedBox(height: 2),
                                Text(
                                    medecin?.email ?? 'Chargement...',
                                    style: const TextStyle(
                                        fontSize: 11.5,
                                        color: AppColors.inkSoft,
                                        overflow: TextOverflow.ellipsis,
                                    ),
                                ),
                            ],
                        ),
                    ),
                ],
            ),
        );
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
                    rdvList.where((rdv) => rdv.typeRdv == TypeRdv.teleconsultation).length;

                return Padding(
                    padding: const EdgeInsets.fromLTRB(4, 2, 4, 14),
                    child: Row(
                        children: [
                            _stat('$aujourd_hui', "aujourd'hui"),
                            const SizedBox(width: 14),
                            _sep(),
                            const SizedBox(width: 14),
                            _stat('$cette_semaine', 'cette semaine'),
                            const SizedBox(width: 14),
                            _sep(),
                            const SizedBox(width: 14),
                            _stat('$en_visio', 'en visio'),
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
        rdv.dateCreneau.isAfter(maintenant) &&
            rdv.dateCreneau.isBefore(finSemaine))
            .length;
    }

    Widget _sep() => Container(
        width: 1,
        height: 16,
        color: AppColors.line,
    );

    Widget _stat(String value, String label) => RichText(
        text: TextSpan(
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
                _TabDef(label: 'Confirmé', count: null),
                _TabDef(label: 'En attente', count: null),
                _TabDef(label: 'Terminés', count: null),
                _TabDef(label: 'Annulés', count: null),
            ],
            error: (_, __) => const [
                _TabDef(label: 'Confirmé', count: 0),
                _TabDef(label: 'En attente', count: 0),
                _TabDef(label: 'Terminés', count: 0),
                _TabDef(label: 'Annulés', count: 0),
            ],
            data: (rdvList) => [
                _TabDef(
                    label: 'Confirmé',
                    count: rdvList
                        .where((r) => r.statut == StatutRendezVous.confirme)
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
                                                            color: active
                                                                ? Colors.white
                                                                : AppColors.inkSoft,
                                                        ),
                                                    ),
                                                ),
                                                if (def.count != null && def.count! > 0) ...[
                                                    const SizedBox(width: 5),
                                                    Container(
                                                        padding: const EdgeInsets.symmetric(
                                                            horizontal: 6,
                                                            vertical: 1,
                                                        ),
                                                        decoration: BoxDecoration(
                                                            color: active
                                                                ? Colors.white.withValues(alpha: 0.22)
                                                                : AppColors.green100,
                                                            borderRadius: BorderRadius.circular(100),
                                                        ),
                                                        child: Text(
                                                            '${def.count}',
                                                            style: TextStyle(
                                                                fontFamily: AppTextStyles.fontDisplay,
                                                                fontSize: 9.5,
                                                                fontWeight: FontWeight.w700,
                                                                color: active
                                                                    ? Colors.white
                                                                    : AppColors.green700,
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
                    Text(
                        title,
                        style: const TextStyle(
                            fontFamily: AppTextStyles.fontDisplay,
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                            color: AppColors.ink,
                        ),
                    ),
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

/// Panneau "Confirmé"
class _PanelConfirme extends ConsumerWidget {
    const _PanelConfirme();

    @override
    Widget build(BuildContext context, WidgetRef ref) {
        final rdvAsync = ref.watch(listeRendezVousControllerProvider);

        return rdvAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, stack) => Center(child: Text('Erreur: $err')),
            data: (rdvList) {
                // Filtrer: RDV confirmés (peu importe la date), groupés par date
                final rdvConfirmes = rdvList
                    .where((r) => r.statut == StatutRendezVous.confirme)
                    .toList();

                if (rdvConfirmes.isEmpty) {
                    return const Center(
                        child: Text('Aucun rendez-vous confirmé'),
                    );
                }

                // Grouper par date
                final groupesParDate = _grouperParDate(rdvConfirmes);

                return SingleChildScrollView(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
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
                                                    : 'Cabinet',
                                                bottom: _Frow(
                                                    badge: const BadgeChip(
                                                        label: 'Confirmé',
                                                        style: BadgeChipStyle.green,
                                                    ),
                                                    action: RdvButton(
                                                        label: rdv.typeRdv == TypeRdv.teleconsultation
                                                            ? 'Démarrer'
                                                            : 'Dossier',
                                                        icon: rdv.typeRdv == TypeRdv.teleconsultation
                                                            ? Icons.videocam_outlined
                                                            : Icons.description_outlined,
                                                        onPressed: () {
                                                            // TODO: Gérer l'action
                                                        },
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
                                        'Confirmez ou refusez les demandes pour accéder aux fonds',
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

/// Panneau "En attente"
class _PanelAttente extends ConsumerWidget {
    /// Appelé après confirmation réussie d'une demande, pour permettre
    /// au parent de basculer sur l'onglet "Confirmé".
    final VoidCallback? onConfirme;

    const _PanelAttente({this.onConfirme});

    @override
    Widget build(BuildContext context, WidgetRef ref) {
        final rdvAsync = ref.watch(listeRendezVousControllerProvider);

        return rdvAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, stack) => Center(child: Text('Erreur: $err')),
            data: (rdvList) {
                // Filtrer: RDV en attente (statut "cree")
                final rdvAttente =
                rdvList.where((r) => r.statut == StatutRendezVous.cree).toList();

                if (rdvAttente.isEmpty) {
                    return const Center(
                        child: Text('Aucune demande en attente'),
                    );
                }

                return SingleChildScrollView(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                            const AppAlert(
                                type: AppAlertType.primary,
                                message:
                                'Acceptez ou refusez chaque demande : les fonds sont '
                                    'capturés après votre acceptation uniquement.',
                            ),
                            const SizedBox(height: 14),
                            const _SectionHead(title: 'Demandes en attente'),
                            ...rdvAttente.map((rdv) {
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
                                    subtitle: 'Consultation générale',
                                    subtitle2: rdv.typeRdv == TypeRdv.teleconsultation
                                        ? 'Téléconsultation'
                                        : 'Cabinet',
                                    bottom: _Frow(
                                        action: _PendingRdvActions(
                                            rdv: rdv,
                                            onConfirme: onConfirme,
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
/// Actions "Confirmer" / "Refuser" d'une demande en attente
/// ════════════════════════════════════════════════════════════
///
/// PATCH /rendez-vous/:id/statut via [ActionsRendezVousController].
/// Un état local (`_enCours`) affiche un loader pendant l'appel et
/// évite les double-taps ; en cas de succès de la confirmation, le
/// parent est notifié via [onConfirme] pour basculer l'utilisateur
/// sur l'onglet "Confirmé".
class _PendingRdvActions extends ConsumerStatefulWidget {
    final RendezVous rdv;
    final VoidCallback? onConfirme;

    const _PendingRdvActions({required this.rdv, this.onConfirme});

    @override
    ConsumerState<_PendingRdvActions> createState() =>
        _PendingRdvActionsState();
}

class _PendingRdvActionsState extends ConsumerState<_PendingRdvActions> {
    bool _enCours = false;

    Future<void> _changerStatut(StatutRendezVous nouveauStatut) async {
        if (_enCours) return;

        final token = ref.read(authTokenProvider);
        if (token == null) return;

        setState(() => _enCours = true);
        try {
            await ref.read(actionsRendezVousControllerProvider.notifier).changerStatut(
                widget.rdv.rdvId,
                payload: ChangerStatutRendezVousPayload(statut: nouveauStatut),
                token: token,
            );
            if (!mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                    content: Text(
                        nouveauStatut == StatutRendezVous.confirme
                            ? 'Rendez-vous confirmé.'
                            : 'Rendez-vous refusé.',
                    ),
                ),
            );
            // Seule la confirmation fait basculer vers "Confirmé" — un
            // refus reste visible dans l'onglet "Annulés".
            if (nouveauStatut == StatutRendezVous.confirme) {
                widget.onConfirme?.call();
            }
        } on ApiException catch (e) {
            if (!mounted) return;
            ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text(e.message)));
        } catch (e) {
            if (!mounted) return;
            ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text('Erreur : $e')));
        } finally {
            if (mounted) setState(() => _enCours = false);
        }
    }

    @override
    Widget build(BuildContext context) {
        if (_enCours) {
            return const SizedBox(
                height: 32,
                width: 32,
                child: Center(
                    child: CircularProgressIndicator(strokeWidth: 2),
                ),
            );
        }

        return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
                RdvButton(
                    label: 'Confirmer',
                    onPressed: () => _changerStatut(StatutRendezVous.confirme),
                ),
                const SizedBox(width: 8),
                _DangerOutlineButton(
                    label: 'Refuser',
                    onPressed: () => _changerStatut(StatutRendezVous.annule),
                ),
            ],
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
                    return const Center(
                        child: Text('Aucun rendez-vous terminé'),
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
                    return const Center(
                        child: Text('Aucun rendez-vous annulé'),
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

    const _AppointmentCard({
        required this.time,
        required this.dateLabel,
        required this.initials,
        required this.name,
        required this.subtitle,
        required this.subtitle2,
        this.bottom,
    });

    @override
    Widget build(BuildContext context) {
        return CardSurface(
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
                                    color: AppColors.primary,
                                    shape: BoxShape.circle,
                                ),
                                child: Text(
                                    initials,
                                    style: const TextStyle(
                                        fontFamily: AppTextStyles.fontDisplay,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 11,
                                        color: Colors.white,
                                    ),
                                ),
                            ),
                        ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                        name,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontFamily: AppTextStyles.fontDisplay,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: AppColors.ink,
                        ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                        subtitle,
                        style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.inkSoft,
                        ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                        subtitle2,
                        style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.inkSoft,
                        ),
                    ),
                    if (bottom != null) ...[
                        const SizedBox(height: 12),
                        bottom!,
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

class _DangerOutlineButton extends StatelessWidget {
    final String label;
    final VoidCallback? onPressed;

    const _DangerOutlineButton({
        required this.label,
        this.onPressed,
    });

    @override
    Widget build(BuildContext context) {
        return Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
                border: Border.all(color: AppColors.coral600),
                borderRadius: BorderRadius.circular(6),
            ),
            child: GestureDetector(
                onTap: onPressed,
                child: Text(
                    label,
                    style: const TextStyle(
                        fontFamily: AppTextStyles.fontDisplay,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.coral600,
                    ),
                ),
            ),
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