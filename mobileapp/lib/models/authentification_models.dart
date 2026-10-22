// lib/models/authentification_models.dart
//
// Modèles du composant "authentification" côté client Flutter, en
// miroir de authentification.controller.js / authentification.routes.js
// et des modèles Prisma Utilisateur / Role / RefreshToken / JetonRevoque.
//
// Couvre tout le cycle : inscription publique (patient), connexion,
// changement de mot de passe initial (compte à mot de passe
// temporaire), refresh, déconnexion, profil courant, et création de
// comptes administrés (médecin / agent_xxx / admin / superadmin) par
// un admin/superadmin déjà authentifié.
//
// Convention (comme referentiel_models.dart / medecin_models.dart) :
//   - `fromJson` tolérant (champs optionnels lus via `_lire`)
//   - `toJson` / `toPayload` pour les corps de requête
//   - `copyWith` pour les mises à jour immuables côté état

/// Statuts d'un compte utilisateur. Miroir de l'enum Prisma `StatutCompte`.
enum StatutCompte {
  actif,
  suspendu;

  static StatutCompte fromApi(String? valeur) {
    return StatutCompte.values.firstWhere(
          (e) => e.name == valeur,
      orElse: () => StatutCompte.actif,
    );
  }

  String toApi() => name;
}

/// Rôles applicatifs. Reflète la table `role` (libellés utilisés par
/// le backend, cf. ROLES_INSCRIPTION_PUBLIQUE / ROLES_CREABLES_PAR
/// dans authentification.controller.js). Le backend garde la table
/// `role` comme source de vérité ; cet enum sert surtout à raisonner
/// côté UI (affichage conditionnel, matrice de permissions locale).
enum RoleUtilisateur {
  patient,
  medecin,
  admin,
  superadmin,
  agentStructureSante,
  agentPharmacie,
  agentAmbulance,
  agentPompesFunebres,
  agentAssurance,
  agentLaboratoire,
  // Compte créé depuis le formulaire de réservation publicitaire.
  annonceur;

  static RoleUtilisateur fromApi(String? valeur) {
    switch (valeur) {
      case 'patient':
        return RoleUtilisateur.patient;
      case 'medecin':
        return RoleUtilisateur.medecin;
      case 'admin':
        return RoleUtilisateur.admin;
      case 'superadmin':
        return RoleUtilisateur.superadmin;
      case 'agent_structure_sante':
        return RoleUtilisateur.agentStructureSante;
      case 'agent_pharmacie':
        return RoleUtilisateur.agentPharmacie;
      case 'agent_ambulance':
        return RoleUtilisateur.agentAmbulance;
      case 'agent_pompes_funebres':
        return RoleUtilisateur.agentPompesFunebres;
      case 'agent_assurance':
        return RoleUtilisateur.agentAssurance;
      case 'agent_laboratoire':
        return RoleUtilisateur.agentLaboratoire;
      case 'annonceur':
        return RoleUtilisateur.annonceur;
      default:
        return RoleUtilisateur.patient;
    }
  }

  /// Libellé attendu par l'API (`role` dans /comptes, comparaison de
  /// `utilisateur.role`, matrice ROLES_CREABLES_PAR côté serveur).
  String toApi() {
    switch (this) {
      case RoleUtilisateur.patient:
        return 'patient';
      case RoleUtilisateur.medecin:
        return 'medecin';
      case RoleUtilisateur.admin:
        return 'admin';
      case RoleUtilisateur.superadmin:
        return 'superadmin';
      case RoleUtilisateur.agentStructureSante:
        return 'agent_structure_sante';
      case RoleUtilisateur.agentPharmacie:
        return 'agent_pharmacie';
      case RoleUtilisateur.agentAmbulance:
        return 'agent_ambulance';
      case RoleUtilisateur.agentPompesFunebres:
        return 'agent_pompes_funebres';
      case RoleUtilisateur.agentAssurance:
        return 'agent_assurance';
      case RoleUtilisateur.agentLaboratoire:
        return 'agent_laboratoire';
      case RoleUtilisateur.annonceur:
        return 'annonceur';
    }
  }

  /// true si ce rôle correspond à un profil "agent_xxx" (nécessite
  /// alors reference_id + fonction dans CreerCompteAdministrePayload —
  /// voir TYPES_AGENT côté serveur).
  bool get estAgent => toApi().startsWith('agent_');
}

/// Aide générique pour lire une valeur potentiellement absente/nulle
/// sans planter la désérialisation à cause d'un seul champ manquant.
T? _lire<T>(Map<String, dynamic> json, String cle) {
  final valeur = json[cle];
  if (valeur is T) return valeur;
  return null;
}

/// ─────────────────────────────────────────────────────────────────
/// Utilisateur
/// ─────────────────────────────────────────────────────────────────
/// Miroir de la sortie de `serialiserUtilisateur()` côté serveur :
/// `mot_de_passe_hash` et `role_id` sont retirés, `role` est exposé
/// comme libellé (String) et non comme objet imbriqué.
class Utilisateur {
  final String utilisateurId;
  final String nom;
  final String prenom;
  final String email;
  final String? telephone;
  final RoleUtilisateur role;
  final String paysId;
  final StatutCompte statutCompte;
  final bool motDePasseTemporaire;
  final DateTime? motDePasseExpireLe;

  /// Connexion numéro + code PIN : vrai si le compte a choisi son PIN.
  final bool pinDefini;

  /// Numéro de connexion normalisé (international sans « + »), ou null.
  final String? telephoneConnexion;

  /// Numéro de connexion confirmé par un code reçu (SMS / WhatsApp).
  final bool telephoneVerifie;

  /// Espace actif de la session (« patient », « pharmacie:<id> »…).
  final String? espaceActif;

  const Utilisateur({
    required this.utilisateurId,
    required this.nom,
    required this.prenom,
    required this.email,
    this.telephone,
    required this.role,
    required this.paysId,
    required this.statutCompte,
    this.motDePasseTemporaire = false,
    this.motDePasseExpireLe,
    this.pinDefini = false,
    this.telephoneConnexion,
    this.telephoneVerifie = false,
    this.espaceActif,
  });

  factory Utilisateur.fromJson(Map<String, dynamic> json) {
    return Utilisateur(
      utilisateurId: json['utilisateur_id'] as String,
      nom: json['nom'] as String,
      prenom: json['prenom'] as String,
      email: json['email'] as String,
      telephone: _lire<String>(json, 'telephone'),
      role: RoleUtilisateur.fromApi(json['role'] as String?),
      paysId: json['pays_id'] as String,
      statutCompte: StatutCompte.fromApi(json['statut_compte'] as String?),
      motDePasseTemporaire:
      _lire<bool>(json, 'mot_de_passe_temporaire') ?? false,
      motDePasseExpireLe: json['mot_de_passe_expire_le'] is String
          ? DateTime.tryParse(json['mot_de_passe_expire_le'] as String)
          : null,
      pinDefini: _lire<bool>(json, 'pin_defini') ?? false,
      telephoneConnexion: _lire<String>(json, 'telephone_connexion'),
      telephoneVerifie: _lire<bool>(json, 'telephone_verifie') ?? false,
      espaceActif: _lire<String>(json, 'espace_actif'),
    );
  }

  Map<String, dynamic> toJson() => {
    'utilisateur_id': utilisateurId,
    'nom': nom,
    'prenom': prenom,
    'email': email,
    'telephone': telephone,
    'role': role.toApi(),
    'pays_id': paysId,
    'statut_compte': statutCompte.toApi(),
    'mot_de_passe_temporaire': motDePasseTemporaire,
    'mot_de_passe_expire_le': motDePasseExpireLe?.toIso8601String(),
    'pin_defini': pinDefini,
    'telephone_connexion': telephoneConnexion,
    'telephone_verifie': telephoneVerifie,
    'espace_actif': espaceActif,
  };

  /// Nom complet, pratique pour l'affichage (AppBar, profil, etc.).
  String get nomComplet => '$prenom $nom';

  Utilisateur copyWith({
    String? utilisateurId,
    String? nom,
    String? prenom,
    String? email,
    String? telephone,
    RoleUtilisateur? role,
    String? paysId,
    StatutCompte? statutCompte,
    bool? motDePasseTemporaire,
    DateTime? motDePasseExpireLe,
    bool? pinDefini,
    String? telephoneConnexion,
    bool? telephoneVerifie,
    String? espaceActif,
  }) {
    return Utilisateur(
      utilisateurId: utilisateurId ?? this.utilisateurId,
      nom: nom ?? this.nom,
      prenom: prenom ?? this.prenom,
      email: email ?? this.email,
      telephone: telephone ?? this.telephone,
      role: role ?? this.role,
      paysId: paysId ?? this.paysId,
      statutCompte: statutCompte ?? this.statutCompte,
      motDePasseTemporaire: motDePasseTemporaire ?? this.motDePasseTemporaire,
      motDePasseExpireLe: motDePasseExpireLe ?? this.motDePasseExpireLe,
      pinDefini: pinDefini ?? this.pinDefini,
      telephoneConnexion: telephoneConnexion ?? this.telephoneConnexion,
      telephoneVerifie: telephoneVerifie ?? this.telephoneVerifie,
      espaceActif: espaceActif ?? this.espaceActif,
    );
  }

  @override
  String toString() => 'Utilisateur($utilisateurId, $email, ${role.toApi()})';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          (other is Utilisateur && other.utilisateurId == utilisateurId);

  @override
  int get hashCode => utilisateurId.hashCode;
}

/// ─────────────────────────────────────────────────────────────────
/// POST /api/auth/register — inscription publique (rôle "patient"
/// forcé côté serveur, quoi que le client envoie).
/// ─────────────────────────────────────────────────────────────────
class InscriptionPayload {
  final String nom;
  final String prenom;
  final String email;
  final String? telephone;
  final String motDePasse;
  final String paysId;
  final DateTime dateNaissance;

  /// Code PIN (6 chiffres) de la connexion par numéro ; exige [telephone].
  final String? pin;

  /// Case « J'accepte les CGU et la politique de confidentialité » cochée :
  /// le serveur enregistre alors la version acceptée.
  final bool accepteCgu;

  const InscriptionPayload({
    required this.nom,
    required this.prenom,
    required this.email,
    this.telephone,
    required this.motDePasse,
    required this.paysId,
    required this.dateNaissance,
    this.pin,
    this.accepteCgu = false,
  });

  Map<String, dynamic> toJson() => {
    'nom': nom,
    'prenom': prenom,
    'email': email,
    if (telephone != null) 'telephone': telephone,
    'mot_de_passe': motDePasse,
    'pays_id': paysId,
    // Date pure (YYYY-MM-DD) : le serveur fait `new Date(date_naissance)`.
    'date_naissance': dateNaissance.toIso8601String().split('T').first,
    if (pin != null) 'pin': pin,
    if (accepteCgu) 'accepte_cgu': true,
  };
}

/// Réponse commune à /register, /comptes et /bootstrap-superadmin :
/// `{ message, utilisateur }`, code HTTP 201.
class InscriptionResultat {
  final String message;
  final Utilisateur utilisateur;

  const InscriptionResultat({required this.message, required this.utilisateur});

  factory InscriptionResultat.fromJson(Map<String, dynamic> json) {
    return InscriptionResultat(
      message: json['message'] as String,
      utilisateur:
      Utilisateur.fromJson(json['utilisateur'] as Map<String, dynamic>),
    );
  }
}

/// ─────────────────────────────────────────────────────────────────
/// POST /api/auth/login
/// ─────────────────────────────────────────────────────────────────
class ConnexionPayload {
  final String email;
  final String motDePasse;

  const ConnexionPayload({required this.email, required this.motDePasse});

  Map<String, dynamic> toJson() => {
    'email': email,
    'mot_de_passe': motDePasse,
  };
}

/// ─────────────────────────────────────────────────────────────────
/// POST /api/auth/login-pin — connexion numéro + code PIN (même forme
/// de réponse que /login, voir [ConnexionResultat]).
/// ─────────────────────────────────────────────────────────────────
class ConnexionPinPayload {
  final String telephone;

  /// Pays servant à compléter un numéro local (ex. « CM »).
  final String? paysIso2;
  final String pin;

  const ConnexionPinPayload({required this.telephone, this.paysIso2, required this.pin});

  Map<String, dynamic> toJson() => {
    'telephone': telephone,
    if (paysIso2 != null) 'pays_iso2': paysIso2,
    'pin': pin,
  };
}

/// Espace d'un compte (GET /api/auth/espaces) : une personne = un compte,
/// avec un ou plusieurs espaces (patient, médecin, structure, publicités).
class EspaceCompte {
  /// « patient », « medecin », « pharmacie:<id> », « publicites »…
  final String cle;

  /// patient | medecin | pharmacie | structure | assurance | publicites | ambulance | pompes_funebres
  final String type;
  final String libelle;
  final String? detail;
  final bool professionnel;

  /// Dernier espace utilisé (proposé en premier).
  final bool dernier;

  const EspaceCompte({
    required this.cle,
    required this.type,
    required this.libelle,
    this.detail,
    this.professionnel = false,
    this.dernier = false,
  });

  factory EspaceCompte.fromJson(Map<String, dynamic> json) => EspaceCompte(
    cle: json['cle'] as String,
    type: json['type'] as String,
    libelle: json['libelle'] as String? ?? '',
    detail: _lire<String>(json, 'detail'),
    professionnel: _lire<bool>(json, 'professionnel') ?? false,
    dernier: _lire<bool>(json, 'dernier') ?? false,
  );

  static List<EspaceCompte> listeDepuisJson(dynamic json) => json is List
      ? [for (final e in json) if (e is Map<String, dynamic>) EspaceCompte.fromJson(e)]
      : const [];
}

/// Résultat de /login. Deux issues possibles côté serveur :
///   1. Session complète (mot_de_passe_temporaire=false) :
///      access_token + utilisateur sont renseignés, motDePasseAChanger
///      est false. Le refresh_token est posé en cookie httpOnly, non
///      accessible ici.
///   2. Mot de passe temporaire détecté (motDePasseAChanger=true) :
///      seul un token restreint (tokenChangementMotDePasse) est
///      renvoyé ; access_token/utilisateur sont absents. Le frontend
///      doit rediriger vers l'écran de changement de mot de passe et
///      appeler /changer-mot-de-passe-initial avec ce token.
class ConnexionResultat {
  final String message;
  final bool motDePasseAChanger;

  // ─ Cas session complète ─
  final String? accessToken;
  final Utilisateur? utilisateur;

  // ─ Cas mot de passe temporaire ─
  final String? tokenChangementMotDePasse;
  final DateTime? tokenChangementMotDePasseExpireLe;
  final DateTime? motDePasseExpireLe;

  // ─ Connexion numéro + PIN : PIN provisoire à remplacer ─
  final bool pinAChanger;
  final String? tokenChangementPin;

  /// Espaces du compte (patient, médecin, structure gérée, publicités…),
  /// le dernier utilisé en premier. Vide si aucune session.
  final List<EspaceCompte> espaces;

  const ConnexionResultat({
    required this.message,
    required this.motDePasseAChanger,
    this.accessToken,
    this.utilisateur,
    this.tokenChangementMotDePasse,
    this.tokenChangementMotDePasseExpireLe,
    this.motDePasseExpireLe,
    this.pinAChanger = false,
    this.tokenChangementPin,
    this.espaces = const [],
  });

  factory ConnexionResultat.fromJson(Map<String, dynamic> json) {
    return ConnexionResultat(
      message: json['message'] as String,
      motDePasseAChanger: _lire<bool>(json, 'mot_de_passe_a_changer') ?? false,
      accessToken: _lire<String>(json, 'access_token'),
      utilisateur: json['utilisateur'] is Map<String, dynamic>
          ? Utilisateur.fromJson(json['utilisateur'] as Map<String, dynamic>)
          : null,
      tokenChangementMotDePasse:
      _lire<String>(json, 'token_changement_mot_de_passe'),
      tokenChangementMotDePasseExpireLe:
      json['token_changement_mot_de_passe_expire_le'] is String
          ? DateTime.tryParse(
          json['token_changement_mot_de_passe_expire_le'] as String)
          : null,
      motDePasseExpireLe: json['mot_de_passe_expire_le'] is String
          ? DateTime.tryParse(json['mot_de_passe_expire_le'] as String)
          : null,
      pinAChanger: _lire<bool>(json, 'pin_a_changer') ?? false,
      tokenChangementPin: _lire<String>(json, 'token_changement_pin'),
      espaces: EspaceCompte.listeDepuisJson(json['espaces']),
    );
  }

  /// Session immédiatement utilisable (access_token présent).
  bool get sessionOuverte => !motDePasseAChanger && !pinAChanger && accessToken != null;
}

/// ─────────────────────────────────────────────────────────────────
/// POST /api/auth/changer-mot-de-passe-initial
/// Protégée par exigerTokenChangementMotDePasse : le
/// tokenChangementMotDePasse renvoyé par /login (cas mot de passe
/// temporaire) doit être transmis en Authorization: Bearer.
/// ─────────────────────────────────────────────────────────────────
class ChangementMotDePasseInitialPayload {
  final String nouveauMotDePasse;

  const ChangementMotDePasseInitialPayload({required this.nouveauMotDePasse});

  Map<String, dynamic> toJson() => {
    'nouveau_mot_de_passe': nouveauMotDePasse,
  };
}

/// Réponse : ouvre directement une session complète, comme un login
/// classique réussi (`{ message, access_token, utilisateur }`).
class ChangementMotDePasseInitialResultat {
  final String message;
  final String accessToken;
  final Utilisateur utilisateur;

  const ChangementMotDePasseInitialResultat({
    required this.message,
    required this.accessToken,
    required this.utilisateur,
  });

  factory ChangementMotDePasseInitialResultat.fromJson(
      Map<String, dynamic> json) {
    return ChangementMotDePasseInitialResultat(
      message: json['message'] as String,
      accessToken: json['access_token'] as String,
      utilisateur:
      Utilisateur.fromJson(json['utilisateur'] as Map<String, dynamic>),
    );
  }
}

/// ─────────────────────────────────────────────────────────────────
/// POST /api/auth/refresh
/// Aucun payload : le refresh token voyage via le cookie httpOnly
/// (voir NOM_COOKIE_REFRESH_TOKEN côté serveur). Sur mobile/Flutter,
/// le client HTTP doit être configuré pour conserver/renvoyer ce
/// cookie (ex: cookie_jar + dio, ou gestion manuelle du header Cookie).
/// ─────────────────────────────────────────────────────────────────
class RafraichissementResultat {
  final String accessToken;

  const RafraichissementResultat({required this.accessToken});

  factory RafraichissementResultat.fromJson(Map<String, dynamic> json) {
    return RafraichissementResultat(
      accessToken: json['access_token'] as String,
    );
  }
}

/// ─────────────────────────────────────────────────────────────────
/// POST /api/auth/logout — réponse simple `{ message }`.
/// GET  /api/auth/me     — réponse `{ utilisateur }`.
/// ─────────────────────────────────────────────────────────────────
class MessageResultat {
  final String message;

  const MessageResultat({required this.message});

  factory MessageResultat.fromJson(Map<String, dynamic> json) {
    return MessageResultat(message: json['message'] as String);
  }
}

class ProfilResultat {
  final Utilisateur utilisateur;

  const ProfilResultat({required this.utilisateur});

  factory ProfilResultat.fromJson(Map<String, dynamic> json) {
    return ProfilResultat(
      utilisateur:
      Utilisateur.fromJson(json['utilisateur'] as Map<String, dynamic>),
    );
  }
}

/// ─────────────────────────────────────────────────────────────────
/// POST /api/auth/comptes — création d'un compte administré (médecin,
/// agent_xxx, admin, superadmin) par un admin/superadmin authentifié.
/// `referenceId` + `fonction` sont requis uniquement pour les rôles
/// agent_xxx (voir RoleUtilisateur.estAgent / TYPES_AGENT côté
/// serveur) ; le validateur local `valide` permet de le vérifier avant
/// l'appel réseau.
/// ─────────────────────────────────────────────────────────────────
class CreerCompteAdministrePayload {
  final String nom;
  final String prenom;
  final String email;
  final String? telephone;
  final String motDePasse;
  final RoleUtilisateur role;
  final String paysId;
  final String? referenceId;
  final String? fonction;

  const CreerCompteAdministrePayload({
    required this.nom,
    required this.prenom,
    required this.email,
    this.telephone,
    required this.motDePasse,
    required this.role,
    required this.paysId,
    this.referenceId,
    this.fonction,
  });

  /// true si les champs requis pour ce rôle sont présents (miroir de
  /// la validation serveur : reference_id + fonction obligatoires pour
  /// un rôle agent_xxx).
  bool get valide {
    if (!role.estAgent) return true;
    return (referenceId != null && referenceId!.isNotEmpty) &&
        (fonction != null && fonction!.isNotEmpty);
  }

  Map<String, dynamic> toJson() => {
    'nom': nom,
    'prenom': prenom,
    'email': email,
    if (telephone != null) 'telephone': telephone,
    'mot_de_passe': motDePasse,
    'role': role.toApi(),
    'pays_id': paysId,
    if (referenceId != null) 'reference_id': referenceId,
    if (fonction != null) 'fonction': fonction,
  };
}

/// ─────────────────────────────────────────────────────────────────
/// POST /api/auth/bootstrap-superadmin — amorçage du tout premier
/// superadmin. Route publique mais verrouillée par le header
/// `X-Setup-Token` (à fournir hors body, voir `toHeaders`) ; se
/// désactive définitivement dès qu'un superadmin existe.
/// ─────────────────────────────────────────────────────────────────
class AmorcageSuperAdminPayload {
  final String nom;
  final String prenom;
  final String email;
  final String? telephone;
  final String motDePasse;
  final String paysId;
  final String setupToken;

  const AmorcageSuperAdminPayload({
    required this.nom,
    required this.prenom,
    required this.email,
    this.telephone,
    required this.motDePasse,
    required this.paysId,
    required this.setupToken,
  });

  Map<String, dynamic> toJson() => {
    'nom': nom,
    'prenom': prenom,
    'email': email,
    if (telephone != null) 'telephone': telephone,
    'mot_de_passe': motDePasse,
    'pays_id': paysId,
  };

  /// À fusionner avec les en-têtes de la requête HTTP
  /// (`X-Setup-Token`, vérifié côté serveur avec une comparaison en
  /// temps constant).
  Map<String, String> toHeaders() => {'X-Setup-Token': setupToken};
}

/// ─────────────────────────────────────────────────────────────────
/// Session locale — enveloppe pratique côté état applicatif
/// (ex: provider/bloc d'authentification), non renvoyée telle quelle
/// par l'API. Regroupe ce qui doit être persisté après un
/// login / changement de mot de passe initial / refresh réussi.
/// ─────────────────────────────────────────────────────────────────
class SessionUtilisateur {
  final String accessToken;
  final Utilisateur utilisateur;

  const SessionUtilisateur({
    required this.accessToken,
    required this.utilisateur,
  });

  SessionUtilisateur copyWith({String? accessToken, Utilisateur? utilisateur}) {
    return SessionUtilisateur(
      accessToken: accessToken ?? this.accessToken,
      utilisateur: utilisateur ?? this.utilisateur,
    );
  }

  @override
  String toString() => 'SessionUtilisateur(${utilisateur.email})';
}

/// Erreur d'authentification typée, pratique pour distinguer les cas
/// côté UI (401 identifiants invalides, 403 compte suspendu, 409 email
/// déjà utilisé, etc.) sans reparser le message.
class ErreurAuthentification implements Exception {
  final int codeHttp;
  final String message;

  /// Code métier du serveur (« PIN_REQUIS », « PIN_BLOQUE »…), ou null.
  final String? code;

  const ErreurAuthentification({required this.codeHttp, required this.message, this.code});

  factory ErreurAuthentification.fromJson(int codeHttp, Map<String, dynamic> json) {
    return ErreurAuthentification(
      codeHttp: codeHttp,
      message: (json['message'] as String?) ?? 'Erreur inconnue.',
    );
  }

  bool get compteSuspendu => codeHttp == 403 && message.contains('suspendu');
  bool get identifiantsInvalides => codeHttp == 401;
  bool get emailDejaUtilise => codeHttp == 409;

  @override
  String toString() => 'ErreurAuthentification($codeHttp: $message)';
}

/// Configuration de la connexion (GET /api/auth/configuration-connexion).
class ConfigurationConnexion {
  /// Vérification du numéro par code (SMS / WhatsApp) active sur le serveur.
  final bool verificationTelephone;
  final List<String> canaux;

  const ConfigurationConnexion({this.verificationTelephone = false, this.canaux = const ['sms']});

  factory ConfigurationConnexion.fromJson(Map<String, dynamic> json) => ConfigurationConnexion(
    verificationTelephone: _lire<bool>(json, 'verification_telephone') ?? false,
    canaux: json['canaux'] is List ? [for (final c in json['canaux'] as List) '$c'] : const ['sms'],
  );
}

/// Demande de connexion web à valider dans l'application.
class DemandeConnexionWeb {
  final String demandeId;

  /// Trois codes proposés : l'utilisateur choisit celui affiché à l'écran.
  final List<String> codes;
  final String? navigateur;
  final DateTime? expireLe;

  const DemandeConnexionWeb({required this.demandeId, required this.codes, this.navigateur, this.expireLe});

  factory DemandeConnexionWeb.fromJson(Map<String, dynamic> json) => DemandeConnexionWeb(
    demandeId: json['demande_id'] as String,
    codes: [for (final c in (json['codes'] as List? ?? const [])) '$c'],
    navigateur: _lire<String>(json, 'navigateur'),
    expireLe: json['expire_le'] is String ? DateTime.tryParse(json['expire_le'] as String) : null,
  );
}
