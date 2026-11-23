// lib/services/dernier_numero_service.dart
//
// Dernier numéro de téléphone (et son pays) avec lequel une connexion par
// PIN a abouti sur cet appareil : l'écran de connexion (login.dart) le
// préremplit. Enregistré seulement une fois le numéro + PIN acceptés par le
// serveur (un numéro mal saisi n'est jamais proposé) ; « Utiliser un autre
// numéro » l'oublie. Le PIN n'est jamais conservé.

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class DernierNumero {
  const DernierNumero({required this.telephone, required this.paysIso2});

  final String telephone;
  final String paysIso2;
}

class DernierNumeroService {
  static const _stockage = FlutterSecureStorage();
  static const _cleTelephone = 'aps_dernier_telephone';
  static const _clePays = 'aps_dernier_pays';

  static Future<DernierNumero?> lire() async {
    try {
      final telephone = (await _stockage.read(key: _cleTelephone))?.trim() ?? '';
      if (telephone.isEmpty) return null;
      final pays = (await _stockage.read(key: _clePays))?.trim() ?? '';
      return DernierNumero(telephone: telephone, paysIso2: pays.isEmpty ? 'CM' : pays);
    } catch (_) {
      return null;
    }
  }

  static Future<void> enregistrer(String telephone, String paysIso2) async {
    final numero = telephone.trim();
    if (numero.isEmpty) return;
    try {
      await _stockage.write(key: _cleTelephone, value: numero);
      await _stockage.write(key: _clePays, value: paysIso2);
    } catch (_) {
      // Stockage indisponible : simple confort, on ignore.
    }
  }

  static Future<void> oublier() async {
    try {
      await _stockage.delete(key: _cleTelephone);
      await _stockage.delete(key: _clePays);
    } catch (_) {}
  }
}
