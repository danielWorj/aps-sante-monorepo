// lib/pages/portails/presence/portail-presence-horaires.dart
//
// Espaces pharmacie et centre de santé — « Horaires » : semaine type (jusqu'à
// 4 plages par jour, 24 h/24), note libre et, pour un centre, service
// d'urgences 24 h/24. Les horaires sont TOUJOURS publics et s'enregistrent
// sans nouvelle vérification de la fiche. Une plage ne passe pas minuit :
// une ouverture de nuit se saisit sur deux jours (20:00 → 00:00, puis
// 00:00 → 08:00 le lendemain).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/espace_presence_controller.dart';
import '../../../models/espace_presence_models.dart';
import 'presence_commun.dart';

const _maxPlages = 4;
const _plageParDefaut = PlageHoraire('08:00', '18:00');
const _journeeEntiere = PlageHoraire('00:00', '24:00');

class PortailPresenceHoraires extends ConsumerWidget {
  const PortailPresenceHoraires({super.key, required this.type});

  final TypeEspacePresence type;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fiche = ref.watch(maFichePresenceProvider(type));
    return Container(
      color: AppColors.paper,
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(maFichePresenceProvider(type).future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
          children: [
            EnTetePresence(type: type),
            const EnTetePortail(
              titre: 'Horaires',
              description: "Vos heures d'ouverture, toujours visibles du public. Elles s'affichent sur votre fiche dès l'enregistrement.",
            ),
            fiche.when(
              loading: () => const ChargementPortail(),
              error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(maFichePresenceProvider(type))),
              data: (f) => _Editeur(key: ValueKey('h-${f.hashCode}'), fiche: f),
            ),
          ],
        ),
      ),
    );
  }
}

int _minutes(String h) {
  final p = h.split(':');
  return int.parse(p[0]) * 60 + int.parse(p[1]);
}

String _heure(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

class _Editeur extends ConsumerStatefulWidget {
  const _Editeur({super.key, required this.fiche});

  final FichePresence fiche;

  @override
  ConsumerState<_Editeur> createState() => _EditeurState();
}

class _EditeurState extends ConsumerState<_Editeur> {
  late final FichePresence f = widget.fiche;
  late SemaineHoraires _semaine = {
    for (final (jour, _) in joursSemaine) jour: [...?f.horaires?[jour]],
  };
  late final _note = TextEditingController(text: f.horairesNote ?? '');
  late bool _urgences = f.urgences24h;
  bool _envoi = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _majJour(String jour, List<PlageHoraire> plages) => setState(() => _semaine = {..._semaine, jour: plages});

  String? _verifier() {
    for (final (jour, nom) in joursSemaine) {
      final plages = [...?_semaine[jour]]..sort((a, b) => a.debut.compareTo(b.debut));
      for (var i = 0; i < plages.length; i++) {
        final p = plages[i];
        if (_minutes(p.fin) <= _minutes(p.debut)) {
          return '$nom : la fermeture (${p.fin}) doit suivre l\'ouverture (${p.debut}). Pour une ouverture de nuit, fermez à 00:00 et reprenez le lendemain.';
        }
        if (i > 0 && _minutes(p.debut) < _minutes(plages[i - 1].fin)) return '$nom : les plages se chevauchent.';
      }
    }
    return null;
  }

  Future<void> _enregistrer() async {
    final probleme = _verifier();
    if (probleme != null) return snackPortail(context, probleme);
    setState(() => _envoi = true);
    try {
      await appelPresenceUi(ref, (repo, token) => repo.enregistrerHoraires(
            f.type,
            f.id,
            token: token,
            horaires: _semaine,
            note: _note.text.trim(),
            urgences24h: f.type == TypeEspacePresence.structure ? _urgences : null,
          ));
      ref.invalidate(maFichePresenceProvider(f.type));
      if (mounted) snackPortail(context, 'Horaires enregistrés : ils sont déjà visibles sur votre fiche.');
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Future<void> _effacer() async {
    if (!await confirmerPortail(context, 'Effacer les horaires', 'Votre fiche affichera « Horaires non renseignés ».', action: 'Effacer')) return;
    try {
      await appelPresenceUi(ref, (repo, token) => repo.enregistrerHoraires(f.type, f.id, token: token, horaires: null));
      ref.invalidate(maFichePresenceProvider(f.type));
      if (mounted) snackPortail(context, 'Horaires effacés.');
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (f.horaires != null && f.ouverture != null)
          BandeauPortail(icone: Icons.schedule_outlined, texte: 'En ce moment : ${f.ouverture!.libelle} (heure de ${f.paysNom ?? 'votre pays'}).'),
        Wrap(spacing: 8, runSpacing: 4, children: [
          OutlinedButton.icon(
            onPressed: () => setState(() => _semaine = {
                  ..._semaine,
                  for (final j in ['mardi', 'mercredi', 'jeudi', 'vendredi']) j: [...?_semaine['lundi']],
                }),
            icon: const Icon(Icons.copy_rounded, size: 16),
            label: const Text('Lundi → vendredi'),
          ),
          OutlinedButton.icon(
            onPressed: () => setState(() => _semaine = {for (final (jour, _) in joursSemaine) jour: [_journeeEntiere]}),
            icon: const Icon(Icons.all_inclusive_rounded, size: 16),
            label: const Text('24 h/24, 7 j/7'),
          ),
        ]),
        const SizedBox(height: 10),
        CartePortail(
          titre: 'Semaine type',
          icone: Icons.calendar_view_week_outlined,
          child: Column(children: [
            for (final (jour, nom) in joursSemaine) _LigneJour(nom: nom, plages: _semaine[jour] ?? const [], onChanged: (p) => _majJour(jour, p)),
          ]),
        ),
        CartePortail(
          titre: 'Précisions',
          icone: Icons.info_outline_rounded,
          child: Column(children: [
            ChampLaboratoire(controleur: _note, libelle: 'Note affichée avec les horaires', indication: 'Ex. Fermé les jours fériés'),
            if (f.type == TypeEspacePresence.structure)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _urgences,
                onChanged: (v) => setState(() => _urgences = v),
                title: const Text("Service d'urgences 24 h/24, 7 j/7", style: AppTextStyles.body),
              ),
          ]),
        ),
        ApsButton(label: 'Enregistrer les horaires', icon: Icons.check_rounded, loading: _envoi, onPressed: _envoi ? null : _enregistrer),
        if (f.horaires != null) TextButton.icon(onPressed: _effacer, icon: const Icon(Icons.delete_outline, size: 18), label: const Text('Effacer les horaires')),
      ],
    );
  }
}

class _LigneJour extends StatelessWidget {
  const _LigneJour({required this.nom, required this.plages, required this.onChanged});

  final String nom;
  final List<PlageHoraire> plages;
  final ValueChanged<List<PlageHoraire>> onChanged;

  bool get _ouvert => plages.isNotEmpty;
  bool get _entier => plages.length == 1 && plages.first.journeeEntiere;

  Future<void> _choisir(BuildContext context, int index, bool fin) async {
    final p = plages[index];
    final actuelle = fin ? p.fin : p.debut;
    final m = _minutes(actuelle == '24:00' ? '00:00' : actuelle);
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: m ~/ 60, minute: m % 60),
      helpText: fin ? '$nom · fermeture' : '$nom · ouverture',
      builder: (c, child) => MediaQuery(data: MediaQuery.of(c).copyWith(alwaysUse24HourFormat: true), child: child!),
    );
    if (t == null) return;
    var h = _heure(t);
    // Minuit en fin de plage = fin de journée.
    if (fin && h == '00:00') h = '24:00';
    final nouvelles = [...plages];
    nouvelles[index] = fin ? PlageHoraire(p.debut, h) : PlageHoraire(h, p.fin);
    onChanged(nouvelles);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(child: Text(nom, style: AppTextStyles.cardTitle)),
            if (_ouvert)
              Row(mainAxisSize: MainAxisSize.min, children: [
                Checkbox(
                  value: _entier,
                  visualDensity: VisualDensity.compact,
                  onChanged: (v) => onChanged(v == true ? [_journeeEntiere] : [_plageParDefaut]),
                ),
                const Text('24 h/24', style: AppTextStyles.cardMeta),
              ]),
            Switch(value: _ouvert, onChanged: (v) => onChanged(v ? [_plageParDefaut] : const [])),
          ]),
          if (!_ouvert) Text('Fermé', style: AppTextStyles.cardMeta),
          if (_ouvert && !_entier)
            for (var i = 0; i < plages.length; i++)
              Row(children: [
                TextButton(onPressed: () => _choisir(context, i, false), child: Text(plages[i].debut)),
                const Text('→'),
                TextButton(onPressed: () => _choisir(context, i, true), child: Text(plages[i].fin == '24:00' ? '00:00 (minuit)' : plages[i].fin)),
                const Spacer(),
                if (plages.length > 1)
                  IconButton(
                    onPressed: () => onChanged([...plages]..removeAt(i)),
                    icon: const Icon(Icons.close_rounded, size: 18),
                    tooltip: 'Retirer cette plage',
                  ),
              ]),
          if (_ouvert && !_entier && plages.length < _maxPlages)
            TextButton.icon(
              onPressed: () => onChanged([...plages, PlageHoraire(plages.last.fin == '24:00' ? '00:00' : plages.last.fin, '19:00')]),
              icon: const Icon(Icons.add_rounded, size: 16),
              label: const Text('Ajouter une plage'),
            ),
          const Divider(height: 8),
        ],
      ),
    );
  }
}
