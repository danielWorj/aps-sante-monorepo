// lib/pages/portails/presence/portail-presence-messages.dart
//
// Espaces pharmacie et centre de santé — « Messages » : messages reçus par
// le formulaire de contact de la fiche publique (ouvert quand l'abonnement
// inclut le contact direct). Ouvrir un message le marque lu ; l'agent répond
// par e-mail ou par téléphone avec ses propres outils, puis l'archive.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../components/components.dart';
import '../../../controllers/espace_presence_controller.dart';
import '../../../models/espace_presence_models.dart';
import 'presence_commun.dart';

class PortailPresenceMessages extends ConsumerStatefulWidget {
  const PortailPresenceMessages({super.key, required this.type});

  final TypeEspacePresence type;

  @override
  ConsumerState<PortailPresenceMessages> createState() => _PortailPresenceMessagesState();
}

class _PortailPresenceMessagesState extends ConsumerState<PortailPresenceMessages> {
  /// null = boîte de réception (tous sauf archivés).
  String? _statut;

  void _rafraichir() {
    ref.invalidate(messagesPresenceProvider);
    ref.invalidate(messagesNonLusPresenceProvider(widget.type));
  }

  Future<void> _changer(MessagePresence m, String statut) async {
    try {
      await appelPresenceUi(ref, (repo, token) => repo.changerStatutMessage(m.id, statut, token: token));
      _rafraichir();
      if (statut == 'archive' && mounted) snackPortail(context, 'Message archivé.');
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    }
  }

  Future<void> _ouvrir(MessagePresence m, String nomFiche) async {
    if (m.nonLu) _changer(m, 'lu');
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (c) => _FeuilleMessage(
        message: m,
        nomFiche: nomFiche,
        onStatut: (statut) {
          Navigator.pop(c);
          _changer(m, statut);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cle = (type: widget.type, statut: _statut);
    final messages = ref.watch(messagesPresenceProvider(cle));
    final fiche = ref.watch(maFichePresenceProvider(widget.type)).value;
    return Container(
      color: AppColors.paper,
      child: RefreshIndicator(
        onRefresh: () {
          ref.invalidate(messagesNonLusPresenceProvider(widget.type));
          return ref.refresh(messagesPresenceProvider(cle).future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
          children: [
            EnTetePresence(type: widget.type),
            const EnTetePortail(titre: 'Messages', description: 'Les messages envoyés par les visiteurs depuis votre fiche publique.'),
            if (fiche != null)
              BandeauMasque(
                visible: fiche.droits.contactDirect,
                texte: "Le formulaire de contact de votre fiche est fermé : votre abonnement n'inclut pas le contact direct. Les messages déjà reçus restent consultables.",
              ),
            SegmentedButton<String?>(
              segments: const [
                ButtonSegment(value: null, label: Text('Réception')),
                ButtonSegment(value: 'non_lu', label: Text('Non lus')),
                ButtonSegment(value: 'archive', label: Text('Archivés')),
              ],
              selected: {_statut},
              showSelectedIcon: false,
              onSelectionChanged: (s) => setState(() => _statut = s.first),
            ),
            const SizedBox(height: 12),
            messages.when(
              loading: () => const ChargementPortail(),
              error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(messagesPresenceProvider(cle))),
              data: (d) => d.messages.isEmpty
                  ? const VidePortail(icone: Icons.drafts_outlined, texte: 'Aucun message ici.')
                  : Column(children: [
                      for (final m in d.messages)
                        Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          decoration: BoxDecoration(
                            color: AppColors.card,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: m.nonLu ? AppColors.primary : AppColors.line),
                          ),
                          child: ListTile(
                            onTap: () => _ouvrir(m, fiche?.nom ?? ''),
                            leading: Icon(m.nonLu ? Icons.mark_email_unread_outlined : Icons.drafts_outlined,
                                color: m.nonLu ? AppColors.primary : AppColors.inkFaint),
                            title: Text(m.expediteur,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppTextStyles.cardTitle.copyWith(fontWeight: m.nonLu ? FontWeight.w700 : FontWeight.w500)),
                            subtitle: Text(m.contenu, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppTextStyles.cardMeta),
                            trailing: Text(dateHeurePresence(m.date), style: AppTextStyles.cardMeta),
                          ),
                        ),
                    ]),
            ),
            const SizedBox(height: 8),
            Text(
              "Répondez depuis votre propre messagerie. N'échangez jamais d'informations médicales sensibles par e-mail sans l'accord du patient.",
              style: AppTextStyles.cardMeta,
            ),
          ],
        ),
      ),
    );
  }
}

class _FeuilleMessage extends StatelessWidget {
  const _FeuilleMessage({required this.message, required this.nomFiche, required this.onStatut});

  final MessagePresence message;
  final String nomFiche;
  final ValueChanged<String> onStatut;

  Future<void> _lancer(BuildContext context, Uri uri) async {
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && context.mounted) {
      snackPortail(context, "Aucune application disponible pour cette action.");
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = message;
    final reponse = Uri(
      scheme: 'mailto',
      path: m.email,
      query: 'subject=${Uri.encodeComponent('Réponse de $nomFiche à votre message')}'
          '&body=${Uri.encodeComponent('\n\n---\nVotre message du ${dateHeurePresence(m.date)} :\n${m.contenu}')}',
    );
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(m.expediteur, style: AppTextStyles.h3),
            Text('${dateHeurePresence(m.date)}${m.compteAps ? ' · compte ApSa' : ''}', style: AppTextStyles.cardMeta),
            const SizedBox(height: 12),
            SelectableText(m.contenu, style: AppTextStyles.body),
            const SizedBox(height: 12),
            SelectableText(m.email, style: AppTextStyles.cardMeta),
            if (m.telephone != null) SelectableText(m.telephone!, style: AppTextStyles.cardMeta),
            const SizedBox(height: 14),
            FilledButton.icon(onPressed: () => _lancer(context, reponse), icon: const Icon(Icons.reply_rounded), label: const Text('Répondre par e-mail')),
            if (m.telephone != null)
              OutlinedButton.icon(
                onPressed: () => _lancer(context, Uri(scheme: 'tel', path: m.telephone!.replaceAll(' ', ''))),
                icon: const Icon(Icons.call_outlined),
                label: const Text('Appeler'),
              ),
            const SizedBox(height: 6),
            Row(children: [
              if (m.statut != 'archive')
                Expanded(child: TextButton.icon(onPressed: () => onStatut('archive'), icon: const Icon(Icons.archive_outlined), label: const Text('Archiver')))
              else
                Expanded(child: TextButton.icon(onPressed: () => onStatut('lu'), icon: const Icon(Icons.inbox_outlined), label: const Text('Remettre'))),
              Expanded(
                child: TextButton.icon(onPressed: () => onStatut('non_lu'), icon: const Icon(Icons.mark_email_unread_outlined), label: const Text('Non lu')),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}
