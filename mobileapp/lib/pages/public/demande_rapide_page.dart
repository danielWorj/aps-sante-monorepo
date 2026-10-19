// lib/pages/public/demande_rapide_page.dart
//
// RDV ALÉATOIRE — écran PUBLIC « Demande rapide » (pendant mobile de
// client-plateform/src/pages/DemandeRapide.jsx).
//
// Ouvert à tous, comme la prise de RDV avec un médecin précis
// (Rendezvous.dart) : le visiteur décrit son besoin (spécialité, ville,
// jour, heure, type, motif) puis, s'il n'est pas connecté :
//   - soit il crée son compte patient dans le même formulaire ;
//   - soit il touche « J'ai déjà un compte » : une feuille de connexion
//     (e-mail + mot de passe) l'identifie sans quitter l'écran.
// La demande est publiée sous ce compte, puis le patient arrive sur
// l'onglet « Demande » de son espace pour suivre les réponses.
//
// Jour et heure sont ceux de la ville choisie : le serveur les convertit
// dans le fuseau de son pays (et vérifie le délai minimum de 2 h).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/alert/app_alert.dart';
import '../../components/style/colors.dart';
import '../../components/style/text_styles.dart';
import '../../components/ui/aps_ui.dart';
import '../../controllers/authentification_controller.dart';
import '../../controllers/medecin_controller.dart';
import '../../controllers/offre_rdv_controller.dart';
import '../../controllers/referentiel_controller.dart';
import '../../models/authentification_models.dart';
import '../../models/offre_rdv_models.dart';
import '../../models/referentiel_models.dart';
import '../../utils/fonds.dart' show jourLongLocal;
import '../portails/patient/patient_home_shell.dart';

String _deuxChiffres(int n) => n.toString().padLeft(2, '0');

String _jourIso(DateTime d) => '${d.year}-${_deuxChiffres(d.month)}-${_deuxChiffres(d.day)}';

class DemandeRapidePage extends ConsumerStatefulWidget {
  const DemandeRapidePage({super.key});

  @override
  ConsumerState<DemandeRapidePage> createState() => _DemandeRapidePageState();
}

class _DemandeRapidePageState extends ConsumerState<DemandeRapidePage> {
  final _formKey = GlobalKey<FormState>();

  // Besoin
  String? _specialiteId;
  String? _paysId;
  String? _villeId;
  DateTime? _jour;
  TimeOfDay? _heure;
  TypeRdvOffre _type = TypeRdvOffre.physique;
  final _motif = TextEditingController();

  // Compte patient à créer (visiteur non connecté)
  final _prenom = TextEditingController();
  final _nom = TextEditingController();
  final _email = TextEditingController();
  final _telephone = TextEditingController();
  final _motDePasse = TextEditingController();
  DateTime? _dateNaissance;
  bool _masquerMotDePasse = true;

  bool _envoi = false;
  String? _erreur;

  @override
  void dispose() {
    for (final c in [_motif, _prenom, _nom, _email, _telephone, _motDePasse]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _choisirJour() async {
    final maintenant = DateTime.now();
    final choix = await showDatePicker(
      context: context,
      initialDate: _jour ?? maintenant,
      firstDate: DateTime(maintenant.year, maintenant.month, maintenant.day),
      lastDate: maintenant.add(const Duration(days: 60)),
    );
    if (choix != null) setState(() => _jour = choix);
  }

  Future<void> _choisirHeure() async {
    final choix = await showTimePicker(
      context: context,
      initialTime: _heure ?? const TimeOfDay(hour: 9, minute: 0),
    );
    if (choix != null) setState(() => _heure = choix);
  }

  Future<void> _choisirNaissance() async {
    final maintenant = DateTime.now();
    final choix = await showDatePicker(
      context: context,
      initialDate: _dateNaissance ?? DateTime(maintenant.year - 30),
      firstDate: DateTime(1900),
      lastDate: maintenant,
    );
    if (choix != null) setState(() => _dateNaissance = choix);
  }

  Future<void> _publier({required bool connecte, required String? paysId}) async {
    final jour = _jour;
    final heure = _heure;
    if (_specialiteId == null || _villeId == null || jour == null || heure == null) {
      setState(() => _erreur = "Choisissez la spécialité, la ville, le jour et l'heure.");
      return;
    }
    if (!connecte) {
      if (!(_formKey.currentState?.validate() ?? false)) return;
      if (_dateNaissance == null) {
        setState(() => _erreur = 'Renseignez votre date de naissance.');
        return;
      }
      if (paysId == null) {
        setState(() => _erreur = 'Choisissez votre pays.');
        return;
      }
    }
    setState(() {
      _envoi = true;
      _erreur = null;
    });
    final session = ref.read(sessionControllerProvider.notifier);
    try {
      if (!connecte) {
        // Même enchaînement que Rendezvous.dart : inscription puis session.
        final email = _email.text.trim();
        await ref.read(authentificationRepositoryProvider).inscrire(InscriptionPayload(
              nom: _nom.text.trim(),
              prenom: _prenom.text.trim(),
              email: email,
              telephone: _telephone.text.trim().isEmpty ? null : _telephone.text.trim(),
              motDePasse: _motDePasse.text,
              paysId: paysId!,
              dateNaissance: _dateNaissance!,
            ));
        final resultat = await session.connecter(ConnexionPayload(email: email, motDePasse: _motDePasse.text));
        if (!resultat.sessionOuverte) {
          throw const ErreurAuthentification(
            codeHttp: 0,
            message: 'Compte créé, mais connexion automatique impossible : connectez-vous puis réessayez.',
          );
        }
      }
      final repo = ref.read(offreRdvRepositoryProvider);
      final notifies = await session.appelAuthentifie(
        (token) => repo.publier(
          token: token,
          specialiteId: _specialiteId!,
          villeId: _villeId!,
          typeRdv: _type,
          jour: _jourIso(jour),
          heure: '${_deuxChiffres(heure.hour)}:${_deuxChiffres(heure.minute)}',
          motif: _motif.text,
        ),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(notifies > 0
            ? 'Demande publiée : $notifies médecin(s) prévenu(s).'
            : "Demande publiée. Aucun médecin n'est encore inscrit pour ces critères."),
      ));
      ref.invalidate(mesOffresRdvProvider);
      Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => const PatientHomeShell(ongletInitial: PatientHomeShell.indexDemandes),
      ));
    } catch (e) {
      // Inscription réussie mais publication refusée (ex. heure trop
      // proche) : le compte est connecté, le visiteur corrige et republie.
      if (mounted) setState(() => _erreur = e is ErreurAuthentification ? e.message : '$e');
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Future<void> _ouvrirConnexion() async {
    final role = await showModalBottomSheet<RoleUtilisateur>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(14))),
      builder: (_) => const _FeuilleConnexion(),
    );
    if (!mounted || role == null) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(role == RoleUtilisateur.patient
          ? 'Vous êtes connecté : votre demande sera publiée avec ce compte.'
          : 'Ce compte ne peut pas faire de demande : connectez-vous avec un compte patient.'),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final sessionAsync = ref.watch(sessionControllerProvider);
    final utilisateur = ref.watch(authUtilisateurProvider);
    final connecte = utilisateur != null;
    final estPatient = utilisateur?.role == RoleUtilisateur.patient;

    final specialites = ref.watch(listeSpecialitesControllerProvider).value ?? const [];
    final List<Pays> pays = ref.watch(listePaysProvider).value ?? const [];
    final paysId = _paysId ?? utilisateur?.paysId ?? (pays.isNotEmpty ? pays.first.paysId : null);
    final List<Ville> villes =
        paysId == null ? const [] : (ref.watch(villesParPaysProvider(paysId)).value ?? const []);
    final villeNom = villes.where((v) => v.villeId == _villeId).map((v) => v.nom).firstOrNull;

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 32),
            children: [
              const ApsTopBar(title: 'Demande rapide', overline: 'Rendez-vous'),
              ApsNote.text(
                "Indiquez la spécialité, la ville, le jour et l'heure. Les médecins disponibles "
                'vous répondent avec leur tarif ; vous validez celui qui vous convient, puis vous payez.',
                icon: Icons.campaign_outlined,
                tone: ApsTone.violet,
              ),
              const SizedBox(height: 14),
              if (connecte && !estPatient) ...[
                ApsNote.text(
                  'Vous êtes connecté avec un compte qui n\'est pas un compte patient. '
                  'Déconnectez-vous pour faire une demande.',
                  tone: ApsTone.amber,
                ),
                const SizedBox(height: 8),
                ApsButton(
                  label: 'Se déconnecter',
                  icon: Icons.logout_rounded,
                  variant: ApsButtonVariant.ghost,
                  onPressed: () => ref.read(sessionControllerProvider.notifier).deconnecter(),
                ),
                const SizedBox(height: 14),
              ],

              /* ---------------------------- Besoin ---------------------------- */
              const ApsSectionTitle('Votre besoin'),
              DropdownButtonFormField<String>(
                initialValue: _specialiteId,
                isExpanded: true,
                decoration: _deco('Spécialité', Icons.medical_services_outlined),
                items: [
                  for (final s in specialites)
                    DropdownMenuItem(value: s.specialiteId, child: Text(s.nom, overflow: TextOverflow.ellipsis)),
                ],
                onChanged: (v) => setState(() => _specialiteId = v),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                key: ValueKey('pays-$paysId'),
                initialValue: paysId,
                isExpanded: true,
                decoration: _deco('Pays', Icons.public_outlined),
                items: [
                  for (final p in pays) DropdownMenuItem(value: p.paysId, child: Text(p.nom)),
                ],
                onChanged: (v) => setState(() {
                  _paysId = v;
                  _villeId = null;
                }),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                key: ValueKey('ville-$paysId'),
                initialValue: villes.any((v) => v.villeId == _villeId) ? _villeId : null,
                isExpanded: true,
                decoration: _deco('Ville', Icons.location_on_outlined),
                items: [
                  for (final v in villes) DropdownMenuItem(value: v.villeId, child: Text(v.nom)),
                ],
                onChanged: (v) => setState(() => _villeId = v),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _ChampChoix(
                      icone: Icons.calendar_today_outlined,
                      titre: 'Jour',
                      libelle: _jour == null ? null : jourLongLocal(_jour!),
                      onTap: _choisirJour,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _ChampChoix(
                      icone: Icons.schedule_outlined,
                      titre: villeNom == null ? 'Heure' : 'Heure de $villeNom',
                      libelle: _heure == null
                          ? null
                          : '${_deuxChiffres(_heure!.hour)}:${_deuxChiffres(_heure!.minute)}',
                      onTap: _choisirHeure,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              ApsSegmented<TypeRdvOffre>(
                value: _type,
                onChanged: (t) => setState(() => _type = t),
                segments: [
                  for (final t in TypeRdvOffre.values)
                    ApsSegment(
                      t,
                      t == TypeRdvOffre.teleconsultation ? 'En vidéo' : 'Au cabinet',
                      icon: t == TypeRdvOffre.teleconsultation ? Icons.videocam_outlined : Icons.local_hospital_outlined,
                    ),
                ],
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _motif,
                maxLength: 1000,
                minLines: 2,
                maxLines: 4,
                decoration: _deco('Motif (facultatif)', null).copyWith(
                  helperText: 'Visible par les médecins de la spécialité, sans votre nom.',
                ),
              ),

              /* ---------------------------- Compte ---------------------------- */
              if (sessionAsync.isLoading && !connecte)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (estPatient)
                _RecapCompte(utilisateur: utilisateur!)
              else if (!connecte) ...[
                const SizedBox(height: 6),
                const ApsSectionTitle('Créez votre compte patient'),
                Text(
                  'Il servira à suivre les réponses des médecins, valider celui de votre choix et payer.',
                  style: AppTextStyles.small.copyWith(color: AppColors.ink3),
                ),
                const SizedBox(height: 10),
                ApsButton(
                  label: "J'ai déjà un compte",
                  icon: Icons.login_rounded,
                  variant: ApsButtonVariant.soft,
                  small: true,
                  onPressed: _ouvrirConnexion,
                ),
                const SizedBox(height: 12),
                _champ(_prenom, 'Prénom', Icons.person_outline),
                _champ(_nom, 'Nom', Icons.badge_outlined),
                _champ(
                  _email,
                  'E-mail',
                  Icons.mail_outline,
                  clavier: TextInputType.emailAddress,
                  validation: (v) => RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v.trim()) ? null : 'E-mail invalide',
                ),
                _champ(_telephone, 'Téléphone (facultatif)', Icons.phone_outlined,
                    clavier: TextInputType.phone, obligatoire: false),
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: TextFormField(
                    controller: _motDePasse,
                    obscureText: _masquerMotDePasse,
                    decoration: _deco('Mot de passe (8 caractères min.)', Icons.lock_outline).copyWith(
                      suffixIcon: IconButton(
                        icon: Icon(_masquerMotDePasse ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                        onPressed: () => setState(() => _masquerMotDePasse = !_masquerMotDePasse),
                      ),
                    ),
                    validator: (v) => (v ?? '').length < 8 ? '8 caractères minimum' : null,
                  ),
                ),
                _ChampChoix(
                  icone: Icons.cake_outlined,
                  titre: 'Date de naissance',
                  libelle: _dateNaissance == null
                      ? null
                      : '${_deuxChiffres(_dateNaissance!.day)}/${_deuxChiffres(_dateNaissance!.month)}/${_dateNaissance!.year}',
                  onTap: _choisirNaissance,
                ),
                const SizedBox(height: 6),
                Text(
                  'Pays de résidence : celui choisi plus haut.',
                  style: AppTextStyles.xs.copyWith(color: AppColors.ink3),
                ),
              ],

              if (_erreur != null) ...[
                const SizedBox(height: 10),
                AppAlert(type: AppAlertType.danger, message: _erreur!),
              ],
              const SizedBox(height: 14),
              ApsButton(
                label: connecte ? 'Publier ma demande' : 'Créer mon compte et publier',
                icon: Icons.send_outlined,
                variant: ApsButtonVariant.violet,
                loading: _envoi,
                onPressed: (connecte && !estPatient) ? null : () => _publier(connecte: connecte, paysId: paysId),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _champ(
    TextEditingController c,
    String libelle,
    IconData icone, {
    TextInputType? clavier,
    bool obligatoire = true,
    String? Function(String)? validation,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextFormField(
        controller: c,
        keyboardType: clavier,
        decoration: _deco(libelle, icone),
        validator: (v) {
          final t = v ?? '';
          if (obligatoire && t.trim().isEmpty) return 'Champ requis';
          return validation == null || t.trim().isEmpty ? null : validation(t);
        },
      ),
    );
  }
}

InputDecoration _deco(String libelle, IconData? icone) => InputDecoration(
      labelText: libelle,
      prefixIcon: icone == null ? null : Icon(icone, size: 18, color: AppColors.violet700),
    );

/// Compte patient connecté : la demande sera publiée avec lui.
class _RecapCompte extends ConsumerWidget {
  const _RecapCompte({required this.utilisateur});

  final Utilisateur utilisateur;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: ApsCard(
        child: Row(
          children: [
            const Icon(Icons.verified_user_outlined, color: AppColors.violet700),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${utilisateur.prenom} ${utilisateur.nom}'.trim(), style: AppTextStyles.strong),
                  Text(utilisateur.email, style: AppTextStyles.small.copyWith(color: AppColors.ink3)),
                ],
              ),
            ),
            TextButton(
              onPressed: () => ref.read(sessionControllerProvider.notifier).deconnecter(),
              child: const Text("Ce n'est pas moi"),
            ),
          ],
        ),
      ),
    );
  }
}

/// « J'ai déjà un compte » : e-mail + mot de passe, la session est ouverte
/// sans quitter l'écran. Renvoie le rôle du compte connecté.
class _FeuilleConnexion extends ConsumerStatefulWidget {
  const _FeuilleConnexion();

  @override
  ConsumerState<_FeuilleConnexion> createState() => _FeuilleConnexionState();
}

class _FeuilleConnexionState extends ConsumerState<_FeuilleConnexion> {
  final _email = TextEditingController();
  final _motDePasse = TextEditingController();
  bool _masquer = true;
  bool _envoi = false;
  String? _erreur;

  @override
  void dispose() {
    _email.dispose();
    _motDePasse.dispose();
    super.dispose();
  }

  Future<void> _connecter() async {
    final email = _email.text.trim();
    if (email.isEmpty || _motDePasse.text.isEmpty) {
      setState(() => _erreur = 'Renseignez votre e-mail et votre mot de passe.');
      return;
    }
    setState(() {
      _envoi = true;
      _erreur = null;
    });
    try {
      final resultat = await ref
          .read(sessionControllerProvider.notifier)
          .connecter(ConnexionPayload(email: email, motDePasse: _motDePasse.text));
      if (!mounted) return;
      if (!resultat.sessionOuverte) {
        setState(() => _erreur =
            'Votre mot de passe est temporaire : connectez-vous depuis « Mon espace » pour le changer, puis revenez.');
        return;
      }
      Navigator.of(context).pop(resultat.utilisateur?.role);
    } catch (e) {
      if (mounted) {
        setState(() => _erreur = e is ErreurAuthentification && e.codeHttp == 401
            ? 'E-mail ou mot de passe incorrect.'
            : (e is ErreurAuthentification ? e.message : '$e'));
      }
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 0, 18, 18 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ApsSheetHeader(title: 'Connectez-vous', onClose: () => Navigator.of(context).pop()),
          Text(
            'Votre demande sera publiée avec ce compte, sans rien ressaisir.',
            style: AppTextStyles.small.copyWith(color: AppColors.ink3),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofocus: true,
            decoration: _deco('E-mail', Icons.mail_outline),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _motDePasse,
            obscureText: _masquer,
            onSubmitted: (_) => _connecter(),
            decoration: _deco('Mot de passe', Icons.lock_outline).copyWith(
              suffixIcon: IconButton(
                icon: Icon(_masquer ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                onPressed: () => setState(() => _masquer = !_masquer),
              ),
            ),
          ),
          if (_erreur != null) ...[
            const SizedBox(height: 10),
            AppAlert(type: AppAlertType.danger, message: _erreur!),
          ],
          const SizedBox(height: 14),
          ApsButton(
            label: 'Se connecter et continuer',
            icon: Icons.login_rounded,
            variant: ApsButtonVariant.violet,
            loading: _envoi,
            onPressed: _connecter,
          ),
        ],
      ),
    );
  }
}

/// Champ « Jour » / « Heure » au format `.field` (libellé au-dessus).
class _ChampChoix extends StatelessWidget {
  final IconData icone;
  final String titre;
  final String? libelle;
  final VoidCallback onTap;

  const _ChampChoix({required this.icone, required this.titre, required this.libelle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(12);
    return Material(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(borderRadius: r, side: const BorderSide(color: AppColors.line, width: 1.5)),
      child: InkWell(
        onTap: onTap,
        borderRadius: r,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 9, 12, 10),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(titre, style: AppTextStyles.xs.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(
                      libelle ?? 'Choisir',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: libelle == null
                          ? AppTextStyles.small.copyWith(color: AppColors.ink4)
                          : AppTextStyles.strong.copyWith(fontSize: 14.5),
                    ),
                  ],
                ),
              ),
              Icon(icone, size: 17, color: AppColors.ink3),
            ],
          ),
        ),
      ),
    );
  }
}
