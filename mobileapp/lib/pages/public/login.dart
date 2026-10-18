// login.dart
// Écran de connexion — APSA
//
// Reprend fidèlement le design system de l'application (voir lib/components) :
// - Couleurs : AppColors (vert de marque, corail, surfaces)
// - Typos : AppTextStyles (Sora pour les titres/UI forte, Inter pour le corps)
// - Rayons : AppRadius
// - Boutons : PrimaryButton / SecondaryButton
// - Alerte : AppAlert (message d'erreur de connexion)
//
// Branché sur le vrai flux d'authentification : POST /auth/login via
// [SessionController.connecter] (authentification_controller.dart).
// Deux issues possibles côté serveur (voir ConnexionResultat) :
//   1. Session complète ouverte : la session est déjà mise à jour dans
//      [sessionControllerProvider] par le controller lui-même ; cet écran
//      n'a qu'à prévenir l'appelant via `onLoginSuccess` pour la navigation
//      (généralement un routeur qui écoute `estConnecteProvider`).
//   2. Mot de passe temporaire détecté (`motDePasseAChanger`) : aucune
//      session n'est ouverte, seul un `tokenChangementMotDePasse` restreint
//      est renvoyé. Cet écran redirige alors via `onMotDePasseTemporaire`
//      vers l'écran de changement de mot de passe initial, qui devra
//      transmettre ce token à `SessionController.changerMotDePasseInitial`.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../models/authentification_models.dart';

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

  bool _obscurePassword = true;
  bool _loading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    try {
      final resultat = await ref.read(sessionControllerProvider.notifier).connecter(
        ConnexionPayload(
          email: _emailController.text.trim(),
          motDePasse: _passwordController.text,
        ),
      );

      if (!mounted) return;

      if (resultat.motDePasseAChanger) {
        // Mot de passe temporaire : pas de session ouverte, on redirige
        // vers l'écran de changement de mot de passe initial avec le
        // token restreint fourni par le serveur.
        final token = resultat.tokenChangementMotDePasse;
        if (token == null) {
          setState(() {
            _errorMessage = 'Une erreur est survenue. Veuillez réessayer.';
          });
        } else {
          widget.onMotDePasseTemporaire?.call(token);
        }
      } else {
        // Session complète ouverte par SessionController : il ne reste
        // qu'à prévenir l'appelant pour la navigation post-login.
        widget.onLoginSuccess?.call();
      }
    } on ErreurAuthentification catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = e.identifiantsInvalides
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

  @override
  Widget build(BuildContext context) {
    final peutRevenir = Navigator.of(context).canPop();
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
                  const Align(alignment: Alignment.centerLeft, child: ApsLogo()),
                  const SizedBox(height: 20),
                  Text('Bon retour\nparmi nous.', style: AppTextStyles.xl),
                  const SizedBox(height: 8),
                  Text(
                    'Connectez-vous pour retrouver vos rendez-vous et votre suivi santé.',
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
                  const SizedBox(height: 4),
                  ApsButton(
                    label: 'Se connecter',
                    loading: _loading,
                    onPressed: _handleLogin,
                  ),

                  const SizedBox(height: 24),
                  const _Separateur(),
                  const SizedBox(height: 16),
                  ApsButton(
                    label: 'Continuer avec Google',
                    icon: Icons.g_mobiledata_rounded,
                    variant: ApsButtonVariant.ghost,
                    onPressed: () {
                      // Brancher ici l'authentification Google (ex: google_sign_in).
                    },
                  ),
                  if (widget.onCreateAccount != null) ...[
                    const SizedBox(height: 8),
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
                  Text.rich(
                    const TextSpan(children: [
                      TextSpan(text: 'En continuant, vous acceptez les '),
                      TextSpan(
                        text: 'Conditions',
                        style: TextStyle(color: AppColors.b6, fontWeight: FontWeight.w700),
                      ),
                      TextSpan(text: ' et la '),
                      TextSpan(
                        text: 'Politique de confidentialité',
                        style: TextStyle(color: AppColors.b6, fontWeight: FontWeight.w700),
                      ),
                      TextSpan(text: '.'),
                    ]),
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
