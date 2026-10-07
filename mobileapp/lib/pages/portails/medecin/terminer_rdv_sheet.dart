// lib/pages/portails/medecin/terminer_rdv_sheet.dart
//
// Feuille de saisie du code de consultation : le médecin clique sur
// « Terminé » (RDV physique), le patient lui dicte son code, le médecin le
// saisit ici pour clôturer la consultation.
//
// Règles (voir terminerRendezVous côté serveur) :
//   - le code (6 caractères) n'est connu que du PATIENT : il n'est jamais
//     renvoyé au médecin, cet écran ne l'affiche donc nulle part ;
//   - succès → le RDV passe `honore`, les fonds restent en séquestre T heures
//     puis sont libérés automatiquement (date renvoyée par le serveur) ;
//   - échec → 403 code incorrect (+ tentatives restantes), 429 saisie
//     verrouillée (+ heure de reprise), 409 / 400 message du serveur.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/rendez_vous_controller.dart';
import '../../../models/rendez_vous_models.dart';
import '../../../repositories/rendez_vous_repository.dart' show ApiException;
import '../../../utils/fonds.dart';

/// Longueur du code de consultation (nouveaux RDV).
const int _longueurCode = 6;

/// Durée de verrouillage supposée si le serveur ne renvoie pas
/// `reessayer_apres` avec son 429 (le serveur fait foi : 15 min).
const Duration _verrouParDefaut = Duration(minutes: 15);

/// Ouvre la feuille de saisie du code pour [rdv] et, en cas de succès,
/// affiche un SnackBar de confirmation avec la date de libération des fonds.
///
/// Renvoie `true` si la consultation a été terminée. La liste des RDV est
/// déjà rafraîchie par le contrôleur ; l'appelant n'a rien d'autre à faire.
Future<bool> afficherTerminerRdv(
  BuildContext context, {
  required RendezVous rdv,
  String? nomPatient,
}) async {
  // Capturé AVANT l'await : le contexte de la page peut être démonté à la
  // fermeture de la feuille.
  final messenger = ScaffoldMessenger.of(context);

  final resultat = await showModalBottomSheet<ResultatTerminaison>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.card,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => TerminerRdvSheet(rdv: rdv, nomPatient: nomPatient),
  );
  if (resultat == null) return false;

  final date = resultat.liberationPrevueLe;
  final texte = resultat.message ??
      (date != null
          ? 'Consultation terminée. Fonds libérés le ${dateCourte(date)}.'
          : 'Consultation terminée.');
  messenger.showSnackBar(
    SnackBar(content: Text(texte), duration: const Duration(seconds: 6)),
  );
  return true;
}

/// Force les majuscules à la frappe (le serveur normalise aussi la saisie).
class _MajusculesFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue ancien,
    TextEditingValue nouveau,
  ) {
    return nouveau.copyWith(text: nouveau.text.toUpperCase());
  }
}

class TerminerRdvSheet extends ConsumerStatefulWidget {
  const TerminerRdvSheet({super.key, required this.rdv, this.nomPatient});

  final RendezVous rdv;
  final String? nomPatient;

  @override
  ConsumerState<TerminerRdvSheet> createState() => _TerminerRdvSheetState();
}

class _TerminerRdvSheetState extends ConsumerState<TerminerRdvSheet> {
  final TextEditingController _controleur = TextEditingController();

  bool _enCours = false;
  String? _erreur;
  DateTime? _verrouJusqua;

  @override
  void dispose() {
    _controleur.dispose();
    super.dispose();
  }

  bool get _verrouille =>
      _verrouJusqua != null && _verrouJusqua!.isAfter(DateTime.now());

  bool get _peutValider =>
      !_enCours && !_verrouille && _controleur.text.length == _longueurCode;

  String _heure(DateTime d) {
    final l = d.toLocal();
    return '${l.hour.toString().padLeft(2, '0')}:'
        '${l.minute.toString().padLeft(2, '0')}';
  }

  Future<void> _valider() async {
    if (!_peutValider) return;

    final token = ref.read(authTokenProvider);
    if (token == null) {
      setState(() => _erreur = 'Session expirée. Reconnectez-vous.');
      return;
    }

    setState(() {
      _enCours = true;
      _erreur = null;
    });

    try {
      final resultat =
          await ref.read(actionsRendezVousControllerProvider.notifier).terminer(
                widget.rdv.rdvId,
                code: _controleur.text,
                token: token,
              );
      if (mounted) Navigator.of(context).pop(resultat);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _enCours = false;
        switch (e.statusCode) {
          case 403:
            final restantes = e.tentativesRestantes;
            _erreur = restantes == null
                ? e.message
                : '${e.message} ${restantes <= 1 ? '$restantes tentative restante' : '$restantes tentatives restantes'}.';
            _controleur.clear();
          case 429:
            _verrouJusqua =
                e.reessayerApres ?? DateTime.now().add(_verrouParDefaut);
            _erreur = 'Trop de tentatives. Saisie verrouillée jusqu\'à '
                '${_heure(_verrouJusqua!)}.';
            _controleur.clear();
          default:
            _erreur = e.message;
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _enCours = false;
        _erreur = 'Impossible de terminer la consultation : $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bas = MediaQuery.of(context).viewInsets.bottom;
    final nom = widget.nomPatient?.trim();

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 14, 20, 20 + bas),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.lineStrong,
                  borderRadius: BorderRadius.circular(100),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Terminer la consultation',
              style: TextStyle(
                fontFamily: AppTextStyles.fontDisplay,
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.ink,
              ),
            ),
            if (nom != null && nom.isNotEmpty) ...[
              const SizedBox(height: 3),
              Text(
                nom,
                style: const TextStyle(fontSize: 12, color: AppColors.inkSoft),
              ),
            ],
            const SizedBox(height: 10),
            const Text(
              'Demandez au patient son code de consultation et saisissez-le '
              'pour clôturer le rendez-vous.',
              style: TextStyle(
                fontSize: 12.5,
                height: 1.4,
                color: AppColors.inkSoft,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _controleur,
              enabled: !_enCours && !_verrouille,
              autofocus: true,
              maxLength: _longueurCode,
              textAlign: TextAlign.center,
              textCapitalization: TextCapitalization.characters,
              autocorrect: false,
              enableSuggestions: false,
              keyboardType: TextInputType.visiblePassword,
              textInputAction: TextInputAction.done,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
                _MajusculesFormatter(),
              ],
              style: const TextStyle(
                fontFamily: AppTextStyles.fontMono,
                fontSize: 24,
                fontWeight: FontWeight.w700,
                letterSpacing: 8,
                color: AppColors.ink,
              ),
              decoration: InputDecoration(
                counterText: '',
                hintText: '••••••',
                hintStyle: const TextStyle(
                  fontFamily: AppTextStyles.fontMono,
                  fontSize: 24,
                  letterSpacing: 8,
                  color: AppColors.inkFaint,
                ),
                filled: true,
                fillColor: AppColors.paper,
                contentPadding: const EdgeInsets.symmetric(vertical: 14),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.lineStrong),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide:
                      const BorderSide(color: AppColors.primary, width: 1.6),
                ),
                disabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.line),
                ),
              ),
              onChanged: (_) => setState(() => _erreur = null),
              onSubmitted: (_) => _valider(),
            ),
            if (_erreur != null) ...[
              const SizedBox(height: 10),
              AppAlert(type: AppAlertType.danger, message: _erreur!),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: AppOutlineButton(
                    label: 'Annuler',
                    expanded: true,
                    onPressed: _enCours
                        ? () {}
                        : () => Navigator.of(context).pop(),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _enCours
                      ? const SizedBox(
                          height: 34,
                          child: Center(
                            child: SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2.4),
                            ),
                          ),
                        )
                      : Opacity(
                          opacity: _peutValider ? 1 : 0.45,
                          child: IgnorePointer(
                            ignoring: !_peutValider,
                            child: RdvButton(
                              label: 'Valider',
                              icon: Icons.check_circle_outline,
                              expanded: true,
                              onPressed: _valider,
                            ),
                          ),
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