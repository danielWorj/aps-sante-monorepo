// lib/controllers/referentiel_controller.dart
//
// Controller du module "référentiels" : expose un état observable
// (ChangeNotifier) pour les écrans qui consomment Langue / Devise /
// Pays / Ville / Role, au-dessus de [ReferentielRepository].
//
// Un seul controller regroupe les 5 sous-ressources car elles sont
// petites, peu volatiles, et souvent utilisées ensemble dans un même
// formulaire (ex: pays -> devise/langue affichées, ville filtrée par
// pays). Chaque sous-ressource garde son propre triplet d'état
// (données / chargement / erreur) pour ne pas se bloquer entre elles.

import 'package:flutter/foundation.dart';

import '../models/referentiel_models.dart';
import '../repositories/referentiel_repository.dart';
import '../utils/api_client.dart';

class ReferentielController extends ChangeNotifier {
  final ReferentielRepository _repository;

  ReferentielController(this._repository);

  /// Fabrique pratique quand on n'a que l'ApiClient sous la main.
  factory ReferentielController.avecClient(ApiClient client) {
    return ReferentielController(ReferentielRepository(client));
  }

  // ─── Langues ──────────────────────────────────────────────────

  List<Langue> _langues = [];
  bool _chargementLangues = false;
  String? _erreurLangues;

  List<Langue> get langues => List.unmodifiable(_langues);
  bool get chargementLangues => _chargementLangues;
  String? get erreurLangues => _erreurLangues;

  Future<void> chargerLangues({bool forcer = false}) async {
    if (_chargementLangues) return;
    if (!forcer && _langues.isNotEmpty) return;

    _chargementLangues = true;
    _erreurLangues = null;
    notifyListeners();

    try {
      _langues = await _repository.listerLangues();
    } on ApiException catch (e) {
      _erreurLangues = e.message;
    } finally {
      _chargementLangues = false;
      notifyListeners();
    }
  }

  // ─── Devises ──────────────────────────────────────────────────

  List<Devise> _devises = [];
  bool _chargementDevises = false;
  String? _erreurDevises;

  List<Devise> get devises => List.unmodifiable(_devises);
  bool get chargementDevises => _chargementDevises;
  String? get erreurDevises => _erreurDevises;

  Future<void> chargerDevises({bool forcer = false}) async {
    if (_chargementDevises) return;
    if (!forcer && _devises.isNotEmpty) return;

    _chargementDevises = true;
    _erreurDevises = null;
    notifyListeners();

    try {
      _devises = await _repository.listerDevises();
    } on ApiException catch (e) {
      _erreurDevises = e.message;
    } finally {
      _chargementDevises = false;
      notifyListeners();
    }
  }

  // ─── Pays ─────────────────────────────────────────────────────

  List<Pays> _pays = [];
  bool _chargementPays = false;
  String? _erreurPays;
  StatutActivationPays? _filtreStatutActivation;

  List<Pays> get pays => List.unmodifiable(_pays);
  bool get chargementPays => _chargementPays;
  String? get erreurPays => _erreurPays;
  StatutActivationPays? get filtreStatutActivation => _filtreStatutActivation;

  Future<void> chargerPays({
    StatutActivationPays? statutActivation,
    bool forcer = false,
  }) async {
    final memeFiltre = statutActivation == _filtreStatutActivation;
    if (_chargementPays) return;
    if (!forcer && memeFiltre && _pays.isNotEmpty) return;

    _chargementPays = true;
    _erreurPays = null;
    _filtreStatutActivation = statutActivation;
    notifyListeners();

    try {
      _pays = await _repository.listerPays(statutActivation: statutActivation);
    } on ApiException catch (e) {
      _erreurPays = e.message;
    } finally {
      _chargementPays = false;
      notifyListeners();
    }
  }

  /// Récupère le détail d'un pays (avec ses villes) sans toucher à la
  /// liste [pays] déjà chargée en mémoire.
  Future<Pays?> obtenirPays(String id) async {
    try {
      return await _repository.obtenirPays(id);
    } on ApiException catch (e) {
      _erreurPays = e.message;
      notifyListeners();
      return null;
    }
  }

  // ─── Villes ───────────────────────────────────────────────────

  List<Ville> _villes = [];
  bool _chargementVilles = false;
  String? _erreurVilles;
  String? _filtrePaysId;

  List<Ville> get villes => List.unmodifiable(_villes);
  bool get chargementVilles => _chargementVilles;
  String? get erreurVilles => _erreurVilles;
  String? get filtrePaysId => _filtrePaysId;

  /// Charge les villes, filtrées par [paysId] si fourni — typiquement
  /// pour peupler un select "ville" dépendant du pays choisi.
  Future<void> chargerVilles({String? paysId, bool forcer = false}) async {
    final memeFiltre = paysId == _filtrePaysId;
    if (_chargementVilles) return;
    if (!forcer && memeFiltre && _villes.isNotEmpty) return;

    _chargementVilles = true;
    _erreurVilles = null;
    _filtrePaysId = paysId;
    notifyListeners();

    try {
      _villes = await _repository.listerVilles(paysId: paysId);
    } on ApiException catch (e) {
      _erreurVilles = e.message;
    } finally {
      _chargementVilles = false;
      notifyListeners();
    }
  }

  // ─── Rôles (IAM) — authentification obligatoire ──────────────

  List<Role> _roles = [];
  bool _chargementRoles = false;
  String? _erreurRoles;

  List<Role> get roles => List.unmodifiable(_roles);
  bool get chargementRoles => _chargementRoles;
  String? get erreurRoles => _erreurRoles;

  /// [token] : le backend protège `/referentiels/roles` par
  /// `authentifier` (contrairement aux autres ressources du module).
  Future<void> chargerRoles({required String token, bool forcer = false}) async {
    if (_chargementRoles) return;
    if (!forcer && _roles.isNotEmpty) return;

    _chargementRoles = true;
    _erreurRoles = null;
    notifyListeners();

    try {
      _roles = await _repository.listerRoles(token: token);
    } on ApiException catch (e) {
      _erreurRoles = e.message;
    } finally {
      _chargementRoles = false;
      notifyListeners();
    }
  }

  // ─── Utilitaires ──────────────────────────────────────────────

  /// Charge en une fois tout le référentiel géographique public
  /// (langues, devises, pays) — pratique pour amorcer un formulaire
  /// d'inscription avant authentification.
  Future<void> chargerReferentielPublic() async {
    await Future.wait([
      chargerLangues(),
      chargerDevises(),
      chargerPays(),
    ]);
  }

  /// Réinitialise tout l'état en mémoire (ex: à la déconnexion).
  void reinitialiser() {
    _langues = [];
    _devises = [];
    _pays = [];
    _villes = [];
    _roles = [];
    _erreurLangues = null;
    _erreurDevises = null;
    _erreurPays = null;
    _erreurVilles = null;
    _erreurRoles = null;
    _filtreStatutActivation = null;
    _filtrePaysId = null;
    notifyListeners();
  }
}