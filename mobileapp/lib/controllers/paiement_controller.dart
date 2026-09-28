import 'package:flutter_stripe/flutter_stripe.dart';

/// Retourne `true` si le patient a validé la feuille de paiement,
/// `false` s'il l'a fermée. Une erreur Stripe est relancée.
/// ⚠️ « true » ne veut PAS dire « RDV confirmé » : appeler ensuite
/// attendreConfirmationPaiement() (le webhook fait foi).
Future<bool> payerAvecPaymentSheet(
    PaiementRepository repo, {
      required String rdvId,
      required String token,
    }) async {
  final cfg = await repo.creerPaymentSheet(rdvId: rdvId, token: token);

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

  try {
    await Stripe.instance.presentPaymentSheet();
    return true;
  } on StripeException catch (e) {
    if (e.error.code == FailureCode.Canceled) return false;
    rethrow;
  }
}
