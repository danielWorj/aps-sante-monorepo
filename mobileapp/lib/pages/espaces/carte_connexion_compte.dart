// lib/pages/espaces/carte_connexion_compte.dart
//
// Carte « Connexion » des profils : code PIN de connexion (créer /
// changer), « Changer d'espace » quand le compte en a plusieurs, et
// « Mises à jour » de l'application.
// [BoutonChangerEspace] : même accès en icône, pour les en-têtes.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/authentification_controller.dart';
import '../../controllers/mise_a_jour_controller.dart';
import '../mise_a_jour/mise_a_jour_page.dart';
import '../public/creer_pin_screen.dart';
import '../verrou/verrou_application.dart';
import 'choisir_espace_screen.dart';

void ouvrirCreerPin(BuildContext context) {
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CreerPinScreen()));
}

void ouvrirChoisirEspace(BuildContext context) {
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ChoisirEspaceScreen()));
}

class CarteConnexionCompte extends ConsumerWidget {
  const CarteConnexionCompte({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pinDefini = ref.watch(authUtilisateurProvider)?.pinDefini ?? false;
    final plusieursEspaces = (ref.watch(espacesCompteProvider).value?.length ?? 0) > 1;

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: ApsMenu(
        children: [
          ApsMenuItem(
            icon: Icons.pin_outlined,
            title: pinDefini ? 'Code PIN de connexion' : 'Créer mon code PIN',
            subtitle: pinDefini
                ? 'Changer le code à 6 chiffres'
                : 'Connectez-vous avec votre numéro, sans mot de passe',
            onTap: () => ouvrirCreerPin(context),
          ),
          if (pinDefini) const _LigneEmpreinte(),
          if (plusieursEspaces)
            ApsMenuItem(
              icon: Icons.swap_horiz_rounded,
              title: 'Changer d’espace',
              subtitle: 'Patient, médecin, structures, publicités…',
              onTap: () => ouvrirChoisirEspace(context),
            ),
          const LigneMisesAJour(),
        ],
      ),
    );
  }
}

/// Entrée « Mises à jour » (Android et iPhone), signalée quand une
/// nouvelle version est publiée.
class LigneMisesAJour extends ConsumerWidget {
  const LigneMisesAJour({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final etat = ref.watch(miseAJourProvider);
    if (etat.phase == PhaseMiseAJour.indisponible) return const SizedBox.shrink();
    return ApsMenuItem(
      icon: Icons.system_update_rounded,
      tone: etat.nouvelleVersion ? ApsTone.amber : ApsTone.green,
      title: 'Mises à jour',
      subtitle: sousTitreMisesAJour(etat),
      trailing: etat.nouvelleVersion ? const ApsPill('Nouveau', tone: ApsTone.amber) : null,
      onTap: () => ouvrirMisesAJour(context),
    );
  }
}

/// Icône « Changer d'espace », visible seulement avec plusieurs espaces.
class BoutonChangerEspace extends ConsumerWidget {
  const BoutonChangerEspace({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final plusieurs = (ref.watch(espacesCompteProvider).value?.length ?? 0) > 1;
    if (!plusieurs) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ApsIconButton(
        icon: Icons.swap_horiz_rounded,
        tooltip: 'Changer d’espace',
        onPressed: () => ouvrirChoisirEspace(context),
      ),
    );
  }
}

/// « Déverrouiller avec l'empreinte » : visible si l'appareil le permet.
class _LigneEmpreinte extends StatefulWidget {
  const _LigneEmpreinte();

  @override
  State<_LigneEmpreinte> createState() => _LigneEmpreinteState();
}

class _LigneEmpreinteState extends State<_LigneEmpreinte> {
  bool? _disponible;
  bool _actif = false;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<void> _charger() async {
    final disponible = await biometrieDisponible();
    final actif = await lireDeverrouillageBiometrique() ?? false;
    if (!mounted) return;
    setState(() {
      _disponible = disponible;
      _actif = actif;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_disponible != true) return const SizedBox.shrink();
    return ApsMenuItem(
      icon: Icons.fingerprint,
      title: 'Déverrouiller avec l’empreinte',
      subtitle: 'À l’ouverture de l’application, à la place du code PIN',
      showChevron: false,
      trailing: Switch(
        value: _actif,
        onChanged: (v) {
          ecrireDeverrouillageBiometrique(v);
          setState(() => _actif = v);
        },
      ),
    );
  }
}
