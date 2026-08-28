import 'package:flutter/material.dart';
import '../../../components/components.dart';

/// Écran public — **Fiche assurance** (`10 · Fiche assurance` dans la
/// maquette `ui-mobile.html`).
///
/// Détail d'une compagnie / d'un courtier d'assurance référencé sur APS :
/// en-tête (logo, badges, actions), onglets **Siège / Activités / Agences**,
/// et bloc de mise en relation toujours visible sous les onglets.
///
/// Reçue depuis [AssurancePage] (annuaire) via, par exemple :
/// ```dart
/// Navigator.push(
///   context,
///   MaterialPageRoute(
///     builder: (_) => AssuranceDetailPage(
///       nom: 'AXA',
///       sigle: 'AXA',
///       // ...
///     ),
///   ),
/// );
/// ```
class AssuranceDetailPage extends StatefulWidget {
  const AssuranceDetailPage({
    super.key,
    this.nom = 'AXA',
    this.sigle = 'AXA',
    this.typeActeur = "Compagnie d'assurance",
    this.ville = 'Douala',
    this.pays = 'Cameroun',
    this.agrement = 'RCM-07MEICOM',
    this.telephoneSiege = '678453245',
    this.email = 'axamsg@gmail.com',
    this.verifieeAps = true,
    this.couleurLogo = const Color(0xFF0B2C9E),
    this.fondLogo = const Color(0xFFEDF1FB),
    this.presentation =
    "AXA Assurance est l'un des leaders mondiaux de l'assurance et de la gestion d'actifs, offrant des solutions de protection pour les particuliers et les entreprises. Le groupe propose une large gamme de produits en assurance auto, habitation, santé, prévoyance et épargne.",
    this.activites = const [
      InsuranceActivity(
        titre: 'Assurances Santé',
        cible: 'Malades chroniques',
        description: 'Assurance pour les maladies chroniques jusqu\'à 25 ans.',
      ),
      InsuranceActivity(
        titre: 'Assurances Scolaire',
        cible: 'Parents',
        description:
        "Assurance pour les études des enfants de la maternelle à l'enseignement supérieur.",
      ),
    ],
    this.agences = const [
      InsuranceAgency(nom: 'AXA BONABERI', localisation: 'Bonaberi, Douala'),
      InsuranceAgency(nom: 'AXA DAMAS', localisation: 'Damas, Douala'),
    ],
    this.onAppelerSiege,
    this.onEnvoyerDemande,
    this.onAppelerAgence,
    this.onLocaliserAgencesProches,
  });

  final String nom;
  final String sigle;
  final String typeActeur;
  final String ville;
  final String pays;
  final String agrement;
  final String telephoneSiege;
  final String email;
  final bool verifieeAps;
  final Color couleurLogo;
  final Color fondLogo;
  final String presentation;
  final List<InsuranceActivity> activites;
  final List<InsuranceAgency> agences;

  /// Appelé quand l'utilisateur tape sur le bouton téléphone du siège.
  final VoidCallback? onAppelerSiege;

  /// Appelé avec le message saisi lorsque « Envoyer la demande » est tapé.
  final ValueChanged<String>? onEnvoyerDemande;

  /// Appelé quand l'utilisateur tape sur le bouton d'appel d'une agence.
  final ValueChanged<InsuranceAgency>? onAppelerAgence;

  /// Appelé quand l'utilisateur tape sur « Agences les plus proches de moi ».
  final VoidCallback? onLocaliserAgencesProches;

  @override
  State<AssuranceDetailPage> createState() => _AssuranceDetailPageState();
}

class _AssuranceDetailPageState extends State<AssuranceDetailPage> {
  int _navIndex = 2; // 0=Accueil, 1=Médecin, 2=Assurance, 3=À propos
  int _tabIndex = 0; // 0=Siège, 1=Activités, 2=Agences
  final TextEditingController _messageController = TextEditingController();
  final TextEditingController _agenceSearchController = TextEditingController();

  @override
  void dispose() {
    _messageController.dispose();
    _agenceSearchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
          _buildContent(context),
          Positioned(
            left: 10,
            right: 10,
            bottom: 10,
            child: AppBottomNav(
              currentIndex: _navIndex,
              onTap: (i) => setState(() => _navIndex = i),
              onRdvPressed: () {
                // Brancher ici la navigation vers le flux de prise de RDV.
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 110),
      children: [
        _InsuranceHero(
          nom: widget.nom,
          sigle: widget.sigle,
          typeActeur: widget.typeActeur,
          ville: widget.ville,
          pays: widget.pays,
          agrement: widget.agrement,
          verifieeAps: widget.verifieeAps,
          couleurLogo: widget.couleurLogo,
          fondLogo: widget.fondLogo,
          onMiseEnRelation: () => setState(() => _tabIndex = 0),
          onAppeler: widget.onAppelerSiege ?? () {},
        ),
        const SizedBox(height: 6),
        _InsTabRow(
          tabIndex: _tabIndex,
          activitesCount: widget.activites.length,
          agencesCount: widget.agences.length,
          onChanged: (i) => setState(() => _tabIndex = i),
        ),
        const SizedBox(height: 16),
        if (_tabIndex == 0) _buildSiegeTab(),
        if (_tabIndex == 1) _buildActivitesTab(),
        if (_tabIndex == 2) _buildAgencesTab(),
        const SizedBox(height: 6),
        _buildContact(),
      ],
    );
  }

  // ---------------------------------------------------------------
  // Onglet « Siège »
  // ---------------------------------------------------------------
  Widget _buildSiegeTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InsCard(
          icon: Icons.business_outlined,
          title: 'Informations générales',
          child: Column(
            children: [
              _InsKv(label: 'Dénomination', value: widget.nom),
              _InsKv(label: "Type d'acteur", value: widget.typeActeur),
              _InsKv(label: 'Agrément', value: widget.agrement, mono: true),
              _InsKv(label: 'Localisation', value: '${widget.ville}, ${widget.pays}'),
              _InsKv(label: 'Téléphone', value: widget.telephoneSiege, mono: true),
              _InsKv(label: 'Courriel', value: widget.email, isLast: true, link: true),
            ],
          ),
        ),
        _InsCard(
          icon: Icons.info_outline,
          title: 'Présentation institutionnelle',
          child: Text(
            widget.presentation,
            style: AppTextStyles.body.copyWith(fontSize: 12.5, height: 1.65),
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------
  // Onglet « Activités »
  // ---------------------------------------------------------------
  Widget _buildActivitesTab() {
    return _InsCard(
      icon: Icons.assignment_outlined,
      title: 'Activités & produits',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final activite in widget.activites)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: BoxDecoration(
                border: activite == widget.activites.last
                    ? null
                    : const Border(bottom: BorderSide(color: AppColors.line)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(activite.titre, style: AppTextStyles.cardTitle.copyWith(fontSize: 13)),
                  const SizedBox(height: 5),
                  Text(
                    'Public cible : ${activite.cible}',
                    style: AppTextStyles.buttonLabel.copyWith(
                      fontSize: 11,
                      color: AppColors.green700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    activite.description,
                    style: AppTextStyles.body.copyWith(fontSize: 12, height: 1.6),
                  ),
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
    );
  }

  // ---------------------------------------------------------------
  // Onglet « Agences »
  // ---------------------------------------------------------------
  Widget _buildAgencesTab() {
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
                  onPressed: widget.onLocaliserAgencesProches ?? () {},
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
        for (final agence in widget.agences)
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
                      Text(agence.nom, style: AppTextStyles.cardTitle.copyWith(fontSize: 13)),
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
                  onTap: () => widget.onAppelerAgence?.call(agence),
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
  }

  // ---------------------------------------------------------------
  // Mise en relation — toujours visible sous les onglets
  // ---------------------------------------------------------------
  Widget _buildContact() {
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
            label: 'Envoyer la demande',
            icon: Icons.send_outlined,
            onPressed: () {
              widget.onEnvoyerDemande?.call(_messageController.text);
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
                  'La demande est adressée directement au siège de ${widget.nom}. '
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
}

/// Une activité / un produit proposé par l'assureur — `.ins-activity`.
class InsuranceActivity {
  const InsuranceActivity({required this.titre, required this.cible, required this.description});

  final String titre;
  final String cible;
  final String description;
}

/// Une agence locale de l'assureur — `.ins-agency-card`.
class InsuranceAgency {
  const InsuranceAgency({required this.nom, required this.localisation, this.telephone});

  final String nom;
  final String localisation;
  final String? telephone;
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