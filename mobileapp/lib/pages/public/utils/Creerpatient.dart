import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/gestures.dart';

/// ============================================================
/// PALETTE — reprise des variables CSS de ui-mobile.html
/// ============================================================
class ApsColors {
  static const green900 = Color(0xFF0F3A2B);
  static const green700 = Color(0xFF1E8A63);
  static const green600 = Color(0xFF279A6E);
  static const green500 = Color(0xFF2FAB7B);
  static const green100 = Color(0xFFE4F3EC);
  static const green50 = Color(0xFFF1F8F4);

  static const coral500 = Color(0xFFE1604A);
  static const coral600 = Color(0xFFC94E3A);
  static const coral100 = Color(0xFFFBE7E2);

  static const ink = Color(0xFF16241F);
  static const inkSoft = Color(0xFF5B6B64);
  static const inkFaint = Color(0xFF93A39C);

  static const paper = Color(0xFFF5F8F6);
  static const card = Color(0xFFFFFFFF);
  static const line = Color(0xFFE5ECE8);
  static const lineStrong = Color(0xFFD3DFD9);
}

/// Liste de pays simplifiée pour le sélecteur "Pays"
const List<String> _paysList = [
  'Cameroun',
  'Tchad',
  'Congo',
  'Gabon',
  'République centrafricaine',
  'Guinée équatoriale',
  'Nigéria',
  'France',
  'Autre',
];

/// ============================================================
/// ÉCRAN — Créer un compte patient (Q1)
/// ============================================================
class CreerPatientPage extends StatefulWidget {
  const CreerPatientPage({super.key});

  @override
  State<CreerPatientPage> createState() => _CreerPatientPageState();
}

class _CreerPatientPageState extends State<CreerPatientPage> {
  final _formKey = GlobalKey<FormState>();

  final _prenomCtrl = TextEditingController();
  final _nomCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _telephoneCtrl = TextEditingController();
  final _motDePasseCtrl = TextEditingController();

  DateTime? _dateNaissance;
  String? _pays;
  bool _accepteConditions = false;
  bool _obscurePassword = true;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _prenomCtrl.dispose();
    _nomCtrl.dispose();
    _emailCtrl.dispose();
    _telephoneCtrl.dispose();
    _motDePasseCtrl.dispose();
    super.dispose();
  }

  String get _dateNaissanceLabel {
    if (_dateNaissance == null) return '';
    final d = _dateNaissance!;
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
  }

  Future<void> _pickDateNaissance() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 25, now.month, now.day),
      firstDate: DateTime(now.year - 120),
      lastDate: now,
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: ApsColors.green700,
              onPrimary: Colors.white,
              onSurface: ApsColors.ink,
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      setState(() => _dateNaissance = picked);
    }
  }

  Future<void> _onSubmit() async {
    final formOk = _formKey.currentState?.validate() ?? false;
    if (_dateNaissance == null) {
      _showSnack('Merci de renseigner votre date de naissance.');
      return;
    }
    if (_pays == null) {
      _showSnack('Merci de sélectionner votre pays.');
      return;
    }
    if (!_accepteConditions) {
      _showSnack(
        "Merci d'accepter les conditions d'utilisation et la politique de confidentialité.",
      );
      return;
    }
    if (!formOk) return;

    setState(() => _isSubmitting = true);

    // TODO: brancher ici l'appel API réel de création de compte patient.
    // Exemple :
    // await AuthService.creerCompteMedecin(...)
    await Future.delayed(const Duration(seconds: 1));

    if (!mounted) return;
    setState(() => _isSubmitting = false);

    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => CreationConfirmationPage(
          prenom: _prenomCtrl.text.trim(),
          nom: _nomCtrl.text.trim(),
          email: _emailCtrl.text.trim(),
          pays: _pays!,
        ),
      ),
    );
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: ApsColors.coral600,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ApsColors.paper,
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 32),
            children: [
              _TopLine(),
              const SizedBox(height: 18),
              _TitleBlock(),
              const SizedBox(height: 18),

              _FormField(
                label: 'Prénom',
                required: true,
                child: _AppTextField(
                  controller: _prenomCtrl,
                  hint: 'Ex. Aïcha',
                  textCapitalization: TextCapitalization.words,
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? 'Le prénom est requis.'
                      : null,
                ),
              ),
              _FormField(
                label: 'Nom',
                required: true,
                child: _AppTextField(
                  controller: _nomCtrl,
                  hint: 'Ex. Talla',
                  textCapitalization: TextCapitalization.words,
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? 'Le nom est requis.'
                      : null,
                ),
              ),
              _FormField(
                label: 'E-mail',
                required: true,
                child: _AppTextField(
                  controller: _emailCtrl,
                  hint: 'vous@exemple.cm',
                  keyboardType: TextInputType.emailAddress,
                  validator: (v) {
                    if (v == null || v.trim().isEmpty) {
                      return "L'e-mail est requis.";
                    }
                    final regex = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
                    if (!regex.hasMatch(v.trim())) {
                      return 'E-mail invalide.';
                    }
                    return null;
                  },
                ),
              ),
              _FormField(
                label: 'Téléphone',
                requiredLabel: '(facultatif)',
                child: _AppTextField(
                  controller: _telephoneCtrl,
                  hint: '+237 6 XX XX XX XX',
                  keyboardType: TextInputType.phone,
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s]')),
                  ],
                ),
              ),
              _FormField(
                label: 'Mot de passe',
                required: true,
                hint: 'Au moins 8 caractères. Vous vous en servirez pour vous reconnecter.',
                child: _AppTextField(
                  controller: _motDePasseCtrl,
                  hint: '8 caractères minimum',
                  obscureText: _obscurePassword,
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscurePassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                      color: ApsColors.inkFaint,
                      size: 20,
                    ),
                    onPressed: () => setState(
                            () => _obscurePassword = !_obscurePassword),
                  ),
                  validator: (v) {
                    if (v == null || v.isEmpty) {
                      return 'Le mot de passe est requis.';
                    }
                    if (v.length < 8) {
                      return 'Minimum 8 caractères.';
                    }
                    return null;
                  },
                ),
              ),
              _FormField(
                label: 'Date de naissance',
                required: true,
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: _pickDateNaissance,
                  child: InputDecorator(
                    decoration: _fieldDecoration(hint: 'jj/mm/aaaa'),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            _dateNaissance == null
                                ? 'jj/mm/aaaa'
                                : _dateNaissanceLabel,
                            style: TextStyle(
                              fontSize: 14,
                              color: _dateNaissance == null
                                  ? ApsColors.inkFaint
                                  : ApsColors.ink,
                              fontWeight: _dateNaissance == null
                                  ? FontWeight.w400
                                  : FontWeight.w500,
                            ),
                          ),
                        ),
                        const Icon(Icons.calendar_today_outlined,
                            size: 18, color: ApsColors.inkFaint),
                      ],
                    ),
                  ),
                ),
              ),
              _FormField(
                label: 'Pays',
                required: true,
                child: DropdownButtonFormField<String>(
                  value: _pays,
                  isExpanded: true,
                  icon: const Icon(Icons.keyboard_arrow_down_rounded,
                      color: ApsColors.inkFaint),
                  decoration: _fieldDecoration(hint: 'Sélectionner…'),
                  hint: const Text(
                    'Sélectionner…',
                    style: TextStyle(fontSize: 14, color: ApsColors.inkFaint),
                  ),
                  style: const TextStyle(
                    fontSize: 14,
                    color: ApsColors.ink,
                    fontWeight: FontWeight.w500,
                  ),
                  items: _paysList
                      .map((p) => DropdownMenuItem(value: p, child: Text(p)))
                      .toList(),
                  onChanged: (v) => setState(() => _pays = v),
                ),
              ),

              const SizedBox(height: 6),
              _CheckRow(
                checked: _accepteConditions,
                onChanged: (v) => setState(() => _accepteConditions = v),
                label:
                "J'accepte les conditions d'utilisation et la politique de confidentialité",
              ),

              const SizedBox(height: 20),
              _PrimaryButton(
                label: 'Créer mon compte',
                loading: _isSubmitting,
                onPressed: _onSubmit,
              ),

              const SizedBox(height: 14),
              Center(
                child: RichText(
                  text: TextSpan(
                    style: const TextStyle(
                      fontSize: 11.5,
                      color: ApsColors.inkSoft,
                    ),
                    children: [
                      const TextSpan(text: 'Déjà un compte ? '),
                      TextSpan(
                        text: 'Connectez-vous',
                        style: const TextStyle(
                          color: ApsColors.green700,
                          fontWeight: FontWeight.w700,
                        ),
                        recognizer: TapGestureRecognizer()
                          ..onTap = () {
                            Navigator.of(context).maybePop();
                          },
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

InputDecoration _fieldDecoration({String? hint}) {
  return InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(fontSize: 14, color: ApsColors.inkFaint),
    filled: true,
    fillColor: ApsColors.card,
    contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 13),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: ApsColors.line),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: ApsColors.line),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: ApsColors.green700, width: 1.4),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: ApsColors.coral600),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: ApsColors.coral600, width: 1.4),
    ),
  );
}

/// ============================================================
/// COMPOSANTS RÉUTILISABLES
/// ============================================================

class _TopLine extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        InkWell(
          borderRadius: BorderRadius.circular(100),
          onTap: () => Navigator.of(context).maybePop(),
          child: Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: ApsColors.card,
              shape: BoxShape.circle,
              border: Border.all(color: ApsColors.line),
            ),
            child: const Icon(Icons.arrow_back, size: 18, color: ApsColors.ink),
          ),
        ),
        const SizedBox(width: 12),
        Text(
          'COMPTE PATIENT',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.06,
            color: ApsColors.inkFaint,
          ),
        ),
      ],
    );
  }
}

class _TitleBlock extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'ESPACE PATIENT',
          style: TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.0,
            color: ApsColors.green700,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Créez votre compte',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: ApsColors.ink,
            height: 1.2,
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          "Ces informations servent à vous identifier et à instruire vos "
              "demandes de rendez-vous. Ça prend moins d'une minute.",
          style: TextStyle(
            fontSize: 12.5,
            color: ApsColors.inkSoft,
            height: 1.5,
          ),
        ),
      ],
    );
  }
}

class _FormField extends StatelessWidget {
  final String label;
  final bool required;
  final String? requiredLabel;
  final String? hint;
  final Widget child;

  const _FormField({
    required this.label,
    required this.child,
    this.required = false,
    this.requiredLabel,
    this.hint,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          RichText(
            text: TextSpan(
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: ApsColors.ink,
              ),
              children: [
                TextSpan(text: label),
                if (required)
                  const TextSpan(
                    text: ' *',
                    style: TextStyle(
                      color: ApsColors.coral600,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                if (requiredLabel != null)
                  TextSpan(
                    text: ' $requiredLabel',
                    style: const TextStyle(
                      color: ApsColors.inkFaint,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          child,
          if (hint != null) ...[
            const SizedBox(height: 5),
            Text(
              hint!,
              style: const TextStyle(fontSize: 11.5, color: ApsColors.inkSoft),
            ),
          ],
        ],
      ),
    );
  }
}

class _AppTextField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextCapitalization textCapitalization;
  final List<TextInputFormatter>? inputFormatters;
  final Widget? suffixIcon;
  final String? Function(String?)? validator;

  const _AppTextField({
    required this.controller,
    required this.hint,
    this.obscureText = false,
    this.keyboardType,
    this.textCapitalization = TextCapitalization.none,
    this.inputFormatters,
    this.suffixIcon,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      obscureText: obscureText,
      keyboardType: keyboardType,
      textCapitalization: textCapitalization,
      inputFormatters: inputFormatters,
      validator: validator,
      style: const TextStyle(
        fontSize: 14,
        color: ApsColors.ink,
        fontWeight: FontWeight.w500,
      ),
      decoration: _fieldDecoration(hint: hint).copyWith(suffixIcon: suffixIcon),
    );
  }
}

class _CheckRow extends StatelessWidget {
  final bool checked;
  final ValueChanged<bool> onChanged;
  final String label;

  const _CheckRow({
    required this.checked,
    required this.onChanged,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => onChanged(!checked),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: checked ? ApsColors.green50 : ApsColors.card,
          border: Border.all(
            color: checked ? ApsColors.green500 : ApsColors.line,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 20,
              height: 20,
              margin: const EdgeInsets.only(top: 1),
              decoration: BoxDecoration(
                color: checked ? ApsColors.green700 : Colors.transparent,
                border: Border.all(
                  color: checked ? ApsColors.green700 : ApsColors.lineStrong,
                  width: 1.4,
                ),
                borderRadius: BorderRadius.circular(6),
              ),
              child: checked
                  ? const Icon(Icons.check, size: 14, color: Colors.white)
                  : null,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 12.5,
                  color: ApsColors.ink,
                  height: 1.4,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  final String label;
  final bool loading;
  final VoidCallback onPressed;

  const _PrimaryButton({
    required this.label,
    required this.onPressed,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: loading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: ApsColors.green700,
          disabledBackgroundColor: ApsColors.green700.withOpacity(0.7),
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 0,
        ),
        child: loading
            ? const SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(
            strokeWidth: 2.2,
            valueColor: AlwaysStoppedAnimation(Colors.white),
          ),
        )
            : Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              label,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(width: 8),
            const Icon(Icons.arrow_forward, size: 18),
          ],
        ),
      ),
    );
  }
}

/// ============================================================
/// ÉCRAN — Confirmation de création (Q2)
/// ============================================================
class CreationConfirmationPage extends StatelessWidget {
  final String prenom;
  final String nom;
  final String email;
  final String pays;

  const CreationConfirmationPage({
    super.key,
    required this.prenom,
    required this.nom,
    required this.email,
    required this.pays,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ApsColors.paper,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 40, 18, 24),
          children: [
            Center(
              child: Container(
                width: 64,
                height: 64,
                decoration: const BoxDecoration(
                  color: ApsColors.green100,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check_circle_outline,
                    color: ApsColors.green700, size: 32),
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              'Bienvenue sur APS 🎉',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.w700,
                color: ApsColors.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Merci $prenom ! Votre compte patient est prêt. Vous pouvez dès '
                  'maintenant chercher un médecin, réserver un créneau et suivre '
                  'vos rendez-vous.',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13,
                color: ApsColors.inkSoft,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 22),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: ApsColors.card,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: ApsColors.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: const BoxDecoration(
                          color: ApsColors.green100,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.person_outline,
                            color: ApsColors.green700, size: 20),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '$prenom $nom',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: ApsColors.ink,
                              ),
                            ),
                            Text(
                              'Compte patient · $pays',
                              style: const TextStyle(
                                fontSize: 11.5,
                                color: ApsColors.inkSoft,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 24, color: ApsColors.line),
                  _KeyValueRow(label: 'E-mail', value: email),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Statut du compte',
                          style: TextStyle(
                              fontSize: 12.5, color: ApsColors.inkSoft)),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: ApsColors.green100,
                          borderRadius: BorderRadius.circular(100),
                        ),
                        child: const Text(
                          'Actif',
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                            color: ApsColors.green700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            _PrimaryButton(
              label: 'Aller à mon espace patient',
              onPressed: () {
                // TODO: naviguer vers l'accueil de l'espace patient.
              },
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => Navigator.of(context)
                    .popUntil((route) => route.isFirst),
                style: OutlinedButton.styleFrom(
                  foregroundColor: ApsColors.ink,
                  side: const BorderSide(color: ApsColors.lineStrong),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  "Retour à l'accueil",
                  style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _KeyValueRow extends StatelessWidget {
  final String label;
  final String value;

  const _KeyValueRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: const TextStyle(fontSize: 12.5, color: ApsColors.inkSoft)),
        Text(
          value,
          style: const TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: ApsColors.ink,
            fontFamily: 'monospace',
          ),
        ),
      ],
    );
  }
}