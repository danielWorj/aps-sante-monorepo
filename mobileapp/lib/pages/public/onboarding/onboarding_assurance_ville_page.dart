import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/referentiel_controller.dart';
import '../../../models/referentiel_models.dart';
import 'onboarding_assurance_type_page.dart';
import 'onboarding_progress.dart';

/// Écran 1.3.1 — Choix de la ville (étape 1/2 du sous-parcours
/// « Assurances »), même principe que le sous-parcours « Médecins et
/// professionnels » : ville -> type d'acteur -> annuaire filtré
/// ([AssurancePage]).
///
/// Portage Flutter de `OnboardingAssuranceVille.jsx`. Contrairement au
/// sous-parcours médecins, la ville n'est PAS obligatoire ici (GET
/// /services-assurance accepte `ville_id` vide) : on autorise donc
/// « Suivant » même sans ville choisie, pour laisser l'utilisateur voir
/// toutes les compagnies d'un pays.
///
/// Cet écran est un [ConsumerStatefulWidget] (flutter_riverpod) car il
/// consomme le référentiel Pays/Ville via le [ProviderScope] global de
/// l'app (`main.dart`) — le même arbre de providers que [AssurancePage],
/// contrairement au sous-parcours médecins qui s'appuie sur le
/// [ProviderContainer] dédié de [MedecinPage] (voir
/// `onboarding_medecin_ville_page.dart`).
///
/// ⚠️ Même remarque que côté médecins : aucune détection automatique du
/// pays par géolocalisation (pas de package dédié dans ce projet pour
/// l'instant) — le pays se choisit manuellement.
class OnboardingAssuranceVillePage extends ConsumerStatefulWidget {
  const OnboardingAssuranceVillePage({super.key});

  @override
  ConsumerState<OnboardingAssuranceVillePage> createState() =>
      _OnboardingAssuranceVillePageState();
}

class _OnboardingAssuranceVillePageState
    extends ConsumerState<OnboardingAssuranceVillePage> {
  String? _paysId;
  String? _villeId;

  void _choisirPays(String? paysId) {
    setState(() {
      _paysId = paysId;
      _villeId = null; // le choix de ville précédent ne vaut plus
    });
  }

  void _allerVersEtapeType() {
    final villesAsync = _paysId == null
        ? const AsyncValue<List<Ville>>.data([])
        : ref.read(villesParPaysProvider(_paysId!));
    final villes = villesAsync.value ?? const <Ville>[];
    Ville? ville;
    for (final v in villes) {
      if (v.villeId == _villeId) {
        ville = v;
        break;
      }
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => OnboardingAssuranceTypePage(
          paysId: _paysId,
          villeId: _villeId,
          villeNom: ville?.nom,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final paysAsync = ref.watch(listePaysProvider);
    final villesAsync = _paysId == null
        ? const AsyncValue<List<Ville>>.data([])
        : ref.watch(villesParPaysProvider(_paysId!));

    final pays = paysAsync.value ?? const <Pays>[];
    final villes = villesAsync.value ?? const <Ville>[];
    final chargementPays = paysAsync.isLoading;
    final chargementVilles = villesAsync.isLoading;

    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(
        backgroundColor: AppColors.paper,
        elevation: 0,
        foregroundColor: AppColors.ink,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const OnboardingProgress(current: 1, total: 2),
              const SizedBox(height: 18),
              const OnboardingHeader(
                eyebrow: 'Assurances',
                title: 'Dans quelle ville ?',
              ),
              const SizedBox(height: 22),
              Text('Pays', style: AppTextStyles.cardMeta),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                key: ValueKey('assurance-pays-$_paysId'),
                value: _paysId,
                isExpanded: true,
                decoration: _fieldDecoration(
                  chargementPays ? 'Chargement…' : 'Sélectionner…',
                ),
                items: [
                  for (final p in pays)
                    DropdownMenuItem(value: p.paysId, child: Text(p.nom)),
                ],
                onChanged: chargementPays ? null : _choisirPays,
              ),
              const SizedBox(height: 16),
              Text('Ville', style: AppTextStyles.cardMeta),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                key: ValueKey('assurance-ville-$_paysId-$_villeId'),
                value: _villeId,
                isExpanded: true,
                decoration: _fieldDecoration(
                  _paysId == null
                      ? "Choisissez d'abord un pays"
                      : chargementVilles
                          ? 'Chargement…'
                          : 'Toutes les villes',
                ),
                items: [
                  for (final v in villes)
                    DropdownMenuItem(value: v.villeId, child: Text(v.nom)),
                ],
                onChanged: (_paysId == null || chargementVilles)
                    ? null
                    : (id) => setState(() => _villeId = id),
              ),
              const SizedBox(height: 28),
              OnboardingNavActions(
                onBack: () => Navigator.of(context).pop(),
                onNext: _allerVersEtapeType,
              ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _fieldDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: AppColors.card,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: AppRadius.smRadius,
        borderSide: const BorderSide(color: AppColors.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: AppRadius.smRadius,
        borderSide: const BorderSide(color: AppColors.line),
      ),
    );
  }
}
