// lib/pages/public/validation_appareil_screen.dart
//
// Connexion depuis un téléphone inconnu (réponse « appareil_a_valider ») :
// l'utilisateur confirme que c'est bien lui, soit
//   - depuis l'application déjà connectée sur son autre téléphone (il y
//     touche le code à 2 chiffres affiché ici),
//   - soit par WhatsApp : il envoie un code à notre numéro (gratuit).
// Une fois confirmé, la session devient la session courante et l'écran se
// ferme avec le [ConnexionResultat] (Navigator.pop).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../models/authentification_models.dart';
import '../../utils/marque.dart';
import 'envoi_whatsapp_inverse.dart';

class ValidationAppareilScreen extends ConsumerStatefulWidget {
  const ValidationAppareilScreen({super.key, required this.validation});

  final ConnexionResultat validation;

  @override
  ConsumerState<ValidationAppareilScreen> createState() => _ValidationAppareilScreenState();
}

class _ValidationAppareilScreenState extends ConsumerState<ValidationAppareilScreen> {
  String? _methode;
  DemandeConfirmationApplication? _demandeApp;
  DemandeWhatsappInverse? _demandeWa;
  String? _erreur;
  bool _envoi = false;
  Timer? _sondage;

  String get _token => widget.validation.tokenValidationAppareil!;
  List<String> get _methodes => widget.validation.methodesValidation;

  @override
  void dispose() {
    _sondage?.cancel();
    super.dispose();
  }

  String _messageErreur(Object e) {
    if (e is ErreurAuthentification) {
      if (e.code == 'VALIDATION_EXPIREE') return 'Le délai est dépassé : reconnectez-vous.';
      return e.message;
    }
    return 'Une erreur est survenue. Réessayez.';
  }

  Future<void> _lancer(String methode) async {
    _sondage?.cancel();
    setState(() {
      _methode = methode;
      _demandeApp = null;
      _demandeWa = null;
      _erreur = null;
      _envoi = true;
    });
    final repo = ref.read(authentificationRepositoryProvider);
    try {
      if (methode == 'application') {
        final demande = await repo.demanderValidationApplication(_token);
        if (!mounted) return;
        setState(() => _demandeApp = demande);
        _sondage = Timer.periodic(const Duration(seconds: 2), (_) => _sonderApplication());
      } else {
        final demande = await repo.demanderValidationWhatsapp(_token);
        if (!mounted) return;
        setState(() => _demandeWa = demande);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _erreur = _messageErreur(e);
        _methode = null;
      });
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  bool _sondageEnCours = false;
  Future<void> _sonderApplication() async {
    final demande = _demandeApp;
    if (demande == null || _sondageEnCours) return;
    _sondageEnCours = true;
    try {
      final (statut, session) = await ref
          .read(authentificationRepositoryProvider)
          .sonderConnexionApplication(demande.demandeId, demande.secret);
      if (!mounted) return;
      if (session != null && session.sessionOuverte) {
        _sondage?.cancel();
        await _terminer(session);
      } else if (statut == 'refusee' || statut == 'expiree') {
        _sondage?.cancel();
        setState(() {
          _demandeApp = null;
          _methode = null;
          _erreur = statut == 'refusee' ? 'Confirmation refusée depuis le téléphone.' : 'Le délai est dépassé. Réessayez.';
        });
      }
    } catch (e) {
      // réseau instable : on réessaie au prochain passage
    } finally {
      _sondageEnCours = false;
    }
  }

  Future<void> _validerParPreuve(String preuve) async {
    setState(() {
      _envoi = true;
      _erreur = null;
    });
    try {
      final session = await ref.read(authentificationRepositoryProvider).validerAppareil(_token, preuve);
      await _terminer(session);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _erreur = _messageErreur(e);
        _demandeWa = null;
        _methode = null;
      });
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Future<void> _terminer(ConnexionResultat session) async {
    await ref.read(sessionControllerProvider.notifier).adopterSession(session);
    if (mounted) Navigator.of(context).pop(session);
  }

  @override
  Widget build(BuildContext context) {
    final telephone = widget.validation.telephoneMasque;
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(title: const Text('Nouvel appareil')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(child: ApsIconTile(Icons.verified_user_outlined)),
              const SizedBox(height: 12),
              Text('Confirmez que c’est bien vous', style: AppTextStyles.xl, textAlign: TextAlign.center),
              const SizedBox(height: 6),
              Text(
                'C’est la première fois que vous vous connectez sur ce téléphone'
                '${telephone != null ? ' ($telephone)' : ''}.',
                textAlign: TextAlign.center,
                style: AppTextStyles.small,
              ),
              const SizedBox(height: 20),
              if (_erreur != null) ...[
                AppAlert(type: AppAlertType.danger, message: _erreur!, onClose: () => setState(() => _erreur = null)),
                const SizedBox(height: 12),
              ],
              if (_methode == null) ...[
                if (_methodes.contains('application'))
                  ApsButton(
                    label: 'Confirmer depuis mon autre téléphone',
                    icon: Icons.phonelink_lock_rounded,
                    loading: _envoi,
                    onPressed: () => _lancer('application'),
                  ),
                if (_methodes.contains('application') && _methodes.contains('whatsapp')) const SizedBox(height: 10),
                if (_methodes.contains('whatsapp'))
                  ApsButton(
                    label: 'Confirmer par WhatsApp',
                    icon: Icons.chat_rounded,
                    variant: _methodes.contains('application') ? ApsButtonVariant.ghost : ApsButtonVariant.primary,
                    loading: _envoi && !_methodes.contains('application'),
                    onPressed: () => _lancer('whatsapp'),
                  ),
              ] else if (_envoi && _demandeApp == null && _demandeWa == null) ...[
                const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
              ] else if (_methode == 'application' && _demandeApp != null) ...[
                ApsCard(
                  flat: true,
                  radius: 10,
                  child: Column(children: [
                    Text(
                      'Ouvrez $nomMarque sur votre autre téléphone et touchez ce code :',
                      textAlign: TextAlign.center,
                      style: AppTextStyles.strong,
                    ),
                    const SizedBox(height: 10),
                    Text(_demandeApp!.code, style: AppTextStyles.xl.copyWith(fontSize: 40, letterSpacing: 6)),
                    const SizedBox(height: 10),
                    Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                      const SizedBox(width: 8),
                      Text('En attente de votre confirmation (2 min)…', style: AppTextStyles.xs),
                    ]),
                  ]),
                ),
                if (_methodes.contains('whatsapp'))
                  TextButton(
                    onPressed: () => _lancer('whatsapp'),
                    child: const Text('Je n’ai pas mon autre téléphone : confirmer par WhatsApp'),
                  ),
              ] else if (_methode == 'whatsapp' && _demandeWa != null) ...[
                ApsCard(
                  flat: true,
                  radius: 10,
                  child: EnvoiWhatsappInverse(
                    key: ValueKey(_demandeWa!.verificationId),
                    demande: _demandeWa!,
                    onPreuve: _validerParPreuve,
                    onExpire: () => setState(() {
                      _demandeWa = null;
                      _methode = null;
                      _erreur = 'Le délai est dépassé. Réessayez.';
                    }),
                  ),
                ),
                if (_methodes.contains('application'))
                  TextButton(
                    onPressed: () => _lancer('application'),
                    child: const Text('Confirmer plutôt depuis mon autre téléphone'),
                  ),
              ],
              const SizedBox(height: 8),
              TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Annuler')),
            ],
          ),
        ),
      ),
    );
  }
}
