import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Identifiant aléatoire de CETTE installation de l'application, envoyé
/// en en-tête `X-Installation-Id` sur la lecture des fiches (pharmacies,
/// centres de santé, médecins).
///
/// Il sert UNIQUEMENT au compteur de vues des fiches (statistiques des
/// abonnements de présence) : sans lui, deux mobiles derrière la même IP
/// d'opérateur (NAT) et le même User-Agent (« Dart/x (dart:io) ») sont
/// comptés comme un seul visiteur. Il n'identifie pas la personne
/// (tiré au hasard, jamais lié au compte côté serveur, haché avec la
/// date avant d'être stocké — voir server/src/services/vuesFiche.service.js).
class IdentifiantInstallation {
  IdentifiantInstallation._();

  static const String nomEntete = 'X-Installation-Id';
  static const String _cle = 'aps_identifiant_installation';
  static String? _valeur;

  /// À appeler une fois au démarrage (main). Ne lève jamais : sans
  /// stockage disponible, un identifiant de session est utilisé.
  static Future<void> charger() async {
    if (_valeur != null) return;
    const stockage = FlutterSecureStorage();
    try {
      final existant = await stockage.read(key: _cle);
      if (existant != null && existant.length >= 16) {
        _valeur = existant;
        return;
      }
      _valeur = _generer();
      await stockage.write(key: _cle, value: _valeur);
    } catch (_) {
      _valeur ??= _generer();
    }
  }

  /// En-tête à ajouter aux requêtes (vide tant que [charger] n'a pas abouti).
  static Map<String, String> get entete =>
      _valeur == null ? const {} : {nomEntete: _valeur!};

  static String _generer() {
    final aleatoire = Random.secure();
    return List.generate(32, (_) => aleatoire.nextInt(16).toRadixString(16)).join();
  }
}
