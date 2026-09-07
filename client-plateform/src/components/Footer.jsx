import { Link } from 'react-router-dom';
import { useState } from 'react';

export default function Footer() {
  const [email, setEmail] = useState('');
  const [subscribeMessage, setSubscribeMessage] = useState('');

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (email) {
      setSubscribeMessage('Merci de vous être abonné !');
      setEmail('');
      setTimeout(() => setSubscribeMessage(''), 3000);
    }
  };

  return (
    <footer className="aps-footer">
      <div className="container-aps">
        {/* Newsletter Card */}
        <div className="newsletter-card">
          <h4>Abonnez-vous à notre newsletter !</h4>
          <p>Restez informé about news, wellness, & more</p>
          <form onSubmit={handleSubscribe} className="newsletter-form">
            <input
              type="email"
              placeholder="Votre adresse email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button type="submit">S'abonner</button>
          </form>
          {subscribeMessage && (
            <p style={{ color: '#2d5016', marginTop: '0.5rem', fontSize: '.9rem' }}>
              {subscribeMessage}
            </p>
          )}
        </div>

        <div className="row g-4">
          <div className="col-lg-4">
            <Link to="/" className="aps-logo" style={{ color: '#fff' }}>
              <span className="mark"><i className="fa-solid fa-staff-snake" /></span> APS
            </Link>
            <p className="mt-3" style={{ fontSize: '.87rem', maxWidth: 320 , color: '#fff'}}>
              La plateforme qui connecte patients et professionnels de santé, avec un paiement sécurisé à chaque étape.
            </p>
            <div className="social-row mt-3">
              <a href="#" aria-label="Facebook"><i className="fa-brands fa-facebook-f" /></a>
              <a href="#" aria-label="X"><i className="fa-brands fa-x-twitter" /></a>
              <a href="#" aria-label="LinkedIn"><i className="fa-brands fa-linkedin-in" /></a>
            </div>
          </div>

          <div className="col-6 col-lg-2">
            <h5>Parcours santé</h5>
            <ul className="footer-links">
              <li><Link to="/medecin">Trouver un médecin</Link></li>
              <li><Link to="/home#pharmacies">Pharmacies de garde</Link></li>
              <li><Link to="/urgences">Urgences</Link></li>
              <li><Link to="/assurance">Assurances</Link></li>
            </ul>
          </div>

          <div className="col-6 col-lg-2">
            <h5>Professionnels</h5>
            <ul className="footer-links">
              <li><Link to="/home#rejoindre">Devenir médecin</Link></li>
              <li><Link to="/home#rejoindre">Inscrire un service</Link></li>
              <li><a href="#">Espace pro</a></li>
            </ul>
          </div>

          <div className="col-6 col-lg-2">
            <h5>Ressources</h5>
            <ul className="footer-links">
              <li><a href="#">Aide / FAQ</a></li>
              <li><a href="#">Contact</a></li>
              <li><a href="#">CGU</a></li>
              <li><a href="#">Confidentialité</a></li>
            </ul>
          </div>

          <div className="col-6 col-lg-2">
            <h5>Entreprise</h5>
            <ul className="footer-links">
              <li><a href="#">À propos</a></li>
              <li><a href="#">Mentions légales</a></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 APS. Tous droits réservés.</span>
          <div className="footer-lang">
            <i className="fa-solid fa-earth-africa" />
            <select aria-label="Choisir le pays" defaultValue="Cameroun">
              <option>Cameroun</option>
              <option>Sénégal</option>
              <option>Côte d'Ivoire</option>
              <option>Gabon</option>
            </select>
            <select aria-label="Choisir la langue" defaultValue="Français">
              <option>Français</option>
              <option>English</option>
            </select>
          </div>
        </div>
      </div>
    </footer>
  );
}