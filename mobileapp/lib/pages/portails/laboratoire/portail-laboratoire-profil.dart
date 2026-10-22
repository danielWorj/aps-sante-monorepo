// lib/pages/portails/laboratoire/portail-laboratoire-profil.dart
//
// Portail laboratoire — « Profil » : le gérant modifie sa fiche (nom,
// contacts, agrément, présentation, ville, adresse, position, logo). La
// fiche garde son statut de vérification (pas de re-modération). Accès à la
// fiche publique (aperçu tant qu'elle n'est pas publiée).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/laboratoire_controller.dart';
import '../../../models/laboratoire_models.dart';
import '../../../repositories/laboratoire_repository.dart' show FichierLaboratoire;
import '../../public/utils/DetailLaboratoire.dart';
import 'portail_laboratoire_commun.dart';

class PortailLaboratoireProfil extends ConsumerWidget {
  const PortailLaboratoireProfil({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gestion = ref.watch(gestionLaboratoireProvider);
    return Container(
      color: AppColors.paper,
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(gestionLaboratoireProvider.future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
          children: [
            const EnTetePortail(titre: 'Profil', description: 'Les informations de votre laboratoire, telles que le public les voit.'),
            gestion.when(
              loading: () => const ChargementPortail(),
              error: (e, _) => ErreurPortail(erreur: e, onReessayer: () => ref.invalidate(gestionLaboratoireProvider)),
              data: (g) => _Formulaire(key: ValueKey(g.laboratoire.hashCode), laboratoire: g.laboratoire),
            ),
          ],
        ),
      ),
    );
  }
}

class _Formulaire extends ConsumerStatefulWidget {
  const _Formulaire({super.key, required this.laboratoire});

  final Laboratoire laboratoire;

  @override
  ConsumerState<_Formulaire> createState() => _FormulaireState();
}

class _FormulaireState extends ConsumerState<_Formulaire> {
  final _form = GlobalKey<FormState>();
  late final Laboratoire l = widget.laboratoire;
  late final _nom = TextEditingController(text: l.nom);
  late final _telephone = TextEditingController(text: l.telephone);
  late final _email = TextEditingController(text: l.email);
  late final _agrement = TextEditingController(text: l.agrement);
  late final _description = TextEditingController(text: l.description ?? '');
  late final _adresse = TextEditingController(text: l.localisation);
  late final _lat = TextEditingController(text: l.geolocalisation?.latitude.toString() ?? '');
  late final _lng = TextEditingController(text: l.geolocalisation?.longitude.toString() ?? '');
  late String? _villeId = l.villeId;
  ApsFichier? _logo;
  bool _envoi = false;

  @override
  void dispose() {
    for (final c in [_nom, _telephone, _email, _agrement, _description, _adresse, _lat, _lng]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _choisirLogo() async {
    try {
      final f = await apsChoisirFichier(extensions: const ['jpg', 'jpeg', 'png', 'webp']);
      if (f != null && mounted) setState(() => _logo = f);
    } on ApsFichierException catch (e) {
      if (mounted) snackPortail(context, e.message);
    }
  }

  Future<void> _enregistrer() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    final erreurGps = apsValiderCoordonnees(_lat.text, _lng.text);
    if (erreurGps != null) return snackPortail(context, erreurGps);
    setState(() => _envoi = true);
    final lat = apsParseCoordonnee(_lat.text);
    final lng = apsParseCoordonnee(_lng.text);
    final logo = _logo;
    try {
      await appelLaboratoireUi(ref, (repo, token) => repo.modifierFiche(
            l.id,
            token: token,
            champs: {
              'nom': _nom.text.trim(),
              'telephone': _telephone.text.trim(),
              'email': _email.text.trim(),
              'agrement': _agrement.text.trim(),
              'description': _description.text.trim(),
              'localisation': _adresse.text.trim(),
              if (_villeId != null) 'ville_id': _villeId!,
              if (lat != null && lng != null) ...{'latitude': '$lat', 'longitude': '$lng'},
            },
            image: logo == null ? null : FichierLaboratoire(logo.octets, logo.nom),
          ));
      ref.invalidate(gestionLaboratoireProvider);
      ref.invalidate(monLaboratoireProvider);
      if (mounted) snackPortail(context, 'Fiche enregistrée.');
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
            titre: l.statut.libelle,
            icone: l.estPublie ? Icons.verified_outlined : Icons.hourglass_top_outlined,
            action: TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => DetailLaboratoirePage(laboratoireId: l.id))),
              child: Text(l.estPublie ? 'Voir ma fiche' : 'Aperçu'),
            ),
            child: Row(children: [
              ApsVignette(
                imageUrl: l.imageUrl,
                size: 56,
                radius: 8,
                repli: Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(color: AppColors.b1, borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.biotech_outlined, color: AppColors.b7),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(_logo == null ? 'Logo actuel' : 'Nouveau logo : ${_logo!.nom}', style: AppTextStyles.cardMeta),
              ),
              TextButton(onPressed: _choisirLogo, child: const Text('Changer')),
            ]),
          ),
          CartePortail(
            titre: 'Ma fiche',
            icone: Icons.biotech_outlined,
            child: Column(children: [
              ChampLaboratoire(controleur: _nom, libelle: 'Nom du laboratoire', requis: true),
              ChampLaboratoire(controleur: _agrement, libelle: "N° d'agrément", requis: true),
              ChampLaboratoire(controleur: _telephone, libelle: 'Téléphone', clavier: TextInputType.phone, requis: true),
              ChampLaboratoire(controleur: _email, libelle: 'E-mail', clavier: TextInputType.emailAddress, requis: true),
              ChampLaboratoire(controleur: _description, libelle: 'Présentation', lignes: 4, indication: 'Spécialités, équipements, horaires…'),
            ]),
          ),
          CartePortail(
            titre: 'Adresse',
            icone: Icons.place_outlined,
            child: Column(children: [
              ChoixVilleLaboratoire(paysId: l.paysId, villeId: _villeId, requis: true, onChanged: (v) => setState(() => _villeId = v)),
              ChampLaboratoire(controleur: _adresse, libelle: 'Adresse', requis: true, indication: 'Quartier, rue, point de repère'),
              Row(children: [
                Expanded(child: ChampLaboratoire(controleur: _lat, libelle: 'Latitude', clavier: const TextInputType.numberWithOptions(decimal: true, signed: true))),
                const SizedBox(width: 10),
                Expanded(child: ChampLaboratoire(controleur: _lng, libelle: 'Longitude', clavier: const TextInputType.numberWithOptions(decimal: true, signed: true))),
              ]),
            ]),
          ),
          ApsButton(label: 'Enregistrer la fiche', icon: Icons.check_rounded, loading: _envoi, onPressed: _envoi ? null : _enregistrer),
          const SizedBox(height: 8),
          Text("Pour remplacer votre CNI ou votre agrément, utilisez l'espace laboratoire du site web.", style: AppTextStyles.cardMeta),
        ],
      ),
    );
  }
}
