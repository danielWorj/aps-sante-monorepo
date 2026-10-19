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

import '../../controllers/reputation_medecin_controller.dart';
import '../../controllers/notification_controller.dart';
import '../../controllers/offre_rdv_controller.dart';
import '../../controllers/rendez_vous_controller.dart';
import '../../models/rendez_vous_models.dart';
import '../../utils/fonds.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';
import '../ui/aps_ui.dart';

/// Icône associée à chaque type de notification (miroir de ICONES côté web).
IconData iconeNotification(TypeNotification type) {
  switch (type) {
    case TypeNotification.rdvAReprogrammer:
      return Icons.event_busy_outlined;
    case TypeNotification.rdvReprogrammationProposee:
      return Icons.edit_calendar_outlined;
    case TypeNotification.rdvReprogrammationAcceptee:
      return Icons.event_available_outlined;
    case TypeNotification.rdvPaye:
      return Icons.check_circle_outline;
    case TypeNotification.rdvAccepte:
      return Icons.location_on_outlined;
    case TypeNotification.offreRdvNouvelle:
      return Icons.campaign_outlined;
    case TypeNotification.offreRdvReponse:
      return Icons.person_search_outlined;
    case TypeNotification.offreRdvExpiree:
      return Icons.hourglass_bottom_outlined;
    case TypeNotification.miseEnRelationRecue:
      return Icons.inbox_outlined;
    case TypeNotification.abonnementAssuranceActive:
      return Icons.verified_outlined;
    case TypeNotification.abonnementAssuranceEcheance:
      return Icons.hourglass_top_outlined;
    case TypeNotification.avisMedecinInvitation:
      return Icons.star_outline_rounded;
    case TypeNotification.avisMedecinPublie:
      return Icons.reviews_outlined;
    case TypeNotification.avisMedecinReponse:
      return Icons.reply_rounded;
    case TypeNotification.inconnu:
      return Icons.notifications_none_outlined;
  }
}

/// Teinte de la tuile d'icône selon le type (vert = RDV, violet = demande
/// express, ambre = attente / échéance, bleu = assurance).
ApsTone _teinteNotification(TypeNotification type) {
  switch (type) {
    case TypeNotification.offreRdvNouvelle:
    case TypeNotification.offreRdvReponse:
    case TypeNotification.miseEnRelationRecue:
      return ApsTone.violet;
    case TypeNotification.rdvAReprogrammer:
    case TypeNotification.offreRdvExpiree:
    case TypeNotification.abonnementAssuranceEcheance:
      return ApsTone.amber;
    case TypeNotification.abonnementAssuranceActive:
      return ApsTone.sky;
    case TypeNotification.avisMedecinInvitation:
    case TypeNotification.avisMedecinPublie:
    case TypeNotification.avisMedecinReponse:
      return ApsTone.amber;
    default:
      return ApsTone.green;
  }
}

bool _estNotificationDemande(TypeNotification type) =>
    type == TypeNotification.miseEnRelationRecue ||
    type == TypeNotification.offreRdvNouvelle ||
    type == TypeNotification.offreRdvReponse ||
    type == TypeNotification.offreRdvExpiree;

/// Texte du compteur : « 9+ » au-delà de 9 (comme sur le web).
String libelleCompteur(int nombre) => nombre > 9 ? '9+' : '$nombre';

class NotificationsBell extends ConsumerWidget {
  /// Appelé après un appui sur une notification (une fois marquée lue) :
  /// le shell y bascule sur son onglet « Rendez-vous ».
  final VoidCallback onOuvrirRendezVous;

  /// Appelé à la place de [onOuvrirRendezVous] pour une notification de RDV
  /// aléatoire (demande / réponse / expiration) : le shell bascule sur son
  /// onglet des demandes. Sans ce rappel, on reste sur « Rendez-vous ».
  final VoidCallback? onOuvrirDemandes;

  /// Appelé pour une notification d'avis publié (espace médecin) : le shell
  /// ouvre l'onglet « Activité » sur la vue des avis. Sans ce rappel, on
  /// reste sur « Rendez-vous » (patient : les consultations à noter y sont).
  final VoidCallback? onOuvrirAvis;

  const NotificationsBell({
    super.key,
    required this.onOuvrirRendezVous,
    this.onOuvrirDemandes,
    this.onOuvrirAvis,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nonLues = ref.watch(notificationsNonLuesProvider);

    return Semantics(
      button: true,
      label: nonLues > 0 ? 'Notifications ($nonLues non lues)' : 'Notifications',
      child: SizedBox(
        width: 42,
        height: 42,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            ApsIconButton(
              icon: Icons.notifications_none_rounded,
              onPressed: () => _ouvrirListe(context, ref),
            ),
            if (nonLues > 0)
              Positioned(
                top: -4,
                right: -4,
                child: IgnorePointer(
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.coral500,
                      borderRadius: BorderRadius.circular(99),
                      border: Border.all(color: AppColors.bg, width: 2),
                    ),
                    child: Text(
                      libelleCompteur(nonLues),
                      style: const TextStyle(
                        fontFamily: AppTextStyles.fontSans,
                        color: Colors.white,
                        fontSize: 9.5,
                        fontWeight: FontWeight.w800,
                        height: 1,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  void _ouvrirListe(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
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
    if (_estNotificationDemande(notification.type)) {
      ref.invalidate(mesOffresRdvProvider);
      ref.invalidate(offresRdvMedecinProvider);
      (onOuvrirDemandes ?? onOuvrirRendezVous)();
      return;
    }
    if (notification.type == TypeNotification.avisMedecinPublie && onOuvrirAvis != null) {
      onOuvrirAvis!();
      return;
    }
    if (notification.type == TypeNotification.avisMedecinInvitation) {
      ref.invalidate(consultationsANoterProvider);
    }
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
            Center(
              child: Container(
                width: 42,
                height: 5,
                margin: const EdgeInsets.only(top: 10, bottom: 8),
                decoration: BoxDecoration(
                  color: AppColors.lineStrong,
                  borderRadius: BorderRadius.circular(5),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 4, 10, 6),
              child: Row(
                children: [
                  Expanded(child: Text('Notifications', style: AppTextStyles.m)),
                  if (etat.nonLues > 0)
                    TextButton(
                      onPressed: () => ref
                          .read(notificationControllerProvider.notifier)
                          .marquerToutesLues(),
                      child: const Text('Tout lire'),
                    ),
                ],
              ),
            ),
            if (etat.notifications.isEmpty)
              const ApsEmptyState(
                icon: Icons.notifications_none_rounded,
                tone: ApsTone.neutral,
                title: 'Aucune notification',
                message: 'Vos rendez-vous, paiements et demandes apparaîtront ici.',
              )
            else
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  padding: const EdgeInsets.fromLTRB(0, 4, 0, 12),
                  itemCount: etat.notifications.length,
                  separatorBuilder: (_, _) => const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 18),
                    child: Divider(height: 1, color: AppColors.line),
                  ),
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
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ApsIconTile(
              iconeNotification(notification.type),
              tone: lue ? ApsTone.neutral : _teinteNotification(notification.type),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    notification.titre,
                    style: AppTextStyles.strong.copyWith(
                      fontSize: 13,
                      fontWeight: lue ? FontWeight.w600 : FontWeight.w800,
                    ),
                  ),
                  if (notification.message.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(notification.message, style: AppTextStyles.small.copyWith(fontSize: 12)),
                  ],
                  if (notification.dateCreation != null) ...[
                    const SizedBox(height: 4),
                    Text(dateCourte(notification.dateCreation), style: AppTextStyles.xs),
                  ],
                ],
              ),
            ),
            if (!lue)
              Container(
                width: 8,
                height: 8,
                margin: const EdgeInsets.only(top: 6, left: 8),
                decoration: const BoxDecoration(
                  color: AppColors.coral500,
                  shape: BoxShape.circle,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
