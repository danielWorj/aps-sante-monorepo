// lib/components/ui/aps_fiche_hero.dart
//
// Haut de fiche commun (médecin, pharmacie, centre de santé, assurance,
// laboratoire) façon « fiche produit » — pendant de FicheHero.jsx (web) :
//  - [ApsFicheHero] : grande image bord à bord en premier (photo, logo ou
//    photos de la structure), qui se balaie au doigt quand il y en a
//    plusieurs, avec boutons Retour / Partager posés dessus ;
//  - [ApsFicheEntete] : badges, nom, prix à droite, sous-titre et courte
//    description (« Lire la suite » si elle est longue).
// L'action principale reste dans la barre fixe du bas ([ApsCtaBar]).

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../style/colors.dart';
import '../style/text_styles.dart';

/// Initiales d'un nom (repli sans image) : « Dr Awa Ndiaye » → « AN ».
String apsInitiales(String nom) => nom
    .replaceFirst(RegExp(r'^Dr\.?\s+', caseSensitive: false), '')
    .trim()
    .split(RegExp(r'\s+'))
    .where((p) => p.isNotEmpty)
    .take(2)
    .map((p) => p[0])
    .join()
    .toUpperCase();

/// Liste d'URL dédoublonnée, sans valeurs vides.
List<String> apsImagesUniques(Iterable<String?> urls) {
  final vues = <String>{};
  return [
    for (final u in urls)
      if (u != null && u.trim().isNotEmpty && vues.add(u.trim())) u.trim(),
  ];
}

/// « Partager » : copie les coordonnées de la fiche (lignes non vides) dans
/// le presse-papiers, faute de feuille de partage native dans l'application.
Future<void> apsCopierFiche(BuildContext context, List<String?> lignes) async {
  final texte = lignes.whereType<String>().map((l) => l.trim()).where((l) => l.isNotEmpty).join('\n');
  await Clipboard.setData(ClipboardData(text: texte));
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Coordonnées copiées, prêtes à partager.')));
  }
}

class ApsFicheHero extends StatefulWidget {
  const ApsFicheHero({
    super.key,
    required this.images,
    this.logoUrl,
    this.contain = false,
    this.repliIcone = Icons.image_outlined,
    this.repliTexte,
    this.onPartager,
    this.actionDroite,
  });

  /// Photos du carrousel (première = principale). Vide → [logoUrl] en
  /// grand, sinon repli (icône ou initiales).
  final List<String> images;

  /// Logo de la structure : petit badge rond dans le coin quand il y a des
  /// photos, image principale (en entier) quand il n'y en a pas.
  final String? logoUrl;

  /// `true` pour un logo : affiché en entier sur un fond flouté de lui-même.
  final bool contain;
  final IconData repliIcone;
  final String? repliTexte;
  final VoidCallback? onPartager;

  /// Bouton rond supplémentaire à droite (ex. appeler), avant « Partager ».
  final Widget? actionDroite;

  @override
  State<ApsFicheHero> createState() => _ApsFicheHeroState();
}

class _ApsFicheHeroState extends State<ApsFicheHero> {
  final _controleur = PageController();
  int _courant = 0;

  @override
  void didUpdateWidget(covariant ApsFicheHero ancien) {
    super.didUpdateWidget(ancien);
    // Galerie chargée après la fiche (ou liste raccourcie) : index borné.
    if (widget.images.length != ancien.images.length && _courant != 0) {
      _courant = 0;
      if (_controleur.hasClients) _controleur.jumpToPage(0);
    }
  }

  @override
  void dispose() {
    _controleur.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final taille = MediaQuery.sizeOf(context);
    // Carré bord à bord, sans dépasser 58 % de la hauteur d'écran.
    final hauteur = taille.width.clamp(0.0, taille.height * .58);
    final logo = (widget.logoUrl?.trim().isEmpty ?? true) ? null : widget.logoUrl!.trim();
    final photos = widget.images.where((u) => u != logo).toList();
    // Pas de photo : le logo (ou l'image unique) prend toute la place.
    final images = photos.isNotEmpty ? photos : (logo == null ? const <String>[] : [logo]);
    final contain = photos.isEmpty && logo != null ? true : widget.contain;

    return SizedBox(
      height: hauteur,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (images.isEmpty)
            _Repli(icone: widget.repliIcone, texte: widget.repliTexte)
          else
            PageView.builder(
              controller: _controleur,
              itemCount: images.length,
              onPageChanged: (i) => setState(() => _courant = i),
              itemBuilder: (_, i) => _Diapo(
                url: images[i],
                contain: contain,
                repli: _Repli(icone: widget.repliIcone, texte: widget.repliTexte),
              ),
            ),
          // Boutons posés sur l'image.
          Positioned(
            top: 10,
            left: 12,
            right: 12,
            child: Row(
              children: [
                _Rond(
                  icone: Icons.chevron_left_rounded,
                  info: 'Retour',
                  onTap: () => Navigator.of(context).maybePop(),
                ),
                const Spacer(),
                if (widget.actionDroite != null) ...[widget.actionDroite!, const SizedBox(width: 8)],
                if (widget.onPartager != null)
                  _Rond(icone: Icons.ios_share_rounded, info: 'Partager', onTap: widget.onPartager!),
              ],
            ),
          ),
          if (photos.isNotEmpty && logo != null)
            Positioned(left: 14, bottom: 14, child: _BadgeLogo(url: logo)),
          if (images.length > 1)
            Positioned(
              left: 0,
              right: 0,
              bottom: 12,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < images.length; i++)
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 220),
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      width: i == _courant ? 18 : 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: i == _courant ? AppColors.primary : Colors.white.withValues(alpha: .8),
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: const Color(0x260F1C17)),
                      ),
                    ),
                ],
              ),
            ),
          const Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Divider(height: 1, thickness: 1, color: AppColors.line),
          ),
        ],
      ),
    );
  }
}

/// Logo de la structure posé dans le coin des photos.
class _BadgeLogo extends StatelessWidget {
  const _BadgeLogo({required this.url});
  final String url;

  @override
  Widget build(BuildContext context) => Container(
        width: 58,
        height: 58,
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.line, width: 1.5),
        ),
        child: ClipOval(
          child: Image.network(
            url,
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) => const Icon(Icons.image_not_supported_outlined, size: 20, color: AppColors.inkFaint),
          ),
        ),
      );
}

/// Bouton rond posé sur l'image — public pour les actions supplémentaires.
class ApsFicheRond extends StatelessWidget {
  const ApsFicheRond({super.key, required this.icone, required this.info, required this.onTap});
  final IconData icone;
  final String info;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => _Rond(icone: icone, info: info, onTap: onTap);
}

class _Rond extends StatelessWidget {
  const _Rond({required this.icone, required this.info, required this.onTap});
  final IconData icone;
  final String info;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: info,
        child: Material(
          color: Colors.white.withValues(alpha: .94),
          shape: const CircleBorder(side: BorderSide(color: AppColors.line)),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: SizedBox(width: 40, height: 40, child: Icon(icone, size: 22, color: AppColors.ink)),
          ),
        ),
      );
}

class _Diapo extends StatelessWidget {
  const _Diapo({required this.url, required this.contain, required this.repli});
  final String url;
  final bool contain;
  final Widget repli;

  @override
  Widget build(BuildContext context) {
    final image = Image.network(
      url,
      fit: contain ? BoxFit.contain : BoxFit.cover,
      alignment: contain ? Alignment.center : const Alignment(0, -.4),
      loadingBuilder: (_, enfant, progression) => progression == null
          ? enfant
          : const Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))),
      errorBuilder: (_, _, _) => repli,
    );
    if (!contain) return ColoredBox(color: AppColors.primarySurface, child: image);
    // Logo : fond très pâle de la couleur de marque, logo jamais rogné.
    return ColoredBox(
      color: AppColors.primarySurface,
      child: Padding(padding: const EdgeInsets.fromLTRB(40, 60, 40, 36), child: image),
    );
  }
}

class _Repli extends StatelessWidget {
  const _Repli({required this.icone, this.texte});
  final IconData icone;
  final String? texte;

  @override
  Widget build(BuildContext context) => Container(
        color: AppColors.primaryLight,
        alignment: Alignment.center,
        child: texte != null && texte!.isNotEmpty
            ? Text(
                texte!,
                style: const TextStyle(
                  fontFamily: AppTextStyles.fontDisplay,
                  fontSize: 64,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primaryDark,
                ),
              )
            : Icon(icone, size: 64, color: AppColors.primaryDark),
      );
}

/// Bloc d'informations sous l'image : badges, nom + prix, sous-titre,
/// description courte.
class ApsFicheEntete extends StatefulWidget {
  const ApsFicheEntete({
    super.key,
    required this.titre,
    this.badges = const [],
    this.titreSuffixe,
    this.sousTitre,
    this.prixValeur,
    this.prixLibelle,
    this.description,
    this.complement,
  });

  final String titre;
  final List<Widget> badges;

  /// Petit élément collé au nom (ex. coche « vérifié »).
  final Widget? titreSuffixe;
  final String? sousTitre;
  final String? prixValeur;
  final String? prixLibelle;
  final String? description;

  /// Élément libre sous la description (note, étoiles…).
  final Widget? complement;

  @override
  State<ApsFicheEntete> createState() => _ApsFicheEnteteState();
}

class _ApsFicheEnteteState extends State<ApsFicheEntete> {
  bool _deplie = false;

  @override
  Widget build(BuildContext context) {
    final desc = widget.description?.trim() ?? '';
    final longue = desc.length > 160;
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (widget.badges.isNotEmpty) ...[
            Wrap(spacing: 6, runSpacing: 6, children: widget.badges),
            const SizedBox(height: 10),
          ],
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(children: [
                    TextSpan(text: widget.titre),
                    if (widget.titreSuffixe != null)
                      WidgetSpan(
                        alignment: PlaceholderAlignment.middle,
                        child: Padding(padding: const EdgeInsets.only(left: 6), child: widget.titreSuffixe),
                      ),
                  ]),
                  style: AppTextStyles.l,
                ),
              ),
              if (widget.prixValeur != null) ...[
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(widget.prixValeur!, style: AppTextStyles.strong.copyWith(fontSize: 17)),
                    if (widget.prixLibelle != null) Text(widget.prixLibelle!, style: AppTextStyles.xs),
                  ],
                ),
              ],
            ],
          ),
          if (widget.sousTitre != null && widget.sousTitre!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(widget.sousTitre!, style: AppTextStyles.small),
          ],
          if (desc.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              desc,
              style: AppTextStyles.small,
              maxLines: _deplie ? null : 3,
              overflow: _deplie ? TextOverflow.visible : TextOverflow.ellipsis,
            ),
            if (longue)
              GestureDetector(
                onTap: () => setState(() => _deplie = !_deplie),
                child: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    _deplie ? 'Réduire' : 'Lire la suite',
                    style: AppTextStyles.xs.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
          ],
          if (widget.complement != null) ...[const SizedBox(height: 10), widget.complement!],
        ],
      ),
    );
  }
}
