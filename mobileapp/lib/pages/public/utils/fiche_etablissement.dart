// lib/pages/public/utils/fiche_etablissement.dart
//
// Fiche publique d'un établissement de l'annuaire (pharmacie, centre de
// santé…) — pendant mobile de FichePharmacie.jsx / FicheStructureSante.jsx :
// grande image en premier ([ApsFicheHero]), puis badges, nom, ville,
// coordonnées, et barre fixe « Appeler / Itinéraire » en bas d'écran.
// Alimentée par la fiche déjà chargée dans l'annuaire : pas d'appel réseau.

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../components/components.dart';
import '../../../utils/marque.dart';

/// Une ligne d'information (icône, libellé, valeur).
typedef LigneFiche = ({IconData icone, String libelle, String valeur});

class FicheEtablissementPage extends StatefulWidget {
  const FicheEtablissementPage({
    super.key,
    required this.titre,
    required this.sousTitre,
    required this.repliIcone,
    this.logoUrl,
    this.chargerPhotos,
    this.badges = const [],
    this.description,
    this.lignes = const [],
    this.telephone,
    this.latitude,
    this.longitude,
    this.adresseRecherche,
  });

  final String titre;
  final String sousTitre;
  final IconData repliIcone;

  /// Logo / image principale de la fiche (badge dans le coin s'il y a des photos).
  final String? logoUrl;

  /// Photos publiques de la galerie, chargées une fois à l'ouverture.
  final Future<List<String>> Function()? chargerPhotos;
  final List<Widget> badges;
  final String? description;
  final List<LigneFiche> lignes;
  final String? telephone;
  final double? latitude;
  final double? longitude;

  /// Texte cherché sur la carte quand il n'y a pas de position GPS.
  final String? adresseRecherche;

  @override
  State<FicheEtablissementPage> createState() => _FicheEtablissementPageState();
}

class _FicheEtablissementPageState extends State<FicheEtablissementPage> {
  List<String> _photos = const [];

  @override
  void initState() {
    super.initState();
    widget.chargerPhotos?.call().then((liste) {
      if (mounted && liste.isNotEmpty) setState(() => _photos = liste);
    });
  }

  String get titre => widget.titre;
  String get sousTitre => widget.sousTitre;
  String? get telephone => widget.telephone;
  double? get latitude => widget.latitude;
  double? get longitude => widget.longitude;
  String? get adresseRecherche => widget.adresseRecherche;

  bool get _aTelephone => telephone != null && telephone!.trim().isNotEmpty;

  Uri? get _itineraire {
    if (latitude != null && longitude != null) {
      return Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$latitude,$longitude');
    }
    final q = adresseRecherche?.trim() ?? '';
    if (q.isEmpty) return null;
    return Uri.parse('https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(q)}');
  }

  Future<void> _ouvrir(BuildContext context, Uri uri) async {
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Impossible d'ouvrir l'application.")));
    }
  }

  @override
  Widget build(BuildContext context) {
    final itineraire = _itineraire;
    return Scaffold(
      backgroundColor: AppColors.bg,
      bottomNavigationBar: (!_aTelephone && itineraire == null)
          ? null
          : ApsCtaBar(
              child: Row(
                children: [
                  if (_aTelephone)
                    Expanded(
                      child: ApsButton(
                        label: 'Appeler',
                        icon: Icons.call_rounded,
                        onPressed: () => _ouvrir(context, Uri(scheme: 'tel', path: telephone!.trim())),
                      ),
                    ),
                  if (_aTelephone && itineraire != null) const SizedBox(width: 10),
                  if (itineraire != null)
                    Expanded(
                      child: ApsButton(
                        label: 'Itinéraire',
                        icon: Icons.directions_outlined,
                        variant: _aTelephone ? ApsButtonVariant.soft : ApsButtonVariant.primary,
                        onPressed: () => _ouvrir(context, itineraire),
                      ),
                    ),
                ],
              ),
            ),
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            ApsFicheHero(
              images: _photos,
              logoUrl: widget.logoUrl,
              repliIcone: widget.repliIcone,
              onPartager: () => apsCopierFiche(context, [
                titre,
                sousTitre,
                if (_aTelephone) 'Tél. ${telephone!.trim()}',
                'Trouvé sur $nomMarque',
              ]),
            ),
            ApsFicheEntete(
              badges: widget.badges,
              titre: titre,
              sousTitre: sousTitre,
              description: widget.description,
            ),
            if (widget.lignes.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
                child: Container(
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.line),
                  ),
                  child: Column(
                    children: [
                      for (var i = 0; i < widget.lignes.length; i++) ...[
                        if (i > 0) const Divider(height: 1, color: AppColors.line),
                        ListTile(
                          dense: true,
                          leading: Icon(widget.lignes[i].icone, size: 20, color: AppColors.primary),
                          title: Text(widget.lignes[i].libelle, style: AppTextStyles.xs),
                          subtitle: Text(widget.lignes[i].valeur, style: AppTextStyles.strong.copyWith(fontSize: 13.5)),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
