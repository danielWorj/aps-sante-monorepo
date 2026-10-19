// lib/pages/portails/assurance/portail-assurance-demandes.dart
//
// Portail assurance — « Demandes » : les mises en relation reçues par la
// fiche. L'agent les lit toujours ; le SUIVI (statut + note interne, jamais
// montrée au demandeur) exige le droit « suivi des demandes » (le serveur
// refuse sinon). Ouvrir une demande « nouvelle » la passe « en cours ».

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../components/style/colors.dart';
import '../../../components/style/text_styles.dart';
import '../../../controllers/portail_assurance_controller.dart';
import '../../../models/portail_assurance_models.dart';
import 'portail_assurance_commun.dart';

class PortailAssuranceDemandes extends ConsumerStatefulWidget {
  final VoidCallback onOuvrirAbonnement;

  const PortailAssuranceDemandes({super.key, required this.onOuvrirAbonnement});

  @override
  ConsumerState<PortailAssuranceDemandes> createState() => _PortailAssuranceDemandesState();
}

class _PortailAssuranceDemandesState extends ConsumerState<PortailAssuranceDemandes> {
  String _statut = '';
  String _recherche = '';
  int _page = 1;
  final _champRecherche = TextEditingController();

  FiltreDemandes get _filtre => (statut: _statut, recherche: _recherche, page: _page);

  @override
  void dispose() {
    _champRecherche.dispose();
    super.dispose();
  }

  void _recharger() {
    ref.invalidate(demandesAssuranceProvider);
    ref.invalidate(nouvellesDemandesAssuranceProvider);
  }

  @override
  Widget build(BuildContext context) {
    final page = ref.watch(demandesAssuranceProvider(_filtre));
    final suiviInclus = ref.watch(gestionAssuranceProvider).value?.droits.suiviDemandes ?? false;
    final compteurs = page.value?.compteurs;

    return Container(
      color: AppColors.paper,
      child: RefreshIndicator(
        onRefresh: () async => _recharger(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
          children: [
            const EnTetePortail(
              titre: 'Demandes',
              description: 'Les personnes qui ont demandé à être mises en relation avec vous depuis votre fiche.',
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final s in ['', ...statutsDemande])
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text(
                          '${s.isEmpty ? 'Toutes' : libelleStatutDemande(s)}'
                          '${compteurs == null ? '' : ' (${s.isEmpty ? page.value!.totalGlobal : (compteurs[s] ?? 0)})'}',
                        ),
                        selected: _statut == s,
                        onSelected: (_) => setState(() {
                          _statut = s;
                          _page = 1;
                        }),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _champRecherche,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Nom, e-mail, message…',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                filled: true,
                fillColor: AppColors.card,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onSubmitted: (v) => setState(() {
                _recherche = v;
                _page = 1;
              }),
            ),
            const SizedBox(height: 12),
            page.when(
              loading: () => const ChargementPortail(),
              error: (e, _) => ErreurPortail(erreur: e, onReessayer: _recharger),
              data: (p) {
                if (p.demandes.isEmpty) {
                  return VidePortail(
                    icone: Icons.inbox_outlined,
                    texte: _statut.isNotEmpty || _recherche.isNotEmpty
                        ? 'Aucune demande ne correspond.'
                        : "Aucune demande reçue pour l'instant.",
                  );
                }
                final pages = (p.total / 20).ceil().clamp(1, 9999);
                return Column(
                  children: [
                    for (final d in p.demandes)
                      _CarteDemande(
                        key: ValueKey('${d.id}-${d.statut}-${d.noteInterne}'),
                        demande: d,
                        suiviInclus: suiviInclus,
                        onChange: _recharger,
                        onOuvrirAbonnement: widget.onOuvrirAbonnement,
                      ),
                    if (pages > 1)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          IconButton(
                            onPressed: _page > 1 ? () => setState(() => _page--) : null,
                            icon: const Icon(Icons.chevron_left),
                          ),
                          Text('Page $_page / $pages'),
                          IconButton(
                            onPressed: _page < pages ? () => setState(() => _page++) : null,
                            icon: const Icon(Icons.chevron_right),
                          ),
                        ],
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

class _CarteDemande extends ConsumerStatefulWidget {
  final DemandeAssurance demande;
  final bool suiviInclus;
  final VoidCallback onChange;
  final VoidCallback onOuvrirAbonnement;

  const _CarteDemande({
    super.key,
    required this.demande,
    required this.suiviInclus,
    required this.onChange,
    required this.onOuvrirAbonnement,
  });

  @override
  ConsumerState<_CarteDemande> createState() => _CarteDemandeState();
}

class _CarteDemandeState extends ConsumerState<_CarteDemande> {
  bool _ouverte = false;
  bool _envoi = false;
  late final TextEditingController _note = TextEditingController(text: widget.demande.noteInterne ?? '');

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _ouvrir() async {
    setState(() => _ouverte = !_ouverte);
    if (_ouverte && widget.demande.statut == 'nouvelle' && widget.suiviInclus) {
      try {
        await appelPortailUi(ref, (repo, token) => repo.suivreDemande(widget.demande.id, token: token, statut: 'en_cours'));
        widget.onChange();
      } catch (_) {
        // Lecture seule si la mise à jour échoue.
      }
    }
  }

  Future<void> _maj({String? statut, bool note = false}) async {
    setState(() => _envoi = true);
    try {
      await appelPortailUi(
        ref,
        (repo, token) => repo.suivreDemande(
          widget.demande.id,
          token: token,
          statut: statut,
          majNote: note,
          noteInterne: _note.text.trim().isEmpty ? null : _note.text.trim(),
        ),
      );
      if (mounted && note) snackPortail(context, 'Note enregistrée.');
      widget.onChange();
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Future<void> _supprimer() async {
    if (!await confirmerPortail(context, 'Supprimer la demande', 'Supprimer définitivement cette demande ?', action: 'Supprimer')) {
      return;
    }
    try {
      await appelPortailUi(ref, (repo, token) => repo.supprimerDemande(widget.demande.id, token: token));
      widget.onChange();
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.demande;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(10),
        border: Border(
          left: BorderSide(color: d.statut == 'nouvelle' ? AppColors.danger : AppColors.line, width: d.statut == 'nouvelle' ? 3 : 1),
          top: const BorderSide(color: AppColors.line),
          right: const BorderSide(color: AppColors.line),
          bottom: const BorderSide(color: AppColors.line),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: _ouvrir,
            borderRadius: BorderRadius.circular(10),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(child: Text(d.demandeur, style: AppTextStyles.cardTitle, overflow: TextOverflow.ellipsis)),
                            const SizedBox(width: 6),
                            PuceStatutDemande(statut: d.statut, libelle: libelleStatutDemande(d.statut)),
                            if (d.noteInterne != null) ...[
                              const SizedBox(width: 4),
                              const Icon(Icons.sticky_note_2_outlined, size: 16, color: AppColors.inkFaint),
                            ],
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(dateHeurePortail(d.dateCreation), style: AppTextStyles.cardMeta),
                        if (!_ouverte)
                          Text(d.message, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppTextStyles.cardMeta),
                      ],
                    ),
                  ),
                  Icon(_ouverte ? Icons.expand_less : Icons.expand_more, color: AppColors.inkFaint),
                ],
              ),
            ),
          ),
          if (_ouverte)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      if (d.email != null)
                        OutlinedButton.icon(
                          onPressed: () => launchUrl(Uri(scheme: 'mailto', path: d.email)),
                          icon: const Icon(Icons.mail_outline, size: 16),
                          label: Text(d.email!),
                        ),
                      if (d.telephone != null)
                        OutlinedButton.icon(
                          onPressed: () => launchUrl(Uri(scheme: 'tel', path: d.telephone)),
                          icon: const Icon(Icons.phone_outlined, size: 16),
                          label: Text(d.telephone!),
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.primarySurface,
                      borderRadius: BorderRadius.circular(10),
                      border: const Border(left: BorderSide(color: AppColors.primary, width: 3)),
                    ),
                    child: Text(d.message, style: AppTextStyles.body),
                  ),
                  const SizedBox(height: 10),
                  if (widget.suiviInclus) ...[
                    Wrap(
                      spacing: 6,
                      children: [
                        for (final s in const ['en_cours', 'traitee', 'archivee'])
                          ChoiceChip(
                            label: Text(libelleStatutDemande(s)),
                            selected: d.statut == s,
                            onSelected: _envoi || d.statut == s ? null : (_) => _maj(statut: s),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _note,
                      maxLines: 3,
                      maxLength: 2000,
                      decoration: const InputDecoration(
                        labelText: 'Note interne (visible de votre équipe seulement)',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                    Row(
                      children: [
                        TextButton.icon(
                          onPressed: _supprimer,
                          icon: const Icon(Icons.delete_outline, size: 18),
                          label: const Text('Supprimer'),
                          style: TextButton.styleFrom(foregroundColor: AppColors.inkSoft),
                        ),
                        const Spacer(),
                        FilledButton(
                          onPressed: _envoi ? null : () => _maj(note: true),
                          child: const Text('Enregistrer la note'),
                        ),
                      ],
                    ),
                  ] else ...[
                    const Text(
                      'Le suivi (statuts, notes) est inclus dans les abonnements qui le proposent.',
                      style: AppTextStyles.cardMeta,
                    ),
                    Row(
                      children: [
                        TextButton(onPressed: widget.onOuvrirAbonnement, child: const Text('Voir les formules')),
                        const Spacer(),
                        TextButton.icon(
                          onPressed: _supprimer,
                          icon: const Icon(Icons.delete_outline, size: 18),
                          label: const Text('Supprimer'),
                          style: TextButton.styleFrom(foregroundColor: AppColors.inkSoft),
                        ),
                      ],
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
