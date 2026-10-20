import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../controllers/referentiel_controller.dart';
import '../../models/referentiel_models.dart';
import '../style/text_styles.dart';
import 'aps_filter_sheet.dart';

/// Sélection « Pays » puis « Ville » d'une feuille de filtres d'annuaire,
/// sur le modèle de la feuille des médecins : puces des pays actifs du
/// référentiel (GET /referentiels/pays), puis, une fois un pays choisi,
/// puces de ses villes (GET /referentiels/villes?pays_id=…).
///
/// Les valeurs sont des identifiants réels (`pays_id`, `ville_id`),
/// transmis tels quels aux filtres serveur. Changer de pays remet la
/// ville à `null`.
class ApsFiltrePaysVille extends ConsumerWidget {
  const ApsFiltrePaysVille({
    super.key,
    required this.paysId,
    required this.villeId,
    required this.onChanged,
  });

  final String? paysId;
  final String? villeId;
  final void Function(String? paysId, String? villeId) onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pays = ref.watch(listePaysProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ApsFilterSection(
          title: 'Pays',
          child: pays.when(
            loading: () => const _Chargement(),
            error: (_, _) => Text('Pays indisponibles pour le moment.', style: AppTextStyles.xs),
            data: (liste) => ApsFilterChoices<String?>(
              value: paysId,
              onChanged: (id) => onChanged(id, null),
              options: [
                const ApsFilterOption(null, 'Tous'),
                for (final p in apsPaysActifs(liste))
                  ApsFilterOption(p.paysId, p.nom, icon: Icons.public_rounded),
              ],
            ),
          ),
        ),
        if (paysId != null) ...[
          const SizedBox(height: 18),
          ApsFilterSection(
            title: 'Ville',
            child: ref.watch(villesParPaysProvider(paysId!)).when(
                  loading: () => const _Chargement(),
                  error: (_, _) =>
                      Text('Villes indisponibles pour le moment.', style: AppTextStyles.xs),
                  data: (villes) => villes.isEmpty
                      ? Text('Aucune ville référencée pour ce pays.', style: AppTextStyles.xs)
                      : ApsFilterChoices<String?>(
                          value: villeId,
                          onChanged: (id) => onChanged(paysId, id),
                          options: [
                            const ApsFilterOption(null, 'Toutes les villes'),
                            for (final v in villes)
                              ApsFilterOption(v.villeId, v.nom,
                                  icon: Icons.location_on_outlined),
                          ],
                        ),
                ),
          ),
        ],
      ],
    );
  }
}

/// Pays proposés dans les filtres : tous sauf ceux désactivés.
List<Pays> apsPaysActifs(List<Pays> pays) =>
    pays.where((p) => p.statutActivation != StatutActivationPays.inactif).toList();

/// Libellé d'un pays pour les puces actives (référentiel déjà chargé).
String apsNomPays(WidgetRef ref, String paysId) {
  for (final p in ref.watch(listePaysProvider).value ?? const <Pays>[]) {
    if (p.paysId == paysId) return p.nom;
  }
  return 'Pays';
}

/// Libellé d'une ville pour les puces actives.
String apsNomVille(WidgetRef ref, String paysId, String villeId) {
  for (final v in ref.watch(villesParPaysProvider(paysId)).value ?? const <Ville>[]) {
    if (v.villeId == villeId) return v.nom;
  }
  return 'Ville';
}

/// Options de tri communes aux annuaires de structures.
const Map<String, String> apsLibellesTriAnnuaire = {
  'pertinence': 'Pertinence',
  'nom': 'Nom (A → Z)',
};

class _Chargement extends StatelessWidget {
  const _Chargement();

  @override
  Widget build(BuildContext context) {
    return const Align(
      alignment: Alignment.centerLeft,
      child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
    );
  }
}
