// Exemple d'utilisation — non requis en production, sert de démo/rendu visuel
// pour vérifier l'assemblage des composants cards / buttons / alert / colors.
import 'package:flutter/material.dart';
import 'components.dart';

class ExampleScreen extends StatefulWidget {
  const ExampleScreen({super.key});

  @override
  State<ExampleScreen> createState() => _ExampleScreenState();
}

class _ExampleScreenState extends State<ExampleScreen> {
  int _navIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      extendBody: true,
      appBar: AppBar(
        backgroundColor: AppColors.paper,
        elevation: 0,
        foregroundColor: AppColors.ink,
        title: const Text('Annuaire', style: AppTextStyles.h3),
      ),
      body: Stack(
        children: [
          _buildContent(context),
          // Barre de navigation flottante + bouton "Rendez-vous"
          Positioned(
            left: 10,
            right: 10,
            bottom: 10,
            child: AppBottomNav(
              currentIndex: _navIndex,
              onTap: (i) => setState(() => _navIndex = i),
              onRdvPressed: () {
                // Brancher ici la navigation vers l'écran de prise de RDV.
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    return ListView(
        // padding bas augmenté pour ne pas passer sous la barre flottante
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
        children: [
          const AppAlert(
            type: AppAlertType.primary,
            message: 'Présentation seulement : aucune souscription en ligne sur APS.',
          ),
          const SizedBox(height: 16),

          CardMedecin(
            nom: 'Dr. Landry Amari',
            specialite: 'Cardiologie',
            ville: 'Garoua',
            prixFcfa: 12000,
            verifieOrdre: true,
            teleconsultation: true,
            onVoirProfil: () {},
            onPrendreRdv: () {},
          ),

          CardStructure(
            nom: 'Hôpital Bleu',
            ville: 'Douala · Cameroun',
            type: StructureType.hopital,
            verifiee: true,
            onAppeler: () {},
            onItineraire: () {},
          ),

          CardPharmacie(
            nom: 'Pharmacie Soleil',
            quartier: 'Akwa Nord',
            deGarde: true,
            verifiee: true,
            numeroOrdre: 'RCM-002E',
            distanceKm: 1.2,
            onAppeler: () {},
            onItineraire: () {},
          ),

          CardAssurance(
            nom: 'AXA',
            sigle: 'AXA',
            ville: 'Douala',
            description:
                "Leader mondial de l'assurance et de la gestion d'actifs, solutions santé pour particuliers et entreprises.",
            numeroAgrement: 'RCM-07MEICOM',
            couleurLogo: const Color(0xFF0B2C9E),
            fondLogo: const Color(0xFFEDF1FB),
            onVoirFiche: () {},
          ),

          const SizedBox(height: 8),
          const AppAlert(
            type: AppAlertType.secondary,
            message:
                "Mode dégradé hors connexion : les numéros d'urgence restent accessibles même sans réseau.",
          ),
          const SizedBox(height: 12),
          const AppAlert(
            type: AppAlertType.danger,
            title: 'Zéro publicité',
            message: "Écran Urgence : aucun contenu commercial, sous aucune forme.",
          ),
          const SizedBox(height: 16),

          PrimaryButton(label: 'Confirmer le rendez-vous', onPressed: () {}),
          const SizedBox(height: 8),
          SecondaryButton(
            label: "Envoyer ma position à un contact d'urgence",
            icon: Icons.send_outlined,
            onPressed: () {},
          ),
        ],
      );
  }
}
