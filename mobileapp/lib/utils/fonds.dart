// lib/utils/fonds.dart
//
// Politique de fonds v2 : helpers d'AFFICHAGE pour les portails patient et
// médecin, équivalent de src/utils/fonds.js côté client-plateform.
//
// Principe directeur : le front affiche, le serveur décide. Rien ici ne
// calcule une règle financière. Les seuls calculs côté client sont les
// délais d'avertissement (24 h) et le compte à rebours de reprogrammation
// (48 h, voir [delaiReprogrammation] dans rendez_vous_models.dart).
//
// Pas de dépendance `intl` dans le projet : le formatage des nombres et
// des dates en français est fait à la main (aucune dépendance nouvelle
// sans validation).

import '../models/rendez_vous_models.dart';

/// Annulation tardive = STRICTEMENT moins de 24 h avant le rendez-vous
/// (pile 24 h : non tardive). Avertissement indicatif : le serveur tranche.
const Duration delaiTardif = Duration(hours: 24);

/// Qui annule : détermine le résumé affiché après une annulation.
enum RoleAnnulation { patient, medecin }

// ─── Montants ───────────────────────────────────────────────────────

/// Espace insécable fine : séparateur de milliers en français, qui évite
/// qu'un montant soit coupé en fin de ligne.
const String _espaceInsecable = '\u00A0';

String _grouperMilliers(int valeurAbsolue) {
  final chiffres = valeurAbsolue.toString();
  final tampon = StringBuffer();
  for (var i = 0; i < chiffres.length; i++) {
    if (i > 0 && (chiffres.length - i) % 3 == 0) tampon.write(_espaceInsecable);
    tampon.write(chiffres[i]);
  }
  return tampon.toString();
}

/// Nombre entier arrondi, groupé par milliers (« 12 500 »).
String formaterEntier(num? valeur) {
  final arrondi = (valeur ?? 0).round();
  final texte = _grouperMilliers(arrondi.abs());
  return arrondi < 0 ? '-$texte' : texte;
}

/// Nombre à 2 décimales, virgule décimale et milliers groupés (« 12 500,50 »).
String _formaterDecimal(num? valeur) {
  final v = valeur ?? 0;
  final centimes = (v.abs() * 100).round();
  final entier = centimes ~/ 100;
  final reste = (centimes % 100).toString().padLeft(2, '0');
  final texte = '${_grouperMilliers(entier)},$reste';
  return v < 0 && centimes != 0 ? '-$texte' : texte;
}

/// Montant en FCFA, arrondi à l'unité (« 12 500 FCFA »).
String fcfa(num? valeur) => '${formaterEntier(valeur)}$_espaceInsecable''FCFA';

/// Montant dans sa devise (XAF par défaut), formaté selon la devise
/// renvoyée par le serveur : la devise Stripe vient de la configuration
/// et n'est pas forcément XAF.
String montantDevise(num? valeur, [String? devise]) {
  final code = (devise == null || devise.isEmpty ? 'xaf' : devise).toUpperCase();
  switch (code) {
    case 'XAF':
      return fcfa(valeur);
    case 'EUR':
      return '${_formaterDecimal(valeur)}$_espaceInsecable€';
    case 'USD':
      return '${_formaterDecimal(valeur)}$_espaceInsecable''\$US';
    case 'XOF':
    case 'JPY':
      // Devises sans décimales.
      return '${formaterEntier(valeur)}$_espaceInsecable$code';
    default:
      return '${_formaterDecimal(valeur)}$_espaceInsecable$code';
  }
}

// ─── Dates ──────────────────────────────────────────────────────────

const List<String> _joursCourts = [
  'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.',
];
const List<String> _joursLongs = [
  'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
];
const List<String> _moisCourts = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];
const List<String> _moisLongs = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

String _deuxChiffres(int n) => n.toString().padLeft(2, '0');

/// « lun. 12 oct., 14:30 » dans le fuseau local de l'appareil.
/// Chaîne vide si [date] est `null`.
String dateHeure(DateTime? date) {
  if (date == null) return '';
  final d = date.toLocal();
  return '${_joursCourts[d.weekday - 1]} ${_deuxChiffres(d.day)} '
      '${_moisCourts[d.month - 1]}, ${_deuxChiffres(d.hour)}:${_deuxChiffres(d.minute)}';
}

/// « 12 oct., 14:30 » dans le fuseau local (sans jour de la semaine).
String dateCourte(DateTime? date) {
  if (date == null) return '';
  final d = date.toLocal();
  return '${_deuxChiffres(d.day)} ${_moisCourts[d.month - 1]}, '
      '${_deuxChiffres(d.hour)}:${_deuxChiffres(d.minute)}';
}

// ─── Délais ─────────────────────────────────────────────────────────

/// Annulation tardive = STRICTEMENT moins de 24 h avant le rendez-vous.
/// À exactement 24 h : non tardive. Avertissement indicatif uniquement,
/// le serveur reste seul juge.
bool estTardif(DateTime dateCreneau, {DateTime? maintenant}) {
  final ref = maintenant ?? DateTime.now();
  return dateCreneau.millisecondsSinceEpoch - ref.millisecondsSinceEpoch <
      delaiTardif.inMilliseconds;
}

/// Temps restant avant une échéance, prêt à afficher.
class TempsRestant {
  final bool expire;
  final String texte;

  const TempsRestant({required this.expire, required this.texte});
}

/// « 1 j 5 h » (24 h et plus), « 3 h 07 min » ou « délai dépassé ».
/// L'échéance d'une reprogrammation s'obtient avec
/// [RendezVous.echeanceReprogrammation] (passage à `a_reprogrammer` + 48 h,
/// jamais prolongée).
TempsRestant tempsRestant(DateTime echeance, {DateTime? maintenant}) {
  final ref = maintenant ?? DateTime.now();
  final ms = echeance.millisecondsSinceEpoch - ref.millisecondsSinceEpoch;
  if (ms <= 0) return const TempsRestant(expire: true, texte: 'délai dépassé');
  final h = ms ~/ 3600000;
  final m = (ms % 3600000) ~/ 60000;
  final texte = h >= 24
      ? '${h ~/ 24} j ${h % 24} h'
      : '$h h ${_deuxChiffres(m)} min';
  return TempsRestant(expire: false, texte: texte);
}

// ─── Créneaux d'agenda ──────────────────────────────────────────────
// Convention du dépôt (voir medecin-agenda.jsx côté web) : `creneau.date`
// et `horaire.heure_debut` sont des valeurs « épinglées en UTC », lues par
// découpage de chaîne et JAMAIS converties dans le fuseau local. Le
// serveur (reprogrammation) compare la date et l'heure UTC de
// `nouvelle_date` à l'agenda : l'ISO se reconstruit donc de la même
// façon, sans passer par un DateTime local.

/// Partie « jour » (AAAA-MM-JJ) d'une valeur de date de créneau.
String _jour(String valeur) =>
    valeur.length >= 10 ? valeur.substring(0, 10) : valeur;

/// Partie « HH:mm » d'une heure de créneau (« 1970-01-01T09:30:00.000Z »
/// ou « 09:30:00 »).
String _hhmm(String valeur) {
  final heure = valeur.contains('T') ? valeur.split('T')[1] : valeur;
  return heure.length >= 5 ? heure.substring(0, 5) : heure;
}

/// ISO 8601 envoyé comme `nouvelle_date` : `AAAA-MM-JJTHH:mm:00.000Z`.
String creneauVersIso(String date, String heureDebut) =>
    '${_jour(date)}T${_hhmm(heureDebut)}:00.000Z';

/// Heure du créneau, « 09:30 ».
String libelleHeureCreneau(String heureDebut) => _hhmm(heureDebut);

/// Jour du créneau, « lundi 12 octobre ». Calculé sur la date épinglée,
/// sans décalage de fuseau. Renvoie la valeur d'origine si elle est
/// illisible.
String libelleJourCreneau(String date) {
  final morceaux = _jour(date).split('-');
  if (morceaux.length != 3) return date;
  final annee = int.tryParse(morceaux[0]);
  final mois = int.tryParse(morceaux[1]);
  final jour = int.tryParse(morceaux[2]);
  if (annee == null || mois == null || jour == null || mois < 1 || mois > 12) {
    return date;
  }
  final d = DateTime.utc(annee, mois, jour, 12);
  return '${_joursLongs[d.weekday - 1]} $jour ${_moisLongs[mois - 1]}';
}

// ─── Annulation ─────────────────────────────────────────────────────

/// Résume la réponse de PATCH /rendez-vous/:id/statut pour un message
/// affiché après annulation, selon qui annule (mêmes textes que le web).
String resumerAnnulation(ResultatAnnulation? resultat, RoleAnnulation role) {
  final r = resultat?.remboursement;
  final parties = <String>['Rendez-vous annulé.'];

  if (role == RoleAnnulation.patient) {
    if (r != null && r.estATraiter) {
      parties.add(
        'Votre remboursement Mobile Money sera traité par notre équipe ; '
        'le montant reçu dépendra des frais du retrait '
        '(estimation : ${montantDevise(r.montantEstimeNet, r.devise)}).',
      );
    } else if (r != null) {
      parties.add('Remboursement de ${montantDevise(r.montant, r.devise)} en cours.');
    } else if (resultat?.tardif == true) {
      parties.add('Aucun remboursement : annulation à moins de 24 h du rendez-vous.');
    }
  } else {
    if (r != null) parties.add('Le patient est remboursé.');
    if (resultat?.amende == true) {
      parties.add(
        'Une amende a été enregistrée : elle sera déduite de votre '
        'prochaine libération de fonds.',
      );
    }
  }
  return parties.join(' ');
}