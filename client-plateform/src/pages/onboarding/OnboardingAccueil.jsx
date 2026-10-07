import { Link } from 'react-router-dom';

/**
 * Écran 1 — Accueil / choix initial du parcours d'onboarding.
 *
 * Point d'entrée mobile-first proposé avant la page /home classique,
 * pour orienter immédiatement un nouvel arrivant entre deux
 * intentions : chercher un soin, ou se connecter en tant que
 * professionnel de santé (Écran 1.2 = /login, déjà implémenté — voir
 * src/pages/Login.jsx, non modifié ici).
 *
 * Un lien discret "Passer" permet de rejoindre directement /home sans
 * passer par le reste du parcours.
 */
export default function OnboardingAccueil() {
  return (
    <section className="onboarding-shell">
      <div className="container-aps onboarding-container">
        <div className="onboarding-intro">
          <img
            src="/favicon.jpeg"
            alt="Logo ApSa Santé"
            className="onboarding-logo"
          />
          <span className="eyebrow">Bienvenue sur ApSa Santé</span>
          <p className="onboarding-description">
            Trouvez en un clic un professionnel (médecin, assurance, pharmacien, ...)
          </p>
          <h1 style={{ fontSize: '1.7rem', marginTop: '1.2rem' }}>Que souhaitez-vous faire ?</h1>
        </div>

        <div className="onboarding-choices">
          <Link to="/onboarding/services" className="onboarding-choice-card">
            <span className="icon-wrap">
              <i className="fa-solid fa-magnifying-glass" />
            </span>
            <span>
              <span className="choice-title">Je recherche un professionnel</span>
              <span className="choice-sub">Médecins, pharmacies, structures de santé…</span>
            </span>
            <i className="fa-solid fa-chevron-right" />
          </Link>

          <Link to="/login" className="onboarding-choice-card is-pro">
            <span className="icon-wrap">
              <i className="fa-solid fa-user-doctor" />
            </span>
            <span>
              <span className="choice-title">Je suis un professionnel</span>
              <span className="choice-sub">Connexion à mon espace professionnel</span>
            </span>
            <i className="fa-solid fa-chevron-right" />
          </Link>
        </div>

        <Link to="/home" className="onboarding-skip">
          Passer <i className="fa-solid fa-arrow-right" />
        </Link>
      </div>
    </section>
  );
}