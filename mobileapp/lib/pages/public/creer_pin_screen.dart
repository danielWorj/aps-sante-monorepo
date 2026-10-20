// lib/pages/public/creer_pin_screen.dart
//
// « Créer mon code PIN » — connexion numéro + code PIN.
//
// Deux usages :
//   - session ouverte (après une connexion par email + mot de passe, ou
//     depuis le profil) : le compte choisit son numéro de connexion et
//     son code PIN ; « Plus tard » est possible ([onPlusTard]).
//   - PIN provisoire donné par un administrateur ([tokenChangementPin]
//     renseigné) : aucune session n'est encore ouverte, l'utilisateur
//     choisit son code personnel, ce qui ouvre la session.
//
// [onTermine] est appelé après l'enregistrement (la session est à jour).

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../controllers/referentiel_controller.dart';
import '../../models/authentification_models.dart';
import '../../models/referentiel_models.dart' show Pays;
import 'verification_telephone.dart';

class CreerPinScreen extends ConsumerStatefulWidget {
  const CreerPinScreen({super.key, this.tokenChangementPin, this.onTermine, this.onPlusTard});

  final String? tokenChangementPin;
  final VoidCallback? onTermine;
  final VoidCallback? onPlusTard;

  @override
  ConsumerState<CreerPinScreen> createState() => _CreerPinScreenState();
}

class _CreerPinScreenState extends ConsumerState<CreerPinScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _telephone;
  final _ancien = TextEditingController();
  final _pin = TextEditingController();
  final _confirmation = TextEditingController();
  String _paysIso2 = 'CM';
  bool _envoi = false;
  String? _erreur;
  String? _preuve; // numéro prouvé par code (vérification active)

  bool get _initial => widget.tokenChangementPin != null;

  @override
  void initState() {
    super.initState();
    _telephone = TextEditingController(text: ref.read(authUtilisateurProvider)?.telephone ?? '');
  }

  @override
  void dispose() {
    _telephone.dispose();
    _ancien.dispose();
    _pin.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _enregistrer() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _envoi = true;
      _erreur = null;
    });
    final session = ref.read(sessionControllerProvider.notifier);
    try {
      if (_initial) {
        await session.changerPinInitial(_pin.text, tokenChangementPin: widget.tokenChangementPin!);
      } else {
        final pinDefini = ref.read(authUtilisateurProvider)?.pinDefini ?? false;
        if (_verificationRequise && _preuve == null) {
          setState(() => _erreur = 'Vérifiez d’abord votre numéro avec le code reçu.');
          return;
        }
        await session.definirPin(
          telephone: _telephone.text.trim(),
          paysIso2: _paysIso2,
          pin: _pin.text,
          ancienPin: pinDefini ? _ancien.text : null,
          preuveTelephone: _preuve,
        );
      }
      if (!mounted) return;
      if (widget.onTermine != null) {
        widget.onTermine!();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Code PIN enregistré.')));
        Navigator.of(context).pop(true);
      }
    } on ErreurAuthentification catch (e) {
      if (mounted) setState(() => _erreur = e.message);
    } catch (_) {
      if (mounted) setState(() => _erreur = 'Enregistrement impossible. Réessayez.');
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  /// Vérification active et numéro nouveau (ou jamais vérifié).
  bool get _verificationRequise {
    if (_initial) return false;
    final config = ref.read(configurationConnexionProvider).value;
    if (config == null || !config.verificationTelephone) return false;
    final u = ref.read(authUtilisateurProvider);
    final inchange = (u?.telephoneVerifie ?? false) && _telephone.text.trim() == (u?.telephone ?? '');
    return !inchange;
  }

  String? _validerPin(String? v) {
    if (v == null || v.length != 6) return 'Le code PIN comporte 6 chiffres.';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final pinDefini = ref.watch(authUtilisateurProvider)?.pinDefini ?? false;
    final List<Pays> pays = ref.watch(listePaysProvider).value ?? const [];
    final config = ref.watch(configurationConnexionProvider).value ?? const ConfigurationConnexion();

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ApsTopBar(
                  title: _initial ? 'Première connexion' : 'Code PIN',
                  showBack: !_initial && widget.onPlusTard == null,
                ),
                Text(
                  _initial
                      ? 'Choisissez votre code PIN'
                      : pinDefini
                          ? 'Changer mon code PIN'
                          : 'Créez votre code PIN',
                  style: AppTextStyles.xl,
                ),
                const SizedBox(height: 8),
                Text(
                  _initial
                      ? 'Le code reçu est provisoire. Choisissez votre code personnel à 6 chiffres.'
                      : 'Ensuite, connectez-vous avec votre numéro et ce code à 6 chiffres, sans email ni mot de passe.',
                  style: AppTextStyles.small.copyWith(fontSize: 14),
                ),
                const SizedBox(height: 20),
                if (_erreur != null) ...[
                  AppAlert(type: AppAlertType.danger, message: _erreur!, onClose: () => setState(() => _erreur = null)),
                  const SizedBox(height: 14),
                ],
                if (!_initial) ...[
                  DropdownButtonFormField<String>(
                    initialValue: pays.any((p) => p.codeIso2 == _paysIso2) || pays.isEmpty ? _paysIso2 : pays.first.codeIso2,
                    decoration: const InputDecoration(labelText: 'Pays du numéro', prefixIcon: Icon(Icons.public_rounded, size: 19)),
                    items: (pays.isEmpty ? const [('CM', 'Cameroun')] : [for (final p in pays) (p.codeIso2, p.nom)])
                        .map((p) => DropdownMenuItem(value: p.$1, child: Text(p.$2)))
                        .toList(),
                    onChanged: _envoi ? null : (v) => setState(() => _paysIso2 = v ?? 'CM'),
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: _telephone,
                    keyboardType: TextInputType.phone,
                    autofillHints: const [AutofillHints.telephoneNumber],
                    decoration: const InputDecoration(
                      labelText: 'Numéro de téléphone',
                      hintText: '6XX XX XX XX',
                      helperText: 'C’est ce numéro que vous saisirez pour vous connecter.',
                      prefixIcon: Icon(Icons.phone_outlined, size: 19),
                    ),
                    validator: (v) => (v ?? '').trim().isEmpty ? 'Renseignez votre numéro.' : null,
                    onChanged: (_) => setState(() => _preuve = null),
                  ),
                  if (_verificationRequise)
                    VerificationTelephone(
                      telephone: () => _telephone.text,
                      paysIso2: _paysIso2,
                      objet: 'changement_telephone',
                      canaux: config.canaux,
                      preuve: _preuve,
                      onPreuve: (p) => setState(() => _preuve = p),
                    ),
                  const SizedBox(height: 10),
                ],
                if (!_initial && pinDefini) ...[
                  ChampPin(controller: _ancien, label: 'Code PIN actuel', validator: _validerPin),
                  const SizedBox(height: 10),
                ],
                ChampPin(
                  controller: _pin,
                  label: 'Nouveau code PIN (6 chiffres)',
                  helper: 'Évitez 123456, 111111 ou votre date de naissance.',
                  validator: _validerPin,
                ),
                const SizedBox(height: 10),
                ChampPin(
                  controller: _confirmation,
                  label: 'Confirmez le code PIN',
                  validator: (v) => v != _pin.text ? 'Les deux codes ne sont pas identiques.' : null,
                ),
                const SizedBox(height: 18),
                ApsButton(label: 'Enregistrer mon code PIN', loading: _envoi, onPressed: _enregistrer),
                if (widget.onPlusTard != null) ...[
                  const SizedBox(height: 6),
                  TextButton(onPressed: _envoi ? null : widget.onPlusTard, child: const Text('Plus tard')),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Champ de saisie d'un code PIN : 6 chiffres, masqués, clavier numérique.
class ChampPin extends StatefulWidget {
  const ChampPin({
    super.key,
    required this.controller,
    required this.label,
    this.helper,
    this.validator,
    this.onSubmitted,
    this.textInputAction,
  });

  final TextEditingController controller;
  final String label;
  final String? helper;
  final String? Function(String?)? validator;
  final void Function(String)? onSubmitted;
  final TextInputAction? textInputAction;

  @override
  State<ChampPin> createState() => _ChampPinState();
}

class _ChampPinState extends State<ChampPin> {
  bool _masque = true;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: widget.controller,
      obscureText: _masque,
      keyboardType: TextInputType.number,
      textInputAction: widget.textInputAction,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
      validator: widget.validator,
      onFieldSubmitted: widget.onSubmitted,
      style: AppTextStyles.strong.copyWith(fontSize: 16, letterSpacing: 6),
      decoration: InputDecoration(
        labelText: widget.label,
        helperText: widget.helper,
        prefixIcon: const Icon(Icons.pin_outlined, size: 19),
        suffixIcon: IconButton(
          tooltip: _masque ? 'Afficher' : 'Masquer',
          icon: Icon(_masque ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 19, color: AppColors.ink3),
          onPressed: () => setState(() => _masque = !_masque),
        ),
      ),
    );
  }
}
