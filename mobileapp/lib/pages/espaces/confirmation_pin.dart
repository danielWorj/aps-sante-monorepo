// lib/pages/espaces/confirmation_pin.dart
//
// Code PIN demandé pour les opérations protégées : entrer dans un espace
// professionnel, demander un retrait. Le serveur reste juge (claim
// `pin_le` du jeton, voir pin.middleware.js) ; ces aides demandent le PIN
// AVANT l'appel pour éviter un aller-retour d'erreur.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../models/authentification_models.dart';

/// Boîte de saisie d'un code PIN à 6 chiffres ; null si annulée.
Future<String?> demanderPin(
  BuildContext context, {
  String titre = 'Confirmez avec votre code PIN',
  String message = 'Par sécurité, cette opération demande votre code PIN à 6 chiffres.',
  String? erreur,
}) {
  return showDialog<String>(
    context: context,
    builder: (_) => _DialoguePin(titre: titre, message: message, erreur: erreur),
  );
}

class _DialoguePin extends StatefulWidget {
  const _DialoguePin({required this.titre, required this.message, this.erreur});

  final String titre;
  final String message;
  final String? erreur;

  @override
  State<_DialoguePin> createState() => _DialoguePinState();
}

class _DialoguePinState extends State<_DialoguePin> {
  final _pin = TextEditingController();

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  void _valider() {
    if (_pin.text.length == 6) Navigator.of(context).pop(_pin.text);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.titre),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.message, style: AppTextStyles.small),
          if (widget.erreur != null) ...[
            const SizedBox(height: 8),
            Text(widget.erreur!, style: AppTextStyles.small.copyWith(color: AppColors.dangerDark)),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _pin,
            autofocus: true,
            obscureText: true,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
            style: AppTextStyles.strong.copyWith(fontSize: 20, letterSpacing: 10),
            decoration: const InputDecoration(hintText: '••••••'),
            onSubmitted: (_) => _valider(),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Annuler')),
        TextButton(onPressed: _valider, child: const Text('Confirmer')),
      ],
    );
  }
}

/// Jeton à utiliser pour une opération sensible : si le compte a un PIN,
/// on le demande et on le confirme (nouveau jeton, 5 min) ; sinon le
/// jeton courant. null si l'utilisateur abandonne.
Future<String?> jetonAvecPin(BuildContext context, WidgetRef ref) async {
  final session = ref.read(sessionControllerProvider).value;
  if (session == null) return null;
  if (!session.utilisateur.pinDefini) return session.accessToken;

  String? erreur;
  while (context.mounted) {
    final pin = await demanderPin(context, erreur: erreur);
    if (pin == null) return null;
    try {
      return await ref.read(sessionControllerProvider.notifier).verifierPin(pin);
    } on ErreurAuthentification catch (e) {
      if (e.code == 'PIN_BLOQUE') {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
        }
        return null;
      }
      erreur = e.message;
    }
  }
  return null;
}

/// Ouvre une session sur [espace]. Pour un espace professionnel, le serveur
/// exige un PIN récent (code « PIN_REQUIS ») : on essaie d'abord sans (un
/// PIN tout juste saisi à la connexion suffit), puis on le demande.
/// true si c'est fait.
Future<bool> basculerVersEspace(BuildContext context, WidgetRef ref, EspaceCompte espace) async {
  final utilisateur = ref.read(authUtilisateurProvider);
  if (utilisateur == null) return false;
  if (utilisateur.espaceActif == espace.cle) return true;

  final session = ref.read(sessionControllerProvider.notifier);
  String? pin;
  String? erreur;
  while (context.mounted) {
    try {
      await session.choisirEspace(espace.cle, pin: pin);
      return true;
    } on ErreurAuthentification catch (e) {
      final pinAttendu = e.code == 'PIN_REQUIS' || (pin != null && e.code == 'IDENTIFIANTS_INVALIDES');
      if (!pinAttendu) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
        }
        return false;
      }
      if (pin != null) erreur = e.message;
      if (!context.mounted) return false;
      pin = await demanderPin(
        context,
        titre: 'Ouvrir « ${espace.libelle} »',
        message: 'Saisissez votre code PIN pour entrer dans cet espace professionnel.',
        erreur: erreur,
      );
      if (pin == null) return false;
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Impossible d’ouvrir cet espace.')));
      }
      return false;
    }
  }
  return false;
}
