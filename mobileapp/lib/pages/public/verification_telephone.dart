// lib/pages/public/verification_telephone.dart
//
// Vérification d'un numéro par code reçu (SMS ou WhatsApp), quand le
// serveur l'a activée (configurationConnexionProvider). « Recevoir le code »
// puis saisie : la preuve à usage unique est remontée par [onPreuve] et
// consommée par le serveur (changement de numéro, code PIN oublié…).
// Canal « whatsapp_inverse » : l'utilisateur ENVOIE un code par WhatsApp
// (EnvoiWhatsappInverse), rien à saisir.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../models/authentification_models.dart';
import 'envoi_whatsapp_inverse.dart';

String _libelleCanal(String c) => switch (c) {
      'whatsapp' => 'WhatsApp',
      'whatsapp_inverse' => 'WhatsApp (j’envoie un code)',
      _ => 'SMS',
    };

class VerificationTelephone extends ConsumerStatefulWidget {
  const VerificationTelephone({
    super.key,
    required this.telephone,
    required this.paysIso2,
    required this.objet,
    required this.canaux,
    required this.preuve,
    required this.onPreuve,
  });

  /// Numéro saisi (lu au moment de l'envoi).
  final String Function() telephone;
  final String? paysIso2;

  /// inscription | changement_telephone | reinitialisation_mot_de_passe
  final String objet;
  final List<String> canaux;
  final String? preuve;
  final ValueChanged<String?> onPreuve;

  @override
  ConsumerState<VerificationTelephone> createState() => _VerificationTelephoneState();
}

class _VerificationTelephoneState extends ConsumerState<VerificationTelephone> {
  final _code = TextEditingController();
  late String _canal = widget.canaux.isEmpty ? 'sms' : widget.canaux.first;
  String? _envoyePour;
  String? _info;
  String? _erreur;
  bool _envoi = false;
  int _attente = 0;
  Timer? _minuteur;
  // Vérification inversée en cours.
  DemandeWhatsappInverse? _inverse;

  @override
  void dispose() {
    _code.dispose();
    _minuteur?.cancel();
    super.dispose();
  }

  void _demarrerAttente(int secondes) {
    _minuteur?.cancel();
    setState(() => _attente = secondes);
    _minuteur = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted || _attente <= 1) {
        t.cancel();
        if (mounted) setState(() => _attente = 0);
      } else {
        setState(() => _attente -= 1);
      }
    });
  }

  Future<void> _envoyer() async {
    final numero = widget.telephone().trim();
    if (numero.isEmpty) {
      setState(() => _erreur = 'Renseignez d’abord votre numéro.');
      return;
    }
    setState(() {
      _envoi = true;
      _erreur = null;
    });
    try {
      if (_canal == 'whatsapp_inverse') {
        final demande = await ref.read(authentificationRepositoryProvider).demanderVerificationInverse(
              telephone: numero, paysIso2: widget.paysIso2, objet: widget.objet,
            );
        setState(() {
          _inverse = demande;
          _info = null;
          _envoyePour = '${widget.paysIso2}|$numero';
        });
        _demarrerAttente(60);
        return;
      }
      final message = await ref.read(authentificationRepositoryProvider).envoyerCodeTelephone(
            telephone: numero, paysIso2: widget.paysIso2, objet: widget.objet, canal: _canal,
          );
      setState(() {
        _inverse = null;
        _info = message;
        _envoyePour = '${widget.paysIso2}|$numero';
        _code.clear();
      });
      _demarrerAttente(60);
    } on ErreurAuthentification catch (e) {
      setState(() => _erreur = e.message);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Future<void> _verifier() async {
    setState(() {
      _envoi = true;
      _erreur = null;
    });
    try {
      final preuve = await ref.read(authentificationRepositoryProvider).verifierCodeTelephone(
            telephone: widget.telephone().trim(), paysIso2: widget.paysIso2, objet: widget.objet, code: _code.text,
          );
      widget.onPreuve(preuve);
    } on ErreurAuthentification catch (e) {
      setState(() => _erreur = e.message);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.preuve != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(children: [
          const Icon(Icons.verified_rounded, color: AppColors.b7, size: 18),
          const SizedBox(width: 6),
          Text('Numéro vérifié', style: AppTextStyles.strong.copyWith(color: AppColors.b7)),
        ]),
      );
    }
    final codeEnvoye = _envoyePour == '${widget.paysIso2}|${widget.telephone().trim()}';
    final libelle = _libelleCanal(_canal);
    return ApsCard(
      flat: true,
      radius: 10,
      margin: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Vérification de votre numéro', style: AppTextStyles.strong),
          const SizedBox(height: 8),
          if (widget.canaux.length > 1 && !codeEnvoye)
            Wrap(spacing: 8, children: [
              for (final c in widget.canaux)
                ChoiceChip(
                  label: Text(_libelleCanal(c)),
                  selected: _canal == c,
                  onSelected: (_) => setState(() => _canal = c),
                ),
            ]),
          if (codeEnvoye && _inverse != null) ...[
            EnvoiWhatsappInverse(
              key: ValueKey(_inverse!.verificationId),
              demande: _inverse!,
              onPreuve: widget.onPreuve,
              onExpire: () => setState(() {
                _inverse = null;
                _envoyePour = null;
                _erreur = 'Le délai est dépassé. Recommencez.';
              }),
            ),
          ] else if (codeEnvoye) ...[
            if (_info != null) Text(_info!, style: AppTextStyles.xs),
            const SizedBox(height: 8),
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(8)],
              style: AppTextStyles.strong.copyWith(letterSpacing: 6),
              decoration: const InputDecoration(labelText: 'Code reçu'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 8),
            ApsButton(label: 'Vérifier', loading: _envoi, onPressed: _code.text.length < 4 ? null : _verifier),
          ],
          const SizedBox(height: 6),
          TextButton(
            onPressed: _envoi || _attente > 0 ? null : _envoyer,
            child: Text(_attente > 0
                ? 'Renvoyer dans $_attente s'
                : codeEnvoye
                    ? (_inverse != null ? 'Nouveau code' : 'Renvoyer le code')
                    : _canal == 'whatsapp_inverse'
                        ? 'Confirmer par WhatsApp'
                        : 'Recevoir le code par $libelle'),
          ),
          if (_erreur != null) Text(_erreur!, style: AppTextStyles.small.copyWith(color: AppColors.dangerDark)),
        ],
      ),
    );
  }
}
