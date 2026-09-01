// Parcours d'inscription médecin — « Créer mon compte médecin » (6 étapes).
//
// Reproduit fidèlement la section §11 de la maquette `ui-mobile.html` :
//   P1 Informations · P2 Spécialité & Ordre · P3 Biographie ·
//   P4 Justificatifs · P5 Trésorerie · P6 Confirmation
//
// Consomme les vraies APIs exposées par `medecin_controller.dart` /
// `medecin_repository.dart` (POST /medecins, en miroir de
// src/controllers/medecin.controller.js côté backend) :
//   - **Spécialités** (étape 2) : GET /specialites via
//     [listeSpecialitesControllerProvider] — la liste statique codée en
//     dur a été remplacée par le référentiel réel.
//   - **Vérification ONMC** (étape 2, optionnelle) :
//     POST /medecins/verifier-ordre via
//     [MedecinRepository.verifierAppartenanceOrdre] — pré-validation du
//     numéro d'ordre avant soumission, ne bloque pas la suite du
//     parcours si l'ONMC est injoignable (statusCode 502).
//   - **Justificatifs** (étape 4) : sélection réelle de fichiers via
//     `file_picker` (CNI + attestation obligatoires, photo facultative
//     à l'étape 1), transmis en octets à [CreerMedecinPayload] /
//     [CreationMedecinController.soumettre].
//   - **Soumission finale** : POST /medecins via
//     [creationMedecinControllerProvider] — le mot de passe temporaire
//     du compte créé n'est affiché qu'une seule fois à l'étape 6 (voir
//     [UtilisateurCreeMedecin] côté modèles), puis le controller est
//     réinitialisé à la fermeture de l'écran pour ne pas le laisser
//     traîner en mémoire.
//
// ⚠️ Étape 5 « Trésorerie » : aucun champ de POST /medecins ne porte de
// coordonnées bancaires/mobile money (voir CreerMedecinPayload côté
// modèles — ces informations relèvent d'un module « Moyens de
// paiement » séparé, hors périmètre de medecin_models.dart /
// medecin_repository.dart). Les champs restent affichés pour respecter
// la maquette et le parcours utilisateur, mais ne sont PAS envoyés au
// backend : à brancher sur son propre module dès qu'il existera
// (ex. paiement_models.dart / paiement_repository.dart).
//
// ⚠️ Étape 1 « Pays / Ville d'exercice » : le module médecin attend des
// identifiants réels (`pays_id`, `pays_exercice_id`, `ville_exercice_id`)
// provenant du référentiel géographique de l'application (Pays/Ville),
// qui n'est pas fourni dans le périmètre de ces fichiers
// (voir referentiel_models.dart mentionné en commentaire dans
// medecin_models.dart). En l'absence de ce référentiel ici, la liste
// pays/villes reste statique et les identifiants envoyés au backend
// sont dérivés localement (TODO ci-dessous) : à remplacer par un vrai
// picker branché sur le référentiel dès qu'il est disponible.
//
// S'appuie sur le design system déjà défini dans `lib/components/`
// (AppColors, AppTextStyles, AppRadius, PrimaryButton, SecondaryButton)
// afin de rester cohérent avec le reste de l'application.
//
// Dépendance supplémentaire requise dans pubspec.yaml :
//   file_picker: ^8.0.0   (sélection réelle de CNI / attestation / photo)
//
// Utilisation :
// ```dart
// Navigator.of(context).push(
//   MaterialPageRoute(builder: (_) => const CreateMedecinScreen()),
// );
// ```
// Comme pour MedecinPage, ce fichier s'appuie sur un [ProviderContainer]
// explicite (pas de `ProviderScope`/`ConsumerWidget` disponibles ici,
// `medecin_controller.dart` utilisant `package:riverpod/riverpod.dart`
// et non `flutter_riverpod`). Transmettre [CreateMedecinScreen.container]
// explicitement dès qu'un container global existe ailleurs dans l'app.
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// Si votre projet utilise des imports package (ex: package:aps/...),
// remplacez les lignes ci-dessous par les équivalents package:aps/...
import '../../../components/components.dart';
import '../../../controllers/medecin_controller.dart';
import '../../../models/medecin_models.dart';
import '../../../utils/api_client.dart';

/// Container Riverpod de repli, utilisé uniquement si
/// [CreateMedecinScreen.container] n'est pas fourni — voir la note sur
/// `medecinProviderContainer` dans medecinpage.dart : idéalement un
/// seul container existe pour toute l'app.
final ProviderContainer createMedecinProviderContainer = ProviderContainer();

/// Écran complet du parcours d'inscription médecin (6 étapes).
class CreateMedecinScreen extends StatefulWidget {
  const CreateMedecinScreen({
    super.key,
    this.container,
    this.onCompteCree,
  });

  /// Container Riverpod à utiliser. Si `null`, replie sur
  /// [createMedecinProviderContainer].
  final ProviderContainer? container;

  /// Appelé après une création réussie (bouton « Aller à mon espace
  /// médecin » de l'étape 6), avec le résultat complet de POST
  /// /medecins. Laissé injectable : la navigation vers l'espace
  /// médecin dépend du routeur de l'app hôte.
  final ValueChanged<MedecinCreationResultat>? onCompteCree;

  @override
  State<CreateMedecinScreen> createState() => _CreateMedecinScreenState();
}

enum _PaymentMethod { plusTard, mobileMoney, compteBancaire }

/// Type de justificatif géré par [_UploadZone] / [_pickFile].
enum _DocType { cni, attestation, photo }

class _CreateMedecinScreenState extends State<CreateMedecinScreen> {
  static const int _stepCount = 6;

  final PageController _pageController = PageController();
  int _currentStep = 0;

  late final ProviderContainer _container =
      widget.container ?? createMedecinProviderContainer;

  // ---- Spécialités (GET /specialites) ---------------------------------
  late ProviderSubscription<AsyncValue<List<Specialite>>> _specialitesSub;
  AsyncValue<List<Specialite>> _specialitesState = const AsyncLoading();

  // ---- Soumission (POST /medecins) -------------------------------------
  late ProviderSubscription<AsyncValue<MedecinCreationResultat?>>
  _creationSub;
  AsyncValue<MedecinCreationResultat?> _creationState = const AsyncData(null);

  bool get _submitting => _creationState.isLoading;

  // ---- Étape 1 — Informations ----------------------------------------
  final _step1FormKey = GlobalKey<FormState>();
  final _nomCtrl = TextEditingController();
  final _prenomCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _telCtrl = TextEditingController();
  String? _pays;
  String? _ville;

  List<int>? _photoBytes;
  String? _photoFileName;

  // TODO(referentiel): remplacer par un vrai référentiel Pays/Ville
  // (referentiel_models.dart / referentiel_controller.dart, hors
  // périmètre des fichiers fournis) exposant de vrais UUID pays_id /
  // ville_id. En attendant, la map ci-dessous sert à la fois d'affichage
  // ET de source d'identifiants (clé = nom = id local), ce qui NE
  // FONCTIONNERA correctement côté backend QUE si ce référentiel utilise
  // les mêmes libellés comme identifiants — sinon adapter _paysIdDepuis /
  // _villeIdDepuis dès que le vrai référentiel est branché.
  static const Map<String, List<String>> _paysVilles = {
    'Cameroun': ['Douala', 'Yaoundé', 'Garoua', 'Bafoussam', 'Bamenda', 'Maroua'],
    "Côte d'Ivoire": ['Abidjan', 'Bouaké', 'Yamoussoukro'],
    'Sénégal': ['Dakar', 'Thiès', 'Saint-Louis'],
    'Gabon': ['Libreville', 'Port-Gentil'],
  };

  // ---- Étape 2 — Spécialité & Ordre -----------------------------------
  final _step2FormKey = GlobalKey<FormState>();
  final _numeroOrdreCtrl = TextEditingController();
  final _tarifCtrl = TextEditingController();
  Specialite? _specialite;
  bool _teleconsultation = true;

  bool _verifiantOrdre = false;
  VerificationOrdreResultat? _resultatOrdre;
  String? _erreurVerificationOrdre;

  // ---- Étape 3 — Biographie -------------------------------------------
  final _step3FormKey = GlobalKey<FormState>();
  final _bioCtrl = TextEditingController();
  static const int _bioMaxLength = 600;

  // ---- Étape 4 — Justificatifs -----------------------------------------
  List<int>? _cniBytes;
  String? _cniFileName;
  List<int>? _attestationBytes;
  String? _attestationFileName;

  // ---- Étape 5 — Trésorerie --------------------------------------------
  // ⚠️ Non envoyée à POST /medecins — voir en-tête du fichier.
  _PaymentMethod _paymentMethod = _PaymentMethod.plusTard;
  final _banqueCtrl = TextEditingController();
  final _titulaireCtrl = TextEditingController();
  final _compteCtrl = TextEditingController();

  // ---- Étape 6 — Résultat réel de la création ---------------------------
  MedecinCreationResultat? _resultatCreation;

  @override
  void initState() {
    super.initState();

    _specialitesSub = _container.listen<AsyncValue<List<Specialite>>>(
      listeSpecialitesControllerProvider,
          (previous, next) => setState(() => _specialitesState = next),
      fireImmediately: true,
    );

    _creationSub = _container.listen<AsyncValue<MedecinCreationResultat?>>(
      creationMedecinControllerProvider,
          (previous, next) => setState(() => _creationState = next),
      fireImmediately: true,
    );
  }

  @override
  void dispose() {
    _specialitesSub.close();
    _creationSub.close();
    // Le mot de passe temporaire ne doit pas rester en mémoire une fois
    // l'écran quitté (voir la doc de CreationMedecinController.reinitialiser).
    _container.read(creationMedecinControllerProvider.notifier).reinitialiser();
    _pageController.dispose();
    _nomCtrl.dispose();
    _prenomCtrl.dispose();
    _emailCtrl.dispose();
    _telCtrl.dispose();
    _numeroOrdreCtrl.dispose();
    _tarifCtrl.dispose();
    _bioCtrl.dispose();
    _banqueCtrl.dispose();
    _titulaireCtrl.dispose();
    _compteCtrl.dispose();
    super.dispose();
  }

  // ------------------------------------------------------------------
  // Navigation entre étapes
  // ------------------------------------------------------------------

  void _goToStep(int step) {
    setState(() => _currentStep = step);
    _pageController.animateToPage(
      step,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
    );
  }

  void _onBackPressed() {
    if (_currentStep == 0) {
      Navigator.of(context).maybePop();
    } else {
      _goToStep(_currentStep - 1);
    }
  }

  void _onContinuePressed() {
    switch (_currentStep) {
      case 0:
        if (!(_step1FormKey.currentState?.validate() ?? false)) return;
        if (_pays == null || _ville == null) {
          _showError('Merci de sélectionner votre pays et votre ville.');
          return;
        }
        break;
      case 1:
        if (!(_step2FormKey.currentState?.validate() ?? false)) return;
        if (_specialite == null) {
          _showError('Merci de sélectionner votre spécialité.');
          return;
        }
        break;
      case 2:
        if (!(_step3FormKey.currentState?.validate() ?? false)) return;
        break;
      case 3:
        if (_cniBytes == null || _cniFileName == null) {
          _showError("Merci d'ajouter votre pièce d'identité (CNI).");
          return;
        }
        if (_attestationBytes == null || _attestationFileName == null) {
          _showError("Merci d'ajouter votre attestation d'inscription à l'Ordre.");
          return;
        }
        break;
      case 4:
        if (_paymentMethod == _PaymentMethod.compteBancaire) {
          final valid = _banqueCtrl.text.trim().isNotEmpty &&
              _titulaireCtrl.text.trim().isNotEmpty &&
              _compteCtrl.text.trim().isNotEmpty;
          if (!valid) {
            _showError('Merci de compléter vos informations bancaires.');
            return;
          }
        }
        _submitAccount();
        return;
    }
    _goToStep(_currentStep + 1);
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.dangerDark),
    );
  }

  // ------------------------------------------------------------------
  // Soumission — POST /medecins
  // ------------------------------------------------------------------

  Future<void> _submitAccount() async {
    final specialite = _specialite;
    if (specialite == null || _pays == null || _ville == null) return;

    final payload = CreerMedecinPayload(
      nom: _nomCtrl.text.trim(),
      prenom: _prenomCtrl.text.trim(),
      email: _emailCtrl.text.trim(),
      telephone: _telCtrl.text.trim().isEmpty ? null : _telCtrl.text.trim(),
      // TODO(referentiel): remplacer par les vrais pays_id / ville_id
      // (voir la note en tête de fichier).
      paysId: _pays!,
      specialiteId: specialite.specialiteId,
      numeroOrdre: _numeroOrdreCtrl.text.trim(),
      paysExerciceId: _pays!,
      villeExerciceId: _ville!,
      teleconsultationActivee: _teleconsultation,
      tarifIndicatif: double.tryParse(_tarifCtrl.text.trim()) ?? 0,
      biographie: _bioCtrl.text.trim(),
    );

    await _container.read(creationMedecinControllerProvider.notifier).soumettre(
      payload: payload,
      cniOctets: _cniBytes!,
      cniNomFichier: _cniFileName!,
      attestationOctets: _attestationBytes!,
      attestationNomFichier: _attestationFileName!,
      photoOctets: _photoBytes,
      photoNomFichier: _photoFileName,
    );

    if (!mounted) return;

    final etat = _container.read(creationMedecinControllerProvider);
    etat.when(
      data: (resultat) {
        if (resultat == null) return;
        setState(() => _resultatCreation = resultat);
        _goToStep(_stepCount - 1);
      },
      error: (erreur, _) => _showError(_messageErreur(erreur)),
      loading: () {},
    );
  }

  String _messageErreur(Object erreur) {
    // ApiException.toString() renvoie directement le message backend
    // (409 nom pris, 400 champs manquants, etc.) par convention du
    // projet — voir medecin_repository.dart / utils/api_client.dart.
    if (erreur is ApiException) return erreur.toString();
    return "Impossible de créer le compte pour le moment. Merci de réessayer.";
  }

  // ------------------------------------------------------------------
  // Vérification ONMC — POST /medecins/verifier-ordre (optionnelle)
  // ------------------------------------------------------------------

  Future<void> _verifierNumeroOrdre() async {
    final numero = _numeroOrdreCtrl.text.trim();
    if (numero.isEmpty) {
      _showError("Merci de saisir votre numéro d'inscription à l'Ordre.");
      return;
    }
    setState(() {
      _verifiantOrdre = true;
      _resultatOrdre = null;
      _erreurVerificationOrdre = null;
    });
    try {
      final resultat = await _container
          .read(medecinRepositoryProvider)
          .verifierAppartenanceOrdre(numero);
      if (!mounted) return;
      setState(() => _resultatOrdre = resultat);
    } catch (e) {
      if (!mounted) return;
      // Ne bloque pas le parcours : l'ONMC peut être injoignable
      // (statusCode 502) sans que ça signifie une non-appartenance.
      setState(() => _erreurVerificationOrdre = _messageErreur(e));
    } finally {
      if (mounted) setState(() => _verifiantOrdre = false);
    }
  }

  // ------------------------------------------------------------------
  // Sélection de fichiers réels (file_picker)
  // ------------------------------------------------------------------

  Future<void> _pickFile(_DocType type) async {
    final extensions = type == _DocType.photo
        ? ['jpg', 'jpeg', 'png']
        : ['pdf', 'jpg', 'jpeg', 'png'];

    // Depuis file_picker v12 : plus de FilePicker.platform ni de
    // FilePickerResult. pickFiles() retourne directement une List<PlatformFile>
    // (liste vide si l'utilisateur annule).
    final List<PlatformFile> fichiers = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: extensions,
    );
    if (fichiers.isEmpty) return;

    final fichier = fichiers.single;

    // Depuis v12, on ne récupère plus les bytes via withData/`fichier.bytes` :
    // il faut les lire explicitement via readAsBytes().
    Uint8List? bytes;
    try {
      bytes = await fichier.readAsBytes();
    } catch (_) {
      _showError("Impossible de lire ce fichier. Réessayez.");
      return;
    }

    if (bytes.length > 5 * 1024 * 1024) {
      _showError('Le fichier dépasse la taille maximale de 5 Mo.');
      return;
    }

    setState(() {
      switch (type) {
        case _DocType.cni:
          _cniBytes = bytes;
          _cniFileName = fichier.name;
          break;
        case _DocType.attestation:
          _attestationBytes = bytes;
          _attestationFileName = fichier.name;
          break;
        case _DocType.photo:
          _photoBytes = bytes;
          _photoFileName = fichier.name;
          break;
      }
    });
  }

  void _removeFile(_DocType type) {
    setState(() {
      switch (type) {
        case _DocType.cni:
          _cniBytes = null;
          _cniFileName = null;
          break;
        case _DocType.attestation:
          _attestationBytes = null;
          _attestationFileName = null;
          break;
        case _DocType.photo:
          _photoBytes = null;
          _photoFileName = null;
          break;
      }
    });
  }

  String _tailleLisible(List<int>? octets) {
    if (octets == null) return '—';
    final ko = octets.length / 1024;
    if (ko < 1024) return '${ko.toStringAsFixed(0)} Ko';
    return '${(ko / 1024).toStringAsFixed(1)} Mo';
  }

  // ------------------------------------------------------------------
  // Build
  // ------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: PageView(
          controller: _pageController,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            _StepScaffold(
              stepIndex: 0,
              onBack: _onBackPressed,
              showTopline: true,
              child: _buildStep1Informations(),
            ),
            _StepScaffold(
              stepIndex: 1,
              onBack: _onBackPressed,
              showTopline: true,
              child: _buildStep2SpecialiteOrdre(),
            ),
            _StepScaffold(
              stepIndex: 2,
              onBack: _onBackPressed,
              showTopline: true,
              child: _buildStep3Biographie(),
            ),
            _StepScaffold(
              stepIndex: 3,
              onBack: _onBackPressed,
              showTopline: true,
              child: _buildStep4Justificatifs(),
            ),
            _StepScaffold(
              stepIndex: 4,
              onBack: _onBackPressed,
              showTopline: true,
              child: _buildStep5Tresorerie(),
            ),
            _buildStep6Confirmation(),
          ],
        ),
      ),
    );
  }

  // ------------------------------------------------------------------
  // Étape 1 — Informations
  // ------------------------------------------------------------------

  Widget _buildStep1Informations() {
    return Form(
      key: _step1FormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _StepTitleBlock(
            title: 'Vos informations',
            description:
            "Vos coordonnées et votre pays/ville d'exercice. Quelques minutes suffisent.",
          ),
          _PhotoUpload(
            fileName: _photoFileName,
            onTap: () => _pickFile(_DocType.photo),
            onRemove:
            _photoFileName != null ? () => _removeFile(_DocType.photo) : null,
          ),
          _AppFormField(
            label: 'Nom',
            required: true,
            child: _AppTextInput(
              controller: _nomCtrl,
              hint: 'Ex. Mbarga',
              validator: _requiredValidator,
            ),
          ),
          _AppFormField(
            label: 'Prénom',
            required: true,
            child: _AppTextInput(
              controller: _prenomCtrl,
              hint: 'Ex. Sandrine',
              validator: _requiredValidator,
            ),
          ),
          _AppFormField(
            label: 'Adresse e-mail professionnelle',
            required: true,
            child: _AppTextInput(
              controller: _emailCtrl,
              hint: 'vous@cabinet.cm',
              keyboardType: TextInputType.emailAddress,
              validator: _emailValidator,
            ),
          ),
          _AppFormField(
            label: 'Téléphone',
            child: _AppTextInput(
              controller: _telCtrl,
              hint: '+237 6 XX XX XX XX',
              keyboardType: TextInputType.phone,
            ),
          ),
          _AppFormField(
            label: 'Pays',
            required: true,
            child: _AppDropdown<String>(
              value: _pays,
              hint: 'Sélectionner…',
              items: _paysVilles.keys.toList(),
              onChanged: (value) {
                setState(() {
                  _pays = value;
                  _ville = null;
                });
              },
            ),
          ),
          _AppFormField(
            label: "Ville d'exercice",
            required: true,
            hint: "Votre pays de résidence et d'exercice.",
            child: _AppDropdown<String>(
              value: _ville,
              hint: _pays == null ? "Choisissez d'abord un pays" : 'Sélectionner…',
              items: _pays == null ? const [] : _paysVilles[_pays]!,
              enabled: _pays != null,
              onChanged: (value) => setState(() => _ville = value),
            ),
          ),
          _StepActions(
            showBack: false,
            onContinue: _onContinuePressed,
          ),
        ],
      ),
    );
  }

  // ------------------------------------------------------------------
  // Étape 2 — Spécialité & Ordre
  // ------------------------------------------------------------------

  Widget _buildStep2SpecialiteOrdre() {
    return Form(
      key: _step2FormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _StepTitleBlock(
            title: 'Spécialité & Ordre',
            description:
            "Votre domaine d'exercice et votre numéro d'inscription à l'Ordre.",
          ),
          _specialitesState.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.green700,
                  ),
                ),
              ),
            ),
            error: (erreur, _) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                "Impossible de charger les spécialités : ${_messageErreur(erreur)}",
                style: AppTextStyles.cardMeta.copyWith(color: AppColors.danger),
              ),
            ),
            data: (specialites) => _AppFormField(
              label: 'Spécialité',
              required: true,
              child: _AppDropdown<Specialite>(
                value: _specialite,
                hint: 'Sélectionner…',
                items: specialites,
                itemLabel: (s) => s.nom,
                onChanged: (value) => setState(() => _specialite = value),
              ),
            ),
          ),
          _AppFormField(
            label: "Numéro d'inscription à l'Ordre",
            required: true,
            child: _AppTextInput(
              controller: _numeroOrdreCtrl,
              hint: 'Ex. ONMC-2024-0451',
              validator: _requiredValidator,
              textCapitalization: TextCapitalization.characters,
            ),
          ),
          _buildVerificationOrdre(),
          _AppFormField(
            label: 'Tarif de consultation indicatif (FCFA)',
            required: true,
            child: _AppTextInput(
              controller: _tarifCtrl,
              hint: 'Ex. 15000',
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              validator: _requiredValidator,
            ),
          ),
          _CheckRow(
            label: 'J\'active la téléconsultation',
            checked: _teleconsultation,
            onTap: () => setState(() => _teleconsultation = !_teleconsultation),
          ),
          const SizedBox(height: 10),
          _StepActions(onContinue: _onContinuePressed, onBack: _onBackPressed),
        ],
      ),
    );
  }

  /// Bouton de pré-validation ONMC + résultat, sous le champ numéro
  /// d'ordre — appelle POST /medecins/verifier-ordre indépendamment de
  /// la soumission finale.
  Widget _buildVerificationOrdre() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: _verifiantOrdre ? null : _verifierNumeroOrdre,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_verifiantOrdre)
                  const SizedBox(
                    width: 12,
                    height: 12,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.green700,
                    ),
                  )
                else
                  const Icon(Icons.verified_outlined,
                      size: 14, color: AppColors.green700),
                const SizedBox(width: 6),
                Text(
                  "Vérifier auprès de l'Ordre",
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontDisplay,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.green700,
                  ),
                ),
              ],
            ),
          ),
          if (_resultatOrdre != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                _resultatOrdre!.appartientOrdre
                    ? '✓ Inscription confirmée${_resultatOrdre!.nomComplet != null ? ' — ${_resultatOrdre!.nomComplet}' : ''}'
                    : "Ce numéro n'apparaît pas au Tableau de l'Ordre.",
                style: TextStyle(
                  fontFamily: AppTextStyles.fontBody,
                  fontSize: 10.5,
                  fontWeight: FontWeight.w600,
                  color: _resultatOrdre!.appartientOrdre
                      ? AppColors.green700
                      : AppColors.danger,
                ),
              ),
            ),
          if (_erreurVerificationOrdre != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                _erreurVerificationOrdre!,
                style: const TextStyle(
                  fontFamily: AppTextStyles.fontBody,
                  fontSize: 10.5,
                  color: AppColors.inkFaint,
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ------------------------------------------------------------------
  // Étape 3 — Biographie
  // ------------------------------------------------------------------

  Widget _buildStep3Biographie() {
    return Form(
      key: _step3FormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _StepTitleBlock(
            title: 'Biographie',
            description: 'Une présentation courte, visible sur votre fiche publique.',
          ),
          _AppFormField(
            label: 'Présentation',
            required: true,
            hint: 'Visible sur votre fiche publique — 600 caractères maximum recommandés.',
            child: _AppTextArea(
              controller: _bioCtrl,
              hint: 'Décrivez votre parcours, vos domaines d\'expertise, votre approche des patients…',
              maxLength: _bioMaxLength,
              validator: _requiredValidator,
              onChanged: (_) => setState(() {}),
            ),
          ),
          const SizedBox(height: 8),
          _StepActions(onContinue: _onContinuePressed, onBack: _onBackPressed),
        ],
      ),
    );
  }

  // ------------------------------------------------------------------
  // Étape 4 — Justificatifs
  // ------------------------------------------------------------------

  Widget _buildStep4Justificatifs() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _StepTitleBlock(
          title: 'Justificatifs',
          description: 'Pièces à télécharger pour vérification par notre équipe.',
        ),
        _AppFormField(
          label: "Pièce d'identité (CNI)",
          required: true,
          child: _UploadZone(
            fileName: _cniFileName,
            fileSizeLabel: _tailleLisible(_cniBytes),
            onTap: () => _pickFile(_DocType.cni),
            onRemove: () => _removeFile(_DocType.cni),
          ),
        ),
        _AppFormField(
          label: "Attestation d'inscription à l'Ordre",
          required: true,
          child: _UploadZone(
            fileName: _attestationFileName,
            fileSizeLabel: _tailleLisible(_attestationBytes),
            onTap: () => _pickFile(_DocType.attestation),
            onRemove: () => _removeFile(_DocType.attestation),
          ),
        ),
        const SizedBox(height: 2),
        _StepActions(onContinue: _onContinuePressed, onBack: _onBackPressed),
      ],
    );
  }

  // ------------------------------------------------------------------
  // Étape 5 — Trésorerie
  // ------------------------------------------------------------------

  Widget _buildStep5Tresorerie() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _StepTitleBlock(
          title: 'Trésorerie',
          description:
          'Comment souhaitez-vous recevoir vos paiements ? (facultatif — configurable plus tard)',
        ),
        _PayOption(
          icon: Icons.schedule_rounded,
          label: 'Plus tard',
          selected: _paymentMethod == _PaymentMethod.plusTard,
          onTap: () => setState(() => _paymentMethod = _PaymentMethod.plusTard),
        ),
        const SizedBox(height: 9),
        _PayOption(
          icon: Icons.phone_android_rounded,
          label: 'Mobile Money',
          selected: _paymentMethod == _PaymentMethod.mobileMoney,
          onTap: () => setState(() => _paymentMethod = _PaymentMethod.mobileMoney),
        ),
        const SizedBox(height: 9),
        _PayOption(
          icon: Icons.account_balance_rounded,
          label: 'Compte bancaire',
          selected: _paymentMethod == _PaymentMethod.compteBancaire,
          onTap: () => setState(() => _paymentMethod = _PaymentMethod.compteBancaire),
        ),
        const SizedBox(height: 16),
        AnimatedSize(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOutCubic,
          child: _paymentMethod == _PaymentMethod.compteBancaire
              ? _TreasuryFields(
            banqueCtrl: _banqueCtrl,
            titulaireCtrl: _titulaireCtrl,
            compteCtrl: _compteCtrl,
          )
              : const SizedBox.shrink(),
        ),
        const Text(
          // ⚠️ Ces informations ne sont pas envoyées à POST /medecins
          // (hors périmètre du module — voir en-tête du fichier). Elles
          // sont conservées côté écran uniquement, en attendant le
          // module « Moyens de paiement » dédié.
          'Vos informations de trésorerie sont chiffrées et servent uniquement au '
              'versement de vos revenus après chaque consultation. Vous pouvez aussi '
              'les renseigner plus tard depuis votre espace médecin.',
          style: TextStyle(
            fontFamily: AppTextStyles.fontBody,
            fontSize: 10.5,
            color: AppColors.inkFaint,
            height: 1.5,
          ),
        ),
        const SizedBox(height: 14),
        if (_creationState.hasError)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              _messageErreur(_creationState.error!),
              style: const TextStyle(
                fontFamily: AppTextStyles.fontBody,
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: AppColors.danger,
              ),
            ),
          ),
        _StepActions(
          onContinue: _onContinuePressed,
          onBack: _onBackPressed,
          loading: _submitting,
          continueLabel: 'Continuer',
        ),
      ],
    );
  }

  // ------------------------------------------------------------------
  // Étape 6 — Confirmation
  // ------------------------------------------------------------------

  Widget _buildStep6Confirmation() {
    final resultat = _resultatCreation;
    final medecin = resultat?.medecin;
    final utilisateur = resultat?.utilisateur;

    final nomComplet = utilisateur != null
        ? '${utilisateur.prenom} ${utilisateur.nom}'.trim()
        : ('${_prenomCtrl.text} ${_nomCtrl.text}').trim();
    final displayName = nomComplet.isEmpty ? 'Dr —' : 'Dr $nomComplet';
    final specialiteLabel = medecin?.specialite?.nom ?? _specialite?.nom ?? '—';
    final villeLabel = _ville != null && _pays != null ? '$_ville, $_pays' : '—';

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
      child: Column(
        children: [
          const _StepperDots(currentIndex: _stepCount - 1, stepCount: _stepCount, allDone: true),
          const SizedBox(height: 12),
          Container(
            width: 82,
            height: 82,
            margin: const EdgeInsets.only(bottom: 20),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.green100,
              border: Border.all(
                color: AppColors.green500.withOpacity(0.35),
                width: 2,
              ),
            ),
            child: Center(
              child: Container(
                width: 60,
                height: 60,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.green100,
                ),
                child: const Icon(Icons.check_rounded, color: AppColors.green700, size: 36),
              ),
            ),
          ),
          const Text(
            'Compte créé avec succès 🎉',
            textAlign: TextAlign.center,
            style: TextStyle(
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
              'Merci $displayName ! Votre demande a bien été '
                  "envoyée. Votre fiche sera mise en ligne dès validation de votre "
                  "inscription à l'Ordre et de vos justificatifs.",
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
          Container(
            width: double.infinity,
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
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppColors.primaryLight,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.person_outline_rounded, color: AppColors.primary, size: 20),
                    ),
                    const SizedBox(width: 11),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(displayName,
                              style: AppTextStyles.cardTitle.copyWith(fontSize: 13.5)),
                          const SizedBox(height: 2),
                          Text('$specialiteLabel · $villeLabel',
                              style: AppTextStyles.cardMeta.copyWith(fontSize: 11)),
                        ],
                      ),
                    ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: _DashedDivider(),
                ),
                _InsKv(
                  label: "Numéro d'Ordre",
                  value: medecin?.numeroOrdre.isNotEmpty == true
                      ? medecin!.numeroOrdre
                      : (_numeroOrdreCtrl.text.isEmpty ? '—' : _numeroOrdreCtrl.text),
                  mono: true,
                ),
                if (utilisateur != null) ...[
                  const SizedBox(height: 9),
                  _InsKv(label: 'E-mail du compte', value: utilisateur.email, mono: true),
                  const SizedBox(height: 9),
                  _MotDePasseTemporaireRow(motDePasse: utilisateur.motDePasseTemporaire),
                ],
                const SizedBox(height: 9),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Statut du compte',
                        style: TextStyle(
                          fontFamily: AppTextStyles.fontBody,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: AppColors.inkFaint,
                        )),
                    const BadgeChip(
                      label: 'En attente de validation',
                      style: BadgeChipStyle.amber,
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Column(
            children: const [
              _SuccessNextItem(
                icon: Icons.mark_email_read_outlined,
                title: 'E-mail de confirmation envoyé',
                description: 'Un récapitulatif vous a été envoyé à votre adresse professionnelle.',
              ),
              _SuccessNextItem(
                icon: Icons.schedule_rounded,
                title: 'Vérification sous 48h',
                description: "Notre équipe contrôle votre inscription à l'Ordre et vos justificatifs.",
              ),
              _SuccessNextItem(
                icon: Icons.notifications_none_rounded,
                title: 'Notification à la mise en ligne',
                description: 'Vous serez averti dès que votre fiche sera visible publiquement.',
                showDivider: false,
              ),
            ],
          ),
          const SizedBox(height: 8),
          PrimaryButton(
            label: 'Aller à mon espace médecin',
            icon: Icons.arrow_forward_rounded,
            onPressed: () {
              if (resultat != null && widget.onCompteCree != null) {
                widget.onCompteCree!(resultat);
              } else {
                Navigator.of(context).popUntil((route) => route.isFirst);
              }
            },
          ),
          const SizedBox(height: 9),
          SecondaryButton(
            label: "Retour à l'accueil",
            onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst),
          ),
        ],
      ),
    );
  }

  // ------------------------------------------------------------------
  // Validators
  // ------------------------------------------------------------------

  String? _requiredValidator(String? value) {
    if (value == null || value.trim().isEmpty) return 'Champ requis';
    return null;
  }

  String? _emailValidator(String? value) {
    if (value == null || value.trim().isEmpty) return 'Champ requis';
    final ok = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value.trim());
    if (!ok) return 'E-mail invalide';
    return null;
  }
}

// ========================================================================
// Structure commune d'une étape (topline + stepper + contenu scrollable)
// ========================================================================

class _StepScaffold extends StatelessWidget {
  const _StepScaffold({
    required this.stepIndex,
    required this.onBack,
    required this.child,
    this.showTopline = true,
  });

  final int stepIndex;
  final VoidCallback onBack;
  final Widget child;
  final bool showTopline;

  static const int _stepCount = _CreateMedecinScreenState._stepCount;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (showTopline)
            _StepTopline(stepIndex: stepIndex, onBack: onBack),
          _StepperDots(currentIndex: stepIndex, stepCount: _stepCount),
          const SizedBox(height: 2),
          child,
        ],
      ),
    );
  }
}

class _StepTopline extends StatelessWidget {
  const _StepTopline({required this.stepIndex, required this.onBack});

  final int stepIndex;
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
              child: const Icon(Icons.arrow_back_rounded, size: 14, color: AppColors.inkSoft),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            'ÉTAPE ${stepIndex + 1} / 6',
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

/// Reproduit `.stepper-mobile` : 6 cercles reliés par des lignes,
/// avec les états `done` (vert plein + check), `current` (halo vert) et
/// à venir (gris).
class _StepperDots extends StatelessWidget {
  const _StepperDots({
    required this.currentIndex,
    required this.stepCount,
    this.allDone = false,
  });

  final int currentIndex;
  final int stepCount;

  /// Force tous les cercles à l'état "terminé" (utilisé sur l'écran de
  /// confirmation).
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
          return _StepCircle(number: index + 1, done: isDone, current: isCurrent);
        }),
      ),
    );
  }
}

class _StepCircle extends StatelessWidget {
  const _StepCircle({required this.number, required this.done, required this.current});

  final int number;
  final bool done;
  final bool current;

  @override
  Widget build(BuildContext context) {
    if (done) {
      return Container(
        width: 23,
        height: 23,
        decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.green600),
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
            ? [BoxShadow(color: AppColors.green100, blurRadius: 0, spreadRadius: 3)]
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

class _StepTitleBlock extends StatelessWidget {
  const _StepTitleBlock({required this.title, required this.description});

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'ESPACE PROFESSIONNEL',
            style: TextStyle(
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

// ========================================================================
// Champs de formulaire génériques (.form-group / .form-label / .form-input)
// ========================================================================

class _AppFormField extends StatelessWidget {
  const _AppFormField({
    required this.label,
    required this.child,
    this.required = false,
    this.hint,
    this.linkHint,
  });

  final String label;
  final Widget child;
  final bool required;
  final String? hint;
  final String? linkHint;

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
                  if (required) const TextSpan(text: ' *', style: TextStyle(color: AppColors.danger)),
                ],
              ),
            ),
          ),
          child,
          if (linkHint != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                linkHint!,
                style: const TextStyle(
                  fontFamily: AppTextStyles.fontBody,
                  fontSize: 10.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.green700,
                ),
              ),
            )
          else if (hint != null)
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

InputDecoration _baseInputDecoration({required String hint, bool enabled = true}) {
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
    border: OutlineInputBorder(
      borderRadius: AppRadius.smRadius,
      borderSide: const BorderSide(color: AppColors.lineStrong),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: AppRadius.smRadius,
      borderSide: const BorderSide(color: AppColors.lineStrong),
    ),
    disabledBorder: OutlineInputBorder(
      borderRadius: AppRadius.smRadius,
      borderSide: const BorderSide(color: AppColors.lineStrong),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: AppRadius.smRadius,
      borderSide: const BorderSide(color: AppColors.green500),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: AppRadius.smRadius,
      borderSide: const BorderSide(color: AppColors.danger),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: AppRadius.smRadius,
      borderSide: const BorderSide(color: AppColors.danger),
    ),
    errorStyle: const TextStyle(fontSize: 10.5, color: AppColors.danger),
  );
}

class _AppTextInput extends StatelessWidget {
  const _AppTextInput({
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
      decoration: _baseInputDecoration(hint: hint),
    );
  }
}

class _AppTextArea extends StatelessWidget {
  const _AppTextArea({
    required this.controller,
    required this.hint,
    required this.maxLength,
    this.validator,
    this.onChanged,
  });

  final TextEditingController controller;
  final String hint;
  final int maxLength;
  final String? Function(String?)? validator;
  final void Function(String)? onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        TextFormField(
          controller: controller,
          minLines: 5,
          maxLines: 8,
          maxLength: maxLength,
          validator: validator,
          onChanged: onChanged,
          style: const TextStyle(
            fontFamily: AppTextStyles.fontBody,
            fontSize: 12.5,
            color: AppColors.ink,
            height: 1.55,
          ),
          decoration: _baseInputDecoration(hint: hint).copyWith(counterText: ''),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 5),
          child: Text(
            '${controller.text.length} / $maxLength',
            style: const TextStyle(
              fontFamily: AppTextStyles.fontMono,
              fontSize: 10,
              color: AppColors.inkFaint,
            ),
          ),
        ),
      ],
    );
  }
}

/// Dropdown générique. [itemLabel] permet d'afficher un libellé
/// différent de `toString()` (utilisé pour [Specialite], dont l'objet
/// entier est la valeur sélectionnée — nécessaire pour retrouver
/// `specialiteId` au moment de construire [CreerMedecinPayload]).
class _AppDropdown<T> extends StatelessWidget {
  const _AppDropdown({
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
      value: value,
      isExpanded: true,
      icon: Icon(Icons.keyboard_arrow_down_rounded,
          color: enabled ? AppColors.inkSoft : AppColors.inkFaint),
      style: const TextStyle(
        fontFamily: AppTextStyles.fontBody,
        fontSize: 12.5,
        color: AppColors.ink,
      ),
      decoration: _baseInputDecoration(hint: hint, enabled: enabled),
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

// ========================================================================
// Bloc photo de profil (.photo-upload) — sélection réelle via file_picker
// ========================================================================

class _PhotoUpload extends StatelessWidget {
  const _PhotoUpload({required this.fileName, required this.onTap, this.onRemove});

  final String? fileName;
  final VoidCallback onTap;
  final VoidCallback? onRemove;

  bool get _done => fileName != null;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Row(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.green100,
                    border: Border.all(color: AppColors.green500, width: 1.5),
                  ),
                  child: Icon(
                    _done ? Icons.check_circle_rounded : Icons.person_outline_rounded,
                    color: AppColors.green600,
                    size: 22,
                  ),
                ),
                Positioned(
                  bottom: -2,
                  right: -2,
                  child: Container(
                    width: 19,
                    height: 19,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.primary,
                      border: Border.all(color: AppColors.card, width: 2),
                    ),
                    child: Icon(
                      _done ? Icons.edit_rounded : Icons.add_rounded,
                      size: 11,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Photo de profil',
                      style: TextStyle(
                        fontFamily: AppTextStyles.fontDisplay,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      )),
                  const SizedBox(height: 2),
                  Text(
                    _done
                        ? '✓ $fileName'
                        : 'JPG, PNG — visage bien visible, fond neutre (facultatif)',
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: AppTextStyles.fontBody,
                      fontSize: 10.5,
                      color: _done ? AppColors.green700 : AppColors.inkFaint,
                      fontWeight: _done ? FontWeight.w600 : FontWeight.normal,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
            if (_done && onRemove != null)
              InkWell(
                onTap: onRemove,
                child: const Padding(
                  padding: EdgeInsets.all(4),
                  child: Icon(Icons.close_rounded, size: 15, color: AppColors.inkFaint),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ========================================================================
// Case à cocher pleine largeur (.check-row)
// ========================================================================

class _CheckRow extends StatelessWidget {
  const _CheckRow({required this.label, required this.checked, required this.onTap});

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
          children: [
            Container(
              width: 19,
              height: 19,
              decoration: BoxDecoration(
                color: checked ? AppColors.green600 : AppColors.card,
                border: Border.all(color: checked ? AppColors.green600 : AppColors.lineStrong, width: 1.5),
                borderRadius: BorderRadius.circular(6),
              ),
              child: checked ? const Icon(Icons.check_rounded, size: 12, color: Colors.white) : null,
            ),
            const SizedBox(width: 10),
            Text(
              label,
              style: const TextStyle(
                fontFamily: AppTextStyles.fontDisplay,
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ========================================================================
// Zone de téléversement (.upload-zone)
// ========================================================================

class _UploadZone extends StatelessWidget {
  const _UploadZone({
    required this.fileName,
    required this.onTap,
    required this.onRemove,
    this.fileSizeLabel,
  });

  final String? fileName;
  final String? fileSizeLabel;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  bool get _done => fileName != null;

  @override
  Widget build(BuildContext context) {
    if (_done) {
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
              decoration: BoxDecoration(color: AppColors.green100, borderRadius: BorderRadius.circular(11)),
              child: const Icon(Icons.description_outlined, color: AppColors.green700, size: 17),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(fileName!,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontFamily: AppTextStyles.fontDisplay,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      )),
                  const SizedBox(height: 2),
                  Text('✓ Téléversé${fileSizeLabel != null && fileSizeLabel != '—' ? ' — $fileSizeLabel' : ''}',
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
                child: Icon(Icons.close_rounded, size: 15, color: AppColors.inkFaint),
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
          border: Border.all(color: AppColors.lineStrong, width: 1.5, style: BorderStyle.solid),
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
              child: const Icon(Icons.upload_rounded, color: AppColors.inkSoft, size: 17),
            ),
            const Text('Choisir un fichier',
                style: TextStyle(
                  fontFamily: AppTextStyles.fontDisplay,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                )),
            const SizedBox(height: 3),
            const Text('PDF, JPG — 5 Mo max',
                style: TextStyle(
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
// Options de paiement (.pay-opt) et champs bancaires (.treasury-fields)
// ========================================================================

class _PayOption extends StatelessWidget {
  const _PayOption({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: AppRadius.smRadius,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? AppColors.green50 : AppColors.card,
          border: Border.all(color: selected ? AppColors.green500 : AppColors.lineStrong, width: 1.5),
          borderRadius: AppRadius.smRadius,
        ),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: selected ? AppColors.green100 : AppColors.paper,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 16, color: selected ? AppColors.green700 : AppColors.inkSoft),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontFamily: AppTextStyles.fontDisplay,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                ),
              ),
            ),
            Container(
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: selected ? AppColors.green600 : AppColors.lineStrong, width: 1.8),
              ),
              alignment: Alignment.center,
              child: selected
                  ? Container(
                width: 10,
                height: 10,
                decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.green600),
              )
                  : null,
            ),
          ],
        ),
      ),
    );
  }
}

class _TreasuryFields extends StatelessWidget {
  const _TreasuryFields({
    required this.banqueCtrl,
    required this.titulaireCtrl,
    required this.compteCtrl,
  });

  final TextEditingController banqueCtrl;
  final TextEditingController titulaireCtrl;
  final TextEditingController compteCtrl;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.paper,
        border: Border.all(color: AppColors.line),
        borderRadius: AppRadius.mdRadius,
      ),
      child: Column(
        children: [
          _AppFormField(
            label: 'Nom de la banque',
            required: true,
            child: _AppTextInput(controller: banqueCtrl, hint: 'Ex. Afriland First Bank'),
          ),
          _AppFormField(
            label: 'Titulaire du compte',
            required: true,
            child: _AppTextInput(controller: titulaireCtrl, hint: 'Nom complet'),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 0),
            child: _AppFormField(
              label: 'Numéro de compte / IBAN',
              required: true,
              child: _AppTextInput(controller: compteCtrl, hint: 'CM21 XXXX XXXX XXXX XXXX'),
            ),
          ),
        ],
      ),
    );
  }
}

// ========================================================================
// Actions de bas d'étape (.step-actions)
// ========================================================================

class _StepActions extends StatelessWidget {
  const _StepActions({
    required this.onContinue,
    this.onBack,
    this.showBack = true,
    this.loading = false,
    this.continueLabel = 'Continuer',
  });

  final VoidCallback onContinue;
  final VoidCallback? onBack;
  final bool showBack;
  final bool loading;
  final String continueLabel;

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
              icon: Icons.arrow_forward_rounded,
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
// Écran de confirmation — éléments annexes
// ========================================================================

class _DashedDivider extends StatelessWidget {
  const _DashedDivider();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const dashWidth = 4.0;
        const dashSpace = 3.0;
        final count = (constraints.maxWidth / (dashWidth + dashSpace)).floor();
        return Row(
          children: List.generate(count, (_) {
            return Padding(
              padding: const EdgeInsets.only(right: dashSpace),
              child: Container(width: dashWidth, height: 1, color: AppColors.line),
            );
          }),
        );
      },
    );
  }
}

class _InsKv extends StatelessWidget {
  const _InsKv({required this.label, required this.value, this.mono = false});

  final String label;
  final String value;
  final bool mono;

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
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.end,
            overflow: TextOverflow.ellipsis,
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

/// Ligne dédiée au mot de passe temporaire — affiché en clair une seule
/// fois (voir [UtilisateurCreeMedecin]), avec bouton de copie rapide
/// pour éviter de le laisser affiché plus longtemps que nécessaire.
class _MotDePasseTemporaireRow extends StatelessWidget {
  const _MotDePasseTemporaireRow({required this.motDePasse});

  final String motDePasse;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 9),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Text('Mot de passe temporaire',
              style: TextStyle(
                fontFamily: AppTextStyles.fontBody,
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: AppColors.inkFaint,
              )),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                motDePasse,
                style: const TextStyle(
                  fontFamily: AppTextStyles.fontMono,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                ),
              ),
              const SizedBox(width: 6),
              InkWell(
                onTap: () {
                  Clipboard.setData(ClipboardData(text: motDePasse));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Mot de passe copié.')),
                  );
                },
                child: const Icon(Icons.copy_rounded, size: 14, color: AppColors.green700),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SuccessNextItem extends StatelessWidget {
  const _SuccessNextItem({
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
            decoration: BoxDecoration(color: AppColors.green100, borderRadius: BorderRadius.circular(8)),
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