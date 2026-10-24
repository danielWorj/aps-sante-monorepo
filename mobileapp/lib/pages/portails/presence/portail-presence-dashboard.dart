// lib/pages/portails/presence/portail-presence-dashboard.dart
//
// Espaces pharmacie et centre de santé — « Accueil » (tableau de bord) :
// ouverture en ce moment, messages non lus, consultations de la fiche (selon
// l'abonnement), gardes et avis (pharmacie), prestations (centre), abonnement,
// contenus et complétude de la fiche. Calculé par le serveur
// (GET /:base/:id/tableau-de-bord).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/espace_presence_controller.dart';
import '../../../models/espace_presence_models.dart';
import 'portail-presence-plus.dart' show ouvrirRubriquePresence;
import 'presence_commun.dart';

const _libellesAbonnement = {
  'actif': 'Abonnement actif',
  'gratuite': 'Offre de lancement',
  'grace': 'Abonnement échu (période de grâce)',
  'aucun': 'Présence minimale (sans abonnement)',
  'non_requis': 'Sans abonnement',
};

class PortailPresenceDashboard extends ConsumerStatefulWidget {
  const PortailPresenceDashboard({super.key, required this.type, required this.onOuvrirOnglet});

  final TypeEspacePresence type;

  /// 1 = Ma fiche, 2 = Horaires, 3 = Messages, 4 = Plus.
  final ValueChanged<int> onOuvrirOnglet;

  @override
  ConsumerState<PortailPresenceDashboard> createState() => _PortailPresenceDashboardState();
}

class _PortailPresenceDashboardState extends ConsumerState<PortailPresenceDashboard> {
  int _jours = 30;

  @override
  Widget build(BuildContext context) {
    final cle = (type: widget.type, jours: _jours);
    final tableau = ref.watch(tableauDeBordPresenceProvider(cle));
    return Container(
      color: AppColors.paper,
      child: RefreshIndicator(
        onRefresh: () {
          ref.invalidate(maFichePresenceProvider(widget.type));
          return ref.refresh(tableauDeBordPresenceProvider(cle).future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
          children: [
            EnTetePresence(type: widget.type),
            const SizedBox(height: 8),
            Row(
              children: [
                const Expanded(child: Text('Tableau de bord', style: AppTextStyles.h3)),
                SegmentedButton<int>(
                  segments: const [
                    ButtonSegment(value: 7, label: Text('7 j')),
                    ButtonSegment(value: 30, label: Text('30 j')),
                    ButtonSegment(value: 90, label: Text('90 j')),
                  ],
                  selected: {_jours},
                  showSelectedIcon: false,
                  style: const ButtonStyle(visualDensity: VisualDensity.compact),
                  onSelectionChanged: (s) => setState(() => _jours = s.first),
                ),
              ],
            ),
            const SizedBox(height: 10),
            tableau.when(
              loading: () => const ChargementPortail(),
              error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(tableauDeBordPresenceProvider(cle))),
              data: (d) => _Contenu(type: widget.type, d: d, onOuvrirOnglet: widget.onOuvrirOnglet),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tuile extends StatelessWidget {
  const _Tuile({required this.icone, required this.valeur, required this.libelle, this.onTap});

  final IconData icone;
  final String valeur;
  final String libelle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.line)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icone, size: 18, color: AppColors.primary),
              const SizedBox(height: 4),
              Text(valeur,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontFamily: AppTextStyles.fontDisplay, fontSize: 19, fontWeight: FontWeight.w700, color: AppColors.ink)),
              Text(libelle, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppTextStyles.cardMeta),
            ],
          ),
        ),
      );
}

class _Contenu extends StatelessWidget {
  const _Contenu({required this.type, required this.d, required this.onOuvrirOnglet});

  final TypeEspacePresence type;
  final TableauDeBordPresence d;
  final ValueChanged<int> onOuvrirOnglet;

  void _rubrique(BuildContext context, String rubrique) {
    switch (rubrique) {
      case 'fiche':
      case 'presentation':
        onOuvrirOnglet(1);
      case 'horaires':
        onOuvrirOnglet(2);
      default:
        ouvrirRubriquePresence(context, type, rubrique);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pharmacie = type == TypeEspacePresence.pharmacie;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        BandeauFicheHorsLigne(statut: d.statut, enLigne: d.enLigne),
        if (d.enGrace)
          const BandeauPortail(
            icone: Icons.warning_amber_outlined,
            texte: 'Votre abonnement a expiré : vos contenus enrichis sont masqués au public. Renouvelez-le depuis « Plus › Abonnement ».',
          ),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.55,
          children: [
            _Tuile(
              icone: Icons.schedule_outlined,
              valeur: d.ouverture == null ? '—' : (d.ouverture!.ouvert ? 'Ouvert' : 'Fermé'),
              libelle: d.ouverture?.libelle ?? 'Horaires non renseignés',
              onTap: () => onOuvrirOnglet(2),
            ),
            _Tuile(
              icone: Icons.mail_outline_rounded,
              valeur: nombreLaboratoire(d.messagesNonLus),
              libelle: d.messagesNonLus > 1 ? 'Messages non lus' : 'Message non lu',
              onTap: () => onOuvrirOnglet(3),
            ),
            _Tuile(
              icone: Icons.visibility_outlined,
              valeur: d.vuesDisponibles ? nombreLaboratoire(d.vuesPeriode) : '—',
              libelle: d.vuesDisponibles ? 'Vues de la fiche (${d.jours} j)' : 'Statistiques non incluses',
              onTap: d.vuesDisponibles ? null : () => ouvrirRubriquePresence(context, type, 'abonnement'),
            ),
            pharmacie
                ? _Tuile(
                    icone: Icons.star_outline_rounded,
                    valeur: d.avis?.moyenne == null ? '—' : d.avis!.moyenne!.toStringAsFixed(1).replaceAll('.', ','),
                    libelle: 'Note · ${d.avis?.nombre ?? 0} avis',
                    onTap: () => ouvrirRubriquePresence(context, type, 'avis'),
                  )
                : _Tuile(
                    icone: Icons.receipt_long_outlined,
                    valeur: nombreLaboratoire(d.prestations),
                    libelle: 'Prestations renseignées',
                    onTap: () => ouvrirRubriquePresence(context, type, 'prestations'),
                  ),
          ],
        ),
        const SizedBox(height: 12),
        if (pharmacie) _CarteGardes(d: d, onVoir: () => ouvrirRubriquePresence(context, type, 'gardes')),
        CartePortail(
          titre: 'Derniers messages',
          icone: Icons.mail_outline_rounded,
          action: TextButton(onPressed: () => onOuvrirOnglet(3), child: const Text('Tout voir')),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (d.derniersMessages.isEmpty)
                const Text('Aucun message reçu.', style: AppTextStyles.cardMeta)
              else
                for (final m in d.derniersMessages)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(children: [
                      if (m.nonLu) const Padding(padding: EdgeInsets.only(right: 6), child: Icon(Icons.circle, size: 8, color: AppColors.primary)),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(m.expediteur, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppTextStyles.cardTitle),
                          Text(m.contenu, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppTextStyles.cardMeta),
                        ]),
                      ),
                      Text(dateHeurePresence(m.date), style: AppTextStyles.cardMeta),
                    ]),
                  ),
              const SizedBox(height: 4),
              Text('${d.messagesRecus30j} message(s) ces 30 derniers jours.', style: AppTextStyles.cardMeta),
              if (!d.droits.contactDirect)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text("Formulaire de contact fermé : votre abonnement n'inclut pas le contact direct.", style: AppTextStyles.cardMeta),
                ),
            ],
          ),
        ),
        CartePortail(
          titre: 'Consultations de la fiche',
          icone: Icons.bar_chart_rounded,
          child: !d.vuesDisponibles
              ? Text(
                  'Les statistiques sont incluses avec un abonnement de présence. Les consultations sont déjà comptées : '
                  'elles s\'afficheront dès la souscription.',
                  style: AppTextStyles.cardMeta,
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (d.serieVues.isNotEmpty) _Barres(serie: d.serieVues),
                    const SizedBox(height: 8),
                    Text('7 derniers jours : ${nombreLaboratoire(d.vuesSeptJours)} vue(s)', style: AppTextStyles.body),
                    Text('${d.jours} derniers jours : ${nombreLaboratoire(d.vuesPeriode)} vue(s)', style: AppTextStyles.body),
                    Text('Depuis le début : ${nombreLaboratoire(d.vuesTotal)} vue(s)', style: AppTextStyles.cardMeta),
                  ],
                ),
        ),
        CartePortail(
          titre: 'Abonnement',
          icone: Icons.workspace_premium_outlined,
          action: TextButton(onPressed: () => ouvrirRubriquePresence(context, type, 'abonnement'), child: const Text('Gérer')),
          child: Text(
            '${_libellesAbonnement[d.statutAbonnement] ?? d.statutAbonnement}'
            '${d.statutAbonnement == 'actif' && d.joursRestants != null ? ' · encore ${d.joursRestants} jour(s)' : ''}',
            style: AppTextStyles.body,
          ),
        ),
        if (pharmacie && d.avis != null) _CarteAvis(d: d, onVoir: () => ouvrirRubriquePresence(context, type, 'avis')),
        CartePortail(
          titre: 'Contenus de la fiche',
          icone: Icons.layers_outlined,
          child: Column(children: [
            _Ligne(
              libelle: 'Photos',
              valeur: '${d.photos} (${d.photosVisibles} visible${d.photosVisibles > 1 ? 's' : ''})',
              onTap: () => ouvrirRubriquePresence(context, type, 'photos'),
            ),
            _Ligne(
              libelle: 'Actualités',
              valeur: '${d.actualites} (${d.actualitesEnLigne} en ligne)',
              onTap: () => ouvrirRubriquePresence(context, type, 'actualites'),
            ),
            if (!pharmacie) _Ligne(libelle: 'Prestations', valeur: '${d.prestations}', onTap: () => ouvrirRubriquePresence(context, type, 'prestations')),
          ]),
        ),
        CartePortail(
          titre: 'Complétude de la fiche · ${d.completude} %',
          icone: Icons.checklist_outlined,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(value: d.completude / 100, minHeight: 6, backgroundColor: AppColors.segment),
              ),
              const SizedBox(height: 8),
              for (final e in d.elementsCompletude)
                InkWell(
                  onTap: e.ok ? null : () => _rubrique(context, e.rubrique),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(children: [
                      Icon(e.ok ? Icons.check_circle : Icons.radio_button_unchecked, size: 16, color: e.ok ? AppColors.success : AppColors.inkFaint),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(e.libelle,
                            style: e.ok ? AppTextStyles.body : AppTextStyles.body.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600)),
                      ),
                      if (!e.ok) const Icon(Icons.chevron_right, size: 16, color: AppColors.inkFaint),
                    ]),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Ligne extends StatelessWidget {
  const _Ligne({required this.libelle, required this.valeur, required this.onTap});

  final String libelle;
  final String valeur;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(children: [
            Expanded(child: Text(libelle, style: AppTextStyles.body)),
            Text(valeur, style: AppTextStyles.cardMeta),
            const Icon(Icons.chevron_right, size: 16, color: AppColors.inkFaint),
          ]),
        ),
      );
}

String _plage(GardePresence g) => '${dateHeurePresence(g.debut)} → ${dateHeurePresence(g.fin)}${g.ville == null ? '' : ' · ${g.ville}'}';

class _CarteGardes extends StatelessWidget {
  const _CarteGardes({required this.d, required this.onVoir});

  final TableauDeBordPresence d;
  final VoidCallback onVoir;

  @override
  Widget build(BuildContext context) => CartePortail(
        titre: 'Gardes',
        icone: Icons.nightlight_outlined,
        action: TextButton(onPressed: onVoir, child: const Text('Calendrier')),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (d.gardeEnCours != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text('Vous êtes de garde jusqu\'au ${dateHeurePresence(d.gardeEnCours!.fin)}.',
                    style: AppTextStyles.body.copyWith(fontWeight: FontWeight.w600, color: AppColors.primary)),
              ),
            if (d.prochainesGardes.isEmpty)
              const Text('Aucune garde à venir dans les plannings publiés.', style: AppTextStyles.cardMeta)
            else
              for (final g in d.prochainesGardes) Text(_plage(g), style: AppTextStyles.body),
          ],
        ),
      );
}

class _CarteAvis extends StatelessWidget {
  const _CarteAvis({required this.d, required this.onVoir});

  final TableauDeBordPresence d;
  final VoidCallback onVoir;

  @override
  Widget build(BuildContext context) => CartePortail(
        titre: 'Avis',
        icone: Icons.star_half_rounded,
        action: TextButton(onPressed: onVoir, child: const Text('Tout voir')),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (d.avisEnAttente > 0) Text('${d.avisEnAttente} avis en cours de vérification par ApSa.', style: AppTextStyles.cardMeta),
            if (d.derniersAvis.isEmpty)
              const Text('Aucun avis publié pour l\'instant.', style: AppTextStyles.cardMeta)
            else
              for (final a in d.derniersAvis)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${'★' * a.note}${'☆' * (5 - a.note)}  ${a.auteur}', style: AppTextStyles.cardTitle),
                    if (a.commentaire != null) Text(a.commentaire!, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppTextStyles.cardMeta),
                  ]),
                ),
          ],
        ),
      );
}

/// Histogramme compact des vues jour par jour.
class _Barres extends StatelessWidget {
  const _Barres({required this.serie});

  final List<PointVues> serie;

  @override
  Widget build(BuildContext context) {
    final max = serie.fold<int>(1, (m, p) => p.vues > m ? p.vues : m);
    return SizedBox(
      height: 64,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final p in serie)
            Expanded(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 1),
                height: p.vues == 0 ? 0 : (64 * p.vues / max).clamp(3, 64).toDouble(),
                decoration: const BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.vertical(top: Radius.circular(3))),
              ),
            ),
        ],
      ),
    );
  }
}
