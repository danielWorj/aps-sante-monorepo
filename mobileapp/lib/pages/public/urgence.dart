// urgence.dart
//
// Écran "Urgence" de l'app APS Santé — écran 23 de la refonte 2026
// (new-mobile-ui.html) : mode sombre, un seul geste principal.
//
//   - un grand bouton SAMU à MAINTENIR 2 secondes (évite les appels par
//     erreur), avec un anneau de progression ;
//   - Police, Pompiers, pharmacie de garde et hôpital proche en tuiles ;
//   - « Envoyer ma position » à un contact d'urgence.
//
// Règle produit (§12 du cahier des charges) : AUCUNE publicité ni contenu
// commercial sur cet écran, quelle que soit sa forme. La santé publique
// prime toujours sur la logique commerciale.
//
// Les numéros sont composés via `url_launcher` (tel:) et restent
// utilisables hors connexion. Géolocalisation réelle : à brancher via
// `geolocator` (TODO ci-dessous).

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../components/components.dart';
import 'Centresantepage.dart';
import 'Pharmaciepage.dart';
import 'publicAcceuil.dart';

/// Couleurs propres à l'écran d'urgence (fond rouge très sombre).
class _Urg {
  static const fond = Color(0xFF120708);
  static const halo = Color(0xFF5A1316);
  static const rouge = Color(0xFFFF6B6F);
  static const tuile = Color(0x12FFFFFF);
  static const bordure = Color(0x1AFFFFFF);
}

class UrgencePage extends StatefulWidget {
  const UrgencePage({super.key});

  @override
  State<UrgencePage> createState() => _UrgencePageState();
}

class _UrgencePageState extends State<UrgencePage> {
  // TODO: remplacer par une vraie géolocalisation (package geolocator).
  String _localisation = 'Localisation en cours…';

  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(milliseconds: 400), () {
      if (!mounted) return;
      setState(() => _localisation = 'Douala, Cameroun');
    });
  }

  Future<void> _appeler(String numero) async {
    final uri = Uri(scheme: 'tel', path: numero);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Impossible d'appeler le $numero depuis cet appareil.")),
      );
    }
  }

  void _envoyerPositionContact() {
    // TODO: envoyer la position GPS par SMS au contact d'urgence configuré.
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("Position envoyée à votre contact d'urgence.")),
    );
  }

  void _fermer() {
    final nav = Navigator.of(context);
    if (nav.canPop()) {
      nav.pop();
    } else {
      nav.pushReplacement(MaterialPageRoute(builder: (_) => const PublicAcceuilPage()));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: _Urg.fond,
        body: Container(
          decoration: const BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(0, -0.3),
              radius: 0.9,
              colors: [_Urg.halo, Color(0xFF200A0B), _Urg.fond],
              stops: [0, 0.6, 1],
            ),
          ),
          child: SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(18, 6, 18, 24),
              children: [
                ApsTopBar(
                  glass: true,
                  title: 'Urgence',
                  leading: ApsIconButton(
                    icon: Icons.close_rounded,
                    glass: true,
                    tooltip: 'Fermer',
                    onPressed: _fermer,
                  ),
                  trailing: ApsIconButton(
                    icon: Icons.info_outline_rounded,
                    glass: true,
                    tooltip: 'À propos',
                    onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                            "Les numéros d'urgence restent accessibles même sans réseau."),
                      ),
                    ),
                  ),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.my_location_rounded,
                        size: 13, color: Colors.white.withValues(alpha: 0.75)),
                    const SizedBox(width: 6),
                    Text(
                      _localisation,
                      style: TextStyle(
                        fontFamily: AppTextStyles.fontSans,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Colors.white.withValues(alpha: 0.75),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 22),
                Center(child: _BoutonSamu(onAppel: () => _appeler('1515'))),
                const SizedBox(height: 14),
                Text(
                  'Maintenez appuyé 2 secondes pour appeler',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.7),
                  ),
                ),
                const SizedBox(height: 22),
                Row(
                  children: [
                    Expanded(
                      child: _Tuile(
                        icone: Icons.local_police_outlined,
                        couleur: const Color(0xFF8AB4FF),
                        titre: 'Police',
                        numero: '117',
                        onTap: () => _appeler('117'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _Tuile(
                        icone: Icons.local_fire_department_outlined,
                        couleur: const Color(0xFFFFB36B),
                        titre: 'Pompiers',
                        numero: '118',
                        onTap: () => _appeler('118'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: _Tuile(
                        icone: Icons.local_pharmacy_outlined,
                        couleur: AppColors.mint,
                        titre: 'Pharmacie de garde',
                        sousTitre: 'La plus proche',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const PharmaciePage()),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _Tuile(
                        icone: Icons.local_hospital_outlined,
                        couleur: const Color(0xFFC4B9FF),
                        titre: 'Hôpital proche',
                        sousTitre: 'Urgences 24/7',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const CentreSantePage()),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Material(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(18),
                    onTap: _envoyerPositionContact,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      child: Row(
                        children: [
                          const Icon(Icons.send_outlined, color: AppColors.b6),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Envoyer ma position',
                                    style: AppTextStyles.strong.copyWith(fontSize: 13)),
                                Text("À votre contact d'urgence · SMS",
                                    style: AppTextStyles.xs),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right_rounded, color: AppColors.ink4),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  "Numéros disponibles hors connexion · aucun contenu commercial sur cet écran.",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.45),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Grand bouton SAMU à maintenir 2 s, entouré d'anneaux qui pulsent.
class _BoutonSamu extends StatefulWidget {
  const _BoutonSamu({required this.onAppel});
  final VoidCallback onAppel;

  @override
  State<_BoutonSamu> createState() => _BoutonSamuState();
}

class _BoutonSamuState extends State<_BoutonSamu> with TickerProviderStateMixin {
  late final AnimationController _anneaux = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2400),
  );
  late final AnimationController _maintien = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 2),
  )..addStatusListener((s) {
      if (s == AnimationStatus.completed) {
        HapticFeedback.heavyImpact();
        widget.onAppel();
        _maintien.reset();
      }
    });

  @override
  void initState() {
    super.initState();
    final reduire = WidgetsBinding
        .instance.platformDispatcher.accessibilityFeatures.disableAnimations;
    if (!reduire) _anneaux.repeat();
  }

  @override
  void dispose() {
    _anneaux.dispose();
    _maintien.dispose();
    super.dispose();
  }

  void _debut() {
    HapticFeedback.selectionClick();
    _maintien.forward(from: 0);
  }

  void _fin() {
    if (_maintien.status != AnimationStatus.completed) _maintien.reverse();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Appeler le SAMU, 1515. Maintenir appuyé.',
      onTap: widget.onAppel,
      child: GestureDetector(
        onTapDown: (_) => _debut(),
        onTapUp: (_) => _fin(),
        onTapCancel: _fin,
        child: SizedBox(
          width: 220,
          height: 220,
          child: AnimatedBuilder(
            animation: Listenable.merge([_anneaux, _maintien]),
            builder: (context, _) => Stack(
              alignment: Alignment.center,
              children: [
                for (final decalage in [0.0, 1 / 3, 2 / 3])
                  Builder(builder: (_) {
                    final t = (_anneaux.value + decalage) % 1.0;
                    return Transform.scale(
                      scale: 0.7 + t,
                      child: Container(
                        width: 200,
                        height: 200,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: _Urg.rouge.withValues(alpha: 0.7 * (1 - t)),
                            width: 1.5,
                          ),
                        ),
                      ),
                    );
                  }),
                SizedBox(
                  width: 186,
                  height: 186,
                  child: CircularProgressIndicator(
                    value: _maintien.value,
                    strokeWidth: 4,
                    color: Colors.white,
                    backgroundColor: Colors.transparent,
                  ),
                ),
                Transform.scale(
                  scale: 1 - 0.04 * _maintien.value,
                  child: Container(
                    width: 170,
                    height: 170,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const RadialGradient(
                        center: Alignment(-0.3, -0.4),
                        colors: [Color(0xFFFF7A7E), Color(0xFFD3272E), Color(0xFFA0161C)],
                        stops: [0, 0.6, 1],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.red.withValues(alpha: 0.9),
                          blurRadius: 60,
                          offset: const Offset(0, 30),
                          spreadRadius: -20,
                        ),
                      ],
                    ),
                    child: const Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.call_rounded, color: Colors.white, size: 30),
                        SizedBox(height: 6),
                        Text(
                          'SAMU',
                          style: TextStyle(
                            fontFamily: AppTextStyles.fontSans,
                            fontSize: 30,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.9,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          '1515',
                          style: TextStyle(
                            fontFamily: AppTextStyles.fontMono,
                            fontSize: 15,
                            color: Color(0xD9FFFFFF),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Tuile translucide (Police, Pompiers, pharmacie, hôpital).
class _Tuile extends StatelessWidget {
  const _Tuile({
    required this.icone,
    required this.couleur,
    required this.titre,
    required this.onTap,
    this.numero,
    this.sousTitre,
  });

  final IconData icone;
  final Color couleur;
  final String titre;
  final String? numero;
  final String? sousTitre;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(18);
    return Material(
      color: _Urg.tuile,
      shape: RoundedRectangleBorder(
        borderRadius: r,
        side: const BorderSide(color: _Urg.bordure),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: r,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icone, color: couleur, size: 20),
              const SizedBox(height: 8),
              Text(
                titre,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: AppTextStyles.fontSans,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
              if (numero != null)
                Text(
                  numero!,
                  style: const TextStyle(
                    fontFamily: AppTextStyles.fontMono,
                    fontSize: 18,
                    color: Colors.white,
                  ),
                )
              else
                Text(
                  sousTitre ?? '',
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: 12,
                    height: 1.5,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.7),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
