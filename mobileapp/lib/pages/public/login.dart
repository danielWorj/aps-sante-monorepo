// login.dart
// Écran de connexion — APS Santé
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
import '../../../components/components.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../models/authentification_models.dart';

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
    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 12),
                  _buildLogo(),
                  const SizedBox(height: 28),
                  Text(
                    'Bon retour',
                    textAlign: TextAlign.center,
                    style: AppTextStyles.h3.copyWith(fontSize: 22),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Connectez-vous pour accéder à vos rendez-vous et à votre suivi santé.',
                    textAlign: TextAlign.center,
                    style: AppTextStyles.body,
                  ),
                  const SizedBox(height: 28),

                  if (_errorMessage != null) ...[
                    AppAlert(
                      type: AppAlertType.danger,
                      message: _errorMessage!,
                      onClose: () => setState(() => _errorMessage = null),
                    ),
                    const SizedBox(height: 16),
                  ],

                  _FieldLabel('Adresse e-mail'),
                  const SizedBox(height: 6),
                  _AppTextField(
                    controller: _emailController,
                    hint: 'vous@exemple.com',
                    icon: Icons.mail_outline_rounded,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    validator: (value) {
                      final v = value?.trim() ?? '';
                      if (v.isEmpty) return 'Merci de saisir votre e-mail.';
                      final valid = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v);
                      if (!valid) return 'Adresse e-mail invalide.';
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),

                  _FieldLabel('Mot de passe'),
                  const SizedBox(height: 6),
                  _AppTextField(
                    controller: _passwordController,
                    hint: '••••••••',
                    icon: Icons.lock_outline_rounded,
                    obscureText: _obscurePassword,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _handleLogin(),
                    suffixIcon: IconButton(
                      splashRadius: 18,
                      icon: Icon(
                        _obscurePassword
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                        size: 19,
                        color: AppColors.inkFaint,
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
                  const SizedBox(height: 10),

                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: widget.onForgotPassword,
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text(
                        'Mot de passe oublié ?',
                        style: AppTextStyles.buttonLabel.copyWith(
                          fontSize: 12.5,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  PrimaryButton(
                    label: 'Se connecter',
                    icon: Icons.login_rounded,
                    loading: _loading,
                    onPressed: _handleLogin,
                  ),
                  const SizedBox(height: 20),

                  Row(
                    children: [
                      const Expanded(child: Divider(color: AppColors.line, thickness: 1)),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: Text('ou', style: AppTextStyles.cardMeta),
                      ),
                      const Expanded(child: Divider(color: AppColors.line, thickness: 1)),
                    ],
                  ),
                  const SizedBox(height: 20),

                  SecondaryButton(
                    label: 'Continuer avec Google',
                    icon: Icons.g_mobiledata_rounded,
                    onPressed: () {
                      // Brancher ici l'authentification Google (ex: google_sign_in).
                    },
                  ),
                  const SizedBox(height: 28),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('Pas encore de compte ?', style: AppTextStyles.body),
                      TextButton(
                        onPressed: widget.onCreateAccount,
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: Text(
                          'Créer un compte',
                          style: AppTextStyles.buttonLabel.copyWith(
                            fontSize: 12.5,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLogo() {
    return Column(
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: AppColors.primaryLight,
            borderRadius: AppRadius.mdRadius,
          ),
          child: const Icon(
            Icons.local_hospital_rounded,
            color: AppColors.primary,
            size: 30,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'APS Santé',
          style: AppTextStyles.h3.copyWith(fontSize: 18, color: AppColors.primaryDark),
        ),
      ],
    );
  }
}

/// Libellé de champ de formulaire, cohérent avec `AppTextStyles.cardTitle`.
class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: AppTextStyles.cardTitle.copyWith(fontSize: 12.5, color: AppColors.ink),
    );
  }
}

/// Champ de texte réutilisable, calqué sur les inputs de la maquette :
/// fond blanc, bordure fine, coins arrondis (AppRadius.sm), icône à gauche.
class _AppTextField extends StatelessWidget {
  const _AppTextField({
    required this.controller,
    required this.hint,
    this.icon,
    this.suffixIcon,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.validator,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String hint;
  final IconData? icon;
  final Widget? suffixIcon;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final String? Function(String?)? validator;
  final void Function(String)? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      obscureText: obscureText,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      validator: validator,
      onFieldSubmitted: onSubmitted,
      style: AppTextStyles.body.copyWith(fontSize: 13.5, color: AppColors.ink),
      cursorColor: AppColors.primary,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: AppTextStyles.body.copyWith(fontSize: 13.5, color: AppColors.inkFaint),
        filled: true,
        fillColor: AppColors.card,
        prefixIcon: icon == null
            ? null
            : Icon(icon, size: 18, color: AppColors.inkSoft),
        suffixIcon: suffixIcon,
        contentPadding: const EdgeInsets.symmetric(vertical: 14, horizontal: 14),
        border: OutlineInputBorder(
          borderRadius: AppRadius.smRadius,
          borderSide: const BorderSide(color: AppColors.lineStrong),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadius.smRadius,
          borderSide: const BorderSide(color: AppColors.lineStrong),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AppRadius.smRadius,
          borderSide: const BorderSide(color: AppColors.primary, width: 1.4),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: AppRadius.smRadius,
          borderSide: const BorderSide(color: AppColors.danger),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: AppRadius.smRadius,
          borderSide: const BorderSide(color: AppColors.danger, width: 1.4),
        ),
        errorStyle: AppTextStyles.cardMeta.copyWith(color: AppColors.danger, fontSize: 11),
      ),
    );
  }
}