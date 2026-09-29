// lib/components/dialogs/dialogue_retrait.dart
//
// Pop-up « Retirer mes honoraires » : choix du numéro Mobile Money (parmi les fiches du
// médecin, jamais de saisie libre) et du montant en FCFA. Miroir du formulaire de
// client-plateform/.../medecin-portefeuille.jsx, coins carrés comme les autres dialogues.
//
// La boîte ne crée aucune demande : elle retourne seulement la saisie validée localement
// (entier, min/max, ≤ solde). Le serveur revalide tout et fait foi.
//
// Volontairement NON exportée par components.dart, comme les autres dialogues de ce dossier.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../repositories/retrait_repository.dart' show NumeroMobileMoney;
import '../style/colors.dart';

/// Saisie validée du formulaire de retrait.
class SaisieRetrait {
  const SaisieRetrait({required this.mobileMoneyId, required this.montant});
  final String mobileMoneyId;
  final int montant;
}

/// Retourne la saisie, ou `null` si le médecin a renoncé.
Future<SaisieRetrait?> demanderSaisieRetrait(
  BuildContext context, {
  required List<NumeroMobileMoney> numeros,
  required int solde,
  required int montantMin,
  required int montantMax,
}) {
  return showDialog<SaisieRetrait>(
    context: context,
    builder: (_) => _DialogueRetrait(
      numeros: numeros,
      solde: solde,
      montantMin: montantMin,
      montantMax: montantMax,
    ),
  );
}

String _fcfa(int n) {
  final s = n.toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write('\u202F');
    buf.write(s[i]);
  }
  return '$buf FCFA';
}

class _DialogueRetrait extends StatefulWidget {
  const _DialogueRetrait({
    required this.numeros,
    required this.solde,
    required this.montantMin,
    required this.montantMax,
  });

  final List<NumeroMobileMoney> numeros;
  final int solde;
  final int montantMin;
  final int montantMax;

  @override
  State<_DialogueRetrait> createState() => _DialogueRetraitState();
}

class _DialogueRetraitState extends State<_DialogueRetrait> {
  final _montantCtrl = TextEditingController();
  late String _numeroId = widget.numeros.first.id;
  String? _erreur;

  @override
  void dispose() {
    _montantCtrl.dispose();
    super.dispose();
  }

  int get _plafond {
    final max = widget.montantMax > 0 ? widget.montantMax : widget.solde;
    return max < widget.solde ? max : widget.solde;
  }

  void _valider() {
    final montant = int.tryParse(_montantCtrl.text.trim());
    if (montant == null) {
      setState(() => _erreur = 'Saisissez un montant entier en FCFA.');
      return;
    }
    if (montant < widget.montantMin) {
      setState(() => _erreur = 'Minimum : ${_fcfa(widget.montantMin)}.');
      return;
    }
    if (montant > _plafond) {
      setState(() => _erreur = montant > widget.solde
          ? 'Solde insuffisant (${_fcfa(widget.solde)}).'
          : 'Maximum par demande : ${_fcfa(widget.montantMax)}.');
      return;
    }
    Navigator.of(context).pop(SaisieRetrait(mobileMoneyId: _numeroId, montant: montant));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      title: const Text('Retirer mes honoraires'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Solde disponible : ${_fcfa(widget.solde)}',
                style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: _numeroId,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Envoyer vers',
                border: OutlineInputBorder(borderRadius: BorderRadius.zero),
              ),
              items: [
                for (final n in widget.numeros)
                  DropdownMenuItem(
                    value: n.id,
                    child: Text(n.libelle, overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (v) => setState(() => _numeroId = v ?? _numeroId),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _montantCtrl,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              onChanged: (_) {
                if (_erreur != null) setState(() => _erreur = null);
              },
              decoration: InputDecoration(
                labelText: 'Montant (FCFA)',
                helperText: 'Min ${_fcfa(widget.montantMin)}'
                    '${widget.montantMax > 0 ? ' · max ${_fcfa(widget.montantMax)}' : ''}',
                errorText: _erreur,
                border: const OutlineInputBorder(borderRadius: BorderRadius.zero),
              ),
              onSubmitted: (_) => _valider(),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Annuler'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.primary,
            shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
          ),
          onPressed: _valider,
          child: const Text('Demander le retrait'),
        ),
      ],
    );
  }
}