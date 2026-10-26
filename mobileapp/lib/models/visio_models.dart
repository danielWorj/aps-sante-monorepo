// lib/models/visio_models.dart
class VisioSession {
  final String token;
  final String roomName;
  final String domain;

  const VisioSession({
    required this.token,
    required this.roomName,
    required this.domain,
  });

  factory VisioSession.fromJson(Map<String, dynamic> json) => VisioSession(
    token: json['token'] as String,
    roomName: json['roomName'] as String,
    domain: json['domain'] as String,
  );
}

/// Appel entrant (GET /visio/appel-entrant, ou push `rdv_visio_demarree`) :
/// le médecin vient de lancer la visio d'un RDV du patient.
class AppelVisioEntrant {
  final String rdvId;

  /// Horodatage du lancement, tel qu'envoyé par le serveur (chaîne ISO) :
  /// avec [rdvId], identifie un appel pour ne le faire sonner qu'une fois.
  final String lanceeLe;
  final String nomMedecin;
  final String? photoMedecin;
  final String? specialite;

  const AppelVisioEntrant({
    required this.rdvId,
    required this.lanceeLe,
    required this.nomMedecin,
    this.photoMedecin,
    this.specialite,
  });

  String get cle => '$rdvId:$lanceeLe';

  factory AppelVisioEntrant.fromJson(Map<String, dynamic> json) {
    final m = json['medecin'] is Map<String, dynamic> ? json['medecin'] as Map<String, dynamic> : const {};
    final nom = [m['prenom'], m['nom']].whereType<String>().where((s) => s.isNotEmpty).join(' ');
    return AppelVisioEntrant(
      rdvId: json['rdv_id'] as String,
      lanceeLe: json['lancee_le'] as String? ?? '',
      nomMedecin: nom.isEmpty ? 'Votre médecin' : 'Dr $nom',
      photoMedecin: m['photo_url'] as String?,
      specialite: m['specialite'] as String?,
    );
  }

  /// Données d'une notification push `rdv_visio_demarree` (voir donneesPush).
  static AppelVisioEntrant? depuisPush(Map<String, dynamic> d) {
    final rdvId = d['rdv_id'];
    if (d['type'] != 'rdv_visio_demarree' || rdvId is! String) return null;
    return AppelVisioEntrant(
      rdvId: rdvId,
      lanceeLe: d['lancee_le'] as String? ?? '',
      nomMedecin: d['appelant'] as String? ?? 'Votre médecin',
      photoMedecin: d['appelant_photo'] as String?,
    );
  }
}

/// Bilan de fin de téléconsultation — réponse de POST / GET
/// /visio/:id/cloture (voir visio.controller.js, bilanCloture).
///
/// - médecin : [termine] + [delaiLiberationHeures] (« paiement dans X h ») ;
/// - patient : [avisPossible] / [avisDejaDepose], [contestationPossible].
class BilanClotureVisio {
  final String rdvId;
  final String role;
  final bool termine;

  /// Le médecin a terminé l'appel (le patient raccroche), même si la fin de
  /// consultation n'a pas encore pu être validée.
  final bool visioCloturee;

  /// `en_attente_medecin`, `presences_incompletes`,
  /// `parametre_delai_absent`, `statut_incompatible`… ; null si terminée.
  final String? raisonNonTerminee;
  final int? delaiLiberationHeures;
  final DateTime? dateLiberation;
  final String interlocuteurPrenom;
  final String interlocuteurNom;
  final String? specialite;
  final bool avisPossible;
  final bool avisDejaDepose;
  final bool contestationPossible;

  const BilanClotureVisio({
    required this.rdvId,
    required this.role,
    required this.termine,
    this.visioCloturee = false,
    this.raisonNonTerminee,
    this.delaiLiberationHeures,
    this.dateLiberation,
    this.interlocuteurPrenom = '',
    this.interlocuteurNom = '',
    this.specialite,
    this.avisPossible = false,
    this.avisDejaDepose = false,
    this.contestationPossible = false,
  });

  bool get enAttenteMedecin => raisonNonTerminee == 'en_attente_medecin';

  factory BilanClotureVisio.fromJson(Map<String, dynamic> json) {
    final interlocuteur = json['interlocuteur'] is Map
        ? Map<String, dynamic>.from(json['interlocuteur'] as Map)
        : const <String, dynamic>{};
    final avis = json['avis'] is Map ? json['avis'] as Map : const {};
    final contestation =
        json['contestation'] is Map ? json['contestation'] as Map : const {};
    final delai = json['delai_liberation_heures'];
    final dateLib = json['date_liberation'];
    return BilanClotureVisio(
      rdvId: json['rdv_id'] as String,
      role: json['role'] as String? ?? 'patient',
      termine: json['termine'] == true,
      visioCloturee: json['visio_cloturee'] == true || json['termine'] == true,
      raisonNonTerminee: json['raison_non_terminee'] as String?,
      delaiLiberationHeures: delai is num ? delai.toInt() : null,
      dateLiberation: dateLib is String ? DateTime.tryParse(dateLib) : null,
      interlocuteurPrenom: interlocuteur['prenom'] as String? ?? '',
      interlocuteurNom: interlocuteur['nom'] as String? ?? '',
      specialite: interlocuteur['specialite'] as String?,
      avisPossible: avis['possible'] == true,
      avisDejaDepose: avis['deja_depose'] == true,
      contestationPossible: contestation['possible'] == true,
    );
  }
}
