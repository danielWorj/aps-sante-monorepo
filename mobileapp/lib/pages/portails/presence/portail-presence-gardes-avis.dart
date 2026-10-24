// lib/pages/portails/presence/portail-presence-gardes-avis.dart
//
// Espace pharmacie — « Gardes » (gardes officielles planifiées par ApSa
// d'après le calendrier du pays, lecture seule) et « Avis » (avis publiés
// après modération, lecture seule ; un avis abusif se signale à ApSa).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/espace_presence_controller.dart';
import 'presence_commun.dart';

class PortailPresenceGardes extends ConsumerStatefulWidget {
  const PortailPresenceGardes({super.key});

  @override
  ConsumerState<PortailPresenceGardes> createState() => _PortailPresenceGardesState();
}

class _PortailPresenceGardesState extends ConsumerState<PortailPresenceGardes> {
  bool _passees = false;

  @override
  Widget build(BuildContext context) {
    final gardes = ref.watch(gardesPresenceProvider(_passees));
    return PagePresence(
      titre: 'Gardes',
      description: "Vos gardes officielles, telles qu'elles sont affichées aux patients qui cherchent une pharmacie de garde.",
      onRafraichir: () => ref.refresh(gardesPresenceProvider(_passees).future),
      children: [
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('En cours et à venir')),
            ButtonSegment(value: true, label: Text('Passées')),
          ],
          selected: {_passees},
          showSelectedIcon: false,
          onSelectionChanged: (s) => setState(() => _passees = s.first),
        ),
        const SizedBox(height: 12),
        gardes.when(
          loading: () => const ChargementPortail(),
          error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(gardesPresenceProvider(_passees))),
          data: (liste) => liste.isEmpty
              ? VidePortail(
                  icone: Icons.nightlight_outlined,
                  texte: _passees ? 'Aucune garde passée.' : 'Aucune garde en cours ou à venir dans les plannings publiés.',
                )
              : Column(children: [
                  for (final g in liste)
                    Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.card,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: g.enCours ? AppColors.primary : AppColors.line),
                      ),
                      child: Row(children: [
                        Icon(g.enCours ? Icons.nightlight_round : Icons.nightlight_outlined, color: AppColors.primary),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('${dateHeurePresence(g.debut)} → ${dateHeurePresence(g.fin)}', style: AppTextStyles.cardTitle),
                            if (g.ville != null) Text(g.ville!, style: AppTextStyles.cardMeta),
                          ]),
                        ),
                        if (g.enCours) const ApsPill('En cours'),
                      ]),
                    ),
                ]),
        ),
        const SizedBox(height: 8),
        Text('Les gardes sont planifiées par ApSa. Une garde manquante ou erronée ? Signalez-le à ApSa.', style: AppTextStyles.cardMeta),
      ],
    );
  }
}

class PortailPresenceAvis extends ConsumerWidget {
  const PortailPresenceAvis({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final avis = ref.watch(avisPresenceProvider);
    return PagePresence(
      titre: 'Avis',
      description: 'Ce que les patients disent de votre pharmacie. Chaque avis est vérifié par ApSa avant publication.',
      onRafraichir: () => ref.refresh(avisPresenceProvider.future),
      children: [
        avis.when(
          loading: () => const ChargementPortail(),
          error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(avisPresenceProvider)),
          data: (d) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              CartePortail(
                titre: 'Note',
                icone: Icons.star_outline_rounded,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      d.resume.moyenne == null ? '—' : '${d.resume.moyenne!.toStringAsFixed(1).replaceAll('.', ',')} / 5',
                      style: const TextStyle(fontFamily: AppTextStyles.fontDisplay, fontSize: 24, fontWeight: FontWeight.w700, color: AppColors.ink),
                    ),
                    Text('${d.resume.nombre} avis publié${d.resume.nombre > 1 ? 's' : ''}', style: AppTextStyles.cardMeta),
                    const SizedBox(height: 8),
                    for (final n in [5, 4, 3, 2, 1])
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Row(children: [
                          SizedBox(width: 16, child: Text('$n', style: AppTextStyles.cardMeta)),
                          Expanded(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(3),
                              child: LinearProgressIndicator(
                                value: d.resume.nombre == 0 ? 0 : (d.resume.distribution[n] ?? 0) / d.resume.nombre,
                                minHeight: 6,
                                backgroundColor: AppColors.segment,
                              ),
                            ),
                          ),
                          SizedBox(width: 28, child: Text('${d.resume.distribution[n] ?? 0}', textAlign: TextAlign.right, style: AppTextStyles.cardMeta)),
                        ]),
                      ),
                    if (d.enAttente > 0)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text('${d.enAttente} avis en cours de vérification par ApSa.', style: AppTextStyles.cardMeta),
                      ),
                  ],
                ),
              ),
              if (d.avis.isEmpty)
                const VidePortail(icone: Icons.star_outline_rounded, texte: "Aucun avis publié pour l'instant.")
              else
                for (final a in d.avis)
                  CartePortail(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Expanded(child: Text(a.auteur, style: AppTextStyles.cardTitle)),
                          Text(dateCourtePortail(a.date), style: AppTextStyles.cardMeta),
                        ]),
                        Text('${'★' * a.note}${'☆' * (5 - a.note)}', style: const TextStyle(color: AppColors.primary)),
                        if (a.commentaire != null) Text(a.commentaire!, style: AppTextStyles.body),
                      ],
                    ),
                  ),
              const SizedBox(height: 8),
              Text('Un avis abusif ou erroné ? Signalez-le à ApSa.', style: AppTextStyles.cardMeta),
            ],
          ),
        ),
      ],
    );
  }
}
