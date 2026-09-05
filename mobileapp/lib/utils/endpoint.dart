class ApiRealEndpoints {
  ApiRealEndpoints._();

  static const String baseUrl = 'http://10.0.2.2:3000/api';

  // ─── Authentification (module transverse "authentification") ────
  // Voir authentification.routes.js / authentification.controller.js.
  //   - register, login, refresh                : publiques.
  //   - changer-mot-de-passe-initial             : publique au sens
  //     où elle ne passe pas par `authentifier`, mais verrouillée par
  //     `exigerTokenChangementMotDePasse` (token restreint renvoyé par
  //     /login en Authorization: Bearer, PAS un access token normal).
  //   - logout, me                               : authentifié (tout
  //     rôle).
  //   - comptes                                  : authentifié,
  //     réservé à admin/superadmin (matrice fine appliquée côté
  //     contrôleur, cf. ROLES_CREABLES_PAR).
  //   - bootstrap-superadmin                     : publique mais
  //     verrouillée par l'en-tête `X-Setup-Token` (PAS Authorization),
  //     et désactivée dès qu'un superadmin existe déjà. Voir
  //     AmorcageSuperAdminPayload.toHeaders() côté modèles.
  //   - Le refresh token n'apparaît jamais dans un payload/endpoint
  //     ici : il voyage uniquement via un cookie httpOnly posé par le
  //     serveur (voir authentification_repository.dart pour les
  //     prérequis côté client HTTP).
  static const String inscription = '${baseUrl}/auth/register';
  static const String connexion = '${baseUrl}/auth/login';
  static const String changementMotDePasseInitial =
      '${baseUrl}/auth/changer-mot-de-passe-initial';
  static const String rafraichissement = '${baseUrl}/auth/refresh';
  static const String deconnexion = '${baseUrl}/auth/logout';
  static const String profilCourant = '${baseUrl}/auth/me';
  static const String comptes = '${baseUrl}/auth/comptes';
  static const String amorcageSuperAdmin =
      '${baseUrl}/auth/bootstrap-superadmin';

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

  // ─── Présence, publicité & boost commercial (module autonome) ────
  // Voir publicite.routes.js :
  //   - emplacements-publicitaires : GET publique ; POST/PUT
  //     authentifié (admin/superadmin) ; DELETE superadmin uniquement.
  //   - forfaits-publicitaires : GET publique ; POST/PUT authentifié
  //     (admin/superadmin) ; DELETE superadmin uniquement. Sous-route
  //     POST .../:id/lignes pour ajouter une ligne d'avantage.
  //   - lignes-forfait-publicitaire : préfixe DÉDIÉ (distinct de
  //     forfaits-publicitaires/:id) — PUT/DELETE authentifié
  //     (admin/superadmin).
  //   - publicites : GET publique (authentification optionnelle,
  //     filtrage de visibilité côté backend) ; POST authentifié (tout
  //     rôle), multipart avec fichier "visuel" obligatoire ; PUT
  //     authentifié, multipart avec "visuel" optionnel (auteur tant
  //     que "en_attente", ou admin/superadmin pour statut_moderation) ;
  //     DELETE auteur ou admin/superadmin.
  static const String emplacementsPublicitaires =
      '${baseUrl}/emplacements-publicitaires';
  static String emplacementPublicitaire(String id) =>
      '${baseUrl}/emplacements-publicitaires/$id';

  static const String forfaitsPublicitaires =
      '${baseUrl}/forfaits-publicitaires';
  static String forfaitPublicitaire(String id) =>
      '${baseUrl}/forfaits-publicitaires/$id';
  static String ajouterLigneForfaitPublicitaire(String forfaitId) =>
      '${baseUrl}/forfaits-publicitaires/$forfaitId/lignes';

  static const String lignesForfaitPublicitaire =
      '${baseUrl}/lignes-forfait-publicitaire';
  static String ligneForfaitPublicitaire(String ligneId) =>
      '${baseUrl}/lignes-forfait-publicitaire/$ligneId';

  static const String publicites = '${baseUrl}/publicites';
  static String publicite(String id) => '${baseUrl}/publicites/$id';
  // Route dédiée par code d'emplacement (ex. "PAGE_ACCUEIL") : déclarée
  // côté backend AVANT /publicites/:id pour éviter que "par-page" ne
  // soit capturé comme un :id — voir publicite.routes.js.
  static String publicitesParCodePage(String code) =>
      '${baseUrl}/publicites/par-page/$code';

  // ─── Patients (fiche patient — module transverse "Gestion des
  // médecins") ────────────────────────────────────────────────────────
  // Voir patient.routes.js : contrairement à /medecins (annuaire
  // public), TOUTES les routes ci-dessous exigent déjà "authentifier"
  // côté backend — jamais de route publique ici. L'autorisation fine
  // (patient concerné / médecin ayant un rendez-vous avec lui /
  // admin-superadmin) est vérifiée côté serveur, voir
  // patient_repository.dart.
  // ⚠️ "/patients/mon-profil" est déclarée AVANT "/patients/:id" côté
  // backend pour éviter que "mon-profil" ne soit capturé comme :id
  // (même piège que /medecins/mon-profil).
  static const String monProfilPatient = '${baseUrl}/patients/mon-profil';
  static String patient(String id) => '${baseUrl}/patients/$id';
  static String rendezVousPatient(String id) =>
      '${baseUrl}/patients/$id/rendez-vous';

  // ─── Visio (téléconsultation Jitsi) ────────────────────────────────
  // Voir visio.routes.js / visio.controller.js : authentifié, réservé
  // au médecin ou au patient du rendez-vous concerné.
  static const String visioToken = '/visio/token';
}