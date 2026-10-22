// lib/services/mise_a_jour_service.dart
//
// Mises à jour de l'application hors store :
//   - version publiée : GET /apks/active (APK active du back-office, avec la
//     version lue dans son manifeste par le serveur, utils/apkVersion.js) ;
//   - version installée, autorisation « installer des applications » et
//     lancement de l'installateur Android : canal natif aps/mise_a_jour
//     (MainActivity.kt) ;
//   - téléchargement de l'APK dans le cache de l'application, en flux,
//     avec progression.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import '../utils/endpoint.dart';

/// Numéro de build comparable : en « split-per-abi », Flutter publie
/// versionCode = abi × 1000 + build (2003 = arm64-v8a, build 3). Même règle
/// que numeroBuild() côté serveur (utils/apkVersion.js).
int numeroBuild(int versionCode) => versionCode >= 1000 ? versionCode % 1000 : versionCode;

class VersionInstallee {
  const VersionInstallee({required this.nom, required this.build});

  final String nom;
  final int build;
}

class VersionPubliee {
  const VersionPubliee({
    required this.id,
    required this.libelle,
    required this.nom,
    required this.build,
    required this.url,
    this.description,
    this.taille,
    this.datePublication,
  });

  final String id;
  final String libelle;
  final String? nom;
  final int? build;
  final String url;
  final String? description;
  final int? taille;
  final DateTime? datePublication;

  factory VersionPubliee.fromJson(Map<String, dynamic> json) {
    // file_url = « /api/apks/download/... » ; baseUrl se termine déjà par /api.
    final base = ApiRealEndpoints.baseUrl.replaceFirst(RegExp(r'/api/?$'), '');
    final build = json['numero_build'];
    final taille = json['taille'];
    return VersionPubliee(
      id: json['id'] as String,
      libelle: (json['libelle'] as String?) ?? 'ApSa',
      nom: json['version_name'] as String?,
      build: build is num ? build.toInt() : null,
      url: '$base${json['file_url']}',
      description: json['description'] as String?,
      taille: taille is num ? taille.toInt() : null,
      datePublication: DateTime.tryParse('${json['date_upload'] ?? ''}'),
    );
  }
}

class MiseAJourService {
  static const MethodChannel _canal = MethodChannel('aps/mise_a_jour');
  static const Duration _timeout = Duration(seconds: 15);

  /// Les mises à jour hors store ne concernent que l'APK Android.
  bool get disponible => Platform.isAndroid;

  Future<VersionInstallee> versionInstallee() async {
    final infos = await _canal.invokeMapMethod<String, dynamic>('infosVersion') ?? const {};
    final code = (infos['versionCode'] as num?)?.toInt() ?? 0;
    return VersionInstallee(nom: (infos['versionName'] as String?) ?? '—', build: numeroBuild(code));
  }

  /// Dernière version publiée, ou null si aucune APK n'est active.
  Future<VersionPubliee?> versionPubliee() async {
    final r = await http
        .get(Uri.parse(ApiRealEndpoints.apkActive), headers: const {'Accept': 'application/json'})
        .timeout(_timeout);
    if (r.statusCode == 404) return null;
    if (r.statusCode < 200 || r.statusCode >= 300) {
      throw HttpException('Erreur ${r.statusCode}');
    }
    final corps = jsonDecode(r.body);
    final apk = corps is Map ? corps['apk'] : null;
    return apk is Map<String, dynamic> ? VersionPubliee.fromJson(apk) : null;
  }

  /// Télécharge l'APK dans le cache (`cache/mises_a_jour/apsa-BUILD.apk`).
  /// Un fichier complet déjà présent pour ce build est réutilisé.
  /// [onProgression] reçoit les octets reçus et le total (0 si inconnu).
  /// [annule] est consulté à chaque morceau reçu.
  Future<File> telecharger(
    VersionPubliee version, {
    required void Function(int recus, int total) onProgression,
    required bool Function() annule,
  }) async {
    final dossier = Directory((await _canal.invokeMethod<String>('dossierTelechargement'))!);
    final fichier = File('${dossier.path}/apsa-${version.build ?? version.id}.apk');

    if (version.taille != null && await fichier.exists() && await fichier.length() == version.taille) {
      onProgression(version.taille!, version.taille!);
      return fichier;
    }

    // Anciennes APK : inutiles une fois la nouvelle version téléchargée.
    await for (final f in dossier.list()) {
      if (f is File) await f.delete().catchError((_) => f);
    }

    final client = http.Client();
    final partiel = File('${fichier.path}.part');
    final sortie = partiel.openWrite();
    try {
      final reponse = await client.send(http.Request('GET', Uri.parse(version.url))).timeout(_timeout);
      if (reponse.statusCode != 200) throw HttpException('Erreur ${reponse.statusCode}');
      final total = reponse.contentLength ?? version.taille ?? 0;
      var recus = 0;
      await for (final morceau in reponse.stream) {
        if (annule()) throw const TelechargementAnnule();
        sortie.add(morceau);
        recus += morceau.length;
        onProgression(recus, total);
      }
      await sortie.close();
      return await partiel.rename(fichier.path);
    } catch (_) {
      await sortie.close().catchError((_) {});
      await partiel.delete().catchError((_) => partiel);
      rethrow;
    } finally {
      client.close();
    }
  }

  Future<bool> peutInstaller() async => await _canal.invokeMethod<bool>('peutInstaller') ?? false;

  Future<void> ouvrirReglagesInstallation() => _canal.invokeMethod('ouvrirReglagesInstallation');

  /// Ouvre l'installateur Android sur l'APK : l'utilisateur confirme « Mettre à jour ».
  Future<void> installer(File apk) => _canal.invokeMethod('installer', {'chemin': apk.path});
}

class TelechargementAnnule implements Exception {
  const TelechargementAnnule();
}
