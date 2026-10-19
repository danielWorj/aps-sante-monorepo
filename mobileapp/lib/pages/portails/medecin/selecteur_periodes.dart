import 'package:flutter/material.dart';

import '../../../components/components.dart';
import '../../../models/periodes_agenda.dart';

/// ============================================================
/// selecteur_periodes.dart
///
/// Choix des horaires d'une journée par PÉRIODE (matin / après-midi /
/// soirée) : toucher une période sélectionne toutes ses tranches, « Affiner
/// les heures » déplie le détail pour retirer ou ajouter une tranche précise.
/// Une période partiellement cochée affiche un tiret.
///
/// Sert à la semaine type comme à une date précise. [verrouilles] : tranches
/// réservées par un rendez-vous, affichées cochées avec un cadenas et jamais
/// retirables.
/// ============================================================
class SelecteurPeriodes extends StatefulWidget {
  final List<GroupePeriode> groupes;
  final Set<String> selection;
  final ValueChanged<Set<String>> onChanged;
  final Set<String> verrouilles;
  final bool enabled;
  final bool detailOuvertParDefaut;

  const SelecteurPeriodes({
    super.key,
    required this.groupes,
    required this.selection,
    required this.onChanged,
    this.verrouilles = const {},
    this.enabled = true,
    this.detailOuvertParDefaut = false,
  });

  @override
  State<SelecteurPeriodes> createState() => _SelecteurPeriodesState();
}

class _SelecteurPeriodesState extends State<SelecteurPeriodes> {
  late bool _detailOuvert = widget.detailOuvertParDefaut;

  void _basculerPeriode(GroupePeriode g) {
    final suivante = {...widget.selection};
    if (g.etat(widget.selection) == EtatPeriode.complet) {
      suivante.removeAll(g.ids.where((id) => !widget.verrouilles.contains(id)));
    } else {
      suivante.addAll(g.ids);
    }
    widget.onChanged(suivante);
  }

  void _basculerHeure(String id) {
    if (widget.verrouilles.contains(id)) return;
    final suivante = {...widget.selection};
    if (!suivante.remove(id)) suivante.add(id);
    widget.onChanged(suivante);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.groupes.isEmpty) {
      return Text('Référentiel horaire indisponible.', style: AppTextStyles.xs);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            for (var i = 0; i < widget.groupes.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              Expanded(
                child: _TuilePeriode(
                  groupe: widget.groupes[i],
                  etat: widget.groupes[i].etat(widget.selection),
                  nbSelection: widget.groupes[i].ids.where(widget.selection.contains).length,
                  onTap: widget.enabled ? () => _basculerPeriode(widget.groupes[i]) : null,
                ),
              ),
            ],
          ],
        ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(() => _detailOuvert = !_detailOuvert),
            style: TextButton.styleFrom(
              foregroundColor: AppColors.ink2,
              padding: const EdgeInsets.symmetric(horizontal: 4),
              visualDensity: VisualDensity.compact,
            ),
            icon: Icon(_detailOuvert ? Icons.expand_less_rounded : Icons.expand_more_rounded, size: 18),
            label: Text(
              _detailOuvert ? 'Masquer les heures' : 'Affiner les heures',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ),
        ),
        if (_detailOuvert)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.circular(14)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final g in widget.groupes) ...[
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Text(g.periode.libelle.toUpperCase(), style: AppTextStyles.over),
                  ),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final h in g.horaires)
                        _PuceHeure(
                          libelle: h.libelleDebut,
                          active: widget.selection.contains(h.horaireId),
                          verrou: widget.verrouilles.contains(h.horaireId),
                          onTap: widget.enabled ? () => _basculerHeure(h.horaireId) : null,
                        ),
                    ],
                  ),
                  if (g != widget.groupes.last) const SizedBox(height: 12),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _TuilePeriode extends StatelessWidget {
  final GroupePeriode groupe;
  final EtatPeriode etat;
  final int nbSelection;
  final VoidCallback? onTap;

  const _TuilePeriode({required this.groupe, required this.etat, required this.nbSelection, this.onTap});

  @override
  Widget build(BuildContext context) {
    final cochee = etat != EtatPeriode.vide;
    return Semantics(
      checked: etat == EtatPeriode.complet,
      mixed: etat == EtatPeriode.partiel,
      button: true,
      label: groupe.periode.libelle,
      child: Material(
        color: etat == EtatPeriode.complet ? AppColors.b1 : AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: cochee ? AppColors.b7 : AppColors.lineStrong, width: 1.5),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 10, 8, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(groupe.periode.icone, size: 16, color: cochee ? AppColors.b7 : AppColors.ink3),
                    const Spacer(),
                    Container(
                      width: 18,
                      height: 18,
                      decoration: BoxDecoration(
                        color: cochee ? AppColors.b7 : AppColors.surface,
                        borderRadius: BorderRadius.circular(5),
                        border: Border.all(color: cochee ? AppColors.b7 : AppColors.lineStrong, width: 1.5),
                      ),
                      child: cochee
                          ? Icon(
                              etat == EtatPeriode.complet ? Icons.check_rounded : Icons.remove_rounded,
                              size: 13,
                              color: Colors.white,
                            )
                          : null,
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  groupe.periode.libelle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: cochee ? AppColors.ink : AppColors.ink2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  etat == EtatPeriode.partiel ? '$nbSelection/${groupe.horaires.length} créneaux' : groupe.plage,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTextStyles.xs.copyWith(fontSize: 10.5),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PuceHeure extends StatelessWidget {
  final String libelle;
  final bool active;
  final bool verrou;
  final VoidCallback? onTap;

  const _PuceHeure({required this.libelle, required this.active, required this.verrou, this.onTap});

  @override
  Widget build(BuildContext context) {
    final fond = verrou ? AppColors.amber100 : (active ? AppColors.b7 : AppColors.surface);
    final texte = verrou ? AppColors.amber700 : (active ? Colors.white : AppColors.ink2);
    return Material(
      color: fond,
      shape: StadiumBorder(side: BorderSide(color: verrou ? AppColors.amber500 : (active ? AppColors.b7 : AppColors.line))),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: verrou ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (verrou) ...[
                const Icon(Icons.lock_outline, size: 12, color: AppColors.amber700),
                const SizedBox(width: 4),
              ],
              Text(
                libelle,
                style: TextStyle(
                  fontFamily: AppTextStyles.fontSans,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: texte,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
