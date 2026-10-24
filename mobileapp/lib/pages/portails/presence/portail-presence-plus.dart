// lib/pages/portails/presence/portail-presence-plus.dart
//
// Espaces pharmacie et centre de santé — « Plus » : rubriques ouvertes en
// écran empilé (photos, actualités, gardes et avis pour une pharmacie,
// prestations pour un centre, abonnement, annonces ApSa), fiche publique,
// compte (PIN, changement d'espace) et déconnexion.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/espace_presence_controller.dart';
import '../../../models/espace_presence_models.dart';
import '../../espaces/carte_connexion_compte.dart';
import '../annonces/portail_annonces.dart';
import 'portail-presence-abonnement.dart';
import 'portail-presence-actualites.dart';
import 'portail-presence-gardes-avis.dart';
import 'portail-presence-photos.dart';
import 'portail-presence-prestations.dart';
import 'presence_commun.dart';

/// Ouvre une rubrique en écran empilé (aussi depuis le tableau de bord).
void ouvrirRubriquePresence(BuildContext context, TypeEspacePresence type, String rubrique) {
  final Widget? page = switch (rubrique) {
    'photos' => PortailPresencePhotos(type: type),
    'actualites' => PortailPresenceActualites(type: type),
    'gardes' => const PortailPresenceGardes(),
    'avis' => const PortailPresenceAvis(),
    'prestations' => const PortailPresencePrestations(),
    'abonnement' => PortailPresenceAbonnement(type: type),
    'annonces' => const PortailAnnonces(),
    _ => null,
  };
  if (page == null) return;
  Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page));
}

class PortailPresencePlus extends ConsumerWidget {
  const PortailPresencePlus({super.key, required this.type});

  final TypeEspacePresence type;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fiche = ref.watch(maFichePresenceProvider(type)).value;
    final pharmacie = type == TypeEspacePresence.pharmacie;
    void ouvrir(String r) => ouvrirRubriquePresence(context, type, r);

    return Container(
      color: AppColors.paper,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
        children: [
          EnTetePresence(type: type),
          const EnTetePortail(titre: 'Plus', description: 'Toutes les rubriques de votre espace.'),
          ApsMenu(children: [
            ApsMenuItem(icon: Icons.photo_library_outlined, title: 'Photos', subtitle: 'Galerie de votre fiche', onTap: () => ouvrir('photos')),
            ApsMenuItem(icon: Icons.newspaper_outlined, title: 'Actualités', subtitle: 'Fermetures, campagnes, nouveaux services', onTap: () => ouvrir('actualites')),
            if (pharmacie) ...[
              ApsMenuItem(icon: Icons.nightlight_outlined, title: 'Gardes', subtitle: 'Vos gardes officielles', onTap: () => ouvrir('gardes')),
              ApsMenuItem(icon: Icons.star_half_rounded, title: 'Avis', subtitle: 'Ce que les patients disent de vous', onTap: () => ouvrir('avis')),
            ] else
              ApsMenuItem(icon: Icons.receipt_long_outlined, title: 'Prestations', subtitle: 'Consultations, actes et examens', onTap: () => ouvrir('prestations')),
            ApsMenuItem(icon: Icons.workspace_premium_outlined, title: 'Abonnement', subtitle: 'Ce que le public voit de votre fiche', onTap: () => ouvrir('abonnement')),
            ApsMenuItem(icon: Icons.campaign_outlined, title: 'Annonces ApSa', subtitle: 'Informations publiées par ApSa', onTap: () => ouvrir('annonces')),
            if (fiche != null)
              ApsMenuItem(
                icon: Icons.open_in_new_rounded,
                title: fiche.statut == StatutFichePresence.publie ? 'Voir ma fiche publique' : 'Aperçu de ma fiche',
                subtitle: 'Sur le site ApSa',
                onTap: () => ouvrirFichePublique(context, type, fiche.id),
              ),
          ]),
          const SizedBox(height: 14),
          const CarteConnexionCompte(),
          ApsMenu(children: [
            ApsMenuItem(icon: Icons.logout_rounded, destructive: true, showChevron: false, title: 'Déconnexion', onTap: () => deconnecterEspace(context, ref)),
          ]),
        ],
      ),
    );
  }
}
