// lib/pages/public/pin_oublie_screen.dart
//
// « Code PIN oublié » (vérification du numéro active sur le serveur) :
// numéro -> code reçu par SMS / WhatsApp -> nouveau code PIN. Le compte est
// débloqué ; l'utilisateur se reconnecte avec son numéro et ce code.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../controllers/referentiel_controller.dart';
import '../../models/authentification_models.dart';
import '../../models/referentiel_models.dart' show Pays;
import 'creer_pin_screen.dart' show ChampPin;
import 'verification_telephone.dart';

class PinOublieScreen extends ConsumerStatefulWidget {
  const PinOublieScreen({super.key});

  @override
  ConsumerState<PinOublieScreen> createState() => _PinOublieScreenState();
}

class _PinOublieScreenState extends ConsumerState<PinOublieScreen> {
  final _formKey = GlobalKey<FormState>();
  final _telephone = TextEditingController();
  final _pin = TextEditingController();
  final _confirmation = TextEditingController();
  String _paysIso2 = 'CM';
  String? _preuve;
  bool _envoi = false;
  String? _erreur;

  @override
  void dispose() {
    _telephone.dispose();
    _pin.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _enregistrer() async {
    if (!_formKey.currentState!.validate() || _preuve == null) return;
    setState(() {
      _envoi = true;
      _erreur = null;
    });
    try {
      await ref.read(authentificationRepositoryProvider).reinitialiserPin(
            telephone: _telephone.text.trim(), paysIso2: _paysIso2, preuve: _preuve!, nouveauPin: _pin.text,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Code PIN modifié : connectez-vous avec votre numéro.')),
      );
      Navigator.of(context).pop();
    } on ErreurAuthentification catch (e) {
      setState(() {
        _erreur = e.message;
        if (e.code == 'PREUVE_INVALIDE') _preuve = null;
      });
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
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
                const ApsTopBar(title: 'Code PIN oublié'),
                Text('Recevez un code sur votre numéro, puis choisissez un nouveau code PIN.',
                    style: AppTextStyles.small.copyWith(fontSize: 14)),
                const SizedBox(height: 16),
                if (_erreur != null) ...[
                  AppAlert(type: AppAlertType.danger, message: _erreur!, onClose: () => setState(() => _erreur = null)),
                  const SizedBox(height: 12),
                ],
                ApsSelectField<String>(
                  initialValue: _paysIso2,
                  decoration: const InputDecoration(labelText: 'Pays', prefixIcon: Icon(Icons.public_rounded, size: 19)),
                  items: (pays.isEmpty ? const [('CM', 'Cameroun')] : [for (final p in pays) (p.codeIso2, p.nom)])
                      .map((p) => DropdownMenuItem(value: p.$1, child: Text(p.$2)))
                      .toList(),
                  onChanged: _preuve != null ? null : (v) => setState(() => _paysIso2 = v ?? 'CM'),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _telephone,
                  enabled: _preuve == null,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Numéro de téléphone', hintText: '6XX XX XX XX', prefixIcon: Icon(Icons.phone_outlined, size: 19)),
                  onChanged: (_) => setState(() {}),
                ),
                VerificationTelephone(
                  telephone: () => _telephone.text,
                  paysIso2: _paysIso2,
                  objet: 'reinitialisation_mot_de_passe',
                  canaux: config.canaux,
                  preuve: _preuve,
                  onPreuve: (p) => setState(() => _preuve = p),
                ),
                if (_preuve != null) ...[
                  const SizedBox(height: 10),
                  ChampPin(
                    controller: _pin,
                    label: 'Nouveau code PIN (6 chiffres)',
                    validator: (v) => (v ?? '').length != 6 ? 'Le code PIN comporte 6 chiffres.' : null,
                  ),
                  const SizedBox(height: 10),
                  ChampPin(
                    controller: _confirmation,
                    label: 'Confirmez le code PIN',
                    validator: (v) => v != _pin.text ? 'Les deux codes ne sont pas identiques.' : null,
                  ),
                  const SizedBox(height: 18),
                  ApsButton(label: 'Enregistrer mon nouveau code PIN', loading: _envoi, onPressed: _enregistrer),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
