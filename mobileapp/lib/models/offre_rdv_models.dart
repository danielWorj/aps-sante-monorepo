// lib/models/offre_rdv_models.dart
//
// RDV ALÉATOIRE (RDV sur offre) — miroir des réponses de
// server/src/services/offreRdv.service.js.
//
// Le patient publie une demande (spécialité, ville, jour + heure, type,
// motif) ; les médecins de la spécialité dans la ville répondent avec leur
// profil ; le patient valide l'un d'eux (le RDV « cree » est créé, il reste à
// le payer). Une même classe [OffreRdv] sert aux deux rôles :
//   - patient : [reponses] (médecins qui ont répondu, fiche publique) ;
//   - médecin : [maReponse], [nombreReponses], [attribueeAMoi] (jamais
//     l'identité du patient).

T? _lire<T>(Map<String, dynamic> json, String cle) {
  final v = json[cle];
  return v is T ? v : null;
}

Map<String, dynamic>? _objet(Map<String, dynamic> json, String cle) {
  final v = json[cle];
  return v is Map<String, dynamic> ? v : null;
}

DateTime? _date(Map<String, dynamic> json, String cle) {
  final v = json[cle];
  return v is String ? DateTime.tryParse(v)?.toLocal() : null;
}

/// Les montants Decimal arrivent en chaîne (« 12000.00 ») ou en nombre.
double? _nombre(Object? v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
}

enum StatutOffreRdv {
  ouverte('ouverte', 'En attente de réponses'),
  attribuee('attribuee', 'Médecin validé'),
  expiree('expiree', 'Expirée'),
  annulee('annulee', 'Annulée'),
  inconnu('', 'Inconnu');

  const StatutOffreRdv(this.valeurApi, this.libelle);

  final String valeurApi;
  final String libelle;

  bool get estEnCours => this == ouverte || this == attribuee;

  static StatutOffreRdv fromApi(String? v) => StatutOffreRdv.values
      .firstWhere((s) => s != inconnu && s.valeurApi == v, orElse: () => inconnu);
}

enum StatutReponseOffre {
  proposee('proposee', 'Réponse envoyée'),
  retiree('retiree', 'Réponse retirée'),
  retenue('retenue', 'Vous avez été retenu'),
  inconnu('', 'Inconnu');

  const StatutReponseOffre(this.valeurApi, this.libelle);

  final String valeurApi;
  final String libelle;

  static StatutReponseOffre fromApi(String? v) => StatutReponseOffre.values
      .firstWhere((s) => s != inconnu && s.valeurApi == v, orElse: () => inconnu);
}

/// Types de RDV acceptés par POST /offres-rdv.
enum TypeRdvOffre {
  physique('physique', 'Consultation physique'),
  teleconsultation('teleconsultation', 'Téléconsultation');

  const TypeRdvOffre(this.valeurApi, this.libelle);

  final String valeurApi;
  final String libelle;

  static TypeRdvOffre fromApi(String? v) =>
      v == teleconsultation.valeurApi ? teleconsultation : physique;
}

/// Fiche publique d'un médecin qui a répondu (droits de présence déjà
/// appliqués par le serveur : photo / biographie peuvent être absentes).
class MedecinRepondant {
  final String medecinId;
  final String prenom;
  final String nom;
  final String? specialite;
  final String? ville;
  final double? tarifIndicatif;
  final String? photoUrl;
  final String? biographie;
  final bool teleconsultationActivee;
  final double? noteMoyenne;
  final int totalAvis;

  const MedecinRepondant({
    required this.medecinId,
    required this.prenom,
    required this.nom,
    this.specialite,
    this.ville,
    this.tarifIndicatif,
    this.photoUrl,
    this.biographie,
    this.teleconsultationActivee = false,
    this.noteMoyenne,
    this.totalAvis = 0,
  });

  String get nomComplet => 'Dr ${'$prenom $nom'.trim()}';

  String get initiales {
    final a = prenom.isNotEmpty ? prenom[0] : '';
    final b = nom.isNotEmpty ? nom[0] : '';
    final i = '$a$b'.toUpperCase();
    return i.isEmpty ? 'Dr' : i;
  }

  factory MedecinRepondant.fromJson(Map<String, dynamic> json) {
    final u = _objet(json, 'utilisateur') ?? const {};
    final bio = _lire<String>(json, 'biographie');
    return MedecinRepondant(
      medecinId: _lire<String>(json, 'medecin_id') ?? '',
      prenom: _lire<String>(u, 'prenom') ?? '',
      nom: _lire<String>(u, 'nom') ?? '',
      specialite: _lire<String>(_objet(json, 'specialite') ?? const {}, 'nom'),
      ville: _lire<String>(_objet(json, 'ville_exercice') ?? const {}, 'nom'),
      tarifIndicatif: _nombre(json['tarif_indicatif']),
      photoUrl: _lire<String>(json, 'photo_url'),
      biographie: (bio != null && bio.trim().isNotEmpty) ? bio : null,
      teleconsultationActivee: json['teleconsultation_activee'] == true,
      noteMoyenne: _nombre(json['note_moyenne']),
      totalAvis: _nombre(json['total_avis'])?.toInt() ?? 0,
    );
  }
}

/// Réponse d'un médecin à une offre.
class ReponseOffre {
  final String reponseId;
  final StatutReponseOffre statut;
  final String? message;
  final DateTime? dateCreation;

  /// Présent côté patient seulement.
  final MedecinRepondant? medecin;

  const ReponseOffre({
    required this.reponseId,
    required this.statut,
    this.message,
    this.dateCreation,
    this.medecin,
  });

  factory ReponseOffre.fromJson(Map<String, dynamic> json) {
    final m = _objet(json, 'medecin');
    return ReponseOffre(
      reponseId: _lire<String>(json, 'reponse_id') ?? '',
      statut: StatutReponseOffre.fromApi(_lire<String>(json, 'statut')),
      message: _lire<String>(json, 'message'),
      dateCreation: _date(json, 'date_creation'),
      medecin: m == null ? null : MedecinRepondant.fromJson(m),
    );
  }
}

/// RDV issu de la validation d'une offre (résumé).
class RdvDeLOffre {
  final String rdvId;
  final String statut;

  const RdvDeLOffre({required this.rdvId, required this.statut});

  bool get estNonPaye => statut == 'cree';
}

class OffreRdv {
  final String offreId;
  final String specialite;
  final String ville;
  final TypeRdvOffre typeRdv;
  final DateTime? dateSouhaitee;
  final String? motif;
  final StatutOffreRdv statut;
  final DateTime? dateCreation;
  final RdvDeLOffre? rendezVous;

  // Patient
  final List<ReponseOffre> reponses;

  // Médecin
  final ReponseOffre? maReponse;
  final int? nombreReponses;
  final bool attribueeAMoi;

  const OffreRdv({
    required this.offreId,
    required this.specialite,
    required this.ville,
    required this.typeRdv,
    required this.statut,
    this.dateSouhaitee,
    this.motif,
    this.dateCreation,
    this.rendezVous,
    this.reponses = const [],
    this.maReponse,
    this.nombreReponses,
    this.attribueeAMoi = false,
  });

  factory OffreRdv.fromJson(Map<String, dynamic> json) {
    final rdv = _objet(json, 'rendez_vous');
    final reps = json['reponses'];
    final ma = _objet(json, 'ma_reponse');
    return OffreRdv(
      offreId: _lire<String>(json, 'offre_id') ?? '',
      specialite: _lire<String>(_objet(json, 'specialite') ?? const {}, 'nom') ?? '',
      ville: _lire<String>(_objet(json, 'ville') ?? const {}, 'nom') ?? '',
      typeRdv: TypeRdvOffre.fromApi(_lire<String>(json, 'type_rdv')),
      dateSouhaitee: _date(json, 'date_souhaitee'),
      motif: _lire<String>(json, 'motif'),
      statut: StatutOffreRdv.fromApi(_lire<String>(json, 'statut')),
      dateCreation: _date(json, 'date_creation'),
      rendezVous: rdv == null
          ? null
          : RdvDeLOffre(
              rdvId: _lire<String>(rdv, 'rdv_id') ?? '',
              statut: _lire<String>(rdv, 'statut') ?? '',
            ),
      reponses: reps is List
          ? reps.whereType<Map<String, dynamic>>().map(ReponseOffre.fromJson).toList()
          : const [],
      maReponse: ma == null ? null : ReponseOffre.fromJson(ma),
      nombreReponses: _nombre(json['nombre_reponses'])?.toInt(),
      attribueeAMoi: json['attribuee_a_moi'] == true,
    );
  }
}

/// Résultat de « Valider ce médecin » (POST …/valider).
class ValidationOffre {
  final String rdvId;
  final DateTime? echeanceConfirmation;

  const ValidationOffre({required this.rdvId, this.echeanceConfirmation});

  factory ValidationOffre.fromJson(Map<String, dynamic> json) {
    final rdv = _objet(json, 'rendez_vous') ?? const {};
    return ValidationOffre(
      rdvId: _lire<String>(rdv, 'rdv_id') ?? '',
      echeanceConfirmation: _date(json, 'echeance_confirmation'),
    );
  }
}
