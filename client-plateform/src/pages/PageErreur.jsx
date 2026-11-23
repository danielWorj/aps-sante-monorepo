// src/pages/PageErreur.jsx
//
// Page d'erreur unique du site : 404 (page introuvable), 401 (connexion
// requise), 403 (accès refusé) et 500 (erreur inattendue).
//
// Deux usages dans router.jsx :
//  - route `*` dans le layout commun (Navbar + Footer) : <PageErreur code={404} />
//  - `errorElement` de la racine : <PageErreur autonome /> ; le code est alors
//    lu dans l'erreur levée par le routeur (useRouteError). Le layout ayant
//    pu planter, la page porte son propre en-tête (logo) dans ce mode.
import { Link, isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { accueilParRole } from '../utils/roles';
import { NOM_MARQUE } from '../lib/marque';
import logoApsa from '../assets/img/logoapsa.jpeg';
import './PageErreur.css';

const CONTENUS = {
  404: {
    badge: 'Erreur 404',
    titre: 'Page introuvable',
    texte: "La page que vous cherchez n'existe pas, a été déplacée ou l'adresse contient une faute de frappe.",
  },
  401: {
    badge: 'Erreur 401',
    titre: 'Connexion requise',
    texte: 'Cette page est réservée aux utilisateurs connectés. Connectez-vous pour y accéder.',
  },
  403: {
    badge: 'Erreur 403',
    titre: 'Accès refusé',
    texte: "Votre compte n'a pas les droits nécessaires pour ouvrir cette page.",
  },
  500: {
    badge: 'Erreur inattendue',
    titre: 'Un problème est survenu',
    texte: "Quelque chose s'est mal passé de notre côté. Réessayez dans un instant ; si le problème persiste, contactez-nous.",
  },
};

/** Code affiché à partir de l'erreur du routeur (mode autonome). */
function codeDepuisErreur(erreur) {
  if (isRouteErrorResponse(erreur) && CONTENUS[erreur.status]) return erreur.status;
  return 500;
}

/** Roue dentée : `dents` rectangles autour d'un disque percé. */
function Engrenage({ cx, cy, r, dents = 8, couleur }) {
  const largeur = r * 0.42;
  const hauteur = r * 0.38;
  return (
    <g fill={couleur}>
      {Array.from({ length: dents }, (_, i) => (
        <rect
          key={i}
          x={cx - largeur / 2}
          y={cy - r - hauteur + 2}
          width={largeur}
          height={hauteur}
          rx={largeur * 0.18}
          transform={`rotate(${(360 / dents) * i} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={r} />
      <circle cx={cx} cy={cy} r={r * 0.38} fill="var(--erreur-fond)" />
    </g>
  );
}

/** Illustration : chiffres du code en relief, engrenages, plante. */
function Illustration({ code }) {
  const chiffres = String(code).split('');
  const verrou = code === 401 || code === 403;
  const positions = [190, 320, 450];

  return (
    <svg className="erreur-illus" viewBox="0 0 640 360" role="img" aria-label={`Erreur ${code}`}>
      {/* Fond organique */}
      <path
        className="erreur-illus-blob"
        d="M86 170C70 92 140 40 232 48c62 6 92 34 150 26 70-10 120-30 172 8 58 42 50 118 14 170-34 50-92 70-168 66-58-3-88 22-160 14C134 324 98 262 86 170Z"
      />
      {/* Engrenages */}
      <g className="erreur-illus-gears">
        <g className="erreur-gear-a"><Engrenage cx={320} cy={128} r={58} dents={10} couleur="var(--erreur-gear)" /></g>
        <g className="erreur-gear-b"><Engrenage cx={432} cy={88} r={30} dents={8} couleur="var(--erreur-gear)" /></g>
        <g className="erreur-gear-c"><Engrenage cx={388} cy={44} r={18} dents={7} couleur="var(--erreur-gear)" /></g>
      </g>
      {/* Ombre au sol */}
      <ellipse cx="320" cy="300" rx="230" ry="12" className="erreur-illus-sol" />

      {/* Chiffres : aplat vert décalé + contour sombre */}
      {chiffres.map((c, i) => {
        const cadenas = verrou && i === 1;
        if (cadenas) {
          const x = positions[i];
          return (
            <g key={i} className="erreur-illus-cadenas">
              <rect x={x - 52} y={170} width={112} height={120} rx={20} className="erreur-plein" />
              <path d={`M${x - 26} 174v-34a34 34 0 0 1 68 0v34`} className="erreur-anse" />
              <rect x={x - 60} y={162} width={112} height={120} rx={20} className="erreur-contour" />
              <circle cx={x - 4} cy={214} r={12} className="erreur-trou" />
              <rect x={x - 9} y={218} width={10} height={32} rx={5} className="erreur-trou" />
            </g>
          );
        }
        return (
          <g key={i}>
            <text x={positions[i] + 10} y={292} className="erreur-chiffre erreur-plein">{c}</text>
            <text x={positions[i]} y={282} className="erreur-chiffre erreur-contour">{c}</text>
          </g>
        );
      })}

      {/* Plante */}
      <g className="erreur-illus-plante" transform="translate(556 216)">
        <path d="M0 60C-26 36-30 6-18-22 0 0 6 30 0 60Z" fill="var(--teal)" />
        <path d="M0 60C4 20 20-6 40-16 40 16 26 42 0 60Z" fill="var(--primary)" />
        <path d="M0 60C-6 26-2-10 10-40 22-8 16 30 0 60Z" fill="var(--primary-dark)" />
        <path d="M-18 56h36l-5 26h-26z" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      </g>
    </svg>
  );
}

export default function PageErreur({ code: codeImpose, autonome = false }) {
  const erreur = useRouteError();
  const code = codeImpose ?? (erreur !== undefined ? codeDepuisErreur(erreur) : 404);
  const contenu = CONTENUS[code] ?? CONTENUS[500];
  const navigate = useNavigate();
  const location = useLocation();
  const { status, user } = useAuth();
  const connecte = status === 'authenticated';

  if (autonome && erreur && !isRouteErrorResponse(erreur)) {
    // Utile en développement : la page masque le détail de l'exception.
    console.error(erreur);
  }

  const peutRevenir = typeof window !== 'undefined' && window.history.length > 1;

  return (
    <div className={`erreur-page${autonome ? ' is-autonome' : ''}`}>
      {autonome && (
        <header className="erreur-entete">
          <Link to="/home" className="erreur-logo">
            <img src={logoApsa} alt={NOM_MARQUE} />
          </Link>
        </header>
      )}

      <main className="erreur-contenu container-aps">
        <Illustration code={code} />

        <span className="erreur-badge">{contenu.badge}</span>
        <h1 className="erreur-titre">{contenu.titre}</h1>
        <p className="erreur-texte">{contenu.texte}</p>

        {code === 404 && (
          <p className="erreur-adresse" title={location.pathname}>
            <i className="fa-solid fa-link-slash" /> {location.pathname}
          </p>
        )}

        <div className="erreur-actions">
          {code === 401 && !connecte && (
            <Link to="/login" state={{ from: location }} className="btn btn-primary btn-lg-aps">
              <i className="fa-solid fa-right-to-bracket" /> Se connecter
            </Link>
          )}
          {code === 403 && connecte && (
            <Link to={accueilParRole(user?.role)} className="btn btn-primary btn-lg-aps">
              <i className="fa-solid fa-user" /> Mon espace
            </Link>
          )}
          {code === 500 && (
            <button type="button" className="btn btn-primary btn-lg-aps" onClick={() => window.location.reload()}>
              <i className="fa-solid fa-rotate-right" /> Recharger la page
            </button>
          )}
          <Link
            to="/home"
            className={`btn ${code === 404 || (code === 401 && connecte) ? 'btn-primary' : 'btn-outline-primary'} btn-lg-aps`}
          >
            <i className="fa-solid fa-house" /> Retour à l'accueil
          </Link>
          {peutRevenir && (
            <button type="button" className="btn btn-link erreur-retour" onClick={() => navigate(-1)}>
              <i className="fa-solid fa-arrow-left" /> Page précédente
            </button>
          )}
        </div>

        <p className="erreur-aide">
          Besoin d'aide ? <Link to="/contact">Contactez-nous</Link>
        </p>
      </main>
    </div>
  );
}
