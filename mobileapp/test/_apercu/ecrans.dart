import 'package:flutter/material.dart';
import 'package:mobileapp/components/components.dart';
import 'package:mobileapp/pages/public/login.dart';
import 'package:mobileapp/pages/public/onboarding/onboarding_accueil_page.dart';
import 'package:mobileapp/pages/public/publicAcceuil.dart';
import 'package:mobileapp/pages/public/urgence.dart';
import 'package:mobileapp/pages/portails/patient/patient_home_shell.dart';
import 'package:mobileapp/pages/portails/medecin/medecin_home_shell.dart';
import 'package:mobileapp/pages/public/Pharmaciepage.dart';
import 'package:mobileapp/pages/public/utils/Rendezvous.dart';
import 'package:mobileapp/pages/public/utils/Confirmationrdv.dart';

DateTime _j(int d, int h, int m) => DateTime(2026, 10, d, h, m);

List<CreneauJour> _jours() => [
      for (final d in [19, 20, 21, 23, 24])
        CreneauJour(date: _j(d, 8, 0), creneaux: [
          for (final (h, m, libre) in [
            (8, 0, false), (8, 30, false), (10, 0, true), (11, 30, true),
            (14, 30, true), (15, 0, true), (15, 30, d != 20), (16, 30, true), (17, 0, true),
          ])
            CreneauHoraire(
              heure: '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}',
              disponible: libre,
              debut: _j(d, h, m),
              creneauId: '$d-$h-$m',
            ),
        ]),
    ];

final Map<String, Widget Function()> ecrans = {
  '01_onboarding': () => const OnboardingAccueilPage(),
  '02_login': () => const LoginScreen(),
  '05_accueil': () => const PublicAcceuilPage(),
  '07_cartes': () => Scaffold(
        body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(18), children: [
            CardMedecin(
              nom: 'Dr Arielle Mbarga',
              specialite: 'Cardiologue',
              ville: 'Bonapriso',
              prixFcfa: 15000,
              verifieOrdre: true,
              teleconsultation: true,
              disponibleAujourdhui: true,
              onVoirProfil: () {},
              onPrendreRdv: () {},
            ),
            CardMedecin(
              nom: 'Dr Hervé Tchoupo',
              specialite: 'Cardiologue',
              ville: 'Akwa',
              prixFcfa: 12000,
              verifieOrdre: true,
              onVoirProfil: () {},
              onPrendreRdv: () {},
            ),
            CardStructure(nom: 'Hôpital Laquintinie', ville: 'Douala', verifiee: true, onAppeler: () {}, onItineraire: () {}),
            CardAssurance(nom: 'AXA Assurances', sigle: 'AXA', ville: 'Douala', description: 'Santé, famille, 6 agences.', verifieeAps: true, onVoirFiche: () {}),
          ]),
        ),
      ),
  '17_patient': () => const PatientHomeShell(),
  '26_medecin': () => const MedecinHomeShell(),
  '20_pharma': () => const PharmaciePage(),
  '23_urgence': () => const UrgencePage(),
  '14_confirme': () => ConfirmationRdvPage(
        medecinNom: 'Dr Arielle Mbarga',
        medecinSpecialite: 'Cardiologue',
        dateRdv: DateTime(2026, 10, 19),
        heure: '14:30',
        typeRdvLabel: 'Au cabinet',
        tarifFcfa: 15500,
        codeUnique: 'APS-48219',
      ),
  '11_creneau':() => RendezVousPage(
        medecinId: 'x',
        medecinNom: 'Arielle Mbarga',
        medecinSpecialite: 'Cardiologue',
        medecinVille: 'Bonapriso',
        tarifFcfa: 1000,
        teleconsultationDisponible: true,
        onChargerCreneaux: (_) async => _jours(),
        onConfirmerReservation: (_, _) async => true,
      ),
};
