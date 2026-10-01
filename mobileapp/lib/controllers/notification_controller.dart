// lib/controllers/notification_controller.dart
//
// Notifications in-app (politique de fonds v2, phase 6). Reproduit le
// comportement de notifications-bell.jsx côté web :
//   - interrogation toutes les 60 s ;
//   - en pause quand l'application passe en arrière-plan (équivalent de
//     `document.hidden`), reprise + rechargement immédiat au retour ;
//   - erreurs SILENCIEUSES : une panne de notifications ne doit jamais gêner
//     le portail (l'état précédent est conservé) ;
//   - mises à jour optimistes du compteur (clic = lue tout de suite).
//
// Notifier synchrone (et non AsyncNotifier) : aucun état de chargement ni
// d'erreur n'est affiché à l'utilisateur.
//
// Le token passe par [SessionController.appelAuthentifie] : un polling long
// doit survivre à l'expiration de l'access token (refresh automatique).
// Le polling démarre à la connexion et s'arrête (état vidé) à la déconnexion.

import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/rendez_vous_models.dart';
import '../repositories/notification_repository.dart';
import 'authentification_controller.dart';

/// Intervalle d'interrogation (identique au web).
const Duration intervalleNotifications = Duration(seconds: 60);

/// Nombre de notifications chargées dans la liste (identique au web).
const int limiteNotifications = 30;

final notificationRepositoryProvider = Provider<NotificationRepository>((ref) {
  return NotificationRepository();
});

/// Liste affichée + compteur GLOBAL de non lues renvoyé par le serveur.
class EtatNotifications {
  final List<NotificationApp> notifications;
  final int nonLues;

  const EtatNotifications({required this.notifications, required this.nonLues});

  const EtatNotifications.vide()
      : notifications = const [],
        nonLues = 0;

  EtatNotifications copyWith({
    List<NotificationApp>? notifications,
    int? nonLues,
  }) {
    return EtatNotifications(
      notifications: notifications ?? this.notifications,
      nonLues: nonLues ?? this.nonLues,
    );
  }
}

class NotificationController extends Notifier<EtatNotifications>
    with WidgetsBindingObserver {
  Timer? _minuteur;
  bool _chargementEnCours = false;

  /// Incrémenté à chaque mise à jour optimiste : une réponse de polling
  /// partie AVANT la modification est ignorée (sinon elle écraserait le
  /// compteur à jour avec une valeur périmée).
  int _version = 0;

  @override
  EtatNotifications build() {
    // On ne suit que « connecté / déconnecté » (et non le token) : un refresh
    // d'access token ne doit pas relancer le polling.
    final connecte = ref.watch(estConnecteProvider);

    WidgetsBinding.instance.addObserver(this);
    ref.onDispose(() {
      _arreterMinuteur();
      WidgetsBinding.instance.removeObserver(this);
    });

    if (!connecte) return const EtatNotifications.vide();

    _demarrerMinuteur();
    // Premier chargement hors de build() (on ne modifie pas l'état dedans).
    Future.microtask(charger);
    return const EtatNotifications.vide();
  }

  // ─── Cycle de vie : pause en arrière-plan ───────────────────────────

  @override
  void didChangeAppLifecycleState(AppLifecycleState etat) {
    switch (etat) {
      case AppLifecycleState.resumed:
        if (ref.read(estConnecteProvider)) {
          _demarrerMinuteur();
          charger();
        }
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
        _arreterMinuteur();
      case AppLifecycleState.inactive:
        // Transitoire (volet système, dialogue natif Stripe…) : on ne
        // coupe pas le polling pour si peu.
        break;
    }
  }

  void _demarrerMinuteur() {
    _minuteur?.cancel();
    _minuteur = Timer.periodic(intervalleNotifications, (_) => charger());
  }

  void _arreterMinuteur() {
    _minuteur?.cancel();
    _minuteur = null;
  }

  // ─── Chargement ─────────────────────────────────────────────────────

  /// Recharge la liste et le compteur. N'échoue jamais : en cas d'erreur
  /// (réseau, 401 après refresh raté, 500…), l'état courant est conservé.
  Future<void> charger() async {
    if (_chargementEnCours || !ref.mounted) return;
    if (!ref.read(estConnecteProvider)) return;

    _chargementEnCours = true;
    final versionAuDepart = _version;
    try {
      final reponse = await ref
          .read(sessionControllerProvider.notifier)
          .appelAuthentifie(
            (token) => ref.read(notificationRepositoryProvider).lister(
                  token: token,
                  limite: limiteNotifications,
                ),
          );
      if (!ref.mounted || versionAuDepart != _version) return;
      state = EtatNotifications(
        notifications: reponse.notifications,
        nonLues: reponse.nonLues,
      );
    } catch (_) {
      // Silencieux : voir l'en-tête du fichier.
    } finally {
      _chargementEnCours = false;
    }
  }

  // ─── Actions (optimistes) ───────────────────────────────────────────

  /// Marque une notification comme lue : compteur et liste mis à jour tout
  /// de suite, puis appel serveur. Un échec est ignoré (idempotent, le
  /// prochain cycle de polling resynchronise).
  Future<void> marquerLue(NotificationApp notification) async {
    if (notification.estLue) return;

    _version++;
    final maintenant = DateTime.now();
    state = state.copyWith(
      notifications: [
        for (final n in state.notifications)
          n.notificationId == notification.notificationId
              ? n.copyWith(lueLe: maintenant)
              : n,
      ],
      nonLues: state.nonLues > 0 ? state.nonLues - 1 : 0,
    );

    try {
      await ref.read(sessionControllerProvider.notifier).appelAuthentifie(
            (token) => ref
                .read(notificationRepositoryProvider)
                .marquerLue(notification.notificationId, token: token),
          );
    } catch (_) {
      // Ignoré : rechargé au prochain cycle.
    }
  }

  /// Marque toutes les notifications comme lues (optimiste), puis
  /// resynchronise avec le serveur dans tous les cas.
  Future<void> marquerToutesLues() async {
    if (state.nonLues == 0 && state.notifications.every((n) => n.estLue)) {
      return;
    }

    _version++;
    final maintenant = DateTime.now();
    state = EtatNotifications(
      notifications: [
        for (final n in state.notifications)
          n.estLue ? n : n.copyWith(lueLe: maintenant),
      ],
      nonLues: 0,
    );

    try {
      await ref.read(sessionControllerProvider.notifier).appelAuthentifie(
            (token) => ref
                .read(notificationRepositoryProvider)
                .marquerToutesLues(token: token),
          );
    } catch (_) {
      // Ignoré : le rechargement ci-dessous rétablit l'état réel.
    }
    await charger();
  }
}

final notificationControllerProvider =
    NotifierProvider<NotificationController, EtatNotifications>(
  NotificationController.new,
);

/// Nombre de notifications non lues (pour les badges).
final notificationsNonLuesProvider = Provider<int>((ref) {
  return ref.watch(notificationControllerProvider.select((e) => e.nonLues));
});