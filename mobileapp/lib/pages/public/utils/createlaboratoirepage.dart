// Parcours « Inscrire mon laboratoire » (5 étapes), équivalent mobile de
// client-plateform/src/components/laboratoire/creationLaboratoire.jsx et
// même gabarit que CreatePharmacieScreen :
//
//   1 Laboratoire · 2 Localisation · 3 Responsable · 4 Justificatifs ·
//   5 Confirmation
//
// Contrat POST /laboratoires (laboratoire.controller.js) : nom, telephone,
// email, agrement, pays_id, ville_id, localisation (+ description,
// latitude/longitude) ; responsable_moi OU compte d'une autre personne
// (agent_nom, agent_prenom, agent_email, agent_telephone) ; fonction ;
// 3 fichiers (image_laboratoire, piece_identite = CNI, document_agrement).
// Route authentifiée : ouverte via ouvrirAvecSession (connexion d'abord).

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/laboratoire_controller.dart';
import '../../../models/laboratoire_models.dart';
import '../../../models/referentiel_models.dart' show Pays, Ville;
import '../../../repositories/laboratoire_repository.dart' show FichierLaboratoire;
import 'aps_pays_ville_fields.dart';

class CreateLaboratoireScreen extends ConsumerStatefulWidget {
  const CreateLaboratoireScreen({super.key});

  @override
  ConsumerState<CreateLaboratoireScreen> createState() => _CreateLaboratoireScreenState();
}

class _CreateLaboratoireScreenState extends ConsumerState<CreateLaboratoireScreen>
    with ApsStepperStateMixin<CreateLaboratoireScreen> {
  @override
  int get stepCount => 5;

  String? _stepError;
  bool _envoi = false;

  final _nomCtrl = TextEditingController();
  final _telCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _agrementCtrl = TextEditingController();
  final _adresseCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  Pays? _pays;
  Ville? _ville;

  final _latCtrl = TextEditingController();
  final _lngCtrl = TextEditingController();

  final _fonctionCtrl = TextEditingController();
  bool _responsableMoi = true;
  final _agentNomCtrl = TextEditingController();
  final _agentPrenomCtrl = TextEditingController();
  final _agentEmailCtrl = TextEditingController();
  final _agentTelCtrl = TextEditingController();

  ApsFichier? _logo;
  ApsFichier? _cni;
  ApsFichier? _agrement;

  bool _acceptCgu = false;
  LaboratoireCreationResultat? _resultat;

  static final RegExp _emailRegExp = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

  @override
  void dispose() {
    for (final c in [
      _nomCtrl, _telCtrl, _emailCtrl, _agrementCtrl, _adresseCtrl, _descriptionCtrl, _latCtrl, _lngCtrl,
      _fonctionCtrl, _agentNomCtrl, _agentPrenomCtrl, _agentEmailCtrl, _agentTelCtrl,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _validerEtape(int etape) {
    switch (etape) {
      case 0:
        if (_nomCtrl.text.trim().isEmpty) return 'Le nom du laboratoire est obligatoire.';
        if (_telCtrl.text.trim().isEmpty) return 'Le téléphone est obligatoire.';
        if (!_emailRegExp.hasMatch(_emailCtrl.text.trim())) return "L'e-mail du laboratoire n'est pas valide.";
        if (_agrementCtrl.text.trim().isEmpty) return "Le numéro d'agrément est obligatoire.";
        if (_pays == null || _ville == null) return 'Le pays et la ville sont obligatoires.';
        if (_adresseCtrl.text.trim().isEmpty) return "L'adresse est obligatoire.";
        return null;
      case 1:
        return apsValiderCoordonnees(_latCtrl.text, _lngCtrl.text);
      case 2:
        if (_fonctionCtrl.text.trim().isEmpty) return 'La fonction du responsable est obligatoire.';
        if (_responsableMoi) return null;
        if (_agentNomCtrl.text.trim().isEmpty || _agentPrenomCtrl.text.trim().isEmpty) {
          return 'Le nom et le prénom du responsable sont obligatoires.';
        }
        if (_agentTelCtrl.text.trim().isEmpty) return 'Le téléphone du responsable est obligatoire.';
        if (!_emailRegExp.hasMatch(_agentEmailCtrl.text.trim())) return "L'e-mail du responsable n'est pas valide.";
        return null;
      case 3:
        if (_logo == null) return 'Le logo ou la photo du laboratoire est obligatoire.';
        if (_cni == null) return 'La CNI du responsable est obligatoire.';
        if (_agrement == null) return "Le document d'agrément est obligatoire.";
        return null;
      case 4:
        return _acceptCgu ? null : 'Vous devez accepter les CGU et la politique de confidentialité.';
    }
    return null;
  }

  void _continuer() {
    FocusScope.of(context).unfocus();
    final erreur = _validerEtape(currentStep);
    setState(() => _stepError = erreur);
    if (erreur != null) return;
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

  Future<void> _choisir(void Function(ApsFichier f) affecter, {List<String> extensions = const ['pdf', 'jpg', 'jpeg', 'png']}) async {
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

  Future<void> _envoyer() async {
    final pays = _pays, ville = _ville, logo = _logo, cni = _cni, agrement = _agrement;
    if (pays == null || ville == null || logo == null || cni == null || agrement == null) return;
    if (ref.read(authTokenProvider) == null) {
      setState(() => _stepError = 'Vous devez être connecté(e) pour envoyer cette demande.');
      return;
    }
    setState(() => _envoi = true);
    final lat = apsParseCoordonnee(_latCtrl.text);
    final lng = apsParseCoordonnee(_lngCtrl.text);
    try {
      final resultat = await appelLaboratoireUi(
        ref,
        (repo, token) => repo.creer(
          token: token,
          champs: {
            'nom': _nomCtrl.text.trim(),
            'telephone': _telCtrl.text.trim(),
            'email': _emailCtrl.text.trim(),
            'agrement': _agrementCtrl.text.trim(),
            'pays_id': pays.paysId,
            'ville_id': ville.villeId,
            'localisation': _adresseCtrl.text.trim(),
            'description': _descriptionCtrl.text.trim(),
            if (lat != null && lng != null) ...{'latitude': '$lat', 'longitude': '$lng'},
            'fonction': _fonctionCtrl.text.trim(),
            if (_responsableMoi) 'responsable_moi': 'true',
            'accepte_cgu': _acceptCgu ? 'true' : 'false',
            if (!_responsableMoi) ...{
              'agent_nom': _agentNomCtrl.text.trim(),
              'agent_prenom': _agentPrenomCtrl.text.trim(),
              'agent_email': _agentEmailCtrl.text.trim(),
              'agent_telephone': _agentTelCtrl.text.trim(),
            },
          },
          image: FichierLaboratoire(logo.octets, logo.nom),
          pieceIdentite: FichierLaboratoire(cni.octets, cni.nom),
          documentAgrement: FichierLaboratoire(agrement.octets, agrement.nom),
        ),
      );
      if (!mounted) return;
      if (resultat.rattacheAuCompte) ref.invalidate(espacesCompteProvider);
      setState(() {
        _resultat = resultat;
        _stepError = null;
      });
      goToStep(stepCount);
    } catch (e) {
      if (mounted) setState(() => _stepError = apsMessageErreur(e));
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final connecte = ref.watch(authTokenProvider) != null;
    return ApsStepperFlow(
      controller: pageController,
      currentStep: currentStep,
      stepCount: stepCount,
      onBack: _retour,
      steps: [_etape1(connecte), _etape2(), _etape3(), _etape4(), _etape5(connecte)],
      successPage: _ecranSucces(),
    );
  }

  Widget _champ(String label, TextEditingController c, String hint,
          {bool requis = true, TextInputType? clavier, TextCapitalization cap = TextCapitalization.none}) =>
      ApsFormField(
        label: label,
        required: requis,
        child: ApsTextInput(controller: c, hint: hint, keyboardType: clavier, textCapitalization: cap),
      );

  Widget _etape1(bool connecte) => ApsStepBody(
        title: 'Votre laboratoire',
        description: "Référencez votre laboratoire dans l'annuaire APS Santé.",
        showBack: false,
        error: currentStep == 0 ? _stepError : null,
        onContinue: _continuer,
        children: [
          if (!connecte) const ApsBanner(message: 'Vous devez être connecté(e) pour envoyer la demande à la fin du parcours.'),
          _champ('Nom du laboratoire', _nomCtrl, 'Ex. Laboratoire Bio-Santé', cap: TextCapitalization.words),
          _champ("N° d'agrément", _agrementCtrl, "Délivré par l'autorité sanitaire", cap: TextCapitalization.characters),
          _champ('Téléphone', _telCtrl, '+237600000000', clavier: TextInputType.phone),
          _champ('E-mail', _emailCtrl, 'contact@laboratoire.cm', clavier: TextInputType.emailAddress),
          ApsPaysVilleFields(
            paysId: _pays?.paysId,
            villeId: _ville?.villeId,
            onPaysChanged: (p) => setState(() {
              _pays = p;
              _ville = null;
            }),
            onVilleChanged: (v) => setState(() => _ville = v),
          ),
          _champ('Adresse', _adresseCtrl, 'Quartier, rue, point de repère', cap: TextCapitalization.sentences),
          ApsFormField(
            label: 'Présentation',
            child: ApsTextArea(controller: _descriptionCtrl, hint: 'Spécialités, équipements, prélèvements à domicile…', maxLength: 2000),
          ),
        ],
      );

  static final TextInputFormatter _coordonnee = FilteringTextInputFormatter.allow(RegExp(r'[0-9\-\.,]'));

  Widget _etape2() => ApsStepBody(
        title: 'Localisation',
        description: "Facultatif : la position GPS permet de proposer l'itinéraire aux patients.",
        onBack: _retour,
        error: currentStep == 1 ? _stepError : null,
        onContinue: _continuer,
        children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: ApsFormField(
                label: 'Latitude',
                child: ApsTextInput(controller: _latCtrl, hint: 'Ex. 4.0511',
                    keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true), inputFormatters: [_coordonnee]),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: ApsFormField(
                label: 'Longitude',
                child: ApsTextInput(controller: _lngCtrl, hint: 'Ex. 9.7679',
                    keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true), inputFormatters: [_coordonnee]),
              ),
            ),
          ]),
        ],
      );

  Widget _etape3() => ApsStepBody(
        title: 'Responsable',
        description: 'La personne qui gérera la fiche, les examens et les centres du laboratoire.',
        onBack: _retour,
        error: currentStep == 2 ? _stepError : null,
        onContinue: _continuer,
        children: [
          _champ('Fonction', _fonctionCtrl, 'Ex. Biologiste responsable, Directeur', cap: TextCapitalization.sentences),
          ApsCheckRow(
            label: 'Je suis le responsable de ce laboratoire : la fiche sera rattachée à mon compte (« Changer d’espace »). '
                'Décochez pour créer le compte d’une autre personne.',
            checked: _responsableMoi,
            onTap: () => setState(() => _responsableMoi = !_responsableMoi),
          ),
          if (!_responsableMoi) ...[
            _champ('Nom', _agentNomCtrl, 'Ex. Mbarga', cap: TextCapitalization.words),
            _champ('Prénom', _agentPrenomCtrl, 'Ex. Sandrine', cap: TextCapitalization.words),
            _champ('Téléphone', _agentTelCtrl, '+237 6 XX XX XX XX', clavier: TextInputType.phone),
            _champ('E-mail', _agentEmailCtrl, 'responsable@laboratoire.cm', clavier: TextInputType.emailAddress),
          ],
        ],
      );

  Widget _etape4() => ApsStepBody(
        title: 'Justificatifs',
        description: "La CNI et l'agrément servent uniquement à la vérification : ils ne sont jamais affichés au public.",
        onBack: _retour,
        error: currentStep == 3 ? _stepError : null,
        onContinue: _continuer,
        children: [
          ApsFormField(
            label: 'Logo / photo du laboratoire',
            required: true,
            child: ApsUploadZone(
              fichier: _logo,
              onTap: () => _choisir((f) => _logo = f, extensions: const ['jpg', 'jpeg', 'png', 'webp']),
              onRemove: () => setState(() => _logo = null),
              title: 'Choisir une image',
              hint: 'JPG, PNG, WEBP — 5 Mo max',
              icon: Icons.image_outlined,
            ),
          ),
          ApsFormField(
            label: 'CNI du responsable',
            required: true,
            child: ApsUploadZone(
              fichier: _cni,
              onTap: () => _choisir((f) => _cni = f),
              onRemove: () => setState(() => _cni = null),
              hint: 'PDF, JPG — 5 Mo max',
            ),
          ),
          ApsFormField(
            label: 'Agrément officiel',
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

  Widget _etape5(bool connecte) => ApsStepBody(
        title: 'Confirmation',
        description: "Vérifiez votre demande avant de l'envoyer.",
        onBack: _envoi ? null : _retour,
        error: currentStep == 4 ? _stepError : null,
        loading: _envoi,
        continueLabel: 'Envoyer ma demande',
        continueIcon: Icons.send_rounded,
        onContinue: _continuer,
        children: [
          ApsSummaryCard(
            title: 'Résumé de votre demande',
            rows: [
              ApsSummaryRow(label: 'Laboratoire', value: _nomCtrl.text.trim()),
              ApsSummaryRow(label: 'Localisation', value: [_adresseCtrl.text.trim(), _ville?.nom, _pays?.nom].whereType<String>().where((s) => s.isNotEmpty).join(', ')),
              ApsSummaryRow(label: 'Téléphone', value: _telCtrl.text.trim()),
              ApsSummaryRow(label: "N° d'agrément", value: _agrementCtrl.text.trim(), mono: true),
              ApsSummaryRow(
                label: 'Responsable',
                value: _responsableMoi ? 'Moi (rattaché à mon compte)' : '${_agentPrenomCtrl.text.trim()} ${_agentNomCtrl.text.trim()}'.trim(),
              ),
            ],
          ),
          ApsCheckRow(
            label: "J'accepte les Conditions générales d'utilisation et la Politique de confidentialité.",
            checked: _acceptCgu,
            contenu: const TexteAcceptationLegale(),
            onTap: () => setState(() => _acceptCgu = !_acceptCgu),
          ),
          const SizedBox(height: 14),
          if (!connecte) const ApsBanner(message: 'Vous devez être connecté(e) pour envoyer cette demande.', error: true),
          const ApsBanner(message: "La fiche sera visible dans l'annuaire après vérification par APS Santé."),
        ],
      );

  Widget _ecranSucces() {
    final r = _resultat;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
      child: Column(children: [
        ApsSuccessHeader(
          stepCount: stepCount,
          title: 'Laboratoire déclaré',
          subtitle: (r?.message.isNotEmpty ?? false)
              ? r!.message
              : "Votre demande a bien été envoyée. La fiche sera visible après vérification.",
        ),
        if (r != null && r.rattacheAuCompte)
          const Padding(
            padding: EdgeInsets.only(bottom: 14),
            child: ApsBanner(message: 'Ce laboratoire est rattaché à votre compte : retrouvez-le dans « Changer d’espace ».'),
          ),
        if (r != null && !r.rattacheAuCompte && r.agentEmail != null)
          ApsCredentialsCard(email: r.agentEmail!, motDePasseTemporaire: r.motDePasseTemporaire),
        const ApsSuccessNextItem(
          icon: Icons.schedule_rounded,
          title: 'Vérification par notre équipe',
          description: 'Nous contrôlons votre agrément et la CNI du responsable.',
        ),
        const ApsSuccessNextItem(
          icon: Icons.science_outlined,
          title: 'Complétez votre fiche',
          description: 'Ajoutez vos examens, vos centres et vos photos depuis votre espace laboratoire.',
          showDivider: false,
        ),
        const SizedBox(height: 8),
        PrimaryButton(
          label: 'Terminer',
          icon: Icons.arrow_forward_rounded,
          onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst),
        ),
      ]),
    );
  }
}
