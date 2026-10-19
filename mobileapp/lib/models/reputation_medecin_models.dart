// lib/models/reputation_medecin_models.dart
//
// Réputation du médecin — modèles des réponses de
// server/src/controllers/reputationMedecin.controller.js :
//   - tableau de bord (audience, activité, réputation) ;
//   - avis (synthèse des notes, avis publics, pages d'avis) ;
//   - consultations à noter (patient).

int _int(dynamic v) => v is num ? v.toInt() : (v is String ? int.tryParse(v) ?? 0 : 0);
double? _double(dynamic v) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) : null);
Map<String, dynamic> _map(dynamic v) => v is Map<String, dynamic> ? v : <String, dynamic>{};
List<dynamic> _liste(dynamic v) => v is List ? v : const [];
DateTime? _date(dynamic v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

/* =============================== Avis =============================== */

/// Critères facultatifs d'un avis (clé serveur, champ de saisie, libellé).
class CritereAvis {
  final String cle;
  final String champ;
  final String libelle;
  const CritereAvis(this.cle, this.champ, this.libelle);
}

const criteresAvis = <CritereAvis>[
  CritereAvis('ponctualite', 'note_ponctualite', 'Ponctualité'),
  CritereAvis('ecoute', 'note_ecoute', 'Écoute'),
  CritereAvis('explications', 'note_explications', 'Clarté des explications'),
];

const libellesNote = <int, String>{1: 'Décevant', 2: 'Passable', 3: 'Bien', 4: 'Très bien', 5: 'Excellent'};

/// Synthèse des notes (avis publiés) — `resume` côté serveur.
class ResumeNotes {
  final int nombre;
  final double? moyenne;

  /// Nombre d'avis par note (1 à 5).
  final Map<int, int> distribution;

  /// Moyenne par critère (`ponctualite`, `ecoute`, `explications`).
  final Map<String, double?> criteres;
  final int? tauxRecommandation;
  final int recommandationsExprimees;

  const ResumeNotes({
    required this.nombre,
    required this.moyenne,
    required this.distribution,
    required this.criteres,
    required this.tauxRecommandation,
    required this.recommandationsExprimees,
  });

  factory ResumeNotes.fromJson(Map<String, dynamic> j) {
    final d = _map(j['distribution']);
    final c = _map(j['criteres']);
    return ResumeNotes(
      nombre: _int(j['nombre']),
      moyenne: _double(j['moyenne']),
      distribution: {for (var n = 1; n <= 5; n++) n: _int(d['$n'])},
      criteres: {for (final cr in criteresAvis) cr.cle: _double(c[cr.cle])},
      tauxRecommandation: j['taux_recommandation'] == null ? null : _int(j['taux_recommandation']),
      recommandationsExprimees: _int(j['recommandations_exprimees']),
    );
  }

  int get maxDistribution => distribution.values.fold(1, (a, b) => b > a ? b : a);
}

/// Un avis tel qu'exposé au public et au médecin (jamais d'identifiant d'auteur).
class AvisPublic {
  final String avisId;
  final int note;
  final Map<String, int?> criteres;
  final bool? recommande;
  final String? commentaire;
  final DateTime? dateCreation;
  final String auteur;
  final bool patientVerifie;
  final String? typeConsultation;
  final String? reponse;
  final DateTime? dateReponse;

  /// Espace médecin : signalement en cours d'examen.
  final DateTime? signaleLe;

  const AvisPublic({
    required this.avisId,
    required this.note,
    required this.criteres,
    required this.recommande,
    required this.commentaire,
    required this.dateCreation,
    required this.auteur,
    required this.patientVerifie,
    required this.typeConsultation,
    required this.reponse,
    required this.dateReponse,
    required this.signaleLe,
  });

  factory AvisPublic.fromJson(Map<String, dynamic> j) {
    final c = _map(j['criteres']);
    final r = j['reponse'] is Map<String, dynamic> ? j['reponse'] as Map<String, dynamic> : null;
    final s = j['signalement'] is Map<String, dynamic> ? j['signalement'] as Map<String, dynamic> : null;
    return AvisPublic(
      avisId: j['avis_id'] as String? ?? '',
      note: _int(j['note']),
      criteres: {for (final cr in criteresAvis) cr.cle: c[cr.cle] == null ? null : _int(c[cr.cle])},
      recommande: j['recommande'] as bool?,
      commentaire: j['commentaire'] as String?,
      dateCreation: _date(j['date_creation']),
      auteur: j['auteur'] as String? ?? 'Patient',
      patientVerifie: j['patient_verifie'] == true,
      typeConsultation: j['type_consultation'] as String?,
      reponse: r?['texte'] as String?,
      dateReponse: _date(r?['date']),
      signaleLe: _date(s?['date']),
    );
  }

  AvisPublic copyWith({String? reponse, DateTime? dateReponse, bool effacerReponse = false, DateTime? signaleLe}) {
    return AvisPublic(
      avisId: avisId,
      note: note,
      criteres: criteres,
      recommande: recommande,
      commentaire: commentaire,
      dateCreation: dateCreation,
      auteur: auteur,
      patientVerifie: patientVerifie,
      typeConsultation: typeConsultation,
      reponse: effacerReponse ? null : (reponse ?? this.reponse),
      dateReponse: effacerReponse ? null : (dateReponse ?? this.dateReponse),
      signaleLe: signaleLe ?? this.signaleLe,
    );
  }
}

class PaginationAvis {
  final int page;
  final int pages;
  final int total;
  const PaginationAvis({required this.page, required this.pages, required this.total});

  factory PaginationAvis.fromJson(Map<String, dynamic> j) =>
      PaginationAvis(page: _int(j['page']), pages: _int(j['pages']), total: _int(j['total']));
}

/// Page d'avis : GET /medecins/:id/avis (public) ou /medecins/mon-espace/avis.
class PageAvis {
  final ResumeNotes resume;
  final List<AvisPublic> avis;
  final PaginationAvis pagination;

  /// Espace médecin uniquement.
  final int enAttenteModeration;
  final int sansReponse;

  const PageAvis({
    required this.resume,
    required this.avis,
    required this.pagination,
    this.enAttenteModeration = 0,
    this.sansReponse = 0,
  });

  factory PageAvis.fromJson(Map<String, dynamic> j) => PageAvis(
        resume: ResumeNotes.fromJson(_map(j['resume'])),
        avis: _liste(j['avis']).map((a) => AvisPublic.fromJson(_map(a))).toList(),
        pagination: PaginationAvis.fromJson(_map(j['pagination'])),
        enAttenteModeration: _int(j['en_attente_moderation']),
        sansReponse: _int(j['sans_reponse']),
      );
}

/// Consultation terminée encore à noter (GET /avis-medecin/a-donner).
class ConsultationANoter {
  final String rdvId;
  final DateTime? dateCreneau;
  final String typeRdv;
  final String medecinNom;
  final String? specialite;
  final String? photoUrl;

  const ConsultationANoter({
    required this.rdvId,
    required this.dateCreneau,
    required this.typeRdv,
    required this.medecinNom,
    required this.specialite,
    required this.photoUrl,
  });

  factory ConsultationANoter.fromJson(Map<String, dynamic> j) {
    final m = _map(j['medecin']);
    final u = _map(m['utilisateur']);
    final nom = [u['prenom'], u['nom']].whereType<String>().join(' ').trim();
    return ConsultationANoter(
      rdvId: j['rdv_id'] as String? ?? '',
      dateCreneau: _date(j['date_creneau']),
      typeRdv: j['type_rdv'] as String? ?? 'physique',
      medecinNom: nom.isEmpty ? 'Votre médecin' : 'Dr $nom',
      specialite: _map(m['specialite'])['nom'] as String?,
      photoUrl: m['photo_url'] as String?,
    );
  }
}

/* ========================== Tableau de bord ========================== */

/// Un seau de la période (jour, semaine ou mois) et ses valeurs.
class SeauTdb {
  final String cle;
  final DateTime debut;
  final DateTime fin;
  final Map<String, num?> valeurs;
  const SeauTdb({required this.cle, required this.debut, required this.fin, required this.valeurs});

  static DateTime _jour(dynamic s) => DateTime.tryParse('${s}T00:00:00Z') ?? DateTime.utc(1970);

  factory SeauTdb.fromJson(Map<String, dynamic> j) => SeauTdb(
        cle: j['cle'] as String? ?? '',
        debut: _jour(j['debut']),
        fin: _jour(j['fin']),
        valeurs: {
          for (final e in j.entries)
            if (e.key != 'cle' && e.key != 'debut' && e.key != 'fin') e.key: e.value is num ? e.value as num : null,
        },
      );

  num? operator [](String champ) => valeurs[champ];
}

List<SeauTdb>? _serie(dynamic v) => v is List ? v.map((e) => SeauTdb.fromJson(_map(e))).toList() : null;
int? _variation(Map<String, dynamic> v, String k) => v[k] == null ? null : _int(v[k]);

class AudienceTdb {
  final bool disponible;
  final bool detaillees;
  final int vues;
  final int visiteurs;
  final int engagements;
  final double? tauxEngagement;

  /// Détail par type (null sans « statistiques détaillées »).
  final Map<String, int>? engagementsParType;
  final Map<String, int?> variations;
  final List<SeauTdb>? serie;

  const AudienceTdb({
    required this.disponible,
    required this.detaillees,
    this.vues = 0,
    this.visiteurs = 0,
    this.engagements = 0,
    this.tauxEngagement,
    this.engagementsParType,
    this.variations = const {},
    this.serie,
  });

  factory AudienceTdb.fromJson(Map<String, dynamic> j) {
    if (j['disponible'] != true) return const AudienceTdb(disponible: false, detaillees: false);
    final t = _map(j['totaux']);
    final v = _map(j['variations']);
    final parType = t['engagements_par_type'];
    return AudienceTdb(
      disponible: true,
      detaillees: j['detaillees'] == true,
      vues: _int(t['vues']),
      visiteurs: _int(t['visiteurs']),
      engagements: _int(t['engagements']),
      tauxEngagement: _double(t['taux_engagement']),
      engagementsParType: parType is Map ? {for (final e in parType.entries) '${e.key}': _int(e.value)} : null,
      variations: {for (final k in ['vues', 'visiteurs', 'engagements']) k: _variation(v, k)},
      serie: _serie(j['serie']),
    );
  }
}

class CarteCreneauxTdb {
  final List<String> tranches;

  /// 7 lignes (lundi → dimanche) × tranches.
  final List<List<int>> grille;
  final int total;
  const CarteCreneauxTdb({required this.tranches, required this.grille, required this.total});

  factory CarteCreneauxTdb.fromJson(Map<String, dynamic> j) => CarteCreneauxTdb(
        tranches: _liste(j['tranches']).map((t) => _map(t)['libelle'] as String? ?? '').toList(),
        grille: _liste(j['grille']).map((l) => _liste(l).map(_int).toList()).toList(),
        total: _int(j['total']),
      );
}

class ActiviteTdb {
  final Map<String, num?> totaux;
  final Map<String, int?> variations;
  final List<SeauTdb> serie;
  final int aVenir7Jours;
  final CarteCreneauxTdb carte;

  const ActiviteTdb({
    required this.totaux,
    required this.variations,
    required this.serie,
    required this.aVenir7Jours,
    required this.carte,
  });

  factory ActiviteTdb.fromJson(Map<String, dynamic> j) {
    final v = _map(j['variations']);
    return ActiviteTdb(
      totaux: {for (final e in _map(j['totaux']).entries) e.key: e.value is num ? e.value as num : null},
      variations: {for (final e in v.entries) e.key: _variation(v, e.key)},
      serie: _serie(j['serie']) ?? const [],
      aVenir7Jours: _int(j['a_venir_7_jours']),
      carte: CarteCreneauxTdb.fromJson(_map(j['carte_creneaux'])),
    );
  }

  int total(String k) => (totaux[k] ?? 0).toInt();
}

class ReputationTdb {
  final int avisPeriode;
  final double? notePeriode;
  final List<SeauTdb> serie;
  final ResumeNotes resume;

  const ReputationTdb({required this.avisPeriode, required this.notePeriode, required this.serie, required this.resume});

  factory ReputationTdb.fromJson(Map<String, dynamic> j) {
    final p = _map(j['periode']);
    return ReputationTdb(
      avisPeriode: _int(p['avis']),
      notePeriode: _double(p['note_moyenne']),
      serie: _serie(j['serie']) ?? const [],
      resume: ResumeNotes.fromJson(_map(j['resume'])),
    );
  }
}

/// GET /medecins/mon-espace/tableau-de-bord
class TableauDeBordMedecin {
  final bool fichePubliee;
  final DateTime du;
  final DateTime au;
  final String granularite;
  final int jours;
  final AudienceTdb audience;
  final ActiviteTdb activite;
  final ReputationTdb reputation;

  const TableauDeBordMedecin({
    required this.fichePubliee,
    required this.du,
    required this.au,
    required this.granularite,
    required this.jours,
    required this.audience,
    required this.activite,
    required this.reputation,
  });

  factory TableauDeBordMedecin.fromJson(Map<String, dynamic> j) {
    final p = _map(j['periode']);
    return TableauDeBordMedecin(
      fichePubliee: _map(j['fiche'])['statut_verification'] == 'publie',
      du: SeauTdb._jour(p['du']),
      au: SeauTdb._jour(p['au']),
      granularite: p['granularite'] as String? ?? 'jour',
      jours: _int(p['jours']),
      audience: AudienceTdb.fromJson(_map(j['audience'])),
      activite: ActiviteTdb.fromJson(_map(j['activite'])),
      reputation: ReputationTdb.fromJson(_map(j['reputation'])),
    );
  }
}
