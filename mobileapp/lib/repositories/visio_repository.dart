// lib/repositories/visio_repository.dart
//
// Miroir de visio.controller.js côté backend : une seule route,
// authentifiée, token requis (pas optionnel), comme RendezVousRepository.
import '../models/visio_models.dart';
import '../utils/api_client.dart';


class VisioRepository {
  final ApiClient _client;

  VisioRepository(this._client);

  /// POST /visio/token — récupère le JWT Jitsi pour rejoindre la
  /// téléconsultation d'un rendez-vous donné.
  Future<VisioSession> obtenirTokenVisio({
    required String rdvId,
    required String token,
  }) async {
    final donnees = await _client.post(
      ApiEndpoints.visioToken,
      body: {'rdv_id': rdvId},
      token: token,
    );
    return VisioSession.fromJson(donnees as Map<String, dynamic>);
  }
}