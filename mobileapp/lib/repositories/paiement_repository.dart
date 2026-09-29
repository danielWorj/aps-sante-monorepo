// lib/repositories/paiement_repository.dart
//
// Consommation des routes de paiement Stripe (PaymentSheet natif) et
// Mobile Money (CamPay) — miroir de server/src/routes/paiement.routes.js. Même patron que
// rendez_vous_repository.dart : HTTP direct via `package:http`, aucun
// état applicatif, le [token] est fourni requête par requête.
//
// ⚠️ Ce repository ne décide JAMAIS qu'un rendez-vous est payé : seule
// la réponse de [obtenirStatut] (alimentée par les webhooks Stripe /
// CamPay côté serveur) fait foi.

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

/// Réponse de POST /paiement/rendez-vous/:id/paiement-campay.
///
/// Une [CollecteCampay] ne prouve JAMAIS un paiement : elle indique
/// seulement que la demande de validation est partie (ou a peut-être été
/// envoyée, voir [incertain]) vers le téléphone du payeur.
class CollecteCampay {
  const CollecteCampay({
    this.reference,
    this.operateur,
    this.ussdCode,
    this.incertain = false,
    this.dejaInitie = false,
  });

  /// Référence CamPay. `null` si l'issue est incertaine (202).
  final String? reference;

  /// « MTN » / « ORANGE », si connu.
  final String? operateur;

  /// Code USSD à composer en secours, si fourni par CamPay.
  final String? ussdCode;

  /// 202 : le serveur n'a pas pu confirmer l'envoi de la demande à
  /// l'opérateur. Elle a peut-être été reçue : ne pas en renvoyer une
  /// autre (risque de double débit), simplement attendre.
  final bool incertain;

  /// 200 : une tentative identique (même RDV, même numéro, < 2 min) était
  /// déjà en cours, le serveur la renvoie au lieu d'en créer une nouvelle.
  final bool dejaInitie;

  factory CollecteCampay.fromJson(Map<String, dynamic> json) {
    String? texte(String cle) {
      final v = json[cle];
      return v is String && v.isNotEmpty ? v : null;
    }

    return CollecteCampay(
      reference: texte('reference'),
      operateur: texte('operateur'),
      ussdCode: texte('ussd_code'),
      incertain: json['incertain'] == true,
      dejaInitie: json['deja_initie'] == true,
    );
  }
}

/// Réponse de GET /paiement/rendez-vous/:id/paiement.
class StatutPaiementRdv {
  const StatutPaiementRdv({
    required this.statutRdv,
    this.statutPaiement,
    this.montant,
    this.devise,
    this.tentativeCampayStatut,
    this.tentativeCampayOperateur,
  });

  final String statutRdv;

  /// `null` tant que le webhook Stripe n'a pas créé l'escrow.
  final String? statutPaiement;
  final num? montant;
  final String? devise;

  /// Statut de la DERNIÈRE tentative Mobile Money du RDV
  /// (`en_attente` | `reussie` | `echouee` | `remboursee`), ou `null` si
  /// le RDV n'en a aucune (`tentative_campay` absent ou null).
  final String? tentativeCampayStatut;

  /// Opérateur de cette tentative (« MTN » / « ORANGE »), si connu.
  final String? tentativeCampayOperateur;

  /// Vrai uniquement quand le serveur a enregistré le paiement.
  bool get estPaye => statutPaiement == 'reussie';

  /// Vrai quand la dernière tentative Mobile Money a été refusée ou a
  /// expiré : inutile d'attendre davantage, le patient peut réessayer.
  bool get tentativeCampayEchouee => tentativeCampayStatut == 'echouee';

  factory StatutPaiementRdv.fromJson(Map<String, dynamic> json) {
    final p = json['paiement'];
    final paiement = p is Map<String, dynamic> ? p : null;
    final t = json['tentative_campay'];
    final tentative = t is Map<String, dynamic> ? t : null;
    return StatutPaiementRdv(
      statutRdv: '${json['statut_rdv']}',
      statutPaiement: paiement?['statut'] as String?,
      // Prisma Decimal est sérialisé en String ("5000") → parse tolérant.
      montant: paiement == null ? null : num.tryParse('${paiement['montant']}'),
      devise: paiement?['devise'] as String?,
      tentativeCampayStatut: tentative?['statut'] as String?,
      tentativeCampayOperateur: tentative?['operateur'] as String?,
    );
  }
}

class PaiementRepository {
  static const Duration _timeout = Duration(seconds: 15);

  /// Le serveur patiente jusqu'à 15 s sur CamPay avant de répondre (202
  /// « issue incertaine » comprise) : le client doit attendre plus longtemps
  /// que lui, sinon il abandonne juste avant la réponse.
  static const Duration _timeoutCollecte = Duration(seconds: 40);

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

  /// POST /paiement/rendez-vous/:id/paiement-campay
  ///
  /// N'envoie que `{numero}` : le montant est recalculé par le serveur.
  /// Les 200 (déjà initié), 201 (créé) et 202 (issue incertaine) sont tous
  /// des 2xx et passent donc par [_decoder] ; c'est [CollecteCampay]
  /// (`incertain`, `dejaInitie`) qui les distingue.
  ///
  /// ⚠️ Ne confirme RIEN : lire ensuite [obtenirStatut].
  Future<CollecteCampay> demanderPaiementCampay({
    required String rdvId,
    required String numero,
    required String token,
  }) async {
    final r = await http
        .post(
          Uri.parse(ApiRealEndpoints.paiementRdvCampay(rdvId)),
          headers: _entetes(token),
          body: jsonEncode({'numero': numero}),
        )
        .timeout(_timeoutCollecte);
    final corps = _decoder(r);
    if (corps is! Map<String, dynamic>) {
      throw const ApiException('Réponse de paiement invalide.');
    }
    return CollecteCampay.fromJson(corps);
  }
}
