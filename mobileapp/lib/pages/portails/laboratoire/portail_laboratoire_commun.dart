// lib/pages/portails/laboratoire/portail_laboratoire_commun.dart
//
// Éléments partagés par les onglets du portail laboratoire. Les briques
// génériques (en-tête de page, carte, bandeau, chargement, erreur, vide,
// confirmation) sont celles du portail assurance
// (portail_assurance_commun.dart) ; ce fichier ajoute l'identité de la
// fiche, les tuiles de métriques et l'histogramme jour par jour.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/laboratoire_controller.dart';
import '../../../controllers/referentiel_controller.dart' show villesParPaysProvider;
import '../../../models/laboratoire_models.dart';

export '../assurance/portail_assurance_commun.dart'
    show EnTetePortail, CartePortail, BandeauPortail, ChargementPortail, ErreurPortail, VidePortail,
        confirmerPortail, snackPortail, messageErreur, dateCourtePortail;

String nombreLaboratoire(int n) => n.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]} ');

/// Identité de l'espace (logo + nom de la fiche) et déconnexion.
class EnTeteLaboratoire extends ConsumerWidget {
  const EnTeteLaboratoire({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fiche = ref.watch(monLaboratoireProvider).value;
    final nom = fiche?.nom ?? 'Espace laboratoire';
    return Padding(
      // Marge droite : la cloche flotte en haut à droite (shell).
      padding: const EdgeInsets.fromLTRB(0, 12, 56, 0),
      child: Row(
        children: [
          ApsVignette(
            imageUrl: fiche?.imageUrl,
            size: 40,
            radius: 8,
            repli: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: AppColors.b1, borderRadius: BorderRadius.circular(8)),
              child: const Icon(Icons.biotech_outlined, color: AppColors.b7, size: 20),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Espace laboratoire', style: AppTextStyles.cardMeta),
                Text(nom, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppTextStyles.h3.copyWith(fontSize: 15)),
              ],
            ),
          ),
          const BoutonParametres(),
          const BoutonDeconnexion(),
        ],
      ),
    );
  }
}

class TuileLaboratoire extends StatelessWidget {
  const TuileLaboratoire({super.key, required this.icone, required this.valeur, required this.libelle});

  final IconData icone;
  final String valeur;
  final String libelle;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.line)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icone, size: 18, color: AppColors.primary),
            const SizedBox(height: 4),
            Text(valeur,
                style: const TextStyle(fontFamily: AppTextStyles.fontDisplay, fontSize: 20, fontWeight: FontWeight.w700, color: AppColors.ink)),
            Text(libelle, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppTextStyles.cardMeta),
          ],
        ),
      );
}

/// Histogramme d'une série jour par jour ; un appui affiche la valeur.
class BarresLaboratoire extends StatefulWidget {
  const BarresLaboratoire({super.key, required this.titre, required this.serie, required this.unite});

  final String titre;
  final List<PointSerie> serie;
  final String unite;

  @override
  State<BarresLaboratoire> createState() => _BarresLaboratoireState();
}

class _BarresLaboratoireState extends State<BarresLaboratoire> {
  int? _actif;

  String _libelle(int n) => '${nombreLaboratoire(n)} ${widget.unite}${n > 1 ? 's' : ''}';

  String _date(DateTime d) => '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final serie = widget.serie;
    if (serie.isEmpty) return const SizedBox.shrink();
    final max = serie.fold<int>(1, (m, p) => p.valeur > m ? p.valeur : m);
    final total = serie.fold<int>(0, (a, p) => a + p.valeur);
    final point = _actif == null ? null : serie[_actif!];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('${widget.titre} · ${_libelle(total)}', style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink)),
        const SizedBox(height: 4),
        Text(point == null ? 'Touchez une barre pour voir le détail.' : '${_date(point.jour)} : ${_libelle(point.valeur)}',
            style: AppTextStyles.cardMeta),
        const SizedBox(height: 6),
        SizedBox(
          height: 80,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (var i = 0; i < serie.length; i++)
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => setState(() => _actif = _actif == i ? null : i),
                    child: Align(
                      alignment: Alignment.bottomCenter,
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 1),
                        height: serie[i].valeur == 0 ? 0 : (80 * serie[i].valeur / max).clamp(3, 80).toDouble(),
                        decoration: BoxDecoration(
                          color: _actif == null || _actif == i ? AppColors.primary : AppColors.primary.withValues(alpha: 0.45),
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Container(height: 1, color: AppColors.line),
        const SizedBox(height: 3),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(_date(serie.first.jour), style: AppTextStyles.cardMeta),
            Text(_date(serie.last.jour), style: AppTextStyles.cardMeta),
          ],
        ),
      ],
    );
  }
}

/// Champ de saisie sobre des formulaires du portail.
class ChampLaboratoire extends StatelessWidget {
  const ChampLaboratoire({
    super.key,
    required this.controleur,
    required this.libelle,
    this.indication,
    this.clavier,
    this.lignes = 1,
    this.requis = false,
  });

  final TextEditingController controleur;
  final String libelle;
  final String? indication;
  final TextInputType? clavier;
  final int lignes;
  final bool requis;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextFormField(
          controller: controleur,
          keyboardType: clavier,
          minLines: lignes,
          maxLines: lignes,
          decoration: InputDecoration(labelText: requis ? '$libelle *' : libelle, hintText: indication),
          validator: requis ? (v) => (v == null || v.trim().isEmpty) ? 'Champ requis' : null : null,
        ),
      );
}

/// Choix d'une ville parmi celles du pays de la fiche (le pays d'un
/// laboratoire ne change pas depuis le portail).
class ChoixVilleLaboratoire extends ConsumerWidget {
  const ChoixVilleLaboratoire({super.key, required this.paysId, required this.villeId, required this.onChanged, this.requis = false});

  final String? paysId;
  final String? villeId;
  final ValueChanged<String?> onChanged;
  final bool requis;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = paysId;
    if (id == null) return const SizedBox.shrink();
    return ApsFormField(
      label: 'Ville',
      required: requis,
      child: ref.watch(villesParPaysProvider(id)).when(
            loading: () => const LinearProgressIndicator(minHeight: 2),
            error: (_, _) => TextButton(onPressed: () => ref.invalidate(villesParPaysProvider(id)), child: const Text('Réessayer')),
            data: (villes) {
              final ids = villes.map((v) => v.villeId).toList();
              return ApsDropdown<String>(
                value: ids.contains(villeId) ? villeId : null,
                hint: villes.isEmpty ? 'Aucune ville disponible' : 'Sélectionner…',
                items: ids,
                enabled: villes.isNotEmpty,
                itemLabel: (v) => villes.firstWhere((x) => x.villeId == v).nom,
                onChanged: onChanged,
              );
            },
          ),
    );
  }
}
