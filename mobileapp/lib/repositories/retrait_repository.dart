// lib/repositories/retrait_repository.dart
//
// Retraits des honoraires du médecin (décaissement Mobile Money via CamPay) —
// miroir de server/src/routes/retrait.routes.js (côté médecin). Même patron que
// paiement_repository.dart : HTTP direct via `package:http`, aucun état applicatif,
// le [token] est fourni requête par requête.
//
// ⚠️ Le client ne calcule ni ne confirme JAMAIS rien : solde et statuts viennent du serveur.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../utils/endpoint.dart';
import 'rendez_vous_repository.dart' show ApiException;

/// Statut d'une demande de retrait (enum serveur StatutDemandeRetrait).
enum StatutRetrait {
  enAttenteValidation,
  enCours,
  reussie,
  echouee,
  rejetee,
  inconnu;

  static StatutRetrait depuis(String? valeur) {
    switch (valeur) {
      case 'en_attente_validation':
        return StatutRetrait.enAttenteValidation;
      case 'en_cours':
        return StatutRetrait.enCours;
      case 'reussie':
        return StatutRetrait.reussie;
      case 'echouee':
        return StatutRetrait.echouee;
      case 'rejetee':
        return StatutRetrait.rejetee;
      default:
        return StatutRetrait.inconnu;
    }
  }

  /// Demande non clôturée : le montant est réservé, l'issue n'est pas connue.
  bool get estActif =>
      this == StatutRetrait.enAttenteValidation || this == StatutRetrait.enCours;

  String get libelle {
    switch (this) {
      case StatutRetrait.enAttenteValidation:
        return 'En attente de validation';
      case StatutRetrait.enCours:
        return 'Envoi en cours';
      case StatutRetrait.reussie:
        return 'Effectué';
      case StatutRetrait.echouee:
        return 'Échoué (recrédité)';
      case StatutRetrait.rejetee:
        return 'Rejeté (recrédité)';
      case StatutRetrait.inconnu:
        return 'Inconnu';
    }
  }
}

/// Une demande de retrait (vue médecin : pas de champs internes).
class DemandeRetrait {
  const DemandeRetrait({
    required this.id,
    required this.montant,
    required this.numero,
    required this.statut,
    required this.dateCreation,
    this.motifRejet,
  });

  final String id;
  final int montant; // FCFA, entier
  final String numero; // 237XXXXXXXXX
  final StatutRetrait statut;
  final DateTime? dateCreation;
  final String? motifRejet;

  factory DemandeRetrait.fromJson(Map<String, dynamic> json) {
    final id = json['demande_retrait_id'];
    if (id is! String) {
      throw const ApiException('Réponse de retrait invalide.');
    }
    return DemandeRetrait(
      id: id,
      montant: (num.tryParse('${json['montant']}') ?? 0).round(),
      numero: (json['numero'] as String?) ?? '',
      statut: StatutRetrait.depuis(json['statut'] as String?),
      dateCreation: DateTime.tryParse('${json['date_creation']}')?.toLocal(),
      motifRejet: json['motif_rejet'] as String?,
    );
  }
}

/// Numéro Mobile Money du médecin, proposable comme destination.
class NumeroMobileMoney {
  const NumeroMobileMoney({
    required this.id,
    required this.numero,
    required this.titulaire,
    required this.operateur,
  });

  final String id;
  final String numero;
  final String titulaire;
  final String operateur;

  String get libelle => '$operateur — $numero ($titulaire)';

  factory NumeroMobileMoney.fromJson(Map<String, dynamic> json) {
    final type = json['type_mobile_money'];
    return NumeroMobileMoney(
      id: (json['id'] as String?) ?? '',
      numero: (json['numero'] as String?) ?? '',
      titulaire: (json['titulaire'] as String?) ?? '',
      operateur: (type is Map ? type['libelle'] as String? : null) ?? 'Mobile Money',
    );
  }
}

/// Réponse de GET /medecins/:id/retraits.
class PortefeuilleRetraits {
  const PortefeuilleRetraits({
    required this.solde,
    required this.retraits,
    required this.numeros,
    required this.montantMin,
    required this.montantMax,
  });

  final int solde; // FCFA
  final List<DemandeRetrait> retraits;
  final List<NumeroMobileMoney> numeros;
  final int montantMin;
  final int montantMax;

  bool get aUnRetraitActif => retraits.any((r) => r.statut.estActif);

  factory PortefeuilleRetraits.fromJson(Map<String, dynamic> json) {
    final limites = json['limites'];
    List<T> liste<T>(Object? brut, T Function(Map<String, dynamic>) f) =>
        (brut is List ? brut : const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(f)
            .toList();
    return PortefeuilleRetraits(
      solde: (num.tryParse('${json['solde']}') ?? 0).round(),
      retraits: liste(json['retraits'], DemandeRetrait.fromJson),
      numeros: liste(json['mobile_moneys'], NumeroMobileMoney.fromJson),
      montantMin: limites is Map ? (num.tryParse('${limites['montant_min']}') ?? 1).round() : 1,
      montantMax:
          limites is Map ? (num.tryParse('${limites['montant_max']}') ?? 0).round() : 0,
    );
  }
}

class RetraitRepository {
  static const Duration _timeout = Duration(seconds: 20);

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

  /// GET /medecins/:id/retraits
  Future<PortefeuilleRetraits> lister({
    required String medecinId,
    required String token,
  }) async {
    final r = await http
        .get(Uri.parse(ApiRealEndpoints.retraitsMedecin(medecinId)),
            headers: _entetes(token))
        .timeout(_timeout);
    final corps = _decoder(r);
    if (corps is! Map<String, dynamic>) {
      throw const ApiException('Réponse de portefeuille invalide.');
    }
    return PortefeuilleRetraits.fromJson(corps);
  }

  /// POST /medecins/:id/retraits — crée la demande et réserve le montant.
  ///
  /// N'envoie que l'id de la fiche Mobile Money et le montant entier en FCFA.
  Future<DemandeRetrait> demander({
    required String medecinId,
    required String mobileMoneyId,
    required int montant,
    required String token,
  }) async {
    final r = await http
        .post(
          Uri.parse(ApiRealEndpoints.retraitsMedecin(medecinId)),
          headers: _entetes(token),
          body: jsonEncode({'mobile_money_id': mobileMoneyId, 'montant': montant}),
        )
        .timeout(_timeout);
    final corps = _decoder(r);
    if (corps is! Map<String, dynamic>) {
      throw const ApiException('Réponse de retrait invalide.');
    }
    return DemandeRetrait.fromJson(corps);
  }
}