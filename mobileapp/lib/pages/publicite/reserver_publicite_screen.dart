// lib/pages/publicite/reserver_publicite_screen.dart
//
// Réservation d'un espace publicitaire (v9), miroir de ReserverPublicite.jsx :
//   1. page, position (1re = affichée en premier, la plus chère) et durée ;
//   2. date de début (position exclusive : périodes prises et prochaine
//      date libre fournies par le serveur) ;
//   3. la publicité : titre, brève description, flyer, téléphone, e-mail,
//      localisation ;
//   4. l'annonceur : nom, entreprise, WhatsApp (reçoit la décision), e-mail.
// La demande part en modération ; la décision arrive par WhatsApp.

import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/style/colors.dart';
import '../../components/style/text_styles.dart';
import '../../controllers/annonceur_publicite_controller.dart';
import '../../controllers/authentification_controller.dart';
import '../../models/annonceur_publicite_models.dart';
import '../../utils/fonds.dart';
import 'mes_publicites_screen.dart';

class ReserverPubliciteScreen extends ConsumerStatefulWidget {
  const ReserverPubliciteScreen({super.key, this.codePage = PagesPublicite.accueil});

  final String codePage;

  @override
  ConsumerState<ReserverPubliciteScreen> createState() => _ReserverPubliciteScreenState();
}

class _ReserverPubliciteScreenState extends ConsumerState<ReserverPubliciteScreen> {
  static const _tailleMax = 5 * 1024 * 1024;

  late String _page = widget.codePage;
  List<ForfaitReservable>? _forfaits;
  String? _erreurForfaits;
  ForfaitReservable? _forfait;
  DisponibiliteForfait? _dispo;
  DateTime? _debut;
  Uint8List? _visuel;
  String? _nomVisuel;
  bool _envoi = false;
  String? _erreur;

  final _titre = TextEditingController();
  final _description = TextEditingController();
  final _tel = TextEditingController();
  final _email = TextEditingController();
  final _lieu = TextEditingController();
  final _nom = TextEditingController();
  final _entreprise = TextEditingController();
  final _whatsapp = TextEditingController();
  final _emailAnnonceur = TextEditingController();

  @override
  void initState() {
    super.initState();
    _chargerForfaits();
    appelAnnonceur(ref, (repo, token) => repo.profilAnnonceur(token: token)).then((p) {
      if (!mounted) return;
      if (_nom.text.isEmpty) _nom.text = p.nom ?? '';
      if (_entreprise.text.isEmpty) _entreprise.text = p.entreprise ?? '';
      if (_whatsapp.text.isEmpty) _whatsapp.text = p.telephone ?? '';
      if (_emailAnnonceur.text.isEmpty) _emailAnnonceur.text = p.email ?? '';
    }).catchError((_) {});
  }

  @override
  void dispose() {
    for (final c in [_titre, _description, _tel, _email, _lieu, _nom, _entreprise, _whatsapp, _emailAnnonceur]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _chargerForfaits() async {
    setState(() {
      _forfaits = null;
      _forfait = null;
      _dispo = null;
      _erreurForfaits = null;
    });
    try {
      final paysId = ref.read(authUtilisateurProvider)?.paysId;
      final f = await appelAnnonceur(ref, (repo, token) => repo.forfaitsPage(_page, paysId: paysId, token: token));
      if (mounted) setState(() => _forfaits = f);
    } catch (e) {
      if (mounted) setState(() { _forfaits = const []; _erreurForfaits = '$e'; });
    }
  }

  Future<void> _choisirForfait(ForfaitReservable f) async {
    setState(() { _forfait = f; _dispo = null; _debut = null; });
    try {
      final d = await appelAnnonceur(ref, (repo, token) => repo.disponibilites(f.id, token: token));
      if (mounted && _forfait?.id == f.id) setState(() { _dispo = d; _debut = d.prochaineDateLibre; });
    } catch (e) {
      if (mounted) setState(() => _erreur = '$e');
    }
  }

  Future<void> _choisirDate() async {
    final d = _dispo;
    if (d == null) return;
    final choix = await showDatePicker(
      context: context,
      initialDate: _debut ?? d.prochaineDateLibre,
      firstDate: d.premierJour,
      lastDate: d.premierJour.add(const Duration(days: 365)),
      helpText: 'Début de diffusion',
    );
    if (choix != null) setState(() => _debut = DateTime.utc(choix.year, choix.month, choix.day));
  }

  Future<void> _choisirVisuel() async {
    final fichiers = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp']);
    if (fichiers.isEmpty) return;
    final f = fichiers.single;
    final octets = await f.readAsBytes();
    if (octets.length > _tailleMax) {
      setState(() => _erreur = 'Image trop lourde (5 Mo maximum).');
      return;
    }
    setState(() { _visuel = octets; _nomVisuel = f.name; _erreur = null; });
  }

  Future<void> _soumettre() async {
    final f = _forfait;
    final conflit = (f != null && _debut != null) ? _dispo?.conflit(_debut!, f.dureeJours) : null;
    String? probleme;
    if (f == null) {
      probleme = 'Choisissez une position et une durée.';
    } else if (_debut == null) {
      probleme = 'Choisissez la date de début.';
    } else if (conflit != null) {
      probleme = 'Position déjà réservée du ${jourLisible(conflit.debut)} au ${jourLisible(dernierJour(conflit.finExclue))}.';
    } else if (_titre.text.trim().isEmpty || _description.text.trim().isEmpty || _tel.text.trim().isEmpty) {
      probleme = 'Titre, description et téléphone de contact sont obligatoires.';
    } else if (_nom.text.trim().isEmpty || _whatsapp.text.trim().isEmpty) {
      probleme = 'Votre nom et votre numéro WhatsApp sont obligatoires.';
    } else if (_visuel == null) {
      probleme = 'Ajoutez le flyer ou l’image de votre publicité.';
    }
    if (probleme != null) {
      setState(() => _erreur = probleme);
      return;
    }
    setState(() { _envoi = true; _erreur = null; });
    try {
      final pub = await appelAnnonceur(ref, (repo, token) => repo.reserver(
            champs: {
              'forfait_publicitaire_id': f!.id,
              'date_debut': jourIso(_debut!),
              'titre': _titre.text,
              'description': _description.text,
              'telephone_contact': _tel.text,
              'email_contact': _email.text,
              'localisation': _lieu.text,
              'annonceur_nom': _nom.text,
              'annonceur_entreprise': _entreprise.text,
              'annonceur_telephone': _whatsapp.text,
              'annonceur_email': _emailAnnonceur.text,
            },
            visuelOctets: _visuel!,
            visuelNomFichier: _nomVisuel ?? 'flyer.jpg',
            token: token,
          ));
      if (!mounted) return;
      ref.invalidate(mesPublicitesProvider);
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          icon: const Icon(Icons.send_outlined, color: AppColors.success, size: 40),
          title: const Text('Demande envoyée'),
          content: Text(
            'Nous examinons votre publicité « ${pub.titre} ». Vous recevrez la décision par WhatsApp au '
            '${_whatsapp.text.trim()} ; en cas d’acceptation, le message contient le lien de paiement.',
          ),
          actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Voir mes publicités'))],
        ),
      );
      if (mounted) {
        Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const MesPublicitesScreen()));
      }
    } catch (e) {
      if (mounted) setState(() => _erreur = '$e');
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final f = _forfait;
    final parRang = <int, List<ForfaitReservable>>{};
    for (final x in _forfaits ?? const <ForfaitReservable>[]) {
      parRang.putIfAbsent(x.rang, () => []).add(x);
    }
    final rangs = parRang.keys.toList()..sort();
    final conflit = (f != null && _debut != null) ? _dispo?.conflit(_debut!, f.dureeJours) : null;

    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(title: const Text('Réserver un espace')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
        children: [
          const Text(
            'Votre publicité s’affiche dans le carrousel de la page choisie. Chaque position est exclusive pendant '
            'votre période ; la 1re position apparaît en premier.',
            style: AppTextStyles.cardMeta,
          ),
          _Bloc(numero: 1, titre: 'Page, position et durée', enfants: [
            DropdownButtonFormField<String>(
              initialValue: _page,
              decoration: const InputDecoration(labelText: 'Page', border: OutlineInputBorder()),
              items: [
                for (final e in PagesPublicite.libelles.entries) DropdownMenuItem(value: e.key, child: Text(e.value)),
              ],
              onChanged: (v) {
                if (v == null || v == _page) return;
                setState(() => _page = v);
                _chargerForfaits();
              },
            ),
            const SizedBox(height: 12),
            if (_forfaits == null) const Center(child: CircularProgressIndicator()),
            if (_erreurForfaits != null) Text(_erreurForfaits!, style: const TextStyle(color: AppColors.dangerDark)),
            if (_forfaits != null && _forfaits!.isEmpty && _erreurForfaits == null)
              const Text('Aucune offre n’est encore proposée pour cette page dans votre pays.', style: AppTextStyles.cardMeta),
            for (final r in rangs) ...[
              Padding(
                padding: const EdgeInsets.only(top: 8, bottom: 4),
                child: Row(children: [
                  Text(libellePosition(r), style: AppTextStyles.cardTitle),
                  if (r == 1) ...[
                    const SizedBox(width: 6),
                    const Chip(label: Text('Affichée en premier'), visualDensity: VisualDensity.compact),
                  ],
                ]),
              ),
              for (final x in parRang[r]!)
                Card(
                  elevation: 0,
                  color: f?.id == x.id ? AppColors.primaryLight : AppColors.card,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                    side: BorderSide(color: f?.id == x.id ? AppColors.primary : AppColors.line),
                  ),
                  child: ListTile(
                    leading: Icon(f?.id == x.id ? Icons.radio_button_checked : Icons.radio_button_off, color: AppColors.primary),
                    title: Text(x.libelle),
                    subtitle: Text('${x.dureeJours} jours'),
                    trailing: Text(montantDevise(x.prix, x.devise), style: AppTextStyles.cardTitle),
                    onTap: () => _choisirForfait(x),
                  ),
                ),
            ],
          ]),
          if (f != null)
            _Bloc(numero: 2, titre: 'Période de diffusion', enfants: [
              if (_dispo == null) const LinearProgressIndicator(),
              if (_dispo != null) ...[
                OutlinedButton.icon(
                  onPressed: _choisirDate,
                  icon: const Icon(Icons.event),
                  label: Text(_debut == null ? 'Choisir la date de début' : 'Début : ${jourLisible(_debut)}'),
                ),
                const SizedBox(height: 6),
                if (_debut != null)
                  Text(
                    conflit != null
                        ? 'Position prise du ${jourLisible(conflit.debut)} au ${jourLisible(dernierJour(conflit.finExclue))}.'
                        : 'Diffusion du ${jourLisible(_debut)} au ${jourLisible(_debut!.add(Duration(days: f.dureeJours - 1)))} inclus.',
                    style: TextStyle(color: conflit != null ? AppColors.dangerDark : AppColors.inkSoft),
                  ),
                if (_dispo!.periodes.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  const Text('Périodes déjà réservées :', style: AppTextStyles.cardMeta),
                  for (final p in _dispo!.periodes)
                    Text('• ${jourLisible(p.debut)} → ${jourLisible(dernierJour(p.finExclue))}', style: AppTextStyles.cardMeta),
                  Text('Prochaine date libre : ${jourLisible(_dispo!.prochaineDateLibre)}', style: AppTextStyles.cardMeta),
                ],
              ],
            ]),
          _Bloc(numero: 3, titre: 'Votre publicité', enfants: [
            _Champ(controleur: _titre, libelle: 'Titre *', max: 150),
            _Champ(controleur: _description, libelle: 'Brève description *', max: 1000, lignes: 4),
            const SizedBox(height: 4),
            InkWell(
              onTap: _choisirVisuel,
              borderRadius: BorderRadius.circular(12),
              child: Container(
                height: 170,
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.lineStrong),
                ),
                clipBehavior: Clip.antiAlias,
                child: _visuel != null
                    ? Image.memory(_visuel!, fit: BoxFit.contain)
                    : const Center(
                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                          Icon(Icons.cloud_upload_outlined, color: AppColors.primary, size: 32),
                          Text('Ajouter le flyer / l’image *'),
                          Text('JPEG, PNG ou WEBP — 5 Mo max.', style: AppTextStyles.cardMeta),
                        ]),
                      ),
              ),
            ),
            const SizedBox(height: 12),
            _Champ(controleur: _tel, libelle: 'Contact téléphone *', clavier: TextInputType.phone, max: 30),
            _Champ(controleur: _email, libelle: 'E-mail', clavier: TextInputType.emailAddress, max: 150),
            _Champ(controleur: _lieu, libelle: 'Localisation', max: 255),
          ]),
          _Bloc(numero: 4, titre: 'Vos informations', enfants: [
            _Champ(controleur: _nom, libelle: 'Nom complet *', max: 150),
            _Champ(controleur: _entreprise, libelle: 'Entreprise', max: 150),
            _Champ(controleur: _whatsapp, libelle: 'Numéro WhatsApp *', clavier: TextInputType.phone, max: 30,
                aide: 'La décision et le lien de paiement vous seront envoyés sur ce numéro.'),
            _Champ(controleur: _emailAnnonceur, libelle: 'E-mail', clavier: TextInputType.emailAddress, max: 150),
          ]),
          if (_erreur != null) Text(_erreur!, style: const TextStyle(color: AppColors.dangerDark)),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          decoration: const BoxDecoration(color: AppColors.card, border: Border(top: BorderSide(color: AppColors.line))),
          child: Row(children: [
            Expanded(
              child: f == null
                  ? const Text('Choisissez une offre', style: AppTextStyles.cardMeta)
                  : Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(montantDevise(f.prix, f.devise), style: AppTextStyles.h3),
                      const Text('Payable après acceptation', style: AppTextStyles.cardMeta),
                    ]),
            ),
            FilledButton(
              onPressed: _envoi || f == null ? null : _soumettre,
              child: Text(_envoi ? 'Envoi…' : 'Valider ma demande'),
            ),
          ]),
        ),
      ),
    );
  }
}

class _Bloc extends StatelessWidget {
  const _Bloc({required this.numero, required this.titre, required this.enfants});
  final int numero;
  final String titre;
  final List<Widget> enfants;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 14),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.line),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            CircleAvatar(radius: 12, backgroundColor: AppColors.primaryLight,
                child: Text('$numero', style: const TextStyle(fontSize: 12, color: AppColors.primary))),
            const SizedBox(width: 8),
            Text(titre, style: AppTextStyles.cardTitle),
          ]),
          const SizedBox(height: 12),
          ...enfants,
        ]),
      );
}

class _Champ extends StatelessWidget {
  const _Champ({required this.controleur, required this.libelle, this.max, this.lignes = 1, this.clavier, this.aide});
  final TextEditingController controleur;
  final String libelle;
  final int? max;
  final int lignes;
  final TextInputType? clavier;
  final String? aide;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: controleur,
          maxLength: max,
          maxLines: lignes,
          keyboardType: clavier,
          decoration: InputDecoration(labelText: libelle, helperText: aide, border: const OutlineInputBorder(), counterText: ''),
        ),
      );
}
