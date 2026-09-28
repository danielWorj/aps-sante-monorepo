// lib/repositories/paiement_repository.dart
//
// Consommation des routes de paiement Stripe (PaymentSheet natif) —
// miroir de server/src/routes/paiement.routes.js. Même patron que
// rendez_vous_repository.dart : HTTP direct via `package:http`, aucun
// état applicatif, le [token] est fourni requête par requête.
//
// ⚠️ Ce repository ne décide JAMAIS qu'un rendez-vous est payé : seule
// la réponse de [obtenirStatut] (alimentée par le webhook Stripe côté
// serveur) fait foi.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../utils/endpoint.dart';
// Même ApiException que les autres repositories du module rendez-vous.
import 'rendez_vous_repository.dart' show ApiException;

/// Réponse de POST /paiement/rendez-vous/:id/paiement-natif.
class PaymentSheetConfig {
  const PaymentSheetConfig({
    required this.clientSecret,
    required this.publishableKey,
  });

  final String clientSecret;

  /// Clé PUBLIQUE Stripe (pk_…), fournie par le serveur : rien en dur
  /// dans l'app, et la clé secrète (sk_…) n'y figure jamais.
  final String publishableKey;

  factory PaymentSheetConfig.fromJson(Map<String, dynamic> json) {
    final secret = json['client_secret'];
    final cle = json['publishable_key'];
    if (secret is! String || cle is! String) {
      throw const ApiException('Réponse de paiement invalide.');
    }
    return PaymentSheetConfig(clientSecret: secret, publishableKey: cle);
  }
}

/// Réponse de GET /paiement/rendez-vous/:id/paiement.
class StatutPaiementRdv {
  const StatutPaiementRdv({
    required this.statutRdv,
    this.statutPaiement,
    this.montant,
    this.devise,
  });

  final String statutRdv;

  /// `null` tant que le webhook Stripe n'a pas créé l'escrow.
  final String? statutPaiement;
  final num? montant;
  final String? devise;

  /// Vrai uniquement quand le serveur a enregistré le paiement.
  bool get estPaye => statutPaiement == 'reussie';

  factory StatutPaiementRdv.fromJson(Map<String, dynamic> json) {
    final p = json['paiement'];
    final paiement = p is Map<String, dynamic> ? p : null;
    return StatutPaiementRdv(
      statutRdv: '${json['statut_rdv']}',
      statutPaiement: paiement?['statut'] as String?,
      // Prisma Decimal est sérialisé en String ("5000") → parse tolérant.
      montant: paiement == null ? null : num.tryParse('${paiement['montant']}'),
      devise: paiement?['devise'] as String?,
    );
  }
}

class PaiementRepository {
  static const Duration _timeout = Duration(seconds: 15);

  Map<String, String> _entetes(String token) => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      };

  dynamic _decoder(http.Response r) {
    if (r.statusCode < 200 || r.statusCode >= 300) {
      var message = 'Erreur ${r.statusCode}';
      try {
        final corps = jsonDecode(r.body);
        if (corps is Map && corps['message'] is String) {
          message = corps['message'] as String;
        }
      } catch (_) {}
      throw ApiException(message, statusCode: r.statusCode);
    }
    return r.body.isEmpty ? null : jsonDecode(r.body);
  }

  /// POST /paiement/rendez-vous/:id/paiement-natif
  ///
  /// Idempotent côté serveur : rouvrir la feuille de paiement pour un
  /// RDV déjà en cours de règlement renvoie le même `client_secret`.
  Future<PaymentSheetConfig> creerPaymentSheet({
    required String rdvId,
    required String token,
  }) async {
    final r = await http
        .post(
          Uri.parse(ApiRealEndpoints.paiementRdvNatif(rdvId)),
          headers: _entetes(token),
          body: '{}',
        )
        .timeout(_timeout);
    return PaymentSheetConfig.fromJson(_decoder(r) as Map<String, dynamic>);
  }

  /// GET /paiement/rendez-vous/:id/paiement
  Future<StatutPaiementRdv> obtenirStatut({
    required String rdvId,
    required String token,
  }) async {
    final r = await http
        .get(
          Uri.parse(ApiRealEndpoints.statutPaiementRdv(rdvId)),
          headers: _entetes(token),
        )
        .timeout(_timeout);
    return StatutPaiementRdv.fromJson(_decoder(r) as Map<String, dynamic>);
  }
}
