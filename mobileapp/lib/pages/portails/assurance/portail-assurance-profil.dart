// lib/pages/portails/assurance/portail-assurance-profil.dart
//
// Portail assurance — « Profil » : la fiche (identité, contacts, agrément,
// présentation, ville, logo), les activités / produits et leurs options,
// les agences. Les modifications sont publiées aussitôt : la fiche garde
// son statut de vérification. Écritures via [AssuranceRepository].

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/stepper/aps_stepper.dart' show apsChoisirFichier, ApsFichier, ApsFichierException;
import '../../../components/style/colors.dart';
import '../../../components/style/text_styles.dart';
import '../../../controllers/assurance_controller.dart' show assuranceRepositoryProvider;
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/portail_assurance_controller.dart';
import '../../../controllers/referentiel_controller.dart' show villesParPaysProvider;
import '../../../models/assurance_models.dart';
import '../../../models/portail_assurance_models.dart';
import '../../../repositories/assurance_repository.dart';
import 'portail_assurance_commun.dart';
import '../../espaces/carte_connexion_compte.dart';

/// Appel authentifié sur le dépôt assurance existant (fiche, activités, agences).
Future<T> _appelAssurance<T>(WidgetRef ref, Future<T> Function(AssuranceRepository repo, String token) appel) {
  final repo = ref.read(assuranceRepositoryProvider);
  return ref.read(sessionControllerProvider.notifier).appelAuthentifie((token) => appel(repo, token));
}

class PortailAssuranceProfil extends ConsumerWidget {
  const PortailAssuranceProfil({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gestion = ref.watch(gestionAssuranceProvider);
    return Container(
      color: AppColors.paper,
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(gestionAssuranceProvider.future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
          children: [
            const EnTetePortail(titre: 'Profil', description: 'Votre fiche, vos activités et vos agences.'),
            gestion.when(
              loading: () => const ChargementPortail(),
              error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(gestionAssuranceProvider)),
              data: (g) => Column(
                children: [
                  _FormulaireFiche(key: ValueKey('${g.id}-${g.nom}-${g.telephone}-${g.imageUrl}'), g: g),
                  _Activites(g: g),
                  _Agences(g: g),
                ],
              ),
            ),
            const SizedBox(height: 8),
            const CarteConnexionCompte(),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => deconnecterPortail(context, ref),
                icon: const Icon(Icons.logout, size: 18),
                label: const Text('Déconnexion'),
                style: TextButton.styleFrom(foregroundColor: AppColors.inkSoft),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/* ============================ Fiche ============================ */

class _FormulaireFiche extends ConsumerStatefulWidget {
  final GestionAssurance g;

  const _FormulaireFiche({super.key, required this.g});

  @override
  ConsumerState<_FormulaireFiche> createState() => _FormulaireFicheState();
}

class _FormulaireFicheState extends ConsumerState<_FormulaireFiche> {
  final _cle = GlobalKey<FormState>();
  late final _nom = TextEditingController(text: widget.g.nom);
  late final _telephone = TextEditingController(text: widget.g.telephone);
  late final _email = TextEditingController(text: widget.g.email);
  late final _agrement = TextEditingController(text: widget.g.agrement);
  late final _description = TextEditingController(text: widget.g.description ?? '');
  late String _type = widget.g.typeActeur;
  late String _villeId = widget.g.villeId;
  ApsFichier? _logo;
  bool _envoi = false;

  @override
  void dispose() {
    for (final c in [_nom, _telephone, _email, _agrement, _description]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _choisirLogo() async {
    try {
      final f = await apsChoisirFichier(extensions: const ['jpg', 'jpeg', 'png', 'webp']);
      if (f != null) setState(() => _logo = f);
    } on ApsFichierException catch (e) {
      if (mounted) snackPortail(context, e.message);
    }
  }

  Future<void> _enregistrer() async {
    if (!_cle.currentState!.validate()) return;
    setState(() => _envoi = true);
    try {
      await _appelAssurance(
        ref,
        (repo, token) => repo.modifierServiceAssurance(
          id: widget.g.id,
          token: token,
          requete: ServiceAssuranceMiseAJourRequete(
            nom: _nom.text.trim(),
            telephone: _telephone.text.trim(),
            email: _email.text.trim(),
            agrement: _agrement.text.trim(),
            description: _description.text.trim().isEmpty ? null : _description.text.trim(),
            villeId: _villeId,
            typeActeur: _type == 'courtier' ? TypeActeurAssurance.courtier : TypeActeurAssurance.compagnie,
          ),
          imageOctets: _logo?.octets,
          imageNomFichier: _logo?.nom,
        ),
      );
      if (!mounted) return;
      snackPortail(context, 'Fiche enregistrée.');
      ref.invalidate(gestionAssuranceProvider);
      ref.invalidate(maFicheAssuranceProvider);
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  InputDecoration _deco(String libelle) => InputDecoration(labelText: libelle, border: const OutlineInputBorder(), isDense: true);

  String? _requis(String? v) => (v == null || v.trim().isEmpty) ? 'Champ requis' : null;

  @override
  Widget build(BuildContext context) {
    final villes = ref.watch(villesParPaysProvider(widget.g.paysId));
    return CartePortail(
      titre: 'Ma fiche',
      icone: Icons.shield_outlined,
      child: Form(
        key: _cle,
        child: Column(
          children: [
            Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    width: 64,
                    height: 64,
                    color: AppColors.primarySurface,
                    child: _logo != null
                        ? Image.memory(_logo!.octets, fit: BoxFit.cover)
                        : (widget.g.imageUrl != null
                            ? Image.network(widget.g.imageUrl!, fit: BoxFit.contain,
                                errorBuilder: (_, _, _) => const Icon(Icons.shield_outlined))
                            : const Icon(Icons.shield_outlined, color: AppColors.primary)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _choisirLogo,
                    icon: const Icon(Icons.image_outlined, size: 18),
                    label: Text(_logo == null ? 'Changer le logo' : _logo!.nom, overflow: TextOverflow.ellipsis),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(controller: _nom, decoration: _deco('Dénomination'), validator: _requis),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: _type,
              decoration: _deco('Type'),
              items: const [
                DropdownMenuItem(value: 'compagnie', child: Text("Compagnie d'assurance")),
                DropdownMenuItem(value: 'courtier', child: Text('Courtier')),
              ],
              onChanged: (v) => setState(() => _type = v ?? _type),
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _telephone,
              decoration: _deco('Téléphone'),
              keyboardType: TextInputType.phone,
              validator: _requis,
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _email,
              decoration: _deco('E-mail'),
              keyboardType: TextInputType.emailAddress,
              validator: (v) => _requis(v) ?? (RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v!.trim()) ? null : 'E-mail invalide'),
            ),
            const SizedBox(height: 10),
            TextFormField(controller: _agrement, decoration: _deco("N° d'agrément"), validator: _requis),
            const SizedBox(height: 10),
            villes.when(
              loading: () => const LinearProgressIndicator(),
              error: (_, _) => Text('Ville : ${widget.g.villeNom ?? '—'}', style: AppTextStyles.body),
              data: (liste) {
                final ids = liste.map((v) => v.villeId).toSet();
                return DropdownButtonFormField<String>(
                  initialValue: ids.contains(_villeId) ? _villeId : null,
                  isExpanded: true,
                  decoration: _deco('Ville du siège'),
                  items: [for (final v in liste) DropdownMenuItem(value: v.villeId, child: Text(v.nom))],
                  onChanged: (v) => setState(() => _villeId = v ?? _villeId),
                );
              },
            ),
            const SizedBox(height: 10),
            TextFormField(controller: _description, decoration: _deco('Présentation'), maxLines: 4),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: _envoi ? null : _enregistrer,
                child: Text(_envoi ? 'Enregistrement…' : 'Enregistrer la fiche'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/* ============================ Activités ============================ */

Future<Map<String, String>?> _dialogueChamps(
  BuildContext context, {
  required String titre,
  required List<(String cle, String libelle, bool requis)> champs,
  Map<String, String> valeurs = const {},
}) {
  final controleurs = {for (final c in champs) c.$1: TextEditingController(text: valeurs[c.$1] ?? '')};
  final cle = GlobalKey<FormState>();
  return showDialog<Map<String, String>>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(titre),
      content: Form(
        key: cle,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final champ in champs)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: TextFormField(
                    controller: controleurs[champ.$1],
                    decoration: InputDecoration(labelText: champ.$2, border: const OutlineInputBorder(), isDense: true),
                    validator: champ.$3 ? (v) => (v == null || v.trim().isEmpty) ? 'Champ requis' : null : null,
                  ),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c), child: const Text('Annuler')),
        FilledButton(
          onPressed: () {
            if (!cle.currentState!.validate()) return;
            Navigator.pop(c, {for (final e in controleurs.entries) e.key: e.value.text.trim()});
          },
          child: const Text('Enregistrer'),
        ),
      ],
    ),
  );
}

class _Activites extends ConsumerWidget {
  final GestionAssurance g;

  const _Activites({required this.g});

  Future<void> _executer(BuildContext context, WidgetRef ref, Future<void> Function() action) async {
    try {
      await action();
      ref.invalidate(gestionAssuranceProvider);
    } catch (e) {
      if (context.mounted) snackPortail(context, messageErreur(e));
    }
  }

  static const _champs = [('titre', 'Titre (ex. Santé Famille)', true), ('public', 'Public cible', true), ('description', 'Description', false)];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return CartePortail(
      titre: 'Activités & produits',
      icone: Icons.description_outlined,
      action: IconButton(
        tooltip: 'Ajouter une activité',
        icon: const Icon(Icons.add_circle_outline, color: AppColors.primary),
        onPressed: () async {
          final v = await _dialogueChamps(context, titre: 'Nouvelle activité', champs: _champs);
          if (v == null || !context.mounted) return;
          await _executer(context, ref, () => _appelAssurance(ref, (repo, token) => repo.creerActivite(
                requete: ActiviteCreationRequete(
                  serviceAssuranceId: g.id,
                  titre: v['titre']!,
                  publicCible: v['public']!,
                  description: v['description']!.isEmpty ? null : v['description'],
                ),
                token: token,
              )));
        },
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!g.droits.afficherActivites && g.activites.isNotEmpty)
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: Text('Vos activités sont conservées mais ne sont pas visibles du public avec votre abonnement actuel.',
                  style: AppTextStyles.cardMeta),
            ),
          if (g.activites.isEmpty) const VidePortail(icone: Icons.description_outlined, texte: 'Aucune activité.'),
          for (final a in g.activites)
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: Text(a.titre, style: AppTextStyles.cardTitle),
              subtitle: Text('${a.publicCible} · ${a.options.length} option(s)', style: AppTextStyles.cardMeta),
              childrenPadding: const EdgeInsets.only(bottom: 10),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (a.description != null) Text(a.description!, style: AppTextStyles.body),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final o in a.options)
                      InputChip(
                        label: Text(o.libelle),
                        onDeleted: () => _executer(context, ref,
                            () => _appelAssurance(ref, (repo, token) => repo.supprimerOptionActivite(o.id, token: token))),
                      ),
                    ActionChip(
                      avatar: const Icon(Icons.add, size: 16),
                      label: const Text('Option'),
                      onPressed: () async {
                        final v = await _dialogueChamps(context,
                            titre: 'Nouvelle option', champs: const [('libelle', 'Libellé (ex. Hospitalisation)', true)]);
                        if (v == null || !context.mounted) return;
                        await _executer(context, ref, () => _appelAssurance(ref, (repo, token) => repo.creerOptionActivite(
                              requete: OptionActiviteCreationRequete(activiteId: a.id, libelle: v['libelle']!),
                              token: token,
                            )));
                      },
                    ),
                  ],
                ),
                Row(
                  children: [
                    TextButton.icon(
                      icon: const Icon(Icons.edit_outlined, size: 18),
                      label: const Text('Modifier'),
                      onPressed: () async {
                        final v = await _dialogueChamps(context,
                            titre: "Modifier l'activité",
                            champs: _champs,
                            valeurs: {'titre': a.titre, 'public': a.publicCible, 'description': a.description ?? ''});
                        if (v == null || !context.mounted) return;
                        await _executer(context, ref, () => _appelAssurance(ref, (repo, token) => repo.modifierActivite(
                              id: a.id,
                              requete: ActiviteMiseAJourRequete(
                                titre: v['titre'],
                                publicCible: v['public'],
                                description: v['description'],
                              ),
                              token: token,
                            )));
                      },
                    ),
                    TextButton.icon(
                      icon: const Icon(Icons.delete_outline, size: 18),
                      label: const Text('Supprimer'),
                      style: TextButton.styleFrom(foregroundColor: AppColors.dangerDark),
                      onPressed: () async {
                        final ok = await confirmerPortail(
                          context,
                          "Supprimer l'activité",
                          a.options.isEmpty ? 'Supprimer « ${a.titre} » ?' : 'Supprimer « ${a.titre} » et ses ${a.options.length} option(s) ?',
                          action: 'Supprimer',
                        );
                        if (!ok || !context.mounted) return;
                        // Le serveur refuse de supprimer une activité qui a encore des options.
                        await _executer(context, ref, () => _appelAssurance(ref, (repo, token) async {
                              for (final o in a.options) {
                                await repo.supprimerOptionActivite(o.id, token: token);
                              }
                              await repo.supprimerActivite(a.id, token: token);
                            }));
                      },
                    ),
                  ],
                ),
              ],
            ),
        ],
      ),
    );
  }
}

/* ============================ Agences ============================ */

class _Agences extends ConsumerWidget {
  final GestionAssurance g;

  const _Agences({required this.g});

  static const _champs = [('libelle', 'Libellé (ex. Agence Akwa)', true), ('localisation', 'Localisation', true), ('contact', 'Contact', true)];

  Future<void> _executer(BuildContext context, WidgetRef ref, Future<void> Function() action) async {
    try {
      await action();
      ref.invalidate(gestionAssuranceProvider);
    } catch (e) {
      if (context.mounted) snackPortail(context, messageErreur(e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final q = g.quotaAgences;
    return CartePortail(
      titre: 'Agences (${q.libelle})',
      icone: Icons.storefront_outlined,
      action: q.atteint
          ? null
          : IconButton(
              tooltip: 'Ajouter une agence',
              icon: const Icon(Icons.add_circle_outline, color: AppColors.primary),
              onPressed: () async {
                final v = await _dialogueChamps(context, titre: 'Nouvelle agence', champs: _champs);
                if (v == null || !context.mounted) return;
                await _executer(context, ref, () => _appelAssurance(ref, (repo, token) => repo.creerAgence(
                      requete: AgenceCreationRequete(
                        serviceAssuranceId: g.id,
                        libelle: v['libelle']!,
                        localisation: v['localisation']!,
                        contact: v['contact']!,
                      ),
                      token: token,
                    )));
              },
            ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!g.droits.afficherAgences && g.agences.isNotEmpty)
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: Text('Vos agences sont conservées mais ne sont pas visibles du public avec votre abonnement actuel.',
                  style: AppTextStyles.cardMeta),
            ),
          if (q.atteint)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                q.nonInclus
                    ? 'Activez un abonnement incluant les agences pour en ajouter.'
                    : "Vous avez atteint le nombre maximal d'agences de votre niveau.",
                style: AppTextStyles.cardMeta,
              ),
            ),
          if (g.agences.isEmpty) const VidePortail(icone: Icons.storefront_outlined, texte: 'Aucune agence.'),
          for (final a in g.agences)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(a.libelle, style: AppTextStyles.cardTitle),
              subtitle: Text('${a.localisation} · ${a.contact}', style: AppTextStyles.cardMeta),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    tooltip: 'Modifier',
                    icon: const Icon(Icons.edit_outlined, size: 20),
                    onPressed: () async {
                      final v = await _dialogueChamps(context,
                          titre: "Modifier l'agence",
                          champs: _champs,
                          valeurs: {'libelle': a.libelle, 'localisation': a.localisation, 'contact': a.contact});
                      if (v == null || !context.mounted) return;
                      await _executer(context, ref, () => _appelAssurance(ref, (repo, token) => repo.modifierAgence(
                            id: a.id,
                            requete: AgenceMiseAJourRequete(
                              libelle: v['libelle'],
                              localisation: v['localisation'],
                              contact: v['contact'],
                            ),
                            token: token,
                          )));
                    },
                  ),
                  IconButton(
                    tooltip: 'Supprimer',
                    icon: const Icon(Icons.delete_outline, size: 20),
                    onPressed: () async {
                      if (!await confirmerPortail(context, "Supprimer l'agence", 'Supprimer « ${a.libelle} » ?', action: 'Supprimer') ||
                          !context.mounted) {
                        return;
                      }
                      await _executer(context, ref,
                          () => _appelAssurance(ref, (repo, token) => repo.supprimerAgence(a.id, token: token)));
                    },
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
