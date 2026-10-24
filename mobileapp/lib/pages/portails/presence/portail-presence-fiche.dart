// lib/pages/portails/presence/portail-presence-fiche.dart
//
// Espaces pharmacie et centre de santé — « Ma fiche » : identité et contact
// (nom, n° d'ordre du titulaire ou type de structure, téléphone, e-mail),
// localisation (ville, adresse, position), photo principale, présentation
// (contenus enrichis) et équipe. Toute modification ici repasse la fiche en
// vérification par ApSa (une fiche publiée reste en ligne pendant la
// vérification). Les pièces justificatives se remplacent depuis le site web.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/espace_presence_controller.dart';
import '../../../models/espace_presence_models.dart';
import '../../../repositories/espace_presence_repository.dart' show FichierPresence;
import 'presence_commun.dart';

class PortailPresenceFiche extends ConsumerWidget {
  const PortailPresenceFiche({super.key, required this.type});

  final TypeEspacePresence type;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fiche = ref.watch(maFichePresenceProvider(type));
    return Container(
      color: AppColors.paper,
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(maFichePresenceProvider(type).future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
          children: [
            EnTetePresence(type: type),
            const EnTetePortail(titre: 'Ma fiche', description: "L'identité, les coordonnées et la présentation de votre établissement."),
            fiche.when(
              loading: () => const ChargementPortail(),
              error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(maFichePresenceProvider(type))),
              data: (f) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  BandeauFicheHorsLigne(statut: f.statut, enLigne: f.enLigne),
                  _Identite(key: ValueKey('id-${f.hashCode}'), fiche: f),
                  _Presentation(key: ValueKey('pres-${f.hashCode}'), fiche: f),
                  _Equipe(fiche: f),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Confirme qu'une modification repasse une fiche publiée en vérification.
Future<bool> _confirmerVerification(BuildContext context, FichePresence f) async {
  if (f.statut != StatutFichePresence.publie) return true;
  return confirmerPortail(
    context,
    'Enregistrer les modifications',
    'Votre fiche repassera en vérification par ApSa. Elle reste visible du public pendant la vérification.',
    action: 'Enregistrer',
  );
}

class _Identite extends ConsumerStatefulWidget {
  const _Identite({super.key, required this.fiche});

  final FichePresence fiche;

  @override
  ConsumerState<_Identite> createState() => _IdentiteState();
}

class _IdentiteState extends ConsumerState<_Identite> {
  final _form = GlobalKey<FormState>();
  late final FichePresence f = widget.fiche;
  late final _nom = TextEditingController(text: f.nom);
  late final _telephone = TextEditingController(text: f.telephone);
  late final _email = TextEditingController(text: f.email ?? '');
  late final _ordre = TextEditingController(text: f.numeroOrdre ?? '');
  late final _adresse = TextEditingController(text: f.adresse ?? '');
  late final _lat = TextEditingController(text: f.latitude?.toString() ?? '');
  late final _lng = TextEditingController(text: f.longitude?.toString() ?? '');
  late String? _villeId = f.villeId;
  late String? _typeStructure = f.typeStructure;
  ApsFichier? _photo;
  bool _envoi = false;

  bool get _pharmacie => f.type == TypeEspacePresence.pharmacie;

  @override
  void dispose() {
    for (final c in [_nom, _telephone, _email, _ordre, _adresse, _lat, _lng]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _choisirPhoto() async {
    try {
      final fichier = await apsChoisirFichier(extensions: const ['jpg', 'jpeg', 'png', 'webp'], tailleMaxMo: 5);
      if (fichier != null && mounted) setState(() => _photo = fichier);
    } on ApsFichierException catch (e) {
      if (mounted) snackPortail(context, e.message);
    }
  }

  Future<void> _enregistrer() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    final email = _email.text.trim();
    if (email.isNotEmpty && !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
      return snackPortail(context, "L'e-mail de contact n'est pas valide.");
    }
    final erreurGps = apsValiderCoordonnees(_lat.text, _lng.text);
    if (erreurGps != null) return snackPortail(context, erreurGps);
    if (!await _confirmerVerification(context, f) || !mounted) return;
    setState(() => _envoi = true);
    final lat = apsParseCoordonnee(_lat.text);
    final lng = apsParseCoordonnee(_lng.text);
    final photo = _photo;
    try {
      await appelPresenceUi(ref, (repo, token) => repo.modifierFiche(
            f.type,
            f.id,
            token: token,
            champs: {
              'nom': _nom.text.trim(),
              'telephone': _telephone.text.trim(),
              'email': email,
              'adresse': _adresse.text.trim(),
              if (_pharmacie) 'numero_ordre_titulaire': _ordre.text.trim(),
              if (!_pharmacie) 'type_structure': ?_typeStructure,
              'ville_id': ?_villeId,
              if (lat != null && lng != null) ...{'latitude': '$lat', 'longitude': '$lng'},
            },
            image: photo == null ? null : FichierPresence(photo.octets, photo.nom),
          ));
      ref.invalidate(maFichePresenceProvider(f.type));
      if (mounted) snackPortail(context, 'Fiche enregistrée. Elle repasse en vérification par ApSa.');
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CartePortail(
            titre: f.statut.libelle,
            icone: f.statut == StatutFichePresence.publie ? Icons.verified_outlined : Icons.hourglass_top_outlined,
            action: TextButton(
              onPressed: () => ouvrirFichePublique(context, f.type, f.id),
              child: Text(f.statut == StatutFichePresence.publie ? 'Voir ma fiche' : 'Aperçu'),
            ),
            child: Row(children: [
              ApsVignette(
                imageUrl: f.imageUrl,
                size: 56,
                radius: 8,
                repli: Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(color: AppColors.b1, borderRadius: BorderRadius.circular(8)),
                  child: Icon(iconeEspace(f.type), color: AppColors.b7),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(_photo == null ? 'Photo principale' : 'Nouvelle photo : ${_photo!.nom}', style: AppTextStyles.cardMeta),
              ),
              TextButton(onPressed: _choisirPhoto, child: const Text('Changer')),
            ]),
          ),
          CartePortail(
            titre: 'Identité et contact',
            icone: iconeEspace(f.type),
            child: Column(children: [
              ChampLaboratoire(controleur: _nom, libelle: _pharmacie ? 'Nom de la pharmacie' : 'Nom de la structure', requis: true),
              if (_pharmacie)
                ChampLaboratoire(controleur: _ordre, libelle: "N° d'ordre du titulaire", requis: true)
              else
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: ApsFormField(
                    label: 'Type de structure',
                    required: true,
                    child: ApsDropdown<String>(
                      value: typesStructure.any((t) => t.$1 == _typeStructure) ? _typeStructure : null,
                      hint: 'Sélectionner…',
                      items: [for (final t in typesStructure) t.$1],
                      itemLabel: libelleTypeStructure,
                      onChanged: (v) => setState(() => _typeStructure = v),
                    ),
                  ),
                ),
              ChampLaboratoire(controleur: _telephone, libelle: 'Téléphone', clavier: TextInputType.phone, requis: true),
              ChampLaboratoire(controleur: _email, libelle: 'E-mail de contact', clavier: TextInputType.emailAddress),
              Text('Le téléphone et l\'e-mail ne sont visibles du public qu\'avec un abonnement qui inclut le contact direct.',
                  style: AppTextStyles.cardMeta),
            ]),
          ),
          CartePortail(
            titre: 'Localisation',
            icone: Icons.place_outlined,
            child: Column(children: [
              ChoixVilleLaboratoire(paysId: f.paysId, villeId: _villeId, requis: true, onChanged: (v) => setState(() => _villeId = v)),
              ChampLaboratoire(controleur: _adresse, libelle: 'Adresse', indication: 'Quartier, rue, point de repère'),
              Row(children: [
                Expanded(child: ChampLaboratoire(controleur: _lat, libelle: 'Latitude', clavier: const TextInputType.numberWithOptions(decimal: true, signed: true))),
                const SizedBox(width: 10),
                Expanded(child: ChampLaboratoire(controleur: _lng, libelle: 'Longitude', clavier: const TextInputType.numberWithOptions(decimal: true, signed: true))),
              ]),
            ]),
          ),
          ApsButton(label: 'Enregistrer la fiche', icon: Icons.check_rounded, loading: _envoi, onPressed: _envoi ? null : _enregistrer),
          const SizedBox(height: 6),
          Text('Pour remplacer la pièce d\'identité ou l\'agrément, utilisez votre espace sur le site web.', style: AppTextStyles.cardMeta),
          const SizedBox(height: 14),
        ],
      ),
    );
  }
}

class _Presentation extends ConsumerStatefulWidget {
  const _Presentation({super.key, required this.fiche});

  final FichePresence fiche;

  @override
  ConsumerState<_Presentation> createState() => _PresentationState();
}

class _PresentationState extends ConsumerState<_Presentation> {
  late final FichePresence f = widget.fiche;
  late final _description = TextEditingController(text: f.descriptionEnrichie ?? '');
  late final _second = TextEditingController(
    text: (f.type == TypeEspacePresence.pharmacie ? f.servicesParticuliers : f.presentationEquipe) ?? '',
  );
  bool _envoi = false;

  bool get _pharmacie => f.type == TypeEspacePresence.pharmacie;

  @override
  void dispose() {
    _description.dispose();
    _second.dispose();
    super.dispose();
  }

  Future<void> _enregistrer() async {
    if (!await _confirmerVerification(context, f) || !mounted) return;
    setState(() => _envoi = true);
    try {
      await appelPresenceUi(ref, (repo, token) => repo.modifierFiche(
            f.type,
            f.id,
            token: token,
            champs: {
              'description_enrichie': _description.text.trim(),
              _pharmacie ? 'services_particuliers' : 'presentation_equipe': _second.text.trim(),
            },
          ));
      ref.invalidate(maFichePresenceProvider(f.type));
      if (mounted) snackPortail(context, 'Présentation enregistrée. Elle repasse en vérification par ApSa.');
    } catch (e) {
      if (mounted) snackPortail(context, messageErreur(e));
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final droits = f.droits;
    final secondVisible = _pharmacie ? droits.descriptionEnrichie : droits.presentationEquipe;
    return CartePortail(
      titre: 'Présentation',
      icone: Icons.notes_rounded,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BandeauMasque(
            visible: droits.descriptionEnrichie && secondVisible,
            texte: 'Une partie de ces contenus est enregistrée mais masquée au public : votre abonnement ne l\'inclut pas.',
          ),
          ChampLaboratoire(
            controleur: _description,
            libelle: _pharmacie ? "Description de l'officine" : 'Présentation et spécialités',
            lignes: 5,
            indication: _pharmacie ? 'Accès, langues parlées, spécialités de l\'officine…' : 'Spécialités, services, plateau technique…',
          ),
          ChampLaboratoire(
            controleur: _second,
            libelle: _pharmacie ? 'Services particuliers' : "Présentation de l'équipe",
            lignes: 4,
            indication: _pharmacie ? 'Préparations magistrales, tests rapides, livraison…' : 'Médecins, spécialistes, responsables…',
          ),
          Text('Restez factuel : aucun message promotionnel. ApSa vérifie chaque modification avant publication.', style: AppTextStyles.cardMeta),
          const SizedBox(height: 10),
          ApsButton(label: 'Enregistrer la présentation', icon: Icons.check_rounded, loading: _envoi, onPressed: _envoi ? null : _enregistrer),
        ],
      ),
    );
  }
}

class _Equipe extends StatelessWidget {
  const _Equipe({required this.fiche});

  final FichePresence fiche;

  @override
  Widget build(BuildContext context) => CartePortail(
        titre: 'Équipe ayant accès à cet espace',
        icone: Icons.group_outlined,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final m in fiche.equipe)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Text('${m.nom} · ${m.fonction}${m.moi ? ' (vous)' : ''}', style: AppTextStyles.body),
              ),
            const SizedBox(height: 4),
            Text('Pour ajouter ou retirer un gestionnaire, contactez ApSa.', style: AppTextStyles.cardMeta),
          ],
        ),
      );
}
