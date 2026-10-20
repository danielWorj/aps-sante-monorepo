import { Link } from 'react-router-dom';
import logoApsa from '../assets/img/logoapsa.jpeg';
import '../assets/styles/footer-2026.css';
import { useTelechargementApk } from '../hooks/useTelechargementApk';
import { useToast } from './feedback';

// Pied de page public — refonte UI web 2026 (mobile/new-web-ui.html).
// Le bouton « Télécharger l'APK » télécharge directement l'APK active
// publiée depuis le back-office (Gestion des APKs), comme l'accueil.
export default function Footer() {
  const apk = useTelechargementApk();
  const toast = useToast();

  async function telecharger() {
    if (!(await apk.lancer())) {
      toast.erreur('Le téléchargement de l’application a échoué. Réessayez dans quelques instants.');
    }
  }

  return (
    <footer className="aps-footer">
      <div className="container-aps">
        <div className="aps-footer-grid">
          <div className="aps-footer-marque">
            <Link to="/home" className="aps-footer-logo" aria-label="ApSa — accueil">
              <img src={logoApsa} alt="ApSa — AZA Santé Assurances" />
            </Link>
            <p className="aps-footer-pitch">
              AZA PROXI SANTÉ ASSURANCES relie patients, médecins, pharmacies, structures de santé
              et assureurs, avec un paiement sécurisé à chaque étape.
            </p>
            <div className="social-row">
              <a href="#" aria-label="Facebook"><i className="fa-brands fa-facebook-f" /></a>
              <a href="#" aria-label="X"><i className="fa-brands fa-x-twitter" /></a>
              <a href="#" aria-label="LinkedIn"><i className="fa-brands fa-linkedin-in" /></a>
            </div>
          </div>

          <div>
            <h5>Patients</h5>
            <ul className="footer-links">
              <li><Link to="/medecin">Trouver un médecin</Link></li>
              <li><Link to="/demande-rapide">Demande express</Link></li>
              <li><Link to="/urgences">Urgences</Link></li>
              <li><Link to="/creer-patient">Créer un compte patient</Link></li>
            </ul>
          </div>

          <div>
            <h5>Annuaires</h5>
            <ul className="footer-links">
              <li><Link to="/pharmacie">Pharmacies</Link></li>
              <li><Link to="/structure-sante">Structures de santé</Link></li>
              <li><Link to="/assurance">Assurances</Link></li>
            </ul>
          </div>

          <div>
            <h5>Professionnels</h5>
            <ul className="footer-links">
              <li><Link to="/inscription">Devenir partenaire</Link></li>
              <li><Link to="/pricing">Abonnements</Link></li>
              <li><Link to="/publicite/reserver">Publicité</Link></li>
              <li><Link to="/login">Espace pro</Link></li>
            </ul>
          </div>

          <div>
            <h5>ApSa</h5>
            <ul className="footer-links">
              <li><Link to="/a-propos">À propos</Link></li>
              <li><Link to="/contact">Contactez-nous</Link></li>
              <li><Link to="/contact#faq">Questions fréquentes</Link></li>
            </ul>
          </div>

          <div>
            <h5>Application mobile</h5>
            <button
              type="button"
              className="btn btn-dark btn-sm-aps"
              onClick={telecharger}
              disabled={!apk.disponible || apk.enCours}
              title={apk.disponible ? undefined : 'Application momentanément indisponible au téléchargement'}
            >
              {apk.enCours ? (
                <><i className="fa-solid fa-spinner fa-spin" /> Téléchargement… {apk.libelleProgression}</>
              ) : (
                <><i className="fa-solid fa-download" /> Télécharger l&apos;APK</>
              )}
            </button>
            {apk.enCours && (
              <div
                className="progress mt-2"
                role="progressbar"
                aria-label="Progression du téléchargement de l'application"
                aria-valuenow={apk.progression}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{ maxWidth: 220, height: 6 }}
              >
                <div
                  className="progress-bar progress-bar-striped progress-bar-animated"
                  style={{ width: apk.tailleInconnue ? '100%' : `${apk.progression}%` }}
                />
              </div>
            )}
            <div className="aps-footer-urgence">
              En cas d&apos;urgence : <Link to="/urgences">numéros de votre pays</Link>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 AZA PROXI SANTÉ ASSURANCES (ApSa). Tous droits réservés.</span>
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
