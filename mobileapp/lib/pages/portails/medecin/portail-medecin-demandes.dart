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
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/offre_rdv_controller.dart';
import '../../../models/offre_rdv_models.dart';
import '../../../utils/fonds.dart';

String _dateOffre(DateTime? d) =>
    d == null ? '' : '${jourLongLocal(d)} à ${heureLocale(d)}';

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
      color: AppColors.paper,
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(offresRdvMedecinProvider(_mesReponses).future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
          children: [
            const _PageHead(),
            const Text(
              'Des patients de votre ville cherchent un médecin de votre spécialité à une date précise. '
              'Répondez si vous êtes disponible : le patient choisit parmi les médecins qui ont répondu.',
              style: AppTextStyles.cardMeta,
            ),
            const SizedBox(height: 12),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Ouvertes'), icon: Icon(Icons.campaign_outlined)),
                ButtonSegment(value: true, label: Text('Mes réponses'), icon: Icon(Icons.send_outlined)),
              ],
              selected: {_mesReponses},
              showSelectedIcon: false,
              onSelectionChanged: (s) => setState(() => _mesReponses = s.first),
            ),
            const SizedBox(height: 14),
            offresAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (err, _) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Column(
                  children: [
                    Text('$err', textAlign: TextAlign.center, style: const TextStyle(color: AppColors.dangerDark)),
                    TextButton(
                      onPressed: () => ref.invalidate(offresRdvMedecinProvider(_mesReponses)),
                      child: const Text('Réessayer'),
                    ),
                  ],
                ),
              ),
              data: (offres) => offres.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.symmetric(vertical: 28),
                      child: Column(
                        children: [
                          const Icon(Icons.inbox_outlined, size: 30, color: AppColors.inkFaint),
                          const SizedBox(height: 6),
                          Text(
                            _mesReponses
                                ? "Vous n'avez répondu à aucune demande."
                                : 'Aucune demande ouverte pour votre spécialité dans votre ville.',
                            textAlign: TextAlign.center,
                            style: AppTextStyles.cardMeta,
                          ),
                        ],
                      ),
                    )
                  : Column(
                      children: [
                        for (final o in offres) _CarteDemande(key: ValueKey(o.offreId), offre: o, mesReponses: _mesReponses),
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

    return CardSurface(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text(_dateOffre(o.dateSouhaitee), style: AppTextStyles.cardTitle)),
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
                BadgeChip(label: o.statut.libelle),
            ],
          ),
          const SizedBox(height: 6),
          _Meta(
            o.typeRdv == TypeRdvOffre.teleconsultation ? Icons.videocam_outlined : Icons.medical_services_outlined,
            o.typeRdv.libelle,
          ),
          _Meta(Icons.location_on_outlined, '${o.ville} · ${o.specialite}'),
          if (o.nombreReponses != null)
            _Meta(
              Icons.people_outline,
              o.nombreReponses == 0
                  ? 'Aucun médecin n\'a encore répondu'
                  : '${o.nombreReponses} réponse${o.nombreReponses! > 1 ? 's' : ''}',
            ),
          if (o.motif != null && o.motif!.isNotEmpty) _Meta(Icons.notes_outlined, 'Motif : ${o.motif}'),
          if (widget.mesReponses && rep?.statut == StatutReponseOffre.retenue) ...[
            const SizedBox(height: 8),
            const Text(
              'Le patient vous a choisi. Le rendez-vous apparaîtra dans vos rendez-vous dès qu\'il sera payé.',
              style: AppTextStyles.cardMeta,
            ),
          ],
          if (widget.mesReponses &&
              rep?.statut == StatutReponseOffre.proposee &&
              o.statut == StatutOffreRdv.attribuee &&
              !o.attribueeAMoi) ...[
            const SizedBox(height: 8),
            const Text('Le patient a choisi un autre médecin.', style: AppTextStyles.cardMeta),
          ],
          if (peutRepondre) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _message,
              maxLength: 500,
              decoration: InputDecoration(
                labelText: 'Un mot au patient (facultatif)',
                hintText: 'Ex. disponible, consultation au cabinet',
                isDense: true,
                filled: true,
                fillColor: AppColors.paper,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            const Text(
              'Votre tarif et votre profil seront présentés au patient. En répondant, '
              'vous vous engagez à être disponible à cette heure.',
              style: TextStyle(fontSize: 11, color: AppColors.inkFaint),
            ),
            const SizedBox(height: 8),
            ElevatedButton.icon(
              onPressed: _enCours ? null : _repondre,
              icon: _enCours
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.check, size: 18),
              label: const Text('Je suis disponible'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                elevation: 0,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ],
          if (peutRetirer) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: rep!.message != null && rep.message!.isNotEmpty
                      ? Text('Votre mot : « ${rep.message} »', style: AppTextStyles.cardMeta)
                      : const SizedBox.shrink(),
                ),
                TextButton.icon(
                  onPressed: _enCours ? null : _retirer,
                  icon: const Icon(Icons.undo, size: 16),
                  label: const Text('Retirer ma réponse'),
                  style: TextButton.styleFrom(foregroundColor: AppColors.inkSoft),
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
    return const Padding(
      padding: EdgeInsets.fromLTRB(2, 10, 56, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'ESPACE MÉDECIN',
            style: TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.1,
              color: AppColors.primary,
            ),
          ),
          SizedBox(height: 5),
          Text(
            'Demandes patients',
            style: TextStyle(
              fontFamily: AppTextStyles.fontDisplay,
              fontSize: 22,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.2,
              color: AppColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  final IconData icone;
  final String texte;

  const _Meta(this.icone, this.texte);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 3),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icone, size: 14, color: AppColors.inkFaint),
            const SizedBox(width: 6),
            Expanded(child: Text(texte, style: AppTextStyles.cardMeta)),
          ],
        ),
      );
}
