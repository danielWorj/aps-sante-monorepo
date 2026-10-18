// lib/models/annonceur_publicite_models.dart
//
// Publicité v9 côté annonceur et visiteur (miroir de
// server/src/controllers/publicite.controller.js et
// paiementPublicite.controller.js) :
//   - [SliderPage] / [PubliciteDiffusee] : carrousel public d'une page ;
//   - [ForfaitReservable] / [DisponibiliteForfait] : formulaire de réservation ;
//   - [MaPublicite] / [StatistiquesPublicite] : portail annonceur ;
//   - [DevisPublicite] : facture récapitulative avant paiement.
// Les dates de période sont des jours (AAAA-MM-JJ) ; `dateFin` est EXCLUE.

/// Codes des pages (emplacements) — partagés avec le web et le back-office.
class PagesPublicite {
  static const String accueil = 'PAGE_ACCUEIL';
  static const String medecin = 'PAGE_MEDECIN';
  static const String pharmacie = 'PAGE_PHARMACIE';
  static const String structure = 'PAGE_STRUCTURE_SANTE';
  static const String assurances = 'PAGE_ASSURANCES';

  static const Map<String, String> libelles = {
    accueil: "Page d'accueil",
    medecin: 'Annuaire des médecins',
    pharmacie: 'Annuaire des pharmacies',
    structure: 'Annuaire des centres de santé',
    assurances: 'Annuaire des assurances',
  };
}

String libellePosition(int rang) => rang == 1 ? '1re position' : '${rang}e position';

double _nombre(dynamic v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;
int _entier(dynamic v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}') ?? 0;
String? _texte(dynamic v) => v is String && v.isNotEmpty ? v : null;
DateTime? _jour(dynamic v) => v is String && v.length >= 10 ? DateTime.tryParse('${v.substring(0, 10)}T00:00:00Z') : null;
DateTime? _instant(dynamic v) => v is String ? DateTime.tryParse(v) : null;

/// "AAAA-MM-JJ" d'un jour UTC.
String jourIso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Jour lisible (« 05/11/2026 »).
String jourLisible(DateTime? d) => d == null
    ? '—'
    : '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

/// Dernier jour de diffusion (dateFin est exclue).
DateTime? dernierJour(DateTime? finExclue) => finExclue?.subtract(const Duration(days: 1));

/* ============================== Diffusion ============================== */

class PubliciteDiffusee {
  final String id;
  final String titre;
  final String? description;
  final String visuelUrl;
  final String? telephoneContact;
  final String? emailContact;
  final String? localisation;
  final int rang;

  const PubliciteDiffusee({
    required this.id,
    required this.titre,
    required this.visuelUrl,
    required this.rang,
    this.description,
    this.telephoneContact,
    this.emailContact,
    this.localisation,
  });

  factory PubliciteDiffusee.fromJson(Map<String, dynamic> j) => PubliciteDiffusee(
        id: j['publicite_id'] as String,
        titre: (j['titre'] as String?) ?? '',
        description: _texte(j['description']),
        visuelUrl: (j['visuel_url'] as String?) ?? '',
        telephoneContact: _texte(j['telephone_contact']),
        emailContact: _texte(j['email_contact']),
        localisation: _texte(j['localisation']),
        rang: _entier(j['rang']),
      );
}

class SliderPage {
  final String code;
  final String libelle;
  final int nombrePlaces;
  final List<PubliciteDiffusee> publicites;
  final bool reservationPossible;

  const SliderPage({
    required this.code,
    required this.libelle,
    required this.nombrePlaces,
    required this.publicites,
    required this.reservationPossible,
  });

  factory SliderPage.fromJson(Map<String, dynamic> j) {
    final emp = (j['emplacement'] as Map?)?.cast<String, dynamic>() ?? const {};
    return SliderPage(
      code: (emp['code'] as String?) ?? '',
      libelle: (emp['libelle'] as String?) ?? '',
      nombrePlaces: _entier(emp['nombre_places'] ?? 3),
      publicites: ((j['publicites'] as List?) ?? const [])
          .map((e) => PubliciteDiffusee.fromJson((e as Map).cast<String, dynamic>()))
          .toList(),
      reservationPossible: j['reservation_possible'] == true,
    );
  }
}

/* ============================== Réservation ============================== */

class ForfaitReservable {
  final String id;
  final String libelle;
  final double prix;
  final String devise;
  final int dureeJours;
  final int rang;

  const ForfaitReservable({
    required this.id,
    required this.libelle,
    required this.prix,
    required this.devise,
    required this.dureeJours,
    required this.rang,
  });

  factory ForfaitReservable.fromJson(Map<String, dynamic> j) => ForfaitReservable(
        id: j['forfait_publicitaire_id'] as String,
        libelle: (j['libelle'] as String?) ?? '',
        prix: _nombre(j['prix']),
        devise: (j['devise'] as String?) ?? 'xaf',
        dureeJours: _entier(j['duree_jours']),
        rang: _entier(j['rang'] ?? 1),
      );
}

class PeriodeOccupee {
  final DateTime debut;
  final DateTime finExclue;
  const PeriodeOccupee(this.debut, this.finExclue);
}

class DisponibiliteForfait {
  final String forfaitId;
  final DateTime premierJour;
  final DateTime prochaineDateLibre;
  final List<PeriodeOccupee> periodes;

  const DisponibiliteForfait({
    required this.forfaitId,
    required this.premierJour,
    required this.prochaineDateLibre,
    required this.periodes,
  });

  factory DisponibiliteForfait.fromJson(Map<String, dynamic> j) => DisponibiliteForfait(
        forfaitId: j['forfait_publicitaire_id'] as String,
        premierJour: _jour(j['premier_jour_reservable']) ?? DateTime.now().toUtc(),
        prochaineDateLibre: _jour(j['prochaine_date_libre']) ?? DateTime.now().toUtc(),
        periodes: ((j['periodes_occupees'] as List?) ?? const []).map((e) {
          final m = (e as Map).cast<String, dynamic>();
          return PeriodeOccupee(_jour(m['debut'])!, _jour(m['fin_exclue'])!);
        }).toList(),
      );

  /// Période prise qui chevauche [debut, debut + duree), ou null.
  PeriodeOccupee? conflit(DateTime debut, int dureeJours) {
    final fin = debut.add(Duration(days: dureeJours));
    for (final p in periodes) {
      if (p.debut.isBefore(fin) && p.finExclue.isAfter(debut)) return p;
    }
    return null;
  }
}

/// Informations de l'annonceur pré-remplies (compte ou dernière réservation).
class ProfilAnnonceur {
  final String? nom;
  final String? entreprise;
  final String? telephone;
  final String? email;

  const ProfilAnnonceur({this.nom, this.entreprise, this.telephone, this.email});

  factory ProfilAnnonceur.fromJson(Map<String, dynamic> j) {
    final a = (j['annonceur'] as Map?)?.cast<String, dynamic>() ?? const {};
    return ProfilAnnonceur(
      nom: _texte(a['annonceur_nom']),
      entreprise: _texte(a['annonceur_entreprise']),
      telephone: _texte(a['annonceur_telephone']),
      email: _texte(a['annonceur_email']),
    );
  }
}

/* ============================== Portail annonceur ============================== */

enum StatutPublicite {
  enModeration("En cours d'examen"),
  enAttentePaiement('Acceptée — à payer'),
  payee('Payée'),
  expiree('Délai de paiement dépassé'),
  rejetee('Rejetée'),
  annulee('Annulée');

  final String libelle;
  const StatutPublicite(this.libelle);

  static StatutPublicite depuisApi(String? v) => switch (v) {
        'en_attente_paiement' => enAttentePaiement,
        'payee' => payee,
        'expiree' => expiree,
        'rejetee' => rejetee,
        'annulee' => annulee,
        _ => enModeration,
      };
}

class MaPublicite {
  final String id;
  final String titre;
  final String? description;
  final String visuelUrl;
  final StatutPublicite statut;
  final bool enDiffusion;
  final int rang;
  final String emplacement;
  final DateTime? dateDebut;
  final DateTime? dateFin;
  final double montant;
  final String devise;
  final String? motifRejet;
  final DateTime? dateLimitePaiement;
  final String? factureNumero;
  final String? telephoneContact;
  final String? emailContact;
  final String? localisation;
  final int impressions;
  final int clics;

  const MaPublicite({
    required this.id,
    required this.titre,
    required this.visuelUrl,
    required this.statut,
    required this.enDiffusion,
    required this.rang,
    required this.emplacement,
    required this.montant,
    required this.devise,
    required this.impressions,
    required this.clics,
    this.description,
    this.dateDebut,
    this.dateFin,
    this.motifRejet,
    this.dateLimitePaiement,
    this.factureNumero,
    this.telephoneContact,
    this.emailContact,
    this.localisation,
  });

  factory MaPublicite.fromJson(Map<String, dynamic> j) {
    final stats = (j['statistiques'] as Map?)?.cast<String, dynamic>() ?? const {};
    return MaPublicite(
      id: j['publicite_id'] as String,
      titre: (j['titre'] as String?) ?? '',
      description: _texte(j['description']),
      visuelUrl: (j['visuel_url'] as String?) ?? '',
      statut: StatutPublicite.depuisApi(j['statut'] as String?),
      enDiffusion: j['en_diffusion'] == true,
      rang: _entier(j['rang'] ?? 1),
      emplacement: ((j['emplacement_publicitaire'] as Map?)?['libelle'] as String?) ?? '',
      dateDebut: _jour(j['date_debut']),
      dateFin: _jour(j['date_fin']),
      montant: _nombre(j['montant']),
      devise: (j['devise'] as String?) ?? 'xaf',
      motifRejet: _texte(j['motif_rejet']),
      dateLimitePaiement: _instant(j['date_limite_paiement']),
      factureNumero: ((j['facture'] as Map?)?['numero']) as String?,
      telephoneContact: _texte(j['telephone_contact']),
      emailContact: _texte(j['email_contact']),
      localisation: _texte(j['localisation']),
      impressions: _entier(stats['impressions']),
      clics: _entier(stats['clics']),
    );
  }
}

class ResumeAnnonceur {
  final int total;
  final int enDiffusion;
  final int aPayer;
  final int impressions;
  final int clics;

  const ResumeAnnonceur({required this.total, required this.enDiffusion, required this.aPayer, required this.impressions, required this.clics});

  factory ResumeAnnonceur.fromJson(Map<String, dynamic> j) => ResumeAnnonceur(
        total: _entier(j['total']),
        enDiffusion: _entier(j['en_diffusion']),
        aPayer: _entier(j['a_payer']),
        impressions: _entier(j['impressions']),
        clics: _entier(j['clics']),
      );
}

class MesPublicites {
  final List<MaPublicite> publicites;
  final ResumeAnnonceur resume;
  const MesPublicites(this.publicites, this.resume);
}

class JourStatistique {
  final DateTime jour;
  final int impressions;
  final int clics;
  const JourStatistique(this.jour, this.impressions, this.clics);
}

class StatistiquesPublicite {
  final int impressions;
  final int clics;
  final double tauxClic;
  final List<JourStatistique> serie;

  const StatistiquesPublicite({required this.impressions, required this.clics, required this.tauxClic, required this.serie});

  factory StatistiquesPublicite.fromJson(Map<String, dynamic> j) => StatistiquesPublicite(
        impressions: _entier(j['impressions']),
        clics: _entier(j['clics']),
        tauxClic: _nombre(j['taux_clic']),
        serie: ((j['serie'] as List?) ?? const []).map((e) {
          final m = (e as Map).cast<String, dynamic>();
          return JourStatistique(_jour(m['jour'])!, _entier(m['impressions']), _entier(m['clics']));
        }).toList(),
      );
}

/* ============================== Paiement ============================== */

class LigneDevisPublicite {
  final String code;
  final String libelle;
  final double montant;
  const LigneDevisPublicite(this.code, this.libelle, this.montant);
}

/// Facture récapitulative (devis) d'une publicité, recalculée par le serveur
/// selon le moyen de paiement : montant initial, frais d'agrégateur, total.
class DevisPublicite {
  final String devise;
  final double montantInitial;
  final double fraisAgregateur;
  final double total;
  final List<LigneDevisPublicite> lignes;
  final bool campayDisponible;
  final DateTime? dateLimitePaiement;

  const DevisPublicite({
    required this.devise,
    required this.montantInitial,
    required this.fraisAgregateur,
    required this.total,
    required this.lignes,
    required this.campayDisponible,
    this.dateLimitePaiement,
  });

  factory DevisPublicite.fromJson(Map<String, dynamic> j) => DevisPublicite(
        devise: (j['devise'] as String?) ?? 'xaf',
        montantInitial: _nombre(j['sous_total']),
        fraisAgregateur: _nombre(j['frais_agregateur']),
        total: _nombre(j['total']),
        lignes: ((j['lignes'] as List?) ?? const []).map((e) {
          final m = (e as Map).cast<String, dynamic>();
          return LigneDevisPublicite((m['code'] as String?) ?? '', (m['libelle'] as String?) ?? '', _nombre(m['montant']));
        }).toList(),
        campayDisponible: j['campay_disponible'] == true,
        dateLimitePaiement: _instant((j['publicite'] as Map?)?['date_limite_paiement']),
      );
}

class CollectePublicite {
  final String? reference;
  final String? ussdCode;
  const CollectePublicite({this.reference, this.ussdCode});
}
