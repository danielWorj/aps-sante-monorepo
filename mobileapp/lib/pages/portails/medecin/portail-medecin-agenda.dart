import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/agenda_controller.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/medecin_controller.dart';
import '../../../models/agenda_models.dart';
import '../../../models/periodes_agenda.dart';
import '../../../repositories/rendez_vous_repository.dart' show ApiException;
import '../../../utils/fonds.dart' show jourLongLocal;
import 'selecteur_periodes.dart';

/// ============================================================
/// portail-medecin-agenda.dart
///
/// Onglet « Agenda » de l'espace médecin (affiché par `MedecinHomeShell`,
/// qui fournit le Scaffold et la barre de navigation basse).
///
/// 1. **Ma semaine type** — le gabarit hebdomadaire (DisponibiliteMedecin).
///    Pour chaque jour, le médecin coche des PÉRIODES (matin, après-midi,
///    soirée : toutes leurs tranches sont sélectionnées) et peut affiner
///    heure par heure (voir selecteur_periodes.dart). « Copier » recopie un
///    jour sur d'autres. Enregistré en une fois (PUT
///    /medecins/:id/disponibilites) ; le serveur publie aussitôt les semaines
///    à venir. Les rendez-vous déjà réservés sur une tranche retirée sont
///    maintenus, et on le signale.
/// 2. **Mes prochains jours** — les créneaux réels, 7 jours à la fois :
///    périodes ouvertes, créneaux libres, rendez-vous. « Modifier » crée une
///    EXCEPTION pour cette date seulement (congé, demi-journée, ouverture
///    exceptionnelle) ; « Revenir à la semaine type » l'annule. Un créneau
///    réservé n'est jamais fermé ici.
/// ============================================================
class PortailMedecinAgenda extends ConsumerStatefulWidget {
  const PortailMedecinAgenda({super.key});

  @override
  ConsumerState<PortailMedecinAgenda> createState() => _PortailMedecinAgendaState();
}

class _PortailMedecinAgendaState extends ConsumerState<PortailMedecinAgenda> {
  /// L'agenda est publié sur 60 jours (AGENDA_HORIZON_JOURS côté serveur).
  static const int _semainesMax = 8;

  bool _chargement = true;
  bool _chargementJours = false;
  bool _enregistrement = false;
  String? _erreur;

  List<HoraireAgenda> _horaires = const [];
  List<GroupePeriode> _groupes = const [];

  /// Gabarit enregistré côté serveur, et gabarit en cours d'édition :
  /// ensembles de clés « jour|horaire_id ».
  Set<String> _gabaritServeur = {};
  Set<String> _gabarit = {};

  int _semaine = 0;
  List<CreneauAgenda> _creneaux = const [];

  String? get _medecinId => ref.read(monProfilMedecinControllerProvider).value?.medecin.medecinId;

  bool get _modifie => _gabarit.length != _gabaritServeur.length || !_gabarit.containsAll(_gabaritServeur);

  static String _cle(String jour, String horaireId) => '$jour|$horaireId';

  static String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static DateTime get _aujourdhui {
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day);
  }

  List<DateTime> get _jours =>
      [for (var i = 0; i < 7; i++) _aujourdhui.add(Duration(days: _semaine * 7 + i))];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _charger());
  }

  Future<String> _exigerMedecinId() async {
    var medecinId = _medecinId;
    if (medecinId == null) {
      final token = ref.read(authTokenProvider);
      if (token == null) throw const ApiException('Session expirée : reconnectez-vous.');
      await ref.read(monProfilMedecinControllerProvider.notifier).charger(token: token);
      medecinId = _medecinId;
    }
    if (medecinId == null) throw const ApiException('Profil médecin introuvable.');
    return medecinId;
  }

  Future<void> _charger() async {
    setState(() {
      _chargement = true;
      _erreur = null;
    });
    try {
      final medecinId = await _exigerMedecinId();
      final repo = ref.read(agendaRepositoryProvider);
      final resultats = await Future.wait([
        repo.listerHoraires(),
        repo.listerDisponibilites(medecinId),
      ]);
      if (!mounted) return;
      final horaires = resultats[0] as List<HoraireAgenda>;
      final gabarit = {
        for (final d in resultats[1] as List<DisponibiliteMedecin>) _cle(d.jourSemaine, d.horaireId),
      };
      setState(() {
        _horaires = horaires;
        _groupes = grouperParPeriode(horaires);
        _gabaritServeur = gabarit;
        _gabarit = {...gabarit};
        _chargement = false;
      });
      await _chargerJours();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _erreur = _message(e, "Impossible de charger l'agenda.");
        _chargement = false;
      });
    }
  }

  Future<void> _chargerJours() async {
    final medecinId = _medecinId;
    if (medecinId == null) return;
    setState(() => _chargementJours = true);
    try {
      final jours = _jours;
      final creneaux = await ref.read(agendaRepositoryProvider).listerCreneaux(
            medecinId,
            filtres: FiltresAgenda(dateDebut: jours.first, dateFin: jours.last),
          );
      if (!mounted) return;
      setState(() => _creneaux = creneaux);
    } catch (e) {
      _afficher(_message(e, 'Impossible de charger vos prochains jours.'));
    } finally {
      if (mounted) setState(() => _chargementJours = false);
    }
  }

  String _message(Object e, String parDefaut) => e is ApiException ? e.message : parDefaut;

  void _afficher(String message, {bool long = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), duration: Duration(seconds: long ? 7 : 4)),
    );
  }

  /* ----------------------------- Semaine type ----------------------------- */

  Set<String> _selectionDuJour(String jour) =>
      {for (final h in _horaires) if (_gabarit.contains(_cle(jour, h.horaireId))) h.horaireId};

  void _changerJourType(String jour, Set<String> selection) {
    setState(() {
      _gabarit.removeWhere((k) => k.startsWith('$jour|'));
      _gabarit.addAll(selection.map((id) => _cle(jour, id)));
    });
  }

  Future<void> _copierJour(String source) async {
    final cibles = await showModalBottomSheet<Set<String>>(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(14))),
      builder: (_) => _FeuilleCopie(source: source),
    );
    if (cibles == null || cibles.isEmpty) return;
    final selection = _selectionDuJour(source);
    for (final c in cibles) {
      _changerJourType(c, selection);
    }
    final libelle = joursSemaineAgenda.firstWhere((j) => j.valeur == source).libelle.toLowerCase();
    _afficher('Horaires du $libelle copiés sur ${cibles.length} jour(s). Pensez à enregistrer.');
  }

  Future<void> _enregistrerSemaine() async {
    final token = ref.read(authTokenProvider);
    final medecinId = _medecinId;
    if (medecinId == null || token == null || _enregistrement) return;
    setState(() => _enregistrement = true);
    try {
      final r = await ref.read(agendaRepositoryProvider).remplacerDisponibilites(
            medecinId: medecinId,
            token: token,
            disponibilites: [
              for (final k in _gabarit) (jourSemaine: k.split('|').first, horaireId: k.split('|').last),
            ],
          );
      final gabarit = {for (final d in r.disponibilites) _cle(d.jourSemaine, d.horaireId)};
      if (!mounted) return;
      setState(() {
        _gabaritServeur = gabarit;
        _gabarit = {...gabarit};
      });
      _afficher(
        r.rdvMaintenus > 0
            ? 'Semaine type enregistrée. ${r.rdvMaintenus} rendez-vous déjà réservé(s) sur des horaires '
                'retirés sont maintenus : annulez-les depuis vos rendez-vous si besoin.'
            : 'Semaine type enregistrée : vos horaires sont publiés sur les semaines à venir.',
        long: r.rdvMaintenus > 0,
      );
      await _chargerJours();
    } catch (e) {
      _afficher(_message(e, "Impossible d'enregistrer votre semaine type."));
    } finally {
      if (mounted) setState(() => _enregistrement = false);
    }
  }

  /* --------------------------- Exceptions datées --------------------------- */

  Future<void> _modifierJour(DateTime jour, List<CreneauAgenda> creneaux) async {
    final medecinId = _medecinId;
    final token = ref.read(authTokenProvider);
    if (medecinId == null || token == null) return;
    final messenger = ScaffoldMessenger.of(context);
    final resultat = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(14))),
      builder: (_) => _FeuilleJour(
        titre: _majuscule(jourLongLocal(jour)),
        groupes: _groupes,
        selection: {for (final c in creneaux) if (!c.estBloque) c.horaireId},
        verrouilles: {for (final c in creneaux) if (c.estReserve) c.horaireId},
        personnalise: creneaux.any((c) => c.origine == 'manuel'),
        enregistrer: (selection) => ref.read(agendaRepositoryProvider).definirJour(
              medecinId: medecinId,
              date: _iso(jour),
              horaireIds: selection,
              token: token,
            ),
        retablir: () => ref.read(agendaRepositoryProvider).retablirJour(
              medecinId: medecinId,
              date: _iso(jour),
              token: token,
            ),
      ),
    );
    if (resultat == null) return;
    messenger.showSnackBar(SnackBar(content: Text(resultat), duration: const Duration(seconds: 5)));
    await _chargerJours();
  }

  static String _majuscule(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

  /* --------------------------------- Rendu --------------------------------- */

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.bg,
      child: RefreshIndicator(
        color: AppColors.b6,
        onRefresh: _charger,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 120),
          children: [
            const ApsPageTitle('Agenda', trailing: SizedBox(width: 42)),
            if (_chargement)
              const Padding(
                padding: EdgeInsets.only(top: 60),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_erreur != null)
              ApsEmptyState(
                icon: Icons.event_busy_outlined,
                tone: ApsTone.neutral,
                title: 'Agenda indisponible',
                message: _erreur!,
                actionLabel: 'Réessayer',
                onAction: _charger,
              )
            else ...[
              _buildSemaineType(),
              const SizedBox(height: 14),
              _buildProchainsJours(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSemaineType() {
    return _Bloc(
      titre: 'Ma semaine type',
      icone: Icons.repeat,
      sousTitre: 'Ces horaires se répètent chaque semaine. Touchez une période pour ouvrir '
          'toutes ses heures, puis affinez si besoin.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final j in joursSemaineAgenda) ...[
            Builder(builder: (_) {
              final selection = _selectionDuJour(j.valeur);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text.rich(
                          TextSpan(children: [
                            TextSpan(text: j.libelle, style: AppTextStyles.strong),
                            TextSpan(
                              text: '   ${resumeJournee(_groupes, selection)}',
                              style: AppTextStyles.xs.copyWith(
                                color: selection.isEmpty ? AppColors.ink3 : AppColors.b7,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ]),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (selection.isNotEmpty)
                        TextButton.icon(
                          onPressed: _enregistrement ? null : () => _copierJour(j.valeur),
                          style: TextButton.styleFrom(
                            foregroundColor: AppColors.b7,
                            visualDensity: VisualDensity.compact,
                          ),
                          icon: const Icon(Icons.copy_rounded, size: 15),
                          label: const Text('Copier', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SelecteurPeriodes(
                    groupes: _groupes,
                    selection: selection,
                    enabled: !_enregistrement,
                    onChanged: (s) => _changerJourType(j.valeur, s),
                  ),
                ],
              );
            }),
            if (j != joursSemaineAgenda.last) const ApsDivider(),
          ],
          const SizedBox(height: 12),
          ApsButton(
            label: _modifie ? 'Enregistrer ma semaine' : 'Semaine à jour',
            icon: _modifie ? Icons.check_rounded : null,
            loading: _enregistrement,
            onPressed: (_modifie && !_enregistrement) ? _enregistrerSemaine : null,
          ),
          if (_modifie && !_enregistrement)
            TextButton(
              onPressed: () => setState(() => _gabarit = {..._gabaritServeur}),
              style: TextButton.styleFrom(foregroundColor: AppColors.ink2),
              child: const Text('Annuler les modifications', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
        ],
      ),
    );
  }

  Widget _buildProchainsJours() {
    final parJour = <String, List<CreneauAgenda>>{};
    for (final c in _creneaux) {
      parJour.putIfAbsent(c.cleJourMural, () => []).add(c);
    }
    final jours = _jours;
    final aujourdhui = _aujourdhui;
    return _Bloc(
      titre: 'Mes prochains jours',
      icone: Icons.calendar_month_outlined,
      sousTitre: 'Un imprévu ou un congé ? Modifiez une date précise sans toucher à votre semaine type.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _BoutonNav(
                icone: Icons.chevron_left_rounded,
                onTap: _semaine > 0 && !_chargementJours
                    ? () {
                        setState(() => _semaine--);
                        _chargerJours();
                      }
                    : null,
              ),
              Expanded(
                child: Text(
                  '${jours.first.day}/${jours.first.month} – ${jours.last.day}/${jours.last.month}',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.strong,
                ),
              ),
              _BoutonNav(
                icone: Icons.chevron_right_rounded,
                onTap: _semaine < _semainesMax && !_chargementJours
                    ? () {
                        setState(() => _semaine++);
                        _chargerJours();
                      }
                    : null,
              ),
            ],
          ),
          const SizedBox(height: 12),
          AnimatedOpacity(
            opacity: _chargementJours ? 0.5 : 1,
            duration: const Duration(milliseconds: 150),
            child: Column(
              children: [
                for (final jour in jours)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _CarteJour(
                      jour: jour,
                      titre: _majuscule(jourLongLocal(jour)),
                      estAujourdhui: jour == aujourdhui,
                      creneaux: parJour[_iso(jour)] ?? const [],
                      groupes: _groupes,
                      onModifier: _chargementJours
                          ? null
                          : () => _modifierJour(jour, parJour[_iso(jour)] ?? const []),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          ApsNote.text(
            'Un créneau réservé par un patient n\'est jamais fermé : annulez d\'abord le rendez-vous si nécessaire.',
            icon: Icons.lock_outline,
          ),
        ],
      ),
    );
  }
}

class _Bloc extends StatelessWidget {
  final String titre;
  final IconData icone;
  final String sousTitre;
  final Widget child;

  const _Bloc({required this.titre, required this.icone, required this.sousTitre, required this.child});

  @override
  Widget build(BuildContext context) {
    return ApsCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ApsIconTile(icone, small: true),
              const SizedBox(width: 10),
              Expanded(child: Text(titre, style: AppTextStyles.section)),
            ],
          ),
          const SizedBox(height: 8),
          Text(sousTitre, style: AppTextStyles.small),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

class _BoutonNav extends StatelessWidget {
  final IconData icone;
  final VoidCallback? onTap;

  const _BoutonNav({required this.icone, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: onTap == null ? AppColors.slotOff : AppColors.b1,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: SizedBox(
          width: 38,
          height: 38,
          child: Icon(icone, color: onTap == null ? AppColors.ink4 : AppColors.b7),
        ),
      ),
    );
  }
}

/// Une date des prochains jours : périodes ouvertes, créneaux libres,
/// rendez-vous, et accès à la modification de cette date.
class _CarteJour extends StatelessWidget {
  final DateTime jour;
  final String titre;
  final bool estAujourdhui;
  final List<CreneauAgenda> creneaux;
  final List<GroupePeriode> groupes;
  final VoidCallback? onModifier;

  const _CarteJour({
    required this.jour,
    required this.titre,
    required this.estAujourdhui,
    required this.creneaux,
    required this.groupes,
    this.onModifier,
  });

  @override
  Widget build(BuildContext context) {
    final ouverts = creneaux.where((c) => !c.estBloque).toList();
    final personnalise = creneaux.any((c) => c.origine == 'manuel');
    final rdv = creneaux.where((c) => c.estReserve).length;
    return ApsCard(
      flat: !estAujourdhui,
      borderColor: estAujourdhui ? AppColors.b7 : null,
      padding: const EdgeInsets.all(12),
      onTap: onModifier,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 46,
            height: 50,
            decoration: BoxDecoration(
              color: estAujourdhui ? AppColors.b7 : AppColors.b1,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  joursSemaineAgenda[jour.weekday - 1].court,
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: estAujourdhui ? Colors.white : AppColors.b7,
                  ),
                ),
                Text(
                  '${jour.day}',
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: estAujourdhui ? Colors.white : AppColors.b8,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(titre, style: AppTextStyles.strong.copyWith(fontSize: 13.5)),
                    if (estAujourdhui) const ApsPill("Aujourd'hui"),
                    if (personnalise) const ApsPill('Personnalisé', tone: ApsTone.amber),
                  ],
                ),
                const SizedBox(height: 6),
                if (ouverts.isEmpty)
                  Text('Fermé', style: AppTextStyles.xs.copyWith(color: AppColors.ink3))
                else
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final g in groupes)
                        if (ouverts.any((c) => g.ids.contains(c.horaireId)))
                          _PastillePeriode(
                            groupe: g,
                            libres: creneaux.where((c) => c.estDisponible && g.ids.contains(c.horaireId)).length,
                          ),
                    ],
                  ),
                if (rdv > 0) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(Icons.event_available_rounded, size: 14, color: AppColors.amber700),
                      const SizedBox(width: 4),
                      Text(
                        '$rdv rendez-vous',
                        style: AppTextStyles.xs.copyWith(color: AppColors.amber700, fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          if (onModifier != null)
            const Padding(
              padding: EdgeInsets.only(left: 4, top: 14),
              child: Icon(Icons.edit_outlined, size: 18, color: AppColors.ink3),
            ),
        ],
      ),
    );
  }
}

class _PastillePeriode extends StatelessWidget {
  final GroupePeriode groupe;
  final int libres;

  const _PastillePeriode({required this.groupe, required this.libres});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(groupe.periode.icone, size: 12, color: AppColors.b7),
          const SizedBox(width: 4),
          Text(
            '${groupe.periode.libelle} · $libres libre${libres > 1 ? 's' : ''}',
            style: AppTextStyles.xs.copyWith(color: AppColors.ink2, fontWeight: FontWeight.w700, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

/// Feuille « Copier vers… » : renvoie les jours cibles choisis.
class _FeuilleCopie extends StatefulWidget {
  final String source;

  const _FeuilleCopie({required this.source});

  @override
  State<_FeuilleCopie> createState() => _FeuilleCopieState();
}

class _FeuilleCopieState extends State<_FeuilleCopie> {
  final Set<String> _cibles = {};

  @override
  Widget build(BuildContext context) {
    final autres = joursSemaineAgenda.where((j) => j.valeur != widget.source).toList();
    final libelle = joursSemaineAgenda.firstWhere((j) => j.valeur == widget.source).libelle.toLowerCase();
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ApsSheetHeader(title: 'Copier les horaires du $libelle', onClose: () => Navigator.pop(context)),
            const SizedBox(height: 14),
            Row(
              children: [
                ApsChip(
                  'Lun–Ven',
                  soft: true,
                  onTap: () => setState(() => _cibles
                    ..clear()
                    ..addAll(joursOuvresAgenda.where((j) => j != widget.source))),
                ),
                const SizedBox(width: 8),
                ApsChip(
                  'Tous',
                  soft: true,
                  onTap: () => setState(() => _cibles
                    ..clear()
                    ..addAll(autres.map((j) => j.valeur))),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final j in autres)
                  ApsChip(
                    j.libelle,
                    selected: _cibles.contains(j.valeur),
                    icon: _cibles.contains(j.valeur) ? Icons.check_rounded : null,
                    onTap: () => setState(() => _cibles.contains(j.valeur) ? _cibles.remove(j.valeur) : _cibles.add(j.valeur)),
                  ),
              ],
            ),
            const SizedBox(height: 18),
            ApsButton(
              label: _cibles.isEmpty ? 'Choisissez des jours' : 'Copier sur ${_cibles.length} jour(s)',
              icon: Icons.copy_rounded,
              onPressed: _cibles.isEmpty ? null : () => Navigator.pop(context, {..._cibles}),
            ),
          ],
        ),
      ),
    );
  }
}

/// Feuille d'édition d'une date précise. Renvoie le message à afficher si la
/// journée a été enregistrée ou rétablie, `null` si l'utilisateur ferme.
class _FeuilleJour extends StatefulWidget {
  final String titre;
  final List<GroupePeriode> groupes;
  final Set<String> selection;
  final Set<String> verrouilles;
  final bool personnalise;
  final Future<int> Function(Set<String> selection) enregistrer;
  final Future<void> Function() retablir;

  const _FeuilleJour({
    required this.titre,
    required this.groupes,
    required this.selection,
    required this.verrouilles,
    required this.personnalise,
    required this.enregistrer,
    required this.retablir,
  });

  @override
  State<_FeuilleJour> createState() => _FeuilleJourState();
}

class _FeuilleJourState extends State<_FeuilleJour> {
  late Set<String> _selection = {...widget.selection};
  bool _enCours = false;
  String? _erreur;

  Future<void> _executer(Future<String> Function() action) async {
    setState(() {
      _enCours = true;
      _erreur = null;
    });
    try {
      final message = await action();
      if (mounted) Navigator.pop(context, message);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _erreur = e is ApiException ? e.message : 'Action impossible pour cette journée.';
        _enCours = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(18, 0, 18, 18 + MediaQuery.of(context).viewInsets.bottom),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ApsSheetHeader(title: widget.titre, onClose: _enCours ? null : () => Navigator.pop(context)),
              const SizedBox(height: 6),
              const Text(
                'Ces horaires ne valent que pour cette date. Votre semaine type ne change pas.',
                style: AppTextStyles.small,
              ),
              const SizedBox(height: 14),
              SelecteurPeriodes(
                groupes: widget.groupes,
                selection: _selection,
                verrouilles: widget.verrouilles,
                enabled: !_enCours,
                detailOuvertParDefaut: true,
                onChanged: (s) => setState(() => _selection = s),
              ),
              if (_erreur != null) ...[
                const SizedBox(height: 10),
                ApsNote.text(_erreur!, icon: Icons.error_outline_rounded, tone: ApsTone.red),
              ],
              const SizedBox(height: 16),
              ApsButton(
                label: _selection.isEmpty ? 'Fermer cette journée' : 'Enregistrer ce jour',
                icon: Icons.check_rounded,
                loading: _enCours,
                onPressed: _enCours
                    ? null
                    : () => _executer(() async {
                          final maintenus = await widget.enregistrer(_selection);
                          return maintenus > 0
                              ? 'Journée enregistrée. $maintenus rendez-vous déjà réservé(s) sont maintenus.'
                              : 'Journée enregistrée.';
                        }),
              ),
              if (widget.personnalise)
                TextButton.icon(
                  onPressed: _enCours
                      ? null
                      : () => _executer(() async {
                            await widget.retablir();
                            return 'Cette journée suit de nouveau votre semaine type.';
                          }),
                  style: TextButton.styleFrom(foregroundColor: AppColors.ink2),
                  icon: const Icon(Icons.undo_rounded, size: 18),
                  label: const Text('Revenir à la semaine type', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
