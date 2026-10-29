// src/components/publicite/SliderPublicite.jsx
//
// Slider publicitaire d'une page (v9) : jusqu'à `nombre_places` publicités
// payées, dans l'ordre des positions (1re position = la plus chère, affichée
// en premier), qui défilent automatiquement. Sous le slider, la petite carte
// « Réserver cet espace » mène au formulaire de réservation de la page.
//
// Navigation : flèches, points (avec progression de la rotation), clavier
// (← →) et balayage tactile. La rotation s'arrête au survol, au focus et
// quand l'onglet est masqué. Le flyer est affiché en entier (contain) sur
// un fond flouté de lui-même : un flyer vertical n'est jamais rogné.
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
  const [masque, setMasque] = useState(() => typeof document !== 'undefined' && document.hidden);
  const vues = useRef(new Set());
  const toucher = useRef(null);

  useEffect(() => {
    let annule = false;
    obtenirSliderPage(code, user?.pays_id)
      .then((d) => { if (!annule) { setDonnees(d); setCourant(0); } })
      .catch(() => { if (!annule) setDonnees(null); });
    return () => { annule = true; };
  }, [code, user?.pays_id]);

  const pubs = useMemo(() => donnees?.publicites ?? [], [donnees]);
  const nb = pubs.length;

  useEffect(() => {
    const surVisibilite = () => setMasque(document.hidden);
    document.addEventListener('visibilitychange', surVisibilite);
    return () => document.removeEventListener('visibilitychange', surVisibilite);
  }, []);

  // Rotation automatique (suspendue au survol / focus / onglet masqué).
  const enPause = pause || masque;
  useEffect(() => {
    if (enPause || nb <= 1) return undefined;
    const t = setTimeout(() => setCourant((c) => (c + 1) % nb), intervalle);
    return () => clearTimeout(t);
  }, [courant, enPause, nb, intervalle]);

  const aller = useCallback((delta) => setCourant((c) => (c + delta + nb) % nb), [nb]);
  const surClavier = (e) => {
    if (nb <= 1) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); aller(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); aller(1); }
  };
  const debutToucher = (e) => { toucher.current = e.touches[0].clientX; };
  const finToucher = (e) => {
    if (toucher.current === null || nb <= 1) return;
    const ecart = e.changedTouches[0].clientX - toucher.current;
    toucher.current = null;
    if (Math.abs(ecart) > 40) aller(ecart < 0 ? 1 : -1);
  };

  // Impression : une fois par publicité et par affichage de la page.
  useEffect(() => {
    const p = pubs[courant];
    if (!p || vues.current.has(p.publicite_id)) return;
    vues.current.add(p.publicite_id);
    signalerEvenementPublicite('impression', [p.publicite_id]);
  }, [courant, pubs]);

  const clic = useCallback((p) => signalerEvenementPublicite('clic', [p.publicite_id]), []);

  // Le bouton « Réserver cet espace » reste visible pour tout visiteur, même
  // sans emplacement configuré (404) ni forfait actif pour la page.
  const lienReservation = `/publicite/reserver?page=${encodeURIComponent(code)}`;
  const placesLibres = (donnees?.emplacement?.nombre_places ?? 0) - nb;

  return (
    <div className={`pub-slider pub-slider--${variante}`}>
      {nb > 0 && (
        <div
          className="pub-slider-cadre"
          onMouseEnter={() => setPause(true)}
          onMouseLeave={() => setPause(false)}
          onFocus={() => setPause(true)}
          onBlur={() => setPause(false)}
          onKeyDown={surClavier}
          onTouchStart={debutToucher}
          onTouchEnd={finToucher}
          role="region"
          aria-roledescription="carrousel"
          aria-label="Publicités"
          style={{ '--pub-intervalle': `${intervalle}ms` }}
        >
          <div className="ad-label">
            <span>Publicité</span>
            {nb > 1 && <span className="pub-slider-compteur">{courant + 1} / {nb}</span>}
          </div>
          <div className="pub-slider-piste" aria-live={enPause ? 'polite' : 'off'}>
            {pubs.map((p, i) => (
              <article
                key={p.publicite_id}
                className={`pub-slide${i === courant ? ' is-actif' : ''}`}
                aria-hidden={i !== courant}
                aria-roledescription="diapositive"
                aria-label={`${i + 1} sur ${nb}`}
              >
                <div className="pub-slide-media" style={{ '--pub-fond': `url("${p.visuel_url}")` }}>
                  <img src={p.visuel_url} alt={p.titre} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
                  {nb > 1 && (
                    <>
                      <button type="button" className="pub-slider-fleche is-prec" onClick={() => aller(-1)}
                        tabIndex={i === courant ? 0 : -1} aria-label="Publicité précédente">
                        <i className="fa-solid fa-chevron-left" />
                      </button>
                      <button type="button" className="pub-slider-fleche is-suiv" onClick={() => aller(1)}
                        tabIndex={i === courant ? 0 : -1} aria-label="Publicité suivante">
                        <i className="fa-solid fa-chevron-right" />
                      </button>
                    </>
                  )}
                </div>
                <div className="ad-card-body">
                  <h4>{p.titre}</h4>
                  {p.description && <p className="pub-slide-description" title={p.description}>{p.description}</p>}
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
            <div className={`pub-slider-points${enPause ? ' is-pause' : ''}`} aria-label="Choisir une publicité">
              {pubs.map((p, i) => (
                // La clé change à chaque passage : la barre de progression repart de zéro.
                <button key={i === courant ? `${p.publicite_id}-${courant}` : p.publicite_id} type="button"
                  aria-current={i === courant} aria-label={`Publicité ${i + 1} : ${p.titre}`}
                  className={i === courant ? 'is-actif' : ''} onClick={() => setCourant(i)} />
              ))}
            </div>
          )}
        </div>
      )}

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
    </div>
  );
}
