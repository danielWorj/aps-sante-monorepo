// lib/pages/portails/medecin/changer_type_rdv_sheet.dart
//
// Feuille « Changer le type du rendez-vous » : pour un RDV payé (`confirme`)
// pas encore commencé, le médecin le transforme en téléconsultation ou en
// consultation physique. Le patient est notifié ; un RDV redevenu physique
// doit ensuite être accepté avec un lieu.
//
// Erreurs (voir changerTypeRendezVous côté serveur) : 400 téléconsultation
// non activée, 403 autre médecin, 409 non payé, statut incompatible ou
// consultation commencée. Le message du serveur est affiché tel quel.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/rendez_vous_controller.dart';
import '../../../models/rendez_vous_models.dart';
import '../../../repositories/rendez_vous_repository.dart' show ApiException;

/// Ouvre la feuille pour [rdv] et, en cas de succès, affiche un SnackBar avec
/// le message du serveur. Renvoie `true` si le type a changé. La liste des
/// RDV est déjà rafraîchie par le contrôleur.
Future<bool> afficherChangerTypeRdv(
  BuildContext context, {
  required RendezVous rdv,
  String? nomPatient,
}) async {
  // Capturé AVANT l'await : le contexte de la page peut être démonté.
  final messenger = ScaffoldMessenger.of(context);

  final resultat = await showModalBottomSheet<ResultatChangementType>(
    context: context,
    isScrollControlled: true,
    builder: (_) => ChangerTypeRdvSheet(rdv: rdv, nomPatient: nomPatient),
  );
  if (resultat == null) return false;

  messenger.showSnackBar(
    SnackBar(
      content: Text(resultat.message ?? 'Type du rendez-vous modifié. Le patient a été prévenu.'),
      duration: const Duration(seconds: 5),
    ),
  );
  return !resultat.inchange;
}

class ChangerTypeRdvSheet extends ConsumerStatefulWidget {
  const ChangerTypeRdvSheet({super.key, required this.rdv, this.nomPatient});

  final RendezVous rdv;
  final String? nomPatient;

  @override
  ConsumerState<ChangerTypeRdvSheet> createState() => _ChangerTypeRdvSheetState();
}

class _ChangerTypeRdvSheetState extends ConsumerState<ChangerTypeRdvSheet> {
  late TypeRdv _type = widget.rdv.estTeleconsultation ? TypeRdv.physique : TypeRdv.teleconsultation;

  bool _enCours = false;
  String? _erreur;

  bool get _peutValider => !_enCours && _type != widget.rdv.typeRdv;

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
      final resultat = await ref
          .read(actionsRendezVousControllerProvider.notifier)
          .changerType(widget.rdv.rdvId, typeRdv: _type, token: token);
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
        _erreur = 'Impossible de changer le type du rendez-vous : $e';
      });
    }
  }

  Widget _option(TypeRdv type, String titre, String aide, IconData icone) {
    final choisi = _type == type;
    final actuel = widget.rdv.typeRdv == type;
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: _enCours ? null : () => setState(() {
        _type = type;
        _erreur = null;
      }),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: choisi ? AppColors.primary : AppColors.line),
        ),
        child: Row(
          children: [
            Icon(icone, size: 20, color: choisi ? AppColors.primary : AppColors.ink2),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(actuel ? '$titre (actuel)' : titre,
                      style: AppTextStyles.strong.copyWith(fontSize: 13.5)),
                  const SizedBox(height: 2),
                  Text(aide, style: AppTextStyles.xs.copyWith(color: AppColors.ink2, fontSize: 11.5)),
                ],
              ),
            ),
            Icon(
              choisi ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
              size: 20,
              color: choisi ? AppColors.primary : AppColors.ink2,
            ),
          ],
        ),
      ),
    );
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
              title: 'Changer le type',
              onClose: _enCours ? () {} : () => Navigator.of(context).pop(),
            ),
            const SizedBox(height: 14),
            _option(
              TypeRdv.physique,
              'Consultation physique',
              'Vous préciserez ensuite le lieu de la consultation.',
              Icons.medical_services_outlined,
            ),
            const SizedBox(height: 8),
            _option(
              TypeRdv.teleconsultation,
              'Téléconsultation',
              'Le lieu éventuel est retiré ; la consultation se fait en visio.',
              Icons.videocam_outlined,
            ),
            if (_erreur != null) ...[
              const SizedBox(height: 10),
              AppAlert(type: AppAlertType.danger, message: _erreur!),
            ],
            const SizedBox(height: 10),
            ApsNote.text(
              '$qui sera prévenu tout de suite du changement. Le tarif ne change pas.',
              icon: Icons.notifications_none_rounded,
            ),
            const SizedBox(height: 14),
            ApsButton(
              label: 'Enregistrer et notifier',
              icon: Icons.swap_horiz_rounded,
              loading: _enCours,
              onPressed: _peutValider ? _valider : null,
            ),
            const SizedBox(height: 4),
            TextButton(
              onPressed: _enCours ? null : () => Navigator.of(context).pop(),
              style: TextButton.styleFrom(foregroundColor: AppColors.ink2),
              child: const Text('Annuler'),
            ),
          ],
        ),
      ),
    );
  }
}
