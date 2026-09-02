import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

// Si votre projet utilise des imports package (ex: package:aps/...),
// remplacez la ligne ci-dessous par :
// import 'package:aps/components/components.dart';
import '../.././../components/components.dart';

const List<String> _moisFrConfirmation = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/// Écran plein — **Rendez-vous confirmé**.
///
/// Remplace l'ancien `showDialog` muet de `RendezVousPage._afficherConfirmation`
/// par un véritable écran, poussé juste après une réservation réussie.
/// Reprend le design de l'écran « Créer un compte patient · Confirmation »
/// de la maquette (`ui-mobile.html`, device Q2 — insigne à cercle pointillé,
/// carte récapitulative, liste « et maintenant » puis actions), adapté au
/// contexte d'un rendez-vous (praticien, créneau, tarif sous séquestre,
/// code unique) plutôt qu'à une création de compte seule.
///
/// Volontairement **sans dépendance** aux modèles/contrôleurs de
/// `rendez_vous_*` : ne reçoit que des types primitifs, afin de pouvoir être
/// réutilisé ailleurs (ex: écran « Mes rendez-vous ») sans coupler cet écran
/// de présentation à la couche données.
///
/// ```dart
/// Navigator.of(context).push(
///   MaterialPageRoute(
///     builder: (_) => ConfirmationRdvPage(
///       medecinNom: 'Landry AMARI',
///       medecinSpecialite: 'Cardiologie',
///       medecinVille: 'Garoua',
///       dateRdv: DateTime(2026, 9, 2),
///       heure: '10:00',
///       tarifFcfa: 12000,
///       codeUnique: 'ETCQGJ5J',
///       compteVientDetreCree: true,
///       patientPrenom: 'Aïcha',
///     ),
///   ),
/// );
/// ```
class ConfirmationRdvPage extends StatelessWidget {
  const ConfirmationRdvPage({
    super.key,
    required this.medecinNom,
    required this.medecinSpecialite,
    required this.dateRdv,
    required this.heure,
    this.medecinVille,
    this.typeRdvLabel = 'Au cabinet',
    this.tarifFcfa,
    this.codeUnique,
    this.compteVientDetreCree = false,
    this.patientPrenom,
    this.onVoirMesRendezVous,
    this.onRetourAccueil,
  });

  final String medecinNom;
  final String medecinSpecialite;
  final String? medecinVille;

  /// Date du créneau réservé (l'heure de ce [DateTime] est ignorée — voir
  /// [heure], déjà formatée par l'écran appelant).
  final DateTime dateRdv;

  /// Ex: « 10:00 ».
  final String heure;

  /// Ex: « Au cabinet » / « Téléconsultation ».
  final String typeRdvLabel;

  /// Tarif indicatif en FCFA — affiché comme montant bloqué sous séquestre.
  final int? tarifFcfa;

  /// Code unique à présenter au cabinet. `null` si le backend ne l'a pas
  /// encore renvoyé (l'écran affiche alors un message de repli).
  final String? codeUnique;

  /// `true` si cet écran fait suite à une création de compte patient
  /// enchaînée avec la réservation (voir `RendezVousPage._confirmer`).
  final bool compteVientDetreCree;

  /// Prénom du patient — utilisé uniquement pour personnaliser le message
  /// de bienvenue quand [compteVientDetreCree] est vrai.
  final String? patientPrenom;

  /// Bouton « Voir mes rendez-vous ». Si `null`, replie sur un retour à la
  /// première route de la pile (l'utilisateur ne doit pas pouvoir revenir
  /// sur l'écran de réservation après une réservation réussie).
  final VoidCallback? onVoirMesRendezVous;

  /// Bouton « Retour à l'accueil ». Même repli que
  /// [onVoirMesRendezVous] si `null`.
  final VoidCallback? onRetourAccueil;

  String get _dateFormatee =>
      '${dateRdv.day} ${_moisFrConfirmation[dateRdv.month - 1]}';

  String get _titre => compteVientDetreCree
      ? 'Compte créé et rendez-vous confirmé'
      : 'Rendez-vous confirmé';

  String get _sousTitre {
    final salutation = (patientPrenom != null && patientPrenom!.trim().isNotEmpty)
        ? 'Merci ${patientPrenom!.trim()} ! '
        : '';
    final compteTxt = compteVientDetreCree
        ? 'Votre compte patient a été créé et vous êtes maintenant '
        'connecté(e). '
        : '';
    return '$salutation${compteTxt}Votre rendez-vous avec $medecinNom est '
        'confirmé pour le $_dateFormatee à $heure.';
  }

  static String _initiales(String nom) {
    final parties = nom.trim().split(RegExp(r'\s+'));
    final lettres = parties.where((p) => p.isNotEmpty).map((p) => p[0]).take(2);
    return lettres.join().toUpperCase();
  }

  void _copierCode(BuildContext context) {
    final code = codeUnique;
    if (code == null) return;
    Clipboard.setData(ClipboardData(text: code));
    HapticFeedback.selectionClick();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Code copié dans le presse-papiers'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  void _replierSurAccueil(BuildContext context) {
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  void _voirMesRendezVous(BuildContext context) {
    if (onVoirMesRendezVous != null) {
      onVoirMesRendezVous!();
      return;
    }
    _replierSurAccueil(context);
  }

  void _retourAccueil(BuildContext context) {
    if (onRetourAccueil != null) {
      onRetourAccueil!();
      return;
    }
    _replierSurAccueil(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 32, 20, 24),
          children: [
            const Center(child: _SuccessBadge()),
            const SizedBox(height: 22),
            Text(
              _titre,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: AppTextStyles.fontDisplay,
                fontSize: 19,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.2,
                height: 1.25,
                color: AppColors.ink,
              ),
            ),
            const SizedBox(height: 9),
            Text(
              _sousTitre,
              textAlign: TextAlign.center,
              style: AppTextStyles.body.copyWith(fontSize: 12.5, height: 1.6),
            ),
            const SizedBox(height: 24),
            _RecapCard(
              medecinNom: medecinNom,
              medecinSpecialite: medecinSpecialite,
              medecinVille: medecinVille,
              dateLabel: '$_dateFormatee à $heure',
              typeRdvLabel: typeRdvLabel,
              tarifFcfa: tarifFcfa,
              codeUnique: codeUnique,
              initiales: _initiales(medecinNom),
              onCopierCode: () => _copierCode(context),
            ),
            const SizedBox(height: 20),
            _NextStepsList(
              codeConnu: codeUnique != null,
              compteVientDetreCree: compteVientDetreCree,
            ),
            const SizedBox(height: 26),
            PrimaryButton(
              label: 'Voir mes rendez-vous',
              icon: Icons.calendar_month_outlined,
              onPressed: () => _voirMesRendezVous(context),
            ),
            const SizedBox(height: 10),
            SecondaryButton(
              label: "Retour à l'accueil",
              onPressed: () => _retourAccueil(context),
            ),
          ],
        ),
      ),
    );
  }
}

/// Insigne de succès — reprend `.success-badge` de la maquette : cercle vert
/// clair avec une icône de validation, cerné d'un anneau pointillé.
class _SuccessBadge extends StatelessWidget {
  const _SuccessBadge();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 100,
      height: 100,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(
            size: const Size(100, 100),
            painter: _DashedCirclePainter(
              color: AppColors.green500.withOpacity(0.35),
            ),
          ),
          Container(
            width: 82,
            height: 82,
            decoration: const BoxDecoration(
              color: AppColors.green100,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: const Icon(
              Icons.check_rounded,
              size: 36,
              color: AppColors.green700,
            ),
          ),
        ],
      ),
    );
  }
}

class _DashedCirclePainter extends CustomPainter {
  _DashedCirclePainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..addOval(Rect.fromLTWH(0, 0, size.width, size.height));
    final dashPath = Path();
    const dashWidth = 5.0;
    const dashSpace = 4.0;

    for (final metric in path.computeMetrics()) {
      double distance = 0;
      while (distance < metric.length) {
        dashPath.addPath(
          metric.extractPath(distance, distance + dashWidth),
          Offset.zero,
        );
        distance += dashWidth + dashSpace;
      }
    }

    canvas.drawPath(
      dashPath,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(covariant _DashedCirclePainter oldDelegate) =>
      oldDelegate.color != color;
}

/// Carte récapitulative du rendez-vous — reprend `.success-card` /
/// `.ins-kv` de la maquette : avatar + nom + spécialité, puis une série de
/// lignes clé/valeur (date, type, tarif, code unique copiable).
class _RecapCard extends StatelessWidget {
  const _RecapCard({
    required this.medecinNom,
    required this.medecinSpecialite,
    required this.medecinVille,
    required this.dateLabel,
    required this.typeRdvLabel,
    required this.tarifFcfa,
    required this.codeUnique,
    required this.initiales,
    required this.onCopierCode,
  });

  final String medecinNom;
  final String medecinSpecialite;
  final String? medecinVille;
  final String dateLabel;
  final String typeRdvLabel;
  final int? tarifFcfa;
  final String? codeUnique;
  final String initiales;
  final VoidCallback onCopierCode;

  @override
  Widget build(BuildContext context) {
    return CardSurface(
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.green100,
                  borderRadius: BorderRadius.circular(12),
                ),
                alignment: Alignment.center,
                child: Text(
                  initiales,
                  style: const TextStyle(
                    fontFamily: AppTextStyles.fontDisplay,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: AppColors.green700,
                  ),
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      medecinNom,
                      style: AppTextStyles.cardTitle.copyWith(fontSize: 13.5),
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      medecinVille != null
                          ? '$medecinSpecialite · $medecinVille'
                          : medecinSpecialite,
                      style: AppTextStyles.cardMeta,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 13),
            child: Divider(height: 1, color: AppColors.line),
          ),
          _kv('Date & heure', dateLabel),
          const SizedBox(height: 9),
          _kv('Type de rendez-vous', typeRdvLabel),
          if (tarifFcfa != null) ...[
            const SizedBox(height: 9),
            _kv('Montant sous séquestre', '$tarifFcfa FCFA'),
          ],
          if (codeUnique != null) ...[
            const SizedBox(height: 9),
            _kvCode(),
          ],
        ],
      ),
    );
  }

  Widget _kv(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: AppTextStyles.body.copyWith(fontSize: 11.5)),
        const SizedBox(width: 10),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: const TextStyle(
              fontFamily: AppTextStyles.fontMono,
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: AppColors.ink,
            ),
          ),
        ),
      ],
    );
  }

  Widget _kvCode() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text('Code unique', style: AppTextStyles.body.copyWith(fontSize: 11.5)),
        InkWell(
          onTap: onCopierCode,
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  codeUnique!,
                  style: const TextStyle(
                    fontFamily: AppTextStyles.fontMono,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    letterSpacing: .5,
                    color: AppColors.green700,
                  ),
                ),
                const SizedBox(width: 5),
                const Icon(Icons.copy_rounded, size: 13, color: AppColors.green700),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Ligne d'une étape « et maintenant ? » — `.sn-item` de la maquette.
class _NextStepData {
  const _NextStepData({
    required this.icon,
    required this.titre,
    required this.description,
  });

  final IconData icon;
  final String titre;
  final String description;
}

/// Liste « et maintenant ? » — reprend `.success-next` de la maquette.
class _NextStepsList extends StatelessWidget {
  const _NextStepsList({
    required this.codeConnu,
    required this.compteVientDetreCree,
  });

  final bool codeConnu;
  final bool compteVientDetreCree;

  @override
  Widget build(BuildContext context) {
    final items = <_NextStepData>[
      const _NextStepData(
        icon: Icons.shield_outlined,
        titre: 'Paiement sous séquestre',
        description: 'Vos fonds restent bloqués et ne seront versés au '
            'praticien qu\'après la consultation.',
      ),
      _NextStepData(
        icon: Icons.qr_code_2_rounded,
        titre: codeConnu ? 'Code unique généré' : 'Code unique en préparation',
        description: codeConnu
            ? "Présentez ce code (ou le QR code envoyé par e-mail) à "
            "l'accueil du cabinet."
            : 'Un code unique et un QR code vous seront envoyés par e-mail '
            'dans quelques instants.',
      ),
      const _NextStepData(
        icon: Icons.event_available_outlined,
        titre: 'Ajouté à vos rendez-vous',
        description:
        'Retrouvez-le à tout moment dans « Mes rendez-vous ».',
      ),
      if (compteVientDetreCree)
        const _NextStepData(
          icon: Icons.mark_email_read_outlined,
          titre: 'Compte patient créé',
          description: 'Vous êtes maintenant connecté(e) ; un e-mail de '
              'bienvenue vous a été envoyé.',
        ),
    ];

    return Column(
      children: [
        for (var i = 0; i < items.length; i++)
          Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              border: i != items.length - 1
                  ? const Border(bottom: BorderSide(color: AppColors.line))
                  : null,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    color: AppColors.green100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  alignment: Alignment.center,
                  child: Icon(items[i].icon, size: 13, color: AppColors.green700),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        items[i].titre,
                        style: AppTextStyles.cardTitle.copyWith(fontSize: 11.5),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        items[i].description,
                        style: AppTextStyles.body.copyWith(
                          fontSize: 11,
                          height: 1.45,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}