// src/components/publicite/SliderPublicite.jsx
//
// Slider publicitaire d'une page (v9) : jusqu'à `nombre_places` publicités
// payées, dans l'ordre des positions (1re position = la plus chère, affichée
// en premier), qui défilent automatiquement. Sous le slider, la petite carte
// « Réserver cet espace » mène au formulaire de réservation de la page.
//
// Statistiques : une impression est signalée la première fois qu'une
// publicité devient visible, un clic à chaque ouverture d'un contact. Le
// serveur dédoublonne ; un échec de suivi n'affecte jamais l'affichage.
//
// Props :
//   code      code de la page (PAGES_PUBLICITE), ex. "PAGE_MEDECIN"
//   variante  "carte" (colonne latérale, défaut) | "banniere" (pleine largeur)
//   intervalle durée d'affichage d'une publicité (ms)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { obtenirSliderPage, signalerEvenementPublicite } from '../../services/publiciteService';
import './SliderPublicite.css';

const telLien = (t) => `tel:${String(t).replace(/[^\d+]/g, '')}`;
const waLien = (t) => `https://wa.me/${String(t).replace(/\D/g, '')}`;

export default function SliderPublicite({ code, variante = 'carte', intervalle = 6000 }) {
  const { user } = useAuth();
  const [donnees, setDonnees] = useState(null);
  const [courant, setCourant] = useState(0);
  const [pause, setPause] = useState(false);
  const vues = useRef(new Set());

  useEffect(() => {
    let annule = false;
    obtenirSliderPage(code, user?.pays_id)
      .then((d) => { if (!annule) { setDonnees(d); setCourant(0); } })
      .catch(() => { if (!annule) setDonnees(null); });
    return () => { annule = true; };
  }, [code, user?.pays_id]);

  const pubs = useMemo(() => donnees?.publicites ?? [], [donnees]);
  const nb = pubs.length;

  // Rotation automatique (suspendue au survol / focus).
  useEffect(() => {
    if (pause || nb <= 1) return undefined;
    const t = setTimeout(() => setCourant((c) => (c + 1) % nb), intervalle);
    return () => clearTimeout(t);
  }, [courant, pause, nb, intervalle]);

  // Impression : une fois par publicité et par affichage de la page.
  useEffect(() => {
    const p = pubs[courant];
    if (!p || vues.current.has(p.publicite_id)) return;
    vues.current.add(p.publicite_id);
    signalerEvenementPublicite('impression', [p.publicite_id]);
  }, [courant, pubs]);

  const clic = useCallback((p) => signalerEvenementPublicite('clic', [p.publicite_id]), []);

  if (!donnees) return null;
  const lienReservation = `/publicite/reserver?page=${encodeURIComponent(code)}`;
  const placesLibres = donnees.emplacement.nombre_places - nb;

  return (
    <div className={`pub-slider pub-slider--${variante}`}>
      {nb > 0 && (
        <div
          className="pub-slider-cadre"
          onMouseEnter={() => setPause(true)}
          onMouseLeave={() => setPause(false)}
          onFocus={() => setPause(true)}
          onBlur={() => setPause(false)}
          aria-roledescription="carrousel"
          aria-label="Publicités"
        >
          <div className="ad-label">
            <span>Publicité</span>
            {nb > 1 && <span className="pub-slider-compteur">{courant + 1} / {nb}</span>}
          </div>
          <div className="pub-slider-piste">
            {pubs.map((p, i) => (
              <article
                key={p.publicite_id}
                className={`pub-slide${i === courant ? ' is-actif' : ''}`}
                aria-hidden={i !== courant}
                aria-roledescription="diapositive"
              >
                <img src={p.visuel_url} alt={p.titre} loading="lazy" />
                <div className="ad-card-body">
                  <h4>{p.titre}</h4>
                  {p.description && <p>{p.description}</p>}
                  {p.localisation && (
                    <p className="pub-slide-lieu"><i className="fa-solid fa-location-dot" /> {p.localisation}</p>
                  )}
                  <div className="pub-slide-actions">
                    {p.telephone_contact && (
                      <>
                        <a href={waLien(p.telephone_contact)} target="_blank" rel="noreferrer" tabIndex={i === courant ? 0 : -1}
                          className="btn btn-outline-primary btn-sm-aps" onClick={() => clic(p)}>
                          <i className="fa-brands fa-whatsapp" /> WhatsApp
                        </a>
                        <a href={telLien(p.telephone_contact)} tabIndex={i === courant ? 0 : -1}
                          className="btn btn-ghost btn-sm-aps" onClick={() => clic(p)} aria-label={`Appeler ${p.titre}`}>
                          <i className="fa-solid fa-phone" />
                        </a>
                      </>
                    )}
                    {p.email_contact && (
                      <a href={`mailto:${p.email_contact}`} tabIndex={i === courant ? 0 : -1}
                        className="btn btn-ghost btn-sm-aps" onClick={() => clic(p)} aria-label={`Écrire à ${p.titre}`}>
                        <i className="fa-solid fa-envelope" />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          {nb > 1 && (
            <div className="pub-slider-points" role="tablist" aria-label="Choisir une publicité">
              {pubs.map((p, i) => (
                <button key={p.publicite_id} type="button" role="tab" aria-selected={i === courant}
                  aria-label={`Publicité ${i + 1}`} className={i === courant ? 'is-actif' : ''} onClick={() => setCourant(i)} />
              ))}
            </div>
          )}
        </div>
      )}

      {donnees.reservation_possible && (
        <div className="ad-slot-empty pub-slider-reserver">
          <i className="fa-solid fa-bullhorn" />
          <p>
            {nb === 0
              ? "Cet emplacement est disponible pour les annonceurs partenaires d'ApSa."
              : placesLibres > 0
                ? `Encore ${placesLibres} position(s) libre(s) dans ce carrousel.`
                : 'Réservez votre position pour les prochaines périodes.'}
          </p>
          <Link to={lienReservation} className="btn btn-primary btn-sm-aps btn-block-aps">
            Réserver cet espace
          </Link>
        </div>
      )}
    </div>
  );
}
