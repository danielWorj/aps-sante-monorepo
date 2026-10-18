// lib/pages/portails/patient/portail-patient-demandes.dart
//
// RDV ALÉATOIRE — onglet « Demande » de l'espace patient (pendant mobile de
// patient-demandes.jsx).
//
// Le patient ne choisit pas de médecin : il indique la spécialité, sa ville,
// le jour ET l'heure, le type de consultation et (facultatif) le motif. Les
// médecins de cette spécialité dans cette ville sont prévenus ; ceux qui sont
// disponibles répondent avec leur profil (tarif indicatif, note…). Le
// patient compare, puis « Valider ce médecin » : le RDV est créé et le bouton
// de paiement apparaît (même parcours que pour un RDV pris dans l'agenda).
//
// L'app n'invente aucun montant : elle affiche le tarif indicatif renvoyé par
// le serveur ; le total (frais, commission) est la facture de BoutonPayerRdv.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/buttons/app_buttons.dart';
import '../../../components/buttons/bouton_payer_rdv.dart';
import '../../../components/cards/badge_chip.dart';
import '../../../components/style/colors.dart';
import '../../../components/style/text_styles.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/medecin_controller.dart';
import '../../../controllers/offre_rdv_controller.dart';
import '../../../controllers/referentiel_controller.dart';
import '../../../controllers/rendez_vous_controller.dart';
import '../../../models/offre_rdv_models.dart';
import '../../../models/referentiel_models.dart';
import '../../../utils/fonds.dart';

/// Miroir de OFFRE_RDV_DELAI_MIN_MINUTES (serveur, 2 h par défaut) : le
/// serveur reste seul juge, ceci ne sert qu'à guider la saisie.
const Duration _delaiMinimum = Duration(hours: 2);

String _dateOffre(DateTime? d) =>
    d == null ? '' : '${jourLongLocal(d)} à ${heureLocale(d)}';

BadgeChipStyle _styleStatut(StatutOffreRdv s) {
  switch (s) {
    case StatutOffreRdv.ouverte:
      return BadgeChipStyle.amber;
    case StatutOffreRdv.attribuee:
      return BadgeChipStyle.green;
    case StatutOffreRdv.annulee:
      return BadgeChipStyle.coral;
    case StatutOffreRdv.expiree:
    case StatutOffreRdv.inconnu:
      return BadgeChipStyle.outline;
  }
}

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}

class PortailPatientDemandes extends ConsumerWidget {
  const PortailPatientDemandes({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offresAsync = ref.watch(mesOffresRdvProvider);

    // Onglet du shell (PatientHomeShell) : pas de Scaffold ici.
    return Container(
      color: AppColors.paper,
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(mesOffresRdvProvider.future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
          children: [
            const _PageHead(),
            const _FormulaireDemande(),
            const SizedBox(height: 18),
            const _Titre('Mes demandes en cours'),
            offresAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (err, _) => _Erreur(
                message: '$err',
                onRetry: () => ref.invalidate(mesOffresRdvProvider),
              ),
              data: (offres) {
                final enCours = offres.where((o) => o.statut.estEnCours).toList();
                final terminees = offres.where((o) => !o.statut.estEnCours).toList();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (enCours.isEmpty)
                      const _Vide('Aucune demande en cours.')
                    else
                      ...enCours.map((o) => _CarteOffre(offre: o)),
                    if (terminees.isNotEmpty)
                      Theme(
                        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                        child: ExpansionTile(
                          tilePadding: EdgeInsets.zero,
                          title: Text(
                            'Demandes terminées (${terminees.length})',
                            style: AppTextStyles.cardTitle,
                          ),
                          children: terminees.map((o) => _CarteOffre(offre: o)).toList(),
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

/* ══════════════════════════════════════════════════════════════
 * Formulaire de publication
 * ══════════════════════════════════════════════════════════════ */

class _FormulaireDemande extends ConsumerStatefulWidget {
  const _FormulaireDemande();

  @override
  ConsumerState<_FormulaireDemande> createState() => _FormulaireDemandeState();
}

class _FormulaireDemandeState extends ConsumerState<_FormulaireDemande> {
  String? _specialiteId;
  String? _villeId;
  DateTime? _jour;
  TimeOfDay? _heure;
  TypeRdvOffre _type = TypeRdvOffre.physique;
  final _motif = TextEditingController();
  bool _envoi = false;
  String? _erreur;

  @override
  void dispose() {
    _motif.dispose();
    super.dispose();
  }

  DateTime? get _dateSouhaitee {
    if (_jour == null || _heure == null) return null;
    return DateTime(_jour!.year, _jour!.month, _jour!.day, _heure!.hour, _heure!.minute);
  }

  Future<void> _choisirJour() async {
    final maintenant = DateTime.now();
    final choix = await showDatePicker(
      context: context,
      initialDate: _jour ?? maintenant,
      firstDate: DateTime(maintenant.year, maintenant.month, maintenant.day),
      lastDate: maintenant.add(const Duration(days: 60)),
    );
    if (choix != null) setState(() => _jour = choix);
  }

  Future<void> _choisirHeure() async {
    final choix = await showTimePicker(
      context: context,
      initialTime: _heure ?? const TimeOfDay(hour: 9, minute: 0),
    );
    if (choix != null) setState(() => _heure = choix);
  }

  Future<void> _publier() async {
    final date = _dateSouhaitee;
    if (_specialiteId == null || _villeId == null || date == null) {
      setState(() => _erreur = "Choisissez la spécialité, la ville, le jour et l'heure.");
      return;
    }
    if (date.isBefore(DateTime.now().add(_delaiMinimum))) {
      setState(() => _erreur =
          "Choisissez une heure au moins 2 h plus tard, pour laisser aux médecins le temps de répondre.");
      return;
    }
    setState(() {
      _envoi = true;
      _erreur = null;
    });
    try {
      final repo = ref.read(offreRdvRepositoryProvider);
      final notifies = await ref.read(sessionControllerProvider.notifier).appelAuthentifie(
            (token) => repo.publier(
              token: token,
              specialiteId: _specialiteId!,
              villeId: _villeId!,
              typeRdv: _type,
              dateSouhaitee: date,
              motif: _motif.text,
            ),
          );
      if (!mounted) return;
      setState(() {
        _jour = null;
        _heure = null;
        _motif.clear();
      });
      ref.invalidate(mesOffresRdvProvider);
      _snack(
        context,
        notifies > 0
            ? 'Demande publiée : $notifies médecin(s) prévenu(s).'
            : "Demande publiée. Aucun médecin n'est encore inscrit pour ces critères.",
      );
    } catch (e) {
      if (mounted) setState(() => _erreur = '$e');
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final paysId = ref.watch(authUtilisateurProvider)?.paysId;
    final specialites = ref.watch(listeSpecialitesControllerProvider).value ?? const [];
    final List<Ville> villes =
        paysId == null ? const [] : (ref.watch(villesParPaysProvider(paysId)).value ?? const []);

    return CardSurface(
      padding: const EdgeInsets.all(14),
      margin: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(
            children: [
              Icon(Icons.campaign_outlined, size: 18, color: AppColors.primary),
              SizedBox(width: 6),
              Text('Nouvelle demande', style: AppTextStyles.cardTitle),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Indiquez votre besoin : les médecins disponibles vous répondent, vous choisissez celui qui vous convient.',
            style: AppTextStyles.cardMeta,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _specialiteId,
            isExpanded: true,
            decoration: _deco('Spécialité'),
            items: [
              for (final s in specialites)
                DropdownMenuItem(value: s.specialiteId, child: Text(s.nom, overflow: TextOverflow.ellipsis)),
            ],
            onChanged: (v) => setState(() => _specialiteId = v),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _villeId,
            isExpanded: true,
            decoration: _deco('Ville'),
            items: [
              for (final v in villes)
                DropdownMenuItem(value: v.villeId, child: Text(v.nom)),
            ],
            onChanged: (v) => setState(() => _villeId = v),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _ChampChoix(
                  icone: Icons.calendar_today_outlined,
                  libelle: _jour == null ? 'Jour' : jourLongLocal(_jour!),
                  onTap: _choisirJour,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _ChampChoix(
                  icone: Icons.schedule_outlined,
                  libelle: _heure == null ? 'Heure' : _heure!.format(context),
                  onTap: _choisirHeure,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            children: [
              for (final t in TypeRdvOffre.values)
                ChoiceChip(
                  label: Text(t.libelle),
                  selected: _type == t,
                  selectedColor: AppColors.primaryLight,
                  onSelected: (_) => setState(() => _type = t),
                ),
            ],
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _motif,
            maxLength: 1000,
            minLines: 1,
            maxLines: 3,
            decoration: _deco('Motif (facultatif)').copyWith(
              helperText: 'Visible par les médecins de la spécialité, sans votre nom.',
            ),
          ),
          if (_erreur != null) ...[
            const SizedBox(height: 6),
            Text(_erreur!, style: const TextStyle(color: AppColors.dangerDark, fontSize: 12.5)),
          ],
          const SizedBox(height: 10),
          PrimaryButton(
            label: 'Publier ma demande',
            icon: Icons.send_outlined,
            loading: _envoi,
            onPressed: _publier,
          ),
        ],
      ),
    );
  }
}

InputDecoration _deco(String libelle) => InputDecoration(
      labelText: libelle,
      isDense: true,
      filled: true,
      fillColor: AppColors.paper,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.line),
      ),
    );

class _ChampChoix extends StatelessWidget {
  final IconData icone;
  final String libelle;
  final VoidCallback onTap;

  const _ChampChoix({required this.icone, required this.libelle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
        decoration: BoxDecoration(
          color: AppColors.paper,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.line),
        ),
        child: Row(
          children: [
            Icon(icone, size: 16, color: AppColors.inkSoft),
            const SizedBox(width: 8),
            Expanded(child: Text(libelle, style: AppTextStyles.body, overflow: TextOverflow.ellipsis)),
          ],
        ),
      ),
    );
  }
}

/* ══════════════════════════════════════════════════════════════
 * Carte d'une demande + médecins qui ont répondu
 * ══════════════════════════════════════════════════════════════ */

class _CarteOffre extends ConsumerStatefulWidget {
  final OffreRdv offre;

  const _CarteOffre({required this.offre});

  @override
  ConsumerState<_CarteOffre> createState() => _CarteOffreState();
}

class _CarteOffreState extends ConsumerState<_CarteOffre> {
  String? _enCours; // reponseId validé, ou 'annuler'

  Future<void> _annuler() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Retirer cette demande ?'),
        content: const Text('Les médecins ne pourront plus y répondre.'),
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
    setState(() => _enCours = 'annuler');
    try {
      final repo = ref.read(offreRdvRepositoryProvider);
      await ref
          .read(sessionControllerProvider.notifier)
          .appelAuthentifie((token) => repo.annuler(widget.offre.offreId, token: token));
      if (mounted) _snack(context, 'Demande retirée.');
    } catch (e) {
      if (mounted) _snack(context, 'Erreur : $e');
    } finally {
      if (mounted) setState(() => _enCours = null);
      ref.invalidate(mesOffresRdvProvider);
    }
  }

  Future<void> _valider(ReponseOffre r) async {
    final m = r.medecin!;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Valider ce médecin ?'),
        content: Text(
          '${m.nomComplet}, ${_dateOffre(widget.offre.dateSouhaitee)}.\n\n'
          'Le rendez-vous sera créé : vous passerez ensuite au paiement pour le confirmer.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Retour')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Valider')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _enCours = r.reponseId);
    try {
      final repo = ref.read(offreRdvRepositoryProvider);
      await ref.read(sessionControllerProvider.notifier).appelAuthentifie(
            (token) => repo.validerMedecin(widget.offre.offreId, r.reponseId, token: token),
          );
      ref.invalidate(listeRendezVousControllerProvider);
      if (mounted) _snack(context, 'Médecin validé : réglez le paiement pour confirmer le rendez-vous.');
    } catch (e) {
      if (mounted) _snack(context, 'Erreur : $e');
    } finally {
      if (mounted) setState(() => _enCours = null);
      ref.invalidate(mesOffresRdvProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.offre;
    final rdv = o.rendezVous;
    final executer = ref.read(sessionControllerProvider.notifier).appelAuthentifie;
    final telephone = ref.read(sessionControllerProvider).value?.utilisateur.telephone;

    return CardSurface(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text(o.specialite, style: AppTextStyles.cardTitle)),
              BadgeChip(label: o.statut.libelle, style: _styleStatut(o.statut)),
            ],
          ),
          const SizedBox(height: 6),
          _Meta(Icons.event_outlined, _dateOffre(o.dateSouhaitee)),
          _Meta(
            o.typeRdv == TypeRdvOffre.teleconsultation ? Icons.videocam_outlined : Icons.medical_services_outlined,
            o.typeRdv.libelle,
          ),
          _Meta(Icons.location_on_outlined, o.ville),
          if (o.motif != null && o.motif!.isNotEmpty) _Meta(Icons.notes_outlined, 'Motif : ${o.motif}'),
          if (o.statut == StatutOffreRdv.attribuee && rdv != null) ...[
            const SizedBox(height: 10),
            if (rdv.estNonPaye) ...[
              const Text(
                'Rendez-vous créé : réglez-le pour le confirmer. Sans paiement dans le délai, '
                'il est annulé et la demande redevient ouverte.',
                style: AppTextStyles.cardMeta,
              ),
              const SizedBox(height: 8),
              BoutonPayerRdv(
                rdvId: rdv.rdvId,
                executer: executer,
                telephoneInitial: telephone,
                onPaye: () {
                  ref.invalidate(mesOffresRdvProvider);
                  ref.invalidate(listeRendezVousControllerProvider);
                },
              ),
            ] else
              const Text(
                "Rendez-vous confirmé : retrouvez-le dans l'onglet RdV.",
                style: AppTextStyles.cardMeta,
              ),
          ],
          if (o.statut.estEnCours) ...[
            const SizedBox(height: 12),
            if (o.reponses.isEmpty)
              const Row(
                children: [
                  Icon(Icons.hourglass_empty, size: 15, color: AppColors.inkFaint),
                  SizedBox(width: 6),
                  Expanded(
                    child: Text('En attente de réponses des médecins…', style: AppTextStyles.cardMeta),
                  ),
                ],
              )
            else ...[
              Text(
                o.reponses.length > 1
                    ? '${o.reponses.length} médecins ont répondu'
                    : '1 médecin a répondu',
                style: AppTextStyles.cardTitle.copyWith(fontSize: 13),
              ),
              const SizedBox(height: 8),
              for (final r in o.reponses)
                if (r.medecin != null)
                  _CarteRepondant(
                    reponse: r,
                    peutValider: o.statut == StatutOffreRdv.ouverte,
                    enCours: _enCours == r.reponseId,
                    desactive: _enCours != null,
                    onValider: () => _valider(r),
                  ),
            ],
          ],
          if (o.statut == StatutOffreRdv.ouverte) ...[
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: _enCours == null ? _annuler : null,
                icon: const Icon(Icons.close, size: 16),
                label: const Text('Retirer la demande'),
                style: TextButton.styleFrom(foregroundColor: AppColors.inkSoft),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CarteRepondant extends StatelessWidget {
  final ReponseOffre reponse;
  final bool peutValider;
  final bool enCours;
  final bool desactive;
  final VoidCallback onValider;

  const _CarteRepondant({
    required this.reponse,
    required this.peutValider,
    required this.enCours,
    required this.desactive,
    required this.onValider,
  });

  @override
  Widget build(BuildContext context) {
    final m = reponse.medecin!;
    final retenue = reponse.statut == StatutReponseOffre.retenue;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: retenue ? AppColors.primarySurface : AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: retenue ? AppColors.primary : AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _Avatar(m),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(m.nomComplet, style: AppTextStyles.cardTitle.copyWith(fontSize: 13.5)),
                    Text(
                      [
                        if (m.ville != null) m.ville!,
                        if (m.noteMoyenne != null) '★ ${m.noteMoyenne} (${m.totalAvis})',
                      ].join(' · '),
                      style: AppTextStyles.cardMeta,
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    m.tarifIndicatif == null ? '—' : fcfa(m.tarifIndicatif),
                    style: AppTextStyles.price.copyWith(color: AppColors.primaryDark, fontWeight: FontWeight.w700),
                  ),
                  const Text('honoraires', style: TextStyle(fontSize: 10.5, color: AppColors.inkFaint)),
                ],
              ),
            ],
          ),
          if (reponse.message != null && reponse.message!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text('« ${reponse.message} »', style: AppTextStyles.cardMeta.copyWith(fontStyle: FontStyle.italic)),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              TextButton(
                onPressed: () => _ouvrirProfil(context, m),
                child: const Text('Voir le profil'),
              ),
              const Spacer(),
              if (retenue) const BadgeChip(label: 'Retenu', style: BadgeChipStyle.green, icon: Icons.check),
              if (peutValider)
                ElevatedButton(
                  onPressed: desactive ? null : onValider,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: enCours
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Valider ce médecin'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Fiche du médecin (données publiques déjà renvoyées avec la réponse).
void _ouvrirProfil(BuildContext context, MedecinRepondant m) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.card,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _Avatar(m, taille: 56),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(m.nomComplet, style: AppTextStyles.h3),
                      if (m.specialite != null) Text(m.specialite!, style: AppTextStyles.cardMeta),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                if (m.ville != null) BadgeChip(label: m.ville!, icon: Icons.location_on_outlined),
                if (m.teleconsultationActivee)
                  const BadgeChip(label: 'Téléconsultation', style: BadgeChipStyle.green, icon: Icons.videocam_outlined),
                if (m.noteMoyenne != null)
                  BadgeChip(label: '★ ${m.noteMoyenne} · ${m.totalAvis} avis', style: BadgeChipStyle.amber),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              'Honoraires : ${m.tarifIndicatif == null ? '—' : fcfa(m.tarifIndicatif)}',
              style: AppTextStyles.cardTitle,
            ),
            const Text(
              'Hors frais de paiement et commission, détaillés au moment de payer.',
              style: AppTextStyles.cardMeta,
            ),
            if (m.biographie != null) ...[
              const SizedBox(height: 14),
              ConstrainedBox(
                constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.35),
                child: SingleChildScrollView(child: Text(m.biographie!, style: AppTextStyles.body)),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}

class _Avatar extends StatelessWidget {
  final MedecinRepondant m;
  final double taille;

  const _Avatar(this.m, {this.taille = 42});

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: taille / 2,
      backgroundColor: AppColors.primaryLight,
      foregroundImage: m.photoUrl != null ? NetworkImage(m.photoUrl!) : null,
      child: Text(
        m.initiales,
        style: const TextStyle(color: AppColors.primaryDark, fontWeight: FontWeight.w700),
      ),
    );
  }
}

/* ══════════════════════════════════════════════════════════════
 * Petits éléments
 * ══════════════════════════════════════════════════════════════ */

class _PageHead extends StatelessWidget {
  const _PageHead();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(2, 10, 56, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'ESPACE PATIENT',
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
            'Demande rapide',
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

class _Titre extends StatelessWidget {
  final String texte;

  const _Titre(this.texte);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Text(texte, style: AppTextStyles.cardTitle.copyWith(fontSize: 15)),
      );
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

class _Vide extends StatelessWidget {
  final String texte;

  const _Vide(this.texte);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Column(
          children: [
            const Icon(Icons.campaign_outlined, size: 30, color: AppColors.inkFaint),
            const SizedBox(height: 6),
            Text(texte, style: AppTextStyles.cardMeta),
          ],
        ),
      );
}

class _Erreur extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _Erreur({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Column(
          children: [
            Text(message, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.dangerDark)),
            TextButton(onPressed: onRetry, child: const Text('Réessayer')),
          ],
        ),
      );
}
