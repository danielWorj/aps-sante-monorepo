// lib/utils/mobile_money.dart
//
// Helpers Mobile Money (CamPay) côté app mobile.
// Miroir de client-plateform/src/utils/mobileMoney.js, lui-même miroir de
// `normaliserNumeroCM` (server/src/lib/campayService.js).
//
// Ces contrôles ne servent qu'au confort de saisie : le serveur revalide
// toujours (erreur ER101) — ne jamais s'y fier pour la sécurité.

/// Espaces, points, tirets, parenthèses et « + ».
final RegExp _separateurs = RegExp(r'[\s.\-()+]');

final RegExp _local9 = RegExp(r'^6\d{8}$');
final RegExp _international12 = RegExp(r'^2376\d{8}$');

String _nettoyer(String? saisie) => (saisie ?? '').replaceAll(_separateurs, '');

/// Numéro saisi → format CamPay `2376XXXXXXXX`.
///
/// Accepte `6XXXXXXXX` (9 chiffres) ou `2376XXXXXXXX`, avec ou sans
/// séparateurs (`+237 6 77 12 34 56`, `677.12.34.56`…).
/// Retourne `null` si le numéro est invalide.
String? normaliserNumeroCM(String? saisie) {
  final chiffres = _nettoyer(saisie);
  if (_local9.hasMatch(chiffres)) return '237$chiffres';
  if (_international12.hasMatch(chiffres)) return chiffres;
  return null;
}

/// `true` si la saisie est un mobile camerounais exploitable.
bool estNumeroCMValide(String? saisie) => normaliserNumeroCM(saisie) != null;

/// Formate pour l'affichage : `237677123456` / `677123456` → `6 77 12 34 56`.
///
/// Si la saisie est invalide, elle est renvoyée telle quelle.
String formaterNumeroAffichage(String? saisie) {
  final norm = normaliserNumeroCM(saisie);
  if (norm == null) return saisie ?? '';
  final local = norm.substring(3); // 9 chiffres
  return '${local[0]} ${local.substring(1, 3)} ${local.substring(3, 5)} '
      '${local.substring(5, 7)} ${local.substring(7, 9)}';
}
