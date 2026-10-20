// lib/pages/verrou/veille_connexion_web.dart
//
// Connexion web validée depuis l'application : quand un ordinateur demande
// une connexion pour ce compte (« Valider sur mon téléphone »), l'application
// affiche la demande avec 3 codes ; l'utilisateur touche celui affiché sur
// l'ordinateur (ou « Ce n'est pas moi »). Un mauvais code refuse la demande.
//
// Interrogation toutes les 5 secondes, seulement application au premier
// plan et session ouverte (les demandes expirent au bout de 2 minutes).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../models/authentification_models.dart';

class VeilleConnexionWeb extends ConsumerStatefulWidget {
  const VeilleConnexionWeb({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<VeilleConnexionWeb> createState() => _VeilleConnexionWebState();
}

class _VeilleConnexionWebState extends ConsumerState<VeilleConnexionWeb> with WidgetsBindingObserver {
  static const _intervalle = Duration(seconds: 5);

  Timer? _minuteur;
  bool _premierPlan = true;
  bool _envoi = false;
  DemandeConnexionWeb? _demande;
  final Set<String> _traitees = {};
  String? _retour;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _minuteur = Timer.periodic(_intervalle, (_) => _interroger());
  }

  @override
  void dispose() {
    _minuteur?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState etat) {
    _premierPlan = etat == AppLifecycleState.resumed;
  }

  Future<void> _interroger() async {
    if (!_premierPlan || _demande != null || _envoi) return;
    final session = ref.read(sessionControllerProvider).value;
    if (session == null || !session.utilisateur.pinDefini) return;
    try {
      final demandes = await ref.read(sessionControllerProvider.notifier).appelAuthentifie(
            (token) => ref.read(authentificationRepositoryProvider).demandesConnexionWeb(accessToken: token),
          );
      final nouvelle = demandes.where((d) => !_traitees.contains(d.demandeId)).firstOrNull;
      if (mounted && nouvelle != null) setState(() => _demande = nouvelle);
    } catch (_) {
      // Silencieux : nouvel essai au prochain tour.
    }
  }

  Future<void> _repondre({required bool accepter, String? code}) async {
    final demande = _demande;
    if (demande == null) return;
    setState(() => _envoi = true);
    _traitees.add(demande.demandeId);
    String retour;
    try {
      await ref.read(sessionControllerProvider.notifier).appelAuthentifie(
            (token) => ref.read(authentificationRepositoryProvider).repondreDemandeConnexionWeb(
                  demande.demandeId,
                  accepter: accepter,
                  code: code,
                  accessToken: token,
                ),
          );
      retour = accepter ? 'Connexion autorisée sur l’ordinateur.' : 'Connexion refusée.';
    } on ErreurAuthentification catch (e) {
      retour = e.message;
    } catch (_) {
      retour = 'Réponse impossible. Réessayez depuis l’ordinateur.';
    }
    if (!mounted) return;
    setState(() {
      _envoi = false;
      _demande = null;
      _retour = retour;
    });
    Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _retour = null);
    });
  }

  @override
  Widget build(BuildContext context) {
    final demande = _demande;
    return Stack(
      children: [
        widget.child,
        if (demande != null || _retour != null)
          Positioned.fill(
            child: Material(
              color: Colors.black54,
              child: SafeArea(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: ApsCard(
                      radius: 10,
                      padding: const EdgeInsets.all(18),
                      child: demande == null
                          ? Text(_retour!, textAlign: TextAlign.center, style: AppTextStyles.strong)
                          : Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const Icon(Icons.computer_rounded, size: 34, color: AppColors.b7),
                                const SizedBox(height: 10),
                                Text('Connexion sur un ordinateur ?', textAlign: TextAlign.center, style: AppTextStyles.l),
                                const SizedBox(height: 6),
                                Text(
                                  'Quelqu’un demande à se connecter à votre compte sur le site APS Santé. '
                                  'Si c’est vous, touchez le code affiché sur l’ordinateur.',
                                  textAlign: TextAlign.center,
                                  style: AppTextStyles.small,
                                ),
                                const SizedBox(height: 16),
                                Row(
                                  children: [
                                    for (final code in demande.codes)
                                      Expanded(
                                        child: Padding(
                                          padding: const EdgeInsets.symmetric(horizontal: 4),
                                          child: OutlinedButton(
                                            onPressed: _envoi ? null : () => _repondre(accepter: true, code: code),
                                            style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                                            child: Text(code, style: AppTextStyles.xl.copyWith(fontSize: 24)),
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                TextButton(
                                  onPressed: _envoi ? null : () => _repondre(accepter: false),
                                  child: const Text('Ce n’est pas moi : refuser'),
                                ),
                              ],
                            ),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
