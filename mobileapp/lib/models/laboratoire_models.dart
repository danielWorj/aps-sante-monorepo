// lib/models/laboratoire_models.dart
//
// Modèles du module « Laboratoires d'analyses » — miroir des réponses de
// server/src/controllers/laboratoire.controller.js et
// portailLaboratoire.controller.js. Lecture tolérante : un champ absent
// ne fait jamais échouer la désérialisation.

String? _texte(dynamic v) => v is String ? v : null;
int _entier(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
double? _reel(dynamic v) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) : null);
DateTime? _date(dynamic v) => v is String ? DateTime.tryParse(v) : null;
Map<String, dynamic> _carte(dynamic v) => v is Map<String, dynamic> ? v : <String, dynamic>{};
List<Map<String, dynamic>> _liste(dynamic v) => v is List ? v.whereType<Map<String, dynamic>>().toList() : const [];

/// Point GPS { latitude, longitude }.
class PointGps {
  final double latitude;
  final double longitude;

  const PointGps(this.latitude, this.longitude);

  static PointGps? fromJson(dynamic json) {
    final m = _carte(json);
    final lat = _reel(m['latitude']);
    final lng = _reel(m['longitude']);
    return lat == null || lng == null ? null : PointGps(lat, lng);
  }
}

enum StatutVerificationLaboratoire {
  nonPublie('non_publie', 'Non publiée'),
  enCours('en_cours', 'En vérification'),
  publie('publie', 'Fiche publiée');

  const StatutVerificationLaboratoire(this.api, this.libelle);
  final String api;
  final String libelle;

  static StatutVerificationLaboratoire depuis(String? v) =>
      values.firstWhere((s) => s.api == v, orElse: () => StatutVerificationLaboratoire.nonPublie);
}

/// Synthèse des avis publiés : nombre, moyenne, répartition 5 → 1.
class ResumeAvisLaboratoire {
  final int nombre;
  final double? moyenne;
  final Map<int, int> distribution;

  const ResumeAvisLaboratoire({required this.nombre, required this.moyenne, required this.distribution});

  factory ResumeAvisLaboratoire.fromJson(dynamic json) {
    final m = _carte(json);
    final d = _carte(m['distribution']);
    return ResumeAvisLaboratoire(
      nombre: _entier(m['nombre']),
      moyenne: _reel(m['moyenne']),
      distribution: {for (var n = 5; n >= 1; n--) n: _entier(d['$n'])},
    );
  }

  static const vide = ResumeAvisLaboratoire(nombre: 0, moyenne: null, distribution: {5: 0, 4: 0, 3: 0, 2: 0, 1: 0});
}

/// Fiche laboratoire (annuaire, détail, gestion).
class Laboratoire {
  final String id;
  final String nom;
  final String? description;
  final String? paysId;
  final String? paysNom;
  final String? codeIso2;
  final String? villeId;
  final String? villeNom;
  final String localisation;
  final String telephone;
  final String email;
  final String agrement;
  final StatutVerificationLaboratoire statut;
  final String? imageUrl;
  final String? devise;
  final PointGps? geolocalisation;
  final double? distanceKm;
  final int nbExamens;
  final int nbCentres;
  final int nbAvis;
  final double? noteMoyenne;
  final ResumeAvisLaboratoire resumeAvis;
  final bool estGestionnaire;
  // Vue gestionnaire / administration uniquement.
  final String? pieceIdentiteUrl;
  final String? documentAgrementUrl;

  const Laboratoire({
    required this.id,
    required this.nom,
    this.description,
    this.paysId,
    this.paysNom,
    this.codeIso2,
    this.villeId,
    this.villeNom,
    required this.localisation,
    required this.telephone,
    required this.email,
    required this.agrement,
    required this.statut,
    this.imageUrl,
    this.devise,
    this.geolocalisation,
    this.distanceKm,
    this.nbExamens = 0,
    this.nbCentres = 0,
    this.nbAvis = 0,
    this.noteMoyenne,
    this.resumeAvis = ResumeAvisLaboratoire.vide,
    this.estGestionnaire = false,
    this.pieceIdentiteUrl,
    this.documentAgrementUrl,
  });

  bool get estPublie => statut == StatutVerificationLaboratoire.publie;
  String get lieu => [villeNom, paysNom].whereType<String>().where((s) => s.isNotEmpty).join(', ');

  factory Laboratoire.fromJson(Map<String, dynamic> j) {
    final pays = _carte(j['pays']);
    final ville = _carte(j['ville']);
    return Laboratoire(
      id: _texte(j['laboratoire_id']) ?? '',
      nom: _texte(j['nom']) ?? '',
      description: _texte(j['description']),
      paysId: _texte(j['pays_id']) ?? _texte(pays['pays_id']),
      paysNom: _texte(pays['nom']),
      codeIso2: _texte(pays['code_iso2']),
      villeId: _texte(j['ville_id']) ?? _texte(ville['ville_id']),
      villeNom: _texte(ville['nom']),
      localisation: _texte(j['localisation']) ?? '',
      telephone: _texte(j['telephone']) ?? '',
      email: _texte(j['email']) ?? '',
      agrement: _texte(j['agrement']) ?? '',
      statut: StatutVerificationLaboratoire.depuis(_texte(j['statut_verification'])),
      imageUrl: _texte(j['image_url']),
      devise: _texte(j['devise']),
      geolocalisation: PointGps.fromJson(j['geolocalisation']),
      distanceKm: _reel(j['distance_km']),
      nbExamens: _entier(j['nb_examens']),
      nbCentres: _entier(j['nb_centres']),
      nbAvis: _entier(j['nb_avis']),
      noteMoyenne: _reel(j['note_moyenne']),
      resumeAvis: j['resume_avis'] == null ? ResumeAvisLaboratoire.vide : ResumeAvisLaboratoire.fromJson(j['resume_avis']),
      estGestionnaire: j['est_gestionnaire'] == true,
      pieceIdentiteUrl: _texte(j['piece_identite_url']),
      documentAgrementUrl: _texte(j['document_agrement_url']),
    );
  }
}

class ExamenLaboratoire {
  final String id;
  final String nom;
  final String? categorie;
  final String? description;
  final double? prix;
  final String? delaiResultat;
  final String? preparation;
  final bool disponible;

  const ExamenLaboratoire({
    required this.id,
    required this.nom,
    this.categorie,
    this.description,
    this.prix,
    this.delaiResultat,
    this.preparation,
    this.disponible = true,
  });

  factory ExamenLaboratoire.fromJson(Map<String, dynamic> j) => ExamenLaboratoire(
        id: _texte(j['examen_id']) ?? '',
        nom: _texte(j['nom']) ?? '',
        categorie: _texte(j['categorie']),
        description: _texte(j['description']),
        prix: _reel(j['prix']),
        delaiResultat: _texte(j['delai_resultat']),
        preparation: _texte(j['preparation']),
        disponible: j['disponible'] != false,
      );
}

/// Prix indicatif lisible (« Sur demande » sans prix).
String formaterPrixExamen(double? prix, String? devise) {
  if (prix == null) return 'Sur demande';
  final entier = prix == prix.roundToDouble();
  final brut = entier ? prix.toStringAsFixed(0) : prix.toStringAsFixed(2);
  final avecEspaces = brut.replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]} ');
  return [avecEspaces, devise ?? ''].where((s) => s.isNotEmpty).join(' ');
}

class CentreLaboratoire {
  final String id;
  final String nom;
  final String? villeId;
  final String? villeNom;
  final String localisation;
  final String? telephone;
  final String? horaires;
  final PointGps? gps;

  const CentreLaboratoire({
    required this.id,
    required this.nom,
    this.villeId,
    this.villeNom,
    required this.localisation,
    this.telephone,
    this.horaires,
    this.gps,
  });

  factory CentreLaboratoire.fromJson(Map<String, dynamic> j) => CentreLaboratoire(
        id: _texte(j['centre_id']) ?? '',
        nom: _texte(j['nom']) ?? '',
        villeId: _texte(j['ville_id']),
        villeNom: _texte(_carte(j['ville'])['nom']),
        localisation: _texte(j['localisation']) ?? '',
        telephone: _texte(j['telephone']),
        horaires: _texte(j['horaires']),
        gps: PointGps.fromJson(j['gps']),
      );
}

class MediaLaboratoire {
  final String id;
  final String type; // image | video
  final String? titre;
  final String url;
  final String? vignetteUrl;
  final int? tailleOctets;

  const MediaLaboratoire({required this.id, required this.type, this.titre, required this.url, this.vignetteUrl, this.tailleOctets});

  bool get estVideo => type == 'video';

  factory MediaLaboratoire.fromJson(Map<String, dynamic> j) => MediaLaboratoire(
        id: _texte(j['media_id']) ?? '',
        type: _texte(j['type']) ?? 'image',
        titre: _texte(j['titre']),
        url: _texte(j['url']) ?? '',
        vignetteUrl: _texte(j['vignette_url']),
        tailleOctets: j['taille_octets'] == null ? null : _entier(j['taille_octets']),
      );
}

class QuotaMedia {
  final int utilise;
  final int max;
  const QuotaMedia(this.utilise, this.max);
  bool get plein => utilise >= max;
  factory QuotaMedia.fromJson(dynamic j) => QuotaMedia(_entier(_carte(j)['utilise']), _entier(_carte(j)['max']));
}

class MediasLaboratoireGestion {
  final List<MediaLaboratoire> medias;
  final QuotaMedia photos;
  final QuotaMedia videos;
  final bool fichePubliee;

  const MediasLaboratoireGestion({required this.medias, required this.photos, required this.videos, required this.fichePubliee});

  List<MediaLaboratoire> get images => medias.where((m) => !m.estVideo).toList();
  List<MediaLaboratoire> get videosListe => medias.where((m) => m.estVideo).toList();

  factory MediasLaboratoireGestion.fromJson(Map<String, dynamic> j) {
    final q = _carte(j['quotas']);
    return MediasLaboratoireGestion(
      medias: _liste(j['medias']).map(MediaLaboratoire.fromJson).toList(),
      photos: QuotaMedia.fromJson(q['photos']),
      videos: QuotaMedia.fromJson(q['videos']),
      fichePubliee: j['fiche_publiee'] == true,
    );
  }
}

class AvisLaboratoire {
  final String id;
  final int note;
  final String? commentaire;
  final DateTime? date;
  final String auteur;

  const AvisLaboratoire({required this.id, required this.note, this.commentaire, this.date, required this.auteur});

  factory AvisLaboratoire.fromJson(Map<String, dynamic> j) => AvisLaboratoire(
        id: _texte(j['avis_id']) ?? '',
        note: _entier(j['note']),
        commentaire: _texte(j['commentaire']),
        date: _date(j['date_creation']),
        auteur: _texte(j['auteur']) ?? 'Utilisateur',
      );
}

/// Avis du compte connecté (tous statuts).
class MonAvisLaboratoire {
  final String id;
  final int note;
  final String? commentaire;
  final String statut; // en_attente | publie | rejete

  const MonAvisLaboratoire({required this.id, required this.note, this.commentaire, required this.statut});

  static MonAvisLaboratoire? fromJson(dynamic json) {
    if (json is! Map<String, dynamic>) return null;
    return MonAvisLaboratoire(
      id: _texte(json['avis_id']) ?? '',
      note: _entier(json['note']),
      commentaire: _texte(json['commentaire']),
      statut: _texte(json['statut_moderation']) ?? 'en_attente',
    );
  }
}

class PageAvisLaboratoire {
  final ResumeAvisLaboratoire resume;
  final List<AvisLaboratoire> avis;
  final int page;
  final int pages;
  final MonAvisLaboratoire? monAvis;

  const PageAvisLaboratoire({required this.resume, required this.avis, required this.page, required this.pages, this.monAvis});

  factory PageAvisLaboratoire.fromJson(Map<String, dynamic> j) {
    final p = _carte(j['pagination']);
    return PageAvisLaboratoire(
      resume: ResumeAvisLaboratoire.fromJson(j['resume']),
      avis: _liste(j['avis']).map(AvisLaboratoire.fromJson).toList(),
      page: _entier(p['page']),
      pages: _entier(p['pages']),
      monAvis: MonAvisLaboratoire.fromJson(j['mon_avis']),
    );
  }
}

/// Vue propriétaire : fiche complète, examens, centres.
class GestionLaboratoire {
  final Laboratoire laboratoire;
  final List<ExamenLaboratoire> examens;
  final List<CentreLaboratoire> centres;

  const GestionLaboratoire({required this.laboratoire, required this.examens, required this.centres});

  factory GestionLaboratoire.fromJson(Map<String, dynamic> j) => GestionLaboratoire(
        laboratoire: Laboratoire.fromJson(_carte(j['laboratoire'])),
        examens: _liste(j['examens']).map(ExamenLaboratoire.fromJson).toList(),
        centres: _liste(j['centres']).map(CentreLaboratoire.fromJson).toList(),
      );
}

/// Point d'une série jour par jour.
class PointSerie {
  final DateTime jour;
  final int valeur;
  const PointSerie(this.jour, this.valeur);
}

List<PointSerie> _serie(dynamic v, String cle) => _liste(v)
    .map((p) => PointSerie(DateTime.tryParse('${p['jour']}') ?? DateTime(2000), _entier(p[cle])))
    .toList();

class EngagementParType {
  final String cle;
  final String libelle;
  final int periode;
  final int septJours;
  const EngagementParType(this.cle, this.libelle, this.periode, this.septJours);
}

class TableauDeBordLaboratoire {
  final StatutVerificationLaboratoire statut;
  final int jours;
  final int vuesPeriode;
  final int visiteursPeriode;
  final int vuesSeptJours;
  final int vuesTotal;
  final List<PointSerie> serieVues;
  final int engagementsPeriode;
  final int engagementsTotal;
  final List<EngagementParType> engagementsParType;
  final List<PointSerie> serieEngagements;
  final double? tauxEngagement;
  final ResumeAvisLaboratoire avis;
  final int avisEnAttente;
  final List<AvisLaboratoire> derniersAvis;
  final int nbExamens;
  final int nbExamensIndisponibles;
  final int nbCentres;
  final QuotaMedia photos;
  final QuotaMedia videos;
  final int completude;
  final List<({String cle, String libelle, bool ok})> elementsCompletude;

  const TableauDeBordLaboratoire({
    required this.statut,
    required this.jours,
    required this.vuesPeriode,
    required this.visiteursPeriode,
    required this.vuesSeptJours,
    required this.vuesTotal,
    required this.serieVues,
    required this.engagementsPeriode,
    required this.engagementsTotal,
    required this.engagementsParType,
    required this.serieEngagements,
    required this.tauxEngagement,
    required this.avis,
    required this.avisEnAttente,
    required this.derniersAvis,
    required this.nbExamens,
    required this.nbExamensIndisponibles,
    required this.nbCentres,
    required this.photos,
    required this.videos,
    required this.completude,
    required this.elementsCompletude,
  });

  factory TableauDeBordLaboratoire.fromJson(Map<String, dynamic> j) {
    final vues = _carte(j['vues']);
    final totaux = _carte(vues['totaux']);
    final eng = _carte(j['engagements']);
    final avis = _carte(j['avis']);
    final contenus = _carte(j['contenus']);
    final completude = _carte(j['completude']);
    return TableauDeBordLaboratoire(
      statut: StatutVerificationLaboratoire.depuis(_texte(_carte(j['fiche'])['statut_verification'])),
      jours: _entier(j['jours']),
      vuesPeriode: _entier(_carte(totaux['periode'])['vues']),
      visiteursPeriode: _entier(_carte(totaux['periode'])['visiteurs']),
      vuesSeptJours: _entier(_carte(totaux['sept_jours'])['vues']),
      vuesTotal: _entier(_carte(totaux['depuis_le_debut'])['vues']),
      serieVues: _serie(vues['serie'], 'vues'),
      engagementsPeriode: _entier(eng['total_periode']),
      engagementsTotal: _entier(eng['depuis_le_debut']),
      engagementsParType: _carte(eng['par_type']).entries.map((e) {
        final t = _carte(e.value);
        return EngagementParType(e.key, _texte(t['libelle']) ?? e.key, _entier(t['periode']), _entier(t['sept_jours']));
      }).toList(),
      serieEngagements: _serie(eng['serie'], 'engagements'),
      tauxEngagement: _reel(j['taux_engagement']),
      avis: ResumeAvisLaboratoire.fromJson(avis),
      avisEnAttente: _entier(avis['en_attente']),
      derniersAvis: _liste(avis['derniers']).map(AvisLaboratoire.fromJson).toList(),
      nbExamens: _entier(contenus['examens']),
      nbExamensIndisponibles: _entier(contenus['examens_indisponibles']),
      nbCentres: _entier(contenus['centres']),
      photos: QuotaMedia.fromJson(contenus['photos']),
      videos: QuotaMedia.fromJson(contenus['videos']),
      completude: _entier(completude['score']),
      elementsCompletude: _liste(completude['elements'])
          .map((e) => (cle: _texte(e['cle']) ?? '', libelle: _texte(e['libelle']) ?? '', ok: e['ok'] == true))
          .toList(),
    );
  }
}

/// Réponse de POST /laboratoires (compte agent créé ou rattachement).
class LaboratoireCreationResultat {
  final String message;
  final Laboratoire laboratoire;
  final String? agentEmail;
  final String? motDePasseTemporaire;
  final bool rattacheAuCompte;

  const LaboratoireCreationResultat({
    required this.message,
    required this.laboratoire,
    this.agentEmail,
    this.motDePasseTemporaire,
    required this.rattacheAuCompte,
  });

  factory LaboratoireCreationResultat.fromJson(Map<String, dynamic> j) {
    final agent = _carte(j['agent']);
    return LaboratoireCreationResultat(
      message: _texte(j['message']) ?? '',
      laboratoire: Laboratoire.fromJson(_carte(j['laboratoire'])),
      agentEmail: _texte(_carte(agent['utilisateur'])['email']),
      motDePasseTemporaire: _texte(agent['mot_de_passe_temporaire']),
      rattacheAuCompte: agent['rattache_au_compte'] == true,
    );
  }
}

/// Filtres de l'annuaire envoyés au serveur.
class FiltresLaboratoires {
  final String? paysId;
  final String? villeId;
  final String? examen;

  const FiltresLaboratoires({this.paysId, this.villeId, this.examen});

  FiltresLaboratoires copier({String? paysId, String? villeId, String? examen, bool effacerVille = false}) =>
      FiltresLaboratoires(
        paysId: paysId ?? this.paysId,
        villeId: effacerVille ? null : (villeId ?? this.villeId),
        examen: examen ?? this.examen,
      );

  @override
  bool operator ==(Object other) =>
      other is FiltresLaboratoires && other.paysId == paysId && other.villeId == villeId && other.examen == examen;

  @override
  int get hashCode => Object.hash(paysId, villeId, examen);
}
