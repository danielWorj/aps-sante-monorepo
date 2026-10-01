// lib/pages/portails/medecin/portefeuille_retraits_card.dart
//
// Carte « Portefeuille & retraits » du profil médecin. Miroir de
// client-plateform/.../medecin-portefeuille.jsx.
//
// Le solde et les statuts viennent TOUJOURS du serveur (RetraitController). Tant qu'un
// retrait est actif (en attente de validation / en cours), la carte se rafraîchit toute seule.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../components/dialogs/dialogue_retrait.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/retrait_controller.dart';
import '../../../models/rendez_vous_models.dart'
    show AmendeEnAttente, MouvementPortefeuille, PortefeuilleMedecin;
import '../../../repositories/rendez_vous_repository.dart' show ApiException;
import '../../../repositories/retrait_repository.dart';
import '../../../utils/fonds.dart' as fonds;

String _fcfa(int n) {
  final s = n.abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write('\u202F');
    buf.write(s[i]);
  }
  return '${n < 0 ? '-' : ''}$buf FCFA';
}

String _masquer(String numero) => numero.length > 7
    ? '${numero.substring(0, 5)}••••${numero.substring(numero.length - 2)}'
    : numero;

String _dateCourte(DateTime? d) {
  if (d == null) return '';
  String deux(int v) => v.toString().padLeft(2, '0');
  return '${deux(d.day)}/${deux(d.month)} ${deux(d.hour)}:${deux(d.minute)}';
}

/// Libellés des mouvements (mêmes textes que le web). Le signe vient du préfixe du type
/// (`credit_` / `debit_`) ; les types de l'ancienne politique sont conservés pour lire
/// l'historique. Un type inconnu s'affiche tel quel.
const Map<String, String> _libellesMouvements = {
  'credit_honoraires': 'Honoraires libérés (moins commission APS)',
  'debit_retrait': 'Retrait',
  'credit_annulation_retrait': 'Retrait rejeté ou échoué (recrédit)',
  'debit_amende': 'Amende (reversée à APS)',
  // Obsolètes (ancienne politique).
  'debit_retenue_annulation_tardive': 'Retenue pour annulation tardive (ancienne politique)',
  'debit_frais_no_show': 'Frais d\u2019absence (ancienne politique)',
  'credit_frais_annulation': 'Frais d\u2019annulation (ancienne politique)',
};

/// Taux (fraction) en pourcentage français : 0.15 → « 15 % », 0.125 → « 12,5 % ».
String _pourcent(double taux) {
  final v = (taux * 100 * 100).round() / 100;
  final texte = v == v.roundToDouble() ? v.round().toString() : v.toString().replaceAll('.', ',');
  return '$texte\u00A0%';
}

class PortefeuilleRetraitsCard extends ConsumerStatefulWidget {
  const PortefeuilleRetraitsCard({super.key, required this.medecinId});

  final String medecinId;

  @override
  ConsumerState<PortefeuilleRetraitsCard> createState() =>
      _PortefeuilleRetraitsCardState();
}

class _PortefeuilleRetraitsCardState
    extends ConsumerState<PortefeuilleRetraitsCard> {
  static const Duration _intervalleRafraichissement = Duration(seconds: 15);

  Timer? _timer;
  bool _envoiEnCours = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _charger());
    _timer = Timer.periodic(_intervalleRafraichissement, (_) {
      // Rafraîchissement automatique uniquement tant qu'un retrait attend son issue.
      final actif = ref.read(retraitControllerProvider).value?.aUnRetraitActif ?? false;
      if (actif) _charger();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _charger() async {
    final token = ref.read(authTokenProvider);
    if (token == null) return;
    // Mouvements et amendes : second appel (/portefeuille), lancé en parallèle et isolé —
    // son échec n'invalide ni le solde ni les retraits (le contrôleur ne lève jamais).
    unawaited(ref
        .read(portefeuilleLedgerControllerProvider.notifier)
        .charger(medecinId: widget.medecinId, token: token));
    await ref
        .read(retraitControllerProvider.notifier)
        .charger(medecinId: widget.medecinId, token: token);
  }

  void _afficher(String texte, {bool erreur = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(texte),
      backgroundColor: erreur ? AppColors.dangerDark : AppColors.primary,
    ));
  }

  Future<void> _demanderRetrait(PortefeuilleRetraits p) async {
    if (_envoiEnCours) return;
    final token = ref.read(authTokenProvider);
    if (token == null) return;

    final saisie = await demanderSaisieRetrait(
      context,
      numeros: p.numeros,
      solde: p.solde,
      montantMin: p.montantMin,
      montantMax: p.montantMax,
    );
    if (saisie == null || !mounted) return;

    setState(() => _envoiEnCours = true);
    try {
      await ref.read(retraitControllerProvider.notifier).demander(
            medecinId: widget.medecinId,
            mobileMoneyId: saisie.mobileMoneyId,
            montant: saisie.montant,
            token: token,
          );
      _afficher('Demande enregistrée : le montant est réservé jusqu\'à sa validation.');
    } on ApiException catch (e) {
      _afficher(e.message, erreur: true);
    } catch (_) {
      _afficher('La demande a échoué. Réessayez dans un instant.', erreur: true);
    } finally {
      if (mounted) setState(() => _envoiEnCours = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final etat = ref.watch(retraitControllerProvider);
    final portefeuille = etat.value;
    final etatLedger = ref.watch(portefeuilleLedgerControllerProvider);

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.account_balance_wallet_outlined,
                  size: 18, color: AppColors.primary),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('Portefeuille & retraits', style: AppTextStyles.cardTitle),
              ),
              IconButton(
                tooltip: 'Actualiser',
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.refresh_rounded, size: 18, color: AppColors.inkSoft),
                onPressed: etat.isLoading ? null : _charger,
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (portefeuille == null)
            _EtatInitial(etat: etat, onReessayer: _charger)
          else
            _Contenu(
              portefeuille: portefeuille,
              ledger: etatLedger.value,
              ledgerIndisponible: etatLedger.hasError && etatLedger.value == null,
              envoiEnCours: _envoiEnCours,
              onDemander: () => _demanderRetrait(portefeuille),
            ),
        ],
      ),
    );
  }
}

/// Premier chargement (aucune donnée précédente) : spinner ou erreur avec « Réessayer ».
class _EtatInitial extends StatelessWidget {
  const _EtatInitial({required this.etat, required this.onReessayer});

  final AsyncValue<PortefeuilleRetraits?> etat;
  final Future<void> Function() onReessayer;

  @override
  Widget build(BuildContext context) {
    if (etat.hasError) {
      final e = etat.error;
      final message = e is ApiException
          ? e.message
          : 'Impossible de charger votre portefeuille pour le moment.';
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(message,
              style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft)),
          const SizedBox(height: 10),
          AppOutlineButton(
            label: 'Réessayer',
            icon: Icons.refresh_rounded,
            onPressed: onReessayer,
          ),
        ],
      );
    }
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 12),
      child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
    );
  }
}

class _Contenu extends StatelessWidget {
  const _Contenu({
    required this.portefeuille,
    required this.ledger,
    required this.ledgerIndisponible,
    required this.envoiEnCours,
    required this.onDemander,
  });

  final PortefeuilleRetraits portefeuille;
  final PortefeuilleMedecin? ledger;
  final bool ledgerIndisponible;
  final bool envoiEnCours;
  final VoidCallback onDemander;

  @override
  Widget build(BuildContext context) {
    final p = portefeuille;
    final peutRetirer = p.numeros.isNotEmpty &&
        p.solde >= p.montantMin &&
        !p.aUnRetraitActif &&
        !envoiEnCours;

    String? indice;
    if (p.numeros.isEmpty) {
      indice = 'Aucun numéro Mobile Money configuré : contactez l\'administration ApSa.';
    } else if (p.aUnRetraitActif) {
      indice = 'Une demande est déjà en cours de traitement.';
    } else if (p.solde < p.montantMin) {
      indice = 'Solde inférieur au minimum de retrait (${_fcfa(p.montantMin)}).';
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.primarySurface,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Solde disponible',
                  style: TextStyle(fontSize: 12, color: AppColors.inkSoft)),
              const SizedBox(height: 2),
              Text(_fcfa(p.solde),
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primaryDark,
                  )),
            ],
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
            onPressed: peutRetirer ? onDemander : null,
            icon: envoiEnCours
                ? const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.send_rounded, size: 16),
            label: const Text('Retirer mes honoraires'),
          ),
        ),
        if (indice != null) ...[
          const SizedBox(height: 6),
          Text(indice, style: const TextStyle(fontSize: 11.5, color: AppColors.inkSoft)),
        ],
        const SizedBox(height: 14),
        const Text('Mes retraits',
            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.inkSoft)),
        const SizedBox(height: 6),
        if (p.retraits.isEmpty)
          const Text('Aucun retrait pour le moment.',
              style: TextStyle(fontSize: 12.5, color: AppColors.inkFaint))
        else
          for (final r in p.retraits) _LigneRetrait(retrait: r),
        if (ledger != null && ledger!.amendesEnAttente.isNotEmpty)
          _BlocAmendes(amendes: ledger!.amendesEnAttente),
        const SizedBox(height: 14),
        const Text('Derniers mouvements',
            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.inkSoft)),
        const SizedBox(height: 6),
        if (ledger == null)
          Text(
            ledgerIndisponible
                ? 'Mouvements momentanément indisponibles.'
                : 'Chargement des mouvements…',
            style: const TextStyle(fontSize: 12.5, color: AppColors.inkFaint),
          )
        else if (ledger!.mouvements.isEmpty)
          const Text('Aucun mouvement.',
              style: TextStyle(fontSize: 12.5, color: AppColors.inkFaint))
        else
          _ListeMouvements(mouvements: ledger!.mouvements),
      ],
    );
  }
}

/// Amendes en attente d'imputation : sans montant (calculé à la prochaine libération),
/// seul le taux retenu est exposé par le serveur.
class _BlocAmendes extends StatelessWidget {
  const _BlocAmendes({required this.amendes});

  final List<AmendeEnAttente> amendes;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.warningLight,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${amendes.length} amende(s) en attente.',
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          const Text(
            'Elle(s) sera(ont) déduite(s) de votre prochaine libération de fonds '
            '(montant calculé à ce moment-là).',
            style: TextStyle(fontSize: 12, color: AppColors.inkSoft),
          ),
          const SizedBox(height: 6),
          for (final a in amendes)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                'Taux ${_pourcent(a.tauxApplique)} · enregistrée le ${fonds.dateCourte(a.dateCreation)}',
                style: const TextStyle(fontSize: 11.5, color: AppColors.inkSoft),
              ),
            ),
        ],
      ),
    );
  }
}

/// Derniers mouvements : 10 affichés, le reste (50 au plus côté serveur) sur demande.
class _ListeMouvements extends StatefulWidget {
  const _ListeMouvements({required this.mouvements});

  final List<MouvementPortefeuille> mouvements;

  @override
  State<_ListeMouvements> createState() => _ListeMouvementsState();
}

class _ListeMouvementsState extends State<_ListeMouvements> {
  static const int _apercu = 10;
  bool _toutAfficher = false;

  @override
  Widget build(BuildContext context) {
    final tous = widget.mouvements;
    final visibles = _toutAfficher ? tous : tous.take(_apercu).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final m in visibles) _LigneMouvement(mouvement: m),
        if (tous.length > _apercu)
          TextButton(
            onPressed: () => setState(() => _toutAfficher = !_toutAfficher),
            child: Text(_toutAfficher ? 'Réduire' : 'Afficher tout (${tous.length})'),
          ),
      ],
    );
  }
}

class _LigneMouvement extends StatelessWidget {
  const _LigneMouvement({required this.mouvement});

  final MouvementPortefeuille mouvement;

  @override
  Widget build(BuildContext context) {
    final m = mouvement;
    final libelle = _libellesMouvements[m.type] ?? m.type;
    final credit = m.estCredit;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(libelle, style: const TextStyle(fontSize: 13)),
                const SizedBox(height: 2),
                Text(fonds.dateCourte(m.dateCreation),
                    style: const TextStyle(fontSize: 11.5, color: AppColors.inkFaint)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Signe selon le préfixe du type ; le montant serveur est toujours positif.
          Text(
            '${credit ? '+' : '\u2212'}${fonds.fcfa(m.montant)}',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: credit ? AppColors.success : AppColors.dangerDark,
            ),
          ),
        ],
      ),
    );
  }
}

class _LigneRetrait extends StatelessWidget {
  const _LigneRetrait({required this.retrait});

  final DemandeRetrait retrait;

  ({Color fond, Color texte}) get _couleurs {
    switch (retrait.statut) {
      case StatutRetrait.reussie:
        return (fond: AppColors.successLight, texte: AppColors.success);
      case StatutRetrait.echouee:
      case StatutRetrait.rejetee:
        return (fond: AppColors.dangerLight, texte: AppColors.dangerDark);
      case StatutRetrait.enAttenteValidation:
        return (fond: AppColors.warningLight, texte: AppColors.warning);
      case StatutRetrait.enCours:
        return (fond: AppColors.primaryLight, texte: AppColors.primary);
      case StatutRetrait.inconnu:
        return (fond: AppColors.paper, texte: AppColors.inkSoft);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = _couleurs;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_fcfa(retrait.montant),
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text('→ ${_masquer(retrait.numero)} · ${_dateCourte(retrait.dateCreation)}',
                    style: const TextStyle(fontSize: 11.5, color: AppColors.inkFaint)),
                if (retrait.statut == StatutRetrait.rejetee &&
                    (retrait.motifRejet ?? '').isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text('Motif : ${retrait.motifRejet}',
                        style: const TextStyle(fontSize: 11.5, color: AppColors.dangerDark)),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: c.fond, borderRadius: BorderRadius.circular(20)),
            child: Text(retrait.statut.libelle,
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: c.texte)),
          ),
        ],
      ),
    );
  }
}