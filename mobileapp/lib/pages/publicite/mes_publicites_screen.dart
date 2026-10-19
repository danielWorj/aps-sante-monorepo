// lib/pages/publicite/mes_publicites_screen.dart
//
// Portail annonceur (v9), miroir de PortailAnnonceur.jsx :
//   - [MesPublicitesScreen] : résumé (publicités, en diffusion, affichages,
//     clics) et liste des réservations avec leur statut ;
//   - [DetailPubliciteScreen] : statistiques jour par jour, motif de refus,
//     paiement d'une publicité acceptée, retrait d'une demande non payée.
//
// Paiement (feuille [_FeuillePaiementPublicite]) : facture récapitulative
// recalculée par le serveur selon le moyen (montant initial, frais
// d'agrégateur, total), Mobile Money dans l'app avec suivi du statut, ou
// carte bancaire (page Stripe dans le navigateur) — même parcours que le
// paiement d'un abonnement assurance.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../components/style/colors.dart';
import '../../components/style/text_styles.dart';
import '../../controllers/annonceur_publicite_controller.dart';
import '../../controllers/authentification_controller.dart';
import '../../models/annonceur_publicite_models.dart';
import '../../utils/fonds.dart';
import '../../utils/mobile_money.dart';
import 'reserver_publicite_screen.dart';

Future<void> _deconnecter(BuildContext context, WidgetRef ref) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: const Text('Déconnexion'),
      content: const Text('Se déconnecter de votre espace annonceur ?'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Annuler')),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Se déconnecter')),
      ],
    ),
  );
  if (ok != true) return;
  try {
    await ref.read(sessionControllerProvider.notifier).deconnecter();
  } catch (_) {
    // Session déjà fermée localement (voir SessionController.deconnecter).
  }
  if (context.mounted) Navigator.of(context).popUntil((r) => r.isFirst);
}

String _nombre(int n) => n.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ' ');

Color _couleurStatut(MaPublicite p) {
  if (p.enDiffusion) return AppColors.success;
  return switch (p.statut) {
    StatutPublicite.enAttentePaiement => AppColors.primary,
    StatutPublicite.enModeration => AppColors.warning,
    StatutPublicite.rejetee => AppColors.danger,
    _ => AppColors.inkSoft,
  };
}

class _Pastille extends StatelessWidget {
  const _Pastille(this.p);
  final MaPublicite p;

  @override
  Widget build(BuildContext context) {
    final c = _couleurStatut(p);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: c.withValues(alpha: .12), borderRadius: BorderRadius.circular(20)),
      child: Text(p.enDiffusion ? 'En diffusion' : p.statut.libelle,
          style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi(this.libelle, this.valeur);
  final String libelle;
  final String valeur;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(10),
          margin: const EdgeInsets.symmetric(horizontal: 3),
          decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.line)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(libelle, style: AppTextStyles.cardMeta),
            Text(valeur, style: AppTextStyles.h3),
          ]),
        ),
      );
}

/* ============================== Liste ============================== */

class MesPublicitesScreen extends ConsumerWidget {
  const MesPublicitesScreen({super.key, this.espaceAnnonceur = false});

  /// Ouvert comme espace d'un compte « annonceur » (« Mon espace ») :
  /// ajoute la déconnexion, ce rôle n'ayant pas d'autre écran.
  final bool espaceAnnonceur;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final etat = ref.watch(mesPublicitesProvider);
    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(
        title: const Text('Mes publicités'),
        actions: [
          if (espaceAnnonceur)
            IconButton(
              tooltip: 'Se déconnecter',
              icon: const Icon(Icons.logout),
              onPressed: () => _deconnecter(context, ref),
            ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ReserverPubliciteScreen())),
        icon: const Icon(Icons.add),
        label: const Text('Réserver un espace'),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(mesPublicitesProvider.future),
        child: etat.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [
            Padding(padding: const EdgeInsets.all(24), child: Text('$e', style: const TextStyle(color: AppColors.dangerDark))),
          ]),
          data: (d) => ListView(
            padding: const EdgeInsets.fromLTRB(13, 12, 13, 100),
            children: [
              Row(children: [
                _Kpi('Publicités', '${d.resume.total}'),
                _Kpi('En diffusion', '${d.resume.enDiffusion}'),
              ]),
              const SizedBox(height: 6),
              Row(children: [
                _Kpi('Affichages', _nombre(d.resume.impressions)),
                _Kpi('Clics', _nombre(d.resume.clics)),
              ]),
              if (d.resume.aPayer > 0)
                Card(
                  color: AppColors.primaryLight,
                  elevation: 0,
                  margin: const EdgeInsets.only(top: 12),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text('${d.resume.aPayer} publicité(s) acceptée(s) à payer avant la date limite pour garder votre position.'),
                  ),
                ),
              const SizedBox(height: 12),
              if (d.publicites.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Vous n’avez encore réservé aucun espace.', textAlign: TextAlign.center),
                ),
              for (final p in d.publicites)
                Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: AppColors.line)),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () async {
                      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => DetailPubliciteScreen(publiciteId: p.id)));
                      ref.invalidate(mesPublicitesProvider);
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(10),
                      child: Row(children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(p.visuelUrl, width: 64, height: 48, fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => const SizedBox(width: 64, height: 48)),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(p.titre, style: AppTextStyles.cardTitle, maxLines: 1, overflow: TextOverflow.ellipsis),
                            Text('${p.emplacement} · ${libellePosition(p.rang)}', style: AppTextStyles.cardMeta),
                            Text('${jourLisible(p.dateDebut)} → ${jourLisible(dernierJour(p.dateFin))}', style: AppTextStyles.cardMeta),
                            const SizedBox(height: 4),
                            Row(children: [
                              _Pastille(p),
                              const Spacer(),
                              Text('${_nombre(p.impressions)} aff. · ${_nombre(p.clics)} clics', style: AppTextStyles.cardMeta),
                            ]),
                          ]),
                        ),
                      ]),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/* ============================== Détail ============================== */

class DetailPubliciteScreen extends ConsumerStatefulWidget {
  const DetailPubliciteScreen({super.key, required this.publiciteId});
  final String publiciteId;

  @override
  ConsumerState<DetailPubliciteScreen> createState() => _DetailPubliciteScreenState();
}

class _DetailPubliciteScreenState extends ConsumerState<DetailPubliciteScreen> {
  MaPublicite? _pub;
  StatistiquesPublicite? _stats;
  String? _erreur;
  bool _occupe = false;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<void> _charger() async {
    try {
      final p = await appelAnnonceur(ref, (repo, token) => repo.publicite(widget.publiciteId, token: token));
      if (!mounted) return;
      setState(() { _pub = p; _erreur = null; });
      if (p.statut == StatutPublicite.payee || p.statut == StatutPublicite.expiree) {
        final s = await appelAnnonceur(ref, (repo, token) => repo.statistiques(widget.publiciteId, token: token));
        if (mounted) setState(() => _stats = s);
      }
    } catch (e) {
      if (mounted) setState(() => _erreur = '$e');
    }
  }

  Future<void> _retirer() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Retirer cette demande ?'),
        content: const Text('Elle ne pourra pas être reprise.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Non')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Retirer')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _occupe = true);
    try {
      await appelAnnonceur(ref, (repo, token) => repo.annulerDemande(widget.publiciteId, token: token));
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() { _erreur = '$e'; _occupe = false; });
    }
  }

  Future<void> _payer() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _FeuillePaiementPublicite(publiciteId: widget.publiciteId),
    );
    _charger();
  }

  @override
  Widget build(BuildContext context) {
    final p = _pub;
    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(title: const Text('Ma publicité')),
      body: p == null
          ? Center(child: _erreur != null ? Text(_erreur!, style: const TextStyle(color: AppColors.dangerDark)) : const CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _charger,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: AspectRatio(aspectRatio: 4 / 3, child: Image.network(p.visuelUrl, fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => Container(color: AppColors.line))),
                  ),
                  const SizedBox(height: 10),
                  Row(children: [_Pastille(p)]),
                  const SizedBox(height: 6),
                  Text(p.titre, style: AppTextStyles.h3),
                  if (p.description != null) Text(p.description!, style: AppTextStyles.body),
                  const SizedBox(height: 8),
                  _Info('Emplacement', '${p.emplacement} · ${libellePosition(p.rang)}'),
                  _Info('Diffusion', '${jourLisible(p.dateDebut)} → ${jourLisible(dernierJour(p.dateFin))}'),
                  _Info('Montant', montantDevise(p.montant, p.devise)),
                  if (p.telephoneContact != null) _Info('Contact affiché', p.telephoneContact!),
                  if (p.factureNumero != null) _Info('Facture', p.factureNumero!),
                  if (p.statut == StatutPublicite.rejetee && p.motifRejet != null)
                    Card(
                      color: AppColors.danger.withValues(alpha: .08),
                      elevation: 0,
                      child: Padding(padding: const EdgeInsets.all(12), child: Text('Motif du refus : ${p.motifRejet}')),
                    ),
                  if (p.statut == StatutPublicite.enAttentePaiement) ...[
                    const SizedBox(height: 8),
                    if (p.dateLimitePaiement != null)
                      Text('À régler avant le ${jourLisible(p.dateLimitePaiement)} '
                          'à ${p.dateLimitePaiement!.toLocal().hour.toString().padLeft(2, '0')}:${p.dateLimitePaiement!.toLocal().minute.toString().padLeft(2, '0')}.',
                          style: AppTextStyles.cardMeta),
                    const SizedBox(height: 6),
                    FilledButton.icon(onPressed: _payer, icon: const Icon(Icons.lock_outline), label: const Text('Payer ma publicité')),
                  ],
                  if (p.statut == StatutPublicite.enModeration || p.statut == StatutPublicite.enAttentePaiement)
                    TextButton(onPressed: _occupe ? null : _retirer, child: const Text('Retirer ma demande')),
                  const SizedBox(height: 14),
                  Text('Statistiques de diffusion', style: AppTextStyles.cardTitle),
                  const SizedBox(height: 8),
                  if (_stats == null)
                    const Text('Les statistiques s’afficheront dès que votre publicité sera diffusée.', style: AppTextStyles.cardMeta)
                  else ...[
                    Row(children: [
                      _Kpi('Affichages', _nombre(_stats!.impressions)),
                      _Kpi('Clics', _nombre(_stats!.clics)),
                      _Kpi('Taux de clic', '${_stats!.tauxClic} %'),
                    ]),
                    const SizedBox(height: 12),
                    _Graphique(serie: _stats!.serie),
                  ],
                  if (_erreur != null) Text(_erreur!, style: const TextStyle(color: AppColors.dangerDark)),
                ],
              ),
            ),
    );
  }
}

class _Info extends StatelessWidget {
  const _Info(this.libelle, this.valeur);
  final String libelle;
  final String valeur;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 120, child: Text(libelle, style: AppTextStyles.cardMeta)),
          Expanded(child: Text(valeur, style: AppTextStyles.body)),
        ]),
      );
}

/// Affichages par jour (barres) ; appui long sur une barre pour le détail.
class _Graphique extends StatelessWidget {
  const _Graphique({required this.serie});
  final List<JourStatistique> serie;

  @override
  Widget build(BuildContext context) {
    if (serie.isEmpty) return const Text('La courbe apparaîtra dès le premier jour de diffusion.', style: AppTextStyles.cardMeta);
    final max = serie.map((j) => j.impressions).fold<int>(1, (a, b) => b > a ? b : a);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SizedBox(
        height: 140,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (final j in serie)
              Expanded(
                child: Tooltip(
                  message: '${jourLisible(j.jour)} : ${j.impressions} affichages, ${j.clics} clics',
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 1),
                    height: 2 + 136 * j.impressions / max,
                    decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(2)),
                  ),
                ),
              ),
          ],
        ),
      ),
      const SizedBox(height: 4),
      Row(children: [
        Text(jourLisible(serie.first.jour), style: AppTextStyles.cardMeta),
        const Spacer(),
        const Text('Affichages par jour', style: AppTextStyles.cardMeta),
        const Spacer(),
        Text(jourLisible(serie.last.jour), style: AppTextStyles.cardMeta),
      ]),
    ]);
  }
}

/* ============================== Paiement ============================== */

enum _Etape { choix, mobileMoney, attente, carte, reussi }

class _FeuillePaiementPublicite extends ConsumerStatefulWidget {
  const _FeuillePaiementPublicite({required this.publiciteId});
  final String publiciteId;

  @override
  ConsumerState<_FeuillePaiementPublicite> createState() => _FeuillePaiementPubliciteState();
}

class _FeuillePaiementPubliciteState extends ConsumerState<_FeuillePaiementPublicite> {
  _Etape _etape = _Etape.choix;
  String _agregateur = 'campay';
  final Map<String, DevisPublicite?> _devis = {};
  final Map<String, String> _erreursDevis = {};
  bool _envoi = false;
  String? _erreur;
  CollectePublicite? _collecte;
  Timer? _sondage;
  int _essais = 0;
  late final _numero = TextEditingController(text: ref.read(authUtilisateurProvider)?.telephone ?? '');

  @override
  void initState() {
    super.initState();
    for (final a in const ['campay', 'stripe']) {
      appelAnnonceur(ref, (repo, token) => repo.devis(widget.publiciteId, a, token: token))
          .then((d) { if (mounted) setState(() => _devis[a] = d); })
          .catchError((e) { if (mounted) setState(() => _erreursDevis[a] = '$e'); });
    }
  }

  @override
  void dispose() {
    _sondage?.cancel();
    _numero.dispose();
    super.dispose();
  }

  Future<void> _executer(Future<void> Function() action) async {
    setState(() { _envoi = true; _erreur = null; });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => _erreur = '$e');
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Future<bool> _verifier() async {
    final s = await appelAnnonceur(ref, (repo, token) => repo.statutPaiement(widget.publiciteId, token: token));
    if (!mounted) return false;
    if (s.statut == 'payee') {
      _sondage?.cancel();
      setState(() => _etape = _Etape.reussi);
      return true;
    }
    if (s.tentativeCampay == 'echouee' && _etape == _Etape.attente) {
      _sondage?.cancel();
      setState(() { _etape = _Etape.mobileMoney; _erreur = 'Le paiement a été refusé ou n’a pas été validé. Réessayez.'; });
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
      final c = await appelAnnonceur(ref, (repo, token) => repo.payerMobileMoney(widget.publiciteId, numero: numero, token: token));
      if (!mounted) return;
      setState(() { _collecte = c; _etape = _Etape.attente; _essais = 0; });
      _sondage?.cancel();
      _sondage = Timer.periodic(const Duration(seconds: 5), (t) async {
        if (++_essais > 60) {
          t.cancel();
          if (mounted) setState(() => _erreur = 'Paiement non confirmé pour le moment. Vérifiez plus tard depuis votre publicité.');
          return;
        }
        try {
          await _verifier();
        } catch (_) {
          // Réseau : nouvel essai au tour suivant.
        }
      });
    });
  }

  void _payerCarte() {
    _executer(() async {
      final url = await appelAnnonceur(ref, (repo, token) => repo.urlPaiementCarte(widget.publiciteId, token: token));
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      if (mounted) setState(() => _etape = _Etape.carte);
    });
  }

  Widget _facture() {
    final d = _devis[_agregateur];
    if (_erreursDevis[_agregateur] != null) {
      return Text(_erreursDevis[_agregateur]!, style: const TextStyle(color: AppColors.dangerDark));
    }
    if (d == null) return const LinearProgressIndicator();
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.line)),
      child: Column(children: [
        for (final l in d.lignes)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: Text(l.libelle, style: AppTextStyles.cardMeta)),
              Text(montantDevise(l.montant, d.devise)),
            ]),
          ),
        const Divider(),
        _LigneTotal('Montant initial', montantDevise(d.montantInitial, d.devise)),
        _LigneTotal('Frais agrégateur', montantDevise(d.fraisAgregateur, d.devise)),
        _LigneTotal('Montant final', montantDevise(d.total, d.devise), gras: true),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Paiement de la publicité', style: AppTextStyles.h3),
            const SizedBox(height: 10),
            if (_etape == _Etape.choix || _etape == _Etape.mobileMoney) ...[
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'campay', label: Text('Mobile Money'), icon: Icon(Icons.phone_android)),
                  ButtonSegment(value: 'stripe', label: Text('Carte'), icon: Icon(Icons.credit_card)),
                ],
                selected: {_agregateur},
                onSelectionChanged: (s) => setState(() { _agregateur = s.first; _etape = _Etape.choix; }),
              ),
              const SizedBox(height: 10),
              _facture(),
              const SizedBox(height: 12),
            ],
            ..._contenu(),
            if (_erreur != null) ...[
              const SizedBox(height: 10),
              Text(_erreur!, style: const TextStyle(color: AppColors.dangerDark)),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _contenu() {
    final dispo = _devis[_agregateur] != null;
    switch (_etape) {
      case _Etape.choix:
        if (_agregateur == 'campay') {
          return [
            TextField(
              controller: _numero,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Numéro Mobile Money', hintText: '6 77 12 34 56', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _envoi || !dispo || _devis['campay']?.campayDisponible == false ? null : _payerMobileMoney,
              child: Text(_envoi ? 'Envoi…' : 'Payer par Mobile Money'),
            ),
          ];
        }
        return [
          FilledButton(onPressed: _envoi || !dispo ? null : _payerCarte, child: Text(_envoi ? 'Ouverture…' : 'Payer par carte (navigateur)')),
        ];
      case _Etape.mobileMoney:
        return [
          FilledButton(onPressed: () => setState(() => _etape = _Etape.choix), child: const Text('Réessayer')),
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
                      if (!await _verifier() && mounted && _erreur == null) {
                        setState(() => _erreur = 'Paiement pas encore reçu. Réessayez dans quelques instants.');
                      }
                    }),
            child: const Text("J'ai payé, vérifier"),
          ),
        ];
      case _Etape.reussi:
        return [
          const Icon(Icons.verified, size: 48, color: AppColors.success),
          const SizedBox(height: 8),
          const Text(
            'Paiement reçu : votre publicité est programmée. La confirmation et votre facture vous ont été envoyées par WhatsApp.',
            textAlign: TextAlign.center,
            style: AppTextStyles.body,
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Fermer')),
        ];
    }
  }
}

class _LigneTotal extends StatelessWidget {
  const _LigneTotal(this.libelle, this.valeur, {this.gras = false});
  final String libelle;
  final String valeur;
  final bool gras;

  @override
  Widget build(BuildContext context) {
    final style = gras ? AppTextStyles.cardTitle : AppTextStyles.body;
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Row(children: [Text(libelle, style: style), const Spacer(), Text(valeur, style: style)]),
    );
  }
}
