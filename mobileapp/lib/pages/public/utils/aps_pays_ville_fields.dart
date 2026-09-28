// Paire de champs « Pays » + « Ville » partagée par les parcours de création
// (assurance, pharmacie, centre de santé).
//
// Branchée sur le référentiel réel, comme le fait le web (`listerPays` /
// `listerVilles` de geoService.js) :
//   - GET /referentiels/pays              -> [listePaysProvider]
//   - GET /referentiels/villes?pays_id=…  -> [villesParPaysProvider]
//
// Les valeurs sélectionnées sont les identifiants réels (`pays_id`,
// `ville_id`) attendus par le backend, et non des libellés. Le parent reçoit
// aussi l'objet [Pays] / [Ville] choisi pour pouvoir afficher les noms dans
// l'écran de résumé.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/referentiel_controller.dart';
import '../../../models/referentiel_models.dart' show Pays, Ville;

class ApsPaysVilleFields extends ConsumerWidget {
  const ApsPaysVilleFields({
    super.key,
    required this.paysId,
    required this.villeId,
    required this.onPaysChanged,
    required this.onVilleChanged,
    this.villeLabel = 'Ville',
    this.villeHint,
  });

  /// Identifiant du pays sélectionné (`null` si aucun).
  final String? paysId;

  /// Identifiant de la ville sélectionnée (`null` si aucune).
  final String? villeId;

  /// Appelé au choix d'un pays. Le parent doit remettre la ville à `null`.
  final ValueChanged<Pays?> onPaysChanged;
  final ValueChanged<Ville?> onVilleChanged;

  final String villeLabel;
  final String? villeHint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final paysAsync = ref.watch(listePaysProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ApsFormField(
          label: 'Pays',
          required: true,
          child: paysAsync.when(
            loading: () => const _ChargementChamp(),
            error: (erreur, _) => _ErreurChamp(
              message: 'Impossible de charger les pays.',
              onRetry: () => ref.invalidate(listePaysProvider),
            ),
            data: (liste) {
              final ids = liste.map((p) => p.paysId).toList();
              return ApsDropdown<String>(
                value: ids.contains(paysId) ? paysId : null,
                hint: 'Sélectionner…',
                items: ids,
                itemLabel: (id) =>
                    liste.firstWhere((p) => p.paysId == id).nom,
                onChanged: (id) {
                  onPaysChanged(id == null
                      ? null
                      : liste.firstWhere((p) => p.paysId == id));
                },
              );
            },
          ),
        ),
        ApsFormField(
          label: villeLabel,
          required: true,
          hint: villeHint,
          child: paysId == null
              ? const ApsDropdown<String>(
                  value: null,
                  hint: "Choisissez d'abord un pays",
                  items: [],
                  onChanged: _ignorer,
                  enabled: false,
                )
              : ref.watch(villesParPaysProvider(paysId!)).when(
                    loading: () => const _ChargementChamp(),
                    error: (erreur, _) => _ErreurChamp(
                      message: 'Impossible de charger les villes.',
                      onRetry: () =>
                          ref.invalidate(villesParPaysProvider(paysId!)),
                    ),
                    data: (villes) {
                      final ids = villes.map((v) => v.villeId).toList();
                      return ApsDropdown<String>(
                        value: ids.contains(villeId) ? villeId : null,
                        hint: villes.isEmpty
                            ? 'Aucune ville disponible'
                            : 'Sélectionner…',
                        items: ids,
                        enabled: villes.isNotEmpty,
                        itemLabel: (id) =>
                            villes.firstWhere((v) => v.villeId == id).nom,
                        onChanged: (id) {
                          onVilleChanged(id == null
                              ? null
                              : villes.firstWhere((v) => v.villeId == id));
                        },
                      );
                    },
                  ),
        ),
      ],
    );
  }

  static void _ignorer(String? _) {}
}

class _ChargementChamp extends StatelessWidget {
  const _ChargementChamp();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 46,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.paper,
        border: Border.all(color: AppColors.lineStrong),
        borderRadius: AppRadius.smRadius,
      ),
      child: const SizedBox(
        width: 16,
        height: 16,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          color: AppColors.green700,
        ),
      ),
    );
  }
}

class _ErreurChamp extends StatelessWidget {
  const _ErreurChamp({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            message,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontBody,
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: AppColors.danger,
            ),
          ),
        ),
        TextButton(onPressed: onRetry, child: const Text('Réessayer')),
      ],
    );
  }
}
