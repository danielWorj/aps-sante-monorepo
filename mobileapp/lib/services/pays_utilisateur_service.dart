// lib/services/pays_utilisateur_service.dart
//
// Pays de l'utilisateur, partagé par TOUTE l'application : les annuaires
// (médecins, pharmacies, centres de santé, assurances) s'ouvrent sur ce
// pays et gardent un filtre « Pays » pour en changer au besoin.
//
// Indépendant de Riverpod (simple ValueNotifier) car l'annuaire des
// médecins vit dans son propre ProviderContainer.
//
// Ordre de détection (le premier qui répond l'emporte) :
//   1. pays choisi par l'utilisateur dans un filtre (mémorisé) ;
//   2. pays du compte connecté ;
//   3. pays de la langue du téléphone (ex. fr_CM), sans autorisation ;
//   4. position GPS : utilisée si l'autorisation est déjà accordée, demandée
//      UNE seule fois sinon. Elle affine 2-3 mais ne remplace jamais un
//      choix explicite.
// Seuls les pays ouverts par APS (référentiel) sont retenus.

import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';

import '../models/referentiel_models.dart';
import '../repositories/referentiel_repository.dart';
import '../utils/api_client.dart';

enum OriginePays { choix, compte, telephone, gps }

class PaysCourant {
  const PaysCourant(this.paysId, this.origine);
  final String paysId;
  final OriginePays origine;
}

class PaysUtilisateurService extends ValueNotifier<PaysCourant?> {
  PaysUtilisateurService._() : super(null);

  static final PaysUtilisateurService instance = PaysUtilisateurService._();

  static const _stockage = FlutterSecureStorage();
  static const _cleChoix = 'aps.pays.choix';
  static const _cleGpsDemande = 'aps.pays.gps_demande';

  bool _demarre = false;

  /// Identifiant du pays actif, ou null (« Tous les pays »).
  String? get paysId => value?.paysId;

  /// Pays actif avant le dernier changement : un écran encore sur ce pays
  /// (appliqué automatiquement) suit la nouvelle détection.
  String? get paysPrecedent => _precedent;
  String? _precedent;

  @override
  set value(PaysCourant? nouveau) {
    if (nouveau?.paysId == super.value?.paysId && nouveau?.origine == super.value?.origine) return;
    _precedent = super.value?.paysId;
    super.value = nouveau;
  }

  /// Lance la détection (une fois par démarrage de l'application).
  Future<void> initialiser({required ApiClient client, String? paysCompte}) async {
    if (_demarre) {
      definirPaysCompte(paysCompte);
      return;
    }
    _demarre = true;
    final repository = ReferentielRepository(client);

    List<Pays> pays;
    try {
      pays = (await repository.listerPays())
          .where((p) => p.statutActivation != StatutActivationPays.inactif)
          .toList();
    } catch (_) {
      return; // Référentiel indisponible : aucun pays imposé.
    }
    _paysConnus = pays;
    bool existe(String? id) => id != null && pays.any((p) => p.paysId == id);

    final choix = await _lire(_cleChoix);
    if (existe(choix)) {
      value = PaysCourant(choix!, OriginePays.choix);
      return;
    }
    paysCompte ??= _paysCompte;
    if (existe(paysCompte)) {
      value = PaysCourant(paysCompte!, OriginePays.compte);
    } else {
      final code = _codePaysDuTelephone(pays.map((p) => p.codeIso2.toUpperCase()).toSet());
      final trouve = pays.where((p) => p.codeIso2.toUpperCase() == code).firstOrNull;
      if (trouve != null) value = PaysCourant(trouve.paysId, OriginePays.telephone);
    }

    final parGps = await _paysParPosition(repository, demanderSiBesoin: await _lire(_cleGpsDemande) == null);
    if (parGps != null && existe(parGps) && value?.origine != OriginePays.choix) {
      value = PaysCourant(parGps, OriginePays.gps);
    }
  }

  List<Pays> _paysConnus = const [];
  String? _paysCompte;

  /// Session ouverte après coup : le pays du compte remplace une simple
  /// estimation (langue du téléphone), jamais un choix ni le GPS.
  void definirPaysCompte(String? paysCompte) {
    _paysCompte = paysCompte ?? _paysCompte;
    if (paysCompte == null || !_paysConnus.any((p) => p.paysId == paysCompte)) return;
    if (value == null || value!.origine == OriginePays.telephone) {
      value = PaysCourant(paysCompte, OriginePays.compte);
    }
  }

  /// Choix explicite dans un filtre : mémorisé ; null = « Tous les pays »
  /// pour l'écran courant seulement (le pays mémorisé est conservé).
  Future<void> choisir(String? paysId) async {
    if (paysId == null || paysId.isEmpty) return;
    value = PaysCourant(paysId, OriginePays.choix);
    try {
      await _stockage.write(key: _cleChoix, value: paysId);
    } catch (_) {}
  }

  /// « Me localiser » : relance la détection GPS à la demande.
  Future<String?> localiser(ApiClient client) async {
    final id = await _paysParPosition(ReferentielRepository(client), demanderSiBesoin: true);
    if (id != null) {
      value = PaysCourant(id, OriginePays.gps);
      try {
        await _stockage.delete(key: _cleChoix);
      } catch (_) {}
    }
    return id;
  }

  Future<String?> _paysParPosition(ReferentielRepository repository, {required bool demanderSiBesoin}) async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied && demanderSiBesoin) {
        await _stockage.write(key: _cleGpsDemande, value: '1');
        permission = await Geolocator.requestPermission();
      }
      if (permission != LocationPermission.whileInUse && permission != LocationPermission.always) {
        return null;
      }
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.low,
          timeLimit: Duration(seconds: 10),
        ),
      );
      final pays = await repository.detecterPays(latitude: p.latitude, longitude: p.longitude);
      return pays?.paysId;
    } catch (_) {
      return null;
    }
  }

  static String? _codePaysDuTelephone(Set<String> connus) {
    final locales = WidgetsBinding.instance.platformDispatcher.locales;
    for (final l in locales) {
      final code = l.countryCode?.toUpperCase();
      if (code != null && connus.contains(code)) return code;
    }
    return null;
  }

  static Future<String?> _lire(String cle) async {
    try {
      return await _stockage.read(key: cle);
    } catch (_) {
      return null;
    }
  }
}
