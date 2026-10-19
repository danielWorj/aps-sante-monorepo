// lib/components/publicite/slider_publicite.dart
//
// Carrousel publicitaire d'une page (v9), miroir de SliderPublicite.jsx :
// jusqu'à `nombre_places` publicités payées, dans l'ordre des positions
// (1re position = la plus chère, affichée en premier), qui défilent
// automatiquement. Dessous, la carte « Réserver cet espace » ouvre le
// formulaire de réservation (connexion demandée si besoin).
//
// Statistiques : affichage signalé la première fois qu'une publicité devient
// visible, clic à chaque ouverture d'un contact (dédoublonnés côté serveur).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../controllers/annonceur_publicite_controller.dart';
import '../../controllers/authentification_controller.dart';
import '../../models/annonceur_publicite_models.dart';
import '../../pages/publicite/mes_publicites_screen.dart';
import '../../pages/publicite/reserver_publicite_screen.dart';
import '../style/colors.dart';
import '../style/text_styles.dart';

class SliderPublicite extends ConsumerStatefulWidget {
  const SliderPublicite({super.key, required this.code, this.intervalle = const Duration(seconds: 6)});

  /// Code de la page ([PagesPublicite]).
  final String code;
  final Duration intervalle;

  @override
  ConsumerState<SliderPublicite> createState() => _SliderPubliciteState();
}

class _SliderPubliciteState extends ConsumerState<SliderPublicite> {
  final _controleur = PageController();
  final Set<String> _vues = {};
  Timer? _minuterie;
  int _courant = 0;
  int _nombre = 0;

  @override
  void dispose() {
    _minuterie?.cancel();
    _controleur.dispose();
    super.dispose();
  }

  void _demarrer(int nombre) {
    if (nombre == _nombre) return;
    _nombre = nombre;
    _minuterie?.cancel();
    if (nombre > 1) {
      _minuterie = Timer.periodic(widget.intervalle, (_) {
        if (!_controleur.hasClients) return;
        _controleur.animateToPage((_courant + 1) % _nombre,
            duration: const Duration(milliseconds: 450), curve: Curves.easeInOut);
      });
    }
  }

  void _vue(PubliciteDiffusee p) {
    if (_vues.add(p.id)) ref.read(annonceurPubliciteRepositoryProvider).signalerEvenement('impression', [p.id]);
  }

  Future<void> _ouvrir(PubliciteDiffusee p, Uri uri) async {
    ref.read(annonceurPubliciteRepositoryProvider).signalerEvenement('clic', [p.id]);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  // Formulaire ouvert à tous : un visiteur y crée son compte annonceur, un
  // inscrit passe par « Rejoindre mon espace » (dans le formulaire).
  void _reserver() {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => ReserverPubliciteScreen(codePage: widget.code)));
  }

  @override
  Widget build(BuildContext context) {
    final etat = ref.watch(sliderPageProvider(widget.code));
    // La carte « Réserver cet espace » reste visible pour tout visiteur, même
    // sans emplacement configuré ni forfait actif pour la page.
    if (etat.isLoading && !etat.hasValue) return const SizedBox.shrink();
    final slider = etat.value;
    final pubs = slider?.publicites ?? const <PubliciteDiffusee>[];
    final nombrePlaces = slider?.nombrePlaces ?? 0;
    _demarrer(pubs.length);
    if (pubs.isNotEmpty) _vue(pubs[_courant.clamp(0, pubs.length - 1)]);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (pubs.isNotEmpty)
          Container(
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.line),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                  child: Row(children: [
                    const Text('Publicité', style: AppTextStyles.cardMeta),
                    const Spacer(),
                    if (pubs.length > 1) Text('${_courant + 1} / ${pubs.length}', style: AppTextStyles.cardMeta),
                  ]),
                ),
                SizedBox(
                  height: 300,
                  child: PageView.builder(
                    controller: _controleur,
                    itemCount: pubs.length,
                    onPageChanged: (i) {
                      setState(() => _courant = i);
                      _vue(pubs[i]);
                    },
                    itemBuilder: (_, i) => _Diapositive(publicite: pubs[i], ouvrir: _ouvrir),
                  ),
                ),
                if (pubs.length > 1)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        for (var i = 0; i < pubs.length; i++)
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 250),
                            margin: const EdgeInsets.symmetric(horizontal: 3),
                            width: i == _courant ? 18 : 7,
                            height: 7,
                            decoration: BoxDecoration(
                              color: i == _courant ? AppColors.primary : AppColors.lineStrong,
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ...[
          if (pubs.isNotEmpty) const SizedBox(height: 10),
          _CarteReserver(
            texte: pubs.isEmpty
                ? "Cet emplacement est disponible pour les annonceurs partenaires d'ApSa."
                : nombrePlaces > pubs.length
                    ? 'Encore ${nombrePlaces - pubs.length} position(s) libre(s) dans ce carrousel.'
                    : 'Réservez votre position pour les prochaines périodes.',
            onTap: _reserver,
          ),
          if (ref.watch(authUtilisateurProvider) != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const MesPublicitesScreen())),
                icon: const Icon(Icons.insights_outlined, size: 18),
                label: const Text('Mes publicités et statistiques'),
              ),
            ),
        ],
      ],
    );
  }
}

class _Diapositive extends StatelessWidget {
  const _Diapositive({required this.publicite, required this.ouvrir});

  final PubliciteDiffusee publicite;
  final Future<void> Function(PubliciteDiffusee, Uri) ouvrir;

  @override
  Widget build(BuildContext context) {
    final p = publicite;
    final tel = p.telephoneContact?.replaceAll(RegExp(r'[^\d+]'), '');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: Image.network(p.visuelUrl, fit: BoxFit.cover, semanticLabel: p.titre,
              errorBuilder: (_, _, _) => Container(color: AppColors.paper, child: const Icon(Icons.campaign_outlined))),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(p.titre, style: AppTextStyles.cardTitle, maxLines: 1, overflow: TextOverflow.ellipsis),
              if (p.description != null)
                Text(p.description!, style: AppTextStyles.cardMeta, maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 6),
              Wrap(spacing: 6, children: [
                if (tel != null && tel.isNotEmpty) ...[
                  _Action(icone: Icons.chat_outlined, libelle: 'WhatsApp',
                      onTap: () => ouvrir(p, Uri.parse('https://wa.me/${tel.replaceAll('+', '')}'))),
                  _Action(icone: Icons.phone_outlined, libelle: 'Appeler', onTap: () => ouvrir(p, Uri.parse('tel:$tel'))),
                ],
                if (p.emailContact != null)
                  _Action(icone: Icons.mail_outline, libelle: 'E-mail', onTap: () => ouvrir(p, Uri.parse('mailto:${p.emailContact}'))),
              ]),
            ],
          ),
        ),
      ],
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({required this.icone, required this.libelle, required this.onTap});
  final IconData icone;
  final String libelle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
        onPressed: onTap,
        icon: Icon(icone, size: 16),
        label: Text(libelle),
        style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
      );
}

class _CarteReserver extends StatelessWidget {
  const _CarteReserver({required this.texte, required this.onTap});
  final String texte;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.primarySurface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.lineStrong),
        ),
        child: Row(children: [
          const Icon(Icons.campaign_outlined, color: AppColors.primary),
          const SizedBox(width: 10),
          Expanded(child: Text(texte, style: AppTextStyles.cardMeta)),
          const SizedBox(width: 8),
          FilledButton(onPressed: onTap, child: const Text('Réserver')),
        ]),
      );
}
