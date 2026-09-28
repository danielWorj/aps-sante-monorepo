// Parcours de création d'un service d'assurance — « Rejoindre l'annuaire »
// (6 étapes), équivalent mobile de
// client-plateform/src/components/assurances/creationAssurance.jsx.
//
//   1 Infos générales · 2 Localisation · 3 Contact ·
//   4 Infos supplémentaires · 5 Agent responsable · 6 Confirmation
//
// Suit le contrat de POST /services-assurance (assurance.controller.js) :
//   - obligatoires : nom, type_acteur ('compagnie'|'courtier'), pays_id,
//     ville_id, telephone, email, agrement, fonction, agent_nom,
//     agent_prenom, agent_email + fichier `image_assurance` (logo) ;
//   - optionnels : description, latitude/longitude (ensemble ou pas du
//     tout), agent_telephone.
// La route crée EN MÊME TEMPS la fiche et le compte de l'agent responsable :
// le mot de passe temporaire n'est renvoyé qu'une seule fois et n'est
// affiché que sur l'écran de succès (voir ApsCredentialsCard).
//
// ⚠️ Cette route est authentifiée (`authentifier` dans
// assurance.routes.js) : l'envoi exige une session ouverte
// ([authTokenProvider]). Sans session, la dernière étape affiche un message
// au lieu d'appeler le serveur.
//
// Le stepper, les champs et les écrans de confirmation viennent de
// `components/stepper/aps_stepper.dart` (extrait de createmedecinpage.dart).
//
// Utilisation :
// ```dart
// Navigator.of(context).push(
//   MaterialPageRoute(builder: (_) => const CreateAssuranceScreen()),
// );
// ```
// Nécessite un `ProviderScope` à la racine (déjà en place dans main.dart).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
// `authTokenProvider` est aussi redéclaré (en stub toujours `null`) dans
// assurance_controller.dart : on le masque pour lire le vrai token de
// session, celui de authentification_controller.dart.
import '../../../controllers/assurance_controller.dart' hide authTokenProvider;
import '../../../controllers/authentification_controller.dart';
import '../../../models/assurance_models.dart';
import '../../../models/referentiel_models.dart' show Pays, Ville;
import 'aps_pays_ville_fields.dart';

class CreateAssuranceScreen extends ConsumerStatefulWidget {
  const CreateAssuranceScreen({super.key, this.onCreee});

  /// Appelé par le bouton « Terminer » de l'écran de succès, avec la
  /// réponse complète de POST /services-assurance. Si `null`, l'écran
  /// revient à la racine de la navigation.
  final ValueChanged<ServiceAssuranceCreationReponse>? onCreee;

  @override
  ConsumerState<CreateAssuranceScreen> createState() =>
      _CreateAssuranceScreenState();
}

class _CreateAssuranceScreenState extends ConsumerState<CreateAssuranceScreen>
    with ApsStepperStateMixin<CreateAssuranceScreen> {
  @override
  int get stepCount => 6;

  late final CreationServiceAssuranceController _creation;

  /// Message de validation de l'étape courante (équivalent de `stepError`
  /// côté web).
  String? _stepError;

  // ---- Étape 1 — Infos générales ---------------------------------------
  final _nomCtrl = TextEditingController();
  TypeActeurAssurance _typeActeur = TypeActeurAssurance.compagnie;
  ApsFichier? _logo;

  // ---- Étape 2 — Localisation ------------------------------------------
  Pays? _pays;
  Ville? _ville;

  // ---- Étape 3 — Contact -------------------------------------------------
  final _emailCtrl = TextEditingController();
  final _telCtrl = TextEditingController();

  // ---- Étape 4 — Infos supplémentaires -----------------------------------
  final _agrementCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  final _latCtrl = TextEditingController();
  final _lngCtrl = TextEditingController();
  static const int _descriptionMax = 600;

  // ---- Étape 5 — Agent responsable ---------------------------------------
  final _fonctionCtrl = TextEditingController();
  final _agentNomCtrl = TextEditingController();
  final _agentPrenomCtrl = TextEditingController();
  final _agentEmailCtrl = TextEditingController();
  final _agentTelCtrl = TextEditingController();

  // ---- Étape 6 — Confirmation ---------------------------------------------
  bool _acceptCgu = false;
  ServiceAssuranceCreationReponse? _reponse;

  @override
  void initState() {
    super.initState();
    _creation =
        ref.read(creationServiceAssuranceControllerProvider.notifier);
  }

  @override
  void dispose() {
    // Le mot de passe temporaire de l'agent ne doit pas rester en mémoire
    // une fois l'écran quitté (voir CreationServiceAssuranceController).
    // Différé : on ne modifie pas un provider pendant le démontage.
    final creation = _creation;
    Future(() {
      try {
        creation.reinitialiser();
      } catch (_) {}
    });
    for (final c in [
      _nomCtrl,
      _emailCtrl,
      _telCtrl,
      _agrementCtrl,
      _descriptionCtrl,
      _latCtrl,
      _lngCtrl,
      _fonctionCtrl,
      _agentNomCtrl,
      _agentPrenomCtrl,
      _agentEmailCtrl,
      _agentTelCtrl,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  // ------------------------------------------------------------------
  // Validation par étape (mêmes règles et messages que le web)
  // ------------------------------------------------------------------

  static final RegExp _emailRegExp = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

  String? _validerEtape(int etape) {
    switch (etape) {
      case 0:
        if (_nomCtrl.text.trim().isEmpty) {
          return 'Le nom de la compagnie/courtier est requis.';
        }
        if (_logo == null) return 'Un logo est obligatoire.';
        return null;
      case 1:
        if (_pays == null) return 'Veuillez sélectionner un pays.';
        if (_ville == null) return 'Veuillez sélectionner une ville.';
        return null;
      case 2:
        final email = _emailCtrl.text.trim();
        if (email.isEmpty) return 'Un email est requis.';
        if (!_emailRegExp.hasMatch(email)) {
          return 'Veuillez entrer une adresse email valide.';
        }
        if (_telCtrl.text.trim().isEmpty) {
          return 'Un numéro de téléphone est requis.';
        }
        return null;
      case 3:
        if (_agrementCtrl.text.trim().isEmpty) {
          return "Un numéro d'agrément est requis.";
        }
        return apsValiderCoordonnees(_latCtrl.text, _lngCtrl.text);
      case 4:
        if (_fonctionCtrl.text.trim().isEmpty) {
          return "La fonction de l'agent est requise.";
        }
        if (_agentNomCtrl.text.trim().isEmpty) {
          return "Le nom de l'agent est requis.";
        }
        if (_agentPrenomCtrl.text.trim().isEmpty) {
          return "Le prénom de l'agent est requis.";
        }
        final agentEmail = _agentEmailCtrl.text.trim();
        if (agentEmail.isEmpty) return "Un email pour l'agent est requis.";
        if (!_emailRegExp.hasMatch(agentEmail)) {
          return "Veuillez entrer une adresse email valide pour l'agent.";
        }
        return null;
      case 5:
        if (!_acceptCgu) return 'Vous devez accepter les conditions générales.';
        return null;
    }
    return null;
  }

  void _continuer() {
    FocusScope.of(context).unfocus();
    final erreur = _validerEtape(currentStep);
    if (erreur != null) {
      setState(() => _stepError = erreur);
      return;
    }
    setState(() => _stepError = null);
    if (currentStep == stepCount - 1) {
      _envoyer();
    } else {
      goToNextStep();
    }
  }

  void _retour() {
    setState(() => _stepError = null);
    onBackPressed();
  }

  // ------------------------------------------------------------------
  // Fichiers
  // ------------------------------------------------------------------

  Future<void> _choisirLogo() async {
    try {
      final fichier = await apsChoisirFichier(
        extensions: const ['jpg', 'jpeg', 'png'],
      );
      if (fichier == null || !mounted) return;
      setState(() {
        _logo = fichier;
        _stepError = null;
      });
    } on ApsFichierException catch (e) {
      showError(e.message);
    }
  }

  // ------------------------------------------------------------------
  // Soumission — POST /services-assurance
  // ------------------------------------------------------------------

  Future<void> _envoyer() async {
    final pays = _pays;
    final ville = _ville;
    final logo = _logo;
    if (pays == null || ville == null || logo == null) return;

    final token = ref.read(authTokenProvider);
    if (token == null) {
      setState(() => _stepError =
          'Vous devez être connecté(e) pour envoyer cette demande.');
      return;
    }

    final description = _descriptionCtrl.text.trim();
    final agentTel = _agentTelCtrl.text.trim();

    final requete = ServiceAssuranceCreationRequete(
      nom: _nomCtrl.text.trim(),
      paysId: pays.paysId,
      villeId: ville.villeId,
      telephone: _telCtrl.text.trim(),
      email: _emailCtrl.text.trim(),
      agrement: _agrementCtrl.text.trim(),
      description: description.isEmpty ? null : description,
      // Les nouvelles fiches démarrent en révision (comme sur le web) ;
      // le backend force de toute façon « en_cours » hors admin.
      statutVerification: StatutVerificationAssurance.enCours,
      typeActeur: _typeActeur,
      latitude: apsParseCoordonnee(_latCtrl.text),
      longitude: apsParseCoordonnee(_lngCtrl.text),
      fonction: _fonctionCtrl.text.trim(),
      agentNom: _agentNomCtrl.text.trim(),
      agentPrenom: _agentPrenomCtrl.text.trim(),
      agentEmail: _agentEmailCtrl.text.trim(),
      agentTelephone: agentTel.isEmpty ? null : agentTel,
    );

    await _creation.soumettre(
      requete: requete,
      imageOctets: logo.octets,
      imageNomFichier: logo.nom,
      token: token,
    );
    if (!mounted) return;

    final etat = ref.read(creationServiceAssuranceControllerProvider);
    if (etat.hasError) {
      setState(() => _stepError = apsMessageErreur(etat.error!));
      return;
    }
    final reponse = etat.value;
    if (reponse == null) return;
    setState(() {
      _reponse = reponse;
      _stepError = null;
    });
    goToStep(stepCount); // écran de succès
  }

  // ------------------------------------------------------------------
  // Build
  // ------------------------------------------------------------------

  String _libelleType(TypeActeurAssurance t) => t == TypeActeurAssurance.compagnie
      ? "Compagnie d'assurance"
      : 'Courtier';

  @override
  Widget build(BuildContext context) {
    final envoiEnCours =
        ref.watch(creationServiceAssuranceControllerProvider).isLoading;
    final connecte = ref.watch(authTokenProvider) != null;

    return ApsStepperFlow(
      controller: pageController,
      currentStep: currentStep,
      stepCount: stepCount,
      onBack: _retour,
      steps: [
        _etape1(connecte),
        _etape2(),
        _etape3(),
        _etape4(),
        _etape5(),
        _etape6(connecte, envoiEnCours),
      ],
      successPage: _ecranSucces(),
    );
  }

  // ---- Étape 1 : Infos générales ----------------------------------------

  Widget _etape1(bool connecte) {
    return ApsStepBody(
      title: 'Informations générales',
      description:
          "Rejoignez l'annuaire en tant que compagnie d'assurance santé ou "
          'courtier. Quelques minutes suffisent.',
      showBack: false,
      error: currentStep == 0 ? _stepError : null,
      onContinue: _continuer,
      children: [
        if (!connecte)
          const ApsBanner(
            message: "Vous devez être connecté(e) pour envoyer la demande à "
                "la fin du parcours.",
          ),
        ApsFormField(
          label: 'Nom de la compagnie / courtier',
          required: true,
          child: ApsTextInput(
            controller: _nomCtrl,
            hint: 'Ex. Saham Assurance',
            textCapitalization: TextCapitalization.words,
          ),
        ),
        ApsFormField(
          label: "Type d'acteur",
          required: true,
          child: ApsDropdown<TypeActeurAssurance>(
            value: _typeActeur,
            hint: 'Sélectionner…',
            items: TypeActeurAssurance.values,
            itemLabel: _libelleType,
            onChanged: (v) {
              if (v != null) setState(() => _typeActeur = v);
            },
          ),
        ),
        ApsFormField(
          label: 'Logo de la compagnie',
          required: true,
          child: ApsUploadZone(
            fichier: _logo,
            onTap: _choisirLogo,
            onRemove: () => setState(() => _logo = null),
            title: 'Choisir un logo',
            hint: 'JPG, PNG — 5 Mo max',
            icon: Icons.image_outlined,
          ),
        ),
      ],
    );
  }

  // ---- Étape 2 : Localisation -------------------------------------------

  Widget _etape2() {
    return ApsStepBody(
      title: 'Localisation',
      description: 'Le pays et la ville de votre siège ou de votre agence '
          'principale.',
      onBack: _retour,
      error: currentStep == 1 ? _stepError : null,
      onContinue: _continuer,
      children: [
        ApsPaysVilleFields(
          paysId: _pays?.paysId,
          villeId: _ville?.villeId,
          onPaysChanged: (p) => setState(() {
            _pays = p;
            _ville = null;
          }),
          onVilleChanged: (v) => setState(() => _ville = v),
        ),
      ],
    );
  }

  // ---- Étape 3 : Contact -------------------------------------------------

  Widget _etape3() {
    return ApsStepBody(
      title: 'Contact',
      description: 'Email et téléphone de la compagnie.',
      onBack: _retour,
      error: currentStep == 2 ? _stepError : null,
      onContinue: _continuer,
      children: [
        ApsFormField(
          label: 'Email de la compagnie',
          required: true,
          child: ApsTextInput(
            controller: _emailCtrl,
            hint: 'contact@compagnie.cm',
            keyboardType: TextInputType.emailAddress,
          ),
        ),
        ApsFormField(
          label: 'Téléphone',
          required: true,
          child: ApsTextInput(
            controller: _telCtrl,
            hint: '+237 6 XX XX XX XX',
            keyboardType: TextInputType.phone,
          ),
        ),
      ],
    );
  }

  // ---- Étape 4 : Infos supplémentaires -----------------------------------

  Widget _etape4() {
    return ApsStepBody(
      title: 'Infos supplémentaires',
      description: "Numéro d'agrément, présentation et position GPS "
          '(facultative).',
      onBack: _retour,
      error: currentStep == 3 ? _stepError : null,
      onContinue: _continuer,
      children: [
        ApsFormField(
          label: "Numéro d'agrément",
          required: true,
          child: ApsTextInput(
            controller: _agrementCtrl,
            hint: "Numéro d'agrément délivré par l'autorité de tutelle",
            textCapitalization: TextCapitalization.characters,
          ),
        ),
        ApsFormField(
          label: 'Description de la compagnie',
          child: ApsTextArea(
            controller: _descriptionCtrl,
            hint: 'Décrivez brièvement votre compagnie, vos services, etc.',
            maxLength: _descriptionMax,
          ),
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: ApsFormField(
                label: 'Latitude',
                child: ApsTextInput(
                  controller: _latCtrl,
                  hint: 'Ex. 4.0511',
                  keyboardType: const TextInputType.numberWithOptions(
                      decimal: true, signed: true),
                  inputFormatters: [_coordonneeFormatter],
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: ApsFormField(
                label: 'Longitude',
                child: ApsTextInput(
                  controller: _lngCtrl,
                  hint: 'Ex. 9.7679',
                  keyboardType: const TextInputType.numberWithOptions(
                      decimal: true, signed: true),
                  inputFormatters: [_coordonneeFormatter],
                ),
              ),
            ),
          ],
        ),
        const Padding(
          padding: EdgeInsets.only(bottom: 14),
          child: Text(
            'Facultatif : latitude et longitude vont ensemble. Laissez les '
            'deux vides si vous ne connaissez pas la position.',
            style: TextStyle(
              fontFamily: AppTextStyles.fontBody,
              fontSize: 10.5,
              color: AppColors.inkFaint,
              height: 1.5,
            ),
          ),
        ),
      ],
    );
  }

  static final TextInputFormatter _coordonneeFormatter =
      FilteringTextInputFormatter.allow(RegExp(r'[0-9\-\.,]'));

  // ---- Étape 5 : Agent responsable ---------------------------------------

  Widget _etape5() {
    return ApsStepBody(
      title: 'Agent responsable',
      description: 'Un compte est créé pour la personne qui aura la charge de '
          "cette fiche (pas forcément vous). Un mot de passe temporaire lui "
          'sera communiqué à la fin de cette demande.',
      onBack: _retour,
      error: currentStep == 4 ? _stepError : null,
      onContinue: _continuer,
      children: [
        ApsFormField(
          label: "Fonction de l'agent",
          required: true,
          child: ApsTextInput(
            controller: _fonctionCtrl,
            hint: 'Ex. Directeur commercial',
            textCapitalization: TextCapitalization.sentences,
          ),
        ),
        ApsFormField(
          label: 'Nom',
          required: true,
          child: ApsTextInput(
            controller: _agentNomCtrl,
            hint: 'Ex. Mbarga',
            textCapitalization: TextCapitalization.words,
          ),
        ),
        ApsFormField(
          label: 'Prénom',
          required: true,
          child: ApsTextInput(
            controller: _agentPrenomCtrl,
            hint: 'Ex. Sandrine',
            textCapitalization: TextCapitalization.words,
          ),
        ),
        ApsFormField(
          label: "Email de l'agent",
          required: true,
          child: ApsTextInput(
            controller: _agentEmailCtrl,
            hint: 'agent@compagnie.cm',
            keyboardType: TextInputType.emailAddress,
          ),
        ),
        ApsFormField(
          label: "Téléphone de l'agent",
          child: ApsTextInput(
            controller: _agentTelCtrl,
            hint: '+237 6 XX XX XX XX',
            keyboardType: TextInputType.phone,
          ),
        ),
      ],
    );
  }

  // ---- Étape 6 : Confirmation --------------------------------------------

  Widget _etape6(bool connecte, bool envoiEnCours) {
    final localisation = [
      if (_ville != null) _ville!.nom,
      if (_pays != null) _pays!.nom,
    ].join(', ');

    return ApsStepBody(
      title: 'Confirmation',
      description: 'Vérifiez votre demande avant de l\'envoyer.',
      onBack: envoiEnCours ? null : _retour,
      error: currentStep == 5 ? _stepError : null,
      loading: envoiEnCours,
      continueLabel: 'Envoyer ma demande',
      continueIcon: Icons.send_rounded,
      onContinue: _continuer,
      children: [
        ApsSummaryCard(
          title: 'Résumé de votre demande',
          rows: [
            ApsSummaryRow(
                label: 'Compagnie / Courtier', value: _nomCtrl.text.trim()),
            ApsSummaryRow(label: 'Type', value: _libelleType(_typeActeur)),
            ApsSummaryRow(label: 'Localisation', value: localisation),
            ApsSummaryRow(label: 'Email', value: _emailCtrl.text.trim()),
            ApsSummaryRow(
              label: 'Agent responsable',
              value: '${_agentPrenomCtrl.text.trim()} '
                      '${_agentNomCtrl.text.trim()}'
                  .trim(),
            ),
          ],
        ),
        ApsCheckRow(
          label: "J'accepte les Conditions générales d'utilisation et la "
              'Politique de confidentialité.',
          checked: _acceptCgu,
          onTap: () => setState(() => _acceptCgu = !_acceptCgu),
        ),
        const SizedBox(height: 14),
        if (!connecte)
          const ApsBanner(
            message: 'Vous devez être connecté(e) pour envoyer cette demande.',
            error: true,
          ),
        const ApsBanner(
          message: "Votre fiche sera examinée par notre équipe avant "
              "publication dans l'annuaire.",
        ),
      ],
    );
  }

  // ---- Écran de succès -----------------------------------------------------

  Widget _ecranSucces() {
    final reponse = _reponse;
    final nom = reponse?.serviceAssurance.nom ?? _nomCtrl.text.trim();
    final message = reponse?.message ?? '';

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
      child: Column(
        children: [
          ApsSuccessHeader(
            stepCount: stepCount,
            title: 'Demande envoyée',
            subtitle: message.isNotEmpty
                ? message
                : 'Votre ${_typeActeur == TypeActeurAssurance.compagnie ? 'compagnie' : 'fiche de courtier'} '
                    '$nom a été créée. Elle sera visible dans l\'annuaire '
                    'après vérification par notre équipe.',
          ),
          if (reponse != null)
            ApsCredentialsCard(
              email: reponse.agent.utilisateur.email,
              motDePasseTemporaire: reponse.agent.motDePasseTemporaire,
            ),
          const Column(
            children: [
              ApsSuccessNextItem(
                icon: Icons.schedule_rounded,
                title: 'Vérification par notre équipe',
                description:
                    "Nous contrôlons votre agrément avant la mise en ligne.",
              ),
              ApsSuccessNextItem(
                icon: Icons.notifications_none_rounded,
                title: 'Notification à la mise en ligne',
                description:
                    'Vous serez averti dès que la fiche sera visible.',
                showDivider: false,
              ),
            ],
          ),
          const SizedBox(height: 8),
          PrimaryButton(
            label: 'Terminer',
            icon: Icons.arrow_forward_rounded,
            onPressed: () {
              if (reponse != null && widget.onCreee != null) {
                widget.onCreee!(reponse);
              } else {
                Navigator.of(context).popUntil((route) => route.isFirst);
              }
            },
          ),
        ],
      ),
    );
  }
}
