// lib/components/panels/panneau_reprogrammation.dart
//
// Politique de fonds v2 §5 — reprogrammation d'un RDV `a_reprogrammer`
// (« deux absents »). Équivalent de reprogrammation-panel.jsx côté
// client-plateform :
//   - le patient OU le médecin propose un créneau LIBRE et futur de
//     l'agenda du médecin ;
//   - l'AUTRE partie accepte (et inversement) ; une nouvelle proposition
//     remplace la précédente ; le délai de 48 h ne se prolonge jamais ;
//   - à l'acceptation : RDV `confirme` sur le nouveau créneau, aucun
//     nouveau paiement ;
//   - sans accord dans le délai, le serveur rembourse automatiquement le
//     patient (H − CM − F, CP conservée par APS : D3). Le texte affiché au
//     patient ne donne que le principe, jamais le montant de la part
//     médecin (CM) ; le médecin ne voit jamais CP ni le détail du
//     remboursement du patient (D7).
//
// Le front affiche, le serveur décide : créneau libre, futur, auteur de la
// proposition et délai sont tous revalidés côté serveur. Ici : affichage,
// saisie et gestion des refus (409 : créneau pris ou proposition modifiée →
// on recharge).
//
// Dates : les créneaux de l'agenda sont « épinglés en UTC » (voir
// agenda_models.dart). La date proposée s'affiche donc sans conversion de
// fuseau ([dateHeureUtc]), comme les heures des créneaux ; seule l'échéance,
// qui est un instant réel, s'affiche dans le fuseau local ([dateHeure]).
//
// Volontairement NON exporté par components.dart : il dépend de la couche
// contrôleurs/modèles, comme avertissement_annulation.dart.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../controllers/agenda_controller.dart';
import '../../controllers/authentification_controller.dart';
import '../../controllers/rendez_vous_controller.dart';
import '../../models/agenda_models.dart';
import '../../models/rendez_vous_models.dart';
import '../../repositories/rendez_vous_repository.dart' show ApiException;
import '../../utils/fonds.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';

/// Message d'erreur lisible : le texte du serveur pour une [ApiException],
/// sinon [repli].
String _messageErreur(Object e, String repli) {
  if (e is ApiException && e.message.isNotEmpty) return e.message;
  return repli;
}

class _RetourPanneau {
  final bool succes;
  final String texte;
  const _RetourPanneau({required this.succes, required this.texte});
}

class PanneauReprogrammation extends ConsumerStatefulWidget {
  const PanneauReprogrammation({
    super.key,
    required this.rdv,
    required this.role,
    this.onChange,
  });

  /// Rendez-vous au statut `a_reprogrammer`.
  final RendezVous rdv;

  /// Partie qui consulte : sert à savoir qui a proposé et qui peut accepter.
  final PartieRendezVous role;

  /// Appelé après une proposition ou une acceptation réussie (la liste des
  /// RDV est déjà rechargée par [ActionsRendezVousController]).
  final VoidCallback? onChange;

  @override
  ConsumerState<PanneauReprogrammation> createState() =>
      _PanneauReprogrammationState();
}

class _PanneauReprogrammationState
    extends ConsumerState<PanneauReprogrammation> {
  Timer? _minuteur;
  DateTime _maintenant = DateTime.now();
  bool _selecteurOuvert = false;
  String? _choixIso;
  bool _envoi = false;
  _RetourPanneau? _retour;

  @override
  void initState() {
    super.initState();
    // Compte à rebours : rafraîchi chaque minute, comme sur le web.
    _minuteur = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() => _maintenant = DateTime.now());
    });
  }

  @override
  void dispose() {
    _minuteur?.cancel();
    super.dispose();
  }

  String get _autrePartie =>
      widget.role == PartieRendezVous.patient ? 'le médecin' : 'le patient';

  void _ouvrirSelecteur() {
    setState(() {
      _selecteurOuvert = true;
      _choixIso = null;
      _retour = null;
    });
    // Données fraîches à chaque ouverture (créneaux pris entre-temps).
    ref.invalidate(creneauxLibresProvider(widget.rdv.medecinId));
  }

  Future<void> _proposer() async {
    final iso = _choixIso;
    if (iso == null || _envoi) return;

    final token = ref.read(authTokenProvider);
    if (token == null) {
      setState(() => _retour = const _RetourPanneau(
            succes: false,
            texte: 'Session expirée : reconnectez-vous.',
          ));
      return;
    }

    final medecinId = widget.rdv.medecinId;
    setState(() {
      _envoi = true;
      _retour = null;
    });
    try {
      await ref
          .read(actionsRendezVousControllerProvider.notifier)
          .proposerReprogrammation(
            widget.rdv.rdvId,
            nouvelleDateIso: iso,
            token: token,
          );
      if (!mounted) return;
      setState(() {
        _selecteurOuvert = false;
        _choixIso = null;
        _retour = _RetourPanneau(
          succes: true,
          texte: 'Proposition envoyée : $_autrePartie doit maintenant '
              'l’accepter.',
        );
      });
      widget.onChange?.call();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _retour = _RetourPanneau(
          succes: false,
          texte: _messageErreur(e, 'Proposition impossible.'),
        );
      });
      // 409 : créneau pris ou fermé entre-temps → on recharge la liste.
      if (e is ApiException && e.statusCode == 409) {
        setState(() => _choixIso = null);
        ref.invalidate(creneauxLibresProvider(medecinId));
      }
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Future<void> _accepter() async {
    if (_envoi) return;

    final iso = widget.rdv.nouvelleDateProposee?.toUtc().toIso8601String();
    if (iso == null) return;

    final token = ref.read(authTokenProvider);
    if (token == null) {
      setState(() => _retour = const _RetourPanneau(
            succes: false,
            texte: 'Session expirée : reconnectez-vous.',
          ));
      return;
    }

    // Capturé avant l'await : une fois acceptée, le RDV quitte cet onglet
    // et ce panneau est démonté — la confirmation doit survivre.
    final messager = ScaffoldMessenger.of(context);
    setState(() {
      _envoi = true;
      _retour = null;
    });
    try {
      await ref
          .read(actionsRendezVousControllerProvider.notifier)
          .accepterReprogrammation(
            widget.rdv.rdvId,
            nouvelleDateProposeeIso: iso,
            token: token,
          );
      messager.showSnackBar(const SnackBar(
        content: Text(
          'Nouvelle date acceptée : rendez-vous confirmé, aucun nouveau '
          'paiement.',
        ),
        duration: Duration(seconds: 6),
      ));
      if (!mounted) return;
      widget.onChange?.call();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _retour = _RetourPanneau(
          succes: false,
          texte: _messageErreur(e, 'Acceptation impossible.'),
        );
      });
      // 409 : proposition modifiée, créneau pris ou délai écoulé → relire.
      if (e is ApiException && e.statusCode == 409) {
        ref.invalidate(listeRendezVousControllerProvider);
      }
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rdv = widget.rdv;
    final echeance = rdv.echeanceReprogrammation;
    final restant =
        echeance == null ? null : tempsRestant(echeance, maintenant: _maintenant);
    final expire = restant?.expire ?? false;
    final aProposition = rdv.aUneProposition;
    final jeSuisAuteur = aProposition && rdv.proposeePar == widget.role;
    final jePeuxAccepter = aProposition && !jeSuisAuteur;

    const gras = TextStyle(fontWeight: FontWeight.w700);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.amber100,
        border: Border.all(color: AppColors.amber500.withOpacity(0.45)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Icon(Icons.event_busy_outlined,
                  size: 18, color: AppColors.amber500),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Rendez-vous à reprogrammer',
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontDisplay,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text.rich(
            TextSpan(
              style: const TextStyle(
                fontSize: 12,
                height: 1.4,
                color: AppColors.ink,
              ),
              children: [
                const TextSpan(
                  text: 'Aucune des deux parties n’était présente. Les fonds '
                      'restent en séquestre : convenez d’une nouvelle date',
                ),
                if (echeance != null) ...[
                  const TextSpan(text: ' avant le '),
                  TextSpan(text: dateHeure(echeance), style: gras),
                  const TextSpan(text: ' ('),
                  if (expire)
                    TextSpan(text: restant!.texte)
                  else ...[
                    const TextSpan(text: 'il reste '),
                    TextSpan(text: restant!.texte, style: gras),
                  ],
                  const TextSpan(text: ')'),
                ],
                TextSpan(
                  text: widget.role == PartieRendezVous.patient
                      ? '. Sans accord dans ce délai, vous serez remboursé '
                          'automatiquement d\u2019une partie de vos '
                          'honoraires (après déduction des frais de '
                          'remboursement et des frais de service APS) ; la '
                          'commission APS et les frais d\u2019envoi ne sont '
                          'pas remboursés.'
                      : '. Sans accord dans ce délai, le patient est '
                          'remboursé automatiquement et vous ne percevez '
                          'aucun honoraire pour ce rendez-vous.',
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          if (expire)
            const Text.rich(
              TextSpan(
                style: TextStyle(fontSize: 12, color: AppColors.ink),
                children: [
                  TextSpan(text: 'Le délai est dépassé', style: gras),
                  TextSpan(
                    text: ' : le remboursement automatique va être '
                        'déclenché.',
                  ),
                ],
              ),
            )
          else ...[
            if (jePeuxAccepter) ...[
              Text.rich(
                TextSpan(
                  style: const TextStyle(fontSize: 12, color: AppColors.ink),
                  children: [
                    TextSpan(text: 'Nouvelle date proposée par $_autrePartie : '),
                    TextSpan(
                      text: dateHeureUtc(rdv.nouvelleDateProposee),
                      style: gras,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _envoi ? null : _accepter,
                  style: _styleBoutonPrincipal(),
                  child: _contenuBouton('Accepter cette date', _envoi),
                ),
              ),
              const SizedBox(height: 8),
            ],
            if (jeSuisAuteur) ...[
              Text.rich(
                TextSpan(
                  style: const TextStyle(fontSize: 12, color: AppColors.ink),
                  children: [
                    const TextSpan(text: 'Vous avez proposé '),
                    TextSpan(
                      text: dateHeureUtc(rdv.nouvelleDateProposee),
                      style: gras,
                    ),
                    TextSpan(
                      text: ' : en attente de l’acceptation de '
                          '$_autrePartie.',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
            ],
            if (!_selecteurOuvert)
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _envoi ? null : _ouvrirSelecteur,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    side: const BorderSide(color: AppColors.primary),
                    padding: const EdgeInsets.symmetric(vertical: 11),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text(
                    aProposition
                        ? 'Proposer une autre date'
                        : 'Proposer une nouvelle date',
                    style: const TextStyle(
                      fontFamily: AppTextStyles.fontDisplay,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              )
            else ...[
              _SelecteurCreneaux(
                medecinId: rdv.medecinId,
                dateActuelle: rdv.dateCreneau,
                choixIso: _choixIso,
                actif: !_envoi,
                onChoix: (iso) => setState(() => _choixIso = iso),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: (_choixIso == null || _envoi) ? null : _proposer,
                      style: _styleBoutonPrincipal(),
                      child: _contenuBouton('Envoyer la proposition', _envoi),
                    ),
                  ),
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: _envoi
                        ? null
                        : () => setState(() {
                              _selecteurOuvert = false;
                              _choixIso = null;
                            }),
                    child: const Text('Fermer'),
                  ),
                ],
              ),
            ],
          ],
          if (_retour != null) ...[
            const SizedBox(height: 8),
            Text(
              _retour!.texte,
              style: TextStyle(
                fontSize: 12,
                color: _retour!.succes ? AppColors.green700 : AppColors.coral600,
              ),
            ),
          ],
        ],
      ),
    );
  }

  ButtonStyle _styleBoutonPrincipal() => ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        disabledBackgroundColor: AppColors.primary.withOpacity(0.45),
        disabledForegroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(vertical: 11),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      );

  Widget _contenuBouton(String libelle, bool chargement) {
    if (chargement) {
      return const SizedBox(
        width: 16,
        height: 16,
        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
      );
    }
    return Text(
      libelle,
      style: const TextStyle(
        fontFamily: AppTextStyles.fontDisplay,
        fontSize: 12.5,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}

/// Liste des créneaux libres, groupés par jour (une rangée de pastilles
/// d'heures par jour). Charge via [creneauxLibresProvider].
class _SelecteurCreneaux extends ConsumerWidget {
  const _SelecteurCreneaux({
    required this.medecinId,
    required this.dateActuelle,
    required this.choixIso,
    required this.actif,
    required this.onChoix,
  });

  final String medecinId;

  /// Date actuelle du RDV : le serveur refuse de la reproposer (400).
  final DateTime dateActuelle;
  final String? choixIso;
  final bool actif;
  final ValueChanged<String> onChoix;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final creneauxAsync = ref.watch(creneauxLibresProvider(medecinId));

    return creneauxAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 8),
            Text(
              'Chargement des créneaux libres…',
              style: TextStyle(fontSize: 12, color: AppColors.inkSoft),
            ),
          ],
        ),
      ),
      error: (e, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _messageErreur(e, 'Impossible de charger les créneaux.'),
            style: const TextStyle(fontSize: 12, color: AppColors.coral600),
          ),
          TextButton(
            onPressed: () => ref.invalidate(creneauxLibresProvider(medecinId)),
            child: const Text('Réessayer'),
          ),
        ],
      ),
      data: (creneaux) {
        final proposables = creneaux
            .where((c) => c.instantUtc?.isAtSameMomentAs(dateActuelle.toUtc()) != true)
            .toList();

        if (proposables.isEmpty) {
          return const Text(
            'Aucun créneau libre sur les $horizonCreneauxLibresJours '
            'prochains jours.',
            style: TextStyle(fontSize: 12, color: AppColors.inkSoft),
          );
        }

        // Les créneaux arrivent triés : l'ordre d'insertion de la Map suit
        // l'ordre chronologique des jours.
        final parJour = <String, List<CreneauAgenda>>{};
        for (final c in proposables) {
          parJour.putIfAbsent(c.cleJour, () => []).add(c);
        }

        return ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 280),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final liste in parJour.values) ...[
                  Padding(
                    padding: const EdgeInsets.only(top: 6, bottom: 4),
                    child: Text(
                      liste.first.libelleJour,
                      style: const TextStyle(
                        fontFamily: AppTextStyles.fontDisplay,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                  ),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final c in liste)
                        ChoiceChip(
                          label: Text(c.libelleHeure),
                          selected: c.iso == choixIso,
                          showCheckmark: false,
                          selectedColor: AppColors.primary,
                          backgroundColor: AppColors.card,
                          side: const BorderSide(color: AppColors.lineStrong),
                          labelStyle: TextStyle(
                            fontFamily: AppTextStyles.fontMono,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: c.iso == choixIso
                                ? Colors.white
                                : AppColors.ink,
                          ),
                          onSelected: actif ? (_) => onChoix(c.iso) : null,
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}