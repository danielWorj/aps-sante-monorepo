// lib/pages/portails/medecin/portail-medecin-demandes.dart
//
// RDV ALÉATOIRE — onglet « Demandes » de l'espace médecin (pendant mobile de
// medecin-demandes.jsx).
//
// Le médecin voit les demandes des patients de SA spécialité dans SA ville
// (téléconsultations seulement s'il l'a activée). Il répond s'il est
// disponible au jour et à l'heure fixés par le patient : il ne saisit ni
// tarif ni horaire (c'est son profil qui est présenté), seulement un mot
// facultatif. Le patient choisit ensuite parmi les médecins qui ont répondu.
//
// D8 : l'identité du patient n'apparaît jamais ici. S'il est retenu, le
// médecin reçoit le rendez-vous une fois PAYÉ (notification « rdv_paye »).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/cards/badge_chip.dart';
import '../../../components/style/colors.dart';
import '../../../components/style/text_styles.dart';
import '../../../components/ui/aps_ui.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/offre_rdv_controller.dart';
import '../../../models/offre_rdv_models.dart';

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}

class PortailMedecinDemandes extends ConsumerStatefulWidget {
  const PortailMedecinDemandes({super.key});

  @override
  ConsumerState<PortailMedecinDemandes> createState() => _PortailMedecinDemandesState();
}

class _PortailMedecinDemandesState extends ConsumerState<PortailMedecinDemandes> {
  bool _mesReponses = false;

  @override
  Widget build(BuildContext context) {
    final offresAsync = ref.watch(offresRdvMedecinProvider(_mesReponses));

    // Onglet du shell (MedecinHomeShell) : pas de Scaffold ici.
    return Container(
      color: AppColors.bg,
      child: RefreshIndicator(
        color: AppColors.violet,
        onRefresh: () => ref.refresh(offresRdvMedecinProvider(_mesReponses).future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 120),
          children: [
            const _PageHead(),
            ApsNote.text(
              'Des patients de votre ville cherchent votre spécialité à une date précise. '
              'Répondez au tarif de votre profil : le patient choisit parmi ceux qui ont répondu.',
              icon: Icons.campaign_outlined,
              tone: ApsTone.violet,
            ),
            const SizedBox(height: 14),
            ApsSegmented<bool>(
              value: _mesReponses,
              onChanged: (v) => setState(() => _mesReponses = v),
              segments: const [
                ApsSegment(false, 'Ouvertes', icon: Icons.campaign_outlined),
                ApsSegment(true, 'Mes réponses', icon: Icons.send_outlined),
              ],
            ),
            const SizedBox(height: 14),
            offresAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (err, _) => ApsEmptyState(
                icon: Icons.wifi_off_rounded,
                tone: ApsTone.neutral,
                title: 'Demandes indisponibles',
                message: '$err',
                actionLabel: 'Réessayer',
                onAction: () => ref.invalidate(offresRdvMedecinProvider(_mesReponses)),
              ),
              data: (resultat) => resultat.offres.isEmpty
                  ? (!_mesReponses && resultat.raison != null)
                      ? ApsNote.text(
                          resultat.raison!,
                          icon: Icons.info_outline_rounded,
                          tone: ApsTone.amber,
                        )
                      : ApsEmptyState(
                      icon: Icons.inbox_outlined,
                      tone: ApsTone.violet,
                      title: _mesReponses ? 'Aucune réponse' : 'Aucune demande ouverte',
                      message: _mesReponses
                          ? "Vous n'avez répondu à aucune demande."
                          : 'Aucune demande pour votre spécialité dans votre ville.',
                    )
                  : Column(
                      children: [
                        for (final o in resultat.offres) _CarteDemande(key: ValueKey(o.offreId), offre: o, mesReponses: _mesReponses),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CarteDemande extends ConsumerStatefulWidget {
  final OffreRdv offre;
  final bool mesReponses;

  const _CarteDemande({super.key, required this.offre, required this.mesReponses});

  @override
  ConsumerState<_CarteDemande> createState() => _CarteDemandeState();
}

class _CarteDemandeState extends ConsumerState<_CarteDemande> {
  final _message = TextEditingController();
  bool _enCours = false;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  void _recharger() {
    ref.invalidate(offresRdvMedecinProvider(false));
    ref.invalidate(offresRdvMedecinProvider(true));
  }

  Future<void> _repondre() async {
    setState(() => _enCours = true);
    try {
      final repo = ref.read(offreRdvRepositoryProvider);
      await ref.read(sessionControllerProvider.notifier).appelAuthentifie(
            (token) => repo.repondre(widget.offre.offreId, token: token, message: _message.text),
          );
      if (mounted) _snack(context, 'Réponse envoyée : le patient voit votre profil et votre tarif.');
    } catch (e) {
      if (mounted) _snack(context, 'Erreur : $e');
    } finally {
      if (mounted) setState(() => _enCours = false);
      _recharger();
    }
  }

  Future<void> _retirer() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Retirer votre réponse ?'),
        content: const Text('Le patient ne pourra plus vous choisir pour cette demande.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Retour')),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.coral600),
            child: const Text('Retirer'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _enCours = true);
    try {
      final repo = ref.read(offreRdvRepositoryProvider);
      await ref
          .read(sessionControllerProvider.notifier)
          .appelAuthentifie((token) => repo.retirerReponse(widget.offre.offreId, token: token));
      if (mounted) _snack(context, 'Réponse retirée.');
    } catch (e) {
      if (mounted) _snack(context, 'Erreur : $e');
    } finally {
      if (mounted) setState(() => _enCours = false);
      _recharger();
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.offre;
    final rep = o.maReponse;
    final ouverte = o.statut == StatutOffreRdv.ouverte;
    final peutRepondre = ouverte && (rep == null || rep.statut == StatutReponseOffre.retiree);
    final peutRetirer = ouverte && rep?.statut == StatutReponseOffre.proposee;

    return ApsCard(
      margin: const EdgeInsets.only(bottom: 10),
      radius: 10,
      color: ouverte && rep == null ? AppColors.violet100 : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              if (rep != null)
                BadgeChip(
                  label: rep.statut.libelle,
                  style: rep.statut == StatutReponseOffre.retenue
                      ? BadgeChipStyle.green
                      : rep.statut == StatutReponseOffre.retiree
                          ? BadgeChipStyle.outline
                          : BadgeChipStyle.amber,
                )
              else if (!ouverte)
                BadgeChip(label: o.statut.libelle)
              else
                const ApsPill('Demande express', tone: ApsTone.violet, dot: true, background: Colors.white),
              const Spacer(),
              if (o.nombreReponses != null)
                Text(
                  o.nombreReponses == 0
                      ? 'Aucune réponse'
                      : '${o.nombreReponses} réponse${o.nombreReponses! > 1 ? 's' : ''}',
                  style: AppTextStyles.xs,
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text('${o.specialite} · ${o.dateLisible}', style: AppTextStyles.strong),
          const SizedBox(height: 2),
          Text(
            [
              o.ville,
              o.typeRdv.libelle,
              if (o.motif != null && o.motif!.isNotEmpty) '« ${o.motif} »',
            ].join(' · '),
            style: AppTextStyles.xs,
          ),
          if (widget.mesReponses && rep?.statut == StatutReponseOffre.retenue) ...[
            const SizedBox(height: 10),
            ApsNote.text(
              "Le rendez-vous apparaîtra dans vos rendez-vous dès qu'il sera payé.",
              bold: 'Le patient vous a choisi.',
              icon: Icons.check_circle_outline_rounded,
            ),
          ],
          if (widget.mesReponses &&
              rep?.statut == StatutReponseOffre.proposee &&
              o.statut == StatutOffreRdv.attribuee &&
              !o.attribueeAMoi) ...[
            const SizedBox(height: 8),
            Text('Le patient a choisi un autre médecin.', style: AppTextStyles.xs),
          ],
          if (peutRepondre) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _message,
              maxLength: 500,
              decoration: const InputDecoration(
                labelText: 'Un mot au patient (facultatif)',
                hintText: 'Ex. disponible, consultation au cabinet',
              ),
            ),
            Text(
              'Votre tarif et votre profil seront présentés au patient. En répondant, '
              'vous vous engagez à être disponible à cette heure.',
              style: AppTextStyles.xs,
            ),
            const SizedBox(height: 10),
            ApsButton(
              label: 'Je suis disponible',
              icon: Icons.check_rounded,
              variant: ApsButtonVariant.violet,
              small: true,
              loading: _enCours,
              onPressed: _enCours ? null : _repondre,
            ),
          ],
          if (peutRetirer) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: rep!.message != null && rep.message!.isNotEmpty
                      ? Text('Votre mot : « ${rep.message} »', style: AppTextStyles.xs)
                      : const SizedBox.shrink(),
                ),
                TextButton.icon(
                  onPressed: _enCours ? null : _retirer,
                  icon: const Icon(Icons.undo, size: 16),
                  label: const Text('Retirer ma réponse'),
                  style: TextButton.styleFrom(foregroundColor: AppColors.red),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _PageHead extends StatelessWidget {
  const _PageHead();

  @override
  Widget build(BuildContext context) {
    // La cloche du shell flotte en haut à droite : place réservée.
    return const ApsPageTitle('Demandes express', trailing: SizedBox(width: 42));
  }
}
