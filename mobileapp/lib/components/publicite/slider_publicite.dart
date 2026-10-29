// lib/components/publicite/slider_publicite.dart
//
// Carrousel publicitaire d'une page (v9), miroir de SliderPublicite.jsx :
// jusqu'à `nombre_places` publicités payées, dans l'ordre des positions
// (1re position = la plus chère, affichée en premier), qui défilent
// automatiquement. Dessous, la carte « Réserver cet espace » ouvre le
// formulaire de réservation (connexion demandée si besoin).
//
// Rotation : la minuterie repart à zéro après chaque changement (balayage
// manuel compris), s'arrête pendant que le doigt est posé, quand l'écran est
// recouvert par une autre page ou quand l'application passe en arrière-plan.
// Le flyer est affiché en entier (contain) sur un fond flouté de lui-même :
// un flyer vertical n'est jamais rogné.
//
// Statistiques : affichage signalé la première fois qu'une publicité devient
// visible, clic à chaque ouverture d'un contact (dédoublonnés côté serveur).

import 'dart:async';
import 'dart:ui' show ImageFilter;

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

class _SliderPubliciteState extends ConsumerState<SliderPublicite> with WidgetsBindingObserver {
  final _controleur = PageController();
  final Set<String> _vues = {};
  Timer? _minuterie;
  int _courant = 0;
  int _nombre = 0;
  bool _doigtPose = false;
  bool _premierPlan = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _minuterie?.cancel();
    _controleur.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _premierPlan = state == AppLifecycleState.resumed;
    _relancer();
  }

  /// Nombre de publicités connu (au chargement / rafraîchissement).
  void _demarrer(int nombre) {
    if (nombre == _nombre) return;
    _nombre = nombre;
    // Liste raccourcie au rafraîchissement : revenir à la première.
    // Appelé pendant build : le saut de page attend la fin de la frame.
    if (_courant >= nombre) {
      _courant = 0;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _controleur.hasClients) _controleur.jumpToPage(0);
      });
    }
    _relancer();
  }

  /// (Re)programme le passage à la publicité suivante, une seule fois :
  /// chaque changement de page relance un délai complet.
  void _relancer() {
    _minuterie?.cancel();
    if (_nombre <= 1 || _doigtPose || !_premierPlan) return;
    _minuterie = Timer(widget.intervalle, () {
      if (!mounted || !_controleur.hasClients) return;
      // Écran recouvert (autre page poussée) : on attend son retour.
      if (!(ModalRoute.of(context)?.isCurrent ?? true)) return _relancer();
      _controleur.animateToPage((_courant + 1) % _nombre, duration: const Duration(milliseconds: 450), curve: Curves.easeInOut);
    });
  }

  void _allerA(int i) {
    if (_controleur.hasClients) {
      _controleur.animateToPage(i, duration: const Duration(milliseconds: 350), curve: Curves.easeInOut);
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
              borderRadius: BorderRadius.circular(10),
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
                  height: 320,
                  // Doigt posé (balayage ou appui) : la rotation attend.
                  child: Listener(
                    onPointerDown: (_) {
                      _doigtPose = true;
                      _relancer();
                    },
                    onPointerUp: (_) {
                      _doigtPose = false;
                      _relancer();
                    },
                    onPointerCancel: (_) {
                      _doigtPose = false;
                      _relancer();
                    },
                    child: PageView.builder(
                      controller: _controleur,
                      itemCount: pubs.length,
                      onPageChanged: (i) {
                        setState(() => _courant = i);
                        _vue(pubs[i]);
                        _relancer();
                      },
                      itemBuilder: (_, i) => _Diapositive(publicite: pubs[i], ouvrir: _ouvrir),
                    ),
                  ),
                ),
                if (pubs.length > 1)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        for (var i = 0; i < pubs.length; i++)
                          // Zone de toucher plus grande que le point (accessibilité).
                          Semantics(
                            button: true,
                            selected: i == _courant,
                            label: 'Publicité ${i + 1} sur ${pubs.length}',
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: () => _allerA(i),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 8),
                                child: AnimatedContainer(
                                  duration: const Duration(milliseconds: 250),
                                  width: i == _courant ? 18 : 7,
                                  height: 7,
                                  decoration: BoxDecoration(
                                    color: i == _courant ? AppColors.primary : AppColors.lineStrong,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                ),
                              ),
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
          child: Stack(fit: StackFit.expand, children: [
            // Fond : le flyer lui-même, agrandi et flouté (même image en cache).
            ColoredBox(
              color: AppColors.paper,
              child: ImageFiltered(
                imageFilter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                child: Opacity(
                  opacity: .5,
                  child: Image.network(p.visuelUrl, fit: BoxFit.cover, excludeFromSemantics: true,
                      errorBuilder: (_, _, _) => const SizedBox.shrink()),
                ),
              ),
            ),
            Image.network(
              p.visuelUrl,
              fit: BoxFit.contain,
              semanticLabel: p.titre,
              loadingBuilder: (_, enfant, progression) => progression == null
                  ? enfant
                  : const Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))),
              errorBuilder: (_, _, _) => const Center(child: Icon(Icons.campaign_outlined, color: AppColors.inkFaint, size: 36)),
            ),
          ]),
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
              Wrap(spacing: 6, runSpacing: 4, children: [
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
