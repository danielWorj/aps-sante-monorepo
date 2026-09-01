// lib/repositories/medecin_repository.dart
//
// Repository de consommation des APIs du module "Gestion des
// médecins" — périmètre "fiche Annuaire" (Medecin, Specialite), en
// miroir de src/routes/medecin.routes.js et
// src/controllers/medecin.controller.js côté backend, et dans le même
// esprit que medecinService.js (version web de ce même module).
//
// Comme [ApiClient], ce fichier ne porte AUCUN état applicatif (pas de
// cache, pas de notification UI) : il ne fait que parler HTTP et
// mapper JSON <-> modèles Dart (medecin_models.dart). La gestion
// d'état (chargement, erreurs, sélection courante) appartient à
// MedecinController (lib/controllers/medecin_controller.dart), qui
// s'appuie sur ce repository.
//
// Le token d'authentification suit la même règle que [ApiClient] :
// fourni requête par requête (paramètre `token`), jamais stocké ici.
// Les routes publiques (listerMedecins, obtenirMedecin,
// verifierAppartenanceOrdre, le référentiel Specialites en lecture)
// acceptent un `token` optionnel : s'il est fourni et valide, le
// backend enrichit la réponse (ex. email/téléphone visibles pour un
// admin/superadmin connecté) — voir authentifierOptionnel côté routes.
//
// ⚠️ Périmètre volontairement limité à la fiche médecin elle-même +
// au référentiel Spécialités, en miroir de medecin_models.dart (voir
// son en-tête). Avis médecin, Abonnements médecin, Rendez-vous,
// Ordonnances, Agenda sont hors périmètre de ce fichier — à traiter
// dans des repositories dédiés suivant le même patron.

import '../models/medecin_models.dart';
import '../utils/api_client.dart';

class MedecinRepository {
  final ApiClient _client;

  MedecinRepository(this._client);

  /* ===================================================================
   * Médecins (fiche Annuaire)
   * =================================================================== */

  /// GET /medecins
  /// Publique, authentification optionnelle : passer [token] quand un
  /// utilisateur est connecté pour bénéficier de la vue enrichie
  /// (email/téléphone) si son rôle le permet côté backend.
  Future<List<Medecin>> listerMedecins({
    MedecinFiltres? filtres,
    String? token,
  }) async {
    final donnees = await _client.get(
      ApiEndpoints.medecins,
      query: filtres?.toQuery(),
      token: token,
    );
    final liste = (donnees is Map && donnees['medecins'] is List)
        ? donnees['medecins'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => Medecin.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /medecins/:id
  /// Publique, authentification optionnelle (même règle que
  /// [listerMedecins]).
  Future<Medecin> obtenirMedecin(String id, {String? token}) async {
    final donnees =
    await _client.get(ApiEndpoints.medecin(id), token: token);
    return Medecin.fromJson(donnees['medecin'] as Map<String, dynamic>);
  }

  /// GET /medecins/mon-profil
  /// Authentifié — [token] obligatoire (le backend en déduit
  /// l'utilisateur_id, il n'y a pas d'id à fournir côté client).
  Future<MonProfilMedecin> obtenirMonProfil({required String token}) async {
    final donnees =
    await _client.get(ApiEndpoints.monProfilMedecin, token: token);
    return MonProfilMedecin.fromJson(donnees as Map<String, dynamic>);
  }

  /// POST /medecins (candidature médecin)
  /// Publique — aucune authentification. cni et attestation sont
  /// obligatoires côté backend ; photo est optionnelle. Le mot de passe
  /// temporaire renvoyé dans le résultat n'apparaît qu'une seule fois :
  /// à afficher immédiatement à l'appelant, ne jamais le restocker.
  Future<MedecinCreationResultat> creerMedecin({
    required CreerMedecinPayload payload,
    required List<int> cniOctets,
    required String cniNomFichier,
    required List<int> attestationOctets,
    required String attestationNomFichier,
    List<int>? photoOctets,
    String? photoNomFichier,
  }) async {
    final fichiers = <FichierMultipart>[
      FichierMultipart(
        champ: 'cni',
        octets: cniOctets,
        nomFichier: cniNomFichier,
      ),
      FichierMultipart(
        champ: 'attestation',
        octets: attestationOctets,
        nomFichier: attestationNomFichier,
      ),
      if (photoOctets != null && photoNomFichier != null)
        FichierMultipart(
          champ: 'photo',
          octets: photoOctets,
          nomFichier: photoNomFichier,
        ),
    ];

    final donnees = await _client.postMultipart(
      ApiEndpoints.medecins,
      champs: payload.toChamps(),
      fichiers: fichiers,
    );
    return MedecinCreationResultat.fromJson(donnees as Map<String, dynamic>);
  }

  /// PUT /medecins/:id
  /// Ouvert au médecin propriétaire ou à admin/superadmin (vérifié côté
  /// backend à partir de [token]). Tous les fichiers sont optionnels
  /// ici : ne fournir que ceux à remplacer. Lève [ApiException] si ni
  /// [payload] ni aucun fichier n'est fourni (rien à envoyer),
  /// symétrique du 400 "Aucune donnée valide à mettre à jour." renvoyé
  /// par le backend dans ce cas.
  Future<Medecin> modifierMedecin({
    required String id,
    required String token,
    ModifierMedecinPayload? payload,
    List<int>? cniOctets,
    String? cniNomFichier,
    List<int>? attestationOctets,
    String? attestationNomFichier,
    List<int>? photoOctets,
    String? photoNomFichier,
    List<int>? cvOctets,
    String? cvNomFichier,
  }) async {
    final champs = payload?.toChamps() ?? const <String, dynamic>{};
    final fichiers = <FichierMultipart>[
      if (cniOctets != null && cniNomFichier != null)
        FichierMultipart(
            champ: 'cni', octets: cniOctets, nomFichier: cniNomFichier),
      if (attestationOctets != null && attestationNomFichier != null)
        FichierMultipart(
            champ: 'attestation',
            octets: attestationOctets,
            nomFichier: attestationNomFichier),
      if (photoOctets != null && photoNomFichier != null)
        FichierMultipart(
            champ: 'photo', octets: photoOctets, nomFichier: photoNomFichier),
      if (cvOctets != null && cvNomFichier != null)
        FichierMultipart(
            champ: 'cv', octets: cvOctets, nomFichier: cvNomFichier),
    ];

    if (champs.isEmpty && fichiers.isEmpty) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }

    final donnees = await _client.putMultipart(
      ApiEndpoints.medecin(id),
      champs: champs,
      fichiers: fichiers,
      token: token,
    );
    return Medecin.fromJson(donnees['medecin'] as Map<String, dynamic>);
  }

  /// DELETE /medecins/:id
  /// Réservé à superadmin côté backend. Échoue avec un message clair
  /// (via [ApiException]) si des avis/abonnements/rendez-vous/
  /// ordonnances référencent encore ce médecin.
  Future<String> supprimerMedecin(String id, {required String token}) async {
    final donnees =
    await _client.delete(ApiEndpoints.medecin(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Fiche médecin supprimée.';
  }

  /// PATCH /medecins/:id/publier
  /// Réservé à admin/superadmin. `medecin` est absent dans le résultat
  /// quand la fiche était déjà publiée (voir [MedecinActionResultat]).
  Future<MedecinActionResultat> publierMedecin(
      String id, {
        required String token,
      }) async {
    final donnees = await _client
        .patch(ApiEndpoints.publierMedecin(id), token: token);
    return MedecinActionResultat.fromJson(donnees as Map<String, dynamic>);
  }

  /// PATCH /medecins/:id/suspendre
  /// Réservé à admin/superadmin. Bloque le compte utilisateur lié ET
  /// retire la fiche de l'annuaire public en même temps (voir en-tête
  /// de suspendreMedecin côté contrôleur). Réversible via
  /// [reactiverMedecin].
  Future<MedecinActionResultat> suspendreMedecin(
      String id, {
        required String token,
      }) async {
    final donnees = await _client
        .patch(ApiEndpoints.suspendreMedecin(id), token: token);
    return MedecinActionResultat.fromJson(donnees as Map<String, dynamic>);
  }

  /// PATCH /medecins/:id/reactiver
  /// Réservé à admin/superadmin. Débloque le compte sans republier
  /// automatiquement la fiche — appeler [publierMedecin] ensuite si
  /// nécessaire. Le backend ne renvoie qu'un message ici, jamais de
  /// fiche medecin.
  Future<String> reactiverMedecin(String id, {required String token}) async {
    final donnees = await _client
        .patch(ApiEndpoints.reactiverMedecin(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Compte médecin réactivé.';
  }

  /// POST /medecins/verifier-ordre
  /// Publique — vérifie l'appartenance au Tableau de l'Ordre National
  /// des Médecins du Cameroun (ONMC), indépendamment de tout
  /// enregistrement local. Peut être appelée avant même la création
  /// d'un compte (pré-validation du numero_ordre). Lève [ApiException]
  /// avec statusCode 502 si l'ONMC est injoignable — ne pas
  /// interpréter cette erreur comme "n'appartient pas à l'ordre".
  Future<VerificationOrdreResultat> verifierAppartenanceOrdre(
      String numeroOrdre,
      ) async {
    final donnees = await _client.post(
      ApiEndpoints.verifierOrdreMedecin,
      body: {'numero_ordre': numeroOrdre},
    );
    return VerificationOrdreResultat.fromJson(donnees as Map<String, dynamic>);
  }

  /* ===================================================================
   * Spécialités médicales (référentiel)
   * =================================================================== */
  // Table de référence autonome (même patron que Langue/Devise/Pays/
  // Ville) : lecture publique, écriture réservée à admin/superadmin,
  // suppression réservée à superadmin.

  /// GET /specialites
  /// Publique. Filtre optionnel [recherche] (sur le nom).
  Future<List<Specialite>> listerSpecialites({String? recherche}) async {
    final donnees = await _client.get(
      ApiEndpoints.specialites,
      query: (recherche != null && recherche.trim().isNotEmpty)
          ? {'recherche': recherche}
          : null,
    );
    final liste = (donnees is Map && donnees['specialites'] is List)
        ? donnees['specialites'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => Specialite.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /specialites/:id
  /// Publique.
  Future<Specialite> obtenirSpecialite(String id) async {
    final donnees = await _client.get(ApiEndpoints.specialite(id));
    return Specialite.fromJson(donnees['specialite'] as Map<String, dynamic>);
  }

  /// POST /specialites
  /// Réservé à admin/superadmin. `nom` obligatoire et unique
  /// (409 si déjà pris — remonté tel quel via [ApiException]).
  Future<Specialite> creerSpecialite({
    required String nom,
    String? description,
    required String token,
  }) async {
    final donnees = await _client.post(
      ApiEndpoints.specialites,
      body: {
        'nom': nom,
        if (description != null) 'description': description,
      },
      token: token,
    );
    return Specialite.fromJson(donnees['specialite'] as Map<String, dynamic>);
  }

  /// PUT /specialites/:id
  /// Réservé à admin/superadmin.
  Future<Specialite> modifierSpecialite(
      String id, {
        required ModifierSpecialitePayload payload,
        required String token,
      }) async {
    if (payload.estVide) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }
    final donnees = await _client.put(
      ApiEndpoints.specialite(id),
      body: payload.toJson(),
      token: token,
    );
    return Specialite.fromJson(donnees['specialite'] as Map<String, dynamic>);
  }

  /// DELETE /specialites/:id
  /// Réservé à superadmin. Échoue (via [ApiException], statusCode 409)
  /// si des médecins référencent encore cette spécialité.
  Future<String> supprimerSpecialite(
      String id, {
        required String token,
      }) async {
    final donnees =
    await _client.delete(ApiEndpoints.specialite(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Spécialité supprimée.';
  }
}