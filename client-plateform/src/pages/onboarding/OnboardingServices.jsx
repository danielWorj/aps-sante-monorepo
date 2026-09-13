import ServiceCard from './ServiceCard';

/**
 * Écran 1.1 — Liste des services de APS Santé.
 *
 * Reprend le principe du "cat-grid" de Home.jsx (voir ServiceCard,
 * factorisé pour l'occasion) pour lister les grandes familles
 * d'acteurs de l'annuaire. Seul "Médecins et professionnels" ouvre le
 * sous-parcours de recherche guidée (Écran 1.1.1 : ville, puis
 * Écran 1.1.2 : spécialité) ; les autres services, déjà pourvus d'un
 * annuaire complet, y renvoient directement.
 *
 * "Pompes funèbres" n'a pas encore d'annuaire dédié côté client
 * (aucune route existante, seul le rôle `agent_pompes_funebres` existe
 * côté serveur) : la carte reste visible pour annoncer le service,
 * mais désactivée plutôt que de pointer vers une page inexistante.
 */
export default function OnboardingServices() {
  return (
    <section className="onboarding-shell onboarding-shell-top">
      <div className="container-aps onboarding-container-lg">
        <span className="eyebrow">APS Santé</span>
        <h1 style={{ fontSize: '1.6rem', marginTop: '.5rem', marginBottom: '1.6rem' }}>
          Liste des services de APS Santé
        </h1>

        <div className="cat-grid onboarding-service-list">
          <ServiceCard
            to="/onboarding/medecins/ville"
            icon="fa-user-doctor"
            title="Médecins et professionnels"
            subtitle="Généralistes, spécialistes, dentistes…"
          />
          <ServiceCard
            to="/pharmacie"
            icon="fa-mortar-pestle"
            title="Pharmacie"
            subtitle="De garde ou horaires classiques"
          />
          <ServiceCard
            to="/assurance"
            icon="fa-shield-heart"
            title="Assurances"
            subtitle="Compagnies et courtiers santé"
          />
          <ServiceCard
            to="/structure-sante"
            icon="fa-hospital"
            title="Structures de santé"
            subtitle="Cliniques, hôpitaux, centres de santé"
          />
          <ServiceCard
            to="/urgences"
            icon="fa-truck-medical"
            title="Ambulances"
            subtitle="Appel direct, intervention rapide"
          />
          <ServiceCard
            disabled
            icon="fa-hands-holding"
            title="Pompes funèbres"
            subtitle="Bientôt disponible"
          />
        </div>
      </div>
    </section>
  );
}