// urgence.dart
//
// Écran "Urgence" de l'app APS Santé — inspiré de la maquette ui-mobile.html
// (écran 6 · Bouton d'urgence — géolocalisation + numéros officiels).
//
// Cette version s'appuie exclusivement sur les composants déjà développés
// dans lib/components (voir components/README.md) plutôt que de recréer des
// styles ad hoc : AppColors, AppTextStyles, CardSurface, BadgeChip, GuardDot,
// CallButton, ItineraryButton, CardPharmacie, SecondaryButton, AppAlert,
// AppBottomNav.
//
// Règle produit (§12 du cahier des charges) : AUCUNE publicité ni contenu
// commercial sur cet écran, quelle que soit sa forme. La santé publique
// prime toujours sur la logique commerciale — d'où le AppAlert(danger)
// "Zéro publicité" repris du même pattern que dans example_usage.dart.
//
// Dépendances suggérées (à ajouter dans pubspec.yaml si besoin) :
//   url_launcher: ^6.3.0   -> pour composer un numéro (tel:)
//   geolocator:   ^13.0.0  -> pour la géolocalisation réelle
//
// Adapter le chemin d'import ci-dessous au nom réel du package / à
// l'emplacement de vos composants dans le projet.

import 'package:flutter/material.dart';
import '../../components/components.dart';
// import 'package:url_launcher/url_launcher.dart';



/// Type d'urgence sélectionnable en haut de l'écran (grille 3x2).
class _EmergencyType {
  final String label;
  final IconData icon;
  const _EmergencyType(this.label, this.icon);
}

/// Service officiel avec numéro direct (SAMU, Police secours...).
class _OfficialService {
  final String title;
  final String subtitle;
  final String number;
  final IconData icon;
  const _OfficialService({
    required this.title,
    required this.subtitle,
    required this.number,
    required this.icon,
  });
}

class UrgencePage extends StatefulWidget {
  const UrgencePage({super.key});

  @override
  State<UrgencePage> createState() => _UrgencePageState();
}

class _UrgencePageState extends State<UrgencePage> {
  // TODO: remplacer par une vraie géolocalisation (package geolocator).
  String _localisation = 'Localisation en cours…';
  String? _typeSelectionne;
  int _navIndex = -1; // aucune des 4 rubriques standard n'est "Urgence"

  final List<_EmergencyType> _types = const [
    _EmergencyType('Médicale', Icons.medical_services_outlined),
    _EmergencyType('Ambulance', Icons.airport_shuttle_outlined),
    _EmergencyType('Garde nocturne', Icons.nightlight_round),
    _EmergencyType('Accouchement', Icons.pregnant_woman_outlined),
    _EmergencyType('Intoxication', Icons.warning_amber_rounded),
    _EmergencyType('Accident', Icons.report_problem_outlined),
  ];

  final List<_OfficialService> _services = const [
    _OfficialService(
      title: 'SAMU',
      subtitle: 'Urgences médicales nationales',
      number: '1515',
      icon: Icons.airport_shuttle_outlined,
    ),
    _OfficialService(
      title: 'Police secours',
      subtitle: 'Intervention rapide',
      number: '117',
      icon: Icons.local_police_outlined,
    ),
  ];

  @override
  void initState() {
    super.initState();
    // Simule la détection automatique de la localisation, comme sur la maquette.
    Future.delayed(const Duration(milliseconds: 400), () {
      if (!mounted) return;
      setState(() => _localisation = 'Douala, Cameroun · localisation détectée automatiquement.');
    });
  }

  Future<void> _appeler(String numero) async {
    // Brancher ici url_launcher :
    // final uri = Uri(scheme: 'tel', path: numero);
    // if (await canLaunchUrl(uri)) await launchUrl(uri);
    debugPrint('Appel vers $numero');
  }

  Future<void> _appelSOS() async {
    // Compose directement le service le plus proche, comme décrit sur la maquette.
    await _appeler('1515');
  }

  void _envoyerPositionContact() {
    // TODO: envoyer la position GPS par SMS au contact d'urgence configuré.
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Position envoyée à votre contact d\'urgence.')),
    );
  }

  void _ouvrirItineraire(String cible) {
    // TODO: brancher une app de navigation externe (Google Maps, etc.).
    debugPrint('Itinéraire vers $cible');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      extendBody: true,
      body: SafeArea(
        child: Stack(
          children: [
            ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
              children: [
                _pageTitle(),
                _sosSection(),
                _sectionTitle('Type d\'urgence'),
                _typeGrid(),
                const SizedBox(height: 4),
                _sectionTitle('Services officiels — Cameroun'),
                ..._services.map(_officialServiceCard),
                CardPharmacie(
                  nom: 'Pharmacie Soleil',
                  quartier: 'Akwa Nord',
                  deGarde: true,
                  verifiee: true,
                  distanceKm: 1.2,
                  onAppeler: () => _appeler('Pharmacie Soleil'),
                  onItineraire: () => _ouvrirItineraire('Pharmacie Soleil'),
                ),
                const SizedBox(height: 4),
                SecondaryButton(
                  label: 'Envoyer ma position à un contact d\'urgence',
                  icon: Icons.send_outlined,
                  onPressed: _envoyerPositionContact,
                ),
                const SizedBox(height: 14),
                const AppAlert(
                  type: AppAlertType.secondary,
                  message:
                  "Mode dégradé hors connexion : les numéros d'urgence restent accessibles même sans réseau. "
                      "Bascule automatique sur les numéros du pays où vous vous trouvez.",
                ),
                const SizedBox(height: 12),
                const AppAlert(
                  type: AppAlertType.danger,
                  title: 'Zéro publicité',
                  message: "Écran Urgence : aucun contenu commercial, sous aucune forme (§12).",
                ),
              ],
            ),
            Positioned(
              left: 10,
              right: 10,
              bottom: 10,
              child: AppBottomNav(
                currentIndex: _navIndex,
                onTap: (i) => setState(() => _navIndex = i),
                onRdvPressed: () {
                  // Brancher ici la navigation vers l'écran de prise de RDV.
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ---------- En-tête ----------

  Widget _pageTitle() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 14, 2, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'URGENCE',
            style: AppTextStyles.badge.copyWith(
              fontSize: 10.5,
              letterSpacing: 1.1,
              color: AppColors.danger,
            ),
          ),
          const SizedBox(height: 6),
          Text('Besoin d\'aide maintenant ?', style: AppTextStyles.h3.copyWith(fontSize: 19)),
          const SizedBox(height: 4),
          Text(_localisation, style: AppTextStyles.body),
        ],
      ),
    );
  }

  // ---------- Bouton SOS ----------
  // Composant propre à cet écran (aucun équivalent dans le kit) mais
  // entièrement construit sur les tokens AppColors / AppTextStyles.

  Widget _sosSection() {
    return Column(
      children: [
        const SizedBox(height: 18),
        GestureDetector(
          onTap: _appelSOS,
          child: Container(
            width: 150,
            height: 150,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                center: const Alignment(-0.35, -0.45),
                colors: [
                  const Color(0xFFF0806A),
                  AppColors.danger,
                  AppColors.dangerDark,
                ],
                stops: const [0.0, 0.55, 1.0],
              ),
              boxShadow: [
                BoxShadow(color: AppColors.danger.withOpacity(0.12), blurRadius: 0, spreadRadius: 8),
                BoxShadow(
                  color: AppColors.dangerDark.withOpacity(0.45),
                  blurRadius: 30,
                  offset: const Offset(0, 18),
                ),
              ],
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.sos, color: Colors.white, size: 34),
                const SizedBox(height: 6),
                Text('SOS', style: AppTextStyles.h3.copyWith(color: Colors.white, fontSize: 17)),
                Text(
                  'APPEL IMMÉDIAT',
                  style: AppTextStyles.badge.copyWith(color: Colors.white, fontSize: 9.5),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 30),
          child: RichText(
            textAlign: TextAlign.center,
            text: TextSpan(
              style: AppTextStyles.body.copyWith(fontSize: 11.5),
              children: [
                const TextSpan(text: 'Un geste suffit : '),
                TextSpan(
                  text: 'APS compose directement',
                  style: TextStyle(color: AppColors.ink, fontWeight: FontWeight.w700),
                ),
                const TextSpan(
                  text: ' le service le plus proche et envoie votre position par SMS à votre contact d\'urgence.',
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
      ],
    );
  }

  // ---------- Titre de section ----------

  Widget _sectionTitle(String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12, top: 4),
      child: Text(label, style: AppTextStyles.cardTitle.copyWith(fontSize: 14)),
    );
  }

  // ---------- Grille "Type d'urgence" ----------
  // Aucun composant "tuile de sélection" n'existe encore dans le kit : ces
  // tuiles s'appuient donc sur CardSurface (le conteneur visuel commun) pour
  // rester cohérentes avec le reste des cartes de l'app.

  Widget _typeGrid() {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _types.length,
      padding: const EdgeInsets.only(bottom: 4),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 0.95,
      ),
      itemBuilder: (context, i) {
        final t = _types[i];
        final selected = _typeSelectionne == t.label;
        return CardSurface(
          margin: EdgeInsets.zero,
          padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 4),
          onTap: () => setState(() => _typeSelectionne = t.label),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: selected ? AppColors.danger : AppColors.dangerLight,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(t.icon, size: 15, color: selected ? Colors.white : AppColors.danger),
              ),
              const SizedBox(height: 6),
              Text(
                t.label,
                textAlign: TextAlign.center,
                style: AppTextStyles.cardMeta.copyWith(fontSize: 9.5, height: 1.2),
              ),
            ],
          ),
        );
      },
    );
  }

  // ---------- Services officiels (SAMU / Police) ----------
  // Construit sur CardSurface + CallButton + BadgeChip, comme les autres
  // cartes du kit (cf. card_pharmacie.dart / card_structure.dart).

  Widget _officialServiceCard(_OfficialService s) {
    return CardSurface(
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(color: AppColors.dangerLight, borderRadius: BorderRadius.circular(12)),
            alignment: Alignment.center,
            child: Icon(s.icon, size: 19, color: AppColors.danger),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.title, style: AppTextStyles.cardTitle),
                const SizedBox(height: 2),
                Text(s.subtitle, style: AppTextStyles.cardMeta),
                const SizedBox(height: 6),
                BadgeChip(label: s.number, style: BadgeChipStyle.coral, mono: true),
              ],
            ),
          ),
          const SizedBox(width: 8),
          CallButton(onPressed: () => _appeler(s.number)),
        ],
      ),
    );
  }
}