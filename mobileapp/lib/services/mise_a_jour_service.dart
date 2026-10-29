// lib/services/mise_a_jour_service.dart
//
// Mises à jour de l'application hors store :
//   - version publiée : GET /apks/active (APK active du back-office, avec la
//     version lue dans son manifeste par le serveur, utils/apkVersion.js) ;
//   - version installée, autorisation « installer des applications » et
//     lancement de l'installateur Android : canal natif aps/mise_a_jour
//     (MainActivity.kt) ;
//   - téléchargement de l'APK dans le cache de l'application, en flux,
//     avec progression, repris là où il s'était arrêté (en-tête Range) et
//     vérifié par son empreinte SHA-256 ;
//   - déploiement OTA : build minimal obligatoire, déploiement progressif
//     (lot stable de l'appareil, 0-99) et réseau non facturé pour le
//     pré-téléchargement silencieux.
// Sur iPhone : version publiée = GET /apks/active?plateforme=ios (lien App
// Store / TestFlight saisi au back-office), version installée lue par le même
// canal (AppDelegate.swift) ; « mettre à jour » ouvre ce lien.

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import '../utils/endpoint.dart';

/// Numéro de build comparable : en « split-per-abi », Flutter publie
/// versionCode = abi × 1000 + build (2003 = arm64-v8a, build 3). Même règle
/// que numeroBuild() côté serveur (utils/apkVersion.js).
int numeroBuild(int versionCode) => versionCode >= 1000 ? versionCode % 1000 : versionCode;

class VersionInstallee {
  const VersionInstallee({required this.nom, required this.build, required this.code});

  final String nom;
  final int build;

  /// versionCode complet : c'est lui qu'Android compare à l'installation.
  final int code;
}

class VersionPubliee {
  const VersionPubliee({
    required this.id,
    required this.libelle,
    required this.nom,
    required this.build,
    required this.versionCode,
    required this.url,
    this.description,
    this.taille,
    this.datePublication,
    this.buildMinimum,
    this.pourcentageDeploiement = 100,
    this.sha256,
  });

  final String id;
  final String libelle;
  final String? nom;
  final int? build;
  final int? versionCode;
  final String url;
  final String? description;
  final int? taille;
  final DateTime? datePublication;

  /// En dessous de ce build, la mise à jour est obligatoire (null = jamais).
  final int? buildMinimum;

  /// Part des appareils (1-100) à qui la version est proposée d'office.
  final int pourcentageDeploiement;

  /// Empreinte de l'APK calculée par le serveur (null pour iOS).
  final String? sha256;

  factory VersionPubliee.fromJson(Map<String, dynamic> json) {
    // file_url = « /api/apks/download/... » ; baseUrl se termine déjà par /api.
    final base = ApiRealEndpoints.baseUrl.replaceFirst(RegExp(r'/api/?$'), '');
    final build = json['numero_build'];
    final code = json['version_code'];
    final taille = json['taille'];
    final minimum = json['build_minimum'];
    final pourcentage = json['deploiement_pourcentage'];
    final ios = json['plateforme'] == 'ios';
    return VersionPubliee(
      id: json['id'] as String,
      libelle: (json['libelle'] as String?) ?? 'ApSa',
      nom: json['version_name'] as String?,
      build: build is num ? build.toInt() : null,
      versionCode: code is num ? code.toInt() : null,
      // iOS : file_url est directement le lien App Store / TestFlight.
      url: ios ? '${json['file_url']}' : '$base${json['file_url']}',
      description: json['description'] as String?,
      taille: taille is num ? taille.toInt() : null,
      datePublication: DateTime.tryParse('${json['date_upload'] ?? ''}'),
      buildMinimum: minimum is num ? minimum.toInt() : null,
      pourcentageDeploiement: pourcentage is num ? pourcentage.toInt().clamp(1, 100) : 100,
      sha256: (json['sha256'] as String?)?.toLowerCase(),
    );
  }
}

class MiseAJourService {
  static const MethodChannel _canal = MethodChannel('aps/mise_a_jour');
  static const Duration _timeout = Duration(seconds: 15);
  static const _stockage = FlutterSecureStorage();
  static const _cleLot = 'aps_ota_lot';

  /// Android : APK téléchargée et installée. iOS : lien vers l'App Store /
  /// TestFlight. Autres plateformes : pas de mise à jour gérée ici.
  bool get disponible => Platform.isAndroid || Platform.isIOS;

  bool get estIos => Platform.isIOS;

  Future<VersionInstallee> versionInstallee() async {
    final infos = await _canal.invokeMapMethod<String, dynamic>('infosVersion') ?? const {};
    final code = (infos['versionCode'] as num?)?.toInt() ?? 0;
    return VersionInstallee(nom: (infos['versionName'] as String?) ?? '—', build: numeroBuild(code), code: code);
  }

  /// Dernière version publiée, ou null si aucune APK n'est active.
  Future<VersionPubliee?> versionPubliee() async {
    final r = await http
        .get(
          Uri.parse(estIos ? '${ApiRealEndpoints.apkActive}?plateforme=ios' : ApiRealEndpoints.apkActive),
          headers: const {'Accept': 'application/json'},
        )
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
  /// Un fichier complet déjà présent pour ce build est réutilisé ; un fichier
  /// partiel (`.part`, téléchargement interrompu ou annulé) est complété par
  /// une requête Range au lieu de tout recommencer. Le fichier obtenu est
  /// vérifié par son empreinte SHA-256 ([EmpreinteInvalide] sinon).
  /// [onProgression] reçoit les octets reçus et le total (0 si inconnu).
  /// [annule] est consulté à chaque morceau reçu.
  Future<File> telecharger(
    VersionPubliee version, {
    required void Function(int recus, int total) onProgression,
    required bool Function() annule,
  }) async {
    final dossier = Directory((await _canal.invokeMethod<String>('dossierTelechargement'))!);
    final fichier = File('${dossier.path}/apsa-${version.build ?? version.id}.apk');
    final partiel = File('${fichier.path}.part');

    if (version.taille != null && await fichier.exists() && await fichier.length() == version.taille) {
      onProgression(version.taille!, version.taille!);
      return _verifier(fichier, version);
    }

    // Fichiers d'autres versions : inutiles une fois celle-ci en cours.
    await for (final f in dossier.list()) {
      if (f is File && f.path != partiel.path) await f.delete().catchError((_) => f);
    }

    var deja = await partiel.exists() ? await partiel.length() : 0;
    if (version.taille != null && deja > version.taille!) {
      await partiel.delete();
      deja = 0;
    }

    final client = http.Client();
    IOSink? sortie;
    try {
      final requete = http.Request('GET', Uri.parse(version.url));
      if (deja > 0) requete.headers['Range'] = 'bytes=$deja-';
      final reponse = await client.send(requete).timeout(_timeout);
      if (reponse.statusCode == 416) {
        // Plage refusée : le partiel ne correspond plus au fichier publié.
        await partiel.delete().catchError((_) => partiel);
        throw const HttpException('Plage refusée');
      }
      if (reponse.statusCode != 200 && reponse.statusCode != 206) {
        throw HttpException('Erreur ${reponse.statusCode}');
      }
      // 200 : le serveur renvoie tout le fichier, le partiel est écrasé.
      final reprise = reponse.statusCode == 206;
      var recus = reprise ? deja : 0;
      final longueur = reponse.contentLength;
      final total = longueur != null ? recus + longueur : version.taille ?? 0;
      sortie = partiel.openWrite(mode: reprise ? FileMode.append : FileMode.write);
      onProgression(recus, total);
      await for (final morceau in reponse.stream) {
        if (annule()) throw const TelechargementAnnule();
        sortie.add(morceau);
        recus += morceau.length;
        onProgression(recus, total);
      }
      await sortie.close();
      sortie = null;
      return await _verifier(await partiel.rename(fichier.path), version);
    } finally {
      // Le partiel est conservé (annulation, coupure réseau) : le prochain
      // téléchargement le complète.
      await sortie?.close().catchError((_) {});
      client.close();
    }
  }

  /// Compare l'empreinte du fichier à celle publiée ; un fichier différent
  /// est supprimé (un nouveau téléchargement repartira de zéro).
  Future<File> _verifier(File fichier, VersionPubliee version) async {
    final attendue = version.sha256;
    if (attendue == null) return fichier;
    final calculee = await _canal.invokeMethod<String>('empreinteSha256', {'chemin': fichier.path});
    if (calculee == attendue) return fichier;
    await fichier.delete().catchError((_) => fichier);
    throw const EmpreinteInvalide();
  }

  /// Wi-Fi ou réseau non facturé (pré-téléchargement silencieux autorisé).
  Future<bool> reseauNonFacture() async {
    try {
      return await _canal.invokeMethod<bool>('reseauNonFacture') ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Lot de déploiement de l'appareil (0-99), tiré une fois puis conservé :
  /// une version déployée à N % est proposée aux lots 0 à N-1, et le reste
  /// quand le pourcentage augmente.
  Future<int> lotDeploiement() async {
    try {
      final lu = int.tryParse(await _stockage.read(key: _cleLot) ?? '');
      if (lu != null && lu >= 0 && lu < 100) return lu;
      final lot = Random.secure().nextInt(100);
      await _stockage.write(key: _cleLot, value: '$lot');
      return lot;
    } catch (_) {
      // Stockage indisponible : l'appareil reçoit la version comme tout le monde.
      return 0;
    }
  }

  /// Contrôle natif de l'APK téléchargée (MainActivity.analyserApk) : null si
  /// elle peut remplacer la version installée, sinon le motif du refus
  /// (« illisible », « paquet », « version », « signature »).
  Future<String?> motifRefus(File apk) async {
    final r = await _canal.invokeMapMethod<String, dynamic>('analyserApk', {'chemin': apk.path});
    return r?['refus'] as String?;
  }

  Future<bool> peutInstaller() async => await _canal.invokeMethod<bool>('peutInstaller') ?? false;

  Future<void> ouvrirReglagesInstallation() => _canal.invokeMethod('ouvrirReglagesInstallation');

  /// Ouvre l'installateur Android sur l'APK : l'utilisateur confirme « Mettre à jour ».
  Future<void> installer(File apk) => _canal.invokeMethod('installer', {'chemin': apk.path});

  /// iOS : ouvre le lien App Store / TestFlight de la version publiée.
  Future<void> ouvrirLienIos(VersionPubliee version) async {
    if (!await launchUrl(Uri.parse(version.url), mode: LaunchMode.externalApplication)) {
      throw const HttpException('Lien inaccessible');
    }
  }
}

class TelechargementAnnule implements Exception {
  const TelechargementAnnule();
}

/// L'APK téléchargée ne correspond pas à l'empreinte publiée (fichier tronqué
/// ou altéré) : elle a été supprimée.
class EmpreinteInvalide implements Exception {
  const EmpreinteInvalide();
}
