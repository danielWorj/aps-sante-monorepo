// changement_mot_de_passe_initial.dart
//
// Premier mot de passe d'un compte créé avec un mot de passe temporaire
// (médecin, pharmacie, structure, assurance…). POST /auth/login renvoie
// alors `mot_de_passe_a_changer` + un jeton restreint, sans session :
// cet écran le transmet à [SessionController.changerMotDePasseInitial],
// qui ouvre la session complète en cas de succès.
//
// Ferme l'écran avec `true` une fois la session ouverte : l'appelant
// (LoginScreen) enchaîne alors sur l'espace du rôle connecté.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../models/authentification_models.dart';

/// Longueur minimale imposée par le serveur (compte.service.js).
const int _longueurMinimale = 8;

class ChangementMotDePasseInitialScreen extends ConsumerStatefulWidget {
  const ChangementMotDePasseInitialScreen({
    super.key,
    required this.tokenChangementMotDePasse,
  });

  final String tokenChangementMotDePasse;

  @override
  ConsumerState<ChangementMotDePasseInitialScreen> createState() =>
      _ChangementMotDePasseInitialScreenState();
}

class _ChangementMotDePasseInitialScreenState
    extends ConsumerState<ChangementMotDePasseInitialScreen> {
  final _formKey = GlobalKey<FormState>();
  final _motDePasseCtrl = TextEditingController();
  final _confirmationCtrl = TextEditingController();

  bool _masquer = true;
  bool _envoi = false;
  String? _erreur;

  @override
  void dispose() {
    _motDePasseCtrl.dispose();
    _confirmationCtrl.dispose();
    super.dispose();
  }

  Future<void> _valider() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _envoi = true;
      _erreur = null;
    });
    try {
      await ref.read(sessionControllerProvider.notifier).changerMotDePasseInitial(
            ChangementMotDePasseInitialPayload(
              nouveauMotDePasse: _motDePasseCtrl.text,
            ),
            tokenChangementMotDePasse: widget.tokenChangementMotDePasse,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ErreurAuthentification catch (e) {
      if (!mounted) return;
      setState(() => _erreur = e.codeHttp == 401
          ? 'Ce lien a expiré. Reconnectez-vous avec votre mot de passe temporaire.'
          : e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _erreur = 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  height: 42,
                  child: Row(children: [ApsIconButton.back(context, flat: true)]),
                ),
                const SizedBox(height: 14),
                const Align(alignment: Alignment.centerLeft, child: ApsLogo()),
                const SizedBox(height: 20),
                Text('Choisissez votre\nmot de passe.', style: AppTextStyles.xl),
                const SizedBox(height: 8),
                Text(
                  'Votre compte a été créé avec un mot de passe temporaire. '
                  'Définissez-en un nouveau pour accéder à votre espace.',
                  style: AppTextStyles.small.copyWith(fontSize: 14),
                ),
                const SizedBox(height: 24),
                if (_erreur != null) ...[
                  AppAlert(
                    type: AppAlertType.danger,
                    message: _erreur!,
                    onClose: () => setState(() => _erreur = null),
                  ),
                  const SizedBox(height: 14),
                ],
                TextFormField(
                  controller: _motDePasseCtrl,
                  obscureText: _masquer,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.newPassword],
                  style: AppTextStyles.strong.copyWith(fontSize: 14.5),
                  decoration: InputDecoration(
                    labelText: 'Nouveau mot de passe',
                    hintText: 'Au moins $_longueurMinimale caractères',
                    prefixIcon: const Icon(Icons.lock_outline_rounded, size: 19),
                    suffixIcon: IconButton(
                      tooltip: _masquer ? 'Afficher' : 'Masquer',
                      icon: Icon(
                        _masquer ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                        size: 19,
                        color: AppColors.ink3,
                      ),
                      onPressed: () => setState(() => _masquer = !_masquer),
                    ),
                    contentPadding: const EdgeInsets.symmetric(vertical: 18, horizontal: 14),
                  ),
                  validator: (v) {
                    if (v == null || v.isEmpty) return 'Merci de saisir un mot de passe.';
                    if (v.length < _longueurMinimale) {
                      return 'Le mot de passe doit contenir au moins $_longueurMinimale caractères.';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _confirmationCtrl,
                  obscureText: _masquer,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _valider(),
                  style: AppTextStyles.strong.copyWith(fontSize: 14.5),
                  decoration: const InputDecoration(
                    labelText: 'Confirmer le mot de passe',
                    prefixIcon: Icon(Icons.lock_outline_rounded, size: 19),
                    contentPadding: EdgeInsets.symmetric(vertical: 18, horizontal: 14),
                  ),
                  validator: (v) => v != _motDePasseCtrl.text
                      ? 'Les deux mots de passe ne correspondent pas.'
                      : null,
                ),
                const SizedBox(height: 20),
                ApsButton(
                  label: 'Enregistrer et continuer',
                  loading: _envoi,
                  onPressed: _valider,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
