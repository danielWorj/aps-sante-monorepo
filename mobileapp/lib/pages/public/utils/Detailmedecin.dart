import 'package:flutter/material.dart';

// Si votre projet utilise des imports package (ex: package:aps/...),
// remplacez la ligne ci-dessous par :
// import 'package:aps/components/components.dart';
import '../../../components/components.dart';

/// Un jour d'ouverture du cabinet — utilisé dans le bloc « Horaires du cabinet ».
class HoraireJour {
  const HoraireJour({
    required this.jour,
    required this.horaire,
    this.ferme = false,
  });

  final String jour;

  /// Ex: « 08:00 – 17:00 ». Ignoré si [ferme] est `true`.
  final String horaire;

  /// `true` si le cabinet est fermé ce jour-là (ex: Dimanche).
  final bool ferme;
}

/// Modèle complet d'un médecin pour l'écran de détail (fiche du praticien).
///
/// À alimenter depuis l'API (ex: `MedecinRepository.getDetail(id)`). Un jeu
/// de données de démonstration est fourni via [MedecinDetail.demo] pour
/// prévisualiser l'écran sans backend.
class MedecinDetail {
  const MedecinDetail({
    required this.nom,
    required this.specialite,
    required this.ville,
    this.photoUrl,
    this.prixFcfa,
    this.verifieOrdre = false,
    this.teleconsultation = false,
    this.note,
    this.nombreAvis = 0,
    this.anneesOrdre,
    this.bio,
    this.domainesExpertise = const [],
    this.langues = const [],
    this.horaires = const [],
    this.adresse,
  });

  final String nom;
  final String specialite;
  final String ville;
  final String? photoUrl;
  final int? prixFcfa;
  final bool verifieOrdre;
  final bool teleconsultation;

  /// Note moyenne sur 5 (ex: 4.8). `null` si pas encore d'avis.
  final double? note;
  final int nombreAvis;

  /// Ancienneté à l'Ordre des médecins, en années (ex: 6).
  final int? anneesOrdre;

  final String? bio;
  final List<String> domainesExpertise;
  final List<String> langues;
  final List<HoraireJour> horaires;
  final String? adresse;

  /// Jeu de données de démonstration — reprend l'exemple de la maquette
  /// (Dr. Landry Amari, cardiologue à Garoua).
  static const MedecinDetail demo = MedecinDetail(
    nom: 'Dr. Landry Amari',
    specialite: 'Cardiologie',
    ville: 'Garoua, Cameroun',
    prixFcfa: 12000,
    verifieOrdre: true,
    teleconsultation: true,
    note: 4.8,
    nombreAvis: 238,
    anneesOrdre: 6,
    bio:
    "Cardiologue diplômé, inscrit à l'Ordre des médecins du Cameroun depuis "
        "6 ans. Prise en charge de l'hypertension, des troubles du rythme et "
        "suivi post-opératoire. Consultation au cabinet ou en téléconsultation.",
    domainesExpertise: [
      'Hypertension',
      'Troubles du rythme',
      'Échographie cardiaque',
      'Suivi post-opératoire',
    ],
    langues: ['Français', 'Anglais', 'Fulfulde'],
    horaires: [
      HoraireJour(jour: 'Lundi – Vendredi', horaire: '08:00 – 17:00'),
      HoraireJour(jour: 'Samedi', horaire: '09:00 – 13:00'),
      HoraireJour(jour: 'Dimanche', horaire: 'Fermé', ferme: true),
    ],
    adresse: "Avenue de l'Indépendance, Garoua Centre, Cameroun",
  );
}

/// Onglets de la fiche praticien.
enum _DetailTab { profil, disponibilites, avis }

/// Page publique — **Fiche du praticien** (détail d'un médecin).
///
/// Reproduit l'écran « Fiche du praticien » de la maquette `ui-mobile.html`
/// (device n°8) : en-tête profil (avatar, nom, spécialité, badges, stats),
/// onglets Profil / Disponibilités / Avis, blocs d'information (à propos,
/// domaines d'expertise, langues, horaires, adresse) et une barre d'action
/// fixe en bas d'écran (`sticky-cta`) avec le tarif et le bouton
/// « Prendre rendez-vous ».
///
/// Cette page est destinée à être **poussée** depuis l'annuaire
/// (`MedecinPage`) via `Navigator.push` — c'est pourquoi elle affiche une
/// barre de retour et n'inclut pas la barre de navigation basse principale
/// (`AppBottomNav`), remplacée ici par la barre d'action fixe du bas.
///
/// ```dart
/// Navigator.of(context).push(
///   MaterialPageRoute(
///     builder: (_) => const DetailMedecinPage(medecin: MedecinDetail.demo),
///   ),
/// );
/// ```
class DetailMedecinPage extends StatefulWidget {
  const DetailMedecinPage({
    super.key,
    required this.medecin,
    this.onPrendreRdv,
  });

  final MedecinDetail medecin;

  /// Appelé quand l'utilisateur tape « Prendre rendez-vous ». Si `null`,
  /// aucune action n'est déclenchée (à brancher vers l'écran de réservation
  /// de créneau).
  final VoidCallback? onPrendreRdv;

  @override
  State<DetailMedecinPage> createState() => _DetailMedecinPageState();
}

class _DetailMedecinPageState extends State<DetailMedecinPage> {
  _DetailTab _tab = _DetailTab.profil;

  @override
  Widget build(BuildContext context) {
    final m = widget.medecin;

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: Column(
          children: [
            _buildTopBar(context),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                children: [
                  _buildProfileHero(m),
                  _buildTabRow(),
                  switch (_tab) {
                    _DetailTab.profil => _buildProfilTab(m),
                    _DetailTab.disponibilites => _buildDisponibilitesTab(),
                    _DetailTab.avis => _buildAvisTab(m),
                  },
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: _buildStickyCta(context, m),
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Barre de retour
  // ---------------------------------------------------------------------

  Widget _buildTopBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 16, 0),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
            color: AppColors.ink,
            splashRadius: 22,
          ),
          const Spacer(),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------
  // En-tête profil — `.profile-hero`
  // ---------------------------------------------------------------------

  Widget _buildProfileHero(MedecinDetail m) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.line),
        borderRadius: AppRadius.lgRadius,
        boxShadow: AppColors.shadowCard,
      ),
      child: Column(
        children: [
          _ProfileAvatar(photoUrl: m.photoUrl, fallback: _initials(m.nom)),
          const SizedBox(height: 12),
          Text(m.nom, style: AppTextStyles.cardTitle.copyWith(fontSize: 17)),
          const SizedBox(height: 3),
          Text(
            '${m.specialite} · ${m.ville}',
            style: AppTextStyles.cardMeta.copyWith(fontSize: 12.5),
          ),
          const SizedBox(height: 12),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 6,
            runSpacing: 6,
            children: [
              if (m.verifieOrdre)
                const BadgeChip(
                  label: "Vérifié à l'Ordre",
                  style: BadgeChipStyle.green,
                  icon: Icons.verified_outlined,
                ),
              if (m.teleconsultation)
                const BadgeChip(
                  label: 'Téléconsultation',
                  style: BadgeChipStyle.amber,
                  icon: Icons.videocam_outlined,
                ),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.only(top: 14),
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: AppColors.line)),
            ),
            child: Row(
              children: [
                _Stat(value: m.note != null ? m.note!.toStringAsFixed(1) : '—', label: 'NOTE'),
                _Stat(value: '${m.nombreAvis}', label: 'AVIS'),
                _Stat(
                  value: m.anneesOrdre != null ? '${m.anneesOrdre} ans' : '—',
                  label: 'ORDRE',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Onglets — `.tab-row` / `.tab`
  // ---------------------------------------------------------------------

  Widget _buildTabRow() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          _TabItem(
            label: 'Profil',
            active: _tab == _DetailTab.profil,
            onTap: () => setState(() => _tab = _DetailTab.profil),
          ),
          const SizedBox(width: 22),
          _TabItem(
            label: 'Disponibilités',
            active: _tab == _DetailTab.disponibilites,
            onTap: () => setState(() => _tab = _DetailTab.disponibilites),
          ),
          const SizedBox(width: 22),
          _TabItem(
            label: 'Avis',
            active: _tab == _DetailTab.avis,
            onTap: () => setState(() => _tab = _DetailTab.avis),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Onglet Profil — blocs d'information
  // ---------------------------------------------------------------------

  Widget _buildProfilTab(MedecinDetail m) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (m.bio != null)
          _InfoBlock(
            icon: Icons.description_outlined,
            title: 'À propos',
            child: Text(m.bio!, style: AppTextStyles.body.copyWith(fontSize: 12)),
          ),
        if (m.domainesExpertise.isNotEmpty)
          _InfoBlock(
            icon: Icons.edit_outlined,
            title: 'Domaines d\'expertise',
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [for (final d in m.domainesExpertise) _Pill(label: d)],
            ),
          ),
        if (m.langues.isNotEmpty)
          _InfoBlock(
            icon: Icons.expand_more_rounded,
            title: 'Langues parlées',
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [for (final l in m.langues) _Pill(label: l)],
            ),
          ),
        if (m.horaires.isNotEmpty)
          _InfoBlock(
            icon: Icons.calendar_today_outlined,
            title: 'Horaires du cabinet',
            child: Column(
              children: [for (final h in m.horaires) _HoraireRow(horaire: h)],
            ),
          ),
        if (m.adresse != null)
          _InfoBlock(
            icon: Icons.location_on_outlined,
            title: 'Adresse du cabinet',
            child: Text(m.adresse!, style: AppTextStyles.body.copyWith(fontSize: 12)),
          ),
      ],
    );
  }

  // ---------------------------------------------------------------------
  // Onglet Disponibilités — invite à réserver un créneau
  // ---------------------------------------------------------------------

  Widget _buildDisponibilitesTab() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 30),
      child: Column(
        children: [
          const Icon(Icons.event_available_outlined, size: 32, color: AppColors.inkFaint),
          const SizedBox(height: 12),
          const Text(
            'Consultez les créneaux libres et réservez directement un rendez-vous.',
            textAlign: TextAlign.center,
            style: AppTextStyles.body,
          ),
          const SizedBox(height: 16),
          // TODO(nav): brancher vers l'écran « Choisir un créneau » (réservation).
          AppOutlineButton(label: 'Voir les disponibilités', onPressed: widget.onPrendreRdv ?? () {}),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Onglet Avis
  // ---------------------------------------------------------------------

  Widget _buildAvisTab(MedecinDetail m) {
    if (m.nombreAvis == 0) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 30),
        child: Column(
          children: [
            Icon(Icons.chat_bubble_outline_rounded, size: 32, color: AppColors.inkFaint),
            SizedBox(height: 12),
            Text(
              'Aucun avis pour le moment.',
              textAlign: TextAlign.center,
              style: AppTextStyles.body,
            ),
          ],
        ),
      );
    }
    // TODO(api): remplacer par la vraie liste d'avis (MedecinRepository.getAvis(id)).
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.star_rounded, size: 18, color: AppColors.amber500),
          const SizedBox(width: 6),
          Text(
            '${m.note?.toStringAsFixed(1) ?? '—'} · ${m.nombreAvis} avis vérifiés',
            style: AppTextStyles.cardMeta,
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Barre d'action fixe — `.sticky-cta`
  // ---------------------------------------------------------------------

  Widget _buildStickyCta(BuildContext context, MedecinDetail m) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: const BoxDecoration(
        color: AppColors.paper,
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          if (m.prixFcfa != null) ...[
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${m.prixFcfa} FCFA', style: AppTextStyles.price.copyWith(fontSize: 16)),
                const Text(
                  'à partir de',
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontDisplay,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkFaint,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: PrimaryButton(
              label: 'Prendre rendez-vous',
              onPressed: widget.onPrendreRdv ?? () {},
            ),
          ),
        ],
      ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    final letters = parts.where((p) => p.isNotEmpty).map((p) => p[0]).take(2);
    return letters.join().toUpperCase();
  }
}

// ===========================================================================
// Widgets internes
// ===========================================================================

/// Avatar large de l'en-tête profil — variante agrandie de celui de [CardMedecin].
class _ProfileAvatar extends StatelessWidget {
  const _ProfileAvatar({this.photoUrl, required this.fallback});

  final String? photoUrl;
  final String fallback;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: Container(
        width: 72,
        height: 72,
        color: AppColors.green100,
        alignment: Alignment.center,
        child: photoUrl != null
            ? Image.network(
          photoUrl!,
          fit: BoxFit.cover,
          width: 72,
          height: 72,
          errorBuilder: (_, __, ___) => _initialsText(),
        )
            : _initialsText(),
      ),
    );
  }

  Widget _initialsText() => Text(
    fallback,
    style: const TextStyle(
      fontFamily: AppTextStyles.fontDisplay,
      fontWeight: FontWeight.w700,
      fontSize: 22,
      color: AppColors.green700,
    ),
  );
}

/// Une statistique de l'en-tête profil (Note / Avis / Ordre) — `.stat`.
class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontMono,
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontBody,
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: AppColors.inkFaint,
            ),
          ),
        ],
      ),
    );
  }
}

/// Un onglet de [_TabItem] — `.tab` / `.tab.active`.
class _TabItem extends StatelessWidget {
  const _TabItem({required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.green700 : AppColors.inkFaint;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: active ? AppColors.green700 : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontFamily: AppTextStyles.fontDisplay,
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
      ),
    );
  }
}

/// Un bloc d'information avec titre + icône — `.info-block`.
class _InfoBlock extends StatelessWidget {
  const _InfoBlock({required this.icon, required this.title, required this.child});

  final IconData icon;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: AppColors.green700),
              const SizedBox(width: 6),
              Text(
                title,
                style: const TextStyle(
                  fontFamily: AppTextStyles.fontDisplay,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

/// Puce d'information — `.pill` (domaines d'expertise, langues parlées).
class _Pill extends StatelessWidget {
  const _Pill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.paper,
        border: Border.all(color: AppColors.lineStrong),
        borderRadius: BorderRadius.circular(100),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontFamily: AppTextStyles.fontDisplay,
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: AppColors.inkSoft,
        ),
      ),
    );
  }
}

/// Une ligne d'horaire — `.hours-row`.
class _HoraireRow extends StatelessWidget {
  const _HoraireRow({required this.horaire});

  final HoraireJour horaire;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 6),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line, width: 1)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            horaire.jour,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontBody,
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: AppColors.inkSoft,
            ),
          ),
          Text(
            horaire.horaire,
            style: TextStyle(
              fontFamily: AppTextStyles.fontMono,
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: horaire.ferme ? AppColors.inkFaint : AppColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}