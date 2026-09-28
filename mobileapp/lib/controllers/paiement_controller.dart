// lib/controllers/paiement_controller.dart
//
// Orchestration du paiement d'un rendez-vous par PaymentSheet Stripe.
//
// Volontairement SANS provider Riverpod : l'app utilise plusieurs
// ProviderContainer distincts (rendezVousProviderContainer,
// medecinProviderContainer…) qui ne partagent pas la session. Le jeton
// est donc fourni par l'appelant via un [ExecuteurAuthentifie], ce qui
// fonctionne quel que soit le container (ou l'absence de container).

import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_stripe/flutter_stripe.dart'
    show FailureCode, SetupPaymentSheetParameters, Stripe, StripeException;

import '../repositories/paiement_repository.dart';
import '../repositories/rendez_vous_repository.dart' show ApiException;

/// Exécute un appel authentifié en lui fournissant un access token.
///
/// - Sous le ProviderScope (ex. portail patient) :
///   `ref.read(sessionControllerProvider.notifier).appelAuthentifie`
///   (rejoue l'appel après un refresh silencieux si le token a expiré).
/// - Avec un token brut (ex. juste après une création de compte dans
///   RendezVousPage) : [executeurAvecTokenFixe].
typedef ExecuteurAuthentifie = Future<T> Function<T>(
  Future<T> Function(String accessToken) appel,
);

/// [ExecuteurAuthentifie] qui utilise toujours le même [token].
ExecuteurAuthentifie executeurAvecTokenFixe(String token) {
  return <T>(Future<T> Function(String accessToken) appel) => appel(token);
}

/// Erreur de paiement au message directement affichable au patient.
class PaiementException implements Exception {
  const PaiementException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Ouvre la PaymentSheet Stripe pour [rdvId].
///
/// Retourne `true` si le patient a validé la feuille, `false` s'il l'a
/// fermée sans payer. Lève [PaiementException] (message lisible) ou
/// [ApiException] en cas d'erreur.
///
/// ⚠️ `true` NE VEUT PAS DIRE « RDV confirmé » : seul le webhook Stripe
/// confirme le rendez-vous côté serveur. Appeler ensuite
/// [attendreConfirmationPaiement].
Future<bool> payerAvecPaymentSheet(
  PaiementRepository repo, {
  required String rdvId,
  required ExecuteurAuthentifie executer,
}) async {
  final cfg = await executer(
    (token) => repo.creerPaymentSheet(rdvId: rdvId, token: token),
  );

  try {
    // La clé publique vient du serveur : pas de clé en dur dans l'app.
    Stripe.publishableKey = cfg.publishableKey;
    await Stripe.instance.applySettings();

    await Stripe.instance.initPaymentSheet(
      paymentSheetParameters: SetupPaymentSheetParameters(
        paymentIntentClientSecret: cfg.clientSecret,
        merchantDisplayName: 'APS Santé',
        style: ThemeMode.light,
      ),
    );

    await Stripe.instance.presentPaymentSheet();
    return true;
  } on StripeException catch (e) {
    if (e.error.code == FailureCode.Canceled) return false;
    throw PaiementException(
      e.error.localizedMessage ??
          e.error.message ??
          'Le paiement a échoué. Veuillez réessayer.',
    );
  }
}

/// Le webhook Stripe est la SEULE source de vérité : on interroge donc
/// l'API jusqu'à voir le paiement « reussie » (comme PaiementSucces.jsx
/// côté web — le webhook peut arriver après la fin de la PaymentSheet).
///
/// Retourne `null` si le paiement n'est pas encore confirmé au bout des
/// tentatives (l'UI propose alors de revérifier plus tard : ce n'est pas
/// un échec, le webhook peut simplement être en retard).
Future<StatutPaiementRdv?> attendreConfirmationPaiement(
  PaiementRepository repo, {
  required String rdvId,
  required ExecuteurAuthentifie executer,
  int tentativesMax = 12,
  Duration delai = const Duration(milliseconds: 1500),
}) async {
  for (var i = 0; i < tentativesMax; i++) {
    try {
      final statut = await executer(
        (token) => repo.obtenirStatut(rdvId: rdvId, token: token),
      );
      if (statut.estPaye) return statut;
    } on ApiException catch (e) {
      // Erreurs définitives : inutile de réessayer.
      if (e.statusCode == 403 || e.statusCode == 404) rethrow;
    } catch (_) {
      // Erreur réseau transitoire : on retente.
    }
    if (i < tentativesMax - 1) await Future<void>.delayed(delai);
  }
  return null;
}
