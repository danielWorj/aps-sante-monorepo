// Haut de fiche commun (médecin, pharmacie, centre de santé, assurance,
// laboratoire) façon « fiche produit » :
//  - grande image en premier : les photos de la structure en carrousel
//    (doigt ou flèches), son logo en petit badge rond dans le coin ; sans
//    photo, le logo (ou la photo unique) prend toute la place ;
//  - boutons Retour / Partager posés sur l'image ;
//  - puis badges, nom, sous-titre, prix à droite, courte description ;
//  - actions principales : en ligne sur grand écran, barre fixe en bas
//    d'écran sur téléphone.
// Sur grand écran, l'image est à gauche et les informations à droite.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './FicheHero.css';


export default function FicheHero({
  images: photosRecues = [],
  logo, // URL du logo / image principale de la structure
  ajustement: ajustementPhotos = 'cover', // cover (photos) | contain (logos)
  repliIcone = 'fa-image',
  repliTexte,
  retour, // { to, libelle }
  onPartager,
  badges,
  titre,
  sousTitre,
  prix, // { valeur, libelle }
  description,
  complement, // nœud libre sous la description (note, étoiles…)
  actions,
}) {
  const piste = useRef(null);
  const [courant, setCourant] = useState(0);
  const photos = photosRecues.filter((u) => u && u !== logo);
  const images = photos.length ? photos : logo ? [logo] : [];
  const ajustement = photos.length ? ajustementPhotos : logo ? 'contain' : ajustementPhotos;
  const nombre = images.length;

  // L'index suit le défilement (doigt, flèches ou clavier).
  const surDefilement = useCallback(() => {
    const el = piste.current;
    if (!el || !el.clientWidth) return;
    setCourant(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  const allerA = (i) => {
    const el = piste.current;
    if (!el) return;
    const cible = (i + nombre) % nombre;
    el.scrollTo({ left: cible * el.clientWidth, behavior: 'smooth' });
  };

  // Nouvelle fiche (autres images) : on revient à la première.
  const cle = images.join('|');
  const [cleVue, setCleVue] = useState(cle);
  if (cle !== cleVue) {
    setCleVue(cle);
    setCourant(0);
  }
  useEffect(() => {
    if (piste.current) piste.current.scrollLeft = 0;
  }, [cle]);

  return (
    <section className="fiche-hero">
      <div className="container-aps fiche-hero-grille">
        {/* ------------------------------ Image(s) ------------------------------ */}
        <div className="fiche-hero-media">
          {nombre > 0 ? (
            <div
              className="fiche-hero-piste"
              ref={piste}
              onScroll={surDefilement}
              tabIndex={nombre > 1 ? 0 : -1}
              aria-roledescription={nombre > 1 ? 'carrousel' : undefined}
              aria-label={nombre > 1 ? `Photos de ${titre}` : undefined}
            >
              {images.map((src, i) => (
                <div className="fiche-hero-diapo" key={src} aria-hidden={i !== courant}>
                  {ajustement === 'contain' && <img className="fiche-hero-flou" src={src} alt="" aria-hidden="true" />}
                  <img
                    className={`fiche-hero-img is-${ajustement}`}
                    src={src}
                    alt={i === 0 ? titre : `${titre} — photo ${i + 1}`}
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="fiche-hero-repli" aria-hidden="true">
              {repliTexte ? <span>{repliTexte}</span> : <i className={`fa-solid ${repliIcone}`} />}
            </div>
          )}

          {photos.length > 0 && logo && (
            <div className="fiche-hero-logo">
              <img src={logo} alt={`Logo ${titre}`} />
            </div>
          )}

          {/* Boutons posés sur l'image */}
          <div className="fiche-hero-barre">
            {retour ? (
              <Link to={retour.to} className="fiche-hero-rond" aria-label={`Retour : ${retour.libelle}`}>
                <i className="fa-solid fa-chevron-left" />
              </Link>
            ) : <span />}
            {onPartager && (
              <button type="button" className="fiche-hero-rond" aria-label="Partager la fiche" onClick={onPartager}>
                <i className="fa-solid fa-share-nodes" />
              </button>
            )}
          </div>

          {nombre > 1 && (
            <>
              <button type="button" className="fiche-hero-fleche is-gauche" aria-label="Photo précédente" onClick={() => allerA(courant - 1)}>
                <i className="fa-solid fa-chevron-left" />
              </button>
              <button type="button" className="fiche-hero-fleche is-droite" aria-label="Photo suivante" onClick={() => allerA(courant + 1)}>
                <i className="fa-solid fa-chevron-right" />
              </button>
              <div className="fiche-hero-points">
                {images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    className={i === courant ? 'is-actif' : ''}
                    aria-label={`Photo ${i + 1} sur ${nombre}`}
                    aria-current={i === courant}
                    onClick={() => allerA(i)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* ------------------------------ Informations ------------------------------ */}
        <div className="fiche-hero-infos">
          {badges && <div className="fiche-hero-badges">{badges}</div>}
          <div className="fiche-hero-titre">
            <h1>{titre}</h1>
            {prix?.valeur && (
              <div className="fiche-hero-prix">
                <strong>{prix.valeur}</strong>
                {prix.libelle && <span>{prix.libelle}</span>}
              </div>
            )}
          </div>
          {sousTitre && <p className="fiche-hero-sous-titre">{sousTitre}</p>}
          {description && <p className="fiche-hero-description">{description}</p>}
          {complement}
          {actions && <div className="fiche-hero-actions">{actions}</div>}
        </div>
      </div>
    </section>
  );
}
