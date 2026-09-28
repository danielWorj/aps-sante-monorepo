// Parcours de déclaration d'une pharmacie — « Déclarer ma pharmacie »
// (5 étapes), équivalent mobile de
// client-plateform/src/components/pharmacie/creationPharmacie.jsx.
//
//   1 Informations · 2 Localisation · 3 Agent responsable ·
//   4 Justificatifs · 5 Confirmation
//
// Suit le contrat de POST /pharmacies (pharmacie.controller.js) :
//   - obligatoires : nom, pays_id, ville_id, telephone,
//     numero_ordre_titulaire, fonction, agent_nom, agent_prenom,
//     agent_email + 3 fichiers (image_pharmacie, piece_identite,
//     document_agrement) ;
//   - optionnels : latitude/longitude (ensemble ou pas du tout),
//     agent_telephone.
// La route crée EN MÊME TEMPS la fiche et le compte de l'agent responsable :
// le mot de passe temporaire n'est renvoyé qu'une seule fois et n'est
// affiché que sur l'écran de succès (voir ApsCredentialsCard).
//
// `statut_verification` : exigé par [PharmacieRepository.creerPharmacie]
// mais ignoré par le backend pour un appelant non admin (forcé à
// `en_cours`). On envoie donc `enCours`, la seule valeur cohérente avec ce
// que le serveur appliquera.
//
// ⚠️ Cette route est authentifiée (`authentifier` dans pharmacie.routes.js) :
// l'envoi exige une session ouverte ([authTokenProvider]).
//
// Étape 2 « Localisation » : le web propose une carte (GoogleMapPicker) et
// « Utiliser ma position actuelle ». Aucun package carte/géolocalisation
// n'est présent dans pubspec.yaml ; l'étape propose donc la saisie manuelle
// de la latitude/longitude, facultative comme sur le web.
//
// Utilisation :
// ```dart
// Navigator.of(context).push(
//   MaterialPageRoute(builder: (_) => const CreatePharmacieScreen()),
// );
// ```
// Nécessite un `ProviderScope` à la racine (déjà en place dans main.dart).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/pharmacie_controller.dart';
import '../../../models/pharmacie_models.dart';
import '../../../models/referentiel_models.dart' show Pays, Ville;
import '../../../repositories/pharmacie_repository.dart'
    show PharmacieCreationResultat;
import 'aps_pays_ville_fields.dart';

class CreatePharmacieScreen extends ConsumerStatefulWidget {
  const CreatePharmacieScreen({super.key, this.onCreee});

  /// Appelé par le bouton « Terminer » de l'écran de succès, avec le
  /// résultat complet de POST /pharmacies. Si `null`, l'écran revient à la
  /// racine de la navigation.
  final ValueChanged<PharmacieCreationResultat>? onCreee;

  @override
  ConsumerState<CreatePharmacieScreen> createState() =>
      _CreatePharmacieScreenState();
}

class _CreatePharmacieScreenState extends ConsumerState<CreatePharmacieScreen>
    with ApsStepperStateMixin<CreatePharmacieScreen> {
  @override
  int get stepCount => 5;

  late final CreationPharmacieController _creation;

  /// Message de validation de l'étape courante (équivalent de `stepError`
  /// côté web).
  String? _stepError;

  // ---- Étape 1 — Informations ---------------------------------------------
  final _nomCtrl = TextEditingController();
  final _telCtrl = TextEditingController();
  final _numeroOrdreCtrl = TextEditingController();
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
  PharmacieCreationResultat? _resultat;

  @override
  void initState() {
    super.initState();
    _creation = ref.read(creationPharmacieControllerProvider.notifier);
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
      _numeroOrdreCtrl,
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
          return 'Le nom de la pharmacie est obligatoire.';
        }
        if (_telCtrl.text.trim().isEmpty) return 'Le téléphone est obligatoire.';
        if (_pays == null) return 'Le pays est obligatoire.';
        if (_ville == null) return 'La ville est obligatoire.';
        if (_numeroOrdreCtrl.text.trim().isEmpty) {
          return "Le numéro d'ordre du titulaire est obligatoire.";
        }
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
        if (_photo == null) return 'La photo de la pharmacie est obligatoire.';
        if (_pieceIdentite == null) {
          return "La pièce d'identité du titulaire/responsable est obligatoire.";
        }
        if (_agrement == null) {
          return "Le document d'agrément officiel est obligatoire.";
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
  // Soumission — POST /pharmacies
  // ------------------------------------------------------------------

  Future<void> _envoyer() async {
    final pays = _pays;
    final ville = _ville;
    final photo = _photo;
    final piece = _pieceIdentite;
    final agrement = _agrement;
    if (pays == null ||
        ville == null ||
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

    await _creation.soumettre(
      token: token,
      nom: _nomCtrl.text.trim(),
      paysId: pays.paysId,
      villeId: ville.villeId,
      telephone: _telCtrl.text.trim(),
      statutVerification: StatutVerificationPharmacie.enCours,
      numeroOrdreTitulaire: _numeroOrdreCtrl.text.trim(),
      imageOctets: photo.octets,
      imageNomFichier: photo.nom,
      pieceIdentiteOctets: piece.octets,
      pieceIdentiteNomFichier: piece.nom,
      documentAgrementOctets: agrement.octets,
      documentAgrementNomFichier: agrement.nom,
      fonction: _fonctionCtrl.text.trim(),
      agentNom: _agentNomCtrl.text.trim(),
      agentPrenom: _agentPrenomCtrl.text.trim(),
      agentEmail: _agentEmailCtrl.text.trim(),
      agentTelephone: agentTel.isEmpty ? null : agentTel,
      latitude: apsParseCoordonnee(_latCtrl.text),
      longitude: apsParseCoordonnee(_lngCtrl.text),
    );
    if (!mounted) return;

    final etat = ref.read(creationPharmacieControllerProvider);
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
        ref.watch(creationPharmacieControllerProvider).isLoading;
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
      title: 'Informations de la pharmacie',
      description: "Déclarez votre pharmacie dans l'annuaire. Quelques "
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
          label: 'Nom de la pharmacie',
          required: true,
          child: ApsTextInput(
            controller: _nomCtrl,
            hint: 'Ex. Pharmacie du Centre',
            textCapitalization: TextCapitalization.words,
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
        ApsFormField(
          label: "Numéro d'ordre du titulaire",
          required: true,
          child: ApsTextInput(
            controller: _numeroOrdreCtrl,
            hint: "Numéro délivré par l'ordre des pharmaciens",
            textCapitalization: TextCapitalization.characters,
          ),
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
      description: "Facultatif : indiquez la position GPS de la pharmacie "
          "pour qu'elle apparaisse précisément dans l'annuaire. Vous pouvez "
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
          'cette pharmacie (pas forcément vous). Un mot de passe temporaire '
          'lui sera communiqué à la fin de cette demande.',
      onBack: _retour,
      error: currentStep == 2 ? _stepError : null,
      onContinue: _continuer,
      children: [
        ApsFormField(
          label: "Fonction de l'agent",
          required: true,
          child: ApsTextInput(
            controller: _fonctionCtrl,
            hint: 'Ex. Titulaire, Pharmacien assistant',
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
            hint: 'agent@pharmacie.cm',
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
          label: 'Photo de la pharmacie',
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
          label: "Agrément officiel d'exercice",
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
            ApsSummaryRow(label: 'Pharmacie', value: _nomCtrl.text.trim()),
            ApsSummaryRow(label: 'Localisation', value: localisation),
            ApsSummaryRow(label: 'Téléphone', value: _telCtrl.text.trim()),
            ApsSummaryRow(
              label: "N° d'ordre du titulaire",
              value: _numeroOrdreCtrl.text.trim(),
              mono: true,
            ),
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
            title: 'Pharmacie déclarée',
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
                    "Nous contrôlons votre agrément et vos justificatifs.",
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
