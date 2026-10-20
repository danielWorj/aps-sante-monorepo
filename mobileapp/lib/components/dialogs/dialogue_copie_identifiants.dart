// lib/components/dialogs/dialogue_copie_identifiants.dart
//
// Boîte de dialogue BLOQUANTE affichée juste après la création d'un compte :
// le mot de passe temporaire n'est renvoyé qu'une seule fois par le serveur,
// beaucoup d'utilisateurs passaient l'écran récapitulatif sans le noter.
//
// Impossible de la fermer (tap à côté, bouton retour) tant que le mot de
// passe n'a pas été copié : le bouton « Continuer » reste désactivé.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../style/colors.dart';
import '../style/text_styles.dart';
import '../buttons/app_buttons.dart';

/// Affiche la boîte et se termine quand l'utilisateur a copié le mot de
/// passe puis confirmé.
Future<void> exigerCopieIdentifiants(
  BuildContext context, {
  required String email,
  required String motDePasseTemporaire,
}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _DialogueCopieIdentifiants(
      email: email,
      motDePasse: motDePasseTemporaire,
    ),
  );
}

class _DialogueCopieIdentifiants extends StatefulWidget {
  const _DialogueCopieIdentifiants({
    required this.email,
    required this.motDePasse,
  });

  final String email;
  final String motDePasse;

  @override
  State<_DialogueCopieIdentifiants> createState() =>
      _DialogueCopieIdentifiantsState();
}

class _DialogueCopieIdentifiantsState
    extends State<_DialogueCopieIdentifiants> {
  bool _copie = false;

  Future<void> _copier() async {
    await Clipboard.setData(ClipboardData(text: widget.motDePasse));
    if (!mounted) return;
    setState(() => _copie = true);
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: AlertDialog(
        backgroundColor: AppColors.card,
        shape: RoundedRectangleBorder(borderRadius: AppRadius.smRadius),
        titlePadding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
        contentPadding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        title: const Row(
          children: [
            Icon(Icons.key_rounded, color: AppColors.amber700, size: 20),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                'Copiez votre mot de passe temporaire',
                style: TextStyle(
                  fontFamily: AppTextStyles.fontDisplay,
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink,
                ),
              ),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                "Il n'est affiché qu'une seule fois et vous sera demandé à votre "
                'première connexion. Copiez-le et conservez-le avant de continuer.',
                style: TextStyle(
                  fontFamily: AppTextStyles.fontBody,
                  fontSize: 12.5,
                  color: AppColors.inkSoft,
                  height: 1.55,
                ),
              ),
              const SizedBox(height: 14),
              _Ligne(label: 'Identifiant', valeur: widget.email),
              const SizedBox(height: 8),
              _Ligne(
                label: 'Mot de passe temporaire',
                valeur: widget.motDePasse,
                fort: true,
              ),
              const SizedBox(height: 14),
              SecondaryButton(
                label: _copie ? 'Mot de passe copié' : 'Copier le mot de passe',
                icon: _copie ? Icons.check_rounded : Icons.copy_rounded,
                onPressed: _copier,
              ),
              const SizedBox(height: 8),
              PrimaryButton(
                label: "J'ai copié mon mot de passe",
                onPressed: _copie ? () => Navigator.of(context).pop() : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Ligne extends StatelessWidget {
  const _Ligne({required this.label, required this.valeur, this.fort = false});

  final String label;
  final String valeur;
  final bool fort;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: fort ? AppColors.amber100 : AppColors.bg,
        border: Border.all(color: fort ? AppColors.amber500 : AppColors.line),
        borderRadius: AppRadius.smRadius,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontBody,
              fontSize: 10.5,
              fontWeight: FontWeight.w600,
              color: AppColors.inkFaint,
            ),
          ),
          const SizedBox(height: 3),
          SelectableText(
            valeur,
            style: TextStyle(
              fontFamily: AppTextStyles.fontMono,
              fontSize: fort ? 15 : 12.5,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}
