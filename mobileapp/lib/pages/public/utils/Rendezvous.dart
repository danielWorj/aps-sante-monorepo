import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:riverpod/riverpod.dart';

// Si votre projet utilise des imports package (ex: package:aps/...),
// remplacez la ligne ci-dessous par :
// import 'package:aps/components/components.dart';
import '../.././../components/components.dart';
import './Confirmationrdv.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/rendez_vous_controller.dart';
import '../../../models/authentification_models.dart';
import '../../../models/rendez_vous_models.dart';
import '../../../models/referentiel_models.dart';
import '../../../repositories/referentiel_repository.dart';
import '../../../utils/api_client.dart';

/// Container Riverpod utilisé par cet écran.
///
/// ⚠️ Même remarque que dans `Medecinpage.dart` : `rendez_vous_controller.dart`
/// s'appuie sur `package:riverpod/riverpod.dart` (pas `flutter_riverpod`), il
/// n'y a donc pas de `ConsumerWidget`/`WidgetRef` ici — on s'appuie sur un
/// [ProviderContainer] explicite, lu directement (pas de `listen` : cet
/// écran ne fait qu'une seule action ponctuelle, la réservation, dont le
/// résultat est déjà géré localement via [_reservationEnCours]/try-catch).
///
/// Idéal : réutiliser le container global unique de l'app (créé une seule
/// fois dans `main.dart`) via [RendezVousPage.container] plutôt que cette
/// instance de repli, pour partager la même session HTTP/[ApiClient] que
/// `MedecinPage`/`DetailMedecinPage`.
final ProviderContainer rendezVousProviderContainer = ProviderContainer();

/// Un horaire proposé au sein d'un [CreneauJour] — `.slot` de la maquette.
class CreneauHoraire {
  const CreneauHoraire({required this.heure, this.disponible = true});

  /// Ex: « 09:00 ».
  final String heure;

  /// `false` si le créneau est déjà pris (`.slot.taken` — non sélectionnable).
  final bool disponible;
}

/// Un jour proposé dans le sélecteur de dates — `.date-pill` / `.slot-grid`.
class CreneauJour {
  const CreneauJour({required this.date, required this.creneaux});

  final DateTime date;
  final List<CreneauHoraire> creneaux;

  static const List<String> _joursAbreges = [
    'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM',
  ];

  /// Ex: « JEU ».
  String get jourAbrege => _joursAbreges[date.weekday - 1];

  /// Ex: « 28 ».
  int get numeroJour => date.day;

  bool get aDesCreneauxLibres => creneaux.any((c) => c.disponible);

  /// Jeu de données de démonstration — reprend l'exemple de la maquette
  /// (5 jours, créneaux 09:00 → 16:30, un créneau déjà pris).
  ///
  /// À remplacer par un appel réel (GET /medecins/:id/creneaux) dès que le
  /// module Rendez-vous/Agenda existe côté API — voir
  /// [RendezVousPage.onChargerCreneaux].
  static List<CreneauJour> demo({DateTime? depuis}) {
    final base = depuis ?? DateTime.now();
    const heuresType = ['09:00', '10:00', '11:30', '14:30', '15:00', '16:30'];
    return List.generate(5, (i) {
      final jour = base.add(Duration(days: i));
      return CreneauJour(
        date: jour,
        creneaux: [
          for (var h = 0; h < heuresType.length; h++)
            CreneauHoraire(
              heure: heuresType[h],
              // Un créneau sur trois indisponible, pour illustrer l'état
              // `.taken` de la maquette.
              disponible: (i + h) % 3 != 0,
            ),
        ],
      );
    });
  }
}

/// Option affichée dans le sélecteur « Pays » du formulaire de création
/// de compte intégré à [RendezVousPage] (voir [RendezVousPage.paysDisponibles]).
///
/// [id] doit correspondre au `pays_id` (UUID) attendu par
/// POST /auth/register (référentiel pays côté backend, voir
/// [InscriptionPayload.paysId]) — l'écran charge désormais la vraie
/// liste via [ReferentielRepository.listerPays] dans
/// [_RendezVousPageState._chargerPaysDisponibles] ; [_paysDemo]
/// ci-dessous ne sert plus que de repli visuel pendant le chargement
/// initial ou en cas d'échec réseau (ses `id` NE SONT PAS des UUID
/// valides et ne doivent jamais être envoyés tels quels au backend).
class PaysOption {
  const PaysOption({required this.id, required this.libelle});

  final String id;
  final String libelle;
}

/// Jeu de données de secours (repli UI uniquement, voir doc ci-dessus) —
/// jamais transmis au backend : [_RendezVousPageState._onPaysConfirme]
/// bloque la soumission tant que le référentiel réel n'a pas répondu.
const List<PaysOption> _paysDemo = [
  PaysOption(id: 'cm', libelle: 'Cameroun'),
  PaysOption(id: 'td', libelle: 'Tchad'),
  PaysOption(id: 'cg', libelle: 'Congo'),
  PaysOption(id: 'ga', libelle: 'Gabon'),
  PaysOption(id: 'cf', libelle: 'République centrafricaine'),
  PaysOption(id: 'gq', libelle: 'Guinée équatoriale'),
];

const List<String> _moisFr = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

String _formaterDate(DateTime date) =>
    '${date.day} ${_moisFr[date.month - 1]}';

/// Onglets affichés en haut de l'écran, cohérents avec [DetailMedecinPage].
enum _RdvTab { profil, disponibilites, avis }

/// Page publique — **Réserver un créneau**.
///
/// Reproduit l'écran « Réserver un créneau » de la maquette `ui-mobile.html`
/// (device n°9) : bandeau médecin, onglets Profil / Disponibilités / Avis,
/// sélecteur de dates (`date-strip`), grille de créneaux (`slot-grid`),
/// encart d'information sur le paiement sous séquestre (escrow) et une
/// barre d'action fixe en bas d'écran (`sticky-cta`) avec le montant et le
/// bouton « Réserver ce créneau ».
///
/// Consomme désormais la vraie API du module transverse "Gestion des
/// médecins" — périmètre Rendez-vous (`rendez_vous_repository.dart` /
/// `rendez_vous_controller.dart`) :
///   - **Réservation** — [onConfirmerReservation] appelle par défaut
///     POST /rendez-vous via [rendezVousRepositoryProvider], avec un
///     [CreerRendezVousPayload] construit à partir de [medecinId]
///     (jamais un autre médecin : c'est la garantie que le rendez-vous
///     réservé ici est bien lié au praticien affiché à l'écran),
///     [structureId], du type choisi ([TypeRdv.physique] ou
///     [TypeRdv.teleconsultation], sélectionnable seulement si
///     [teleconsultationDisponible] est vrai) et de la date/heure du
///     créneau choisi. Réservé à un compte patient authentifié — [token]
///     est donc requis pour réserver (le patient_id est déduit du token
///     côté backend, jamais saisi ici).
///   - **Créneaux** — [onChargerCreneaux] → GET /medecins/:id/creneaux.
///     ⚠️ Ce endpoint (module Agenda) n'existe pas encore côté API dans
///     ce projet : tant qu'aucun callback n'est fourni, l'écran retombe
///     sur des données de démonstration ([CreneauJour.demo]) — à
///     remplacer dès que l'Agenda existera, sans rien changer au reste
///     de l'écran (même contrat `Future<List<CreneauJour>>`).
///
/// ⚠️ **Patient sans compte** — si [token] est `null` (et qu'aucun
/// [onConfirmerReservation] personnalisé n'est fourni), l'écran affiche
/// directement, sous le sélecteur de créneau, un formulaire compact de
/// création de compte patient (voir [_buildCompteSection]). À la
/// validation du bouton d'action fixe, l'écran :
///   1. appelle POST /auth/register ([AuthentificationRepository.inscrire]) ;
///   2. enchaîne aussitôt sur POST /auth/login via
///      [sessionControllerProvider] pour obtenir un access token (le
///      backend ne renvoie jamais de token sur /register — voir
///      [InscriptionResultat]) ;
///   3. réutilise ce token, sans ressaisie, pour la réservation
///      POST /rendez-vous ci-dessus ([_reservationParDefaut]) ;
///   4. affiche une confirmation unique couvrant à la fois la création
///      du compte et la réservation.
/// Le patient n'a donc à remplir le formulaire et valider **qu'une
/// seule fois**. En cas de compte déjà existant, préférer pousser
/// l'écran de connexion et ne construire [RendezVousPage] qu'une fois
/// [token] connu — [onSeConnecter], si fourni, permet d'offrir ce
/// raccourci directement depuis le formulaire.
///
/// Destinée à être **poussée** depuis la fiche du praticien
/// ([DetailMedecinPage], onglet « Disponibilités ») ou depuis l'annuaire
/// ([MedecinPage], bouton « Prendre rendez-vous »), avec le [Medecin]
/// déjà chargé par ces écrans :
///
/// ```dart
/// Navigator.of(context).push(
///   MaterialPageRoute(
///     builder: (_) => RendezVousPage(
///       container: _container, // même ProviderContainer que MedecinPage
///       token: widget.token!, // patient authentifié
///       medecinId: medecin.medecinId,
///       medecinNom: '${medecin.utilisateur?.prenom ?? ''} ${medecin.utilisateur?.nom ?? ''}',
///       medecinSpecialite: medecin.specialite?.nom ?? '',
///       medecinVille: medecin.villeExercice?.nom,
///       tarifFcfa: medecin.tarifIndicatif.round(),
///       teleconsultationDisponible: medecin.teleconsultationActivee,
///     ),
///   ),
/// );
/// ```
class RendezVousPage extends StatefulWidget {
  const RendezVousPage({
    super.key,
    required this.medecinId,
    required this.medecinNom,
    required this.medecinSpecialite,
    this.container,
    this.token,
    this.medecinVille,
    this.structureId,
    this.tarifFcfa,
    this.teleconsultationDisponible = false,
    this.onChargerCreneaux,
    this.onConfirmerReservation,
    this.onVoirProfil,
    this.onVoirAvis,
    this.paysDisponibles = _paysDemo,
    this.onSeConnecter,
    this.onVoirMesRendezVous,
    this.onRetourAccueil,
  });

  /// Container Riverpod à utiliser (idéalement le même que celui déjà
  /// utilisé par `MedecinPage`/`DetailMedecinPage`, pour partager la même
  /// instance d'[ApiClient]). Si `null`, replie sur
  /// [rendezVousProviderContainer].
  final ProviderContainer? container;

  /// Token de session du patient authentifié. **Requis pour réserver**
  /// (POST /rendez-vous exige déjà "authentifier" côté backend — voir
  /// l'en-tête de [RendezVousRepository]) : si `null` au moment de
  /// confirmer, l'écran affiche un message invitant à se connecter plutôt
  /// que de tenter un appel voué à un 401.
  final String? token;

  /// Identifiant du médecin réservé : c'est ce qui **lie** ce rendez-vous
  /// au bon praticien — transmis tel quel à [onChargerCreneaux] et injecté
  /// dans [CreerRendezVousPayload.medecinId] par la réservation par défaut.
  final String medecinId;

  final String medecinNom;
  final String medecinSpecialite;
  final String? medecinVille;

  /// Cabinet/structure associé au rendez-vous (uniquement pertinent pour un
  /// rendez-vous [TypeRdv.physique] ; laisser `null` pour un médecin en
  /// exercice libéral ou pour une téléconsultation).
  final String? structureId;

  /// Tarif indicatif en FCFA, affiché dans la barre d'action fixe.
  final int? tarifFcfa;

  /// `medecin.teleconsultationActivee` — si `true`, l'écran propose un
  /// choix Physique / Téléconsultation ; sinon le rendez-vous est
  /// systématiquement [TypeRdv.physique] (POST /rendez-vous refuserait de
  /// toute façon une téléconsultation pour un médecin qui ne l'a pas
  /// activée — voir CreerRendezVousPayload).
  final bool teleconsultationDisponible;

  /// Charge les créneaux disponibles pour ce médecin. Si `null`, un jeu de
  /// données de démonstration est utilisé ([CreneauJour.demo]).
  ///
  /// À brancher sur GET /medecins/:id/creneaux dès que le module Agenda
  /// existera côté API (hors périmètre de rendez_vous_repository.dart).
  final Future<List<CreneauJour>> Function(String medecinId)?
  onChargerCreneaux;

  /// Confirme la réservation du créneau choisi (paiement sous séquestre).
  /// Doit retourner `true` en cas de succès.
  ///
  /// Si `null`, la réservation par défaut appelle réellement
  /// POST /rendez-vous via [rendezVousRepositoryProvider] (voir
  /// [_RendezVousPageState._reservationParDefaut]).
  final Future<bool> Function(CreneauJour jour, CreneauHoraire creneau)?
  onConfirmerReservation;

  /// Retour vers l'onglet « Profil » de la fiche médecin (ex: `Navigator.pop`).
  final VoidCallback? onVoirProfil;

  /// Retour vers l'onglet « Avis » de la fiche médecin.
  final VoidCallback? onVoirAvis;

  /// Options du sélecteur « Pays » du formulaire de création de compte
  /// intégré (voir [PaysOption]) — à brancher sur le référentiel pays
  /// réel de l'app plutôt que la liste de démonstration par défaut
  /// ([_paysDemo]).
  final List<PaysOption> paysDisponibles;

  /// Lien « Déjà un compte ? Se connecter » affiché sous le formulaire
  /// de création de compte (si [token] est `null`), pour les patients
  /// qui préfèrent se connecter plutôt que recréer un compte — typique
  /// implémentation : pousser l'écran de connexion, puis revenir ici
  /// avec un [RendezVousPage.token] renseigné. Le lien n'apparaît que
  /// si ce callback est fourni.
  final VoidCallback? onSeConnecter;

  /// Callback appelé depuis le bouton « Voir mes rendez-vous » de
  /// [ConfirmationRdvPage] (écran affiché après une réservation réussie —
  /// voir [_afficherConfirmation]). Si `null`, l'écran de confirmation
  /// se contente de dépiler la pile jusqu'à la première route.
  final VoidCallback? onVoirMesRendezVous;

  /// Callback appelé depuis le bouton « Retour à l'accueil » de
  /// [ConfirmationRdvPage]. Si `null`, même repli que
  /// [onVoirMesRendezVous] (retour à la première route de la pile).
  final VoidCallback? onRetourAccueil;

  @override
  State<RendezVousPage> createState() => _RendezVousPageState();
}

enum _Etat { chargement, pret, erreur }

class _RendezVousPageState extends State<RendezVousPage> {
  late final ProviderContainer _container =
      widget.container ?? rendezVousProviderContainer;

  // ---------------------------------------------------------------------
  // Référentiel Pays (GET /referentiels/pays — lecture publique, aucun
  // token requis) — alimente le sélecteur « Pays » du formulaire de
  // création de compte avec les vrais `pays_id` (UUID) au lieu des codes
  // ISO2 de démonstration ([_paysDemo]), qui provoquaient une erreur
  // Prisma « invalid input value ... for type uuid » lors de l'inscription.
  //
  // Instancié directement avec un [ApiClient] autonome : cette route est
  // publique, elle n'a pas besoin de partager la session du [_container]
  // riverpod (voir [ReferentielRepository]). Si votre projet expose déjà
  // un `apiClientProvider` Riverpod partagé, vous pouvez remplacer la
  // ligne ci-dessous par `_container.read(apiClientProvider)` pour
  // réutiliser la même instance HTTP que le reste de l'écran.
  late final ReferentielRepository _referentielRepository =
  ReferentielRepository(ApiClient());

  List<PaysOption> _paysCharges = [];
  bool _chargementPays = false;
  String? _erreurPays;

  /// Pays réellement proposés dans le sélecteur : le référentiel chargé
  /// depuis l'API dès qu'il est disponible, sinon
  /// [RendezVousPage.paysDisponibles] (par défaut [_paysDemo]) comme
  /// simple repli d'affichage pendant le chargement ou après un échec
  /// réseau — voir [_onPaysConfirme] qui empêche toute soumission tant
  /// que le référentiel réel n'a pas répondu.
  List<PaysOption> get _paysAffiches =>
      _paysCharges.isNotEmpty ? _paysCharges : widget.paysDisponibles;

  Future<void> _chargerPaysDisponibles() async {
    setState(() => _chargementPays = true);
    try {
      final liste = await _referentielRepository.listerPays(
        statutActivation: StatutActivationPays.actif,
      );
      if (!mounted) return;
      setState(() {
        _paysCharges =
            liste.map((p) => PaysOption(id: p.paysId, libelle: p.nom)).toList();
        _erreurPays = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _erreurPays = e.message);
    } finally {
      if (mounted) setState(() => _chargementPays = false);
    }
  }

  final TextEditingController _motifController = TextEditingController();

  // ---------------------------------------------------------------------
  // Formulaire de création de compte intégré (patient sans session) —
  // voir [_buildCompteSection] / [_creerCompteEtSeConnecter].
  // ---------------------------------------------------------------------
  final GlobalKey<FormState> _formCompteKey = GlobalKey<FormState>();
  final TextEditingController _prenomCtrl = TextEditingController();
  final TextEditingController _nomCtrl = TextEditingController();
  final TextEditingController _emailCtrl = TextEditingController();
  final TextEditingController _telephoneCtrl = TextEditingController();
  final TextEditingController _motDePasseCtrl = TextEditingController();
  DateTime? _dateNaissance;
  String? _paysId;
  bool _accepteConditions = false;
  bool _obscurePassword = true;

  /// Access token obtenu localement après une création de compte
  /// réussie via [_creerCompteEtSeConnecter]. `null` tant qu'aucun
  /// compte n'a été créé depuis cet écran — voir [_tokenEffectif].
  String? _tokenLocal;

  _Etat _etat = _Etat.chargement;
  Object? _erreur;

  List<CreneauJour> _jours = const [];
  int _indexJour = 0;
  CreneauHoraire? _creneauChoisi;
  bool _reservationEnCours = false;

  /// Type de rendez-vous choisi — verrouillé sur [TypeRdv.physique] si
  /// [RendezVousPage.teleconsultationDisponible] est faux.
  TypeRdv _typeChoisi = TypeRdv.physique;

  /// Token à utiliser pour les appels authentifiés de cet écran :
  /// [RendezVousPage.token] si le patient était déjà connecté en
  /// arrivant sur l'écran, sinon le token obtenu localement juste après
  /// une création de compte réussie ([_creerCompteEtSeConnecter]) — ce
  /// qui permet de réserver un second créneau sans repasser par le
  /// formulaire d'inscription.
  String? get _tokenEffectif => widget.token ?? _tokenLocal;

  @override
  void initState() {
    super.initState();
    _charger();
    _chargerPaysDisponibles();
  }

  @override
  void dispose() {
    _motifController.dispose();
    _prenomCtrl.dispose();
    _nomCtrl.dispose();
    _emailCtrl.dispose();
    _telephoneCtrl.dispose();
    _motDePasseCtrl.dispose();
    super.dispose();
  }

  Future<void> _charger() async {
    setState(() {
      _etat = _Etat.chargement;
      _erreur = null;
    });
    try {
      final jours = widget.onChargerCreneaux != null
          ? await widget.onChargerCreneaux!(widget.medecinId)
          : CreneauJour.demo();
      if (!widget.teleconsultationDisponible) {
        _typeChoisi = TypeRdv.physique;
      }
      if (!mounted) return;
      setState(() {
        _jours = jours;
        _indexJour = 0;
        _creneauChoisi = null;
        _etat = _Etat.pret;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _erreur = e;
        _etat = _Etat.erreur;
      });
    }
  }

  void _choisirJour(int index) {
    setState(() {
      _indexJour = index;
      _creneauChoisi = null;
    });
  }

  void _choisirCreneau(CreneauHoraire creneau) {
    if (!creneau.disponible) return;
    setState(() => _creneauChoisi = creneau);
  }

  Future<void> _confirmer() async {
    final creneau = _creneauChoisi;
    if (creneau == null) {
      _afficherErreur('Choisissez un horaire pour continuer.');
      return;
    }
    if (_reservationEnCours) return;

    // Réservation par défaut (pas de onConfirmerReservation personnalisé
    // fourni par le parent) sans session ouverte : le patient doit
    // d'abord valider le formulaire de création de compte affiché plus
    // bas à l'écran (voir _buildCompteSection) — POST /rendez-vous exige
    // déjà "authentifier" côté backend, inutile de tenter un appel voué
    // à un 401.
    final utiliseReservationParDefaut = widget.onConfirmerReservation == null;
    final besoinDeCreerUnCompte =
        utiliseReservationParDefaut && _tokenEffectif == null;

    if (besoinDeCreerUnCompte) {
      final formOk = _formCompteKey.currentState?.validate() ?? false;
      if (_dateNaissance == null) {
        _afficherErreur('Merci de renseigner votre date de naissance.');
        return;
      }
      if (_paysId == null) {
        _afficherErreur('Merci de sélectionner votre pays.');
        return;
      }
      // Garde-fou : si le référentiel réel n'a pas encore chargé (ou a
      // échoué) et que la sélection provient encore de _paysDemo, son
      // `id` n'est PAS un UUID valide (ex. "cm") et ferait échouer
      // POST /auth/register côté backend (Prisma "invalid input value
      // ... for type uuid"). On bloque ici plutôt que de laisser
      // partir un appel voué à l'échec.
      if (_paysCharges.isEmpty || !_paysCharges.any((p) => p.id == _paysId)) {
        _afficherErreur(
          _chargementPays
              ? 'Chargement de la liste des pays en cours, merci de patienter.'
              : 'Liste des pays indisponible, merci de réessayer.',
        );
        if (!_chargementPays) unawaited(_chargerPaysDisponibles());
        return;
      }
      if (!_accepteConditions) {
        _afficherErreur(
          "Merci d'accepter les conditions d'utilisation et la politique "
              "de confidentialité.",
        );
        return;
      }
      if (!formOk) return;
    }

    final jour = _jours[_indexJour];
    setState(() => _reservationEnCours = true);

    bool succes;
    RendezVous? rdvCree;
    var compteVientDetreCree = false;
    try {
      var token = _tokenEffectif;
      if (besoinDeCreerUnCompte) {
        token = await _creerCompteEtSeConnecter();
        compteVientDetreCree = true;
        // Conservé même si la réservation ci-dessous échoue ensuite : le
        // patient ne doit pas avoir à recréer un compte pour retenter.
        _tokenLocal = token;
      }

      succes = widget.onConfirmerReservation != null
          ? await widget.onConfirmerReservation!(jour, creneau)
          : await _reservationParDefaut(
        jour: jour,
        creneau: creneau,
        token: token!,
        onCreee: (rdv) => rdvCree = rdv,
      );
    } catch (e) {
      succes = false;
      final message = e is ErreurAuthentification ? e.message : '$e';
      _afficherErreur(
        compteVientDetreCree
            ? 'Échec de la création du compte : $message'
            : 'Échec de la réservation : $message',
      );
    }

    if (!mounted) return;
    setState(() => _reservationEnCours = false);
    if (succes) {
      _afficherConfirmation(
        jour,
        creneau,
        rdvCree,
        compteVientDetreCree: compteVientDetreCree,
      );
    }
  }

  /// Crée le compte patient (POST /auth/register) puis ouvre aussitôt
  /// une session (POST /auth/login) afin d'enchaîner immédiatement sur
  /// la réservation du créneau, sans ressaisie — c'est ce que
  /// [_confirmer] appelle quand [_tokenEffectif] est `null` et qu'aucun
  /// [RendezVousPage.onConfirmerReservation] personnalisé n'a été fourni.
  ///
  /// Passe par [sessionControllerProvider] (plutôt que d'appeler
  /// [AuthentificationRepository.connecter] directement) pour que la
  /// session ouverte ici soit également visible du reste de l'app (ex:
  /// onglet « Mes rendez-vous ») — à condition que [widget.container]
  /// soit bien le même [ProviderContainer] global que celui utilisé
  /// ailleurs (voir la remarque sur [rendezVousProviderContainer] en
  /// tête de fichier).
  Future<String> _creerCompteEtSeConnecter() async {
    final email = _emailCtrl.text.trim();
    final motDePasse = _motDePasseCtrl.text;

    final payload = InscriptionPayload(
      nom: _nomCtrl.text.trim(),
      prenom: _prenomCtrl.text.trim(),
      email: email,
      telephone: _telephoneCtrl.text.trim().isEmpty
          ? null
          : _telephoneCtrl.text.trim(),
      motDePasse: motDePasse,
      paysId: _paysId!,
      dateNaissance: _dateNaissance!,
    );

    // POST /auth/register — ne renvoie JAMAIS de token (voir
    // InscriptionResultat) : une connexion explicite est indispensable
    // juste après pour obtenir une session utilisable.
    await _container
        .read(authentificationRepositoryProvider)
        .inscrire(payload);

    final resultat = await _container
        .read(sessionControllerProvider.notifier)
        .connecter(ConnexionPayload(email: email, motDePasse: motDePasse));

    if (!resultat.sessionOuverte || resultat.accessToken == null) {
      // Cas très improbable ici (le mot de passe vient d'être choisi par
      // le patient, donc jamais "temporaire") : on remonte une erreur
      // claire plutôt que de planter sur un accessToken null.
      throw const ErreurAuthentification(
        codeHttp: 0,
        message: 'Compte créé, mais connexion automatique impossible. '
            'Merci de vous connecter manuellement puis de réessayer.',
      );
    }
    return resultat.accessToken!;
  }

  void _afficherErreur(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  /// Réservation par défaut — POST /rendez-vous, réellement lié à
  /// [RendezVousPage.medecinId] : c'est ce `medecin_id` (jamais un autre)
  /// qui garantit que le rendez-vous créé est bien celui du praticien
  /// affiché à l'écran ; le `patient_id`, lui, est déduit de [token]
  /// côté backend (jamais saisi ici). [token] peut provenir soit de
  /// [RendezVousPage.token] (patient déjà connecté), soit d'une création
  /// de compte tout juste effectuée par [_creerCompteEtSeConnecter].
  ///
  /// [onCreee] permet de remonter le [RendezVous] créé (code unique / QR)
  /// à [_afficherConfirmation] sans changer la signature `Future<bool>`
  /// attendue par [RendezVousPage.onConfirmerReservation].
  Future<bool> _reservationParDefaut({
    required CreneauJour jour,
    required CreneauHoraire creneau,
    required String token,
    required ValueChanged<RendezVous> onCreee,
  }) async {
    final payload = CreerRendezVousPayload(
      medecinId: widget.medecinId,
      structureId: widget.structureId,
      typeRdv: _typeChoisi,
      dateCreneau: _combinerDateEtHeure(jour.date, creneau.heure),
      motif: _motifController.text.trim().isEmpty
          ? null
          : _motifController.text.trim(),
    );

    final rdv = await _container
        .read(rendezVousRepositoryProvider)
        .creerRendezVous(payload: payload, token: token);

    // Garde la liste des rendez-vous du patient (si affichée ailleurs dans
    // l'app, ex: écran "Mes rendez-vous") synchronisée avec cette création.
    _container.invalidate(listeRendezVousControllerProvider);

    onCreee(rdv);
    return true;
  }

  /// Combine la date du jour choisi ([CreneauJour.date]) et l'heure du
  /// créneau (« 09:00 ») en un [DateTime] unique, tel qu'attendu par
  /// [CreerRendezVousPayload.dateCreneau].
  DateTime _combinerDateEtHeure(DateTime date, String heure) {
    final parties = heure.split(':');
    final heures = int.tryParse(parties[0]) ?? 0;
    final minutes = parties.length > 1 ? int.tryParse(parties[1]) ?? 0 : 0;
    return DateTime(date.year, date.month, date.day, heures, minutes);
  }

  /// Remplace l'ancien popup muet par un véritable écran de confirmation
  /// ([ConfirmationRdvPage]), poussé au-dessus de cet écran de réservation.
  /// Les boutons de [ConfirmationRdvPage] retombent par défaut sur
  /// [RendezVousPage.onVoirMesRendezVous] / [RendezVousPage.onRetourAccueil]
  /// si fournis, sinon sur un simple retour à la première route de la pile
  /// (l'utilisateur ne doit pas pouvoir revenir en arrière sur l'écran de
  /// réservation lui-même après une réservation réussie).
  void _afficherConfirmation(
      CreneauJour jour,
      CreneauHoraire creneau,
      RendezVous? rdv, {
        bool compteVientDetreCree = false,
      }) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ConfirmationRdvPage(
          medecinNom: widget.medecinNom,
          medecinSpecialite: widget.medecinSpecialite,
          medecinVille: widget.medecinVille,
          dateRdv: jour.date,
          heure: creneau.heure,
          typeRdvLabel: _typeChoisi == TypeRdv.teleconsultation
              ? 'Téléconsultation'
              : 'Au cabinet',
          tarifFcfa: widget.tarifFcfa,
          codeUnique: rdv?.codeUnique,
          compteVientDetreCree: compteVientDetreCree,
          patientPrenom:
          compteVientDetreCree ? _prenomCtrl.text.trim() : null,
          onVoirMesRendezVous: widget.onVoirMesRendezVous,
          onRetourAccueil: widget.onRetourAccueil,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: Column(
          children: [
            _buildTopBar(context),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
      bottomNavigationBar: _etat == _Etat.pret
          ? SafeArea(top: false, child: _buildStickyCta())
          : null,
    );
  }

  // ---------------------------------------------------------------------
  // Barre de retour
  // ---------------------------------------------------------------------

  Widget _buildTopBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 16, 0),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
            color: AppColors.ink,
            splashRadius: 22,
          ),
          const Spacer(),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Corps de l'écran
  // ---------------------------------------------------------------------

  Widget _buildBody() {
    switch (_etat) {
      case _Etat.chargement:
        return const Center(
          child: CircularProgressIndicator(color: AppColors.green700),
        );
      case _Etat.erreur:
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline_rounded,
                    size: 34, color: AppColors.inkFaint),
                const SizedBox(height: 10),
                Text(
                  "Impossible de charger les créneaux.\n$_erreur",
                  textAlign: TextAlign.center,
                  style: AppTextStyles.body,
                ),
                const SizedBox(height: 14),
                AppOutlineButton(label: 'Réessayer', onPressed: _charger),
              ],
            ),
          ),
        );
      case _Etat.pret:
        if (_jours.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.event_busy_outlined,
                      size: 34, color: AppColors.inkFaint),
                  const SizedBox(height: 10),
                  const Text(
                    "Aucun créneau disponible pour l'instant.",
                    textAlign: TextAlign.center,
                    style: AppTextStyles.body,
                  ),
                ],
              ),
            ),
          );
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
          children: [
            _buildHeader(),
            _buildTabRow(),
            _buildDateStrip(),
            const SizedBox(height: 14),
            _buildSlotGrid(_jours[_indexJour]),
            if (widget.teleconsultationDisponible) ...[
              const SizedBox(height: 14),
              _buildTypeRdvSelector(),
            ],
            const SizedBox(height: 14),
            _buildMotifField(),
            if (widget.onConfirmerReservation == null &&
                _tokenEffectif == null) ...[
              const SizedBox(height: 14),
              _buildCompteSection(),
            ],
            const SizedBox(height: 14),
            const _InfoNote(),
          ],
        );
    }
  }

  // ---------------------------------------------------------------------
  // En-tête — `.page-title`
  // ---------------------------------------------------------------------

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 12, 2, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${widget.medecinNom} · ${widget.medecinSpecialite}',
            style: const TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              letterSpacing: .3,
              color: AppColors.green700,
            ),
          ),
          const SizedBox(height: 6),
          const Text('Choisir un créneau', style: AppTextStyles.h3),
          const SizedBox(height: 4),
          Text(
            'Sélectionnez une date puis un horaire libre'
                '${widget.medecinVille != null ? ' au cabinet de ${widget.medecinVille}.' : '.'}',
            style: AppTextStyles.body,
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Onglets — `.tab-row` (Disponibilités actif sur cet écran)
  // ---------------------------------------------------------------------

  Widget _buildTabRow() {
    return Container(
      margin: const EdgeInsets.only(top: 14, bottom: 14),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          _RdvTabItem(
            label: 'Profil',
            active: false,
            onTap: widget.onVoirProfil ?? () => Navigator.of(context).maybePop(),
          ),
          const SizedBox(width: 22),
          const _RdvTabItem(
            label: 'Disponibilités',
            active: true,
            onTap: null,
          ),
          const SizedBox(width: 22),
          _RdvTabItem(
            label: 'Avis',
            active: false,
            onTap: widget.onVoirAvis ?? () => Navigator.of(context).maybePop(),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Sélecteur de dates — `.date-strip` / `.date-pill`
  // ---------------------------------------------------------------------

  Widget _buildDateStrip() {
    return SizedBox(
      height: 58,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _jours.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final jour = _jours[i];
          return _DatePill(
            jourAbrege: jour.jourAbrege,
            numeroJour: jour.numeroJour,
            active: i == _indexJour,
            attenue: !jour.aDesCreneauxLibres,
            onTap: () => _choisirJour(i),
          );
        },
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Grille de créneaux — `.slot-grid` / `.slot`
  // ---------------------------------------------------------------------

  Widget _buildSlotGrid(CreneauJour jour) {
    if (jour.creneaux.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: Text(
            "Aucun horaire disponible ce jour-là.",
            style: AppTextStyles.body,
          ),
        ),
      );
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final creneau in jour.creneaux)
          _SlotChip(
            creneau: creneau,
            active: identical(creneau, _creneauChoisi) ||
                (_creneauChoisi != null &&
                    _creneauChoisi!.heure == creneau.heure &&
                    creneau.disponible),
            onTap: () => _choisirCreneau(creneau),
          ),
      ],
    );
  }

  // ---------------------------------------------------------------------
  // Type de rendez-vous — Physique / Téléconsultation
  // ---------------------------------------------------------------------
  // N'apparaît que si le médecin a activé la téléconsultation (voir
  // Medecin.teleconsultationActivee) : POST /rendez-vous refuse sinon une
  // demande de type "teleconsultation" pour ce médecin.

  Widget _buildTypeRdvSelector() {
    return Row(
      children: [
        Expanded(
          child: _TypeRdvChip(
            label: 'Au cabinet',
            active: _typeChoisi == TypeRdv.physique,
            onTap: () => setState(() => _typeChoisi = TypeRdv.physique),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _TypeRdvChip(
            label: 'Téléconsultation',
            active: _typeChoisi == TypeRdv.teleconsultation,
            onTap: () =>
                setState(() => _typeChoisi = TypeRdv.teleconsultation),
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------
  // Motif (optionnel) — envoyé tel quel dans CreerRendezVousPayload.motif
  // ---------------------------------------------------------------------

  Widget _buildMotifField() {
    return TextField(
      controller: _motifController,
      minLines: 1,
      maxLines: 3,
      style: AppTextStyles.body,
      decoration: InputDecoration(
        hintText: 'Motif de la consultation (facultatif)',
        hintStyle: AppTextStyles.body.copyWith(color: AppColors.inkFaint),
        filled: true,
        fillColor: AppColors.card,
        contentPadding:
        const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(
          borderRadius: AppRadius.smRadius,
          borderSide: const BorderSide(color: AppColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadius.smRadius,
          borderSide: const BorderSide(color: AppColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AppRadius.smRadius,
          borderSide: const BorderSide(color: AppColors.green700),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Formulaire de création de compte intégré — affiché uniquement si le
  // patient n'a pas de session ([_tokenEffectif] == null) et que la
  // réservation par défaut est utilisée (voir _confirmer /
  // _creerCompteEtSeConnecter). Valider le bouton d'action fixe crée le
  // compte, ouvre une session ET réserve le créneau en une seule action.
  // ---------------------------------------------------------------------

  Widget _buildCompteSection() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.line),
        borderRadius: AppRadius.lgRadius,
      ),
      child: Form(
        key: _formCompteKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.person_add_alt_1_outlined,
                  size: 16,
                  color: AppColors.green700,
                ),
                const SizedBox(width: 6),
                const Expanded(
                  child:
                  Text('Pas encore de compte ?', style: AppTextStyles.h3),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              "Créez votre compte patient pour finaliser cette réservation "
                  "— ça prend moins d'une minute et vous serez connecté(e) "
                  "directement, sans étape supplémentaire.",
              style: AppTextStyles.body,
            ),
            const SizedBox(height: 14),
            _champCompte(
              label: 'Prénom',
              enfant: _texteCompte(
                controller: _prenomCtrl,
                hint: 'Ex. Aïcha',
                capitalisation: TextCapitalization.words,
                validateur: (v) => (v == null || v.trim().isEmpty)
                    ? 'Le prénom est requis.'
                    : null,
              ),
            ),
            _champCompte(
              label: 'Nom',
              enfant: _texteCompte(
                controller: _nomCtrl,
                hint: 'Ex. Talla',
                capitalisation: TextCapitalization.words,
                validateur: (v) =>
                (v == null || v.trim().isEmpty) ? 'Le nom est requis.' : null,
              ),
            ),
            _champCompte(
              label: 'E-mail',
              enfant: _texteCompte(
                controller: _emailCtrl,
                hint: 'vous@exemple.cm',
                typeClavier: TextInputType.emailAddress,
                validateur: (v) {
                  if (v == null || v.trim().isEmpty) {
                    return "L'e-mail est requis.";
                  }
                  final regex = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
                  if (!regex.hasMatch(v.trim())) return 'E-mail invalide.';
                  return null;
                },
              ),
            ),
            _champCompte(
              label: 'Téléphone (facultatif)',
              enfant: _texteCompte(
                controller: _telephoneCtrl,
                hint: '+237 6 XX XX XX XX',
                typeClavier: TextInputType.phone,
                formatteurs: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s]')),
                ],
              ),
            ),
            _champCompte(
              label: 'Mot de passe',
              enfant: _texteCompte(
                controller: _motDePasseCtrl,
                hint: '8 caractères minimum',
                masque: _obscurePassword,
                suffixe: IconButton(
                  icon: Icon(
                    _obscurePassword
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                    size: 18,
                    color: AppColors.inkFaint,
                  ),
                  onPressed: () =>
                      setState(() => _obscurePassword = !_obscurePassword),
                ),
                validateur: (v) {
                  if (v == null || v.isEmpty) {
                    return 'Le mot de passe est requis.';
                  }
                  if (v.length < 8) return 'Minimum 8 caractères.';
                  return null;
                },
              ),
            ),
            _champCompte(
              label: 'Date de naissance',
              enfant: InkWell(
                borderRadius: AppRadius.smRadius,
                onTap: _choisirDateNaissance,
                child: InputDecorator(
                  decoration: _decorationChamp(hint: 'jj/mm/aaaa'),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          _dateNaissance == null
                              ? 'jj/mm/aaaa'
                              : _dateNaissanceLabel,
                          style: TextStyle(
                            fontSize: 13,
                            color: _dateNaissance == null
                                ? AppColors.inkFaint
                                : AppColors.ink,
                            fontWeight: _dateNaissance == null
                                ? FontWeight.w400
                                : FontWeight.w600,
                          ),
                        ),
                      ),
                      const Icon(Icons.calendar_today_outlined,
                          size: 16, color: AppColors.inkFaint),
                    ],
                  ),
                ),
              ),
            ),
            _champCompte(
              label: 'Pays',
              enfant: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DropdownButtonFormField<String>(
                    // `value` doit exister dans `items` : si le référentiel
                    // réel a fini de charger et ne contient pas le pays
                    // encore sélectionné depuis la liste de repli
                    // (_paysDemo), on réinitialise plutôt qu'un crash Flutter.
                    value: _paysAffiches.any((p) => p.id == _paysId)
                        ? _paysId
                        : null,
                    isExpanded: true,
                    icon: _chargementPays
                        ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.keyboard_arrow_down_rounded,
                        color: AppColors.inkFaint),
                    decoration: _decorationChamp(
                      hint: _chargementPays
                          ? 'Chargement des pays…'
                          : 'Sélectionner…',
                    ),
                    hint: Text(
                      _chargementPays
                          ? 'Chargement des pays…'
                          : 'Sélectionner…',
                      style: AppTextStyles.body
                          .copyWith(color: AppColors.inkFaint, fontSize: 13),
                    ),
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.ink,
                      fontWeight: FontWeight.w600,
                    ),
                    items: _paysAffiches
                        .map((p) =>
                        DropdownMenuItem(value: p.id, child: Text(p.libelle)))
                        .toList(),
                    onChanged: (v) => setState(() => _paysId = v),
                  ),
                  if (_erreurPays != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Expanded(
                            child: Text(
                              'Liste des pays indisponible ($_erreurPays).',
                              style: AppTextStyles.body.copyWith(
                                color: Colors.redAccent,
                                fontSize: 11,
                              ),
                            ),
                          ),
                          TextButton(
                            onPressed: _chargerPaysDisponibles,
                            child: const Text('Réessayer',
                                style: TextStyle(fontSize: 11)),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 2),
            InkWell(
              borderRadius: AppRadius.smRadius,
              onTap: () =>
                  setState(() => _accepteConditions = !_accepteConditions),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 18,
                      height: 18,
                      margin: const EdgeInsets.only(top: 2),
                      decoration: BoxDecoration(
                        color: _accepteConditions
                            ? AppColors.green700
                            : Colors.transparent,
                        border: Border.all(
                          color: _accepteConditions
                              ? AppColors.green700
                              : AppColors.lineStrong,
                          width: 1.3,
                        ),
                        borderRadius: BorderRadius.circular(5),
                      ),
                      child: _accepteConditions
                          ? const Icon(Icons.check,
                          size: 13, color: Colors.white)
                          : null,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        "J'accepte les conditions d'utilisation et la "
                            "politique de confidentialité.",
                        style: AppTextStyles.body.copyWith(fontSize: 11.5),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (widget.onSeConnecter != null) ...[
              const SizedBox(height: 4),
              Center(
                child: TextButton(
                  onPressed: widget.onSeConnecter,
                  child: const Text(
                    'Déjà un compte ? Se connecter',
                    style: TextStyle(
                      fontFamily: AppTextStyles.fontDisplay,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: AppColors.green700,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Étiquette + champ, dans le style des `_FormField` déjà utilisés pour
  /// la création de compte ailleurs dans l'app.
  Widget _champCompte({required String label, required Widget enfant}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 5),
          enfant,
        ],
      ),
    );
  }

  Widget _texteCompte({
    required TextEditingController controller,
    required String hint,
    bool masque = false,
    TextInputType? typeClavier,
    TextCapitalization capitalisation = TextCapitalization.none,
    List<TextInputFormatter>? formatteurs,
    Widget? suffixe,
    String? Function(String?)? validateur,
  }) {
    return TextFormField(
      controller: controller,
      obscureText: masque,
      keyboardType: typeClavier,
      textCapitalization: capitalisation,
      inputFormatters: formatteurs,
      validator: validateur,
      style: const TextStyle(
        fontSize: 13,
        color: AppColors.ink,
        fontWeight: FontWeight.w500,
      ),
      decoration: _decorationChamp(hint: hint).copyWith(suffixIcon: suffixe),
    );
  }

  InputDecoration _decorationChamp({String? hint}) {
    return InputDecoration(
      hintText: hint,
      hintStyle: AppTextStyles.body
          .copyWith(color: AppColors.inkFaint, fontSize: 13),
      filled: true,
      fillColor: AppColors.paper,
      isDense: true,
      contentPadding:
      const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      border: OutlineInputBorder(
        borderRadius: AppRadius.smRadius,
        borderSide: const BorderSide(color: AppColors.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: AppRadius.smRadius,
        borderSide: const BorderSide(color: AppColors.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: AppRadius.smRadius,
        borderSide: const BorderSide(color: AppColors.green700, width: 1.3),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: AppRadius.smRadius,
        borderSide: const BorderSide(color: Colors.redAccent),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: AppRadius.smRadius,
        borderSide: const BorderSide(color: Colors.redAccent, width: 1.3),
      ),
    );
  }

  Future<void> _choisirDateNaissance() async {
    final maintenant = DateTime.now();
    final choisie = await showDatePicker(
      context: context,
      initialDate: DateTime(
          maintenant.year - 25, maintenant.month, maintenant.day),
      firstDate: DateTime(maintenant.year - 120),
      lastDate: maintenant,
      builder: (context, enfant) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: AppColors.green700,
              onPrimary: Colors.white,
              onSurface: AppColors.ink,
            ),
          ),
          child: enfant!,
        );
      },
    );
    if (choisie != null) setState(() => _dateNaissance = choisie);
  }

  String get _dateNaissanceLabel {
    final d = _dateNaissance;
    if (d == null) return '';
    return '${d.day.toString().padLeft(2, '0')}/'
        '${d.month.toString().padLeft(2, '0')}/${d.year}';
  }

  // ---------------------------------------------------------------------
  // Barre d'action fixe — `.sticky-cta`
  // ---------------------------------------------------------------------

  Widget _buildStickyCta() {
    final jour = _jours.isNotEmpty ? _jours[_indexJour] : null;
    final besoinDeCreerUnCompte =
        widget.onConfirmerReservation == null && _tokenEffectif == null;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: const BoxDecoration(
        color: AppColors.paper,
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          if (widget.tarifFcfa != null) ...[
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '${widget.tarifFcfa} FCFA',
                    style: AppTextStyles.price.copyWith(fontSize: 16),
                  ),
                  Text(
                    _creneauChoisi != null && jour != null
                        ? 'Créneau du ${_formaterDate(jour.date)}'
                        : 'Sélectionnez un créneau',
                    style: const TextStyle(
                      fontFamily: AppTextStyles.fontDisplay,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppColors.inkFaint,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            flex: widget.tarifFcfa != null ? 1 : 2,
            child: PrimaryButton(
              label: _reservationEnCours
                  ? (besoinDeCreerUnCompte
                  ? 'Création du compte…'
                  : 'Réservation…')
                  : (besoinDeCreerUnCompte
                  ? 'Créer mon compte et réserver'
                  : 'Réserver ce créneau'),
              onPressed: _reservationEnCours ? () {} : _confirmer,
            ),
          ),
        ],
      ),
    );
  }
}

// ===========================================================================
// Widgets internes
// ===========================================================================

/// Un onglet de la barre `.tab-row`. `onTap == null` → onglet inactif au
/// sein de cet écran (Disponibilités, déjà affiché).
class _RdvTabItem extends StatelessWidget {
  const _RdvTabItem({required this.label, required this.active, this.onTap});

  final String label;
  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.green700 : AppColors.inkFaint;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: active ? AppColors.green700 : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontFamily: AppTextStyles.fontDisplay,
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
      ),
    );
  }
}

/// Une puce de date — `.date-pill` / `.date-pill.active`.
class _DatePill extends StatelessWidget {
  const _DatePill({
    required this.jourAbrege,
    required this.numeroJour,
    required this.active,
    required this.onTap,
    this.attenue = false,
  });

  final String jourAbrege;
  final int numeroJour;
  final bool active;
  final bool attenue;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fg = active
        ? Colors.white
        : (attenue ? AppColors.inkFaint : AppColors.inkSoft);
    return InkWell(
      onTap: onTap,
      borderRadius: AppRadius.smRadius,
      child: Container(
        width: 52,
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: active ? AppColors.green700 : AppColors.card,
          border: Border.all(
            color: active ? AppColors.green700 : AppColors.line,
          ),
          borderRadius: AppRadius.smRadius,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              jourAbrege,
              style: TextStyle(
                fontFamily: AppTextStyles.fontDisplay,
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: .4,
                color: fg,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '$numeroJour',
              style: TextStyle(
                fontFamily: AppTextStyles.fontMono,
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: fg,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Une puce d'horaire — `.slot` / `.slot.active` / `.slot.taken`.
class _SlotChip extends StatelessWidget {
  const _SlotChip({
    required this.creneau,
    required this.active,
    required this.onTap,
  });

  final CreneauHoraire creneau;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final indisponible = !creneau.disponible;
    final bg = indisponible
        ? AppColors.paper
        : (active ? AppColors.green700 : AppColors.card);
    final border = indisponible
        ? AppColors.line
        : (active ? AppColors.green700 : AppColors.lineStrong);
    final fg = indisponible
        ? AppColors.inkFaint
        : (active ? Colors.white : AppColors.inkSoft);

    return Opacity(
      opacity: indisponible ? 0.5 : 1,
      child: InkWell(
        onTap: indisponible ? null : onTap,
        borderRadius: BorderRadius.circular(100),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: bg,
            border: Border.all(color: border),
            borderRadius: BorderRadius.circular(100),
          ),
          child: Text(
            creneau.heure,
            style: TextStyle(
              fontFamily: AppTextStyles.fontMono,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              decoration:
              indisponible ? TextDecoration.lineThrough : null,
              color: fg,
            ),
          ),
        ),
      ),
    );
  }
}

/// Puce de sélection Physique / Téléconsultation.
class _TypeRdvChip extends StatelessWidget {
  const _TypeRdvChip({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: AppRadius.smRadius,
      child: Container(
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: active ? AppColors.green700 : AppColors.card,
          border: Border.all(
            color: active ? AppColors.green700 : AppColors.line,
          ),
          borderRadius: AppRadius.smRadius,
        ),
        child: Text(
          label,
          style: TextStyle(
            fontFamily: AppTextStyles.fontDisplay,
            fontSize: 11.5,
            fontWeight: FontWeight.w600,
            color: active ? Colors.white : AppColors.inkSoft,
          ),
        ),
      ),
    );
  }
}

/// Encart d'information sur le paiement sous séquestre — `.info-note`.
class _InfoNote extends StatelessWidget {
  const _InfoNote();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.green100,
        borderRadius: AppRadius.smRadius,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.shield_outlined, size: 16, color: AppColors.green700),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              "Paiement sous séquestre : les fonds restent bloqués jusqu'à la "
                  'réalisation de la consultation. Vous recevrez un code unique '
                  'et un QR code à présenter au cabinet.',
              style: AppTextStyles.body.copyWith(fontSize: 11.5),
            ),
          ),
        ],
      ),
    );
  }
}