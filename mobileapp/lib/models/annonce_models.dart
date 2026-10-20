// lib/models/annonce_models.dart
//
// Annonce publiée par APS Santé depuis le back-office (modèle Annonce,
// voir annonce.controller.js) : diffusée à tous les utilisateurs, sans
// destinataire. `expiree` est calculé par le serveur.

class Annonce {
  final String id;
  final String libelle;
  final String? description;
  final String? courteDescription;

  /// Image ou PDF (URL complète), `null` pour une annonce textuelle.
  final String? fichierUrl;
  final DateTime dateCreation;
  final int jourValidite;
  final bool expiree;

  const Annonce({
    required this.id,
    required this.libelle,
    this.description,
    this.courteDescription,
    this.fichierUrl,
    required this.dateCreation,
    required this.jourValidite,
    required this.expiree,
  });

  factory Annonce.fromJson(Map<String, dynamic> json) {
    String? texte(String cle) {
      final v = json[cle];
      return v is String && v.trim().isNotEmpty ? v : null;
    }

    return Annonce(
      id: json['id'] as String,
      libelle: json['libelle'] as String? ?? '',
      description: texte('description'),
      courteDescription: texte('courte_description'),
      fichierUrl: texte('file_url'),
      dateCreation: DateTime.tryParse(json['date_creation'] as String? ?? '')?.toLocal() ?? DateTime.now(),
      jourValidite: (json['jour_validite'] as num?)?.toInt() ?? 0,
      expiree: json['expiree'] == true,
    );
  }

  DateTime get dateFin => dateCreation.add(Duration(days: jourValidite));

  bool get estPdf => fichierUrl != null && RegExp(r'\.pdf($|\?)', caseSensitive: false).hasMatch(fichierUrl!);

  bool get aImage => fichierUrl != null && !estPdf;

  /// Texte d'aperçu de la carte.
  String? get apercu => courteDescription ?? description;
}
