class ApiRealEndpoints {
  ApiRealEndpoints._();

  static const String baseUrl = 'http://10.0.2.2:3000/api';

  // ─── Médecins (fiche Annuaire) ─────────────────────────────────────
  static const String medecins = '${baseUrl}/medecins';
  static String medecin(String id) => '${baseUrl}/medecins/$id';
  static const String monProfilMedecin = '${baseUrl}/medecins/mon-profil';
  static String publierMedecin(String id) => '${baseUrl}/medecins/$id/publier';
  static String suspendreMedecin(String id) =>
      '${baseUrl}/medecins/$id/suspendre';
  static String reactiverMedecin(String id) =>
      '${baseUrl}/medecins/$id/reactiver';
  static const String verifierOrdreMedecin =
      '${baseUrl}/medecins/verifier-ordre';

  // ─── Spécialités médicales (référentiel) ───────────────────────────
  static const String specialites = '${baseUrl}/specialites';
  static String specialite(String id) => '${baseUrl}/specialites/$id';

  // ─── Centres de santé (module "annuaire — centre de santé") ──────
  // Voir centreSante.routes.js :
  //   - GET liste/détail : publiques, pas de jeton requis.
  //   - POST création    : authentifié (tout rôle), multipart,
  //                        3 fichiers requis (image_structure,
  //                        piece_identite, document_agrement).
  //   - PUT modification : authentifié (tout rôle), multipart,
  //                        fichiers optionnels.
  //   - DELETE suppression : authentifié + superadmin uniquement.
  static const String centresSante = '${baseUrl}/centres-sante';
  static String centreSante(String id) => '${baseUrl}/centres-sante/$id';

  // ─── Assurance (module "annuaire — assurance") ────────────────────
  // Voir assurance.routes.js :
  //   - services-assurance : GET publique ; POST/PUT authentifié (tout
  //     rôle), multipart (1 fichier "image_assurance" obligatoire à la
  //     création, optionnel en modification) ; DELETE superadmin.
  //   - mises-en-relation-assurance : POST authentifié (tout rôle) ;
  //     GET/DELETE réservés à l'agent du service concerné ou à un admin.
  //   - activites / options-activite / agences : GET publique ; écriture
  //     réservée à l'agent du service_assurance concerné ou à un admin.
  static const String servicesAssurance = '${baseUrl}/services-assurance';
  static String serviceAssurance(String id) =>
      '${baseUrl}/services-assurance/$id';

  static const String misesEnRelationAssurance =
      '${baseUrl}/mises-en-relation-assurance';
  static String miseEnRelationAssurance(String id) =>
      '${baseUrl}/mises-en-relation-assurance/$id';

  static const String activites = '${baseUrl}/activites';
  static String activite(String id) => '${baseUrl}/activites/$id';

  static const String optionsActivite = '${baseUrl}/options-activite';
  static String optionActivite(String id) =>
      '${baseUrl}/options-activite/$id';

  static const String agences = '${baseUrl}/agences';
  static String agence(String id) => '${baseUrl}/agences/$id';

  // ─── Pharmacies (module "annuaire — pharmacie" + sous-module
  // "Gardes officielles") ────────────────────────────────────────────
  // Voir pharmacie.routes.js :
  //   - GET pharmacies / plannings-garde / gardes-pharmacie : PUBLIQUES,
  //     sans authentification (recherche d'une pharmacie ou d'une garde
  //     avant même la création d'un compte).
  //   - POST/PUT pharmacies : authentifié (tout rôle, patient inclus),
  //     multipart, 3 fichiers requis à la création (image_pharmacie,
  //     piece_identite, document_agrement) + champs de création du
  //     compte agent (fonction, agent_nom, agent_prenom, agent_email,
  //     agent_telephone) — voir creerPharmacie côté contrôleur.
  //   - DELETE pharmacies : authentifié + superadmin uniquement.
  //   - POST/PUT/DELETE plannings-garde et gardes-pharmacie : admin ou
  //     superadmin uniquement — planification réglementaire centralisée,
  //     jamais soumise par les pharmacies elles-mêmes.
  static const String pharmacies = '${baseUrl}/pharmacies';
  static String pharmacie(String id) => '${baseUrl}/pharmacies/$id';

  static const String planningsGarde = '${baseUrl}/plannings-garde';
  static String planningGarde(String id) => '${baseUrl}/plannings-garde/$id';

  static const String gardesPharmacie = '${baseUrl}/gardes-pharmacie';
  static String gardePharmacie(String id) =>
      '${baseUrl}/gardes-pharmacie/$id';
}