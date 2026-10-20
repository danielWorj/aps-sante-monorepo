import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../components/components.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/rendez_vous_controller.dart';
import '../../../models/rendez_vous_models.dart';
import '../../public/Centresantepage.dart';
import '../../public/Medecinpage.dart';
import '../../public/Pharmaciepage.dart';
import '../../public/urgence.dart';

/// Onglet « Accueil » de l'espace patient — écran 05 de la refonte 2026.
///
/// Le prochain rendez-vous en premier (données réelles de
/// [listeRendezVousControllerProvider]), puis une mosaïque de raccourcis.
/// Onglet du shell ([PatientHomeShell]) : pas de Scaffold ici, la cloche
/// flotte en haut à droite.
class PortailPatientAccueil extends ConsumerWidget {
  const PortailPatientAccueil({
    super.key,
    required this.onOuvrirRendezVous,
    required this.onOuvrirDemandes,
  });

  /// Bascule sur l'onglet « Rendez-vous » du shell.
  final VoidCallback onOuvrirRendezVous;

  /// Bascule sur l'onglet « Demande express » du shell.
  final VoidCallback onOuvrirDemandes;

  void _pousser(BuildContext context, Widget page) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));

  /// Prochain RDV payé (confirmé ou en cours), le plus proche dans le temps.
  static RendezVous? _prochain(List<RendezVous> liste) {
    final maintenant = DateTime.now().subtract(const Duration(hours: 1));
    final futurs = liste
        .where((r) =>
            (r.statut == StatutRendezVous.confirme ||
                r.statut == StatutRendezVous.enAttentePresence) &&
            r.dateCreneau.isAfter(maintenant))
        .toList()
      ..sort((a, b) => a.dateCreneau.compareTo(b.dateCreneau));
    return futurs.isEmpty ? null : futurs.first;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final utilisateur = ref.watch(authUtilisateurProvider);
    final rdvAsync = ref.watch(listeRendezVousControllerProvider);
    final prochain = rdvAsync.maybeWhen(data: _prochain, orElse: () => null);
    final aPayer = rdvAsync.maybeWhen(
      data: (l) => l.where((r) => r.statut == StatutRendezVous.cree).length,
      orElse: () => 0,
    );
    final prenom = utilisateur?.prenom ?? '';

    return Container(
      color: AppColors.bg,
      child: RefreshIndicator(
        color: AppColors.b6,
        onRefresh: () => ref.read(listeRendezVousControllerProvider.notifier).rafraichir(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 6, 18, 120),
          children: [
            // ---- Salutation (la cloche du shell est à droite) ----
            Padding(
              padding: const EdgeInsets.fromLTRB(0, 0, 54, 14),
              child: Row(
                children: [
                  ApsAvatar(
                    name: '$prenom ${utilisateur?.nom ?? ''}'.trim().isEmpty
                        ? 'Patient'
                        : '$prenom ${utilisateur?.nom ?? ''}',
                    size: 40,
                    round: true,
                    variant: 2,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Bonjour 👋', style: AppTextStyles.xs),
                        Text(
                          prenom.isEmpty ? 'Bienvenue' : prenom,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTextStyles.strong.copyWith(fontSize: 15),
                        ),
                      ],
                    ),
                  ),
                  const BoutonDeconnexion(),
                ],
              ),
            ),

            // ---- Recherche ----
            _Recherche(onTap: () => _pousser(context, const MedecinPage())),
            const SizedBox(height: 16),

            // ---- Prochain rendez-vous ----
            if (prochain != null)
              _CarteProchainRdv(rdv: prochain, onTap: onOuvrirRendezVous)
            else
              _CarteSansRdv(onTap: () => _pousser(context, const MedecinPage())),

            if (aPayer > 0) ...[
              const SizedBox(height: 10),
              ApsCard(
                color: const Color(0xFFFFFBF2),
                borderColor: const Color(0xFFF3D9A8),
                borderWidth: 1.5,
                padding: const EdgeInsets.all(12),
                onTap: onOuvrirRendezVous,
                child: Row(
                  children: [
                    const ApsIconTile(Icons.schedule_rounded, tone: ApsTone.amber),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            aPayer > 1 ? '$aPayer rendez-vous à payer' : '1 rendez-vous à payer',
                            style: AppTextStyles.strong.copyWith(fontSize: 13),
                          ),
                          Text('Sans paiement, le créneau sera libéré',
                              style: AppTextStyles.xs.copyWith(color: AppColors.amber700)),
                        ],
                      ),
                    ),
                    const ApsPill('Payer', tone: ApsTone.ink),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),

            // ---- Raccourcis ----
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    flex: 115,
                    child: ApsCard(
                      color: AppColors.b1,
                      onTap: () => _pousser(context, const MedecinPage()),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const ApsIconTile(Icons.medical_services_outlined,
                              background: Colors.white),
                          const SizedBox(height: 18),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Prendre\nrendez-vous',
                                  style: AppTextStyles.strong
                                      .copyWith(fontSize: 15, letterSpacing: -0.3)),
                              const SizedBox(height: 4),
                              Text('Médecins et spécialistes',
                                  style: AppTextStyles.xs.copyWith(color: AppColors.b7)),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 100,
                    child: Column(
                      children: [
                        _Tuile(
                          icone: Icons.local_pharmacy_outlined,
                          titre: 'Pharmacies',
                          meta: 'De garde',
                          couleurMeta: AppColors.b6,
                          teinte: ApsTone.green,
                          onTap: () => _pousser(context, const PharmaciePage()),
                        ),
                        const SizedBox(height: 8),
                        _Tuile(
                          icone: Icons.local_hospital_outlined,
                          titre: 'Structures',
                          meta: 'Hôpitaux, cliniques',
                          teinte: ApsTone.sky,
                          onTap: () => _pousser(context, const CentreSantePage()),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _Tuile(
                    icone: Icons.campaign_outlined,
                    titre: 'Demande express',
                    meta: 'Ils vous répondent',
                    couleurMeta: AppColors.violet700,
                    teinte: ApsTone.violet,
                    fond: AppColors.violet100,
                    onTap: onOuvrirDemandes,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _Tuile(
                    icone: Icons.emergency_outlined,
                    titre: 'Urgence',
                    meta: 'SAMU, police',
                    couleurMeta: AppColors.red,
                    teinte: ApsTone.red,
                    fond: AppColors.red100,
                    onTap: () => _pousser(context, const UrgencePage()),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Recherche extends StatelessWidget {
  const _Recherche({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(12);
    return Container(
      height: 56,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: r,
        boxShadow: AppColors.shadowCard,
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          borderRadius: r,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 6, 6),
            child: Row(
              children: [
                const Icon(Icons.search_rounded, size: 20, color: AppColors.ink3),
                const SizedBox(width: 10),
                Expanded(
                  child: Text('Médecin, spécialité…',
                      style: AppTextStyles.small.copyWith(fontSize: 14, color: AppColors.ink3)),
                ),
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.ink,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.tune_rounded, size: 18, color: Colors.white),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Carte vert profond du prochain rendez-vous.
class _CarteProchainRdv extends StatelessWidget {
  const _CarteProchainRdv({required this.rdv, required this.onTap});

  final RendezVous rdv;
  final VoidCallback onTap;

  static const _jours = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
  static const _mois = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
  ];

  String get _quand {
    final d = rdv.dateCreneau.toLocal();
    final aujourdhui = DateTime.now();
    final demain = aujourdhui.add(const Duration(days: 1));
    bool meme(DateTime a, DateTime b) =>
        a.year == b.year && a.month == b.month && a.day == b.day;
    if (meme(d, aujourdhui)) return "Aujourd'hui";
    if (meme(d, demain)) return 'Demain';
    return '${_jours[d.weekday - 1]} ${d.day} ${_mois[d.month - 1]}';
  }

  Future<void> _itineraire() async {
    final lieu = rdv.lieuRdv;
    if (lieu == null || lieu.isEmpty) return;
    final uri = Uri.parse(
        'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(lieu)}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = rdv.dateCreneau.toLocal();
    final heure =
        '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    final u = rdv.medecin?.utilisateur;
    final nom = u != null ? 'Dr ${u.prenom} ${u.nom}' : 'Votre médecin';
    final video = rdv.typeRdv == TypeRdv.teleconsultation;
    final aLieu = !video && (rdv.lieuRdv?.isNotEmpty ?? false);

    Widget tag(IconData icone, String texte) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icone, size: 13, color: Colors.white),
              const SizedBox(width: 6),
              Text(texte,
                  style: const TextStyle(
                    fontFamily: AppTextStyles.fontSans,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  )),
            ],
          ),
        );

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        gradient: AppColors.gradientForest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          child: Stack(
            children: [
              Positioned(
                right: -40,
                top: -40,
                child: Container(
                  width: 160,
                  height: 160,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.06),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        ApsPill('$_quand · confirmé',
                            tone: ApsTone.white, dot: true, foreground: AppColors.mint),
                        const Spacer(),
                        Icon(Icons.chevron_right_rounded,
                            size: 20, color: Colors.white.withValues(alpha: 0.6)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.16),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            ApsAvatar.initials(nom),
                            style: const TextStyle(
                              fontFamily: AppTextStyles.fontSans,
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(nom,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontFamily: AppTextStyles.fontSans,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w800,
                                    color: Colors.white,
                                  )),
                              Text(
                                video
                                    ? 'Téléconsultation'
                                    : (aLieu ? rdv.lieuRdv! : 'Lieu précisé par le médecin'),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontFamily: AppTextStyles.fontSans,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                  color: Colors.white.withValues(alpha: 0.7),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        tag(Icons.calendar_today_rounded, _quand),
                        const SizedBox(width: 6),
                        tag(Icons.schedule_rounded, heure),
                        const Spacer(),
                        if (aLieu)
                          GestureDetector(
                            onTap: _itineraire,
                            child: Container(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.near_me_outlined,
                                      size: 13, color: AppColors.ink),
                                  const SizedBox(width: 6),
                                  Text('Itinéraire',
                                      style: AppTextStyles.strong.copyWith(fontSize: 12)),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Aucun RDV à venir : invitation à réserver, même style.
class _CarteSansRdv extends StatelessWidget {
  const _CarteSansRdv({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        gradient: AppColors.gradientForest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Aucun rendez-vous à venir',
                        style: TextStyle(
                          fontFamily: AppTextStyles.fontSans,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Trouvez un médecin disponible et réservez en quelques gestes.',
                        style: TextStyle(
                          fontFamily: AppTextStyles.fontSans,
                          fontSize: 12.5,
                          height: 1.45,
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withValues(alpha: 0.72),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text('Réserver', style: AppTextStyles.strong.copyWith(fontSize: 12)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Tuile extends StatelessWidget {
  const _Tuile({
    required this.icone,
    required this.titre,
    required this.meta,
    required this.teinte,
    required this.onTap,
    this.couleurMeta,
    this.fond,
  });

  final IconData icone;
  final String titre;
  final String meta;
  final ApsTone teinte;
  final VoidCallback onTap;
  final Color? couleurMeta;
  final Color? fond;

  @override
  Widget build(BuildContext context) {
    return ApsCard(
      flat: fond == null,
      color: fond,
      padding: const EdgeInsets.all(11),
      onTap: onTap,
      child: Row(
        children: [
          ApsIconTile(icone,
              tone: teinte, small: true, background: fond != null ? Colors.white : null),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(titre,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTextStyles.strong.copyWith(fontSize: 12.5)),
                Text(meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTextStyles.xs.copyWith(color: couleurMeta)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
