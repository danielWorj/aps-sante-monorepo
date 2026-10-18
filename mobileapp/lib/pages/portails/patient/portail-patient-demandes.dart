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

import '../../../components/alert/app_alert.dart';
import '../../../components/buttons/bouton_payer_rdv.dart';
import '../../../components/cards/badge_chip.dart';
import '../../../components/style/colors.dart';
import '../../../components/style/text_styles.dart';
import '../../../components/ui/aps_ui.dart';
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
      color: AppColors.bg,
      child: RefreshIndicator(
        color: AppColors.violet,
        onRefresh: () => ref.refresh(mesOffresRdvProvider.future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 120),
          children: [
            const _PageHead(),
            const _FormulaireDemande(),
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
                            style: AppTextStyles.strong,
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _BandeauExpress(),
        const SizedBox(height: 14),
        Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<String>(
            initialValue: _specialiteId,
            isExpanded: true,
            decoration: _deco('Spécialité', Icons.medical_services_outlined),
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
            decoration: _deco('Ville', Icons.location_on_outlined),
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
                  titre: 'Jour',
                  libelle: _jour == null ? null : jourLongLocal(_jour!),
                  onTap: _choisirJour,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _ChampChoix(
                  icone: Icons.schedule_outlined,
                  titre: 'Heure',
                  libelle: _heure == null ? null : _heure!.format(context),
                  onTap: _choisirHeure,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ApsSegmented<TypeRdvOffre>(
            value: _type,
            onChanged: (t) => setState(() => _type = t),
            segments: [
              for (final t in TypeRdvOffre.values)
                ApsSegment(
                  t,
                  t == TypeRdvOffre.teleconsultation ? 'En vidéo' : 'Au cabinet',
                  icon: t == TypeRdvOffre.teleconsultation
                      ? Icons.videocam_outlined
                      : Icons.local_hospital_outlined,
                ),
            ],
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _motif,
            maxLength: 1000,
            minLines: 2,
            maxLines: 4,
            decoration: _deco('Motif (facultatif)', null).copyWith(
              helperText: 'Visible par les médecins de la spécialité, sans votre nom.',
            ),
          ),
          if (_erreur != null) ...[
            const SizedBox(height: 6),
            AppAlert(type: AppAlertType.danger, message: _erreur!),
          ],
          const SizedBox(height: 12),
          ApsButton(
            label: 'Publier ma demande',
            icon: Icons.send_outlined,
            variant: ApsButtonVariant.violet,
            loading: _envoi,
            onPressed: _publier,
          ),
        ],
        ),
      ],
    );
  }
}

InputDecoration _deco(String libelle, IconData? icone) => InputDecoration(
      labelText: libelle,
      prefixIcon: icone == null ? null : Icon(icone, size: 18, color: AppColors.violet700),
    );

/// Champ « Jour » / « Heure » au format `.field` (libellé au-dessus).
class _ChampChoix extends StatelessWidget {
  final IconData icone;
  final String titre;
  final String? libelle;
  final VoidCallback onTap;

  const _ChampChoix({
    required this.icone,
    required this.titre,
    required this.libelle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(16);
    return Material(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: r,
        side: const BorderSide(color: AppColors.line, width: 1.5),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: r,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 9, 12, 10),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(titre, style: AppTextStyles.xs.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(
                      libelle ?? 'Choisir',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: libelle == null
                          ? AppTextStyles.small.copyWith(color: AppColors.ink4)
                          : AppTextStyles.strong.copyWith(fontSize: 14.5),
                    ),
                  ],
                ),
              ),
              Icon(icone, size: 17, color: AppColors.ink3),
            ],
          ),
        ),
      ),
    );
  }
}

/// Bandeau violet « Publiez votre besoin » et ses trois étapes.
class _BandeauExpress extends StatelessWidget {
  const _BandeauExpress();

  @override
  Widget build(BuildContext context) {
    Widget etape(String n, String libelle, {bool active = false}) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
          decoration: BoxDecoration(
            color: active ? Colors.white : Colors.white.withValues(alpha: 0.16),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text.rich(
            TextSpan(children: [
              TextSpan(text: '$n  ', style: const TextStyle(fontWeight: FontWeight.w800)),
              TextSpan(text: libelle),
            ]),
            style: TextStyle(
              fontFamily: AppTextStyles.fontSans,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: active ? AppColors.violet700 : Colors.white,
            ),
          ),
        );
    final chevron = Icon(Icons.chevron_right_rounded,
        size: 14, color: Colors.white.withValues(alpha: 0.5));

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        gradient: AppColors.gradientViolet,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -14,
            top: -10,
            child: Icon(Icons.campaign_outlined,
                size: 110, color: Colors.white.withValues(alpha: 0.12)),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Publiez votre besoin',
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.3,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Les médecins disponibles répondent au tarif de leur profil. Vous choisissez.',
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: 12.5,
                    height: 1.45,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.8),
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    etape('1', 'Publier'),
                    chevron,
                    etape('2', 'Comparer'),
                    chevron,
                    etape('3', 'Valider', active: true),
                  ],
                ),
              ],
            ),
          ),
        ],
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

    final nbReponses = o.reponses.length;
    return ApsCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: EdgeInsets.zero,
      clip: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            color: AppColors.ink,
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (o.statut.estEnCours)
                      ApsPill(
                        nbReponses > 1
                            ? '$nbReponses réponses'
                            : (nbReponses == 1 ? '1 réponse' : 'En attente'),
                        dot: true,
                        background: AppColors.mint.withValues(alpha: 0.16),
                        foreground: AppColors.mint,
                      )
                    else
                      BadgeChip(label: o.statut.libelle, style: _styleStatut(o.statut)),
                    const Spacer(),
                    Icon(
                      o.typeRdv == TypeRdvOffre.teleconsultation
                          ? Icons.videocam_outlined
                          : Icons.local_hospital_outlined,
                      size: 15,
                      color: Colors.white.withValues(alpha: 0.6),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  '${o.specialite} · ${_dateOffre(o.dateSouhaitee)}',
                  style: const TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.3,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    o.ville,
                    o.typeRdv.libelle,
                    if (o.motif != null && o.motif!.isNotEmpty) '« ${o.motif} »',
                  ].join(' · '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.65),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
          if (o.statut == StatutOffreRdv.attribuee && rdv != null) ...[
            const SizedBox(height: 12),
            if (rdv.estNonPaye) ...[
              ApsNote.text(
                'Réglez-le pour le confirmer. Sans paiement dans le délai, '
                'il est annulé et la demande redevient ouverte.',
                bold: 'Rendez-vous créé.',
                icon: Icons.schedule_rounded,
                tone: ApsTone.amber,
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
              ApsNote.text(
                "Retrouvez-le dans l'onglet Rendez-vous.",
                bold: 'Rendez-vous confirmé.',
                icon: Icons.check_circle_outline_rounded,
              ),
          ],
          if (o.statut.estEnCours) ...[
            const SizedBox(height: 12),
            if (o.reponses.isEmpty)
              ApsNote.text(
                'Les médecins de la spécialité sont prévenus. Les réponses arrivent ici.',
                bold: 'En attente de réponses.',
                icon: Icons.hourglass_empty_rounded,
                tone: ApsTone.violet,
              )
            else ...[
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
                style: TextButton.styleFrom(foregroundColor: AppColors.red),
              ),
            ),
          ],
              ],
            ),
          ),
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
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: retenue ? AppColors.b0 : AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: retenue ? AppColors.b5 : AppColors.line,
          width: retenue ? 2 : 1,
        ),
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
                    Text(m.nomComplet,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTextStyles.strong.copyWith(fontSize: 13.5)),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        if (m.ville != null)
                          Flexible(
                            child: Text(m.ville!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppTextStyles.xs),
                          ),
                        if (m.noteMoyenne != null) ...[
                          const SizedBox(width: 6),
                          ApsStars(m.noteMoyenne!.toDouble(), count: m.totalAvis),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    m.tarifIndicatif == null ? '—' : fcfa(m.tarifIndicatif),
                    style: AppTextStyles.strong.copyWith(fontSize: 16, letterSpacing: -0.3),
                  ),
                  Text('honoraires', style: AppTextStyles.xs),
                ],
              ),
            ],
          ),
          if (reponse.message != null && reponse.message!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('« ${reponse.message} »',
                style: AppTextStyles.small.copyWith(fontStyle: FontStyle.italic)),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ApsButton(
                  label: 'Voir le profil',
                  variant: ApsButtonVariant.ghost,
                  small: true,
                  onPressed: () => _ouvrirProfil(context, m),
                ),
              ),
              if (retenue || peutValider) const SizedBox(width: 8),
              if (retenue)
                const Expanded(
                  flex: 13,
                  child: Center(
                    child: ApsPill('Médecin retenu', icon: Icons.check_rounded),
                  ),
                )
              else if (peutValider)
                Expanded(
                  flex: 13,
                  child: ApsButton(
                    label: 'Valider ce médecin',
                    small: true,
                    loading: enCours,
                    onPressed: desactive ? null : onValider,
                  ),
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
    builder: (_) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 42,
                height: 5,
                margin: const EdgeInsets.only(top: 10, bottom: 16),
                decoration: BoxDecoration(
                  color: AppColors.lineStrong,
                  borderRadius: BorderRadius.circular(5),
                ),
              ),
            ),
            Row(
              children: [
                _Avatar(m, taille: 56),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(m.nomComplet, style: AppTextStyles.m),
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
    return ApsAvatar(name: m.nomComplet, photoUrl: m.photoUrl, size: taille);
  }
}

/* ══════════════════════════════════════════════════════════════
 * Petits éléments
 * ══════════════════════════════════════════════════════════════ */

class _PageHead extends StatelessWidget {
  const _PageHead();

  @override
  Widget build(BuildContext context) {
    // La cloche du shell flotte en haut à droite : place réservée.
    return const ApsPageTitle('Demande express', trailing: SizedBox(width: 42));
  }
}

class _Titre extends StatelessWidget {
  final String texte;

  const _Titre(this.texte);

  @override
  Widget build(BuildContext context) => ApsSectionTitle(texte);
}

class _Vide extends StatelessWidget {
  final String texte;

  const _Vide(this.texte);

  @override
  Widget build(BuildContext context) => ApsEmptyState(
        icon: Icons.campaign_outlined,
        tone: ApsTone.violet,
        title: texte,
        message: 'Publiez une demande : les médecins disponibles vous répondront.',
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
