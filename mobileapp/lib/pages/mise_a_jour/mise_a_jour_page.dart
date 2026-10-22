// lib/pages/mise_a_jour/mise_a_jour_page.dart
//
// Espace « Mises à jour » : version installée, dernière version publiée
// (APK active du back-office) avec ses notes, téléchargement avec
// progression puis installation via l'installateur Android.
// Accès : profils (CarteConnexionCompte), accueil public, et proposition
// automatique au démarrage (VeilleMiseAJour).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/components.dart';
import '../../controllers/mise_a_jour_controller.dart';

void ouvrirMisesAJour(BuildContext context) {
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => const MiseAJourPage()));
}

String _mo(int octets) => '${(octets / 1024 / 1024).toStringAsFixed(1).replaceAll('.', ',')} Mo';

String _date(DateTime d) {
  const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  final l = d.toLocal();
  return '${l.day} ${mois[l.month - 1]} ${l.year}';
}

class MiseAJourPage extends ConsumerWidget {
  const MiseAJourPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final etat = ref.watch(miseAJourProvider);
    final controleur = ref.read(miseAJourProvider.notifier);

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.b7,
          onRefresh: controleur.verifier,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 32),
            children: [
              const ApsTopBar(title: 'Mises à jour', overline: 'APS Santé'),
              _CarteVersionInstallee(etat: etat),
              const SizedBox(height: 12),
              _CarteStatut(etat: etat, controleur: controleur),
              if (etat.erreur != null && etat.phase != PhaseMiseAJour.erreur) ...[
                const SizedBox(height: 12),
                ApsNote.text(etat.erreur!, icon: Icons.error_outline_rounded, tone: ApsTone.red),
              ],
              const SizedBox(height: 12),
              ApsNote.text(
                'Vos données, votre connexion et vos rendez-vous sont conservés pendant la mise à jour.',
                icon: Icons.verified_user_outlined,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Carte extends StatelessWidget {
  const _Carte({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ApsCard(flat: true, radius: 10, padding: const EdgeInsets.all(16), child: child);
  }
}

class _CarteVersionInstallee extends StatelessWidget {
  const _CarteVersionInstallee({required this.etat});

  final EtatMiseAJour etat;

  @override
  Widget build(BuildContext context) {
    final v = etat.installee;
    return _Carte(
      child: Row(
        children: [
          const ApsIconTile(Icons.phone_android_rounded),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Version installée', style: AppTextStyles.xs),
                const SizedBox(height: 2),
                Text(
                  v == null ? '…' : 'ApSa ${v.nom}',
                  style: AppTextStyles.strong.copyWith(fontSize: 15),
                ),
              ],
            ),
          ),
          if (v != null) ApsPill('build ${v.build}', tone: ApsTone.neutral),
        ],
      ),
    );
  }
}

class _CarteStatut extends StatelessWidget {
  const _CarteStatut({required this.etat, required this.controleur});

  final EtatMiseAJour etat;
  final MiseAJourController controleur;

  @override
  Widget build(BuildContext context) {
    switch (etat.phase) {
      case PhaseMiseAJour.indisponible:
        return const _Carte(
          child: _Entete(
            icone: Icons.store_outlined,
            ton: ApsTone.neutral,
            titre: 'Mises à jour par le store',
            texte: 'Sur cet appareil, ApSa se met à jour depuis le store de votre téléphone.',
          ),
        );
      case PhaseMiseAJour.verification:
        return const _Carte(
          child: Row(
            children: [
              SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: AppColors.b7)),
              SizedBox(width: 14),
              Expanded(child: Text('Recherche de mises à jour…', style: AppTextStyles.strong)),
            ],
          ),
        );
      case PhaseMiseAJour.erreur:
        return _Carte(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _Entete(
                icone: Icons.wifi_off_rounded,
                ton: ApsTone.red,
                titre: 'Vérification impossible',
                texte: etat.erreur ?? 'Réessayez dans quelques instants.',
              ),
              const SizedBox(height: 14),
              ApsButton(label: 'Réessayer', icon: Icons.refresh_rounded, variant: ApsButtonVariant.soft, onPressed: controleur.verifier),
            ],
          ),
        );
      case PhaseMiseAJour.aJour:
        return _Carte(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _Entete(
                icone: Icons.check_circle_outline_rounded,
                titre: 'ApSa est à jour',
                texte: 'Vous utilisez la dernière version de l’application.',
              ),
              const SizedBox(height: 14),
              ApsButton(
                label: 'Rechercher à nouveau',
                icon: Icons.refresh_rounded,
                variant: ApsButtonVariant.soft,
                onPressed: controleur.verifier,
              ),
            ],
          ),
        );
      case PhaseMiseAJour.disponible:
      case PhaseMiseAJour.telechargement:
      case PhaseMiseAJour.pret:
        return _CarteNouvelleVersion(etat: etat, controleur: controleur);
    }
  }
}

class _CarteNouvelleVersion extends StatelessWidget {
  const _CarteNouvelleVersion({required this.etat, required this.controleur});

  final EtatMiseAJour etat;
  final MiseAJourController controleur;

  @override
  Widget build(BuildContext context) {
    final v = etat.publiee!;
    final details = [
      if (v.datePublication != null) 'Publiée le ${_date(v.datePublication!)}',
      if (v.taille != null) _mo(v.taille!),
    ].join(' · ');

    return _Carte(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const ApsIconTile(Icons.system_update_rounded),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const ApsPill('Nouvelle version', dot: true),
                    const SizedBox(height: 4),
                    Text(
                      'ApSa ${v.nom ?? ''}'.trim(),
                      style: AppTextStyles.strong.copyWith(fontSize: 16),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (details.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(details, style: AppTextStyles.xs),
          ],
          if ((v.description ?? '').trim().isNotEmpty) ...[
            const ApsDivider(space: 14),
            Text('Nouveautés', style: AppTextStyles.strong),
            const SizedBox(height: 4),
            Text(v.description!.trim(), style: AppTextStyles.small),
          ],
          const SizedBox(height: 16),
          ..._actions(),
        ],
      ),
    );
  }

  List<Widget> _actions() {
    switch (etat.phase) {
      case PhaseMiseAJour.telechargement:
        final p = etat.progression;
        return [
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: p,
              minHeight: 6,
              color: AppColors.b7,
              backgroundColor: AppColors.b1,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  p == null ? 'Téléchargement… ${_mo(etat.recus)}' : 'Téléchargement… ${(p * 100).round()} %',
                  style: AppTextStyles.small,
                ),
              ),
              if (etat.total > 0) Text('${_mo(etat.recus)} / ${_mo(etat.total)}', style: AppTextStyles.xs),
            ],
          ),
          const SizedBox(height: 12),
          ApsButton(label: 'Annuler', variant: ApsButtonVariant.ghost, small: true, onPressed: controleur.annulerTelechargement),
        ];
      case PhaseMiseAJour.pret:
        return [
          if (etat.autorisationDemandee) ...[
            ApsNote.text(
              'Activez « Autoriser depuis cette source » pour APS Santé, puis revenez : l’installation reprendra.',
              bold: 'Une autorisation est nécessaire.',
              icon: Icons.admin_panel_settings_outlined,
              tone: ApsTone.amber,
            ),
            const SizedBox(height: 12),
          ],
          ApsButton(label: 'Installer la mise à jour', icon: Icons.install_mobile_rounded, onPressed: controleur.installer),
          const SizedBox(height: 8),
          Text(
            'Android vous demandera de confirmer : touchez « Mettre à jour ».',
            textAlign: TextAlign.center,
            style: AppTextStyles.xs,
          ),
        ];
      default:
        return [
          ApsButton(
            label: 'Télécharger et installer',
            icon: Icons.download_rounded,
            onPressed: controleur.telecharger,
          ),
        ];
    }
  }
}

class _Entete extends StatelessWidget {
  const _Entete({required this.icone, required this.titre, required this.texte, this.ton = ApsTone.green});

  final IconData icone;
  final String titre;
  final String texte;
  final ApsTone ton;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ApsIconTile(icone, tone: ton),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(titre, style: AppTextStyles.strong.copyWith(fontSize: 15)),
              const SizedBox(height: 2),
              Text(texte, style: AppTextStyles.small),
            ],
          ),
        ),
      ],
    );
  }
}

/// Sous-titre des entrées de menu « Mises à jour » (profils, accueil).
String sousTitreMisesAJour(EtatMiseAJour etat) {
  final installee = etat.installee?.nom;
  if (etat.nouvelleVersion) {
    final nom = etat.publiee?.nom;
    return nom == null ? 'Nouvelle version disponible' : 'Nouvelle version $nom disponible';
  }
  return installee == null ? 'Rechercher une nouvelle version' : 'Version $installee';
}
