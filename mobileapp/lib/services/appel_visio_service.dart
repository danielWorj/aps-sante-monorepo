// lib/services/appel_visio_service.dart
//
// Appel entrant façon WhatsApp quand le médecin lance la téléconsultation :
// écran d'appel NATIF (flutter_callkit_incoming — notification d'appel
// plein écran / carte d'appel avec sonnerie sur Android, CallKit sur iOS),
// avec Accepter / Refuser.
//
// Déclencheurs (côté patient) :
//   - push `rdv_visio_demarree` reçu application FERMÉE ou en arrière-plan
//     (Android : message de données seules, voir fcmService.js) ->
//     [recevoirPushArrierePlan] ;
//   - push reçu application ouverte -> PilotePush ;
//   - relecture de GET /visio/appel-entrant application ouverte ->
//     PiloteAppelVisio (filet de sécurité, même sans Firebase).
// Un appel (rdv + horodatage du lancement, stable côté serveur) ne sonne
// qu'UNE fois, quel que soit le déclencheur : les appels déjà sonnés sont
// gardés dans le stockage sécurisé, partagé avec l'isolat d'arrière-plan.
//
// Synchronisation entre appareils (voir visio.controller.js) :
//   - Refuser / sonnerie expirée -> POST /visio/:id/refus (PiloteAppelVisio) ;
//     un appel sonné puis disparu sans réponse connue (refusé application
//     fermée) est signalé au serveur à la relecture suivante ;
//   - refusé ou décroché sur un autre appareil, visio terminée par le
//     médecin -> signal silencieux `visio_appel_termine` (push) et/ou
//     GET /visio/appel-entrant qui ne présente plus l'appel -> [raccrocher].
//
// iOS : sans PushKit (VoIP), une application fermée ne peut pas afficher
// CallKit à la réception d'un push : le bandeau classique s'affiche, et
// l'appel sonne à l'ouverture de l'application s'il est encore en cours.
//
// Accepter -> PiloteAppelVisio ouvre la téléconsultation (entrée directe).

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/visio_models.dart';
import 'push_service.dart';

class AppelVisioService {
  AppelVisioService._();

  static const _stockage = FlutterSecureStorage();
  static const _cleStockage = 'aps_appels_visio_sonnes';
  static const _separateur = '|';
  static const _maxMemorises = 20;

  /// Durée de la sonnerie avant « appel manqué » (le serveur garde l'appel
  /// joignable 10 min depuis les rendez-vous).
  static const dureeSonnerie = Duration(seconds: 45);

  /// Marque l'appel comme sonné ; faux s'il l'était déjà.
  static Future<bool> _marquerSonne(String cle) async {
    try {
      final brut = await _stockage.read(key: _cleStockage) ?? '';
      final liste = brut.isEmpty ? <String>[] : brut.split(_separateur);
      if (liste.contains(cle)) return false;
      final nouvelle = [cle, ...liste].take(_maxMemorises).join(_separateur);
      await _stockage.write(key: _cleStockage, value: nouvelle);
    } catch (e) {
      // Stockage indisponible : mieux vaut sonner deux fois que jamais.
      debugPrint('[appel] Stockage des appels sonnés indisponible : $e');
    }
    return true;
  }

  /// L'appel a-t-il déjà sonné sur cet appareil ?
  static Future<bool> dejaSonne(String cle) async {
    try {
      final brut = await _stockage.read(key: _cleStockage) ?? '';
      return brut.split(_separateur).contains(cle);
    } catch (_) {
      return false;
    }
  }

  /// Appels actuellement affichés par l'écran d'appel natif.
  static Future<List<CallKitParams>> appelsAffiches() async {
    try {
      return await FlutterCallkitIncoming.activeCalls();
    } catch (_) {
      return const [];
    }
  }

  /// Fait sonner l'appel (une seule fois par lancement). Ne lève jamais.
  static Future<void> sonner(AppelVisioEntrant appel) async {
    if (!await _marquerSonne(appel.cle)) return;
    try {
      await FlutterCallkitIncoming.showCallkitIncoming(_parametres(appel));
    } catch (e) {
      debugPrint('[appel] Écran d\'appel indisponible : $e');
    }
  }

  /// Retire l'appel de l'écran (décroché, ou téléconsultation ouverte).
  static Future<void> raccrocher(String rdvId) async {
    try {
      await FlutterCallkitIncoming.endCall(rdvId);
    } catch (_) {
      // Aucun appel affiché.
    }
  }

  /// Appel décroché pendant que l'application était fermée : à ouvrir au
  /// démarrage. Renvoie l'identifiant du RDV, ou null.
  static Future<String?> appelDecroche() async {
    try {
      final appels = await FlutterCallkitIncoming.activeCalls();
      for (final a in appels) {
        if (a.isAccepted) return rdvIdDe(a);
      }
    } catch (_) {
      // Plugin indisponible (tests, plateforme non gérée).
    }
    return null;
  }

  /// RDV d'un appel affiché (identifiant = rdv_id, un UUID comme l'exige CallKit).
  static String? rdvIdDe(CallKitParams p) => p.extra?['rdv_id'] as String? ?? p.id;

  static CallKitParams _parametres(AppelVisioEntrant appel) => CallKitParams(
        id: appel.rdvId,
        nameCaller: appel.nomMedecin,
        appName: 'APS Santé',
        avatar: appel.photoMedecin,
        handle: appel.specialite ?? 'Téléconsultation',
        type: 1, // appel vidéo
        duration: dureeSonnerie.inMilliseconds,
        extra: {'rdv_id': appel.rdvId, 'cle': appel.cle},
        missedCallNotification: const NotificationParams(
          showNotification: true,
          isShowCallback: false,
          subtitle: 'Téléconsultation manquée',
        ),
        // Couleurs de l'écran d'appel WhatsApp (fond sombre, bouton vert).
        android: const AndroidParams(
          isCustomNotification: true,
          isShowLogo: false,
          backgroundColor: '#0B141A',
          actionColor: '#25D366',
          textColor: '#FFFFFF',
          incomingCallNotificationChannelName: 'Appels de téléconsultation',
          missedCallNotificationChannelName: 'Téléconsultations manquées',
          isShowFullLockedScreen: true,
          isImportant: true,
          textAccept: 'Accepter',
          textDecline: 'Refuser',
        ),
        ios: const IOSParams(
          handleType: 'generic',
          supportsVideo: true,
          maximumCallGroups: 1,
          maximumCallsPerCallGroup: 1,
          includesCallsInRecents: false,
        ),
      );
}

/// Push reçu application fermée / en arrière-plan (isolat séparé) : seul
/// l'appel visio est traité ici, les autres notifications sont affichées
/// par le système.
@pragma('vm:entry-point')
Future<void> recevoirPushArrierePlan(RemoteMessage message) async {
  // Refusé / décroché ailleurs, ou visio terminée : l'appel cesse de sonner.
  final termine = rdvIdAppelTermine(message.data);
  if (termine != null) {
    await AppelVisioService.raccrocher(termine);
    return;
  }
  final appel = AppelVisioEntrant.depuisPush(message.data);
  if (appel == null) return;
  final options = PushService.optionsFirebase;
  if (Firebase.apps.isEmpty && options != null) {
    await Firebase.initializeApp(options: options);
  }
  await AppelVisioService.sonner(appel);
}

/// Signal silencieux `visio_appel_termine` (signalerAppareils côté serveur) :
/// RDV dont l'appel doit cesser de sonner, ou null.
String? rdvIdAppelTermine(Map<String, dynamic> donnees) {
  final rdvId = donnees['rdv_id'];
  return donnees['type'] == 'visio_appel_termine' && rdvId is String ? rdvId : null;
}
