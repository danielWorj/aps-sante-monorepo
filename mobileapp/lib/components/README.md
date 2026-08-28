# Composants Flutter — APS Santé

Traduction en Flutter du design system HTML `ui-mobile.html` (10 écrans mobiles clés).

## Arborescence

```
lib/components/
├── components.dart          # barrel export (import unique)
├── example_usage.dart        # écran de démo assemblant les composants
├── style/
│   ├── colors.dart            # AppColors : primary, success, secondary, warning, danger...
│   └── text_styles.dart       # AppTextStyles + AppRadius (Sora / Inter / IBM Plex Mono)
├── cards/
│   ├── badge_chip.dart        # BadgeChip, GuardDot, CardSurface (utilitaires partagés)
│   ├── card_medecin.dart      # Carte médecin (annuaire médecins)
│   ├── card_structure.dart    # Carte hôpital / clinique / centre de santé
│   ├── card_pharmacie.dart    # Carte pharmacie (garde, vérif, distance)
│   └── card_assurance.dart    # Carte compagnie / courtier d'assurance
├── buttons/
│   ├── app_buttons.dart       # PrimaryButton / SecondaryButton (.btn-primary/.btn-secondary)
│   ├── call_button.dart       # CallButton — "Appeler" (corail)
│   ├── rdv_button.dart        # RdvButton — "Prendre RDV" (vert)
│   ├── itinerary_button.dart  # ItineraryButton — "Itinéraire" (outline)
│   └── outline_button.dart    # AppOutlineButton générique ("Voir le profil"...)
├── alert/
│   └── app_alert.dart         # AppAlert (bandeau) + AppAlertBadge (pastille)
│                               # variantes : primary, success, secondary, warning, danger
└── navigation/
    └── app_bottom_nav.dart    # AppBottomNav — barre basse flottante + bouton
                                # flottant central « Rendez-vous »
                                # Rubriques : Accueil, Médecin, Assurance, À propos
```

## Correspondance avec la maquette HTML

| Élément CSS de la maquette              | Composant Flutter                          |
|------------------------------------------|---------------------------------------------|
| `--green-700`, `--coral-500`, etc.        | `AppColors` (`style/colors.dart`)            |
| `.list-card` (médecins)                   | `CardMedecin`                                |
| `.list-card` (structures)                 | `CardStructure`                              |
| `.list-card` (pharmacies)                 | `CardPharmacie`                              |
| `.insurer-card`                           | `CardAssurance`                              |
| `.mini-btn.coral` (Appeler)                | `CallButton`                                 |
| `.mini-btn` (Prendre RDV)                  | `RdvButton`                                  |
| `.mini-btn.outline` (Itinéraire)           | `ItineraryButton`                            |
| `.mini-btn.outline` (Voir le profil/fiche) | `AppOutlineButton`                           |
| `.btn-primary` / `.btn-secondary`          | `PrimaryButton` / `SecondaryButton`          |
| `.badge.green/.amber/.coral/.outline`      | `BadgeChip`                                  |
| `.guard-dot`                               | `GuardDot`                                   |
| `.notice-chip` / `.ins-notice`             | `AppAlert(type: AppAlertType.primary)`       |
| `.offline-note`                            | `AppAlert(type: AppAlertType.secondary)`     |
| `.rule-tag.ok`                             | `AppAlertBadge(type: AppAlertType.success)`  |
| `.rule-tag.warn`                           | `AppAlertBadge(type: AppAlertType.warning)`  |
| `.rule-tag.off`                            | `AppAlertBadge(type: AppAlertType.danger)`   |
| `.bottomnav` / `.navitem`                  | `AppBottomNav`                               |
| `.navitem-fab` (bouton flottant RDV)       | `AppBottomNav.onRdvPressed` (icône calendrier) |

## Utilisation

```dart
import 'package:aps/components/components.dart';

CardMedecin(
  nom: 'Dr. Landry Amari',
  specialite: 'Cardiologie',
  ville: 'Garoua',
  prixFcfa: 12000,
  verifieOrdre: true,
  teleconsultation: true,
  onVoirProfil: () {},
  onPrendreRdv: () {},
)
```

Barre de navigation basse (à placer dans un `Stack`, comme dans la maquette où
elle flotte au-dessus du contenu) :

```dart
Scaffold(
  extendBody: true,
  body: Stack(
    children: [
      ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 110), children: [ /* ... */ ]),
      Positioned(
        left: 10,
        right: 10,
        bottom: 10,
        child: AppBottomNav(
          currentIndex: 0, // 0=Accueil, 1=Médecin, 2=Assurance, 3=À propos
          onTap: (i) {},
          onRdvPressed: () {}, // ouvre le flux de prise de rendez-vous
        ),
      ),
    ],
  ),
)
```

## Notes d'intégration

- **Polices** : `AppTextStyles` référence `Sora`, `Inter`, `IBMPlexMono`. Déclarez-les dans
  `pubspec.yaml` (fichiers de police) ou remplacez-les par `google_fonts` si vous préférez
  ne pas embarquer les fichiers.
- **Icônes** : les composants utilisent `Icons.*` (Material Icons). Vous pouvez les
  remplacer par des `SvgPicture` si vous voulez reprendre exactement le trait des
  icônes de la maquette (stroke-width 1.7, style outline).
- **Extensibilité** : `CardSurface` (dans `cards/badge_chip.dart`) est le conteneur
  visuel commun (fond blanc, bordure, radius, ombre) — toute nouvelle carte doit
  s'appuyer dessus pour rester cohérente avec le reste de l'app.
- Aucune carte n'inclut de logique de navigation/réseau : les callbacks
  (`onAppeler`, `onPrendreRdv`, `onVoirFiche`...) sont à brancher depuis l'écran
  parent (ex: `url_launcher` pour `tel:`, `go_router`/`Navigator` pour la navigation).
