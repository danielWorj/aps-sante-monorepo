// lib/pages/portails/medecin/accepter_rdv_sheet.dart
//
// Feuille « Accepter le rendez-vous » : pour un RDV PHYSIQUE payé
// (`confirme`), le médecin saisit le lieu de la consultation. Le lieu est
// obligatoire ; le patient reçoit une notification avec la date et le lieu.
// Rouverte sur un RDV déjà accepté, elle sert à changer le lieu (le patient
// est alors renotifié).
//
// Erreurs (voir accepterRendezVous côté serveur) : 400 lieu absent / trop
// long ou téléconsultation, 403 autre médecin, 409 non payé ou statut
// incompatible. Le message du serveur est affiché tel quel.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/rendez_vous_controller.dart';
import '../../../models/rendez_vous_models.dart';
import '../../../repositories/rendez_vous_repository.dart' show ApiException;

/// Longueur maximale du lieu (voir acceptationRdv.service.js).
const int longueurMaxLieuRdv = 500;

/// Ouvre la feuille d'acceptation pour [rdv] et, en cas de succès, affiche un
/// SnackBar avec le message du serveur.
///
/// Renvoie `true` si le RDV a été accepté (ou son lieu modifié). La liste des
/// RDV est déjà rafraîchie par le contrôleur.
Future<bool> afficherAccepterRdv(
  BuildContext context, {
  required RendezVous rdv,
  String? nomPatient,
}) async {
  // Capturé AVANT l'await : le contexte de la page peut être démonté.
  final messenger = ScaffoldMessenger.of(context);

  final resultat = await showModalBottomSheet<ResultatAcceptation>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.card,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => AccepterRdvSheet(rdv: rdv, nomPatient: nomPatient),
  );
  if (resultat == null) return false;

  messenger.showSnackBar(
    SnackBar(
      content: Text(resultat.message ?? 'Rendez-vous accepté. Le patient a été prévenu.'),
      duration: const Duration(seconds: 5),
    ),
  );
  return true;
}

class AccepterRdvSheet extends ConsumerStatefulWidget {
  const AccepterRdvSheet({super.key, required this.rdv, this.nomPatient});

  final RendezVous rdv;
  final String? nomPatient;

  @override
  ConsumerState<AccepterRdvSheet> createState() => _AccepterRdvSheetState();
}

class _AccepterRdvSheetState extends ConsumerState<AccepterRdvSheet> {
  late final TextEditingController _controleur =
      TextEditingController(text: widget.rdv.lieuRdv ?? '');

  bool _enCours = false;
  String? _erreur;

  bool get _modification => widget.rdv.accepteLe != null;
  bool get _peutValider => !_enCours && _controleur.text.trim().isNotEmpty;

  @override
  void dispose() {
    _controleur.dispose();
    super.dispose();
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
          await ref.read(actionsRendezVousControllerProvider.notifier).accepter(
                widget.rdv.rdvId,
                lieu: _controleur.text.trim(),
                token: token,
              );
      if (mounted) Navigator.of(context).pop(resultat);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _enCours = false;
        _erreur = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _enCours = false;
        _erreur = 'Impossible d\'accepter le rendez-vous : $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bas = MediaQuery.of(context).viewInsets.bottom;
    final nom = widget.nomPatient?.trim();
    final qui = (nom != null && nom.isNotEmpty) ? nom : 'Le patient';

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
            Text(
              _modification ? 'Modifier le lieu du rendez-vous' : 'Accepter le rendez-vous',
              style: const TextStyle(
                fontFamily: AppTextStyles.fontDisplay,
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.ink,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              _modification
                  ? 'Saisissez le nouveau lieu : $qui sera prévenu du changement.'
                  : 'Indiquez où aura lieu la consultation : $qui recevra une '
                      'notification avec la date et le lieu.',
              style: const TextStyle(
                fontSize: 12.5,
                height: 1.4,
                color: AppColors.inkSoft,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _controleur,
              enabled: !_enCours,
              autofocus: true,
              minLines: 2,
              maxLines: 4,
              maxLength: longueurMaxLieuRdv,
              textCapitalization: TextCapitalization.sentences,
              keyboardType: TextInputType.multiline,
              style: const TextStyle(fontSize: 14, color: AppColors.ink),
              decoration: InputDecoration(
                labelText: 'Lieu du rendez-vous *',
                hintText: 'Ex. : Cabinet médical Bonapriso, rue des Palmiers, 2e étage, Douala',
                hintMaxLines: 2,
                filled: true,
                fillColor: AppColors.paper,
                prefixIcon: const Icon(Icons.location_on_outlined),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.lineStrong),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.primary, width: 1.6),
                ),
                disabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.line),
                ),
              ),
              onChanged: (_) => setState(() => _erreur = null),
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
                    onPressed: _enCours ? () {} : () => Navigator.of(context).pop(),
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
                              label: _modification ? 'Enregistrer' : 'Accepter',
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
