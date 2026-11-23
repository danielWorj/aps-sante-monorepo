// lib/utils/marque.dart
//
// Nom de la marque et raison sociale affichés dans l'application. Mêmes
// variables que le serveur, le web et le back-office, passées au build :
//   flutter build apk --dart-define=NOM_MARQUE=ApSa \
//     --dart-define=RAISON_SOCIALE="AZA PROXI SANTÉ ASSURANCES"
// Sans --dart-define, les valeurs par défaut ci-dessous s'appliquent.
// Le nom affiché sous l'icône Android (android:label) suit NOM_MARQUE (voir
// android/app/build.gradle.kts) ; sur iOS, il est fixé dans Info.plist.

const String _nomMarqueDefini = String.fromEnvironment('NOM_MARQUE');
const String _raisonSocialeDefinie = String.fromEnvironment('RAISON_SOCIALE');

/// Nom de la marque (défaut « ApSa »).
const String nomMarque = _nomMarqueDefini == '' ? 'ApSa' : _nomMarqueDefini;

/// Raison sociale de la société (défaut « AZA PROXI SANTÉ ASSURANCES »).
const String raisonSociale =
    _raisonSocialeDefinie == '' ? 'AZA PROXI SANTÉ ASSURANCES' : _raisonSocialeDefinie;

/// « d'ApSa » devant une voyelle ou un h, « de … » sinon.
final String deMarque =
    RegExp(r"^[aeiouyhàâäéèêëîïôöùûüœæ]", caseSensitive: false).hasMatch(nomMarque)
        ? "d'$nomMarque"
        : 'de $nomMarque';
