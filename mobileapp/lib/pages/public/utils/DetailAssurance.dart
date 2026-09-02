import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../components/components.dart';
import '../../../controllers/assurance_controller.dart';
import '../../../models/assurance_models.dart';
import '../publicAcceuil.dart';
import '../Medecinpage.dart';
import '../Assurancepage.dart';

/// Écran public — **Fiche assurance** (`10 · Fiche assurance` dans la
/// maquette `ui-mobile.html`).
///
/// Détail d'une compagnie / d'un courtier d'assurance référencé sur APS :
/// en-tête (logo, badges, actions), onglets **Siège / Activités / Agences**,
/// et bloc de mise en relation toujours visible sous les onglets.
///
/// Consomme les APIs réelles du module assurance via
/// [serviceAssuranceParIdProvider] (GET /services-assurance/:id),
/// [activitesParServiceProvider] scoppé sur ce service (GET
/// /activites?service_assurance_id=...), [agencesParServiceProvider] scoppé
/// de la même façon (GET /agences?service_assurance_id=...) et
/// [creationMiseEnRelationControllerProvider] (POST
/// /mises-en-relation-assurance).
///
/// Reçue depuis [AssurancePage] (annuaire) via, par exemple :
/// ```dart
/// Navigator.push(
///   context,
///   MaterialPageRoute(
///     builder: (_) => AssuranceDetailPage(
///       serviceAssuranceId: service.serviceAssuranceId,
///     ),
///   ),
/// );
/// ```
class AssuranceDetailPage extends ConsumerStatefulWidget {
  const AssuranceDetailPage({
    super.key,
    required this.serviceAssuranceId,
    this.apercu,
    this.authToken,
  });

  /// Identifiant du service d'assurance à afficher (GET
  /// /services-assurance/:id).
  final String serviceAssuranceId;

  /// Aperçu facultatif (nom, sigle, ville, couleurs...) transmis par
  /// l'écran d'annuaire pour afficher l'en-tête immédiatement, le temps
  /// que la fiche complète se charge depuis le backend.
  final ApercuAssurance? apercu;

  /// Jeton de session de l'utilisateur connecté, requis pour envoyer une
  /// mise en relation (POST /mises-en-relation-assurance, ouverte à tout
  /// utilisateur authentifié). `null` si personne n'est connecté :
  /// l'écran reste consultable, seul le bouton d'envoi est bloqué.
  ///
  /// Transmis par [AssurancePage] via `ref.read(authTokenProvider)` (voir
  /// assurance_controller.dart). ⚠️ Si un `authTokenProvider` /
  /// AuthController global existe déjà ailleurs dans le projet, faire
  /// pointer celui d'assurance_controller.dart vers lui (ou le supprimer et
  /// importer l'existant) plutôt que de garder deux sources de vérité pour
  /// le token de session.
  final String? authToken;

  @override
  ConsumerState<AssuranceDetailPage> createState() => _AssuranceDetailPageState();
}

class _AssuranceDetailPageState extends ConsumerState<AssuranceDetailPage> {
  int _navIndex = 2; // 0=Accueil, 1=Médecin, 2=Assurance, 3=À propos
  int _tabIndex = 0; // 0=Siège, 1=Activités, 2=Agences
  final TextEditingController _messageController = TextEditingController();
  final TextEditingController _agenceSearchController = TextEditingController();
  String _rechercheAgence = '';
  bool _envoiEnCours = false;

  @override
  void initState() {
    super.initState();
    // Note : le catalogue Activités et la liste des Agences de ce service
    // sont chargés via [activitesParServiceProvider] /
    // [agencesParServiceProvider] (autoDispose.family scoppés sur
    // widget.serviceAssuranceId, voir assurance_controller.dart) — pas
    // besoin de poser/retirer un filtre global ici : chaque fiche a sa
    // propre instance, déjà filtrée dès le premier appel.
    _agenceSearchController.addListener(() {
      setState(() => _rechercheAgence = _agenceSearchController.text);
    });
  }

  @override
  void dispose() {
    _messageController.dispose();
    _agenceSearchController.dispose();
    super.dispose();
  }

  /// Gère un tap sur la barre de navigation basse : met à jour l'index actif
  /// ET navigue réellement vers l'écran correspondant (0=Accueil,
  /// 1=Médecin, 2=Assurance [annuaire], 3=À propos). Cette fiche détail
  /// n'a pas d'onglet dédié : le tap sur "Assurance" revient à l'annuaire.
  void _onBottomNavTap(int index) {
    setState(() => _navIndex = index);
    switch (index) {
      case 0: // Accueil
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const PublicAcceuilPage()),
        );
        break;
      case 1: // Médecin
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const MedecinPage()),
        );
        break;
      case 2: // Assurance — retour à l'annuaire.
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const AssurancePage()),
        );
        break;
      case 3: // À propos — aucun écran fourni pour l'instant.
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Écran « À propos » bientôt disponible.')),
        );
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final detailAsync =
    ref.watch(serviceAssuranceParIdProvider(widget.serviceAssuranceId));

    return Scaffold(
      backgroundColor: AppColors.paper,
      extendBody: true,
      appBar: AppBar(
        backgroundColor: AppColors.paper,
        elevation: 0,
        foregroundColor: AppColors.ink,
        title: const Text('Fiche assurance', style: AppTextStyles.h3),
      ),
      body: Stack(
        children: [
          _buildContent(context, detailAsync),
          Positioned(
            left: 10,
            right: 10,
            bottom: 10,
            child: AppBottomNav(
              currentIndex: _navIndex,
              onTap: _onBottomNavTap,
              onRdvPressed: () {
                // Brancher ici la navigation vers le flux de prise de RDV.
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(
      BuildContext context,
      AsyncValue<ServiceAssurance> detailAsync,
      ) {
    final activitesAsync =
    ref.watch(activitesParServiceProvider(widget.serviceAssuranceId));
    final agencesAsync =
    ref.watch(agencesParServiceProvider(widget.serviceAssuranceId));

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 110),
      children: [
        _buildHero(detailAsync),
        const SizedBox(height: 6),
        detailAsync.when(
          data: (service) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _InsTabRow(
                tabIndex: _tabIndex,
                activitesCount: activitesAsync.value?.length ?? 0,
                agencesCount: agencesAsync.value?.length ?? 0,
                onChanged: (i) => setState(() => _tabIndex = i),
              ),
              const SizedBox(height: 16),
              if (_tabIndex == 0) _buildSiegeTab(service),
              if (_tabIndex == 1) _buildActivitesTab(activitesAsync),
              if (_tabIndex == 2) _buildAgencesTab(agencesAsync),
              const SizedBox(height: 6),
              _buildContact(service),
            ],
          ),
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (_, __) => _ErrorState(
            message: 'Impossible de charger les informations de cette fiche.',
            onRetry: () => ref.invalidate(
              serviceAssuranceParIdProvider(widget.serviceAssuranceId),
            ),
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------
  // En-tête « héros »
  // ---------------------------------------------------------------
  Widget _buildHero(AsyncValue<ServiceAssurance> detailAsync) {
    return detailAsync.when(
      data: (service) {
        final couleurs =
            widget.apercu ?? _apercuDepuis(service);
        return _InsuranceHero(
          nom: service.nom,
          sigle: couleurs.sigle,
          typeActeur: service.typeActeur.libelle,
          ville: service.ville?.nom ?? '—',
          pays: service.pays?.nom ?? '—',
          agrement: service.agrement,
          verifieeAps:
          service.statutVerification == StatutVerificationAssurance.publie,
          couleurLogo: couleurs.couleurLogo,
          fondLogo: couleurs.fondLogo,
          onMiseEnRelation: () => setState(() => _tabIndex = 0),
          onAppeler: () => _appeler(service.telephone),
        );
      },
      loading: () {
        final apercu = widget.apercu;
        if (apercu == null) {
          return const SizedBox(
            height: 96,
            child: Center(child: CircularProgressIndicator()),
          );
        }
        return _InsuranceHero(
          nom: apercu.nom,
          sigle: apercu.sigle,
          typeActeur: '',
          ville: apercu.ville,
          pays: apercu.pays,
          agrement: '',
          verifieeAps: apercu.verifieeAps,
          couleurLogo: apercu.couleurLogo,
          fondLogo: apercu.fondLogo,
          onMiseEnRelation: () {},
          onAppeler: () {},
        );
      },
      error: (_, __) => _ErrorState(
        message: 'Impossible de charger cette fiche assurance.',
        onRetry: () => ref.invalidate(
          serviceAssuranceParIdProvider(widget.serviceAssuranceId),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------
  // Onglet « Siège »
  // ---------------------------------------------------------------
  Widget _buildSiegeTab(ServiceAssurance service) {
    final presentation = service.description?.trim() ?? '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InsCard(
          icon: Icons.business_outlined,
          title: 'Informations générales',
          child: Column(
            children: [
              _InsKv(label: 'Dénomination', value: service.nom),
              _InsKv(label: "Type d'acteur", value: service.typeActeur.libelle),
              _InsKv(label: 'Agrément', value: service.agrement, mono: true),
              _InsKv(
                label: 'Localisation',
                value: '${service.ville?.nom ?? '—'}, ${service.pays?.nom ?? '—'}',
              ),
              _InsKv(label: 'Téléphone', value: service.telephone, mono: true),
              _InsKv(label: 'Courriel', value: service.email, isLast: true, link: true),
            ],
          ),
        ),
        _InsCard(
          icon: Icons.info_outline,
          title: 'Présentation institutionnelle',
          child: Text(
            presentation.isNotEmpty
                ? presentation
                : 'Aucune présentation renseignée pour le moment.',
            style: AppTextStyles.body.copyWith(fontSize: 12.5, height: 1.65),
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------
  // Onglet « Activités »
  // ---------------------------------------------------------------
  Widget _buildActivitesTab(AsyncValue<List<Activite>> activitesAsync) {
    return activitesAsync.when(
      data: (activites) => _InsCard(
        icon: Icons.assignment_outlined,
        title: 'Activités & produits',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (activites.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  'Aucune activité renseignée pour le moment.',
                  style: AppTextStyles.body.copyWith(fontSize: 12),
                ),
              )
            else
              for (final activite in activites)
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    border: activite == activites.last
                        ? null
                        : const Border(bottom: BorderSide(color: AppColors.line)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(activite.titre, style: AppTextStyles.cardTitle.copyWith(fontSize: 13)),
                      const SizedBox(height: 5),
                      Text(
                        'Public cible : ${activite.publicCible}',
                        style: AppTextStyles.buttonLabel.copyWith(
                          fontSize: 11,
                          color: AppColors.green700,
                        ),
                      ),
                      if ((activite.description ?? '').trim().isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          activite.description!,
                          style: AppTextStyles.body.copyWith(fontSize: 12, height: 1.6),
                        ),
                      ],
                    ],
                  ),
                ),
            Container(
              margin: const EdgeInsets.only(top: 2),
              padding: const EdgeInsets.only(top: 12),
              decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: AppColors.line)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.info_outline, size: 12, color: AppColors.inkFaint),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      'Informations présentées à titre informatif uniquement. Aucune comparaison, '
                          'aucune souscription en ligne sur APS.',
                      style: AppTextStyles.body.copyWith(fontSize: 10.5, color: AppColors.inkFaint, height: 1.5),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (_, __) => _ErrorState(
        message: 'Impossible de charger les activités de cet assureur.',
        onRetry: () => ref.invalidate(
          activitesParServiceProvider(widget.serviceAssuranceId),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------
  // Onglet « Agences »
  // ---------------------------------------------------------------
  Widget _buildAgencesTab(AsyncValue<List<Agence>> agencesAsync) {
    return agencesAsync.when(
      data: (agences) {
        final filtrees = _rechercheAgence.trim().isEmpty
            ? agences
            : agences.where((a) {
          final q = _rechercheAgence.toLowerCase();
          return a.libelle.toLowerCase().contains(q) ||
              a.localisation.toLowerCase().contains(q);
        }).toList();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(
                color: AppColors.card,
                border: Border.all(color: AppColors.line),
                borderRadius: BorderRadius.circular(18),
                boxShadow: AppColors.shadowCard,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.location_searching, size: 14, color: AppColors.inkSoft),
                      const SizedBox(width: 8),
                      Text('Rechercher une agence', style: AppTextStyles.cardTitle.copyWith(fontSize: 12.5)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Localisation',
                    style: AppTextStyles.buttonLabel.copyWith(fontSize: 11, color: AppColors.inkSoft),
                  ),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: AppColors.paper,
                      border: Border.all(color: AppColors.lineStrong),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.search, size: 16, color: AppColors.inkFaint),
                        const SizedBox(width: 9),
                        Expanded(
                          child: TextField(
                            controller: _agenceSearchController,
                            style: AppTextStyles.body.copyWith(fontSize: 12.5, color: AppColors.ink),
                            decoration: InputDecoration(
                              isDense: true,
                              border: InputBorder.none,
                              hintText: 'Ville, quartier…',
                              hintStyle: AppTextStyles.body.copyWith(fontSize: 12.5),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () {
                        // Brancher ici la géolocalisation utilisateur pour
                        // trier `agences` par proximité (ex: via `Agence.gps`).
                      },
                      icon: const Icon(Icons.my_location, size: 13, color: AppColors.ink),
                      label: Text(
                        'Agences les plus proches de moi',
                        style: AppTextStyles.buttonLabel.copyWith(fontSize: 11.5, color: AppColors.ink),
                      ),
                      style: OutlinedButton.styleFrom(
                        backgroundColor: AppColors.card,
                        side: const BorderSide(color: AppColors.lineStrong),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (filtrees.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  agences.isEmpty
                      ? 'Aucune agence renseignée pour le moment.'
                      : 'Aucune agence ne correspond à cette recherche.',
                  style: AppTextStyles.body.copyWith(fontSize: 12),
                ),
              )
            else
              for (final agence in filtrees)
                Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(13),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    border: Border.all(color: AppColors.line),
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: AppColors.shadowCard,
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: AppColors.primaryLight,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        alignment: Alignment.center,
                        child: const Icon(Icons.business_outlined, size: 19, color: AppColors.primary),
                      ),
                      const SizedBox(width: 11),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(agence.libelle, style: AppTextStyles.cardTitle.copyWith(fontSize: 13)),
                            const SizedBox(height: 3),
                            Row(
                              children: [
                                const Icon(Icons.place_outlined, size: 11, color: AppColors.inkFaint),
                                const SizedBox(width: 4),
                                Expanded(
                                  child: Text(
                                    agence.localisation,
                                    style: AppTextStyles.cardMeta.copyWith(fontSize: 11),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      InkWell(
                        onTap: () => _appeler(agence.contact),
                        borderRadius: BorderRadius.circular(10),
                        child: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: AppColors.card,
                            border: Border.all(color: AppColors.lineStrong),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          alignment: Alignment.center,
                          child: const Icon(Icons.call_outlined, size: 15, color: AppColors.primary),
                        ),
                      ),
                    ],
                  ),
                ),
          ],
        );
      },
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (_, __) => _ErrorState(
        message: 'Impossible de charger les agences de cet assureur.',
        onRetry: () => ref.invalidate(
          agencesParServiceProvider(widget.serviceAssuranceId),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------
  // Mise en relation — toujours visible sous les onglets
  // ---------------------------------------------------------------
  Widget _buildContact(ServiceAssurance service) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(18),
        boxShadow: AppColors.shadowCard,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.forum_outlined, size: 14, color: AppColors.green700),
              const SizedBox(width: 8),
              Text('Mise en relation', style: AppTextStyles.cardTitle.copyWith(fontSize: 13)),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Votre message',
            style: AppTextStyles.buttonLabel.copyWith(fontSize: 11.5, color: AppColors.ink),
          ),
          const SizedBox(height: 7),
          TextField(
            controller: _messageController,
            minLines: 3,
            maxLines: 5,
            enabled: !_envoiEnCours,
            style: AppTextStyles.body.copyWith(fontSize: 12.5, color: AppColors.ink),
            decoration: InputDecoration(
              hintText: 'Décrivez votre besoin…',
              hintStyle: AppTextStyles.body.copyWith(fontSize: 12.5),
              contentPadding: const EdgeInsets.all(10),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.lineStrong),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.lineStrong),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.green500),
              ),
            ),
          ),
          const SizedBox(height: 12),
          PrimaryButton(
            label: _envoiEnCours ? 'Envoi en cours…' : 'Envoyer la demande',
            icon: Icons.send_outlined,
            onPressed: () {
              if (_envoiEnCours) return;
              _envoyerDemande(service);
            },
          ),
          const SizedBox(height: 11),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.info_outline, size: 12, color: AppColors.inkFaint),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  'La demande est adressée directement au siège de ${service.nom}. '
                      "Aucune souscription n'est effectuée sur APS.",
                  style: AppTextStyles.body.copyWith(fontSize: 10.5, color: AppColors.inkFaint, height: 1.5),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _envoyerDemande(ServiceAssurance service) async {
    final message = _messageController.text.trim();
    if (message.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Décrivez votre besoin avant d\'envoyer la demande.')),
      );
      return;
    }
    final token = widget.authToken;
    if (token == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Connectez-vous pour contacter cet assureur.')),
      );
      return;
    }

    setState(() => _envoiEnCours = true);
    try {
      await ref.read(creationMiseEnRelationControllerProvider.notifier).soumettre(
        requete: MiseEnRelationCreationRequete(
          serviceAssuranceId: service.serviceAssuranceId,
          message: message,
        ),
        token: token,
      );
      if (!mounted) return;
      _messageController.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Votre demande a bien été envoyée.')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Une erreur est survenue lors de l'envoi. Réessayez.")),
      );
    } finally {
      if (mounted) setState(() => _envoiEnCours = false);
    }
  }

  void _appeler(String numero) {
    if (numero.trim().isEmpty) return;
    // TODO: brancher un appel réel, ex. avec le package url_launcher :
    // launchUrl(Uri(scheme: 'tel', path: numero));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Appeler $numero')),
    );
  }
}

/// Aperçu minimal d'une fiche assurance, transmis par [AssurancePage] à
/// [AssuranceDetailPage] pour afficher l'en-tête sans attendre la réponse
/// de GET /services-assurance/:id.
class ApercuAssurance {
  const ApercuAssurance({
    required this.nom,
    required this.sigle,
    required this.ville,
    required this.pays,
    required this.verifieeAps,
    required this.couleurLogo,
    required this.fondLogo,
  });

  final String nom;
  final String sigle;
  final String ville;
  final String pays;
  final bool verifieeAps;
  final Color couleurLogo;
  final Color fondLogo;
}

/// Aperçu de secours reconstruit depuis la fiche complète une fois
/// chargée, pour garder une signature unique dans [_buildHero].
ApercuAssurance _apercuDepuis(ServiceAssurance service) {
  final couleurs = _paletteLogos[
  service.serviceAssuranceId.hashCode.abs() % _paletteLogos.length];
  return ApercuAssurance(
    nom: service.nom,
    sigle: _sigleAssurance(service.nom),
    ville: service.ville?.nom ?? '',
    pays: service.pays?.nom ?? '',
    verifieeAps: service.statutVerification == StatutVerificationAssurance.publie,
    couleurLogo: couleurs.logo,
    fondLogo: couleurs.fond,
  );
}

/// Deux premières initiales du nom — même règle que côté annuaire
/// ([AssurancePage]).
String _sigleAssurance(String nom) {
  final mots =
  nom.trim().split(RegExp(r'\s+')).where((m) => m.isNotEmpty).toList();
  if (mots.isEmpty) return '?';
  if (mots.length == 1) {
    final mot = mots.first;
    return mot.substring(0, mot.length >= 2 ? 2 : 1).toUpperCase();
  }
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

class _PaletteCouleur {
  const _PaletteCouleur(this.logo, this.fond);
  final Color logo;
  final Color fond;
}

const List<_PaletteCouleur> _paletteLogos = [
  _PaletteCouleur(Color(0xFF0B2C9E), Color(0xFFEDF1FB)),
  _PaletteCouleur(Color(0xFF6B2E8F), Color(0xFFF1E9F7)),
  _PaletteCouleur(Color(0xFF1E8A63), Color(0xFFE4F3EC)),
  _PaletteCouleur(Color(0xFFC94E3A), Color(0xFFFBE7E2)),
  _PaletteCouleur(Color(0xFF9A6A1D), Color(0xFFF6ECDD)),
  _PaletteCouleur(Color(0xFF1F6F8B), Color(0xFFE3F1F5)),
];

/// Rangée d'onglets — `.ins-tab-row` / `.ins-tab` / `.ins-tab.active`.
class _InsTabRow extends StatelessWidget {
  const _InsTabRow({
    required this.tabIndex,
    required this.activitesCount,
    required this.agencesCount,
    required this.onChanged,
  });

  final int tabIndex;
  final int activitesCount;
  final int agencesCount;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final labels = ['Siège', 'Activités ($activitesCount)', 'Agences ($agencesCount)'];

    return Container(
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++)
            Padding(
              padding: const EdgeInsets.only(right: 18),
              child: GestureDetector(
                onTap: () => onChanged(i),
                child: Container(
                  padding: const EdgeInsets.only(bottom: 10),
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        color: tabIndex == i ? AppColors.green700 : Colors.transparent,
                        width: 2,
                      ),
                    ),
                  ),
                  child: Text(
                    labels[i],
                    style: AppTextStyles.buttonLabel.copyWith(
                      fontSize: 12.5,
                      color: tabIndex == i ? AppColors.green700 : AppColors.inkFaint,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Carte générique de section — `.ins-card`.
class _InsCard extends StatelessWidget {
  const _InsCard({required this.icon, required this.title, required this.child});

  final IconData icon;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(18),
        boxShadow: AppColors.shadowCard,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: AppColors.green100,
                  borderRadius: BorderRadius.circular(7),
                ),
                alignment: Alignment.center,
                child: Icon(icon, size: 13, color: AppColors.green700),
              ),
              const SizedBox(width: 8),
              Text(title, style: AppTextStyles.cardTitle.copyWith(fontSize: 13)),
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

/// Ligne clé/valeur — `.ins-kv`.
class _InsKv extends StatelessWidget {
  const _InsKv({
    required this.label,
    required this.value,
    this.mono = false,
    this.link = false,
    this.isLast = false,
  });

  final String label;
  final String value;
  final bool mono;
  final bool link;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 9),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : const Border(bottom: BorderSide(color: AppColors.line, width: 1)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: AppTextStyles.buttonLabel.copyWith(fontSize: 11.5, color: AppColors.inkFaint),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: (mono ? AppTextStyles.price : AppTextStyles.cardTitle).copyWith(
                fontSize: 12.5,
                color: link ? AppColors.green700 : AppColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// En-tête « héros » de la fiche — `.ins-hero`.
class _InsuranceHero extends StatelessWidget {
  const _InsuranceHero({
    required this.nom,
    required this.sigle,
    required this.typeActeur,
    required this.ville,
    required this.pays,
    required this.agrement,
    required this.verifieeAps,
    required this.couleurLogo,
    required this.fondLogo,
    required this.onMiseEnRelation,
    required this.onAppeler,
  });

  final String nom;
  final String sigle;
  final String typeActeur;
  final String ville;
  final String pays;
  final String agrement;
  final bool verifieeAps;
  final Color couleurLogo;
  final Color fondLogo;
  final VoidCallback onMiseEnRelation;
  final VoidCallback onAppeler;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.green50,
        border: Border.all(color: AppColors.green100),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(color: fondLogo, borderRadius: BorderRadius.circular(14)),
                alignment: Alignment.center,
                child: Text(
                  sigle,
                  style: TextStyle(
                    fontFamily: AppTextStyles.fontDisplay,
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: couleurLogo,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(nom, style: AppTextStyles.cardTitle.copyWith(fontSize: 17)),
                    const SizedBox(height: 3),
                    if (typeActeur.isNotEmpty)
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '$typeActeur · ',
                              style: AppTextStyles.cardMeta.copyWith(fontSize: 11.5),
                              overflow: TextOverflow.visible,
                            ),
                          ),
                        ],
                      ),
                    Row(
                      children: [
                        const Icon(Icons.place_outlined, size: 12, color: AppColors.inkFaint),
                        const SizedBox(width: 5),
                        Expanded(
                          child: Text(
                            '$ville, $pays',
                            style: AppTextStyles.cardMeta.copyWith(fontSize: 11.5),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        if (verifieeAps)
                          const BadgeChip(
                            label: 'Vérifiée APS',
                            style: BadgeChipStyle.green,
                            icon: Icons.verified_outlined,
                          ),
                        if (agrement.isNotEmpty)
                          BadgeChip(label: agrement, style: BadgeChipStyle.outline, mono: true),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: onMiseEnRelation,
                  icon: const Icon(Icons.forum_outlined, size: 14, color: Colors.white),
                  label: Text('Mise en relation', style: AppTextStyles.buttonLabel.copyWith(fontSize: 13)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(vertical: 11),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              InkWell(
                onTap: onAppeler,
                borderRadius: BorderRadius.circular(11),
                child: Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: AppColors.lineStrong),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  alignment: Alignment.center,
                  child: const Icon(Icons.call_outlined, size: 16, color: AppColors.inkSoft),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// État d'erreur réseau/API — mêmes codes couleur que le reste de l'écran.
class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
      alignment: Alignment.center,
      child: Column(
        children: [
          const Icon(Icons.wifi_off_rounded, size: 30, color: AppColors.inkFaint),
          const SizedBox(height: 10),
          Text(
            message,
            textAlign: TextAlign.center,
            style: AppTextStyles.cardTitle.copyWith(fontSize: 13.5),
          ),
          const SizedBox(height: 12),
          AppOutlineButton(label: 'Réessayer', onPressed: onRetry, icon: Icons.refresh),
        ],
      ),
    );
  }
}