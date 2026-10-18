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
      padding: EdgeInsets.fromLTRB(18, 0, 18, 24 + bas),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ApsSheetHeader(
              title: _modification ? 'Modifier le lieu' : 'Accepter le rendez-vous',
              onClose: _enCours ? () {} : () => Navigator.of(context).pop(),
            ),
            if (nom != null && nom.isNotEmpty) ...[
              const SizedBox(height: 14),
              ApsCard(
                flat: true,
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    ApsAvatar(name: nom, size: 40),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(nom,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTextStyles.strong.copyWith(fontSize: 13.5)),
                    ),
                    const ApsPill('Payé', icon: Icons.check_rounded),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.lock_outline_rounded, size: 13, color: AppColors.b6),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Fonds sous séquestre, versés après la consultation',
                      style: AppTextStyles.xs.copyWith(color: AppColors.ink2, fontSize: 11.5),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 16),
            Text.rich(
              const TextSpan(children: [
                TextSpan(text: 'Lieu de consultation '),
                TextSpan(text: '*', style: TextStyle(color: AppColors.red)),
              ]),
              style: AppTextStyles.strong.copyWith(fontSize: 13),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _controleur,
              enabled: !_enCours,
              autofocus: true,
              minLines: 2,
              maxLines: 4,
              maxLength: longueurMaxLieuRdv,
              textCapitalization: TextCapitalization.sentences,
              keyboardType: TextInputType.multiline,
              style: AppTextStyles.strong.copyWith(fontSize: 14, fontWeight: FontWeight.w600),
              decoration: const InputDecoration(
                hintText: 'Ex. : Cabinet médical Bonapriso, rue des Palmiers, 2e étage, Douala',
                hintMaxLines: 2,
                prefixIcon: Icon(Icons.location_on_outlined),
              ),
              onChanged: (_) => setState(() => _erreur = null),
            ),
            if (_erreur != null) ...[
              const SizedBox(height: 4),
              AppAlert(type: AppAlertType.danger, message: _erreur!),
            ],
            const SizedBox(height: 10),
            ApsNote.text(
              _modification
                  ? '$qui sera prévenu tout de suite du changement de lieu.'
                  : '$qui reçoit tout de suite une notification avec la date et le lieu.',
              icon: Icons.notifications_none_rounded,
            ),
            const SizedBox(height: 14),
            ApsButton(
              label: _modification ? 'Enregistrer et notifier' : 'Accepter et notifier',
              icon: Icons.check_rounded,
              loading: _enCours,
              onPressed: _peutValider ? _valider : null,
            ),
            const SizedBox(height: 4),
            TextButton(
              onPressed: _enCours ? null : () => Navigator.of(context).pop(),
              style: TextButton.styleFrom(foregroundColor: AppColors.ink2),
              child: const Text('Plus tard'),
            ),
          ],
        ),
      ),
    );
  }
}
