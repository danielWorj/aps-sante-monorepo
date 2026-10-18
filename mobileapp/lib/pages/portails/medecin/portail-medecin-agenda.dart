import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/agenda_controller.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/medecin_controller.dart';
import '../../../models/agenda_models.dart';
import '../../../repositories/rendez_vous_repository.dart' show ApiException;

/// ============================================================
/// portail-medecin-agenda.dart
///
/// Onglet « Agenda » de l'espace médecin (affiché par `MedecinHomeShell`,
/// qui fournit le Scaffold et la barre de navigation basse).
///
/// 1. **Mes horaires de la semaine** — le gabarit hebdomadaire
///    (DisponibiliteMedecin) : pour chaque jour, les tranches de 30 min où
///    le médecin reçoit. Enregistré en une fois (PUT
///    /medecins/:id/disponibilites) ; le serveur publie aussitôt ces horaires
///    sur les semaines à venir. Ce sont ces jours et horaires que les
///    patients peuvent réserver.
/// 2. **Mes prochains créneaux** — les 7 prochains jours : un créneau libre
///    peut être fermé ponctuellement (congé, urgence), un créneau fermé
///    rouvert. Un créneau « réservé » (demande en attente de paiement ou
///    rendez-vous confirmé) n'est pas modifiable ici : il est masqué aux
///    autres patients et redevient libre si le rendez-vous est annulé, ou
///    si la demande n'est pas payée dans le délai fixé par ApSa.
/// ============================================================
class PortailMedecinAgenda extends ConsumerStatefulWidget {
  const PortailMedecinAgenda({super.key});

  @override
  ConsumerState<PortailMedecinAgenda> createState() => _PortailMedecinAgendaState();
}

class _PortailMedecinAgendaState extends ConsumerState<PortailMedecinAgenda> {
  static const int _joursAVenir = 7;

  bool _chargement = true;
  bool _enregistrement = false;
  String? _erreur;

  List<HoraireAgenda> _horaires = const [];

  /// Gabarit enregistré côté serveur, et gabarit en cours d'édition :
  /// ensembles de clés « jour|horaire_id ».
  Set<String> _gabaritServeur = {};
  Set<String> _gabarit = {};

  String _jourEdite = 'lundi';
  List<CreneauAgenda> _creneaux = const [];

  /// Créneau en cours de mise à jour (fermeture / réouverture).
  String? _creneauEnCours;

  String? get _medecinId => ref.read(monProfilMedecinControllerProvider).value?.medecin.medecinId;

  bool get _modifie => _gabarit.length != _gabaritServeur.length || !_gabarit.containsAll(_gabaritServeur);

  static String _cle(String jour, String horaireId) => '$jour|$horaireId';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _charger());
  }

  Future<void> _charger() async {
    setState(() {
      _chargement = true;
      _erreur = null;
    });
    try {
      var medecinId = _medecinId;
      if (medecinId == null) {
        final token = ref.read(authTokenProvider);
        if (token == null) throw const ApiException('Session expirée : reconnectez-vous.');
        await ref.read(monProfilMedecinControllerProvider.notifier).charger(token: token);
        medecinId = _medecinId;
      }
      if (medecinId == null) throw const ApiException('Profil médecin introuvable.');

      final repo = ref.read(agendaRepositoryProvider);
      final maintenant = DateTime.now();
      final resultats = await Future.wait([
        repo.listerHoraires(),
        repo.listerDisponibilites(medecinId),
        repo.listerCreneaux(
          medecinId,
          filtres: FiltresAgenda(
            dateDebut: maintenant,
            dateFin: maintenant.add(const Duration(days: _joursAVenir - 1)),
          ),
        ),
      ]);
      if (!mounted) return;
      final horaires = resultats[0] as List<HoraireAgenda>;
      final disponibilites = resultats[1] as List<DisponibiliteMedecin>;
      final creneaux = resultats[2] as List<CreneauAgenda>;
      final gabarit = {for (final d in disponibilites) _cle(d.jourSemaine, d.horaireId)};
      setState(() {
        _horaires = [...horaires]..sort((a, b) => a.libelleDebut.compareTo(b.libelleDebut));
        _gabaritServeur = gabarit;
        _gabarit = {...gabarit};
        _creneaux = creneaux
            .where((c) => c.instantUtc?.isAfter(DateTime.now().toUtc()) ?? false)
            .toList()
          ..sort((a, b) => a.instantUtc!.compareTo(b.instantUtc!));
        _chargement = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _erreur = _message(e, "Impossible de charger l'agenda.");
        _chargement = false;
      });
    }
  }

  String _message(Object e, String parDefaut) => e is ApiException ? e.message : parDefaut;

  void _afficher(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  void _basculer(String horaireId) {
    final cle = _cle(_jourEdite, horaireId);
    setState(() => _gabarit.contains(cle) ? _gabarit.remove(cle) : _gabarit.add(cle));
  }

  void _copierSurJoursOuvres() {
    final source = _horaires.where((h) => _gabarit.contains(_cle(_jourEdite, h.horaireId))).map((h) => h.horaireId);
    setState(() {
      _gabarit.removeWhere((cle) => joursOuvresAgenda.contains(cle.split('|').first));
      for (final jour in joursOuvresAgenda) {
        for (final horaireId in source) {
          _gabarit.add(_cle(jour, horaireId));
        }
      }
    });
    _afficher('Horaires copiés du lundi au vendredi. Pensez à enregistrer.');
  }

  Future<void> _enregistrer() async {
    final medecinId = _medecinId;
    final token = ref.read(authTokenProvider);
    if (medecinId == null || token == null || _enregistrement) return;
    setState(() => _enregistrement = true);
    try {
      await ref.read(agendaRepositoryProvider).remplacerDisponibilites(
            medecinId: medecinId,
            token: token,
            disponibilites: [
              for (final cle in _gabarit)
                (jourSemaine: cle.split('|').first, horaireId: cle.split('|').last),
            ],
          );
      _afficher('Horaires enregistrés : ils sont publiés sur votre agenda des semaines à venir.');
      await _charger();
    } catch (e) {
      _afficher(_message(e, "Impossible d'enregistrer vos horaires."));
    } finally {
      if (mounted) setState(() => _enregistrement = false);
    }
  }

  Future<void> _basculerCreneau(CreneauAgenda c) async {
    final token = ref.read(authTokenProvider);
    if (token == null || _creneauEnCours != null || c.estReserve) return;
    final fermer = c.estDisponible;
    setState(() => _creneauEnCours = c.creneauId);
    try {
      await ref.read(agendaRepositoryProvider).changerStatutCreneau(
            creneauId: c.creneauId,
            statut: fermer ? StatutCreneauAgenda.bloque : StatutCreneauAgenda.disponible,
            token: token,
          );
      _afficher(fermer
          ? 'Créneau du ${c.libelleJour} à ${c.libelleHeure} fermé aux patients.'
          : 'Créneau du ${c.libelleJour} à ${c.libelleHeure} rouvert.');
      await _charger();
    } catch (e) {
      _afficher(_message(e, 'Action impossible sur ce créneau.'));
    } finally {
      if (mounted) setState(() => _creneauEnCours = null);
    }
  }

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
            const _PageHead(),
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
              _buildHoraires(),
              const SizedBox(height: 14),
              _buildProchainsCreneaux(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildHoraires() {
    final actifs = _horaires.where((h) => _gabarit.contains(_cle(_jourEdite, h.horaireId))).length;
    return _Bloc(
      titre: 'Mes horaires de la semaine',
      icone: Icons.repeat,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Choisissez un jour puis touchez les horaires où vous recevez. Après '
            'enregistrement, ces horaires sont publiés sur les semaines à venir : '
            'ce sont eux que les patients peuvent réserver.',
            style: AppTextStyles.small,
          ),
          const SizedBox(height: 12),
          ApsChipRow(
            children: [
              for (final j in joursSemaineAgenda)
                ApsChip(
                  j.court,
                  selected: j.valeur == _jourEdite,
                  icon: _gabarit.any((cle) => cle.startsWith('${j.valeur}|'))
                      ? Icons.circle
                      : null,
                  iconColor: j.valeur == _jourEdite ? AppColors.mint : AppColors.b5,
                  onTap: () => setState(() => _jourEdite = j.valeur),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  actifs == 0 ? 'Fermé ce jour-là' : '$actifs créneau(x) de 30 min',
                  style: AppTextStyles.xs.copyWith(fontSize: 12),
                ),
              ),
              if (actifs > 0)
                TextButton.icon(
                  onPressed: _enregistrement ? null : _copierSurJoursOuvres,
                  icon: const Icon(Icons.copy, size: 16),
                  label: const Text('Lun–Ven', style: TextStyle(fontSize: 12)),
                ),
            ],
          ),
          if (_horaires.isEmpty)
            Text('Référentiel horaire indisponible.', style: AppTextStyles.xs)
          else
            ApsSlotGrid(
              children: [
                for (final h in _horaires)
                  ApsSlot(
                    h.libelleDebut,
                    state: _gabarit.contains(_cle(_jourEdite, h.horaireId))
                        ? ApsSlotState.selected
                        : ApsSlotState.more,
                    onTap: _enregistrement ? null : () => _basculer(h.horaireId),
                  ),
              ],
            ),
          const SizedBox(height: 14),
          ApsButton(
            label: _modifie ? 'Enregistrer mes horaires' : 'Horaires à jour',
            icon: _modifie ? Icons.check_rounded : null,
            loading: _enregistrement,
            onPressed: (_modifie && !_enregistrement) ? _enregistrer : null,
          ),
        ],
      ),
    );
  }

  Widget _buildProchainsCreneaux() {
    final parJour = <String, List<CreneauAgenda>>{};
    for (final c in _creneaux) {
      parJour.putIfAbsent(c.cleJour, () => []).add(c);
    }
    return _Bloc(
      titre: 'Mes prochains créneaux',
      icone: Icons.calendar_month_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Touchez un créneau libre pour le fermer ponctuellement, ou un créneau '
            'fermé pour le rouvrir. Un créneau réservé est masqué aux autres '
            'patients ; il redevient libre si le rendez-vous est annulé ou si '
            "la demande n'est pas payée à temps.",
            style: AppTextStyles.small,
          ),
          const SizedBox(height: 12),
          const _Legende(),
          if (parJour.isEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Text(
                'Aucun créneau sur les 7 prochains jours. Définissez vos horaires de la semaine ci-dessus.',
                style: AppTextStyles.small,
              ),
            ),
          for (final liste in parJour.values) ...[
            Padding(
              padding: const EdgeInsets.only(top: 16, bottom: 8),
              child: Text(liste.first.libelleJour.toUpperCase(), style: AppTextStyles.over),
            ),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [for (final c in liste) _PuceCreneau(
                creneau: c,
                enCours: _creneauEnCours == c.creneauId,
                onTap: c.estReserve ? null : () => _basculerCreneau(c),
              )],
            ),
          ],
        ],
      ),
    );
  }
}

class _PageHead extends StatelessWidget {
  const _PageHead();

  @override
  Widget build(BuildContext context) {
    // La cloche du shell flotte en haut à droite : place réservée.
    return const ApsPageTitle('Agenda', trailing: SizedBox(width: 42));
  }
}

class _Bloc extends StatelessWidget {
  final String? titre;
  final IconData? icone;
  final Widget child;

  const _Bloc({this.titre, this.icone, required this.child});

  @override
  Widget build(BuildContext context) {
    return ApsCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (titre != null) ...[
            Row(
              children: [
                if (icone != null) ...[
                  ApsIconTile(icone!, small: true),
                  const SizedBox(width: 10),
                ],
                Expanded(child: Text(titre!, style: AppTextStyles.section)),
              ],
            ),
            const SizedBox(height: 10),
          ],
          child,
        ],
      ),
    );
  }
}

/// Couleurs d'un créneau selon son statut : libre (vert), réservé (ambre,
/// lecture seule), fermé (gris barré).
({Color fond, Color texte, Color bord}) _couleursCreneau(CreneauAgenda c) {
  if (c.estReserve) return (fond: AppColors.amber100, texte: AppColors.amber700, bord: AppColors.amber100);
  if (c.estBloque) return (fond: AppColors.slotOff, texte: AppColors.ink4, bord: AppColors.slotOff);
  return (fond: AppColors.b1, texte: AppColors.b7, bord: AppColors.b1);
}

class _PuceCreneau extends StatelessWidget {
  final CreneauAgenda creneau;
  final bool enCours;
  final VoidCallback? onTap;

  const _PuceCreneau({required this.creneau, required this.enCours, this.onTap});

  @override
  Widget build(BuildContext context) {
    final couleurs = _couleursCreneau(creneau);
    return Material(
      color: couleurs.fond,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: couleurs.bord),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: enCours ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (enCours)
                const Padding(
                  padding: EdgeInsets.only(right: 6),
                  child: SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 1.6)),
                )
              else if (creneau.estReserve)
                const Padding(
                  padding: EdgeInsets.only(right: 4),
                  child: Icon(Icons.lock_outline, size: 13, color: AppColors.amber700),
                ),
              Text(
                creneau.libelleHeure,
                style: TextStyle(
                  fontFamily: AppTextStyles.fontSans,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                  color: couleurs.texte,
                  decoration: creneau.estBloque ? TextDecoration.lineThrough : null,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Legende extends StatelessWidget {
  const _Legende();

  @override
  Widget build(BuildContext context) {
    Widget cle(String libelle, Color fond, Color bord) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: fond,
                borderRadius: BorderRadius.circular(3),
                border: Border.all(color: bord),
              ),
            ),
            const SizedBox(width: 5),
            Text(libelle,
                style: AppTextStyles.xs.copyWith(color: AppColors.ink2, fontSize: 10.5, fontWeight: FontWeight.w700)),
          ],
        );
    return Wrap(
      spacing: 12,
      runSpacing: 6,
      children: [
        cle('Libre', AppColors.b6, AppColors.b6),
        cle('Réservé', AppColors.amber500, AppColors.amber500),
        cle('Fermé', AppColors.slotOff, AppColors.ink3),
      ],
    );
  }
}
