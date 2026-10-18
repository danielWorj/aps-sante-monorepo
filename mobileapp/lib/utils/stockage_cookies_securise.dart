// lib/utils/stockage_cookies_securise.dart
//
// Stockage PERSISTANT et CHIFFRÉ du pot de cookies (package:cookie_jar)
// dans FlutterSecureStorage (Keystore Android / Keychain iOS).
//
// Pourquoi : le refresh token voyage dans un cookie httpOnly posé par le
// serveur (voir authentification_repository.dart). Avec un CookieJar en
// mémoire, ce cookie disparaissait à chaque fermeture de l'application :
// dès que l'access token (15 min) expirait, plus aucun /auth/refresh
// n'était possible et l'utilisateur devait se reconnecter. Persisté
// ici, il survit aux redémarrages pendant toute sa durée de vie (30 j,
// rotation à chaque refresh).
//
// Le refresh token n'est jamais écrit en clair (pas de FileStorage ni de
// SharedPreferences) : c'est un secret de session.

import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class StockageCookiesSecurise implements Storage {
  static const String _prefixe = 'cookies.';

  final FlutterSecureStorage _stockage;

  const StockageCookiesSecurise([this._stockage = const FlutterSecureStorage()]);

  @override
  Future<void> init(bool persistSession, bool ignoreExpires) async {}

  @override
  Future<String?> read(String key) => _stockage.read(key: '$_prefixe$key');

  @override
  Future<void> write(String key, String value) =>
      _stockage.write(key: '$_prefixe$key', value: value);

  @override
  Future<void> delete(String key) => _stockage.delete(key: '$_prefixe$key');

  @override
  Future<void> deleteAll(List<String> keys) async {
    for (final key in keys) {
      await delete(key);
    }
  }
}
