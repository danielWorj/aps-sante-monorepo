// lib/pages/portails/assurance/portail_assurance_commun.dart
//
// Éléments partagés par les onglets du portail assurance : en-tête de page,
// carte, état de chargement / d'erreur, puce de statut, appel authentifié
// depuis un widget.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/style/colors.dart';
import '../../../components/style/text_styles.dart';
import '../../../controllers/authentification_controller.dart';
import '../../../controllers/portail_assurance_controller.dart';
import '../../../repositories/portail_assurance_repository.dart';

/// Appel authentifié depuis un écran (renouvellement du token sur 401).
Future<T> appelPortailUi<T>(
  WidgetRef ref,
  Future<T> Function(PortailAssuranceRepository repo, String token) appel,
) {
  final repo = ref.read(portailAssuranceRepositoryProvider);
  return ref.read(sessionControllerProvider.notifier).appelAuthentifie((token) => appel(repo, token));
}

/// Déconnexion depuis le portail : session fermée (même hors réseau), retour
/// au premier écran de l'application.
Future<void> deconnecterPortail(BuildContext context, WidgetRef ref) async {
  if (!await confirmerPortail(context, 'Déconnexion', 'Se déconnecter de votre espace ?', action: 'Se déconnecter')) return;
  try {
    await ref.read(sessionControllerProvider.notifier).deconnecter();
  } catch (_) {
    // Session déjà fermée localement (voir SessionController.deconnecter).
  }
  ref.invalidate(maFicheAssuranceProvider);
  if (context.mounted) Navigator.of(context).popUntil((r) => r.isFirst);
}

void snackPortail(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}

String dateCourtePortail(DateTime? d) {
  if (d == null) return '—';
  final l = d.toLocal();
  String p(int n) => n.toString().padLeft(2, '0');
  return '${p(l.day)}/${p(l.month)}/${l.year}';
}

String dateHeurePortail(DateTime? d) {
  if (d == null) return '—';
  final l = d.toLocal();
  String p(int n) => n.toString().padLeft(2, '0');
  return '${p(l.day)}/${p(l.month)}/${l.year} à ${p(l.hour)}:${p(l.minute)}';
}

/// Message d'erreur lisible (ApiException.toString() = message serveur).
String messageErreur(Object e) => e.toString().replaceFirst('Exception: ', '');

Future<bool> confirmerPortail(BuildContext context, String titre, String texte, {String action = 'Confirmer'}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(titre),
      content: Text(texte),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Annuler')),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(action)),
      ],
    ),
  );
  return ok == true;
}

class EnTetePortail extends StatelessWidget {
  final String titre;
  final String? description;

  const EnTetePortail({super.key, required this.titre, this.description});

  @override
  Widget build(BuildContext context) {
    return Padding(
      // Marge droite : la cloche flotte en haut à droite (shell).
      padding: const EdgeInsets.fromLTRB(0, 10, 56, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            titre,
            style: AppTextStyles.l,
          ),
          if (description != null) ...[
            const SizedBox(height: 4),
            Text(description!, style: AppTextStyles.cardMeta),
          ],
        ],
      ),
    );
  }
}

class CartePortail extends StatelessWidget {
  final String? titre;
  final IconData? icone;
  final Widget child;
  final Widget? action;

  const CartePortail({super.key, this.titre, this.icone, required this.child, this.action});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (titre != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  if (icone != null) ...[Icon(icone, size: 18, color: AppColors.primary), const SizedBox(width: 8)],
                  Expanded(child: Text(titre!, style: AppTextStyles.cardTitle)),
                  if (action != null) action!,
                ],
              ),
            ),
          child,
        ],
      ),
    );
  }
}

/// Bandeau d'information (vérification, période de grâce, abonnement).
class BandeauPortail extends StatelessWidget {
  final IconData icone;
  final String texte;
  final Color fond;
  final Color couleur;
  final Widget? action;

  const BandeauPortail({
    super.key,
    required this.icone,
    required this.texte,
    this.fond = AppColors.warningLight,
    this.couleur = AppColors.amber700,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: fond, borderRadius: BorderRadius.circular(12)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icone, size: 18, color: couleur),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(texte, style: TextStyle(color: couleur, fontSize: 13)),
                if (action != null) action!,
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class ChargementPortail extends StatelessWidget {
  const ChargementPortail({super.key});

  @override
  Widget build(BuildContext context) =>
      const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()));
}

class ErreurPortail extends StatelessWidget {
  final Object erreur;
  final VoidCallback onReessayer;

  const ErreurPortail({super.key, required this.erreur, required this.onReessayer});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Column(
        children: [
          Text(messageErreur(erreur), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.dangerDark)),
          TextButton(onPressed: onReessayer, child: const Text('Réessayer')),
        ],
      ),
    );
  }
}

class VidePortail extends StatelessWidget {
  final IconData icone;
  final String texte;

  const VidePortail({super.key, required this.icone, required this.texte});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Column(
        children: [
          Icon(icone, size: 30, color: AppColors.inkFaint),
          const SizedBox(height: 6),
          Text(texte, textAlign: TextAlign.center, style: AppTextStyles.cardMeta),
        ],
      ),
    );
  }
}

/// Puce de statut d'une demande de mise en relation.
class PuceStatutDemande extends StatelessWidget {
  final String statut;
  final String libelle;

  const PuceStatutDemande({super.key, required this.statut, required this.libelle});

  @override
  Widget build(BuildContext context) {
    final (Color fond, Color texte) = switch (statut) {
      'nouvelle' => (AppColors.dangerLight, AppColors.dangerDark),
      'en_cours' => (AppColors.warningLight, AppColors.amber700),
      'traitee' => (AppColors.successLight, AppColors.primary),
      _ => (AppColors.paper, AppColors.inkSoft),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: fond, borderRadius: BorderRadius.circular(999)),
      child: Text(libelle, style: TextStyle(color: texte, fontSize: 11.5, fontWeight: FontWeight.w600)),
    );
  }
}
