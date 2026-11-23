// lib/pages/public/envoi_whatsapp_inverse.dart
//
// Vérification WhatsApp « inversée » : au lieu de recevoir un code,
// l'utilisateur ENVOIE le code affiché à notre numéro WhatsApp (gratuit,
// rien à recopier). Le bouton ouvre WhatsApp avec le message déjà écrit ;
// l'écran interroge le serveur toutes les 3 s (et dès le retour dans
// l'application) et remonte la preuve via [onPreuve].

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../models/authentification_models.dart';

class EnvoiWhatsappInverse extends ConsumerStatefulWidget {
  const EnvoiWhatsappInverse({super.key, required this.demande, required this.onPreuve, this.onExpire});

  final DemandeWhatsappInverse demande;
  final ValueChanged<String> onPreuve;
  final VoidCallback? onExpire;

  @override
  ConsumerState<EnvoiWhatsappInverse> createState() => _EnvoiWhatsappInverseState();
}

class _EnvoiWhatsappInverseState extends ConsumerState<EnvoiWhatsappInverse> with WidgetsBindingObserver {
  Timer? _minuteur;
  bool _termine = false;
  bool _enCours = false;
  String? _erreur;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _minuteur = Timer.periodic(const Duration(seconds: 3), (_) => _sonder());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _minuteur?.cancel();
    super.dispose();
  }

  // Retour depuis WhatsApp : on vérifie tout de suite.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _sonder();
  }

  Future<void> _sonder() async {
    if (_termine || _enCours) return;
    _enCours = true;
    try {
      final r = await ref.read(authentificationRepositoryProvider).statutVerificationInverse(widget.demande.verificationId);
      if (!mounted || _termine) return;
      if (r.verifie) {
        _termine = true;
        _minuteur?.cancel();
        widget.onPreuve(r.preuve!);
      } else if (r.expiree) {
        _termine = true;
        _minuteur?.cancel();
        widget.onExpire?.call();
      }
    } catch (_) {
      // réseau instable : on réessaie au prochain passage
    } finally {
      _enCours = false;
    }
  }

  Future<void> _ouvrirWhatsapp() async {
    setState(() => _erreur = null);
    final ok = await launchUrl(Uri.parse(widget.demande.lienWhatsapp), mode: LaunchMode.externalApplication)
        .catchError((_) => false);
    if (!ok && mounted) {
      setState(() => _erreur = 'WhatsApp n’a pas pu s’ouvrir. Envoyez le code ci-dessus au ${widget.demande.numeroWhatsapp}.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Envoyez ce code sur WhatsApp, depuis votre numéro :',
            style: AppTextStyles.strong, textAlign: TextAlign.center),
        const SizedBox(height: 8),
        Text(
          widget.demande.code,
          textAlign: TextAlign.center,
          style: AppTextStyles.xl.copyWith(fontSize: 30, letterSpacing: 6),
        ),
        const SizedBox(height: 12),
        ApsButton(
          label: 'Ouvrir WhatsApp et envoyer',
          icon: Icons.send_rounded,
          onPressed: _ouvrirWhatsapp,
        ),
        const SizedBox(height: 8),
        Text(
          'Le message est déjà écrit : touchez simplement « Envoyer », puis revenez ici.\n'
          'Destinataire : ${widget.demande.numeroWhatsapp}',
          textAlign: TextAlign.center,
          style: AppTextStyles.xs.copyWith(height: 1.5),
        ),
        const SizedBox(height: 10),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
          const SizedBox(width: 8),
          Text('En attente de votre message…', style: AppTextStyles.xs),
        ]),
        if (_erreur != null) ...[
          const SizedBox(height: 8),
          Text(_erreur!, textAlign: TextAlign.center, style: AppTextStyles.small.copyWith(color: AppColors.dangerDark)),
        ],
      ],
    );
  }
}
