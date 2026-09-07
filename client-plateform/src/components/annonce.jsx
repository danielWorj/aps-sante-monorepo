import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listerAnnonces } from '../services/annonceService';

/* ---------------------------- Bande d'annonces défilante ---------------------------- */

export default function Annonce() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annule = false;

    listerAnnonces({ actives: true })
      .then((annonces) => {
        if (!annule) setItems(Array.isArray(annonces) ? annonces : []);
      })
      .catch((err) => {
        console.error('Erreur lors du chargement des annonces :', err);
        if (!annule) setItems([]);
      })
      .finally(() => {
        if (!annule) setLoading(false);
      });

    return () => { annule = true; };
  }, []);

  // Rien à afficher : on masque simplement la bande plutôt que de montrer un
  // encart vide pendant le chargement ou en l'absence d'annonces actives.
  if (loading || items.length === 0) return null;

  // On duplique la liste pour obtenir une boucle de défilement continue et sans coupure
  const loopItems = [...items, ...items];

  return (
    <div className="announcements-band">
      <style>{`
        .announcements-band {
          overflow: hidden;
          background: #f4f8fb;
          border-bottom: 1px solid #e3ecf3;
          padding: 10px 0;
        }
        .announcements-track {
          display: flex;
          width: max-content;
          animation: announcements-scroll 35s linear infinite;
        }
        .announcements-band:hover .announcements-track {
          animation-play-state: paused;
        }
        .announcement-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 28px;
          border-right: 1px solid #dbe6ee;
          white-space: nowrap;
          text-decoration: none;
          color: inherit;
        }
        .announcement-item img {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .announcement-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: #e3ecf3;
          color: #0b3556;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          flex-shrink: 0;
        }
        .announcement-text {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
        }
        .announcement-libelle {
          font-weight: 600;
          font-size: 0.86rem;
          color: #0b3556;
        }
        .announcement-description {
          font-size: 0.78rem;
          color: #5b7185;
        }
        @keyframes announcements-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .announcements-track { animation: none; }
        }
      `}</style>
      <div className="announcements-track">
        {loopItems.map((item, i) => (
          <Link
            to={`/annonces/${item.id}`}
            className="announcement-item"
            key={`${item.id}-${i}`}
          >
            {item.file_url ? (
              <img src={item.file_url} alt={item.libelle} />
            ) : (
              <span className="announcement-icon" aria-hidden="true">
                <i className="fa-solid fa-bullhorn"></i>
              </span>
            )}
            <div className="announcement-text">
              <span className="announcement-libelle">{item.libelle}</span>
              {item.courte_description && (
                <span className="announcement-description">{item.courte_description}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}