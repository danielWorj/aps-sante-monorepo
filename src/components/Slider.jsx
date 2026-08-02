import { useCallback, useEffect, useRef, useState } from 'react';

/* ============================================================
   Slider.jsx — carrousel réutilisable (remplace le carousel Bootstrap)
   Bootstrap JS n'étant pas chargé dans ce projet (seul le CSS l'est),
   ce composant réimplémente le comportement en React pur : autoplay,
   flèches prev/next, indicateurs cliquables, pause au survol.

   Props :
   - slides: [{ image, alt, title, text }]
   - interval: durée d'affichage par slide en ms (défaut 5000)
   - dark: variante "carousel-dark" (indicateurs/texte clairs)
   ============================================================ */

export default function Slider({ slides = [], interval = 5000, dark = true }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);

  const count = slides.length;

  const goTo = useCallback((index) => {
    setCurrent(((index % count) + count) % count);
  }, [count]);

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  useEffect(() => {
    if (paused || count <= 1) return undefined;
    timerRef.current = setTimeout(next, interval);
    return () => clearTimeout(timerRef.current);
  }, [current, paused, interval, next, count]);

  if (count === 0) return null;

  return (
    <div
      className={`aps-slider ${dark ? 'aps-slider-dark' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="aps-slider-track">
        {slides.map((slide, i) => (
          <div
            key={slide.image || i}
            className={`aps-slide ${i === current ? 'is-active' : ''}`}
            aria-hidden={i !== current}
          >
            <img src={slide.image} className="aps-slide-img" alt={slide.alt || ''} />
            {(slide.title || slide.text) && (
              <div className="aps-slide-caption">
                {slide.title && <h3>{slide.title}</h3>}
                {slide.text && <p>{slide.text}</p>}
              </div>
            )}
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button type="button" className="aps-slider-nav prev" aria-label="Précédent" onClick={prev}>
            <i className="fa-solid fa-chevron-left" />
          </button>
          <button type="button" className="aps-slider-nav next" aria-label="Suivant" onClick={next}>
            <i className="fa-solid fa-chevron-right" />
          </button>

          <div className="aps-slider-indicators">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                className={i === current ? 'active' : ''}
                aria-label={`Aller à la diapositive ${i + 1}`}
                aria-current={i === current}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}