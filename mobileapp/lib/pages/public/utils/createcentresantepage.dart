// Parcours de déclaration d'un centre de santé — « Déclarer mon centre de
// santé » (5 étapes), équivalent mobile de
// client-plateform/src/components/centre-sante/creationCentreSante.jsx.
//
//   1 Informations · 2 Localisation · 3 Agent responsable ·
//   4 Justificatifs · 5 Confirmation
//
// Suit le contrat RÉEL de POST /centres-sante (centreSante.controller.js) :
//   - obligatoires : nom, type_structure, pays_id, ville_id, telephone,
//     fonction, agent_nom, agent_prenom, agent_email + 3 fichiers
//     (image_structure, piece_identite, document_agrement) ;
//   - optionnels : latitude/longitude (ensemble ou pas du tout),
//     agent_telephone.
// La route crée EN MÊME TEMPS la fiche et le compte de l'agent responsable :
// le mot de passe temporaire n'est renvoyé qu'une seule fois et n'est
// affiché que sur l'écran de succès (voir ApsCredentialsCard).
//
// ⚠️ Écarts volontaires avec creationCentreSante.jsx : le formulaire web
// « calque » la pharmacie avec des noms de champs SUPPOSÉS (son en-tête le
// précise) qui ne correspondent pas au backend. Ici on suit le backend et
// [CentreSanteCreationRequete] :
//   - `type_structure` (clinique, hopital, centre_medical, dispensaire,
//     laboratoire) et non `type_etablissement` avec ses libellés libres ;
//   - fichiers `image_structure` / `document_agrement` et non
//     `image_centre` / `document_autorisation` ;
//   - pas de « numéro d'autorisation d'exercice » : le backend ne le lit pas
//     et le modèle mobile n'a pas ce champ.
//
// `statut_verification` : exigé par le modèle de requête mais forcé à
// `en_cours` par le backend pour un appelant non admin.
//
// ⚠️ Cette route est authentifiée (`authentifier` dans
// centreSante.routes.js) : l'envoi exige une session ouverte
// ([authTokenProvider]).
//
// Étape 2 « Localisation » : le web propose une carte (GoogleMapPicker) et
// « Utiliser ma position actuelle ». Aucun package carte/géolocalisation
// n'est présent dans pubspec.yaml ; l'étape propose donc la saisie manuelle
// de la latitude/longitude, facultative comme sur le web.
//
// Utilisation :
// ```dart
// Navigator.of(context).push(
//   MaterialPageRoute(builder: (_) => const CreateCentreSanteScreen()),
// );
// ```
// Nécessite un `ProviderScope` à la racine (déjà en place dans main.dart).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/centresante_controller.dart';
import '../../../models/centresante_models.dart';
import '../../../models/referentiel_models.dart' show Pays, Ville;
import 'aps_pays_ville_fields.dart';

class CreateCentreSanteScreen extends ConsumerStatefulWidget {
  const CreateCentreSanteScreen({super.key, this.onCreee});

  /// Appelé par le bouton « Terminer » de l'écran de succès, avec le
  /// réponse complète de POST /centres-sante. Si `null`, l'écran revient à la
  /// racine de la navigation.
  final ValueChanged<CentreSanteCreationReponse>? onCreee;

  @override
  ConsumerState<CreateCentreSanteScreen> createState() =>
      _CreateCentreSanteScreenState();
}

class _CreateCentreSanteScreenState extends ConsumerState<CreateCentreSanteScreen>
    with ApsStepperStateMixin<CreateCentreSanteScreen> {
  @override
  int get stepCount => 5;

  late final CreationCentreSanteController _creation;

  /// Message de validation de l'étape courante (équivalent de `stepError`
  /// côté web).
  String? _stepError;

  // ---- Étape 1 — Informations ---------------------------------------------
  final _nomCtrl = TextEditingController();
  final _telCtrl = TextEditingController();
  TypeStructure? _typeStructure;
  Pays? _pays;
  Ville? _ville;

  // ---- Étape 2 — Localisation (facultative) --------------------------------
  final _latCtrl = TextEditingController();
  final _lngCtrl = TextEditingController();

  // ---- Étape 3 — Agent responsable -------------------------------------------
  final _fonctionCtrl = TextEditingController();
  final _agentNomCtrl = TextEditingController();
  final _agentPrenomCtrl = TextEditingController();
  final _agentEmailCtrl = TextEditingController();
  final _agentTelCtrl = TextEditingController();

  // ---- Étape 4 — Justificatifs -------------------------------------------------
  ApsFichier? _photo;
  ApsFichier? _pieceIdentite;
  ApsFichier? _agrement;

  // ---- Étape 5 — Confirmation ----------------------------------------------------
  bool _acceptCgu = false;
  CentreSanteCreationReponse? _resultat;

  @override
  void initState() {
    super.initState();
    _creation = ref.read(creationCentreSanteControllerProvider.notifier);
  }

  @override
  void dispose() {
    // Le mot de passe temporaire de l'agent ne doit pas rester en mémoire
    // une fois l'écran quitté. Différé : on ne modifie pas un provider
    // pendant le démontage.
    final creation = _creation;
    Future(() {
      try {
        creation.reinitialiser();
      } catch (_) {}
    });
    for (final c in [
      _nomCtrl,
      _telCtrl,
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
          return 'Le nom du centre de santé est obligatoire.';
        }
        if (_typeStructure == null) {
          return "Le type d'établissement est obligatoire.";
        }
        if (_telCtrl.text.trim().isEmpty) return 'Le téléphone est obligatoire.';
        if (_pays == null) return 'Le pays est obligatoire.';
        if (_ville == null) return 'La ville est obligatoire.';
        return null;
      case 1:
        return apsValiderCoordonnees(_latCtrl.text, _lngCtrl.text);
      case 2:
        if (_fonctionCtrl.text.trim().isEmpty) {
          return "La fonction de l'agent est obligatoire.";
        }
        if (_agentNomCtrl.text.trim().isEmpty) {
          return "Le nom de l'agent est obligatoire.";
        }
        if (_agentPrenomCtrl.text.trim().isEmpty) {
          return "Le prénom de l'agent est obligatoire.";
        }
        final agentEmail = _agentEmailCtrl.text.trim();
        if (agentEmail.isEmpty) return "L'e-mail de l'agent est obligatoire.";
        if (!_emailRegExp.hasMatch(agentEmail)) {
          return "L'e-mail de l'agent n'est pas valide.";
        }
        return null;
      case 3:
        if (_photo == null) {
          return 'La photo du centre de santé est obligatoire.';
        }
        if (_pieceIdentite == null) {
          return "La pièce d'identité du responsable est obligatoire.";
        }
        if (_agrement == null) {
          return "Le document d'autorisation officielle est obligatoire.";
        }
        return null;
      case 4:
        if (!_acceptCgu) {
          return 'Vous devez accepter les CGU et la politique de confidentialité.';
        }
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

  Future<void> _choisir(
    void Function(ApsFichier fichier) affecter, {
    List<String> extensions = const ['pdf', 'jpg', 'jpeg', 'png'],
  }) async {
    try {
      final fichier = await apsChoisirFichier(extensions: extensions);
      if (fichier == null || !mounted) return;
      setState(() {
        affecter(fichier);
        _stepError = null;
      });
    } on ApsFichierException catch (e) {
      showError(e.message);
    }
  }

  // ------------------------------------------------------------------
  // Soumission — POST /centres-sante
  // ------------------------------------------------------------------

  Future<void> _envoyer() async {
    final pays = _pays;
    final ville = _ville;
    final type = _typeStructure;
    final photo = _photo;
    final piece = _pieceIdentite;
    final agrement = _agrement;
    if (pays == null ||
        ville == null ||
        type == null ||
        photo == null ||
        piece == null ||
        agrement == null) {
      return;
    }

    final token = ref.read(authTokenProvider);
    if (token == null) {
      setState(() => _stepError =
          'Vous devez être connecté(e) pour envoyer cette demande.');
      return;
    }

    final agentTel = _agentTelCtrl.text.trim();

    final requete = CentreSanteCreationRequete(
      nom: _nomCtrl.text.trim(),
      paysId: pays.paysId,
      villeId: ville.villeId,
      telephone: _telCtrl.text.trim(),
      // Le backend force « en_cours » hors admin (circuit de modération).
      statutVerification: StatutVerificationStructure.enCours,
      typeStructure: type,
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
      imageStructureOctets: photo.octets,
      imageStructureNomFichier: photo.nom,
      pieceIdentiteOctets: piece.octets,
      pieceIdentiteNomFichier: piece.nom,
      documentAgrementOctets: agrement.octets,
      documentAgrementNomFichier: agrement.nom,
      token: token,
    );
    if (!mounted) return;

    final etat = ref.read(creationCentreSanteControllerProvider);
    if (etat.hasError) {
      setState(() => _stepError = apsMessageErreur(etat.error!));
      return;
    }
    final resultat = etat.value;
    if (resultat == null) return;
    setState(() {
      _resultat = resultat;
      _stepError = null;
    });
    goToStep(stepCount); // écran de succès
  }

  // ------------------------------------------------------------------
  // Build
  // ------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final envoiEnCours =
        ref.watch(creationCentreSanteControllerProvider).isLoading;
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
        _etape5(connecte, envoiEnCours),
      ],
      successPage: _ecranSucces(),
    );
  }

  // ---- Étape 1 : Informations --------------------------------------------

  Widget _etape1(bool connecte) {
    return ApsStepBody(
      title: 'Informations du centre',
      description: "Déclarez votre centre de santé dans l'annuaire. Quelques "
          'minutes suffisent.',
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
          label: 'Nom du centre de santé',
          required: true,
          child: ApsTextInput(
            controller: _nomCtrl,
            hint: 'Ex. Centre de Santé Intégré de Biyem-Assi',
            textCapitalization: TextCapitalization.words,
          ),
        ),
        ApsFormField(
          label: "Type d'établissement",
          required: true,
          child: ApsDropdown<TypeStructure>(
            value: _typeStructure,
            hint: 'Sélectionner…',
            items: TypeStructure.values,
            itemLabel: (t) => t.libelle,
            onChanged: (v) => setState(() => _typeStructure = v),
          ),
        ),
        ApsFormField(
          label: 'Téléphone',
          required: true,
          child: ApsTextInput(
            controller: _telCtrl,
            hint: '+237600000000',
            keyboardType: TextInputType.phone,
          ),
        ),
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

  // ---- Étape 2 : Localisation ------------------------------------------------

  static final TextInputFormatter _coordonneeFormatter =
      FilteringTextInputFormatter.allow(RegExp(r'[0-9\-\.,]'));

  Widget _etape2() {
    return ApsStepBody(
      title: 'Localisation',
      description: "Facultatif : indiquez la position GPS du centre "
          "pour qu'il apparaisse précisément dans l'annuaire. Vous pouvez "
          'passer cette étape.',
      onBack: _retour,
      error: currentStep == 1 ? _stepError : null,
      onContinue: _continuer,
      children: [
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
            'Latitude et longitude vont ensemble : renseignez les deux ou '
            'laissez-les vides.',
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

  // ---- Étape 3 : Agent responsable -----------------------------------------------

  Widget _etape3() {
    return ApsStepBody(
      title: 'Agent responsable',
      description: 'Un compte est créé pour la personne qui aura la charge de '
          'ce centre (pas forcément vous). Un mot de passe temporaire lui '
          'sera communiqué à la fin de cette demande.',
      onBack: _retour,
      error: currentStep == 2 ? _stepError : null,
      onContinue: _continuer,
      children: [
        ApsFormField(
          label: "Fonction de l'agent",
          required: true,
          child: ApsTextInput(
            controller: _fonctionCtrl,
            hint: 'Ex. Directeur, Administrateur',
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
          label: "E-mail de l'agent",
          required: true,
          child: ApsTextInput(
            controller: _agentEmailCtrl,
            hint: 'agent@centre.cm',
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

  // ---- Étape 4 : Justificatifs --------------------------------------------------------

  Widget _etape4() {
    return ApsStepBody(
      title: 'Justificatifs',
      description: 'Les 3 pièces sont obligatoires. Votre fiche restera en '
          "attente de vérification tant qu'un administrateur ne l'a pas "
          'validée.',
      onBack: _retour,
      error: currentStep == 3 ? _stepError : null,
      onContinue: _continuer,
      children: [
        ApsFormField(
          label: 'Photo du centre de santé',
          required: true,
          child: ApsUploadZone(
            fichier: _photo,
            onTap: () => _choisir((f) => _photo = f,
                extensions: const ['jpg', 'jpeg', 'png']),
            onRemove: () => setState(() => _photo = null),
            title: 'Choisir une photo',
            hint: 'JPG, PNG — 5 Mo max',
            icon: Icons.image_outlined,
          ),
        ),
        ApsFormField(
          label: "Pièce d'identité du responsable",
          required: true,
          child: ApsUploadZone(
            fichier: _pieceIdentite,
            onTap: () => _choisir((f) => _pieceIdentite = f),
            onRemove: () => setState(() => _pieceIdentite = null),
            hint: 'PDF, JPG — 5 Mo max',
          ),
        ),
        ApsFormField(
          label: "Autorisation officielle d'exercice",
          required: true,
          child: ApsUploadZone(
            fichier: _agrement,
            onTap: () => _choisir((f) => _agrement = f),
            onRemove: () => setState(() => _agrement = null),
            hint: 'PDF, JPG — 5 Mo max',
          ),
        ),
      ],
    );
  }

  // ---- Étape 5 : Confirmation ------------------------------------------------------------

  Widget _etape5(bool connecte, bool envoiEnCours) {
    final localisation = [
      if (_ville != null) _ville!.nom,
      if (_pays != null) _pays!.nom,
    ].join(', ');

    return ApsStepBody(
      title: 'Confirmation',
      description: "Vérifiez votre demande avant de l'envoyer.",
      onBack: envoiEnCours ? null : _retour,
      error: currentStep == 4 ? _stepError : null,
      loading: envoiEnCours,
      continueLabel: 'Envoyer ma demande',
      continueIcon: Icons.send_rounded,
      onContinue: _continuer,
      children: [
        ApsSummaryCard(
          title: 'Résumé de votre demande',
          rows: [
            ApsSummaryRow(label: 'Centre de santé', value: _nomCtrl.text.trim()),
            ApsSummaryRow(
              label: 'Type',
              value: _typeStructure?.libelle ?? '',
            ),
            ApsSummaryRow(label: 'Localisation', value: localisation),
            ApsSummaryRow(label: 'Téléphone', value: _telCtrl.text.trim()),
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
          message: "La fiche sera visible dans l'annuaire après vérification "
              'par un administrateur.',
        ),
      ],
    );
  }

  // ---- Écran de succès ------------------------------------------------------------------------

  Widget _ecranSucces() {
    final resultat = _resultat;
    final message = resultat?.message ?? '';

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
      child: Column(
        children: [
          ApsSuccessHeader(
            stepCount: stepCount,
            title: 'Centre de santé déclaré',
            subtitle: message.isNotEmpty
                ? message
                : "Votre demande a bien été envoyée. La fiche sera visible "
                    "dans l'annuaire après vérification par un administrateur.",
          ),
          if (resultat != null)
            ApsCredentialsCard(
              email: resultat.agent.utilisateur.email,
              motDePasseTemporaire: resultat.agent.motDePasseTemporaire,
            ),
          const Column(
            children: [
              ApsSuccessNextItem(
                icon: Icons.schedule_rounded,
                title: 'Vérification par notre équipe',
                description:
                    "Nous contrôlons votre autorisation et vos justificatifs.",
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
              if (resultat != null && widget.onCreee != null) {
                widget.onCreee!(resultat);
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
