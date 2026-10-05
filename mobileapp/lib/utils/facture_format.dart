// lib/utils/facture_format.dart
//
// Politique de fonds v2 — formatage PUR des lignes d'une facture, partagé par
// la card à l'écran (facture_recapitulative.dart) et par le PDF
// (facture_pdf_service.dart) : les deux affichent ainsi exactement les mêmes
// textes, comme le composant web FactureRecapitulative.jsx.
//
// Aucun montant n'est calculé ici : on ne fait que mettre en forme ce que le
// serveur renvoie (lignes et total déjà arrondis, somme = montant débité).

import '../repositories/paiement_repository.dart';
import 'fonds.dart';

/// Taux (fraction) en pourcentage français, 2 décimales max :
/// 0.02 → « 2 % », 0.125 → « 12,5 % ». Espace insécable avant « % ».
String pourcentTexte(double taux) {
  final centiemes = (taux * 100 * 100).round() / 100;
  var texte = centiemes.toStringAsFixed(2);
  texte = texte.replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
  return '${texte.replaceAll('.', ',')}\u00A0%';
}

/// Détail du calcul d'une ligne : « 10 000 FCFA × 2 % », éventuellement
/// suivi de « + 100 FCFA fixe ». Chaîne vide si la ligne n'a ni taux ni
/// montant fixe (ex. la consultation).
String formuleLigne(LigneFacture ligne, String devise) {
  final parts = <String>[];
  if (ligne.taux != null && ligne.base != null) {
    parts.add('${montantDevise(ligne.base, devise)} × ${pourcentTexte(ligne.taux!)}');
  }
  if (ligne.montantFixe != null) {
    parts.add(
      '${parts.isEmpty ? '' : '+ '}${montantDevise(ligne.montantFixe, devise)} fixe',
    );
  }
  return parts.join(' ');
}

/// Titre court du document (aussi utilisé pour le nom du fichier PDF).
String titreFacture(Facture f) => f.estDevis ? 'Aperçu de la facture' : 'Facture';

/// Date longue « 12 octobre 2026 », ou `null` si [date] est `null`.
String? dateLongueFacture(DateTime? date) {
  if (date == null) return null;
  const mois = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ];
  final d = date.toLocal();
  return '${d.day.toString().padLeft(2, '0')} ${mois[d.month - 1]} ${d.year}';
}

/// Rend un texte sûr pour les polices PDF intégrées (Helvetica) : elles ne
/// couvrent pas tout Unicode (espaces fines, apostrophe typographique, €…).
/// Les accents français et « × » (Latin-1) sont conservés.
String texteSurPdf(String texte) => texte
    .replaceAll('\u00A0', ' ')
    .replaceAll('\u202F', ' ')
    .replaceAll('\u2019', "'")
    .replaceAll('\u2013', '-')
    .replaceAll('\u2014', '-')
    .replaceAll('\u2026', '...')
    .replaceAll('\u20AC', 'EUR');