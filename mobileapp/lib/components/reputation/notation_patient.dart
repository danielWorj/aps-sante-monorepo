// lib/components/reputation/notation_patient.dart
//
// Espace patient : consultations terminées à noter (GET /avis-medecin/a-donner)
// et feuille de notation (POST /avis-medecin). Le serveur vérifie que le RDV
// est bien celui du patient, terminé, et pas encore noté. Rien n'est
// affiché s'il n'y a aucune consultation à noter.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../controllers/reputation_medecin_controller.dart';
import '../../models/reputation_medecin_models.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';
import '../ui/aps_ui.dart';
import 'appel_reputation.dart';
import 'reputation_ui.dart';

class ConsultationsANoter extends ConsumerWidget {
  const ConsultationsANoter({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final liste = ref.watch(consultationsANoterProvider).value ?? const [];
    if (liste.isEmpty) return const SizedBox.shrink();

    return CarteReputation(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.star_rounded, size: 18, color: AppColors.star),
              const SizedBox(width: 8),
              Expanded(child: Text('Comment s\'est passée votre consultation ?', style: AppTextStyles.strong.copyWith(fontSize: 14))),
            ],
          ),
          const SizedBox(height: 3),
          Text('Votre avis aide les autres patients et votre médecin.', style: AppTextStyles.xs),
          const SizedBox(height: 6),
          for (final c in liste)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                border: c == liste.last ? null : const Border(bottom: BorderSide(color: AppColors.line)),
              ),
              child: Row(
                children: [
                  _Portrait(nom: c.medecinNom, photoUrl: c.photoUrl),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(c.medecinNom, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppTextStyles.strong.copyWith(fontSize: 13.5)),
                        Text(
                          [c.specialite, if (c.dateCreneau != null) jourMoisCourt(c.dateCreneau!)].whereType<String>().join(' · '),
                          style: AppTextStyles.xs,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  ApsButton(
                    label: 'Noter',
                    small: true,
                    expand: false,
                    icon: Icons.star_outline_rounded,
                    onPressed: () => ouvrirFeuilleNotation(context, ref, c),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Ouvre la feuille de notation ; rafraîchit la liste après dépôt.
Future<void> ouvrirFeuilleNotation(BuildContext context, WidgetRef ref, ConsultationANoter c) async {
  final message = await showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (_) => _FeuilleNotation(consultation: c),
  );
  if (message != null && context.mounted) {
    ref.invalidate(consultationsANoterProvider);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

class _FeuilleNotation extends ConsumerStatefulWidget {
  const _FeuilleNotation({required this.consultation});
  final ConsultationANoter consultation;

  @override
  ConsumerState<_FeuilleNotation> createState() => _FeuilleNotationState();
}

class _FeuilleNotationState extends ConsumerState<_FeuilleNotation> {
  int? _note;
  final Map<String, int> _criteres = {};
  bool? _recommande;
  bool _anonyme = false;
  bool _envoi = false;
  String? _erreur;
  final _commentaire = TextEditingController();

  @override
  void dispose() {
    _commentaire.dispose();
    super.dispose();
  }

  Future<void> _publier() async {
    if (_note == null || _envoi) return;
    setState(() {
      _envoi = true;
      _erreur = null;
    });
    try {
      final donnees = <String, dynamic>{
        'rdv_id': widget.consultation.rdvId,
        'note': _note,
        'recommande': _recommande,
        'commentaire': _commentaire.text.trim(),
        'anonyme': _anonyme,
        for (final c in criteresAvis)
          if (_criteres[c.cle] != null) c.champ: _criteres[c.cle],
      };
      final message = await appelReputationEcran(ref, (repo, token) => repo.deposerAvis(donnees, token: token));
      if (mounted) Navigator.of(context).pop(message);
    } catch (e) {
      if (mounted) setState(() => _erreur = '$e');
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.consultation;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ApsSheetHeader(title: 'Votre avis sur ${c.medecinNom}'),
              Text(
                [
                  c.specialite,
                  c.typeRdv == 'teleconsultation' ? 'Téléconsultation' : 'Consultation au cabinet',
                  if (c.dateCreneau != null) jourMoisAnnee(c.dateCreneau!),
                ].whereType<String>().join(' · '),
                style: AppTextStyles.small,
              ),
              const SizedBox(height: 20),
              Center(child: Text('Note globale', style: AppTextStyles.strong.copyWith(fontSize: 13))),
              const SizedBox(height: 6),
              Center(child: SaisieEtoiles(valeur: _note, onChanged: (n) => setState(() => _note = n), libelle: 'Note globale')),
              const SizedBox(height: 20),
              Text('En détail (facultatif)', style: AppTextStyles.strong.copyWith(fontSize: 13)),
              const SizedBox(height: 4),
              for (final cr in criteresAvis)
                Row(
                  children: [
                    Expanded(child: Text(cr.libelle, style: AppTextStyles.small.copyWith(fontSize: 12.5))),
                    SaisieEtoiles(
                      valeur: _criteres[cr.cle],
                      onChanged: (n) => setState(() => _criteres[cr.cle] = n),
                      taille: 20,
                      afficherLibelle: false,
                      libelle: cr.libelle,
                    ),
                  ],
                ),
              const SizedBox(height: 16),
              Text('Recommanderiez-vous ce médecin ?', style: AppTextStyles.strong.copyWith(fontSize: 13)),
              const SizedBox(height: 8),
              Row(
                children: [
                  for (final o in const [(true, 'Oui', Icons.thumb_up_alt_outlined), (false, 'Non', Icons.thumb_down_alt_outlined)]) ...[
                    Expanded(
                      child: _ChoixReco(
                        libelle: o.$2,
                        icone: o.$3,
                        actif: _recommande == o.$1,
                        onTap: () => setState(() => _recommande = _recommande == o.$1 ? null : o.$1),
                      ),
                    ),
                    if (o.$1) const SizedBox(width: 10),
                  ],
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _commentaire,
                maxLines: 4,
                maxLength: 2000,
                enabled: !_envoi,
                decoration: const InputDecoration(
                  labelText: 'Racontez votre expérience (facultatif)',
                  hintText: 'Accueil, écoute, explications… Évitez les informations médicales personnelles.',
                  alignLabelWithHint: true,
                ),
              ),
              CheckboxListTile(
                value: _anonyme,
                onChanged: _envoi ? null : (v) => setState(() => _anonyme = v ?? false),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                dense: true,
                title: Text('Publier sous « Patient vérifié » plutôt que mon prénom', style: AppTextStyles.small.copyWith(fontSize: 12.5)),
              ),
              if (_erreur != null) ...[
                const SizedBox(height: 6),
                ApsNote.text(_erreur!, icon: Icons.error_outline_rounded, tone: ApsTone.red),
              ],
              const SizedBox(height: 12),
              ApsButton(label: 'Publier mon avis', loading: _envoi, onPressed: _note == null ? null : _publier),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.shield_outlined, size: 13, color: AppColors.ink3),
                  const SizedBox(width: 5),
                  Text('Vérifié par APS Santé avant publication.', style: AppTextStyles.xs),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChoixReco extends StatelessWidget {
  const _ChoixReco({required this.libelle, required this.icone, required this.actif, required this.onTap});
  final String libelle;
  final IconData icone;
  final bool actif;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: actif,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          height: 44,
          decoration: BoxDecoration(
            color: actif ? AppColors.b0 : AppColors.surface,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: actif ? AppColors.b7 : AppColors.lineStrong, width: actif ? 1.5 : 1),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icone, size: 17, color: actif ? AppColors.b8 : AppColors.ink2),
              const SizedBox(width: 7),
              Text(libelle, style: AppTextStyles.strong.copyWith(fontSize: 13, color: actif ? AppColors.b8 : AppColors.ink2)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Portrait plat (photo, sinon initiales sur vert pâle) — sans dégradé.
class _Portrait extends StatelessWidget {
  const _Portrait({required this.nom, this.photoUrl});
  final String nom;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    final initiales = nom
        .replaceFirst('Dr ', '')
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .take(2)
        .map((p) => p[0].toUpperCase())
        .join();
    final repli = Text(initiales, style: AppTextStyles.small.copyWith(fontWeight: FontWeight.w800, color: AppColors.b8));
    return Container(
      width: 40,
      height: 40,
      alignment: Alignment.center,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppColors.b0,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.b1),
      ),
      child: photoUrl == null
          ? repli
          : Image.network(photoUrl!, width: 40, height: 40, fit: BoxFit.cover, errorBuilder: (_, _, _) => repli),
    );
  }
}
