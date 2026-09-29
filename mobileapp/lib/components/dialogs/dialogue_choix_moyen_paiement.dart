// lib/components/dialogs/dialogue_choix_moyen_paiement.dart
//
// Pop-up « Comment souhaitez-vous payer ? », affichée au clic sur « Payer ».
// Miroir de client-plateform/.../ChoixMoyenPaiement.jsx, sur le modèle de
// dialogue_motif_annulation.dart, avec des coins carrés.
//
// Deux options :
//   - Carte bancaire (Stripe)  → [MoyenPaiement.carte]
//   - Mobile Money (CamPay)    → [MoyenPaiement.mobileMoney]
//
// La boîte ne déclenche aucun paiement : elle retourne seulement le choix,
// l'appelant (bouton_payer_rdv.dart) lance ensuite le bon flux.
//
// Volontairement NON exportée par components.dart, comme les autres
// dialogues de ce dossier.

import 'package:flutter/material.dart';

import '../style/colors.dart';
import '../style/text_styles.dart';

/// Moyen de paiement choisi par le patient.
enum MoyenPaiement { carte, mobileMoney }

/// Affiche la boîte de dialogue et retourne le moyen choisi, ou `null` si
/// le patient a renoncé (bouton « Annuler » ou tap à côté).
Future<MoyenPaiement?> demanderMoyenPaiement(BuildContext context) {
  return showDialog<MoyenPaiement>(
    context: context,
    builder: (_) => const _DialogueChoixMoyenPaiement(),
  );
}

class _DialogueChoixMoyenPaiement extends StatelessWidget {
  const _DialogueChoixMoyenPaiement();

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      // Coins carrés (demandés) : Radius nul plutôt que le 28 par défaut.
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      title: const Text('Comment souhaitez-vous payer ?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Choisissez votre moyen de paiement. Votre rendez-vous sera '
              'confirmé dès la réception du règlement.',
            ),
            const SizedBox(height: 16),
            _OptionPaiement(
              icone: Icons.credit_card_rounded,
              titre: 'Carte bancaire',
              sousTitre: 'Visa, Mastercard — paiement via Stripe',
              onTap: () => Navigator.of(context).pop(MoyenPaiement.carte),
            ),
            const SizedBox(height: 10),
            _OptionPaiement(
              icone: Icons.phone_android_rounded,
              titre: 'Mobile Money',
              sousTitre: 'MTN / Orange — paiement via CamPay',
              onTap: () =>
                  Navigator.of(context).pop(MoyenPaiement.mobileMoney),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Annuler'),
        ),
      ],
    );
  }
}

/// Carte cliquable à angles droits (icône, titre, sous-titre, chevron).
class _OptionPaiement extends StatelessWidget {
  const _OptionPaiement({
    required this.icone,
    required this.titre,
    required this.sousTitre,
    required this.onTap,
  });

  final IconData icone;
  final String titre;
  final String sousTitre;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: AppColors.lineStrong),
      ),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                color: AppColors.primarySurface,
                child: Icon(icone, color: AppColors.primary, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(titre, style: AppTextStyles.cardTitle),
                    const SizedBox(height: 2),
                    Text(sousTitre, style: AppTextStyles.cardMeta),
                  ],
                ),
              ),
              const Icon(
                Icons.chevron_right_rounded,
                color: AppColors.inkFaint,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
