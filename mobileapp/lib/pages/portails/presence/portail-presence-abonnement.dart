// lib/pages/portails/presence/portail-presence-abonnement.dart
//
// Espaces pharmacie et centre de santé — « Abonnement de présence » : état,
// ce que le public voit aujourd'hui, formules (activation, renouvellement,
// montée de niveau), historique. Même parcours que le portail assurance.
// Règle d'or : le montant n'est JAMAIS envoyé — l'app transmet niveau +
// durée, le serveur calcule. Paiement : Mobile Money (CamPay, suivi du
// statut dans l'app), carte bancaire (page Stripe dans le navigateur) ou
// virement (activation à réception des fonds).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../components/components.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/espace_presence_controller.dart';
import '../../../models/espace_presence_models.dart';
import '../../../models/portail_assurance_models.dart' show CollecteMobileMoney, DureeOffre, InstructionsVirement;
import '../../../utils/fonds.dart';
import '../../../utils/mobile_money.dart';
import 'presence_commun.dart';

const _libellesStatut = {
  'actif': 'Actif',
  'expire': 'Expiré',
  'annule': 'Annulé',
  'suspendu': 'Suspendu',
  'remplace': 'Remplacé (montée de niveau)',
};

class PortailPresenceAbonnement extends ConsumerWidget {
  const PortailPresenceAbonnement({super.key, required this.type});

  final TypeEspacePresence type;

  void _recharger(WidgetRef ref) {
    ref.invalidate(gestionAbonnementPresenceProvider(type));
    ref.invalidate(offresPresenceProvider(type));
    ref.invalidate(tableauDeBordPresenceProvider);
    ref.invalidate(maFichePresenceProvider(type));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gestion = ref.watch(gestionAbonnementPresenceProvider(type));
    return PagePresence(
      titre: 'Abonnement',
      description: 'Votre abonnement de présence décide de ce que le public voit sur votre fiche. Vos contenus sont toujours conservés.',
      onRafraichir: () async => _recharger(ref),
      children: [
        gestion.when(
          loading: () => const ChargementPortail(),
          error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => _recharger(ref)),
          data: (g) => _Contenu(type: type, g: g, onRecharger: () => _recharger(ref)),
        ),
      ],
    );
  }
}

class _Contenu extends ConsumerWidget {
  const _Contenu({required this.type, required this.g, required this.onRecharger});

  final TypeEspacePresence type;
  final GestionAbonnementPresence g;
  final VoidCallback onRecharger;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actif = g.statutAbonnement == 'actif';
    final avantages = g.droits.libelles(type);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!g.enLigne)
          const BandeauPortail(
            icone: Icons.hourglass_top_outlined,
            texte: "Votre fiche n'est pas encore publiée : l'abonnement pourra être activé dès sa publication.",
          ),
        if (g.enGrace)
          BandeauPortail(
            icone: Icons.warning_amber_outlined,
            texte: 'Votre abonnement a expiré le ${dateCourtePortail(g.dernierJour)} : vos contenus enrichis sont masqués au public.',
          ),
        CartePortail(
          titre: 'Mon abonnement',
          icone: Icons.workspace_premium_outlined,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                actif
                    ? '${g.niveauLibelle ?? ''} — valable jusqu\'au ${dateCourtePortail(g.dernierJour)} inclus (${g.joursRestants ?? 0} jours restants).'
                    : g.statutAbonnement == 'gratuite'
                        ? 'Offre de lancement : les avantages ci-dessous vous sont offerts${g.dernierJour == null ? '' : ' jusqu\'au ${dateCourtePortail(g.dernierJour)}'}.'
                        : (g.enGrace
                            ? 'Abonnement expiré (période de grâce).'
                            : 'Aucun abonnement actif : votre fiche est en présence minimale (nom, adresse, localisation et horaires).'),
                style: AppTextStyles.body,
              ),
              if (g.brouillon != null) ...[
                const SizedBox(height: 10),
                Text(
                  'Abonnement « ${g.brouillon!.niveauLibelle} » (${g.brouillon!.dureeMois} mois, '
                  '${montantDevise(g.brouillon!.montant, g.brouillon!.devise)}) en attente de paiement.',
                  style: AppTextStyles.cardMeta,
                ),
                TextButton(
                  onPressed: () => _ouvrirPaiement(context, g.brouillon!.id, g.brouillon!.montant, g.brouillon!.devise, onRecharger),
                  child: const Text('Reprendre le paiement'),
                ),
              ],
            ],
          ),
        ),
        CartePortail(
          titre: "Ce que voit le public aujourd'hui",
          icone: Icons.checklist_outlined,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _Avantage("Nom, adresse, localisation et horaires d'ouverture", inclus: true),
              if (type == TypeEspacePresence.pharmacie) const _Avantage('Gardes officielles', inclus: true),
              if (avantages.isEmpty)
                const _Avantage('Téléphone, photos et contenus enrichis', inclus: false)
              else
                for (final a in avantages) _Avantage(a, inclus: true),
              const SizedBox(height: 6),
              Text("L'abonnement n'influence jamais l'ordre d'affichage dans l'annuaire.", style: AppTextStyles.cardMeta),
            ],
          ),
        ),
        if (g.enLigne) _Offres(type: type, onRecharger: onRecharger),
        if (g.historique.isNotEmpty)
          CartePortail(
            titre: 'Historique',
            icone: Icons.history,
            child: Column(
              children: [
                for (final h in g.historique)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text('${h.niveauLibelle} · ${_libellesStatut[h.statut] ?? h.statut}', style: AppTextStyles.cardTitle),
                    subtitle: Text(
                      '${h.dateDebut == null ? '—' : '${dateCourtePortail(h.dateDebut)} → ${dateCourtePortail(h.dateFin?.subtract(const Duration(days: 1)))}'}'
                      '${h.factureNumero == null ? '' : ' · Facture ${h.factureNumero}'}',
                      style: AppTextStyles.cardMeta,
                    ),
                    trailing: Text(montantDevise(h.montant, h.devise), style: const TextStyle(fontWeight: FontWeight.w600)),
                  ),
                Text('Les factures se téléchargent depuis votre espace sur le site web.', style: AppTextStyles.cardMeta),
              ],
            ),
          ),
      ],
    );
  }
}

class _Avantage extends StatelessWidget {
  const _Avantage(this.texte, {required this.inclus});

  final String texte;
  final bool inclus;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(inclus ? Icons.check : Icons.visibility_off_outlined, size: 16, color: inclus ? AppColors.success : AppColors.inkFaint),
            const SizedBox(width: 6),
            Expanded(child: Text(inclus ? texte : '$texte — masqués', style: AppTextStyles.body)),
          ],
        ),
      );
}

class _Offres extends ConsumerWidget {
  const _Offres({required this.type, required this.onRecharger});

  final TypeEspacePresence type;
  final VoidCallback onRecharger;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offres = ref.watch(offresPresenceProvider(type));
    return offres.when(
      loading: () => const ChargementPortail(),
      error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(offresPresenceProvider(type))),
      data: (o) => o.offres.isEmpty
          ? const CartePortail(child: Text('Aucune formule disponible pour le moment.', style: AppTextStyles.body))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(padding: EdgeInsets.fromLTRB(2, 6, 2, 8), child: Text('Formules disponibles', style: AppTextStyles.h3)),
                for (final offre in o.offres)
                  _CarteOffre(type: type, offre: offre, estCourante: offre.code == o.niveauCourant, onRecharger: onRecharger),
              ],
            ),
    );
  }
}

class _CarteOffre extends ConsumerStatefulWidget {
  const _CarteOffre({required this.type, required this.offre, required this.estCourante, required this.onRecharger});

  final TypeEspacePresence type;
  final OffrePresence offre;
  final bool estCourante;
  final VoidCallback onRecharger;

  @override
  ConsumerState<_CarteOffre> createState() => _CarteOffreState();
}

class _CarteOffreState extends ConsumerState<_CarteOffre> {
  late int? _duree = widget.offre.dureesDisponibles.isEmpty ? null : widget.offre.dureesDisponibles.first.dureeMois;
  bool _envoi = false;

  DureeOffre? get _choix {
    for (final d in widget.offre.durees) {
      if (d.disponible && d.dureeMois == _duree) return d;
    }
    return null;
  }

  Future<void> _souscrire() async {
    final choix = _choix;
    if (choix == null) return;
    final ok = await confirmerPortail(
      context,
      widget.offre.libelle,
      '${choix.dureeMois} mois — ${montantDevise(choix.montantTotal, choix.devise)}'
          '${choix.creditProrata > 0 ? ' (crédit de ${montantDevise(choix.creditProrata, choix.devise)} déduit)' : ''}.',
      action: choix.montantTotal > 0 ? 'Payer' : 'Activer',
    );
    if (!ok || !mounted) return;
    setState(() => _envoi = true);
    try {
      final fiche = await ref.read(maFichePresenceProvider(widget.type).future);
      final r = await appelPresenceUi(
        ref,
        (repo, token) => repo.creerBrouillon(widget.type, fiche.id, token: token, niveauId: widget.offre.niveauId, dureeMois: choix.dureeMois),
      );
      if (!mounted) return;
      if (r.active) {
        snackPortail(context, 'Abonnement activé.');
        widget.onRecharger();
      } else {
        await _ouvrirPaiement(context, r.abonnementId, choix.montantTotal, choix.devise, widget.onRecharger);
      }
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final offre = widget.offre;
    final choix = _choix;
    final indisponible = offre.durees.where((d) => !d.disponible).firstOrNull;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: widget.estCourante ? AppColors.primary : AppColors.line, width: widget.estCourante ? 2 : 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(child: Text(offre.libelle, style: AppTextStyles.cardTitle)),
            if (widget.estCourante) const Text('Votre niveau', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600, fontSize: 12)),
            if (offre.gratuite && !widget.estCourante)
              const Text('Offert', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600, fontSize: 12)),
          ]),
          const SizedBox(height: 6),
          if (choix != null) ...[
            Text('${montantDevise(choix.montantTotal, choix.devise)} / ${choix.dureeMois} mois', style: AppTextStyles.price),
            Text(
              '${montantDevise(choix.prixMensuel, choix.devise)} par mois'
              '${choix.remisePourcent > 0 ? ' · remise ${choix.remisePourcent.toStringAsFixed(0)} %' : ''}',
              style: AppTextStyles.cardMeta,
            ),
            const SizedBox(height: 8),
            ApsSelectField<int>(
              initialValue: _duree,
              decoration: const InputDecoration(labelText: 'Durée', border: OutlineInputBorder(), isDense: true),
              items: [
                for (final d in offre.dureesDisponibles)
                  DropdownMenuItem(
                    value: d.dureeMois,
                    child: Text('${d.dureeMois} mois${d.remisePourcent > 0 ? ' (-${d.remisePourcent.toStringAsFixed(0)} %)' : ''}'),
                  ),
              ],
              onChanged: (v) => setState(() => _duree = v),
            ),
          ] else
            Text(indisponible?.message ?? 'Formule indisponible pour le moment.', style: AppTextStyles.cardMeta),
          const SizedBox(height: 8),
          for (final a in offre.avantages.libelles(widget.type))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Icon(Icons.check, size: 15, color: AppColors.success),
                const SizedBox(width: 6),
                Expanded(child: Text(a, style: const TextStyle(fontSize: 13, color: AppColors.ink))),
              ]),
            ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: choix == null || _envoi ? null : _souscrire,
              child: Text(_envoi ? 'Préparation…' : (choix != null && choix.montantTotal == 0 ? 'Activer' : 'Choisir cette formule')),
            ),
          ),
        ],
      ),
    );
  }
}

/* ============================ Paiement ============================ */

Future<void> _ouvrirPaiement(BuildContext context, String abonnementId, double montant, String devise, VoidCallback onRecharger) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _FeuillePaiement(abonnementId: abonnementId, montant: montant, devise: devise),
  );
  onRecharger();
}

enum _Etape { choix, mobileMoney, attente, carte, virement, reussi }

class _FeuillePaiement extends ConsumerStatefulWidget {
  const _FeuillePaiement({required this.abonnementId, required this.montant, required this.devise});

  final String abonnementId;
  final double montant;
  final String devise;

  @override
  ConsumerState<_FeuillePaiement> createState() => _FeuillePaiementState();
}

class _FeuillePaiementState extends ConsumerState<_FeuillePaiement> {
  _Etape _etape = _Etape.choix;
  bool _envoi = false;
  String? _erreur;
  CollecteMobileMoney? _collecte;
  InstructionsVirement? _virement;
  Timer? _sondage;
  int _essais = 0;
  late final _numero = TextEditingController(text: ref.read(authUtilisateurProvider)?.telephone ?? '');

  @override
  void dispose() {
    _sondage?.cancel();
    _numero.dispose();
    super.dispose();
  }

  Future<void> _executer(Future<void> Function() action) async {
    setState(() {
      _envoi = true;
      _erreur = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => _erreur = messageErreur(e));
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Future<bool> _verifierStatut() async {
    final statut = await appelPresenceUi(ref, (repo, token) => repo.statutAbonnement(widget.abonnementId, token: token));
    if (!mounted) return false;
    if (statut == 'actif') {
      _sondage?.cancel();
      setState(() => _etape = _Etape.reussi);
      return true;
    }
    if (statut == 'annule') {
      _sondage?.cancel();
      setState(() => _erreur = "Cette demande d'abonnement a expiré. Recommencez depuis la liste des formules.");
    }
    return false;
  }

  void _payerMobileMoney() {
    final numero = normaliserNumeroCM(_numero.text);
    if (numero == null) {
      setState(() => _erreur = 'Numéro Mobile Money camerounais invalide (ex. 6 77 12 34 56).');
      return;
    }
    _executer(() async {
      final c = await appelPresenceUi(ref, (repo, token) => repo.payerMobileMoney(widget.abonnementId, token: token, numero: numero));
      if (!mounted) return;
      setState(() {
        _collecte = c;
        _etape = _Etape.attente;
        _essais = 0;
      });
      _sondage?.cancel();
      // Suivi toutes les 5 s pendant 5 minutes au plus.
      _sondage = Timer.periodic(const Duration(seconds: 5), (t) async {
        if (++_essais > 60) {
          t.cancel();
          if (mounted) setState(() => _erreur = 'Paiement non confirmé pour le moment. Vérifiez plus tard depuis cet écran.');
          return;
        }
        try {
          await _verifierStatut();
        } catch (_) {
          // Réseau : on réessaie au tour suivant.
        }
      });
    });
  }

  void _payerCarte() {
    _executer(() async {
      final url = await appelPresenceUi(ref, (repo, token) => repo.urlPaiementCarte(widget.abonnementId, token: token));
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      if (mounted) setState(() => _etape = _Etape.carte);
    });
  }

  void _choisirVirement() {
    _executer(() async {
      final v = await appelPresenceUi(ref, (repo, token) => repo.choisirVirement(widget.abonnementId, token: token));
      if (mounted) {
        setState(() {
          _virement = v;
          _etape = _Etape.virement;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text("Paiement de l'abonnement", style: AppTextStyles.h3),
          const SizedBox(height: 4),
          Text("Total : ${montantDevise(widget.montant, widget.devise)} (frais éventuels de l'opérateur en sus).", style: AppTextStyles.cardMeta),
          const SizedBox(height: 14),
          ..._contenuEtape(),
          if (_erreur != null) ...[
            const SizedBox(height: 10),
            Text(_erreur!, style: const TextStyle(color: AppColors.dangerDark)),
          ],
        ],
      ),
    );
  }

  List<Widget> _contenuEtape() {
    switch (_etape) {
      case _Etape.choix:
        return [
          _Choix(icone: Icons.phone_android, titre: 'Mobile Money', sousTitre: 'MTN MoMo, Orange Money', onTap: _envoi ? null : () => setState(() => _etape = _Etape.mobileMoney)),
          _Choix(icone: Icons.credit_card, titre: 'Carte bancaire', sousTitre: 'Page de paiement sécurisée (navigateur)', onTap: _envoi ? null : _payerCarte),
          _Choix(icone: Icons.account_balance_outlined, titre: 'Virement', sousTitre: 'Activation à réception des fonds', onTap: _envoi ? null : _choisirVirement),
        ];
      case _Etape.mobileMoney:
        return [
          TextField(
            controller: _numero,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Numéro Mobile Money', hintText: '6 77 12 34 56', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: _envoi ? null : _payerMobileMoney, child: Text(_envoi ? 'Envoi…' : 'Payer')),
          TextButton(onPressed: () => setState(() => _etape = _Etape.choix), child: const Text('Autre moyen de paiement')),
        ];
      case _Etape.attente:
        return [
          const Center(child: CircularProgressIndicator()),
          const SizedBox(height: 12),
          Text(
            _collecte?.ussdCode != null
                ? 'Validez le paiement sur votre téléphone (ou composez ${_collecte!.ussdCode}). Cet écran se met à jour automatiquement.'
                : 'Validez le paiement sur votre téléphone. Cet écran se met à jour automatiquement.',
            textAlign: TextAlign.center,
            style: AppTextStyles.body,
          ),
        ];
      case _Etape.carte:
        return [
          const Text('Terminez le paiement dans le navigateur, puis revenez ici et vérifiez.', style: AppTextStyles.body),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _envoi
                ? null
                : () => _executer(() async {
                      if (!await _verifierStatut() && mounted && _erreur == null) {
                        setState(() => _erreur = 'Paiement pas encore reçu. Réessayez dans quelques instants.');
                      }
                    }),
            child: const Text("J'ai payé, vérifier"),
          ),
        ];
      case _Etape.virement:
        final v = _virement!;
        return [
          Text('Montant : ${montantDevise(v.montant, v.devise)}', style: AppTextStyles.cardTitle),
          SelectableText('Référence : ${v.reference}', style: AppTextStyles.body),
          const SizedBox(height: 8),
          Text(v.instructions, style: AppTextStyles.cardMeta),
          const SizedBox(height: 12),
          FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Compris')),
        ];
      case _Etape.reussi:
        return [
          const Icon(Icons.verified, size: 48, color: AppColors.success),
          const SizedBox(height: 8),
          const Text('Paiement reçu : votre abonnement est actif.', textAlign: TextAlign.center, style: AppTextStyles.body),
          const SizedBox(height: 12),
          FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Fermer')),
        ];
    }
  }
}

class _Choix extends StatelessWidget {
  const _Choix({required this.icone, required this.titre, required this.sousTitre, this.onTap});

  final IconData icone;
  final String titre;
  final String sousTitre;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Card(
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: AppColors.line)),
        child: ListTile(
          leading: Icon(icone, color: AppColors.primary),
          title: Text(titre, style: AppTextStyles.cardTitle),
          subtitle: Text(sousTitre, style: AppTextStyles.cardMeta),
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        ),
      );
}
