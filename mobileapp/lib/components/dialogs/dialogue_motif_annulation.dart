// lib/components/dialogs/dialogue_motif_annulation.dart
//
// Boîte de dialogue « Annuler le rendez-vous » : confirmation + choix
// OBLIGATOIRE du motif d'annulation (+ commentaire facultatif).
//
// Le backend refuse (400) toute annulation sans `motif_annulation` — voir
// annulerRendezVous dans rendezVous.controller.js — car le motif pilote
// le traitement financier. Cette boîte est donc le seul chemin d'UI qui
// doit précéder un [ChangerStatutRendezVousPayload] à l'état `annule`.
//
// Volontairement NON exportée par components.dart : elle dépend de
// l'enum [MotifAnnulation] (couche modèles), comme bouton_payer_rdv.dart.

import 'package:flutter/material.dart';

import '../../models/rendez_vous_models.dart';
import '../style/colors.dart';

/// Choix validé par l'utilisateur dans [demanderMotifAnnulation].
class ChoixAnnulation {
  const ChoixAnnulation({required this.motif, this.commentaire});

  final MotifAnnulation motif;

  /// `null` si l'utilisateur n'a rien saisi.
  final String? commentaire;
}

/// Affiche la boîte de dialogue et retourne le choix de l'utilisateur,
/// ou `null` s'il a renoncé (bouton « Retour » ou tap à côté).
Future<ChoixAnnulation?> demanderMotifAnnulation(
  BuildContext context, {
  required String titre,
  required String message,
  required String labelConfirmer,
  required List<MotifAnnulation> motifs,
}) {
  return showDialog<ChoixAnnulation>(
    context: context,
    builder: (_) => _DialogueMotifAnnulation(
      titre: titre,
      message: message,
      labelConfirmer: labelConfirmer,
      motifs: motifs,
    ),
  );
}

class _DialogueMotifAnnulation extends StatefulWidget {
  const _DialogueMotifAnnulation({
    required this.titre,
    required this.message,
    required this.labelConfirmer,
    required this.motifs,
  });

  final String titre;
  final String message;
  final String labelConfirmer;
  final List<MotifAnnulation> motifs;

  @override
  State<_DialogueMotifAnnulation> createState() =>
      _DialogueMotifAnnulationState();
}

class _DialogueMotifAnnulationState extends State<_DialogueMotifAnnulation> {
  final TextEditingController _commentaireCtrl = TextEditingController();
  MotifAnnulation? _motif;

  @override
  void dispose() {
    _commentaireCtrl.dispose();
    super.dispose();
  }

  void _confirmer() {
    final motif = _motif;
    if (motif == null) return;
    final commentaire = _commentaireCtrl.text.trim();
    Navigator.of(context).pop(
      ChoixAnnulation(
        motif: motif,
        commentaire: commentaire.isEmpty ? null : commentaire,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.titre),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.message),
            const SizedBox(height: 16),
            const Text(
              'Motif de l\'annulation *',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 4),
            for (final motif in widget.motifs)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  _motif == motif
                      ? Icons.radio_button_checked
                      : Icons.radio_button_unchecked,
                  color: _motif == motif ? AppColors.coral600 : null,
                ),
                title: Text(motif.libelle),
                onTap: () => setState(() => _motif = motif),
              ),
            const SizedBox(height: 8),
            TextField(
              controller: _commentaireCtrl,
              maxLines: 3,
              maxLength: 1000, // limite côté serveur
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Commentaire (facultatif)',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Retour'),
        ),
        TextButton(
          onPressed: _motif == null ? null : _confirmer,
          style: TextButton.styleFrom(foregroundColor: AppColors.coral600),
          child: Text(widget.labelConfirmer),
        ),
      ],
    );
  }
}
