// lib/models/espace_presence_models.dart
//
// Espaces pharmacie et centre de santé — miroir des réponses de
// server/src/controllers/espacePresence.controller.js et
// paiementAbonnementPresence.controller.js (vue de gestion de l'abonnement).
// Lecture tolérante : un champ absent ne fait jamais échouer la
// désérialisation.

import 'portail_assurance_models.dart' show DureeOffre;

String? _texte(dynamic v) => v is String ? v : null;
int _entier(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
double? _reel(dynamic v) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) : null);
DateTime? _date(dynamic v) => v is String ? DateTime.tryParse(v) : null;
Map<String, dynamic> _carte(dynamic v) => v is Map<String, dynamic> ? v : <String, dynamic>{};
List<Map<String, dynamic>> _liste(dynamic v) => v is List ? v.whereType<Map<String, dynamic>>().toList() : const [];

/// Type d'espace : chemins d'API et libellés.
enum TypeEspacePresence {
  pharmacie('pharmacie', '/pharmacies', 'Espace pharmacie', 'pharmacie'),
  structure('structure', '/centres-sante', 'Espace centre de santé', 'centre de santé');

  const TypeEspacePresence(this.api, this.base, this.espace, this.libelle);

  /// Valeur du type côté serveur (abonnements-presence/:type).
  final String api;

  /// Préfixe des routes de la fiche.
  final String base;
  final String espace;
  final String libelle;
}

/* ============================ Horaires ============================ */

const joursSemaine = <(String, String)>[
  ('lundi', 'Lundi'),
  ('mardi', 'Mardi'),
  ('mercredi', 'Mercredi'),
  ('jeudi', 'Jeudi'),
  ('vendredi', 'Vendredi'),
  ('samedi', 'Samedi'),
  ('dimanche', 'Dimanche'),
];

/// Plage d'ouverture « HH:MM » → « HH:MM » (fin au plus « 24:00 »).
class PlageHoraire {
  final String debut;
  final String fin;
  const PlageHoraire(this.debut, this.fin);

  bool get journeeEntiere => debut == '00:00' && fin == '24:00';

  Map<String, dynamic> toJson() => {'debut': debut, 'fin': fin};
}

/// Semaine type : jour → plages (liste vide = fermé).
typedef SemaineHoraires = Map<String, List<PlageHoraire>>;

SemaineHoraires? semaineDepuisJson(dynamic json) {
  if (json is! Map) return null;
  return {
    for (final (jour, _) in joursSemaine)
      jour: _liste(json[jour]).map((p) => PlageHoraire(_texte(p['debut']) ?? '00:00', _texte(p['fin']) ?? '00:00')).toList(),
  };
}

Map<String, dynamic> semaineVersJson(SemaineHoraires s) => {
      for (final (jour, _) in joursSemaine) jour: (s[jour] ?? const []).map((p) => p.toJson()).toList(),
    };

String plagesEnTexte(List<PlageHoraire>? plages) {
  if (plages == null || plages.isEmpty) return 'Fermé';
  if (plages.length == 1 && plages.first.journeeEntiere) return '24 h/24';
  return plages.map((p) => '${p.debut} – ${p.fin}').join(', ');
}

/// État d'ouverture calculé par le serveur (heure du pays de la fiche).
class OuverturePresence {
  final bool ouvert;
  final String? jusquA;
  final String? prochainJour;
  final String? prochaineHeure;

  const OuverturePresence({required this.ouvert, this.jusquA, this.prochainJour, this.prochaineHeure});

  static OuverturePresence? fromJson(dynamic json) {
    if (json is! Map<String, dynamic>) return null;
    final p = _carte(json['prochaine_ouverture']);
    return OuverturePresence(
      ouvert: json['ouvert'] == true,
      jusquA: _texte(json['jusqu_a']),
      prochainJour: _texte(p['jour']),
      prochaineHeure: _texte(p['heure']),
    );
  }

  String get libelle {
    if (ouvert) return jusquA == null ? 'Ouvert 24 h/24' : 'Ouvert · ferme à $jusquA';
    if (prochainJour == null) return 'Fermé';
    final nom = joursSemaine.firstWhere((j) => j.$1 == prochainJour, orElse: () => (prochainJour!, prochainJour!)).$2.toLowerCase();
    return 'Fermé · ouvre $nom à $prochaineHeure';
  }
}

/* ============================ Droits ============================ */

/// Droits publics de la fiche selon son abonnement de présence.
class DroitsPresence {
  final String niveau;
  final bool contactDirect;
  final bool photos;
  final bool descriptionEnrichie;
  final bool presentationEquipe;
  final bool statistiques;
  final bool statistiquesDetaillees;
  final int? maxPhotos;

  const DroitsPresence({
    required this.niveau,
    required this.contactDirect,
    required this.photos,
    required this.descriptionEnrichie,
    required this.presentationEquipe,
    required this.statistiques,
    required this.statistiquesDetaillees,
    this.maxPhotos,
  });

  factory DroitsPresence.fromJson(dynamic json) {
    final m = _carte(json);
    return DroitsPresence(
      niveau: _texte(m['niveau_presence']) ?? 'basique',
      contactDirect: m['contact_direct'] == true,
      photos: m['photos'] == true,
      descriptionEnrichie: m['description_enrichie'] == true,
      presentationEquipe: m['presentation_equipe'] == true,
      statistiques: m['statistiques'] == true,
      statistiquesDetaillees: m['statistiques_detaillees'] == true,
      maxPhotos: m['max_photos'] is num ? (m['max_photos'] as num).toInt() : null,
    );
  }

  /// Avantages en clair (offres et « ce que voit le public »).
  List<String> libelles(TypeEspacePresence type) => [
        if (contactDirect) 'Téléphone, e-mail et formulaire de contact',
        if (photos) 'Photo principale et galerie${maxPhotos != null ? ' ($maxPhotos photos au plus)' : ''}',
        if (descriptionEnrichie) type == TypeEspacePresence.pharmacie ? 'Description, services et actualités' : 'Présentation, prestations et actualités',
        if (presentationEquipe) "Présentation de l'équipe",
        if (statistiques) statistiquesDetaillees ? 'Statistiques détaillées' : 'Statistiques de consultation',
      ];
}

/* ============================ Fiche ============================ */

enum StatutFichePresence {
  nonPublie('non_publie', 'Non publiée'),
  enCours('en_cours', 'En vérification'),
  publie('publie', 'Fiche publiée');

  const StatutFichePresence(this.api, this.libelle);
  final String api;
  final String libelle;

  static StatutFichePresence depuis(String? v) => values.firstWhere((s) => s.api == v, orElse: () => StatutFichePresence.nonPublie);
}

class MembreEquipe {
  final String nom;
  final String fonction;
  final bool moi;
  const MembreEquipe(this.nom, this.fonction, this.moi);
}

/// Fiche de l'espace actif, complète (GET /:base/mon-espace).
class FichePresence {
  final TypeEspacePresence type;
  final String id;
  final String nom;
  final StatutFichePresence statut;
  final bool enLigne;
  final String telephone;
  final String? email;
  final String? adresse;
  final String? paysId;
  final String? paysNom;
  final String? villeId;
  final String? villeNom;
  final double? latitude;
  final double? longitude;
  final String? imageUrl;
  final String? numeroOrdre;
  final String? typeStructure;
  final String? descriptionEnrichie;
  final String? servicesParticuliers;
  final String? presentationEquipe;
  final SemaineHoraires? horaires;
  final String? horairesNote;
  final bool urgences24h;
  final OuverturePresence? ouverture;
  final DroitsPresence droits;
  final String statutAbonnement;
  final List<MembreEquipe> equipe;

  const FichePresence({
    required this.type,
    required this.id,
    required this.nom,
    required this.statut,
    required this.enLigne,
    required this.telephone,
    this.email,
    this.adresse,
    this.paysId,
    this.paysNom,
    this.villeId,
    this.villeNom,
    this.latitude,
    this.longitude,
    this.imageUrl,
    this.numeroOrdre,
    this.typeStructure,
    this.descriptionEnrichie,
    this.servicesParticuliers,
    this.presentationEquipe,
    this.horaires,
    this.horairesNote,
    this.urgences24h = false,
    this.ouverture,
    required this.droits,
    required this.statutAbonnement,
    required this.equipe,
  });

  factory FichePresence.fromJson(TypeEspacePresence type, Map<String, dynamic> json) {
    final f = _carte(json['fiche']);
    final geo = _carte(f['geolocalisation']);
    return FichePresence(
      type: type,
      id: _texte(f['acteur_id']) ?? '',
      nom: _texte(f['nom']) ?? '',
      statut: StatutFichePresence.depuis(_texte(f['statut_verification'])),
      enLigne: f['en_ligne'] == true,
      telephone: _texte(f['telephone']) ?? '',
      email: _texte(f['email']),
      adresse: _texte(f['adresse']),
      paysId: _texte(f['pays_id']),
      paysNom: _texte(_carte(f['pays'])['nom']),
      villeId: _texte(f['ville_id']),
      villeNom: _texte(_carte(f['ville'])['nom']),
      latitude: _reel(geo['latitude']),
      longitude: _reel(geo['longitude']),
      imageUrl: _texte(f['image_url']),
      numeroOrdre: _texte(f['numero_ordre_titulaire']),
      typeStructure: _texte(f['type_structure']),
      descriptionEnrichie: _texte(f['description_enrichie']),
      servicesParticuliers: _texte(f['services_particuliers']),
      presentationEquipe: _texte(f['presentation_equipe']),
      horaires: semaineDepuisJson(f['horaires']),
      horairesNote: _texte(f['horaires_note']),
      urgences24h: f['urgences_24h'] == true,
      ouverture: OuverturePresence.fromJson(f['ouverture']),
      droits: DroitsPresence.fromJson(json['droits']),
      statutAbonnement: _texte(json['statut_abonnement']) ?? 'aucun',
      equipe: _liste(json['equipe'])
          .map((a) => MembreEquipe(
                [_texte(a['prenom']), _texte(a['nom'])].whereType<String>().where((s) => s.isNotEmpty).join(' '),
                _texte(a['fonction']) ?? '',
                a['moi'] == true,
              ))
          .toList(),
    );
  }
}

const typesStructure = <(String, String)>[
  ('clinique', 'Clinique'),
  ('hopital', 'Hôpital'),
  ('centre_medical', 'Centre médical'),
  ('dispensaire', 'Dispensaire'),
  ('laboratoire', 'Laboratoire'),
];

String libelleTypeStructure(String? v) => typesStructure.firstWhere((t) => t.$1 == v, orElse: () => (v ?? '', 'Centre de santé')).$2;

/* ============================ Tableau de bord ============================ */

class PointVues {
  final DateTime jour;
  final int vues;
  const PointVues(this.jour, this.vues);
}

class GardePresence {
  final String id;
  final DateTime? debut;
  final DateTime? fin;
  final String? ville;
  final bool enCours;

  const GardePresence({required this.id, this.debut, this.fin, this.ville, this.enCours = false});

  factory GardePresence.fromJson(Map<String, dynamic> j) => GardePresence(
        id: _texte(j['garde_id']) ?? '',
        debut: _date(j['date_debut']),
        fin: _date(j['date_fin']),
        ville: _texte(_carte(j['ville'])['nom']),
        enCours: j['en_cours'] == true,
      );
}

class AvisPresence {
  final String id;
  final int note;
  final String? commentaire;
  final DateTime? date;
  final String auteur;

  const AvisPresence({required this.id, required this.note, this.commentaire, this.date, required this.auteur});

  factory AvisPresence.fromJson(Map<String, dynamic> j) => AvisPresence(
        id: _texte(j['avis_id']) ?? '',
        note: _entier(j['note']),
        commentaire: _texte(j['commentaire']),
        date: _date(j['date_creation']),
        auteur: _texte(j['auteur']) ?? 'Utilisateur',
      );
}

class ResumeAvisPresence {
  final int nombre;
  final double? moyenne;
  final Map<int, int> distribution;

  const ResumeAvisPresence({required this.nombre, required this.moyenne, required this.distribution});

  factory ResumeAvisPresence.fromJson(dynamic json) {
    final m = _carte(json);
    final d = _carte(m['distribution']);
    return ResumeAvisPresence(
      nombre: _entier(m['nombre']),
      moyenne: _reel(m['moyenne']),
      distribution: {for (var n = 5; n >= 1; n--) n: _entier(d['$n'])},
    );
  }
}

class ElementCompletude {
  final String cle;
  final String libelle;
  final String rubrique;
  final bool ok;
  const ElementCompletude(this.cle, this.libelle, this.rubrique, this.ok);
}

class TableauDeBordPresence {
  final int jours;
  final StatutFichePresence statut;
  final bool enLigne;
  final String statutAbonnement;
  final DateTime? finAbonnement;
  final bool enGrace;
  final int? joursRestants;
  final DroitsPresence droits;
  final OuverturePresence? ouverture;
  final bool vuesDisponibles;
  final int vuesPeriode;
  final int vuesSeptJours;
  final int vuesTotal;
  final List<PointVues> serieVues;
  final int messagesNonLus;
  final int messagesRecus30j;
  final List<MessagePresence> derniersMessages;
  final int photos;
  final int photosVisibles;
  final int actualites;
  final int actualitesEnLigne;
  final int prestations;
  final int completude;
  final List<ElementCompletude> elementsCompletude;
  // Pharmacie
  final GardePresence? gardeEnCours;
  final List<GardePresence> prochainesGardes;
  final ResumeAvisPresence? avis;
  final int avisEnAttente;
  final List<AvisPresence> derniersAvis;

  const TableauDeBordPresence({
    required this.jours,
    required this.statut,
    required this.enLigne,
    required this.statutAbonnement,
    this.finAbonnement,
    required this.enGrace,
    this.joursRestants,
    required this.droits,
    this.ouverture,
    required this.vuesDisponibles,
    required this.vuesPeriode,
    required this.vuesSeptJours,
    required this.vuesTotal,
    required this.serieVues,
    required this.messagesNonLus,
    required this.messagesRecus30j,
    required this.derniersMessages,
    required this.photos,
    required this.photosVisibles,
    required this.actualites,
    required this.actualitesEnLigne,
    required this.prestations,
    required this.completude,
    required this.elementsCompletude,
    this.gardeEnCours,
    this.prochainesGardes = const [],
    this.avis,
    this.avisEnAttente = 0,
    this.derniersAvis = const [],
  });

  factory TableauDeBordPresence.fromJson(Map<String, dynamic> j) {
    final fiche = _carte(j['fiche']);
    final ab = _carte(j['abonnement']);
    final vues = _carte(j['vues']);
    final totaux = _carte(vues['totaux']);
    final messages = _carte(j['messages']);
    final contenus = _carte(j['contenus']);
    final completude = _carte(j['completude']);
    final gardes = j['gardes'] is Map ? _carte(j['gardes']) : null;
    final avis = j['avis'] is Map ? _carte(j['avis']) : null;
    return TableauDeBordPresence(
      jours: _entier(j['jours']),
      statut: StatutFichePresence.depuis(_texte(fiche['statut_verification'])),
      enLigne: fiche['en_ligne'] == true,
      statutAbonnement: _texte(ab['statut_abonnement']) ?? 'aucun',
      finAbonnement: _date(ab['date_fin']),
      enGrace: ab['en_grace'] == true,
      joursRestants: ab['jours_restants'] is num ? (ab['jours_restants'] as num).toInt() : null,
      droits: DroitsPresence.fromJson(j['droits']),
      ouverture: OuverturePresence.fromJson(j['ouverture']),
      vuesDisponibles: vues['disponible'] == true,
      vuesPeriode: _entier(_carte(totaux['periode'])['vues']),
      vuesSeptJours: _entier(_carte(totaux['sept_jours'])['vues']),
      vuesTotal: _entier(_carte(totaux['depuis_le_debut'])['vues']),
      serieVues: _liste(vues['serie']).map((p) => PointVues(DateTime.tryParse('${p['jour']}') ?? DateTime(2000), _entier(p['vues']))).toList(),
      messagesNonLus: _entier(messages['non_lus']),
      messagesRecus30j: _entier(messages['recus_30_jours']),
      derniersMessages: _liste(messages['derniers']).map(MessagePresence.fromJson).toList(),
      photos: _entier(_carte(contenus['photos'])['total']),
      photosVisibles: _entier(_carte(contenus['photos'])['visibles']),
      actualites: _entier(_carte(contenus['actualites'])['total']),
      actualitesEnLigne: _entier(_carte(contenus['actualites'])['en_ligne']),
      prestations: _entier(contenus['prestations']),
      completude: _entier(completude['score']),
      elementsCompletude: _liste(completude['elements'])
          .map((e) => ElementCompletude(_texte(e['cle']) ?? '', _texte(e['libelle']) ?? '', _texte(e['rubrique']) ?? '', e['ok'] == true))
          .toList(),
      gardeEnCours: gardes != null && gardes['en_cours'] is Map<String, dynamic> ? GardePresence.fromJson(gardes['en_cours'] as Map<String, dynamic>) : null,
      prochainesGardes: gardes == null ? const [] : _liste(gardes['prochaines']).map(GardePresence.fromJson).toList(),
      avis: avis == null ? null : ResumeAvisPresence.fromJson(avis),
      avisEnAttente: avis == null ? 0 : _entier(avis['en_attente']),
      derniersAvis: avis == null ? const [] : _liste(avis['derniers']).map(AvisPresence.fromJson).toList(),
    );
  }
}

/* ============================ Photos ============================ */

class PhotoPresence {
  final String id;
  final String url;
  final String? titre;
  final bool visiblePublic;

  const PhotoPresence({required this.id, required this.url, this.titre, required this.visiblePublic});

  factory PhotoPresence.fromJson(Map<String, dynamic> j) => PhotoPresence(
        id: _texte(j['media_id']) ?? '',
        url: _texte(j['url']) ?? '',
        titre: _texte(j['titre']),
        visiblePublic: j['visible_public'] == true,
      );
}

class PhotosPresenceGestion {
  final List<PhotoPresence> photos;
  final int utilise;
  final int max;
  final bool droitPhotos;
  final int? maxPublic;

  const PhotosPresenceGestion({required this.photos, required this.utilise, required this.max, required this.droitPhotos, this.maxPublic});

  factory PhotosPresenceGestion.fromJson(Map<String, dynamic> j) {
    final q = _carte(j['quota']);
    final d = _carte(j['droits']);
    return PhotosPresenceGestion(
      photos: _liste(j['images']).map(PhotoPresence.fromJson).toList(),
      utilise: _entier(q['utilise']),
      max: _entier(q['max']),
      droitPhotos: d['photos'] == true,
      maxPublic: d['max_photos'] is num ? (d['max_photos'] as num).toInt() : null,
    );
  }

  bool get plein => utilise >= max;
}

/* ============================ Actualités ============================ */

class ActualitePresence {
  final String id;
  final String titre;
  final String contenu;
  final String? imageUrl;
  final bool publiee;
  final DateTime? datePublication;
  final DateTime? dateExpiration;

  /// en_ligne | programmee | brouillon | expiree
  final String statut;

  const ActualitePresence({
    required this.id,
    required this.titre,
    required this.contenu,
    this.imageUrl,
    required this.publiee,
    this.datePublication,
    this.dateExpiration,
    required this.statut,
  });

  factory ActualitePresence.fromJson(Map<String, dynamic> j) => ActualitePresence(
        id: _texte(j['actualite_id']) ?? '',
        titre: _texte(j['titre']) ?? '',
        contenu: _texte(j['contenu']) ?? '',
        imageUrl: _texte(j['image_url']),
        publiee: j['publiee'] == true,
        datePublication: _date(j['date_publication']),
        dateExpiration: _date(j['date_expiration']),
        statut: _texte(j['statut']) ?? 'brouillon',
      );

  String get libelleStatut => switch (statut) {
        'en_ligne' => 'En ligne',
        'programmee' => 'Programmée',
        'expiree' => 'Terminée',
        _ => 'Brouillon',
      };
}

class ActualitesPresenceGestion {
  final List<ActualitePresence> actualites;
  final bool visiblesPublic;
  final int max;

  const ActualitesPresenceGestion({required this.actualites, required this.visiblesPublic, required this.max});

  factory ActualitesPresenceGestion.fromJson(Map<String, dynamic> j) => ActualitesPresenceGestion(
        actualites: _liste(j['actualites']).map(ActualitePresence.fromJson).toList(),
        visiblesPublic: j['visibles_public'] == true,
        max: _entier(j['max']),
      );
}

/* ============================ Messages ============================ */

class MessagePresence {
  final String id;
  final String? nom;
  final String email;
  final String? telephone;
  final String contenu;

  /// non_lu | lu | archive
  final String statut;
  final DateTime? date;
  final bool compteAps;

  const MessagePresence({
    required this.id,
    this.nom,
    required this.email,
    this.telephone,
    required this.contenu,
    required this.statut,
    this.date,
    this.compteAps = false,
  });

  factory MessagePresence.fromJson(Map<String, dynamic> j) => MessagePresence(
        id: _texte(j['message_id']) ?? '',
        nom: _texte(j['nom']),
        email: _texte(j['email']) ?? '',
        telephone: _texte(j['telephone']),
        contenu: _texte(j['contenu']) ?? '',
        statut: _texte(j['statut']) ?? 'lu',
        date: _date(j['date_creation']),
        compteAps: j['compte_aps'] == true,
      );

  String get expediteur => (nom != null && nom!.isNotEmpty) ? nom! : email;
  bool get nonLu => statut == 'non_lu';
}

class MessagesPresence {
  final List<MessagePresence> messages;
  final Map<String, int> compteurs;

  const MessagesPresence({required this.messages, required this.compteurs});

  factory MessagesPresence.fromJson(Map<String, dynamic> j) {
    final c = _carte(j['compteurs']);
    return MessagesPresence(
      messages: _liste(j['messages']).map(MessagePresence.fromJson).toList(),
      compteurs: {for (final k in ['non_lu', 'lu', 'archive']) k: _entier(c[k])},
    );
  }
}

/* ============================ Prestations ============================ */

class PrestationStructure {
  final String id;
  final String nom;
  final String? categorie;
  final String? description;
  final double? prix;
  final bool disponible;

  const PrestationStructure({required this.id, required this.nom, this.categorie, this.description, this.prix, required this.disponible});

  factory PrestationStructure.fromJson(Map<String, dynamic> j) => PrestationStructure(
        id: _texte(j['prestation_id']) ?? '',
        nom: _texte(j['nom']) ?? '',
        categorie: _texte(j['categorie']),
        description: _texte(j['description']),
        prix: _reel(j['prix']),
        disponible: j['disponible'] != false,
      );
}

class PrestationsGestion {
  final List<PrestationStructure> prestations;
  final String? devise;
  final bool visiblesPublic;
  final int max;

  const PrestationsGestion({required this.prestations, this.devise, required this.visiblesPublic, required this.max});

  factory PrestationsGestion.fromJson(Map<String, dynamic> j) => PrestationsGestion(
        prestations: _liste(j['prestations']).map(PrestationStructure.fromJson).toList(),
        devise: _texte(j['devise']),
        visiblesPublic: j['visibles_public'] == true,
        max: _entier(j['max']),
      );
}

String formaterPrixPrestation(double? prix, String? devise) {
  if (prix == null) return 'Sur demande';
  final entier = prix == prix.roundToDouble() ? prix.toInt().toString() : prix.toStringAsFixed(2);
  final groupe = entier.replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]} ');
  return '$groupe ${devise ?? ''}'.trim();
}

/* ============================ Gardes et avis (pharmacie) ============================ */

class AvisPresenceGestion {
  final ResumeAvisPresence resume;
  final int enAttente;
  final List<AvisPresence> avis;

  const AvisPresenceGestion({required this.resume, required this.enAttente, required this.avis});

  factory AvisPresenceGestion.fromJson(Map<String, dynamic> j) => AvisPresenceGestion(
        resume: ResumeAvisPresence.fromJson(j['resume']),
        enAttente: _entier(j['en_attente']),
        avis: _liste(j['avis']).map(AvisPresence.fromJson).toList(),
      );
}

/* ============================ Abonnement ============================ */

class HistoriqueAbonnementPresence {
  final String niveauLibelle;
  final String statut;
  final DateTime? dateDebut;
  final DateTime? dateFin;
  final double montant;
  final String devise;
  final String? factureNumero;

  const HistoriqueAbonnementPresence({
    required this.niveauLibelle,
    required this.statut,
    this.dateDebut,
    this.dateFin,
    required this.montant,
    required this.devise,
    this.factureNumero,
  });

  factory HistoriqueAbonnementPresence.fromJson(Map<String, dynamic> j) => HistoriqueAbonnementPresence(
        niveauLibelle: _texte(_carte(j['niveau'])['libelle']) ?? '',
        statut: _texte(j['statut']) ?? '',
        dateDebut: _date(j['date_debut']),
        dateFin: _date(j['date_fin']),
        montant: _reel(j['montant_total']) ?? 0,
        devise: _texte(j['devise']) ?? '',
        factureNumero: _texte(_carte(j['facture'])['numero']),
      );
}

/// Vue de gestion de l'abonnement (GET /abonnements-presence/:type/gestion).
class GestionAbonnementPresence {
  final String statutVerification;
  final bool enLigne;
  final DroitsPresence droits;
  final String statutAbonnement;
  final String? niveauLibelle;
  final DateTime? dateFin;
  final bool enGrace;
  final int? joursRestants;
  final ({String id, String niveauLibelle, int dureeMois, double montant, String devise})? brouillon;
  final List<HistoriqueAbonnementPresence> historique;

  const GestionAbonnementPresence({
    required this.statutVerification,
    required this.enLigne,
    required this.droits,
    required this.statutAbonnement,
    this.niveauLibelle,
    this.dateFin,
    required this.enGrace,
    this.joursRestants,
    this.brouillon,
    required this.historique,
  });

  factory GestionAbonnementPresence.fromJson(Map<String, dynamic> j) {
    final fiche = _carte(j['fiche']);
    final ab = _carte(j['abonnement']);
    final b = j['brouillon'] is Map ? _carte(j['brouillon']) : null;
    final statut = _texte(fiche['statut_verification']) ?? 'non_publie';
    return GestionAbonnementPresence(
      statutVerification: statut,
      enLigne: statut == 'publie' || (statut == 'en_cours' && fiche['date_premiere_publication'] != null),
      droits: DroitsPresence.fromJson(j['droits']),
      statutAbonnement: _texte(ab['statut_abonnement']) ?? 'aucun',
      niveauLibelle: _texte(_carte(ab['niveau'])['libelle']),
      dateFin: _date(ab['date_fin']),
      enGrace: ab['en_grace'] == true,
      joursRestants: ab['jours_restants'] is num ? (ab['jours_restants'] as num).toInt() : null,
      brouillon: b == null
          ? null
          : (
              id: _texte(b['abonnement_id']) ?? '',
              niveauLibelle: _texte(_carte(b['niveau'])['libelle']) ?? '',
              dureeMois: _entier(b['duree_mois']),
              montant: _reel(b['montant_total']) ?? 0,
              devise: _texte(b['devise']) ?? '',
            ),
      historique: _liste(j['historique']).map(HistoriqueAbonnementPresence.fromJson).toList(),
    );
  }

  /// Dernier jour couvert (date_fin est exclusive).
  DateTime? get dernierJour => dateFin?.subtract(const Duration(days: 1));
}

/// Formule proposée (GET /abonnements-presence/:type/offres) — même forme
/// que les offres assurance ; les avantages sont des droits de présence.
class OffrePresence {
  final String niveauId;
  final String code;
  final String libelle;
  final DroitsPresence avantages;
  final bool gratuite;
  final List<DureeOffre> durees;

  const OffrePresence({
    required this.niveauId,
    required this.code,
    required this.libelle,
    required this.avantages,
    required this.gratuite,
    required this.durees,
  });

  factory OffrePresence.fromJson(Map<String, dynamic> m) => OffrePresence(
        niveauId: _texte(m['niveau_id']) ?? '',
        code: _texte(m['code']) ?? '',
        libelle: _texte(m['libelle']) ?? '',
        avantages: DroitsPresence.fromJson(m['avantages']),
        gratuite: m['gratuite'] != null,
        durees: _liste(m['durees']).map(DureeOffre.fromJson).toList(),
      );

  List<DureeOffre> get dureesDisponibles => durees.where((d) => d.disponible).toList();
}

class OffresPresence {
  final List<OffrePresence> offres;
  final String? niveauCourant;

  const OffresPresence({required this.offres, this.niveauCourant});

  factory OffresPresence.fromJson(Map<String, dynamic> json) => OffresPresence(
        offres: _liste(json['offres']).map(OffrePresence.fromJson).toList(),
        niveauCourant: _texte(_carte(json['abonnement_courant'])['niveau_presence']),
      );
}
