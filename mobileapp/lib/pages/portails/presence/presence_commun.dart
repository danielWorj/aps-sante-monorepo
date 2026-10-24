// lib/pages/portails/presence/presence_commun.dart
//
// Éléments partagés par les écrans des espaces pharmacie et centre de santé.
// Les briques génériques (en-tête de page, carte, bandeau, chargement,
// erreur, vide, confirmation) viennent du portail assurance, les champs de
// formulaire du portail laboratoire ; ce fichier ajoute l'identité de
// l'espace, le bandeau « masqué au public », la page empilée et l'ouverture
// de la fiche publique.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../components/components.dart';
import '../../../controllers/espace_presence_controller.dart';
import '../../../models/espace_presence_models.dart';
import '../../../utils/endpoint.dart';
import '../../espaces/carte_connexion_compte.dart' show BoutonChangerEspace;

export '../assurance/portail_assurance_commun.dart'
    show EnTetePortail, CartePortail, BandeauPortail, ChargementPortail, ErreurPortail, VidePortail,
        confirmerPortail, snackPortail, messageErreur, dateCourtePortail;
export '../laboratoire/portail_laboratoire_commun.dart' show ChampLaboratoire, ChoixVilleLaboratoire, nombreLaboratoire;

IconData iconeEspace(TypeEspacePresence type) =>
    type == TypeEspacePresence.pharmacie ? Icons.local_pharmacy_outlined : Icons.local_hospital_outlined;

/// Ouvre la fiche publique sur le site web (navigateur).
Future<void> ouvrirFichePublique(BuildContext context, TypeEspacePresence type, String id) async {
  final chemin = type == TypeEspacePresence.pharmacie ? '/pharmacie/$id' : '/structure-sante/$id';
  final ok = await launchUrl(Uri.parse('${ApiRealEndpoints.siteWebUrl}$chemin'), mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Impossible d'ouvrir le navigateur.")));
  }
}

/// Date et heure courtes : « 23/10 14:05 ».
String dateHeurePresence(DateTime? d) {
  if (d == null) return '—';
  final l = d.toLocal();
  String p(int n) => n.toString().padLeft(2, '0');
  return '${p(l.day)}/${p(l.month)} ${p(l.hour)}:${p(l.minute)}';
}

/// Identité de l'espace (photo + nom de la fiche + ouverture) et déconnexion.
class EnTetePresence extends ConsumerWidget {
  const EnTetePresence({super.key, required this.type});

  final TypeEspacePresence type;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fiche = ref.watch(maFichePresenceProvider(type)).value;
    final ouverture = fiche?.ouverture;
    return Padding(
      // Marge droite : la cloche flotte en haut à droite (shell).
      padding: const EdgeInsets.fromLTRB(0, 12, 56, 0),
      child: Row(
        children: [
          ApsVignette(
            imageUrl: fiche?.imageUrl,
            size: 40,
            radius: 8,
            repli: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: AppColors.b1, borderRadius: BorderRadius.circular(8)),
              child: Icon(iconeEspace(type), color: AppColors.b7, size: 20),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(type.espace, style: AppTextStyles.cardMeta),
                Text(fiche?.nom ?? type.espace, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppTextStyles.h3.copyWith(fontSize: 15)),
                if (ouverture != null)
                  Text(ouverture.libelle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTextStyles.cardMeta.copyWith(color: ouverture.ouvert ? AppColors.success : AppColors.inkFaint)),
              ],
            ),
          ),
          const BoutonChangerEspace(),
          const BoutonParametres(),
          const BoutonDeconnexion(),
        ],
      ),
    );
  }
}

/// Bandeau affiché quand un contenu est conservé mais masqué au public
/// faute d'un abonnement qui l'inclut.
class BandeauMasque extends StatelessWidget {
  const BandeauMasque({super.key, required this.visible, required this.texte});

  final bool visible;
  final String texte;

  @override
  Widget build(BuildContext context) {
    if (visible) return const SizedBox.shrink();
    return BandeauPortailMasque(texte: texte);
  }
}

class BandeauPortailMasque extends StatelessWidget {
  const BandeauPortailMasque({super.key, required this.texte});

  final String texte;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.line)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.visibility_off_outlined, size: 18, color: AppColors.inkFaint),
            const SizedBox(width: 8),
            Expanded(child: Text('$texte Voir « Abonnement ».', style: AppTextStyles.cardMeta)),
          ],
        ),
      );
}

/// Bandeau « fiche pas encore en ligne ».
class BandeauFicheHorsLigne extends StatelessWidget {
  const BandeauFicheHorsLigne({super.key, required this.statut, required this.enLigne});

  final StatutFichePresence statut;
  final bool enLigne;

  @override
  Widget build(BuildContext context) {
    if (enLigne) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.line)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.hourglass_top_outlined, size: 18, color: AppColors.inkFaint),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              statut == StatutFichePresence.nonPublie
                  ? "Votre fiche n'est pas publiée : elle n'est pas visible du public. Contactez ApSa pour en connaître la raison."
                  : 'Votre fiche est en cours de vérification par ApSa : elle sera visible du public après validation.',
              style: AppTextStyles.cardMeta,
            ),
          ),
        ],
      ),
    );
  }
}

/// Écran empilé depuis « Plus » : barre de titre + contenu défilant.
class PagePresence extends StatelessWidget {
  const PagePresence({super.key, required this.titre, this.description, required this.onRafraichir, required this.children, this.action});

  final String titre;
  final String? description;
  final Future<void> Function() onRafraichir;
  final List<Widget> children;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: AppColors.paper,
        appBar: AppBar(
          title: Text(titre),
          backgroundColor: AppColors.paper,
          surfaceTintColor: Colors.transparent,
          actions: [?action],
        ),
        body: RefreshIndicator(
          onRefresh: onRafraichir,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
            children: [
              if (description != null)
                Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(description!, style: AppTextStyles.body)),
              ...children,
            ],
          ),
        ),
      );
}
