// Stepper réutilisable pour les parcours de création « espace professionnel ».
//
// Extrait de `pages/public/utils/createmedecinpage.dart` (où toutes ces
// briques étaient privées et figées à 6 étapes) pour être partagé par les
// parcours assurance, pharmacie et centre de santé. Le rendu (cercles reliés,
// halo vert sur l'étape courante, champs, zones de dépôt de fichier) reste
// identique à celui de la page médecin.
//
// Utilisation typique :
//
// ```dart
// class _MonEcranState extends ConsumerState<MonEcran>
//     with ApsStepperStateMixin<MonEcran> {
//   @override
//   int get stepCount => 5;
//
//   @override
//   Widget build(BuildContext context) {
//     return ApsStepperFlow(
//       controller: pageController,
//       currentStep: currentStep,
//       stepCount: stepCount,
//       onBack: onBackPressed,
//       steps: [_etape1(), _etape2(), ...],
//       successPage: _ecranSucces(),
//     );
//   }
// }
// ```
//
// Tous les widgets sont préfixés `Aps` pour ne pas entrer en collision avec
// `Stepper` / `Step` de Material ni avec d'autres classes de l'app, ce
// fichier étant ré-exporté par `components.dart`.
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../buttons/app_buttons.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';

// ========================================================================
// État de navigation entre étapes (mixin à appliquer à un State)
// ========================================================================

/// Porte la navigation d'un parcours multi-étapes : [PageController],
/// index de l'étape courante, retour arrière et affichage d'erreurs.
///
/// Le State hôte fournit uniquement [stepCount] (nombre d'étapes de saisie,
/// sans compter l'écran de succès éventuel).
mixin ApsStepperStateMixin<T extends StatefulWidget> on State<T> {
  /// Nombre d'étapes de saisie (hors écran de succès).
  int get stepCount;

  final PageController pageController = PageController();

  /// Index (base 0) de l'étape affichée.
  int currentStep = 0;

  /// Affiche l'étape [step] (base 0) avec la même animation que la page
  /// médecin. L'écran de succès correspond à l'index [stepCount].
  void goToStep(int step) {
    setState(() => currentStep = step);
    pageController.animateToPage(
      step,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
    );
  }

  /// Retour : étape précédente, ou fermeture de l'écran sur la première.
  void onBackPressed() {
    if (currentStep == 0) {
      Navigator.of(context).maybePop();
    } else {
      goToStep(currentStep - 1);
    }
  }

  /// Passe à l'étape suivante (sans validation : à faire côté appelant).
  void goToNextStep() => goToStep(currentStep + 1);

  void showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.dangerDark),
    );
  }

  @override
  void dispose() {
    pageController.dispose();
    super.dispose();
  }
}

// ========================================================================
// Structure d'ensemble : PageView + scaffold d'étape
// ========================================================================

/// Écran complet d'un parcours : un [PageView] non balayable, une page par
/// étape de [steps] (chacune enveloppée dans [ApsStepScaffold]) puis, en
/// option, [successPage] (page finale, hors numérotation).
class ApsStepperFlow extends StatelessWidget {
  const ApsStepperFlow({
    super.key,
    required this.controller,
    required this.currentStep,
    required this.stepCount,
    required this.onBack,
    required this.steps,
    this.successPage,
  }) : assert(steps.length == stepCount,
  'steps.length doit être égal à stepCount');

  final PageController controller;
  final int currentStep;
  final int stepCount;
  final VoidCallback onBack;
  final List<Widget> steps;

  /// Page affichée après la dernière étape (écran de confirmation
  /// d'envoi). Doit gérer elle-même son défilement.
  final Widget? successPage;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: PageView(
          controller: controller,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            for (var i = 0; i < steps.length; i++)
              ApsStepScaffold(
                stepIndex: i,
                stepCount: stepCount,
                onBack: onBack,
                child: steps[i],
              ),
            if (successPage != null) successPage!,
          ],
        ),
      ),
    );
  }
}

/// Structure commune d'une étape : ligne « ← ÉTAPE n / N », pastilles de
/// progression puis contenu défilant.
class ApsStepScaffold extends StatelessWidget {
  const ApsStepScaffold({
    super.key,
    required this.stepIndex,
    required this.stepCount,
    required this.onBack,
    required this.child,
  });

  final int stepIndex;
  final int stepCount;
  final VoidCallback onBack;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ApsStepTopline(
              stepIndex: stepIndex, stepCount: stepCount, onBack: onBack),
          ApsStepperDots(currentIndex: stepIndex, stepCount: stepCount),
          const SizedBox(height: 2),
          child,
        ],
      ),
    );
  }
}

class ApsStepTopline extends StatelessWidget {
  const ApsStepTopline({
    super.key,
    required this.stepIndex,
    required this.stepCount,
    required this.onBack,
  });

  final int stepIndex;
  final int stepCount;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14, top: 6),
      child: Row(
        children: [
          InkWell(
            onTap: onBack,
            borderRadius: BorderRadius.circular(9),
            child: Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(9),
                border: Border.all(color: AppColors.lineStrong),
              ),
              child: const Icon(Icons.arrow_back_rounded,
                  size: 14, color: AppColors.inkSoft),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            'ÉTAPE ${stepIndex + 1} / $stepCount',
            style: const TextStyle(
              fontFamily: AppTextStyles.fontMono,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppColors.inkFaint,
            ),
          ),
        ],
      ),
    );
  }
}

/// Reproduit `.stepper-mobile` : cercles reliés par des lignes, avec les
/// états terminé (vert plein + check), courant (halo vert) et à venir.
class ApsStepperDots extends StatelessWidget {
  const ApsStepperDots({
    super.key,
    required this.currentIndex,
    required this.stepCount,
    this.allDone = false,
  });

  final int currentIndex;
  final int stepCount;

  /// Force tous les cercles à l'état « terminé » (écran de succès).
  final bool allDone;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: List.generate(stepCount * 2 - 1, (i) {
          if (i.isOdd) {
            final segmentIndex = i ~/ 2;
            final done = allDone || segmentIndex < currentIndex;
            return Expanded(
              child: Container(
                height: 1.5,
                margin: const EdgeInsets.symmetric(horizontal: 1),
                color: done ? AppColors.green600 : AppColors.lineStrong,
              ),
            );
          }
          final index = i ~/ 2;
          final isDone = allDone || index < currentIndex;
          final isCurrent = !allDone && index == currentIndex;
          return _ApsStepCircle(
              number: index + 1, done: isDone, current: isCurrent);
        }),
      ),
    );
  }
}

class _ApsStepCircle extends StatelessWidget {
  const _ApsStepCircle({
    required this.number,
    required this.done,
    required this.current,
  });

  final int number;
  final bool done;
  final bool current;

  @override
  Widget build(BuildContext context) {
    if (done) {
      return Container(
        width: 23,
        height: 23,
        decoration: const BoxDecoration(
            shape: BoxShape.circle, color: AppColors.green600),
        child: const Icon(Icons.check_rounded, size: 12, color: Colors.white),
      );
    }
    return Container(
      width: 23,
      height: 23,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: current ? AppColors.green50 : AppColors.card,
        border: Border.all(
          color: current ? AppColors.green600 : AppColors.lineStrong,
          width: 1.5,
        ),
        boxShadow: current
            ? [
          BoxShadow(
              color: AppColors.green100, blurRadius: 0, spreadRadius: 3)
        ]
            : null,
      ),
      alignment: Alignment.center,
      child: Text(
        '$number',
        style: TextStyle(
          fontFamily: AppTextStyles.fontDisplay,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: current ? AppColors.green700 : AppColors.inkFaint,
        ),
      ),
    );
  }
}

class ApsStepTitle extends StatelessWidget {
  const ApsStepTitle({
    super.key,
    required this.title,
    required this.description,
    this.eyebrow = 'ESPACE PROFESSIONNEL',
  });

  final String title;
  final String description;
  final String eyebrow;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            eyebrow,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: AppColors.green700,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            title,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            description,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontBody,
              fontSize: 12,
              color: AppColors.inkSoft,
              height: 1.55,
            ),
          ),
        ],
      ),
    );
  }
}

/// Actions de bas d'étape (`.step-actions`) : Retour + Continuer.
class ApsStepActions extends StatelessWidget {
  const ApsStepActions({
    super.key,
    required this.onContinue,
    this.onBack,
    this.showBack = true,
    this.loading = false,
    this.continueLabel = 'Continuer',
    this.continueIcon = Icons.arrow_forward_rounded,
  });

  final VoidCallback onContinue;
  final VoidCallback? onBack;
  final bool showBack;
  final bool loading;
  final String continueLabel;
  final IconData continueIcon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          if (showBack && onBack != null) ...[
            SizedBox(
              width: 100,
              child: SecondaryButton(label: 'Retour', onPressed: onBack),
            ),
            const SizedBox(width: 9),
          ],
          Expanded(
            child: PrimaryButton(
              label: continueLabel,
              icon: continueIcon,
              loading: loading,
              onPressed: onContinue,
            ),
          ),
        ],
      ),
    );
  }
}

// ========================================================================
// Champs de formulaire (.form-group / .form-label / .form-input)
// ========================================================================

class ApsFormField extends StatelessWidget {
  const ApsFormField({
    super.key,
    required this.label,
    required this.child,
    this.required = false,
    this.hint,
  });

  final String label;
  final Widget child;
  final bool required;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 7),
            child: RichText(
              text: TextSpan(
                style: const TextStyle(
                  fontFamily: AppTextStyles.fontDisplay,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                ),
                children: [
                  TextSpan(text: label),
                  if (required)
                    const TextSpan(
                        text: ' *', style: TextStyle(color: AppColors.danger)),
                ],
              ),
            ),
          ),
          child,
          if (hint != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                hint!,
                style: const TextStyle(
                  fontFamily: AppTextStyles.fontBody,
                  fontSize: 10.5,
                  color: AppColors.inkFaint,
                  height: 1.5,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

InputDecoration apsInputDecoration(
    {required String hint, bool enabled = true}) {
  OutlineInputBorder border(Color color) => OutlineInputBorder(
    borderRadius: AppRadius.smRadius,
    borderSide: BorderSide(color: color),
  );
  return InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(
      fontFamily: AppTextStyles.fontBody,
      fontSize: 12.5,
      color: AppColors.inkFaint,
    ),
    filled: true,
    fillColor: enabled ? AppColors.card : AppColors.paper,
    contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
    border: border(AppColors.lineStrong),
    enabledBorder: border(AppColors.lineStrong),
    disabledBorder: border(AppColors.lineStrong),
    focusedBorder: border(AppColors.green500),
    errorBorder: border(AppColors.danger),
    focusedErrorBorder: border(AppColors.danger),
    errorStyle: const TextStyle(fontSize: 10.5, color: AppColors.danger),
  );
}

class ApsTextInput extends StatelessWidget {
  const ApsTextInput({
    super.key,
    required this.controller,
    required this.hint,
    this.keyboardType,
    this.validator,
    this.inputFormatters,
    this.textCapitalization = TextCapitalization.none,
  });

  final TextEditingController controller;
  final String hint;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;
  final List<TextInputFormatter>? inputFormatters;
  final TextCapitalization textCapitalization;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      validator: validator,
      inputFormatters: inputFormatters,
      textCapitalization: textCapitalization,
      style: const TextStyle(
        fontFamily: AppTextStyles.fontBody,
        fontSize: 12.5,
        color: AppColors.ink,
      ),
      decoration: apsInputDecoration(hint: hint),
    );
  }
}

class ApsTextArea extends StatelessWidget {
  const ApsTextArea({
    super.key,
    required this.controller,
    required this.hint,
    required this.maxLength,
    this.validator,
  });

  final TextEditingController controller;
  final String hint;
  final int maxLength;
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        TextFormField(
          controller: controller,
          minLines: 4,
          maxLines: 8,
          maxLength: maxLength,
          validator: validator,
          style: const TextStyle(
            fontFamily: AppTextStyles.fontBody,
            fontSize: 12.5,
            color: AppColors.ink,
            height: 1.55,
          ),
          decoration: apsInputDecoration(hint: hint).copyWith(counterText: ''),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 5),
          child: ValueListenableBuilder<TextEditingValue>(
            valueListenable: controller,
            builder: (_, value, __) => Text(
              '${value.text.length} / $maxLength',
              style: const TextStyle(
                fontFamily: AppTextStyles.fontMono,
                fontSize: 10,
                color: AppColors.inkFaint,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Dropdown générique. [itemLabel] permet d'afficher un libellé différent de
/// `toString()` (ex. valeur = identifiant, libellé = nom).
class ApsDropdown<T> extends StatelessWidget {
  const ApsDropdown({
    super.key,
    required this.value,
    required this.hint,
    required this.items,
    required this.onChanged,
    this.enabled = true,
    this.itemLabel,
  });

  final T? value;
  final String hint;
  final List<T> items;
  final ValueChanged<T?> onChanged;
  final bool enabled;
  final String Function(T item)? itemLabel;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<T>(
      // `value` (et non `initialValue`) : la valeur doit suivre les
      // réinitialisations faites par le parent (ex. ville remise à zéro
      // quand le pays change).
      // ignore: deprecated_member_use
      value: value,
      isExpanded: true,
      icon: Icon(Icons.keyboard_arrow_down_rounded,
          color: enabled ? AppColors.inkSoft : AppColors.inkFaint),
      style: const TextStyle(
        fontFamily: AppTextStyles.fontBody,
        fontSize: 12.5,
        color: AppColors.ink,
      ),
      decoration: apsInputDecoration(hint: hint, enabled: enabled),
      hint: Text(
        hint,
        style: const TextStyle(
          fontFamily: AppTextStyles.fontBody,
          fontSize: 12.5,
          color: AppColors.inkFaint,
        ),
      ),
      items: items
          .map((item) => DropdownMenuItem<T>(
        value: item,
        child: Text(itemLabel != null ? itemLabel!(item) : '$item'),
      ))
          .toList(),
      onChanged: enabled ? onChanged : null,
    );
  }
}

/// Case à cocher pleine largeur (`.check-row`).
class ApsCheckRow extends StatelessWidget {
  const ApsCheckRow({
    super.key,
    required this.label,
    required this.checked,
    required this.onTap,
  });

  final String label;
  final bool checked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: AppRadius.smRadius,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.paper,
          border: Border.all(color: AppColors.line),
          borderRadius: AppRadius.smRadius,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 19,
              height: 19,
              decoration: BoxDecoration(
                color: checked ? AppColors.green600 : AppColors.card,
                border: Border.all(
                    color: checked ? AppColors.green600 : AppColors.lineStrong,
                    width: 1.5),
                borderRadius: BorderRadius.circular(6),
              ),
              child: checked
                  ? const Icon(Icons.check_rounded,
                  size: 12, color: Colors.white)
                  : null,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontFamily: AppTextStyles.fontDisplay,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.ink,
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

// ========================================================================
// Fichiers : sélection (file_picker) + zone de dépôt (.upload-zone)
// ========================================================================

/// Fichier choisi par l'utilisateur, prêt à être envoyé en multipart.
class ApsFichier {
  const ApsFichier({required this.octets, required this.nom});

  final Uint8List octets;
  final String nom;

  String get tailleLisible {
    final ko = octets.length / 1024;
    if (ko < 1024) return '${ko.toStringAsFixed(0)} Ko';
    return '${(ko / 1024).toStringAsFixed(1)} Mo';
  }
}

/// Erreur de sélection de fichier dont le message est affichable tel quel.
class ApsFichierException implements Exception {
  const ApsFichierException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Ouvre le sélecteur de fichiers et renvoie le fichier choisi, ou `null`
/// si l'utilisateur annule. Lève [ApsFichierException] si le fichier est
/// illisible ou dépasse [tailleMaxMo].
///
/// Même API `file_picker` v12 que `createmedecinpage.dart` : `pickFiles()`
/// renvoie directement une `List<PlatformFile>` (vide si annulation) et les
/// octets se lisent via `readAsBytes()`.
Future<ApsFichier?> apsChoisirFichier({
  List<String> extensions = const ['pdf', 'jpg', 'jpeg', 'png'],
  int tailleMaxMo = 5,
}) async {
  final List<PlatformFile> fichiers = await FilePicker.pickFiles(
    type: FileType.custom,
    allowedExtensions: extensions,
  );
  if (fichiers.isEmpty) return null;

  final fichier = fichiers.single;

  final Uint8List bytes;
  try {
    bytes = await fichier.readAsBytes();
  } catch (_) {
    throw const ApsFichierException('Impossible de lire ce fichier. Réessayez.');
  }

  if (bytes.length > tailleMaxMo * 1024 * 1024) {
    throw ApsFichierException(
        'Le fichier dépasse la taille maximale de $tailleMaxMo Mo.');
  }
  return ApsFichier(octets: bytes, nom: fichier.name);
}

/// Zone de téléversement d'un justificatif ou d'une image.
class ApsUploadZone extends StatelessWidget {
  const ApsUploadZone({
    super.key,
    required this.fichier,
    required this.onTap,
    required this.onRemove,
    this.title = 'Choisir un fichier',
    this.hint = 'PDF, JPG, PNG — 5 Mo max',
    this.icon = Icons.description_outlined,
  });

  final ApsFichier? fichier;
  final VoidCallback onTap;
  final VoidCallback onRemove;
  final String title;
  final String hint;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final f = fichier;
    if (f != null) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        decoration: BoxDecoration(
          color: AppColors.green50,
          border: Border.all(color: AppColors.green500, width: 1.5),
          borderRadius: AppRadius.mdRadius,
        ),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                  color: AppColors.green100,
                  borderRadius: BorderRadius.circular(11)),
              child: Icon(icon, color: AppColors.green700, size: 17),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(f.nom,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontFamily: AppTextStyles.fontDisplay,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      )),
                  const SizedBox(height: 2),
                  Text('✓ Ajouté — ${f.tailleLisible}',
                      style: const TextStyle(
                        fontFamily: AppTextStyles.fontBody,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.green700,
                      )),
                ],
              ),
            ),
            InkWell(
              onTap: onRemove,
              child: const Padding(
                padding: EdgeInsets.all(4),
                child: Icon(Icons.close_rounded,
                    size: 15, color: AppColors.inkFaint),
              ),
            ),
          ],
        ),
      );
    }

    return InkWell(
      onTap: onTap,
      borderRadius: AppRadius.mdRadius,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 20),
        decoration: BoxDecoration(
          color: AppColors.paper,
          borderRadius: AppRadius.mdRadius,
          border: Border.all(color: AppColors.lineStrong, width: 1.5),
        ),
        child: Column(
          children: [
            Container(
              width: 38,
              height: 38,
              margin: const EdgeInsets.only(bottom: 10),
              decoration: BoxDecoration(
                color: AppColors.card,
                border: Border.all(color: AppColors.line),
                borderRadius: BorderRadius.circular(11),
              ),
              child: const Icon(Icons.upload_rounded,
                  color: AppColors.inkSoft, size: 17),
            ),
            Text(title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontFamily: AppTextStyles.fontDisplay,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                )),
            const SizedBox(height: 3),
            Text(hint,
                style: const TextStyle(
                  fontFamily: AppTextStyles.fontBody,
                  fontSize: 10.5,
                  color: AppColors.inkFaint,
                )),
          ],
        ),
      ),
    );
  }
}

// ========================================================================
// Bannières
// ========================================================================

/// Bandeau d'information (`.banner-info`) ou d'erreur.
class ApsBanner extends StatelessWidget {
  const ApsBanner({
    super.key,
    required this.message,
    this.error = false,
    this.icon,
  });

  final String message;
  final bool error;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final color = error ? AppColors.danger : AppColors.green700;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: error ? const Color(0xFFFDF0EE) : AppColors.green50,
        border: Border.all(
            color: error ? AppColors.danger : AppColors.green100, width: 1),
        borderRadius: AppRadius.smRadius,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
              icon ??
                  (error
                      ? Icons.error_outline_rounded
                      : Icons.info_outline_rounded),
              size: 15,
              color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                fontFamily: AppTextStyles.fontBody,
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: color,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ========================================================================
// Confirmation : résumé et écran de succès
// ========================================================================

/// Carte « Résumé de votre demande » de l'étape de confirmation.
class ApsSummaryCard extends StatelessWidget {
  const ApsSummaryCard({super.key, required this.title, required this.rows});

  final String title;
  final List<ApsSummaryRow> rows;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.line),
        borderRadius: AppRadius.mdRadius,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                fontFamily: AppTextStyles.fontDisplay,
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: AppColors.ink,
              )),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: ApsDashedDivider(),
          ),
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const SizedBox(height: 9),
            rows[i],
          ],
        ],
      ),
    );
  }
}

/// Ligne libellé / valeur (`.summary-row`).
class ApsSummaryRow extends StatelessWidget {
  const ApsSummaryRow({
    super.key,
    required this.label,
    required this.value,
    this.mono = false,
  });

  final String label;
  final String value;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontBody,
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: AppColors.inkFaint,
            )),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            value.isEmpty ? '—' : value,
            textAlign: TextAlign.end,
            style: TextStyle(
              fontFamily: mono ? AppTextStyles.fontMono : AppTextStyles.fontBody,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: AppColors.ink,
            ),
          ),
        ),
      ],
    );
  }
}

class ApsDashedDivider extends StatelessWidget {
  const ApsDashedDivider({super.key});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const dashWidth = 4.0;
        const dashSpace = 3.0;
        final count = (constraints.maxWidth / (dashWidth + dashSpace)).floor();
        return Row(
          children: List.generate(count, (_) {
            return const Padding(
              padding: EdgeInsets.only(right: dashSpace),
              child: SizedBox(
                width: dashWidth,
                height: 1,
                child: ColoredBox(color: AppColors.line),
              ),
            );
          }),
        );
      },
    );
  }
}

/// En-tête de l'écran de succès : pastilles toutes terminées, grand check,
/// titre et sous-titre.
class ApsSuccessHeader extends StatelessWidget {
  const ApsSuccessHeader({
    super.key,
    required this.stepCount,
    required this.title,
    required this.subtitle,
  });

  final int stepCount;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ApsStepperDots(
            currentIndex: stepCount - 1, stepCount: stepCount, allDone: true),
        const SizedBox(height: 12),
        Container(
          width: 82,
          height: 82,
          margin: const EdgeInsets.only(bottom: 20),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: AppColors.green100,
            border: Border.all(
                color: AppColors.green500.withOpacity(0.35), width: 2),
          ),
          child: Center(
            child: Container(
              width: 60,
              height: 60,
              decoration: const BoxDecoration(
                  shape: BoxShape.circle, color: AppColors.green100),
              child: const Icon(Icons.check_rounded,
                  color: AppColors.green700, size: 36),
            ),
          ),
        ),
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontFamily: AppTextStyles.fontDisplay,
            fontSize: 19,
            fontWeight: FontWeight.w800,
            color: AppColors.ink,
            letterSpacing: -0.2,
          ),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            subtitle,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontBody,
              fontSize: 12.5,
              color: AppColors.inkSoft,
              height: 1.65,
            ),
          ),
        ),
        const SizedBox(height: 22),
      ],
    );
  }
}

/// Bloc « Identifiants de l'agent responsable » de l'écran de succès. Le
/// mot de passe temporaire n'est renvoyé qu'une seule fois par le serveur :
/// bouton de copie pour ne pas avoir à le laisser affiché.
class ApsCredentialsCard extends StatelessWidget {
  const ApsCredentialsCard({
    super.key,
    required this.email,
    required this.motDePasseTemporaire,
    this.title = "Identifiants de l'agent responsable",
  });

  final String email;
  final String? motDePasseTemporaire;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.line),
        borderRadius: AppRadius.mdRadius,
        boxShadow: AppColors.shadowCard,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.shield_outlined,
                  size: 15, color: AppColors.green700),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  '$title — à conserver précieusement',
                  style: const TextStyle(
                    fontFamily: AppTextStyles.fontDisplay,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink,
                  ),
                ),
              ),
            ],
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: ApsDashedDivider(),
          ),
          _ApsCopyRow(label: 'Identifiant', value: email, copiedLabel: 'Identifiant copié.'),
          if (motDePasseTemporaire != null &&
              motDePasseTemporaire!.isNotEmpty) ...[
            const SizedBox(height: 9),
            _ApsCopyRow(
              label: 'Mot de passe temporaire',
              value: motDePasseTemporaire!,
              copiedLabel: 'Mot de passe copié.',
            ),
            const SizedBox(height: 10),
            const Text(
              "Ce mot de passe n'est affiché qu'une seule fois. Transmettez-le "
                  "à l'agent concerné : il devra le changer à sa première connexion.",
              style: TextStyle(
                fontFamily: AppTextStyles.fontBody,
                fontSize: 10.5,
                color: AppColors.inkFaint,
                height: 1.5,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ApsCopyRow extends StatelessWidget {
  const _ApsCopyRow({
    required this.label,
    required this.value,
    required this.copiedLabel,
  });

  final String label;
  final String value;
  final String copiedLabel;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontBody,
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: AppColors.inkFaint,
            )),
        const SizedBox(width: 12),
        Flexible(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: Text(
                  value,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: AppTextStyles.fontMono,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              InkWell(
                onTap: () {
                  Clipboard.setData(ClipboardData(text: value));
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(copiedLabel)),
                  );
                },
                child: const Icon(Icons.copy_rounded,
                    size: 14, color: AppColors.green700),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Ligne « Et maintenant ? » de l'écran de succès.
class ApsSuccessNextItem extends StatelessWidget {
  const ApsSuccessNextItem({
    super.key,
    required this.icon,
    required this.title,
    required this.description,
    this.showDivider = true,
  });

  final IconData icon;
  final String title;
  final String description;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: showDivider
            ? const Border(bottom: BorderSide(color: AppColors.line, width: 1))
            : null,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
                color: AppColors.green100,
                borderRadius: BorderRadius.circular(8)),
            child: Icon(icon, size: 13, color: AppColors.green700),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                      fontFamily: AppTextStyles.fontDisplay,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                    )),
                const SizedBox(height: 2),
                Text(description,
                    style: const TextStyle(
                      fontFamily: AppTextStyles.fontBody,
                      fontSize: 11,
                      color: AppColors.inkSoft,
                      height: 1.5,
                    )),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ========================================================================
// Validateurs et utilitaires (mêmes règles que le web)
// ========================================================================

final RegExp _apsEmailRegExp = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

/// Champ requis (non vide après `trim`).
String? apsRequired(String? value) {
  if (value == null || value.trim().isEmpty) return 'Champ requis';
  return null;
}

/// E-mail requis et bien formé (même regex que le web).
String? apsEmail(String? value) {
  if (value == null || value.trim().isEmpty) return 'Champ requis';
  if (!_apsEmailRegExp.hasMatch(value.trim())) return 'E-mail invalide';
  return null;
}

/// Lit une coordonnée saisie (virgule ou point décimal). Renvoie `null`
/// si le champ est vide ; lève [FormatException] s'il n'est pas numérique.
double? apsParseCoordonnee(String? texte) {
  final t = texte?.trim() ?? '';
  if (t.isEmpty) return null;
  final valeur = double.tryParse(t.replaceAll(',', '.'));
  if (valeur == null) throw FormatException('Coordonnée invalide : $t');
  return valeur;
}

/// Contrôle commun latitude / longitude des étapes de localisation :
/// renseignées ensemble (ou vides toutes les deux), numériques et dans les
/// bornes GPS. Renvoie le message d'erreur à afficher, ou `null` si OK.
String? apsValiderCoordonnees(String latitude, String longitude) {
  final lat = latitude.trim();
  final lng = longitude.trim();
  if (lat.isEmpty != lng.isEmpty) {
    return 'Latitude et longitude doivent être renseignées ensemble '
        '(ou laissées vides toutes les deux).';
  }
  if (lat.isEmpty) return null;
  final la = double.tryParse(lat.replaceAll(',', '.'));
  final lo = double.tryParse(lng.replaceAll(',', '.'));
  if (la == null || lo == null) {
    return 'Latitude et longitude doivent être des nombres (ex. 4.0511 et 9.7679).';
  }
  if (la < -90 || la > 90) return 'La latitude doit être comprise entre -90 et 90.';
  if (lo < -180 || lo > 180) {
    return 'La longitude doit être comprise entre -180 et 180.';
  }
  return null;
}

/// Message affichable pour une erreur remontée par un repository. Les
/// exceptions du projet (`ApiException`, `CentreSanteException`…)
/// renvoient directement le message backend via `toString()` ; on retire
/// seulement un éventuel préfixe technique.
String apsMessageErreur(
    Object erreur, {
      String parDefaut =
      "Impossible d'envoyer la demande pour le moment. Merci de réessayer.",
    }) {
  final texte = erreur.toString().trim();
  if (texte.isEmpty || texte.startsWith('Instance of')) return parDefaut;
  return texte.replaceFirst(
      RegExp(r'^(Exception|ApiException(\(\d+\))?):\s*'), '');
}

// ========================================================================
// Corps d'étape prêt à l'emploi
// ========================================================================

/// Corps standard d'une étape : titre + description, [children] (les
/// champs), bandeau d'erreur d'étape éventuel, puis actions Retour /
/// Continuer. Évite de répéter cette mise en page dans chaque parcours.
class ApsStepBody extends StatelessWidget {
  const ApsStepBody({
    super.key,
    required this.title,
    required this.description,
    required this.children,
    required this.onContinue,
    this.onBack,
    this.showBack = true,
    this.error,
    this.loading = false,
    this.continueLabel = 'Continuer',
    this.continueIcon = Icons.arrow_forward_rounded,
  });

  final String title;
  final String description;
  final List<Widget> children;
  final VoidCallback onContinue;
  final VoidCallback? onBack;
  final bool showBack;

  /// Message d'erreur de validation de l'étape (même logique que
  /// `stepError` côté web) : affiché juste au-dessus des boutons.
  final String? error;
  final bool loading;
  final String continueLabel;
  final IconData continueIcon;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ApsStepTitle(title: title, description: description),
        ...children,
        if (error != null) ApsBanner(message: error!, error: true),
        ApsStepActions(
          onContinue: onContinue,
          onBack: onBack,
          showBack: showBack,
          loading: loading,
          continueLabel: continueLabel,
          continueIcon: continueIcon,
        ),
      ],
    );
  }
}
