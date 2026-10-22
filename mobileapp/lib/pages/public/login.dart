// login.dart
// Écran de connexion — APSA
//
// Deux modes, avec un petit bouton de bascule :
//   - numéro de téléphone + code PIN (par défaut) : POST /auth/login-pin ;
//   - email + mot de passe (comptes existants, administrateurs) :
//     POST /auth/login.
// Le dernier mode utilisé est retenu sur le téléphone.
//
// Issues possibles (voir ConnexionResultat) :
//   1. Session complète ouverte : la session est déjà à jour dans
//      [sessionControllerProvider]. Après une connexion par email d'un
//      compte sans PIN, on propose de créer le code PIN (« Plus tard »
//      possible), puis on ouvre l'espace via `onLoginSuccess`, ou
//      [AccueilCompte] (« Choisir mon espace » s'il y en a plusieurs).
//   2. Mot de passe temporaire (`motDePasseAChanger`) : écran de
//      changement de mot de passe initial.
//   3. PIN provisoire (`pinAChanger`) : écran de choix du PIN personnel.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../controllers/referentiel_controller.dart';
import '../../models/authentification_models.dart';
import '../../models/referentiel_models.dart' show Pays;
import '../home_router_for_role.dart';
import 'changement_mot_de_passe_initial.dart';
import 'creer_pin_screen.dart';
import 'pin_oublie_screen.dart';

const _cleModeConnexion = 'aps_mode_connexion';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({
    super.key,
    this.onLoginSuccess,
    this.onMotDePasseTemporaire,
    this.onForgotPassword,
    this.onCreateAccount,
  });

  /// Appelé après une connexion réussie avec session complète ouverte
  /// (`resultat.sessionOuverte`). La session elle-même est déjà à jour
  /// dans [sessionControllerProvider] ; ce callback ne sert qu'à piloter
  /// la navigation (ex: `Navigator.pushReplacement`, redirection routeur…).
  final VoidCallback? onLoginSuccess;

  /// Appelé quand le serveur détecte un mot de passe temporaire
  /// (`resultat.motDePasseAChanger`), avec le `tokenChangementMotDePasse`
  /// à transmettre à l'écran de changement de mot de passe initial.
  /// Aucune session n'est ouverte dans ce cas.
  final void Function(String tokenChangementMotDePasse)? onMotDePasseTemporaire;

  final VoidCallback? onForgotPassword;
  final VoidCallback? onCreateAccount;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _telephoneController = TextEditingController();
  final _pinController = TextEditingController();

  bool _modePin = true;
  String _paysIso2 = 'CM';
  bool _obscurePassword = true;
  bool _loading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    const FlutterSecureStorage().read(key: _cleModeConnexion).then((mode) {
      if (mounted && mode == 'email') setState(() => _modePin = false);
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _telephoneController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  void _basculerMode() {
    setState(() {
      _modePin = !_modePin;
      _errorMessage = null;
    });
    const FlutterSecureStorage()
        .write(key: _cleModeConnexion, value: _modePin ? 'pin' : 'email')
        .catchError((_) {});
  }

  Future<void> _handleLogin() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    final session = ref.read(sessionControllerProvider.notifier);
    try {
      final resultat = _modePin
          ? await session.connecterParPin(ConnexionPinPayload(
              telephone: _telephoneController.text.trim(),
              paysIso2: _paysIso2,
              pin: _pinController.text,
            ))
          : await session.connecter(ConnexionPayload(
              email: _emailController.text.trim(),
              motDePasse: _passwordController.text,
            ));

      if (!mounted) return;

      if (resultat.pinAChanger) {
        // PIN provisoire donné par un administrateur : pas de session.
        final token = resultat.tokenChangementPin;
        if (token == null) {
          setState(() => _errorMessage = 'Une erreur est survenue. Veuillez réessayer.');
          return;
        }
        setState(() => _loading = false);
        final ok = await Navigator.of(context).push<bool>(
          MaterialPageRoute(builder: (_) => CreerPinScreen(tokenChangementPin: token)),
        );
        if (ok == true && mounted) _ouvrirEspace(null);
      } else if (resultat.motDePasseAChanger) {
        // Mot de passe temporaire : pas de session ouverte. Sans
        // `onMotDePasseTemporaire` fourni par l'appelant, l'écran ouvre
        // lui-même le changement de mot de passe initial.
        final token = resultat.tokenChangementMotDePasse;
        if (token == null) {
          setState(() {
            _errorMessage = 'Une erreur est survenue. Veuillez réessayer.';
          });
        } else if (widget.onMotDePasseTemporaire != null) {
          widget.onMotDePasseTemporaire!(token);
        } else {
          setState(() => _loading = false);
          final change = await Navigator.of(context).push<bool>(
            MaterialPageRoute(
              builder: (_) => ChangementMotDePasseInitialScreen(
                tokenChangementMotDePasse: token,
              ),
            ),
          );
          if (change == true && mounted) _ouvrirEspace(null);
        }
      } else {
        await _proposerPinPuisOuvrir(resultat);
      }
    } on ErreurAuthentification catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = !_modePin && e.identifiantsInvalides
            ? 'Identifiants incorrects. Vérifiez votre e-mail et votre mot de passe.'
            : e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Une erreur est survenue. Veuillez réessayer.';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Connexion par email d'un compte sans code PIN : on propose de le
  /// créer (« Plus tard » possible), puis on ouvre l'espace.
  Future<void> _proposerPinPuisOuvrir(ConnexionResultat resultat) async {
    final utilisateur = resultat.utilisateur;
    final estAdmin = utilisateur?.role == RoleUtilisateur.admin || utilisateur?.role == RoleUtilisateur.superadmin;
    if (!_modePin && utilisateur != null && !utilisateur.pinDefini && !estAdmin) {
      setState(() => _loading = false);
      await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (pinContext) => CreerPinScreen(
            onTermine: () => Navigator.of(pinContext).pop(true),
            onPlusTard: () => Navigator.of(pinContext).pop(false),
          ),
        ),
      );
      if (!mounted) return;
    }
    _ouvrirEspace(resultat.espaces);
  }

  /// Session ouverte : l'appelant pilote la navigation s'il a fourni
  /// `onLoginSuccess` ; sinon on remplace le login par l'espace
  /// (« Choisir mon espace » si le compte en a plusieurs).
  void _ouvrirEspace(List<EspaceCompte>? espaces) {
    if (widget.onLoginSuccess != null) {
      widget.onLoginSuccess!();
      return;
    }
    if (ref.read(sessionControllerProvider).value == null) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => AccueilCompte(choisir: true, espaces: espaces != null && espaces.isNotEmpty ? espaces : null),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final peutRevenir = Navigator.of(context).canPop();
    final List<Pays> pays = ref.watch(listePaysProvider).value ?? const [];
    ref.watch(configurationConnexionProvider);
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
          child: Form(
            key: _formKey,
            child: AutofillGroup(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(
                    height: 42,
                    child: Row(
                      children: [
                        if (peutRevenir) ApsIconButton.back(context, flat: true),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  const Align(alignment: Alignment.centerLeft, child: ApsLogo(size: 72)),
                  const SizedBox(height: 20),
                  Text('Bon retour\nparmi nous.', style: AppTextStyles.xl),
                  const SizedBox(height: 8),
                  Text(
                    _modePin
                        ? 'Connectez-vous avec votre numéro de téléphone et votre code PIN.'
                        : 'Connectez-vous pour retrouver vos rendez-vous et votre suivi santé.',
                    style: AppTextStyles.small.copyWith(fontSize: 14),
                  ),
                  const SizedBox(height: 24),

                  if (_errorMessage != null) ...[
                    AppAlert(
                      type: AppAlertType.danger,
                      message: _errorMessage!,
                      onClose: () => setState(() => _errorMessage = null),
                    ),
                    const SizedBox(height: 14),
                  ],

                  if (_modePin) ...[
                    ApsSelectField<String>(
                      initialValue: _paysIso2,
                      decoration: const InputDecoration(
                        labelText: 'Pays',
                        prefixIcon: Icon(Icons.public_rounded, size: 19),
                      ),
                      items: (pays.isEmpty ? const [('CM', 'Cameroun')] : [for (final p in pays) (p.codeIso2, p.nom)])
                          .map((p) => DropdownMenuItem(value: p.$1, child: Text(p.$2)))
                          .toList(),
                      onChanged: _loading ? null : (v) => setState(() => _paysIso2 = v ?? 'CM'),
                    ),
                    const SizedBox(height: 10),
                    _AppTextField(
                      controller: _telephoneController,
                      label: 'Numéro de téléphone',
                      hint: '6XX XX XX XX',
                      icon: Icons.phone_outlined,
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      validator: (value) =>
                          (value?.trim() ?? '').isEmpty ? 'Merci de saisir votre numéro.' : null,
                    ),
                    const SizedBox(height: 10),
                    ChampPin(
                      controller: _pinController,
                      label: 'Code PIN (6 chiffres)',
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _handleLogin(),
                      validator: (v) => (v ?? '').length != 6 ? 'Le code PIN comporte 6 chiffres.' : null,
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () => (ref.read(configurationConnexionProvider).value?.verificationTelephone ?? false)
                            ? Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PinOublieScreen()))
                            : showDialog<void>(
                          context: context,
                          builder: (d) => AlertDialog(
                            title: const Text('Code PIN oublié'),
                            content: const Text(
                              'Connectez-vous avec votre email et votre mot de passe (bouton en bas), '
                              'puis choisissez un nouveau code PIN. Sans email, contactez le support APS Santé.',
                            ),
                            actions: [TextButton(onPressed: () => Navigator.of(d).pop(), child: const Text('Compris'))],
                          ),
                        ),
                        child: const Text('Code PIN oublié ?'),
                      ),
                    ),
                  ] else ...[
                    _AppTextField(
                      controller: _emailController,
                      label: 'Adresse e-mail',
                      hint: 'vous@exemple.com',
                      icon: Icons.mail_outline_rounded,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.email],
                      validator: (value) {
                        final v = value?.trim() ?? '';
                        if (v.isEmpty) return 'Merci de saisir votre e-mail.';
                        final valid = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v);
                        if (!valid) return 'Adresse e-mail invalide.';
                        return null;
                      },
                    ),
                    const SizedBox(height: 10),
                    _AppTextField(
                      controller: _passwordController,
                      label: 'Mot de passe',
                      hint: '••••••••',
                      icon: Icons.lock_outline_rounded,
                      obscureText: _obscurePassword,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.password],
                      onSubmitted: (_) => _handleLogin(),
                      suffixIcon: IconButton(
                        tooltip: _obscurePassword ? 'Afficher' : 'Masquer',
                        icon: Icon(
                          _obscurePassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          size: 19,
                          color: AppColors.ink3,
                        ),
                        onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Merci de saisir votre mot de passe.';
                        }
                        if (value.length < 6) {
                          return 'Le mot de passe doit contenir au moins 6 caractères.';
                        }
                        return null;
                      },
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: widget.onForgotPassword,
                        child: const Text('Mot de passe oublié ?'),
                      ),
                    ),
                  ],
                  const SizedBox(height: 4),
                  ApsButton(
                    label: 'Se connecter',
                    loading: _loading,
                    onPressed: _handleLogin,
                  ),
                  const SizedBox(height: 6),
                  // Bascule entre les deux modes de connexion.
                  TextButton.icon(
                    onPressed: _loading ? null : _basculerMode,
                    icon: Icon(_modePin ? Icons.mail_outline_rounded : Icons.phone_iphone_rounded, size: 18),
                    label: Text(
                      _modePin
                          ? 'Se connecter avec mon email et mon mot de passe'
                          : 'Se connecter avec mon numéro et mon code PIN',
                    ),
                  ),

                  if (widget.onCreateAccount != null) ...[
                    const SizedBox(height: 16),
                    const _Separateur(),
                    const SizedBox(height: 16),
                    ApsButton(
                      label: 'Créer un compte',
                      icon: Icons.person_add_alt_rounded,
                      variant: ApsButtonVariant.ghost,
                      onPressed: widget.onCreateAccount,
                    ),
                  ],

                  const SizedBox(height: 20),
                  ApsCard(
                    color: AppColors.b0,
                    borderColor: AppColors.b1,
                    child: Row(
                      children: [
                        const ApsIconTile(Icons.medical_services_outlined, tone: ApsTone.ink),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Professionnel de santé ?', style: AppTextStyles.strong),
                              Text(
                                'Médecin, pharmacie, structure, assurance : même connexion.',
                                style: AppTextStyles.xs,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  TexteAcceptationLegale(
                    debut: 'En continuant, vous acceptez les ',
                    textAlign: TextAlign.center,
                    style: AppTextStyles.xs.copyWith(height: 1.5),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Separateur extends StatelessWidget {
  const _Separateur();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(child: Divider(color: AppColors.lineStrong)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text('ou', style: AppTextStyles.xs.copyWith(fontSize: 12)),
        ),
        const Expanded(child: Divider(color: AppColors.lineStrong)),
      ],
    );
  }
}

/// Champ de saisie de la maquette (`.field`) : libellé flottant, icône,
/// bordure 1,5 px qui passe au vert au focus (via le thème global).
class _AppTextField extends StatelessWidget {
  const _AppTextField({
    required this.controller,
    required this.label,
    required this.hint,
    this.icon,
    this.suffixIcon,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.validator,
    this.onSubmitted,
    this.autofillHints,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final IconData? icon;
  final Widget? suffixIcon;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final String? Function(String?)? validator;
  final void Function(String)? onSubmitted;
  final Iterable<String>? autofillHints;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      obscureText: obscureText,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      validator: validator,
      onFieldSubmitted: onSubmitted,
      autofillHints: autofillHints,
      style: AppTextStyles.strong.copyWith(fontSize: 14.5),
      cursorColor: AppColors.b6,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: icon == null ? null : Icon(icon, size: 19),
        suffixIcon: suffixIcon,
        contentPadding: const EdgeInsets.symmetric(vertical: 18, horizontal: 14),
      ),
    );
  }
}
