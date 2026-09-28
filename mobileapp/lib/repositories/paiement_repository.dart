class PaymentSheetConfig {
  const PaymentSheetConfig({required this.clientSecret, required this.publishableKey});
  final String clientSecret;
  final String publishableKey;
}

// dans PaiementRepository :
Future<PaymentSheetConfig> creerPaymentSheet({
  required String rdvId,
  required String token,
}) async {
  final r = await http
      .post(
    Uri.parse('${ApiRealEndpoints.paiementRdv(rdvId)}-natif'),
    headers: _entetes(token),
    body: '{}',
  )
      .timeout(_timeout);
  final d = _decoder(r) as Map<String, dynamic>;
  return PaymentSheetConfig(
    clientSecret: d['client_secret'] as String,
    publishableKey: d['publishable_key'] as String,
  );
}
