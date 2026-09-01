// lib/repositories/rendez_vous_repository.dart
//
// Repository de consommation des APIs du module transverse "Gestion
// des médecins" — périmètre Rendez-vous + Ordonnance, en miroir de
// src/controllers/rendezVous.controller.js et des routes déclarées
// dans src/routes/medecin.routes.js (lignes 296-328) côté backend.
//
// Comme [ApiClient] et [MedecinRepository], ce fichier ne porte AUCUN
// état applicatif (pas de cache, pas de notification UI) : il ne fait
// que parler HTTP et mapper JSON <-> modèles Dart
// (rendez_vous_models.dart). La gestion d'état (chargement, erreurs,
// sélection courante) appartient à un RendezVousController dédié.
//
// ⚠️ Donnée privée patient/médecin, jamais publique : contrairement à
// [MedecinRepository] (dont certaines routes acceptent un `token`
// optionnel), TOUTES les routes de ce module exigent déjà
// "authentifier" côté backend — [token] est donc `required` partout
// ici, jamais optionnel. Le token suit la même règle que [ApiClient] :
// fourni requête par requête, jamais stocké dans ce fichier.
//
// Filtrage par medecin_id/patient_id (listerRendezVous/listerOrdonnances) :
// le backend ne tient compte de ces filtres que si l'appelant est
// admin/superadmin — pour un patient ou un médecin standard, la liste
// est de toute façon scopée côté serveur à son propre profil, quels
// que soient les filtres envoyés (voir RendezVousFiltres/
// OrdonnanceFiltres dans rendez_vous_models.dart).

import '../models/rendez_vous_models.dart';
import '../utils/api_client.dart';

class RendezVousRepository {
  final ApiClient _client;

  RendezVousRepository(this._client);

  /* ===================================================================
   * Rendez-vous
   * =================================================================== */

  /// GET /rendez-vous
  /// Authentifié — scopé au patient/médecin courant sauf pour
  /// admin/superadmin, qui peut consulter l'ensemble et utiliser
  /// librement [filtres].
  Future<List<RendezVous>> listerRendezVous({
    RendezVousFiltres? filtres,
    required String token,
  }) async {
    final donnees = await _client.get(
      ApiEndpoints.rendezVous,
      query: filtres?.toQuery(),
      token: token,
    );
    final liste = (donnees is Map && donnees['rendez_vous'] is List)
        ? donnees['rendez_vous'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => RendezVous.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /rendez-vous/:id
  /// Ouvert au patient concerné, au médecin concerné, ou à
  /// admin/superadmin — 404 (et non 403) si l'appelant n'est pas
  /// autorisé, pour ne pas révéler l'existence du rendez-vous (voir
  /// estAutoriseSurRdv côté contrôleur).
  Future<RendezVous> obtenirRendezVous(String id, {required String token}) async {
    final donnees =
    await _client.get(ApiEndpoints.unRendezVous(id), token: token);
    return RendezVous.fromJson(donnees['rendez_vous'] as Map<String, dynamic>);
  }

  /// POST /rendez-vous
  /// Réservé à un compte patient (patient_id déduit du token, jamais
  /// saisi par le client). [payload.typeRdv] "teleconsultation" exige
  /// que le médecin ait activé teleconsultation_activee ; le backend
  /// lève une [ApiException] (statusCode 400) si ce n'est pas le cas,
  /// ou si medecin_id/structure_id est introuvable.
  Future<RendezVous> creerRendezVous({
    required CreerRendezVousPayload payload,
    required String token,
  }) async {
    final donnees = await _client.post(
      ApiEndpoints.rendezVous,
      body: payload.toJson(),
      token: token,
    );
    return RendezVous.fromJson(donnees['rendez_vous'] as Map<String, dynamic>);
  }

  /// PUT /rendez-vous/:id
  /// Ouvert au patient concerné, au médecin concerné, ou à
  /// admin/superadmin. Accepte [payload.statut] SANS contrôle de
  /// transition (à réserver aux écrans back-office/admin) — pour un
  /// changement de statut initié par un patient ou un médecin,
  /// préférer [changerStatutRendezVous]. Lève [ApiException] si
  /// [payload] est vide, symétrique du 400 "Aucune donnée valide à
  /// mettre à jour." renvoyé par le backend dans ce cas.
  Future<RendezVous> modifierRendezVous({
    required String id,
    required ModifierRendezVousPayload payload,
    required String token,
  }) async {
    if (payload.estVide) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }
    final donnees = await _client.put(
      ApiEndpoints.unRendezVous(id),
      body: payload.toJson(),
      token: token,
    );
    return RendezVous.fromJson(donnees['rendez_vous'] as Map<String, dynamic>);
  }

  /// PATCH /rendez-vous/:id/statut
  /// Action dédiée au changement de statut (même patron que
  /// publier/suspendre/reactiver sur medecin) : contrairement à
  /// [modifierRendezVous], le backend vérifie que la transition
  /// demandée est cohérente avec le rôle de l'appelant et le statut
  /// actuel du rdv (voir TRANSITIONS_AUTORISEES et la documentation de
  /// [ChangerStatutRendezVousPayload]). Lève [ApiException] avec
  /// statusCode 403 si la transition n'est pas autorisée pour le rôle
  /// de l'appelant, ou 400 si le rdv a déjà ce statut.
  Future<RendezVous> changerStatutRendezVous({
    required String id,
    required ChangerStatutRendezVousPayload payload,
    required String token,
  }) async {
    final donnees = await _client.patch(
      ApiEndpoints.statutRendezVous(id),
      body: payload.toJson(),
      token: token,
    );
    return RendezVous.fromJson(donnees['rendez_vous'] as Map<String, dynamic>);
  }

  /// DELETE /rendez-vous/:id
  /// Réservé à admin/superadmin côté backend — un rendez-vous s'annule
  /// via [changerStatutRendezVous]/[modifierRendezVous] (statut
  /// "annule"), il ne se supprime physiquement qu'en dernier recours
  /// administratif. Lève [ApiException] (statusCode 409) si une
  /// ordonnance est encore rattachée à ce rendez-vous.
  Future<String> supprimerRendezVous(String id, {required String token}) async {
    final donnees =
    await _client.delete(ApiEndpoints.unRendezVous(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Rendez-vous supprimé.';
  }

  /* ===================================================================
   * Ordonnances
   * =================================================================== */

  /// GET /ordonnances
  /// Authentifié — scopée au patient/médecin courant sauf pour
  /// admin/superadmin, qui peut consulter l'ensemble et utiliser
  /// librement [filtres].
  Future<List<Ordonnance>> listerOrdonnances({
    OrdonnanceFiltres? filtres,
    required String token,
  }) async {
    final donnees = await _client.get(
      ApiEndpoints.ordonnances,
      query: filtres?.toQuery(),
      token: token,
    );
    final liste = (donnees is Map && donnees['ordonnances'] is List)
        ? donnees['ordonnances'] as List<dynamic>
        : const <dynamic>[];
    return liste
        .map((e) => Ordonnance.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /ordonnances/:id
  /// Le médecin auteur, le patient concerné, ou admin/superadmin —
  /// 404 (et non 403) si l'appelant n'est pas autorisé, même règle de
  /// confidentialité que [obtenirRendezVous].
  Future<Ordonnance> obtenirOrdonnance(String id, {required String token}) async {
    final donnees =
    await _client.get(ApiEndpoints.uneOrdonnance(id), token: token);
    return Ordonnance.fromJson(donnees['ordonnance'] as Map<String, dynamic>);
  }

  /// POST /ordonnances
  /// Réservé au médecin du rendez-vous concerné, déduit de
  /// [payload.rdvId] côté backend (jamais un autre médecin, même
  /// admin ne peut créer une ordonnance à la place du médecin — pièce
  /// médicale nominative). [payload] ne porte pas d'identifiant_unique :
  /// généré côté serveur. Lève [ApiException] (statusCode 403) si
  /// l'appelant n'est pas le médecin du rendez-vous, ou 400 si
  /// rdv_id/pays_emission_id est introuvable.
  Future<Ordonnance> creerOrdonnance({
    required CreerOrdonnancePayload payload,
    required String token,
  }) async {
    final donnees = await _client.post(
      ApiEndpoints.ordonnances,
      body: payload.toJson(),
      token: token,
    );
    return Ordonnance.fromJson(donnees['ordonnance'] as Map<String, dynamic>);
  }

  /// PUT /ordonnances/:id
  /// Le médecin auteur ou admin/superadmin — seuls
  /// [payload.contenu]/[payload.paysEmissionId] sont modifiables ;
  /// rdv_id, medecin_id, patient_id et identifiant_unique sont
  /// immuables après émission. Lève [ApiException] si [payload] est
  /// vide, symétrique du 400 "Aucune donnée valide à mettre à jour."
  /// renvoyé par le backend dans ce cas.
  Future<Ordonnance> modifierOrdonnance({
    required String id,
    required ModifierOrdonnancePayload payload,
    required String token,
  }) async {
    if (payload.estVide) {
      throw const ApiException('Aucune donnée valide à mettre à jour.');
    }
    final donnees = await _client.put(
      ApiEndpoints.uneOrdonnance(id),
      body: payload.toJson(),
      token: token,
    );
    return Ordonnance.fromJson(donnees['ordonnance'] as Map<String, dynamic>);
  }

  /// DELETE /ordonnances/:id
  /// Réservé à admin/superadmin côté backend — pièce médicale, jamais
  /// supprimée par un médecin après émission.
  Future<String> supprimerOrdonnance(String id, {required String token}) async {
    final donnees =
    await _client.delete(ApiEndpoints.uneOrdonnance(id), token: token);
    return (donnees is Map && donnees['message'] is String)
        ? donnees['message'] as String
        : 'Ordonnance supprimée.';
  }
}