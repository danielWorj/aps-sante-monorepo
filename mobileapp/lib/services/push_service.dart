// lib/services/push_service.dart
//
// Notifications push (Firebase Cloud Messaging) — pendant mobile de
// server/src/services/push.service.js.
//
// Configuration : aucune dépendance au fichier google-services.json ni au
// plugin Gradle — les identifiants du projet Firebase sont passés au build :
//   flutter build apk \
//     --dart-define=FIREBASE_API_KEY=... \
//     --dart-define=FIREBASE_APP_ID=1:...:android:... \
//     --dart-define=FIREBASE_MESSAGING_SENDER_ID=... \
//     --dart-define=FIREBASE_PROJECT_ID=...
//   (iOS : FIREBASE_IOS_APP_ID en plus, et la capacité Push + clé APNs.)
// Sans eux, le push est simplement désactivé (l'application fonctionne
// normalement, la cloche in-app reste la source de vérité).
//
// Rôle de ce service : initialiser Firebase, obtenir / supprimer le jeton
// de l'appareil et exposer les messages reçus. L'enregistrement du jeton
// auprès du serveur et la navigation au toucher sont faits par
// PilotePush (pages/pilote_push.dart), qui a accès à la session.
//
// Jeton : on garde le jeton d'enregistrement FCM classique (getToken /
// onTokenRefresh / deleteToken), attendu par `message.token` de l'API
// HTTP v1 utilisée par le serveur. La nouvelle API register() /
// onRegistered de firebase_messaging 17 fournit un identifiant
// d'installation (envoi direct), un autre mode d'adressage — à adopter
// côté serveur ET ici en même temps, le jour où il le faudra.

import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'appel_visio_service.dart' show recevoirPushArrierePlan;

/// Données d'une notification push (voir donneesPush côté serveur) :
/// `type`, `cible` (rendez_vous | demandes | avis | notifications),
/// `rdv_id`, `offre_id`, `palier`…
typedef DonneesPush = Map<String, dynamic>;

class PushService {
  PushService._();

  static const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const _appIdAndroid = String.fromEnvironment('FIREBASE_APP_ID');
  static const _appIdIos = String.fromEnvironment('FIREBASE_IOS_APP_ID');
  static const _senderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');

  static bool _actif = false;

  /// Vrai si Firebase est configuré et initialisé.
  static bool get actif => _actif;

  static final _touchers = StreamController<DonneesPush>.broadcast();
  static final _premierPlan = StreamController<RemoteMessage>.broadcast();
  static DonneesPush? _toucherInitial;

  /// L'utilisateur a touché une notification (application en arrière-plan).
  static Stream<DonneesPush> get touchers => _touchers.stream;

  /// Message reçu pendant que l'application est ouverte (Android n'affiche
  /// alors pas de bandeau système : l'application montre le sien).
  static Stream<RemoteMessage> get premierPlan => _premierPlan.stream;

  /// Notification qui a LANCÉ l'application (fermée) — lue une seule fois.
  static DonneesPush? consommerToucherInitial() {
    final d = _toucherInitial;
    _toucherInitial = null;
    return d;
  }

  static String get plateforme => Platform.isIOS ? 'ios' : 'android';

  /// Options du projet Firebase (--dart-define), null si non configuré.
  /// Aussi lues par l'isolat d'arrière-plan (appel visio entrant).
  static FirebaseOptions? get optionsFirebase {
    final appId = Platform.isIOS ? _appIdIos : _appIdAndroid;
    if (_apiKey.isEmpty || appId.isEmpty || _senderId.isEmpty || _projectId.isEmpty) return null;
    return FirebaseOptions(
      apiKey: _apiKey,
      appId: appId,
      messagingSenderId: _senderId,
      projectId: _projectId,
    );
  }

  /// À appeler une fois dans main(), avant runApp. Ne lève jamais.
  static Future<void> initialiser() async {
    final options = optionsFirebase;
    if (options == null) {
      debugPrint('[push] Firebase non configuré (--dart-define FIREBASE_*) : push désactivé.');
      return;
    }
    try {
      await Firebase.initializeApp(options: options);
      // Application fermée / en arrière-plan : l'appel visio sonne quand même.
      FirebaseMessaging.onBackgroundMessage(recevoirPushArrierePlan);
      FirebaseMessaging.onMessageOpenedApp.listen((m) => _touchers.add(m.data));
      FirebaseMessaging.onMessage.listen(_premierPlan.add);
      _toucherInitial = (await FirebaseMessaging.instance.getInitialMessage())?.data;
      // iOS : afficher aussi le bandeau quand l'application est ouverte.
      await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
      _actif = true;
    } catch (e) {
      debugPrint('[push] Initialisation Firebase impossible : $e');
    }
  }

  /// Demande l'autorisation (Android 13+, iOS) puis renvoie le jeton de
  /// l'appareil, ou null (refus, push inactif, réseau).
  static Future<String?> obtenirJeton() async {
    if (!_actif) return null;
    try {
      final reglages = await FirebaseMessaging.instance.requestPermission();
      if (reglages.authorizationStatus == AuthorizationStatus.denied) return null;
      // ignore: deprecated_member_use
      return await FirebaseMessaging.instance.getToken();
    } catch (e) {
      debugPrint('[push] Jeton indisponible : $e');
      return null;
    }
  }

  /// Nouveau jeton (rotation par Firebase) : à renvoyer au serveur.
  static Stream<String> get jetonRenouvele =>
      // ignore: deprecated_member_use
      _actif ? FirebaseMessaging.instance.onTokenRefresh : const Stream.empty();

  /// Déconnexion : le jeton est invalidé, le téléphone ne reçoit plus les
  /// notifications de ce compte (le serveur purge le jeton au prochain envoi).
  static Future<void> supprimerJeton() async {
    if (!_actif) return;
    try {
      // ignore: deprecated_member_use
      await FirebaseMessaging.instance.deleteToken();
    } catch (e) {
      debugPrint('[push] Suppression du jeton impossible : $e');
    }
  }
}
