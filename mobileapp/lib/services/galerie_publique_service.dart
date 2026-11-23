// lib/services/galerie_publique_service.dart
//
// Photos publiques d'une fiche, pour le carrousel du haut de fiche
// (ApsFicheHero) — mêmes routes que le web :
//   GET /pharmacies/:id/images          -> { images: [{ url }] }
//   GET /centres-sante/:id/images       -> { images: [{ url }] }
//   GET /services-assurance/:id/medias  -> { medias: [{ url, type }] }
// Le serveur ne renvoie que les photos couvertes par l'abonnement de la
// fiche. En cas d'échec, liste vide : la fiche garde son image principale.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../utils/endpoint.dart';

Future<List<String>> _photos(String chemin) async {
  try {
    final r = await http
        .get(Uri.parse('${ApiRealEndpoints.baseUrl}$chemin'), headers: const {'Accept': 'application/json'})
        .timeout(const Duration(seconds: 15));
    if (r.statusCode != 200) return const [];
    final d = jsonDecode(r.body);
    if (d is! Map) return const [];
    final liste = d['images'] ?? d['medias'];
    if (liste is! List) return const [];
    return [
      for (final m in liste)
        if (m is Map && m['type'] != 'video' && m['url'] is String && (m['url'] as String).isNotEmpty) m['url'] as String,
    ];
  } catch (_) {
    return const [];
  }
}

Future<List<String>> photosPharmacie(String id) => _photos('/pharmacies/$id/images');
Future<List<String>> photosCentreSante(String id) => _photos('/centres-sante/$id/images');
Future<List<String>> photosAssurance(String id) => _photos('/services-assurance/$id/medias');
