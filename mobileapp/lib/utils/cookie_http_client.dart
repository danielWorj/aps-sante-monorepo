// lib/utils/cookie_http_client.dart
//
// Enveloppe un http.Client pour lui faire PERSISTER les cookies
// (Set-Cookie -> Cookie) d'une requête à l'autre, via un CookieJar en
// mémoire (package:cookie_jar). C'est le prérequis explicitement
// documenté dans authentification_repository.dart : sans ça, le
// cookie httpOnly du refresh token (posé par POST /auth/login) ne
// survit pas jusqu'à POST /auth/refresh, qui échoue alors
// systématiquement en 400 "refresh_token requis.".
//
// ⚠️ Ajouter la dépendance dans pubspec.yaml :
//   dependencies:
//     cookie_jar: ^4.0.8
//
// ⚠️ Plateformes : ce fichier importe dart:io (pour Cookie /
// Cookie.fromSetCookieValue), donc il n'est PAS utilisable tel quel
// sur Flutter Web. Sur Web, ne pas injecter ce client : le navigateur
// gère déjà les cookies same-origin automatiquement ; pour un backend
// cross-site, utiliser BrowserClient()..withCredentials = true côté
// web à la place (voir un éventuel cookie_http_client_web.dart avec
// import conditionnel si le support Web devient nécessaire).

import 'dart:io' show Cookie;

import 'package:cookie_jar/cookie_jar.dart';
import 'package:http/http.dart' as http;

class CookieHttpClient extends http.BaseClient {
  final http.Client _interne;
  final CookieJar _pot;

  CookieHttpClient({http.Client? interne, CookieJar? pot})
      : _interne = interne ?? http.Client(),
        _pot = pot ?? CookieJar();

  @override
  Future<http.StreamedResponse> send(http.BaseRequest requete) async {
    final cookiesConnus = await _pot.loadForRequest(requete.url);
    if (cookiesConnus.isNotEmpty) {
      requete.headers['cookie'] =
          cookiesConnus.map((c) => '${c.name}=${c.value}').join('; ');
    }

    final reponse = await _interne.send(requete);

    final enteteSetCookie = reponse.headers['set-cookie'];
    if (enteteSetCookie != null && enteteSetCookie.isNotEmpty) {
      // Plusieurs Set-Cookie peuvent arriver fusionnés par des virgules
      // côté dart:io. On ne coupe QUE devant une virgule suivie d'un
      // "nom=" (début d'un nouveau cookie), jamais devant celles d'un
      // attribut "Expires=Wed, 09 Jun 2021 ...".
      final morceaux = enteteSetCookie.split(RegExp(r',(?=\s*[^=;\s]+=)'));
      final cookiesAEnregistrer = morceaux
          .map((c) {
        try {
          return Cookie.fromSetCookieValue(c.trim());
        } catch (_) {
          return null;
        }
      })
          .whereType<Cookie>()
          .toList();

      if (cookiesAEnregistrer.isNotEmpty) {
        await _pot.saveFromResponse(requete.url, cookiesAEnregistrer);
      }
    }

    return reponse;
  }

  @override
  void close() => _interne.close();
}