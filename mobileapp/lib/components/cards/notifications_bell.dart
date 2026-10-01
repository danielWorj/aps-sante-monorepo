// lib/components/cards/notifications_bell.dart
//
// Cloche de notifications in-app (politique de fonds v2, phase 6) — pendant
// mobile de notifications-bell.jsx. Un appui ouvre la liste ; toucher une
// notification la marque lue PUIS mène aux rendez-vous. Les erreurs sont
// silencieuses (voir NotificationController).
//
// Le widget ne fait aucun calcul : liste et compteur viennent du serveur.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../controllers/notification_controller.dart';
import '../../controllers/rendez_vous_controller.dart';
import '../../models/rendez_vous_models.dart';
import '../../utils/fonds.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';

/// Icône associée à chaque type de notification (miroir de ICONES côté web).
IconData iconeNotification(TypeNotification type) {
  switch (type) {
    case TypeNotification.rdvAReprogrammer:
      return Icons.event_busy_outlined;
    case TypeNotification.rdvReprogrammationProposee:
      return Icons.edit_calendar_outlined;
    case TypeNotification.rdvReprogrammationAcceptee:
      return Icons.event_available_outlined;
    case TypeNotification.inconnu:
      return Icons.notifications_none_outlined;
  }
}

/// Texte du compteur : « 9+ » au-delà de 9 (comme sur le web).
String libelleCompteur(int nombre) => nombre > 9 ? '9+' : '$nombre';

class NotificationsBell extends ConsumerWidget {
  /// Appelé après un appui sur une notification (une fois marquée lue) :
  /// le shell y bascule sur son onglet « Rendez-vous ».
  final VoidCallback onOuvrirRendezVous;

  const NotificationsBell({super.key, required this.onOuvrirRendezVous});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nonLues = ref.watch(notificationsNonLuesProvider);

    return Semantics(
      button: true,
      label: nonLues > 0 ? 'Notifications ($nonLues non lues)' : 'Notifications',
      child: Material(
        color: AppColors.card,
        shape: const CircleBorder(side: BorderSide(color: AppColors.line)),
        elevation: 1,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => _ouvrirListe(context, ref),
          child: SizedBox(
            width: 40,
            height: 40,
            child: Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.center,
              children: [
                const Icon(
                  Icons.notifications_none_outlined,
                  size: 22,
                  color: AppColors.ink,
                ),
                if (nonLues > 0)
                  Positioned(
                    top: -3,
                    right: -3,
                    child: Container(
                      constraints:
                          const BoxConstraints(minWidth: 17, minHeight: 17),
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AppColors.danger,
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: Text(
                        libelleCompteur(nonLues),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w700,
                          height: 1,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _ouvrirListe(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      // Coins carrés, comme les dialogues de l'application.
      shape: const RoundedRectangleBorder(),
      builder: (feuille) => _FeuilleNotifications(
        onOuvrir: (notification) {
          Navigator.of(feuille).pop();
          _marquerEtAllerAuxRendezVous(ref, notification);
        },
      ),
    );
  }

  /// Marque la notification lue (optimiste, sans attendre : l'échec éventuel
  /// est silencieux et rattrapé au prochain cycle de polling), rafraîchit la
  /// liste des RDV (la notification annonce un changement) puis navigue.
  void _marquerEtAllerAuxRendezVous(WidgetRef ref, NotificationApp notification) {
    // ignore: unawaited_futures
    ref.read(notificationControllerProvider.notifier).marquerLue(notification);
    // Sans effet si aucun token n'a encore été défini côté liste de RDV.
    // ignore: unawaited_futures
    ref.read(listeRendezVousControllerProvider.notifier).rafraichir();
    onOuvrirRendezVous();
  }
}

/// Contenu de la feuille : en-tête + « Tout marquer comme lu » + liste.
class _FeuilleNotifications extends ConsumerWidget {
  final void Function(NotificationApp) onOuvrir;

  const _FeuilleNotifications({required this.onOuvrir});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final etat = ref.watch(notificationControllerProvider);
    final hauteurMax = MediaQuery.of(context).size.height * 0.7;

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: hauteurMax),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 10, 8),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Notifications',
                      style: TextStyle(
                        fontFamily: AppTextStyles.fontDisplay,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                  ),
                  if (etat.nonLues > 0)
                    TextButton(
                      onPressed: () => ref
                          .read(notificationControllerProvider.notifier)
                          .marquerToutesLues(),
                      child: const Text(
                        'Tout marquer comme lu',
                        style: TextStyle(
                          fontFamily: AppTextStyles.fontDisplay,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const Divider(height: 1, color: AppColors.line),
            if (etat.notifications.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 18, vertical: 28),
                child: Text(
                  'Aucune notification.',
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontBody,
                    fontSize: 13,
                    color: AppColors.inkSoft,
                  ),
                ),
              )
            else
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: etat.notifications.length,
                  separatorBuilder: (_, __) =>
                      const Divider(height: 1, color: AppColors.line),
                  itemBuilder: (_, i) => _LigneNotification(
                    notification: etat.notifications[i],
                    onTap: () => onOuvrir(etat.notifications[i]),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _LigneNotification extends StatelessWidget {
  final NotificationApp notification;
  final VoidCallback onTap;

  const _LigneNotification({required this.notification, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final lue = notification.estLue;

    return InkWell(
      onTap: onTap,
      child: Container(
        color: lue ? Colors.transparent : AppColors.primarySurface,
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Icon(
                iconeNotification(notification.type),
                size: 20,
                color: lue ? AppColors.inkFaint : AppColors.primary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    notification.titre,
                    style: TextStyle(
                      fontFamily: AppTextStyles.fontDisplay,
                      fontSize: 13,
                      fontWeight: lue ? FontWeight.w500 : FontWeight.w700,
                      color: AppColors.ink,
                    ),
                  ),
                  if (notification.message.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      notification.message,
                      style: const TextStyle(
                        fontFamily: AppTextStyles.fontBody,
                        fontSize: 12,
                        height: 1.35,
                        color: AppColors.inkSoft,
                      ),
                    ),
                  ],
                  if (notification.dateCreation != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      dateCourte(notification.dateCreation),
                      style: const TextStyle(
                        fontFamily: AppTextStyles.fontBody,
                        fontSize: 11,
                        color: AppColors.inkFaint,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}