// lib/pages/verrou/verrou_application.dart
//
// Verrouillage de l'application (conception « sécurisation de la
// connexion », 6.8) : la session reste ouverte 30 jours, mais l'application
// se rouvre avec le code PIN ou l'empreinte.
//
// Verrouillée :
//   - au démarrage, quand une session est restaurée ;
//   - au retour au premier plan après plus de 2 minutes en arrière-plan.
// Seulement pour un compte qui a un code PIN (sinon rien à saisir).
//
// Déverrouillage :
//   - code PIN, vérifié par le serveur (POST /auth/pin/verifier : même
//     limite d'essais que la connexion ; le jeton obtenu vaut aussi pour
//     les opérations sensibles pendant 5 minutes) ;
//   - empreinte / visage, si l'utilisateur l'a activé (préférence locale) :
//     confort local, le serveur exige toujours le PIN pour les opérations
//     sensibles.
// Après un déverrouillage, l'utilisateur retrouve l'écran où il était
// (donc son dernier espace).

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../models/authentification_models.dart';

const _cleBiometrie = 'aps_deverrouillage_biometrique';
const _delaiVerrouillage = Duration(minutes: 2);
const _stockage = FlutterSecureStorage();

/// Préférence « déverrouiller avec l'empreinte » : true, false, ou null
/// (jamais proposée).
Future<bool?> lireDeverrouillageBiometrique() async {
  try {
    final v = await _stockage.read(key: _cleBiometrie);
    return v == null ? null : v == 'oui';
  } catch (_) {
    return null;
  }
}

Future<void> ecrireDeverrouillageBiometrique(bool actif) =>
    _stockage.write(key: _cleBiometrie, value: actif ? 'oui' : 'non').catchError((_) {});

/// true si l'appareil sait reconnaître une empreinte ou un visage enregistré.
Future<bool> biometrieDisponible() async {
  try {
    final auth = LocalAuthentication();
    return await auth.isDeviceSupported() && (await auth.getAvailableBiometrics()).isNotEmpty;
  } catch (_) {
    return false;
  }
}

class VerrouApplication extends ConsumerStatefulWidget {
  const VerrouApplication({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<VerrouApplication> createState() => _VerrouApplicationState();
}

class _VerrouApplicationState extends ConsumerState<VerrouApplication> with WidgetsBindingObserver {
  bool _verrouille = false;
  DateTime? _miseEnArrierePlan;

  bool get _sessionAvecPin => ref.read(sessionControllerProvider).value?.utilisateur.pinDefini ?? false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Session restaurée au démarrage : on verrouille (une connexion faite
    // pendant cette ouverture de l'application, elle, ne verrouille pas).
    ref.read(sessionControllerProvider.future).then((session) {
      if (mounted && (session?.utilisateur.pinDefini ?? false)) setState(() => _verrouille = true);
    }).catchError((_) {});
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState etat) {
    if (etat == AppLifecycleState.paused || etat == AppLifecycleState.hidden) {
      _miseEnArrierePlan ??= DateTime.now();
    } else if (etat == AppLifecycleState.resumed) {
      final depuis = _miseEnArrierePlan;
      _miseEnArrierePlan = null;
      if (depuis != null && DateTime.now().difference(depuis) > _delaiVerrouillage && _sessionAvecPin) {
        setState(() => _verrouille = true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Déconnexion : plus rien à protéger.
    ref.listen(sessionControllerProvider, (_, suivant) {
      if (suivant.hasValue && suivant.value == null && _verrouille) setState(() => _verrouille = false);
    });
    return Stack(
      children: [
        widget.child,
        if (_verrouille)
          // Au-dessus du Navigator : Overlay propre pour les champs de saisie.
          Positioned.fill(
            child: Overlay(initialEntries: [
              OverlayEntry(builder: (_) => _EcranVerrou(onDeverrouille: () => setState(() => _verrouille = false))),
            ]),
          ),
      ],
    );
  }
}

class _EcranVerrou extends ConsumerStatefulWidget {
  const _EcranVerrou({required this.onDeverrouille});

  final VoidCallback onDeverrouille;

  @override
  ConsumerState<_EcranVerrou> createState() => _EcranVerrouState();
}

class _EcranVerrouState extends ConsumerState<_EcranVerrou> {
  final _pin = TextEditingController();
  bool _envoi = false;
  String? _erreur;
  bool _biometrieActive = false;
  bool _proposerBiometrie = false; // après un déverrouillage par PIN

  @override
  void initState() {
    super.initState();
    _preparerBiometrie();
  }

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  Future<void> _preparerBiometrie() async {
    final preference = await lireDeverrouillageBiometrique();
    final disponible = await biometrieDisponible();
    if (!mounted) return;
    setState(() => _biometrieActive = disponible && preference == true);
    if (_biometrieActive) _avecBiometrie();
  }

  Future<void> _avecBiometrie() async {
    try {
      final ok = await LocalAuthentication().authenticate(
        localizedReason: 'Déverrouillez APS Santé',
        persistAcrossBackgrounding: true,
      );
      if (ok && mounted) widget.onDeverrouille();
    } catch (_) {
      if (mounted) setState(() => _erreur = 'Empreinte indisponible : saisissez votre code PIN.');
    }
  }

  Future<void> _avecPin() async {
    if (_pin.text.length != 6) {
      setState(() => _erreur = 'Le code PIN comporte 6 chiffres.');
      return;
    }
    setState(() {
      _envoi = true;
      _erreur = null;
    });
    try {
      await ref.read(sessionControllerProvider.notifier).verifierPin(_pin.text);
      if (!mounted) return;
      // Première fois : proposer l'empreinte pour les prochaines fois.
      if (await lireDeverrouillageBiometrique() == null && await biometrieDisponible()) {
        if (mounted) setState(() => _proposerBiometrie = true);
        return;
      }
      widget.onDeverrouille();
    } on ErreurAuthentification catch (e) {
      _pin.clear();
      if (mounted) setState(() => _erreur = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _erreur = _biometrieActive
            ? 'Connexion impossible. Utilisez votre empreinte ou réessayez.'
            : 'Connexion impossible. Vérifiez votre connexion internet et réessayez.');
      }
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Future<void> _repondreBiometrie(bool oui) async {
    await ecrireDeverrouillageBiometrique(oui);
    widget.onDeverrouille();
  }

  @override
  Widget build(BuildContext context) {
    final prenom = ref.watch(authUtilisateurProvider)?.prenom ?? '';
    return Material(
      color: AppColors.surface,
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(child: ApsLogo(size: 64)),
              const SizedBox(height: 20),
              Text(
                prenom.isEmpty ? 'Application verrouillée' : 'Bonjour $prenom',
                textAlign: TextAlign.center,
                style: AppTextStyles.xl,
              ),
              const SizedBox(height: 8),
              Text(
                _proposerBiometrie
                    ? 'Voulez-vous déverrouiller l’application avec votre empreinte la prochaine fois ?'
                    : 'Saisissez votre code PIN pour continuer.',
                textAlign: TextAlign.center,
                style: AppTextStyles.small.copyWith(fontSize: 14),
              ),
              const SizedBox(height: 24),
              if (_proposerBiometrie) ...[
                ApsButton(label: 'Oui, utiliser mon empreinte', icon: Icons.fingerprint, onPressed: () => _repondreBiometrie(true)),
                const SizedBox(height: 8),
                ApsButton(label: 'Non merci', variant: ApsButtonVariant.ghost, onPressed: () => _repondreBiometrie(false)),
              ] else ...[
                TextField(
                  controller: _pin,
                  autofocus: !_biometrieActive,
                  obscureText: true,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                  style: AppTextStyles.strong.copyWith(fontSize: 22, letterSpacing: 12),
                  decoration: const InputDecoration(hintText: '••••••'),
                  onChanged: (v) {
                    if (v.length == 6 && !_envoi) _avecPin();
                  },
                  onSubmitted: (_) => _avecPin(),
                ),
                if (_erreur != null) ...[
                  const SizedBox(height: 10),
                  Text(_erreur!, textAlign: TextAlign.center, style: AppTextStyles.small.copyWith(color: AppColors.dangerDark)),
                ],
                const SizedBox(height: 16),
                ApsButton(label: 'Déverrouiller', loading: _envoi, onPressed: _avecPin),
                if (_biometrieActive) ...[
                  const SizedBox(height: 8),
                  ApsButton(
                    label: 'Utiliser mon empreinte',
                    icon: Icons.fingerprint,
                    variant: ApsButtonVariant.ghost,
                    onPressed: _envoi ? null : _avecBiometrie,
                  ),
                ],
                const SizedBox(height: 16),
                TextButton(
                  onPressed: _envoi ? null : () => ref.read(sessionControllerProvider.notifier).deconnecter().catchError((_) {}),
                  child: const Text('Se déconnecter'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
