// lib/repositories/assurance_repository.dart
//
// Repository de consommation des APIs du module "annuaire — assurance"
// (service_assurance, mise_en_relation, catalogue activite /
// option_activite, agence), en miroir de src/routes/assurance.routes.js
// et src/controllers/assurance.controller.js côté backend.
//
// Comme [MedecinRepository] / [ApiClient], ce fichier ne porte AUCUN état
// applicatif (pas de cache, pas de notification UI) : il ne fait que
// parler HTTP et mapper JSON <-> modèles Dart (assurance_models.dart). La
// gestion d'état (chargement, erreurs, sélection courante) appartient à
// un AssuranceController dédié, qui s'appuie sur ce repository.
//
// Le token d'authentification suit la même règle que [ApiClient] : fourni
// requête par requête (paramètre `token`), jamais stocké ici.
//
// Rappel des règles d'accès (voir assurance.routes.js — reprises ici pour
// que chaque méthode documente qui peut légitimement l'appeler ; la
// vérification effective reste faite côté serveur, ce repository ne fait
// aucun contrôle d'autorisation lui-même) :
//   - service_assurance   : GET publique ; POST/PUT tout utilisateur
//                            authentifié (quel que soit son rôle) ; DELETE
//                            superadmin uniquement.
//   - mise_en_relation    : POST tout utilisateur authentifié ; GET/DELETE
//                            agent du service_assurance concerné, ou
//                            admin/superadmin.
//   - activite / option_activite / agence : GET publique ; écriture
//                            réservée à l'agent du service_assurance
//                            concerné (déduit directement, ou via
//                            l'activité parente pour option_activite), ou
//                            admin/superadmin.
//
// Toute erreur (HTTP >= 400, réseau, parsing) remonte sous forme
// d'[ApiException] homogène — voir [ApiClient]. Les erreurs "il n'y a
// rien à envoyer" (mise à jour vide) sont levées ici même, avant l'appel
// réseau, sur le même modèle que [MedecinRepository.modifierMedecin].

import '../models/assurance_models.dart';
import '../utils/api_client.dart';

class AssuranceRepository {
  final ApiClient _client;

  AssuranceRepository(this._client);

  /* ===================================================================
   * Services d'assurance
   * =================================================================== */

  /// GET /services-assurance
  /// Publique — aucune authentification requise.
  Future<List<ServiceAssurance>> listerServicesAssurance({
    ServicesAssuranceFiltre? filtres,
  }) async {
    final donnees = await _client.get(
      ApiEndpoints.servicesAssurance,
      query: filtres?.toQueryParameters(),
    );
    return ServicesAssuranceListeReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).servicesAssurance;
  }

  /// GET /services-assurance/:id
  /// Publique.
  Future<ServiceAssurance> obtenirServiceAssurance(String id) async {
    final donnees =
    await _client.get(ApiEndpoints.serviceAssurance(id));
    return ServiceAssuranceDetailReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).serviceAssurance;
  }

  /// POST /services-assurance
  /// Ouvert à tout utilisateur authentifié — [token] obligatoire. Crée en
  /// même temps le compte agent (voir [AgentServiceAssurance] : le mot de
  /// passe temporaire n'apparaît qu'une seule fois dans la réponse, à
  /// afficher immédiatement à l'appelant sans le persister). Le fichier
  /// `image_assurance` est obligatoire côté serveur.
  Future<ServiceAssuranceCreationReponse> creerServiceAssurance({
    required ServiceAssuranceCreationRequete requete,
    required List<int> imageOctets,
    required String imageNomFichier,
    required String token,
  }) async {
    final donnees = await _client.postMultipart(
      ApiEndpoints.servicesAssurance,
      champs: requete.toChampsTexte(),
      fichiers: [
        FichierMultipart(
          champ: ChampsFichiersAssurance.imageAssurance,
          octets: imageOctets,
          nomFichier: imageNomFichier,
        ),
      ],
      token: token,
    );
    return ServiceAssuranceCreationReponse.fromJson(
      donnees as Map<String, dynamic>,
    );
  }

  /// PUT /services-assurance/:id
  /// Ouvert à tout utilisateur authentifié (le contrôleur restreint
  /// silencieusement `statut_verification` aux seuls admin/superadmin —
  /// voir [ServiceAssuranceMiseAJourRequete]). Le fichier est optionnel :
  /// ne le fournir que pour remplacer l'image existante. Lève
  /// [ApiException] si ni [requete] ni fichier ne sont fournis, symétrique
  /// du 400 "Aucune donnée valide à mettre à jour." côté backend.
  Future<ServiceAssuranceMiseAJourReponse> modifierServiceAssurance({
    required String id,
    required String token,
    ServiceAssuranceMiseAJourRequete? requete,
    List<int>? imageOctets,
    String? imageNomFichier,
  }) async {
    final champs = requete?.toChampsTexte() ?? const <String, String>{};
    final fichiers = <FichierMultipart>[
      if (imageOctets != null && imageNomFichier != null)
        FichierMultipart(
          champ: ChampsFichiersAssurance.imageAssurance,
          octets: imageOctets,
          nomFichier: imageNomFichier,
        ),
    ];

    if (champs.isEmpty && fichiers.isEmpty) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }

    final donnees = await _client.putMultipart(
      ApiEndpoints.serviceAssurance(id),
      champs: champs,
      fichiers: fichiers,
      token: token,
    );
    return ServiceAssuranceMiseAJourReponse.fromJson(
      donnees as Map<String, dynamic>,
    );
  }

  /// DELETE /services-assurance/:id
  /// Réservé à superadmin côté backend. Échoue (via [ApiException],
  /// statusCode 409) si des agents/mises en relation/activités/agences
  /// référencent encore ce service.
  Future<String> supprimerServiceAssurance(
      String id, {
        required String token,
      }) async {
    final donnees = await _client.delete(
      ApiEndpoints.serviceAssurance(id),
      token: token,
    );
    return _messageOu(donnees, 'Service d\'assurance supprimé.');
  }

  /* ===================================================================
   * Mises en relation
   * =================================================================== */

  /// GET /mises-en-relation-assurance?service_assurance_id=...
  /// Réservé à l'agent du service concerné, ou à admin/superadmin —
  /// [token] obligatoire. `service_assurance_id` est un paramètre requis
  /// côté serveur (pas de liste globale non filtrée).
  Future<List<MiseEnRelation>> listerMisesEnRelation({
    required String serviceAssuranceId,
    required String token,
  }) async {
    final donnees = await _client.get(
      ApiEndpoints.misesEnRelationAssurance,
      query: MisesEnRelationFiltre(
        serviceAssuranceId: serviceAssuranceId,
      ).toQueryParameters(),
      token: token,
    );
    return MisesEnRelationListeReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).misesEnRelation;
  }

  /// POST /mises-en-relation-assurance
  /// Ouvert à tout utilisateur authentifié (n'importe quel rôle) —
  /// [token] obligatoire. `utilisateur_id` n'est jamais envoyé : déduit
  /// côté serveur du compte authentifié.
  Future<MiseEnRelationCreationReponse> creerMiseEnRelation({
    required MiseEnRelationCreationRequete requete,
    required String token,
  }) async {
    final donnees = await _client.post(
      ApiEndpoints.misesEnRelationAssurance,
      body: requete.toJson(),
      token: token,
    );
    return MiseEnRelationCreationReponse.fromJson(
      donnees as Map<String, dynamic>,
    );
  }

  /// DELETE /mises-en-relation-assurance/:id
  /// Réservé à l'agent du service concerné, ou à admin/superadmin —
  /// [token] obligatoire.
  Future<String> supprimerMiseEnRelation(
      String id, {
        required String token,
      }) async {
    final donnees = await _client.delete(
      ApiEndpoints.miseEnRelationAssurance(id),
      token: token,
    );
    return _messageOu(donnees, 'Mise en relation supprimée.');
  }

  /* ===================================================================
   * Activités (catalogue produits)
   * =================================================================== */

  /// GET /activites
  /// Publique. Filtre optionnel par `service_assurance_id` — sans filtre,
  /// retourne l'ensemble du catalogue.
  Future<List<Activite>> listerActivites({
    ActivitesFiltre? filtre,
  }) async {
    final donnees = await _client.get(
      ApiEndpoints.activites,
      query: filtre?.toQueryParameters(),
    );
    return ActivitesListeReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).activites;
  }

  /// GET /activites/:id
  /// Publique.
  Future<Activite> obtenirActivite(String id) async {
    final donnees = await _client.get(ApiEndpoints.activite(id));
    return ActiviteDetailReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).activite;
  }

  /// POST /activites
  /// Réservé à l'agent du service_assurance concerné, ou à
  /// admin/superadmin — [token] obligatoire.
  Future<Activite> creerActivite({
    required ActiviteCreationRequete requete,
    required String token,
  }) async {
    final donnees = await _client.post(
      ApiEndpoints.activites,
      body: requete.toJson(),
      token: token,
    );
    return ActiviteEcritureReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).activite;
  }

  /// PUT /activites/:id
  /// Même autorisation que [creerActivite]. Ne permet pas de déplacer
  /// l'activité vers un autre service_assurance_id (non modifiable côté
  /// serveur). Lève [ApiException] si [requete] est entièrement vide.
  Future<Activite> modifierActivite({
    required String id,
    required ActiviteMiseAJourRequete requete,
    required String token,
  }) async {
    final corps = requete.toJson();
    if (corps.isEmpty) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }
    final donnees = await _client.put(
      ApiEndpoints.activite(id),
      body: corps,
      token: token,
    );
    return ActiviteEcritureReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).activite;
  }

  /// DELETE /activites/:id
  /// Même autorisation que [creerActivite]. Échoue (via [ApiException])
  /// si des options d'activité référencent encore cette activité.
  Future<String> supprimerActivite(
      String id, {
        required String token,
      }) async {
    final donnees =
    await _client.delete(ApiEndpoints.activite(id), token: token);
    return _messageOu(donnees, 'Activité supprimée.');
  }

  /* ===================================================================
   * Options d'activité
   * =================================================================== */

  /// GET /options-activite?activite_id=...
  /// Publique. `activite_id` est un paramètre requis côté serveur (pas de
  /// liste globale non filtrée) — un [ApiException] statusCode 400 remonte
  /// si le backend le juge manquant.
  Future<List<OptionActivite>> listerOptionsActivite({
    required String activiteId,
  }) async {
    final donnees = await _client.get(
      ApiEndpoints.optionsActivite,
      query: {'activite_id': activiteId},
    );
    return OptionsActiviteListeReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).optionsActivite;
  }

  /// GET /options-activite/:id
  /// Publique.
  Future<OptionActivite> obtenirOptionActivite(String id) async {
    final donnees = await _client.get(ApiEndpoints.optionActivite(id));
    return OptionActiviteDetailReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).optionActivite;
  }

  /// POST /options-activite
  /// Réservé à l'agent du service_assurance propriétaire de l'activité
  /// parente (déduit indirectement côté serveur), ou à admin/superadmin —
  /// [token] obligatoire.
  Future<OptionActivite> creerOptionActivite({
    required OptionActiviteCreationRequete requete,
    required String token,
  }) async {
    final donnees = await _client.post(
      ApiEndpoints.optionsActivite,
      body: requete.toJson(),
      token: token,
    );
    return OptionActiviteEcritureReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).optionActivite;
  }

  /// PUT /options-activite/:id
  /// Même autorisation que [creerOptionActivite]. Ne permet pas de
  /// déplacer l'option vers une autre activité. Lève [ApiException] si
  /// [requete] est entièrement vide.
  Future<OptionActivite> modifierOptionActivite({
    required String id,
    required OptionActiviteMiseAJourRequete requete,
    required String token,
  }) async {
    final corps = requete.toJson();
    if (corps.isEmpty) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }
    final donnees = await _client.put(
      ApiEndpoints.optionActivite(id),
      body: corps,
      token: token,
    );
    return OptionActiviteEcritureReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).optionActivite;
  }

  /// DELETE /options-activite/:id
  /// Même autorisation que [creerOptionActivite].
  Future<String> supprimerOptionActivite(
      String id, {
        required String token,
      }) async {
    final donnees = await _client.delete(
      ApiEndpoints.optionActivite(id),
      token: token,
    );
    return _messageOu(donnees, 'Option d\'activité supprimée.');
  }

  /* ===================================================================
   * Agences
   * =================================================================== */

  /// GET /agences
  /// Publique. Filtre optionnel par `service_assurance_id` — sans filtre,
  /// retourne l'ensemble des agences.
  Future<List<Agence>> listerAgences({AgencesFiltre? filtre}) async {
    final donnees = await _client.get(
      ApiEndpoints.agences,
      query: filtre?.toQueryParameters(),
    );
    return AgencesListeReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).agences;
  }

  /// GET /agences/:id
  /// Publique.
  Future<Agence> obtenirAgence(String id) async {
    final donnees = await _client.get(ApiEndpoints.agence(id));
    return AgenceDetailReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).agence;
  }

  /// POST /agences
  /// Réservé à l'agent du service_assurance concerné, ou à
  /// admin/superadmin — [token] obligatoire.
  Future<Agence> creerAgence({
    required AgenceCreationRequete requete,
    required String token,
  }) async {
    final donnees = await _client.post(
      ApiEndpoints.agences,
      body: requete.toJson(),
      token: token,
    );
    return AgenceEcritureReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).agence;
  }

  /// PUT /agences/:id
  /// Même autorisation que [creerAgence]. Ne permet pas de déplacer
  /// l'agence vers un autre service_assurance_id. Même règle de
  /// géolocalisation que [modifierServiceAssurance] (voir
  /// [AgenceMiseAJourRequete.effacerGps]). Lève [ApiException] si
  /// [requete] est entièrement vide.
  Future<Agence> modifierAgence({
    required String id,
    required AgenceMiseAJourRequete requete,
    required String token,
  }) async {
    final corps = requete.toJson();
    if (corps.isEmpty) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }
    final donnees = await _client.put(
      ApiEndpoints.agence(id),
      body: corps,
      token: token,
    );
    return AgenceEcritureReponse.fromJson(
      donnees as Map<String, dynamic>,
    ).agence;
  }

  /// DELETE /agences/:id
  /// Même autorisation que [creerAgence].
  Future<String> supprimerAgence(
      String id, {
        required String token,
      }) async {
    final donnees =
    await _client.delete(ApiEndpoints.agence(id), token: token);
    return _messageOu(donnees, 'Agence supprimée.');
  }

  /* ===================================================================
   * Aides internes
   * =================================================================== */

  /// Lit `message` dans une réponse `{ message }` générique (DELETE), avec
  /// une valeur de repli si le backend ne le fournit pas.
  String _messageOu(dynamic donnees, String repli) {
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : repli;
  }
}