import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Identifiant aléatoire de CET appareil pour la connexion, envoyé en
/// en-tête `X-Appareil-Id` sur les appels d'authentification.
///
/// Le serveur n'en garde que l'empreinte : une connexion depuis un
/// appareil inconnu doit être confirmée (application connectée sur un
/// autre téléphone, ou WhatsApp). Il reste dans le stockage sécurisé
/// même après une déconnexion : l'appareil reste « de confiance ».
///
/// Distinct de [IdentifiantInstallation] (compteur de vues anonyme,
/// jamais lié au compte).
class IdentifiantAppareil {
  IdentifiantAppareil._();

  static const String nomEntete = 'X-Appareil-Id';
  static const String _cle = 'aps_identifiant_appareil';
  static String? _valeur;

  /// À appeler une fois au démarrage (main). Ne lève jamais.
  static Future<void> charger() async {
    if (_valeur != null) return;
    const stockage = FlutterSecureStorage();
    try {
      final existant = await stockage.read(key: _cle);
      if (existant != null && RegExp(r'^[A-Za-z0-9_-]{16,128}$').hasMatch(existant)) {
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
    return List.generate(40, (_) => aleatoire.nextInt(16).toRadixString(16)).join();
  }
}
