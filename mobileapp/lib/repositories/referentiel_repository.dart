// lib/repositories/referentiel_repository.dart
//
// Repository du module "référentiels" : ne consomme QUE les endpoints
// de LECTURE (GET) de l'API, en miroir de referentiels.routes.js.
//
// Rappel des règles d'accès côté backend :
//   - Langue / Devise / Pays / Ville : lecture PUBLIQUE (aucun token
//     requis) → utilisables avant inscription (ex: formulaire public).
//   - Role (IAM) : lecture réservée aux utilisateurs authentifiés
//     → le token est donc obligatoire pour listerRoles/obtenirRole.
//
// Ce repository ne fait aucune gestion d'état (pas de cache, pas de
// notifyListeners) : c'est le rôle du controller. Il se contente de
// traduire un appel HTTP en modèles typés, ou de laisser remonter une
// [ApiException] en cas d'échec.

import '../models/referentiel_models.dart';
import '../utils/api_client.dart';

class ReferentielRepository {
  final ApiClient _client;

  ReferentielRepository(this._client);

  // ─── Langues ──────────────────────────────────────────────────

  Future<List<Langue>> listerLangues() async {
    final data = await _client.get(ApiEndpoints.langues);
    final liste = (data as Map<String, dynamic>)['langues'] as List;
    return liste
        .whereType<Map<String, dynamic>>()
        .map(Langue.fromJson)
        .toList();
  }

  Future<Langue> obtenirLangue(String id) async {
    final data = await _client.get(ApiEndpoints.langue(id));
    return Langue.fromJson(
        (data as Map<String, dynamic>)['langue'] as Map<String, dynamic>);
  }

  // ─── Devises ──────────────────────────────────────────────────

  Future<List<Devise>> listerDevises() async {
    final data = await _client.get(ApiEndpoints.devises);
    final liste = (data as Map<String, dynamic>)['devises'] as List;
    return liste
        .whereType<Map<String, dynamic>>()
        .map(Devise.fromJson)
        .toList();
  }

  Future<Devise> obtenirDevise(String id) async {
    final data = await _client.get(ApiEndpoints.devise(id));
    return Devise.fromJson(
        (data as Map<String, dynamic>)['devise'] as Map<String, dynamic>);
  }

  // ─── Pays ─────────────────────────────────────────────────────

  /// [statutActivation] filtre optionnel (pilote / actif / inactif),
  /// en miroir du query param `?statut_activation=` côté backend.
  Future<List<Pays>> listerPays({StatutActivationPays? statutActivation}) async {
    final data = await _client.get(
      ApiEndpoints.pays,
      query: {
        if (statutActivation != null)
          'statut_activation': statutActivation.toApi(),
      },
    );
    final liste = (data as Map<String, dynamic>)['pays'] as List;
    return liste.whereType<Map<String, dynamic>>().map(Pays.fromJson).toList();
  }

  /// Détail d'un pays : inclut ses villes (`include: { villes: true }`
  /// côté backend).
  Future<Pays> obtenirPays(String id) async {
    final data = await _client.get(ApiEndpoints.unPays(id));
    return Pays.fromJson(
        (data as Map<String, dynamic>)['pays'] as Map<String, dynamic>);
  }

  // ─── Villes ───────────────────────────────────────────────────

  /// [paysId] filtre optionnel, en miroir du query param `?pays_id=`
  /// côté backend (ex: peupler un select "ville" dépendant du pays
  /// choisi dans un formulaire).
  Future<List<Ville>> listerVilles({String? paysId}) async {
    final data = await _client.get(
      ApiEndpoints.villes,
      query: {if (paysId != null) 'pays_id': paysId},
    );
    final liste = (data as Map<String, dynamic>)['villes'] as List;
    return liste.whereType<Map<String, dynamic>>().map(Ville.fromJson).toList();
  }

  Future<Ville> obtenirVille(String id) async {
    final data = await _client.get(ApiEndpoints.uneVille(id));
    return Ville.fromJson(
        (data as Map<String, dynamic>)['ville'] as Map<String, dynamic>);
  }

  // ─── Rôles (IAM) — authentification obligatoire ──────────────

  /// [token] est requis : `GET /referentiels/roles` est protégé par
  /// `authentifier` côté backend (contrairement aux autres lectures
  /// de ce module).
  Future<List<Role>> listerRoles({required String token}) async {
    final data = await _client.get(ApiEndpoints.roles, token: token);
    final liste = (data as Map<String, dynamic>)['roles'] as List;
    return liste.whereType<Map<String, dynamic>>().map(Role.fromJson).toList();
  }

  Future<Role> obtenirRole(String id, {required String token}) async {
    final data = await _client.get(ApiEndpoints.role(id), token: token);
    return Role.fromJson(
        (data as Map<String, dynamic>)['role'] as Map<String, dynamic>);
  }
}