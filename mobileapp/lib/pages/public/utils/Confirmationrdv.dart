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
class ConfirmationRdvPage extends StatefulWidget {
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
    this.echeanceConfirmation,
    this.compteVientDetreCree = false,
    this.patientPrenom,
    this.paiementBuilder,
    this.onPaye,
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

  /// Code de consultation (secret du patient, à donner au médecin à la fin de
  /// la consultation). `null` si le backend ne l'a pas
  /// encore renvoyé (l'écran affiche alors un message de repli).
  final String? codeUnique;

  /// Heure limite de paiement (POST /rendez-vous → `echeance_confirmation`) :
  /// le créneau reste réservé au patient jusque-là ; sans paiement, la
  /// demande est annulée automatiquement et le créneau libéré.
  final DateTime? echeanceConfirmation;

  /// `true` si cet écran fait suite à une création de compte patient
  /// enchaînée avec la réservation (voir `RendezVousPage._confirmer`).
  final bool compteVientDetreCree;

  /// Prénom du patient — utilisé uniquement pour personnaliser le message
  /// de bienvenue quand [compteVientDetreCree] est vrai.
  final String? patientPrenom;

  /// Si fourni, le rendez-vous est **réservé mais pas encore payé** :
  /// l'écran affiche « à confirmer par le paiement » et insère le widget
  /// renvoyé par ce builder (le bouton « Payer »). Le builder reçoit un
  /// callback à appeler quand le paiement est confirmé par le serveur,
  /// ce qui bascule l'écran sur « Rendez-vous confirmé ».
  ///
  /// Volontairement un builder (et non un `rdvId`) pour que cet écran
  /// reste sans dépendance aux couches données/paiement — voir la note
  /// en tête de classe.
  final Widget Function(BuildContext context, VoidCallback marquerPaye)?
      paiementBuilder;

  /// Appelé une fois le paiement confirmé (ex. rafraîchir « Mes
  /// rendez-vous »).
  final VoidCallback? onPaye;

  /// Bouton « Voir mes rendez-vous ». Si `null`, replie sur un retour à la
  /// première route de la pile (l'utilisateur ne doit pas pouvoir revenir
  /// sur l'écran de réservation après une réservation réussie).
  final VoidCallback? onVoirMesRendezVous;

  /// Bouton « Retour à l'accueil ». Même repli que
  /// [onVoirMesRendezVous] si `null`.
  final VoidCallback? onRetourAccueil;

  @override
  State<ConfirmationRdvPage> createState() => _ConfirmationRdvPageState();
}

class _ConfirmationRdvPageState extends State<ConfirmationRdvPage> {
  /// Le serveur a confirmé le paiement (webhook Stripe).
  bool _paye = false;

  /// Paiement encore attendu : un builder est fourni et le paiement n'a
  /// pas encore été confirmé.
  bool get _paiementAttendu => widget.paiementBuilder != null && !_paye;

  String get _dateFormatee =>
      '${widget.dateRdv.day} ${_moisFrConfirmation[widget.dateRdv.month - 1]}';

  String get _titre {
    if (_paiementAttendu) return 'Rendez-vous réservé — réglez pour le confirmer';
    return widget.compteVientDetreCree
        ? 'Compte créé et rendez-vous confirmé'
        : 'Rendez-vous confirmé';
  }

  String get _sousTitre {
    final prenom = widget.patientPrenom;
    final salutation = (prenom != null && prenom.trim().isNotEmpty)
        ? 'Merci ${prenom.trim()} ! '
        : '';
    final compteTxt = widget.compteVientDetreCree
        ? 'Votre compte patient a été créé et vous êtes maintenant '
            'connecté(e). '
        : '';
    if (_paiementAttendu) {
      final echeance = widget.echeanceConfirmation?.toLocal();
      final delaiTxt = echeance == null
          ? ''
          : ' Sans paiement avant le ${echeance.day} '
              '${_moisFrConfirmation[echeance.month - 1]} à '
              '${echeance.hour.toString().padLeft(2, '0')}:'
              '${echeance.minute.toString().padLeft(2, '0')}, la demande '
              'sera annulée et le créneau libéré.';
      return '$salutation${compteTxt}Votre créneau avec ${widget.medecinNom} '
          'est réservé pour le $_dateFormatee à ${widget.heure}. Il sera '
          'confirmé dès la réception de votre paiement.$delaiTxt';
    }
    return '$salutation${compteTxt}Votre rendez-vous avec '
        '${widget.medecinNom} est confirmé pour le $_dateFormatee à '
        '${widget.heure}.';
  }

  void _copierCode(BuildContext context) {
    final code = widget.codeUnique;
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
    if (widget.onVoirMesRendezVous != null) {
      widget.onVoirMesRendezVous!();
      return;
    }
    _replierSurAccueil(context);
  }

  void _retourAccueil(BuildContext context) {
    if (widget.onRetourAccueil != null) {
      widget.onRetourAccueil!();
      return;
    }
    _replierSurAccueil(context);
  }

  void _marquerPaye() {
    if (!mounted || _paye) return;
    setState(() => _paye = true);
    widget.onPaye?.call();
  }

  @override
  Widget build(BuildContext context) {
    final attente = _paiementAttendu;
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            stops: const [0, 0.46],
            colors: [attente ? AppColors.amber100 : AppColors.b1, AppColors.bg],
          ),
        ),
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 6, 18, 24),
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: ApsIconButton(
                  icon: Icons.close_rounded,
                  tooltip: "Retour à l'accueil",
                  onPressed: () => _retourAccueil(context),
                ),
              ),
              Center(child: _SuccessBadge(enAttentePaiement: attente)),
              const SizedBox(height: 14),
              Text(_titre, textAlign: TextAlign.center, style: AppTextStyles.l),
              const SizedBox(height: 6),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(_sousTitre, textAlign: TextAlign.center, style: AppTextStyles.small),
              ),
              const SizedBox(height: 18),
              _RecapCard(
                medecinNom: widget.medecinNom,
                medecinSpecialite: widget.medecinSpecialite,
                medecinVille: widget.medecinVille,
                dateLabel: _dateFormatee,
                heure: widget.heure,
                typeRdvLabel: widget.typeRdvLabel,
                tarifFcfa: widget.tarifFcfa,
                codeUnique: widget.codeUnique,
                enAttentePaiement: attente,
                onCopierCode: () => _copierCode(context),
              ),
              const SizedBox(height: 18),
              _NextStepsList(
                codeConnu: widget.codeUnique != null,
                compteVientDetreCree: widget.compteVientDetreCree,
              ),
              const SizedBox(height: 22),
              if (attente) ...[
                widget.paiementBuilder!(context, _marquerPaye),
                const SizedBox(height: 8),
                Text(
                  'Vous pourrez aussi régler plus tard depuis « Mes rendez-vous ».',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.xs,
                ),
                const SizedBox(height: 14),
                ApsButton(
                  label: 'Mes rendez-vous',
                  variant: ApsButtonVariant.ghost,
                  onPressed: () => _voirMesRendezVous(context),
                ),
              ] else
                ApsButton(
                  label: 'Mes rendez-vous',
                  icon: Icons.calendar_today_rounded,
                  variant: ApsButtonVariant.dark,
                  onPressed: () => _voirMesRendezVous(context),
                ),
              const SizedBox(height: 4),
              Center(
                child: TextButton(
                  onPressed: () => _retourAccueil(context),
                  style: TextButton.styleFrom(foregroundColor: AppColors.ink2),
                  child: const Text("Retour à l'accueil"),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Pastille de succès : disque vert en dégradé entouré d'anneaux qui
/// s'élargissent (`.ring` de la maquette). Ambre si le paiement est attendu.
class _SuccessBadge extends StatefulWidget {
  const _SuccessBadge({this.enAttentePaiement = false});

  final bool enAttentePaiement;

  @override
  State<_SuccessBadge> createState() => _SuccessBadgeState();
}

class _SuccessBadgeState extends State<_SuccessBadge>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2400),
  );

  @override
  void initState() {
    super.initState();
    final reduire = WidgetsBinding
        .instance.platformDispatcher.accessibilityFeatures.disableAnimations;
    if (!reduire) _ctrl.repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final couleur = widget.enAttentePaiement ? AppColors.amber500 : AppColors.b5;
    final gradient = widget.enAttentePaiement
        ? const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFFFC66B), Color(0xFFC9790C)],
          )
        : AppColors.gradientLogo;
    return SizedBox(
      width: 110,
      height: 110,
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (context, _) => Stack(
          alignment: Alignment.center,
          children: [
            for (final decalage in [0.0, 0.5])
              Builder(builder: (_) {
                final t = (_ctrl.value + decalage) % 1.0;
                return Transform.scale(
                  scale: 0.7 + t,
                  child: Container(
                    width: 84,
                    height: 84,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: couleur.withValues(alpha: 0.7 * (1 - t)),
                        width: 1.5,
                      ),
                    ),
                  ),
                );
              }),
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: gradient,
                boxShadow: AppColors.shadowGlow(couleur),
              ),
              child: Icon(
                widget.enAttentePaiement
                    ? Icons.credit_card_rounded
                    : Icons.check_rounded,
                size: 40,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Billet récapitulatif du rendez-vous : en-tête médecin, grille
/// date / heure / type / frais, découpe pointillée, code de consultation.
class _RecapCard extends StatelessWidget {
  const _RecapCard({
    required this.medecinNom,
    required this.medecinSpecialite,
    required this.medecinVille,
    required this.dateLabel,
    required this.heure,
    required this.typeRdvLabel,
    required this.tarifFcfa,
    required this.codeUnique,
    required this.enAttentePaiement,
    required this.onCopierCode,
  });

  final String medecinNom;
  final String medecinSpecialite;
  final String? medecinVille;
  final String dateLabel;
  final String heure;
  final String typeRdvLabel;
  final int? tarifFcfa;
  final String? codeUnique;
  final bool enAttentePaiement;
  final VoidCallback onCopierCode;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        boxShadow: AppColors.shadowSoft,
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Row(
                  children: [
                    ApsAvatar(name: medecinNom, size: 40),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(medecinNom,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTextStyles.strong),
                          Text(
                            medecinVille != null
                                ? '$medecinSpecialite · $medecinVille'
                                : medecinSpecialite,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTextStyles.xs,
                          ),
                        ],
                      ),
                    ),
                    enAttentePaiement
                        ? const ApsPill('À payer', tone: ApsTone.amber, dot: true)
                        : const ApsPill('Confirmé', dot: true),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(child: ApsInfoCell('Date', dateLabel)),
                    Expanded(child: ApsInfoCell('Heure', heure)),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(child: ApsInfoCell('Type', typeRdvLabel)),
                    Expanded(
                      child: ApsInfoCell(
                        enAttentePaiement ? 'À régler' : 'Frais',
                        tarifFcfa != null ? '$tarifFcfa F' : '—',
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const _Decoupe(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Row(
              children: [
                const ApsIconTile(Icons.qr_code_2_rounded, tone: ApsTone.amber, small: true),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Code de consultation',
                          style: AppTextStyles.strong.copyWith(fontSize: 12.5)),
                      Text(
                        codeUnique != null
                            ? 'À donner au médecin en fin de consultation'
                            : 'Disponible dans quelques instants',
                        style: AppTextStyles.xs,
                      ),
                    ],
                  ),
                ),
                if (codeUnique != null)
                  InkWell(
                    onTap: onCopierCode,
                    borderRadius: BorderRadius.circular(10),
                    child: Padding(
                      padding: const EdgeInsets.all(6),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(codeUnique!,
                              style: AppTextStyles.mono.copyWith(
                                  fontSize: 13, color: AppColors.b7, letterSpacing: 0.6)),
                          const SizedBox(width: 5),
                          const Icon(Icons.copy_rounded, size: 14, color: AppColors.b7),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Découpe pointillée avec deux encoches, façon billet.
class _Decoupe extends StatelessWidget {
  const _Decoupe();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 24,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: ApsDivider(space: 0, dashed: true),
          ),
          for (final gauche in [true, false])
            Positioned(
              left: gauche ? -12 : null,
              right: gauche ? null : -12,
              child: Container(
                width: 24,
                height: 24,
                decoration: const BoxDecoration(
                  color: Color(0xFFEEF5F1),
                  shape: BoxShape.circle,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Ligne d'une étape « et maintenant ? ».
class _NextStepData {
  const _NextStepData({
    required this.icon,
    required this.titre,
    required this.description,
    this.tone = ApsTone.green,
  });

  final IconData icon;
  final String titre;
  final String description;
  final ApsTone tone;
}

/// Liste « et maintenant ? » présentée en menu.
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
        icon: Icons.verified_user_outlined,
        titre: 'Paiement sous séquestre',
        description: "Versé au praticien seulement après la consultation.",
      ),
      _NextStepData(
        icon: Icons.location_on_outlined,
        tone: ApsTone.amber,
        titre: 'Lieu exact à venir',
        description: codeConnu
            ? "Le médecin vous l'enverra par notification."
            : 'Vous serez notifié dès que le médecin accepte.',
      ),
      if (compteVientDetreCree)
        const _NextStepData(
          icon: Icons.mark_email_read_outlined,
          tone: ApsTone.sky,
          titre: 'Compte patient créé',
          description: 'Vous êtes connecté(e) ; un e-mail de bienvenue vous a été envoyé.',
        ),
    ];

    return ApsMenu(children: [
      for (final i in items)
        ApsMenuItem(
          icon: i.icon,
          tone: i.tone,
          title: i.titre,
          subtitle: i.description,
          showChevron: false,
        ),
    ]);
  }
}
