// lib/models/portail_assurance_models.dart
//
// Portail assurance (agent d'une compagnie / d'un courtier) — pendant mobile
// du portail web (/portail/assurance). Modèles des réponses de :
//   GET /services-assurance/mon-service           -> [FicheAssuranceGeree]
//   GET /services-assurance/:id/gestion           -> [GestionAssurance]
//   GET /services-assurance/:id/tableau-de-bord   -> [TableauDeBordAssurance]
//   GET /services-assurance/:id/medias/gestion    -> [MediasGestion]
//   GET /mises-en-relation-assurance              -> [PageDemandes]
//   GET /abonnements-assurance/offres             -> [OffresAbonnementAssurance]
// Lecture tolérante : un champ absent ne fait jamais échouer l'écran.

Map<String, dynamic> _carte(dynamic v) => v is Map<String, dynamic> ? v : const {};
List<Map<String, dynamic>> _liste(dynamic v) =>
    v is List ? v.whereType<Map<String, dynamic>>().toList() : const [];
String? _texte(dynamic v) => v is String ? v : null;
int _entier(dynamic v, [int defaut = 0]) => v is num ? v.toInt() : defaut;
int? _entierOuNull(dynamic v) => v is num ? v.toInt() : null;
double? _decimal(dynamic v) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) : null);
bool _booleen(dynamic v) => v == true;
DateTime? _date(dynamic v) => v is String ? DateTime.tryParse(v) : null;

/// Quota : [max] `null` = illimité, 0 = non inclus dans l'abonnement.
class Quota {
  final int utilise;
  final int? max;

  const Quota({required this.utilise, this.max});

  factory Quota.fromJson(dynamic json) {
    final m = _carte(json);
    return Quota(utilise: _entier(m['utilise']), max: _entierOuNull(m['max']));
  }

  bool get illimite => max == null;
  bool get nonInclus => max == 0;
  bool get atteint => max != null && utilise >= max!;
  String get libelle => illimite ? '$utilise / illimité' : (nonInclus ? 'non inclus' : '$utilise / $max');
}

/// Fiche gérée par le compte connecté (un agent = une fiche).
class FicheAssuranceGeree {
  final String id;
  final String nom;
  final String statutVerification; // publie | en_cours | non_publie
  final String typeActeur; // compagnie | courtier
  final String? imageUrl;

  const FicheAssuranceGeree({
    required this.id,
    required this.nom,
    required this.statutVerification,
    required this.typeActeur,
    this.imageUrl,
  });

  factory FicheAssuranceGeree.fromJson(Map<String, dynamic> json) => FicheAssuranceGeree(
        id: json['service_assurance_id'] as String,
        nom: _texte(json['nom']) ?? '',
        statutVerification: _texte(json['statut_verification']) ?? 'en_cours',
        typeActeur: _texte(json['type_acteur']) ?? 'compagnie',
        imageUrl: _texte(json['image_url']),
      );

  bool get estPubliee => statutVerification == 'publie';
  String get libelleType => typeActeur == 'courtier' ? 'Courtier en assurance' : "Compagnie d'assurance";
}

/// Droits résolus par le serveur à partir de l'abonnement de la fiche.
class DroitsAssurance {
  final bool siegeComplet;
  final bool afficherActivites;
  final bool afficherAgences;
  final bool formulaireContact;
  final bool suiviDemandes;
  final bool videoPresentation;
  final bool statsCompletes;
  final int? maxAgences;
  final int? maxPhotos;

  const DroitsAssurance({
    this.siegeComplet = false,
    this.afficherActivites = false,
    this.afficherAgences = false,
    this.formulaireContact = false,
    this.suiviDemandes = false,
    this.videoPresentation = false,
    this.statsCompletes = false,
    this.maxAgences = 0,
    this.maxPhotos = 0,
  });

  factory DroitsAssurance.fromJson(dynamic json) {
    final m = _carte(json);
    return DroitsAssurance(
      siegeComplet: _booleen(m['siege_complet']),
      afficherActivites: _booleen(m['afficher_activites']),
      afficherAgences: _booleen(m['afficher_agences']),
      formulaireContact: _booleen(m['formulaire_contact']),
      suiviDemandes: _booleen(m['suivi_demandes']),
      videoPresentation: _booleen(m['video_presentation']),
      statsCompletes: _booleen(m['stats_completes']),
      maxAgences: m.containsKey('max_agences') ? _entierOuNull(m['max_agences']) : 0,
      maxPhotos: m.containsKey('max_photos') ? _entierOuNull(m['max_photos']) : 0,
    );
  }

  /// Avantages lisibles (même liste que le web).
  List<String> get libelles {
    String quota(int? v, String singulier, String pluriel) =>
        v == null ? '$pluriel illimité(e)s' : "Jusqu'à $v ${v > 1 ? pluriel.toLowerCase() : singulier}";
    return [
      if (siegeComplet) 'Fiche du siège complète (contacts, agrément, présentation)',
      if (afficherActivites) 'Activités et produits visibles',
      if (afficherAgences) 'Agences visibles et localisables',
      if (afficherAgences && maxAgences != 0) quota(maxAgences, 'agence', 'Agences'),
      if (formulaireContact) 'Formulaire de mise en relation',
      if (suiviDemandes) 'Suivi des demandes reçues',
      if (maxPhotos != 0) quota(maxPhotos, 'photo', 'Photos'),
      if (videoPresentation) 'Vidéos de présentation',
      if (statsCompletes) 'Statistiques détaillées jour par jour',
    ];
  }
}

/// État de l'abonnement : [statut] actif | grace | aucun.
class EtatAbonnementAssurance {
  final String statut;
  final String? niveauLibelle;
  final DateTime? dateFin; // EXCLUSIVE (premier jour non couvert)
  final bool enGrace;
  final int? joursRestants;

  const EtatAbonnementAssurance({
    required this.statut,
    this.niveauLibelle,
    this.dateFin,
    this.enGrace = false,
    this.joursRestants,
  });

  factory EtatAbonnementAssurance.fromJson(dynamic json) {
    final m = _carte(json);
    return EtatAbonnementAssurance(
      statut: _texte(m['statut_abonnement']) ?? 'aucun',
      niveauLibelle: _texte(_carte(m['niveau'])['libelle']),
      dateFin: _date(m['date_fin']),
      enGrace: _booleen(m['en_grace']),
      joursRestants: _entierOuNull(m['jours_restants']),
    );
  }

  bool get estActif => statut == 'actif';

  /// Dernier jour couvert (veille de [dateFin]).
  DateTime? get dernierJour => dateFin?.subtract(const Duration(days: 1));
}

/* ============================ Tableau de bord ============================ */

class PointSerie {
  final DateTime jour;
  final int valeur;

  const PointSerie(this.jour, this.valeur);
}

List<PointSerie>? _serie(dynamic v, String cle) {
  if (v is! List) return null;
  return v
      .whereType<Map<String, dynamic>>()
      .map((p) => PointSerie(DateTime.tryParse('${p['jour']}T00:00:00Z') ?? DateTime.now(), _entier(p[cle])))
      .toList();
}

class DemandeResume {
  final String id;
  final String statut;
  final DateTime? dateCreation;
  final String extrait;
  final String? demandeur;

  const DemandeResume({required this.id, required this.statut, this.dateCreation, required this.extrait, this.demandeur});

  factory DemandeResume.fromJson(Map<String, dynamic> m) => DemandeResume(
        id: _texte(m['mise_en_relation_id']) ?? '',
        statut: _texte(m['statut']) ?? 'nouvelle',
        dateCreation: _date(m['date_creation']),
        extrait: _texte(m['extrait']) ?? '',
        demandeur: _texte(m['demandeur']),
      );
}

class ElementCompletude {
  final String cle;
  final String libelle;
  final bool ok;

  const ElementCompletude(this.cle, this.libelle, this.ok);
}

class TableauDeBordAssurance {
  final String statutFiche;
  final EtatAbonnementAssurance abonnement;
  final DroitsAssurance droits;
  final int demandesATraiter;
  final int demandesPeriode;
  final Map<String, int> demandesParStatut;
  final int? tauxTraitement;
  final double? delaiMoyenHeures;
  final List<DemandeResume> dernieresDemandes;
  final List<PointSerie>? serieDemandes;
  final int vuesSeptJours;
  final int vuesPeriode;
  final int visiteursPeriode;
  final int vuesTotal;
  final List<PointSerie>? serieVues;
  final int nbActivites;
  final int nbOptions;
  final Quota agences;
  final Quota photos;
  final Quota videos;
  final int completude;
  final List<ElementCompletude> elementsCompletude;
  final bool statistiquesDetaillees;

  const TableauDeBordAssurance({
    required this.statutFiche,
    required this.abonnement,
    required this.droits,
    required this.demandesATraiter,
    required this.demandesPeriode,
    required this.demandesParStatut,
    this.tauxTraitement,
    this.delaiMoyenHeures,
    required this.dernieresDemandes,
    this.serieDemandes,
    required this.vuesSeptJours,
    required this.vuesPeriode,
    required this.visiteursPeriode,
    required this.vuesTotal,
    this.serieVues,
    required this.nbActivites,
    required this.nbOptions,
    required this.agences,
    required this.photos,
    required this.videos,
    required this.completude,
    required this.elementsCompletude,
    required this.statistiquesDetaillees,
  });

  factory TableauDeBordAssurance.fromJson(Map<String, dynamic> json) {
    final demandes = _carte(json['demandes']);
    final vues = _carte(json['vues']);
    final totaux = _carte(vues['totaux']);
    final contenus = _carte(json['contenus']);
    final completude = _carte(json['completude']);
    final parStatut = _carte(demandes['par_statut']);
    return TableauDeBordAssurance(
      statutFiche: _texte(_carte(json['fiche'])['statut_verification']) ?? 'en_cours',
      abonnement: EtatAbonnementAssurance.fromJson(json['abonnement']),
      droits: DroitsAssurance.fromJson(json['droits']),
      demandesATraiter: _entier(demandes['a_traiter']),
      demandesPeriode: _entier(_carte(demandes['periode'])['total']),
      demandesParStatut: {for (final e in parStatut.entries) e.key: _entier(e.value)},
      tauxTraitement: _entierOuNull(demandes['taux_traitement']),
      delaiMoyenHeures: _decimal(demandes['delai_moyen_traitement_heures']),
      dernieresDemandes: _liste(demandes['dernieres']).map(DemandeResume.fromJson).toList(),
      serieDemandes: _serie(demandes['serie'], 'demandes'),
      vuesSeptJours: _entier(_carte(totaux['sept_jours'])['vues']),
      vuesPeriode: _entier(_carte(totaux['periode'])['vues']),
      visiteursPeriode: _entier(_carte(totaux['periode'])['visiteurs']),
      vuesTotal: _entier(_carte(totaux['depuis_le_debut'])['vues']),
      serieVues: _serie(vues['serie'], 'vues'),
      nbActivites: _entier(contenus['activites']),
      nbOptions: _entier(contenus['options']),
      agences: Quota.fromJson(contenus['agences']),
      photos: Quota.fromJson(contenus['photos']),
      videos: Quota.fromJson(contenus['videos']),
      completude: _entier(completude['score']),
      elementsCompletude: _liste(completude['elements'])
          .map((e) => ElementCompletude(_texte(e['cle']) ?? '', _texte(e['libelle']) ?? '', _booleen(e['ok'])))
          .toList(),
      statistiquesDetaillees: _booleen(json['statistiques_detaillees']),
    );
  }
}

/* ============================ Médiathèque ============================ */

class MediaAssurance {
  final String id;
  final String type; // image | video
  final String? titre;
  final int ordre;
  final int? tailleOctets;
  final String? url;
  final String? vignetteUrl;
  final bool visibleAuPublic;

  const MediaAssurance({
    required this.id,
    required this.type,
    this.titre,
    required this.ordre,
    this.tailleOctets,
    this.url,
    this.vignetteUrl,
    required this.visibleAuPublic,
  });

  factory MediaAssurance.fromJson(Map<String, dynamic> m) => MediaAssurance(
        id: _texte(m['media_id']) ?? '',
        type: _texte(m['type']) ?? 'image',
        titre: _texte(m['titre']),
        ordre: _entier(m['ordre']),
        tailleOctets: _entierOuNull(m['taille_octets']),
        url: _texte(m['url']),
        vignetteUrl: _texte(m['vignette_url']),
        visibleAuPublic: _booleen(m['visible_au_public']),
      );

  bool get estVideo => type == 'video';
}

class MediasGestion {
  final List<MediaAssurance> medias;
  final Quota photos;
  final Quota videos;
  final bool fichePubliee;

  const MediasGestion({required this.medias, required this.photos, required this.videos, required this.fichePubliee});

  factory MediasGestion.fromJson(Map<String, dynamic> json) {
    final quotas = _carte(json['quotas']);
    return MediasGestion(
      medias: _liste(json['medias']).map(MediaAssurance.fromJson).toList(),
      photos: Quota.fromJson(quotas['photos']),
      videos: Quota.fromJson(quotas['videos']),
      fichePubliee: _booleen(json['fiche_publiee']),
    );
  }

  List<MediaAssurance> get images => medias.where((m) => !m.estVideo).toList();
  List<MediaAssurance> get videosListe => medias.where((m) => m.estVideo).toList();
}

/* ============================ Demandes ============================ */

const statutsDemande = ['nouvelle', 'en_cours', 'traitee', 'archivee'];

String libelleStatutDemande(String statut) {
  switch (statut) {
    case 'nouvelle':
      return 'Nouvelle';
    case 'en_cours':
      return 'En cours';
    case 'traitee':
      return 'Traitée';
    case 'archivee':
      return 'Archivée';
    default:
      return statut;
  }
}

class DemandeAssurance {
  final String id;
  final String statut;
  final String message;
  final String? noteInterne;
  final DateTime? dateCreation;
  final String? nom;
  final String? prenom;
  final String? email;
  final String? telephone;

  const DemandeAssurance({
    required this.id,
    required this.statut,
    required this.message,
    this.noteInterne,
    this.dateCreation,
    this.nom,
    this.prenom,
    this.email,
    this.telephone,
  });

  factory DemandeAssurance.fromJson(Map<String, dynamic> m) {
    final u = _carte(m['utilisateur']);
    return DemandeAssurance(
      id: _texte(m['mise_en_relation_id']) ?? '',
      statut: _texte(m['statut']) ?? 'nouvelle',
      message: _texte(m['message']) ?? '',
      noteInterne: _texte(m['note_interne']),
      dateCreation: _date(m['date_creation']),
      nom: _texte(u['nom']),
      prenom: _texte(u['prenom']),
      email: _texte(u['email']),
      telephone: _texte(u['telephone']),
    );
  }

  String get demandeur {
    final complet = '${prenom ?? ''} ${nom ?? ''}'.trim();
    return complet.isNotEmpty ? complet : (email ?? 'Utilisateur');
  }
}

class PageDemandes {
  final List<DemandeAssurance> demandes;
  final int total;
  final Map<String, int> compteurs;

  const PageDemandes({required this.demandes, required this.total, required this.compteurs});

  factory PageDemandes.fromJson(Map<String, dynamic> json) => PageDemandes(
        demandes: _liste(json['mises_en_relation']).map(DemandeAssurance.fromJson).toList(),
        total: _entier(json['total']),
        compteurs: {for (final e in _carte(json['compteurs']).entries) e.key: _entier(e.value)},
      );

  int get totalGlobal => compteurs.values.fold(0, (a, b) => a + b);
}

/* ============================ Gestion (profil, abonnement) ============================ */

class OptionGeree {
  final String id;
  final String libelle;

  const OptionGeree(this.id, this.libelle);
}

class ActiviteGeree {
  final String id;
  final String titre;
  final String publicCible;
  final String? description;
  final List<OptionGeree> options;

  const ActiviteGeree({required this.id, required this.titre, required this.publicCible, this.description, required this.options});

  factory ActiviteGeree.fromJson(Map<String, dynamic> m) => ActiviteGeree(
        id: _texte(m['activite_id']) ?? '',
        titre: _texte(m['titre']) ?? '',
        publicCible: _texte(m['public_cible']) ?? '',
        description: _texte(m['description']),
        options: _liste(m['options'])
            .map((o) => OptionGeree(_texte(o['option_activite_id']) ?? '', _texte(o['libelle']) ?? ''))
            .toList(),
      );
}

class AgenceGeree {
  final String id;
  final String libelle;
  final String localisation;
  final String contact;

  const AgenceGeree({required this.id, required this.libelle, required this.localisation, required this.contact});

  factory AgenceGeree.fromJson(Map<String, dynamic> m) => AgenceGeree(
        id: _texte(m['agence_id']) ?? '',
        libelle: _texte(m['libelle']) ?? '',
        localisation: _texte(m['localisation']) ?? '',
        contact: _texte(m['contact']) ?? '',
      );
}

class BrouillonAbonnement {
  final String id;
  final String niveauLibelle;
  final int dureeMois;
  final double montant;
  final String devise;

  const BrouillonAbonnement({required this.id, required this.niveauLibelle, required this.dureeMois, required this.montant, required this.devise});

  static BrouillonAbonnement? fromJson(dynamic json) {
    final m = _carte(json);
    if (m['abonnement_id'] is! String) return null;
    return BrouillonAbonnement(
      id: m['abonnement_id'] as String,
      niveauLibelle: _texte(_carte(m['niveau'])['libelle']) ?? '',
      dureeMois: _entier(m['duree_mois']),
      montant: _decimal(m['montant_total']) ?? 0,
      devise: _texte(m['devise']) ?? 'xaf',
    );
  }
}

class LigneHistoriqueAbonnement {
  final String id;
  final String niveauLibelle;
  final DateTime? dateDebut;
  final DateTime? dateFin;
  final String statut;
  final String origine;
  final double montant;
  final String devise;
  final String? factureNumero;

  const LigneHistoriqueAbonnement({
    required this.id,
    required this.niveauLibelle,
    this.dateDebut,
    this.dateFin,
    required this.statut,
    required this.origine,
    required this.montant,
    required this.devise,
    this.factureNumero,
  });

  factory LigneHistoriqueAbonnement.fromJson(Map<String, dynamic> m) => LigneHistoriqueAbonnement(
        id: _texte(m['abonnement_id']) ?? '',
        niveauLibelle: _texte(_carte(m['niveau'])['libelle']) ?? '',
        dateDebut: _date(m['date_debut']),
        dateFin: _date(m['date_fin']),
        statut: _texte(m['statut']) ?? '',
        origine: _texte(m['origine']) ?? '',
        montant: _decimal(m['montant_total']) ?? 0,
        devise: _texte(m['devise']) ?? 'xaf',
        factureNumero: _texte(_carte(m['facture'])['numero']),
      );
}

class GestionAssurance {
  final String id;
  final String nom;
  final String typeActeur;
  final String telephone;
  final String email;
  final String agrement;
  final String? description;
  final String paysId;
  final String villeId;
  final String? villeNom;
  final String? imageUrl;
  final double? latitude;
  final double? longitude;
  final String statutVerification;
  final List<ActiviteGeree> activites;
  final List<AgenceGeree> agences;
  final DroitsAssurance droits;
  final EtatAbonnementAssurance abonnement;
  final BrouillonAbonnement? brouillon;
  final List<LigneHistoriqueAbonnement> historique;
  final Quota quotaAgences;

  const GestionAssurance({
    required this.id,
    required this.nom,
    required this.typeActeur,
    required this.telephone,
    required this.email,
    required this.agrement,
    this.description,
    required this.paysId,
    required this.villeId,
    this.villeNom,
    this.imageUrl,
    this.latitude,
    this.longitude,
    required this.statutVerification,
    required this.activites,
    required this.agences,
    required this.droits,
    required this.abonnement,
    this.brouillon,
    required this.historique,
    required this.quotaAgences,
  });

  factory GestionAssurance.fromJson(Map<String, dynamic> json) {
    final f = _carte(json['service_assurance']);
    final geo = _carte(f['geolocalisation']);
    return GestionAssurance(
      id: _texte(f['service_assurance_id']) ?? '',
      nom: _texte(f['nom']) ?? '',
      typeActeur: _texte(f['type_acteur']) ?? 'compagnie',
      telephone: _texte(f['telephone']) ?? '',
      email: _texte(f['email']) ?? '',
      agrement: _texte(f['agrement']) ?? '',
      description: _texte(f['description']),
      paysId: _texte(f['pays_id']) ?? '',
      villeId: _texte(f['ville_id']) ?? '',
      villeNom: _texte(_carte(f['ville'])['nom']),
      imageUrl: _texte(f['image_url']),
      latitude: _decimal(geo['latitude']),
      longitude: _decimal(geo['longitude']),
      statutVerification: _texte(f['statut_verification']) ?? 'en_cours',
      activites: _liste(json['activites']).map(ActiviteGeree.fromJson).toList(),
      agences: _liste(json['agences']).map(AgenceGeree.fromJson).toList(),
      droits: DroitsAssurance.fromJson(json['droits']),
      abonnement: EtatAbonnementAssurance.fromJson(json['abonnement']),
      brouillon: BrouillonAbonnement.fromJson(json['brouillon']),
      historique: _liste(json['historique']).map(LigneHistoriqueAbonnement.fromJson).toList(),
      quotaAgences: Quota.fromJson(_carte(json['quotas'])['agences']),
    );
  }
}

/* ============================ Offres d'abonnement ============================ */

class DureeOffre {
  final int dureeMois;
  final bool disponible;
  final double montantTotal;
  final double prixMensuel;
  final double remisePourcent;
  final double creditProrata;
  final String devise;
  final String? message;

  const DureeOffre({
    required this.dureeMois,
    required this.disponible,
    this.montantTotal = 0,
    this.prixMensuel = 0,
    this.remisePourcent = 0,
    this.creditProrata = 0,
    this.devise = 'xaf',
    this.message,
  });

  factory DureeOffre.fromJson(Map<String, dynamic> m) => DureeOffre(
        dureeMois: _entier(m['duree_mois']),
        disponible: _booleen(m['disponible']),
        montantTotal: _decimal(m['montant_total']) ?? 0,
        prixMensuel: _decimal(m['prix_mensuel']) ?? 0,
        remisePourcent: _decimal(m['remise_pourcent']) ?? 0,
        creditProrata: _decimal(m['credit_prorata']) ?? 0,
        devise: _texte(m['devise']) ?? 'xaf',
        message: _texte(m['message']),
      );
}

class OffreAbonnementAssurance {
  final String niveauId;
  final String code;
  final String libelle;
  final DroitsAssurance avantages;
  final DateTime? gratuiteJusquAu;
  final bool gratuite;
  final List<DureeOffre> durees;

  const OffreAbonnementAssurance({
    required this.niveauId,
    required this.code,
    required this.libelle,
    required this.avantages,
    this.gratuiteJusquAu,
    required this.gratuite,
    required this.durees,
  });

  factory OffreAbonnementAssurance.fromJson(Map<String, dynamic> m) => OffreAbonnementAssurance(
        niveauId: _texte(m['niveau_id']) ?? '',
        code: _texte(m['code']) ?? '',
        libelle: _texte(m['libelle']) ?? '',
        avantages: DroitsAssurance.fromJson(m['avantages']),
        gratuite: m['gratuite'] != null,
        gratuiteJusquAu: _date(_carte(m['gratuite'])['jusqu_au']),
        durees: _liste(m['durees']).map(DureeOffre.fromJson).toList(),
      );

  List<DureeOffre> get dureesDisponibles => durees.where((d) => d.disponible).toList();
}

class OffresAbonnementAssurance {
  final List<OffreAbonnementAssurance> offres;
  final String? niveauCourant;

  const OffresAbonnementAssurance({required this.offres, this.niveauCourant});

  factory OffresAbonnementAssurance.fromJson(Map<String, dynamic> json) => OffresAbonnementAssurance(
        offres: _liste(json['offres']).map(OffreAbonnementAssurance.fromJson).toList(),
        niveauCourant: _texte(_carte(json['abonnement_courant'])['niveau_presence']),
      );
}

/// Résultat d'une demande Mobile Money (CamPay).
class CollecteMobileMoney {
  final String? reference;
  final String? ussdCode;
  final String? operateur;
  final bool incertain;

  const CollecteMobileMoney({this.reference, this.ussdCode, this.operateur, this.incertain = false});

  factory CollecteMobileMoney.fromJson(dynamic json) {
    final m = _carte(json);
    return CollecteMobileMoney(
      reference: _texte(m['reference']),
      ussdCode: _texte(m['ussd_code']),
      operateur: _texte(m['operateur']),
      incertain: _booleen(m['incertain']),
    );
  }
}

/// Instructions de virement.
class InstructionsVirement {
  final String reference;
  final double montant;
  final String devise;
  final String instructions;

  const InstructionsVirement({required this.reference, required this.montant, required this.devise, required this.instructions});

  factory InstructionsVirement.fromJson(dynamic json) {
    final m = _carte(json);
    return InstructionsVirement(
      reference: _texte(m['reference']) ?? '',
      montant: _decimal(m['montant']) ?? 0,
      devise: _texte(m['devise']) ?? 'xaf',
      instructions: _texte(m['instructions']) ?? '',
    );
  }
}
