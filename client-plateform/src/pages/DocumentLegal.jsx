// src/pages/DocumentLegal.jsx
// Pages publiques /cgu et /confidentialite. Le texte est rédigé par le
// superadmin au back-office (HTML de structure uniquement, nettoyé par le
// serveur) ; toute la mise en forme est faite ici : sommaire généré à
// partir des titres d'articles (h2), typographie, impression.
// L'application mobile ouvre ces pages dans le navigateur du téléphone.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { obtenirDocumentLegal } from '../services/documentLegalService';
import '../assets/styles/info-2026.css';
import '../assets/styles/legal-2026.css';

const DOCUMENTS = {
  cgu: { libelle: "Conditions générales d'utilisation", court: 'CGU', chemin: '/cgu' },
  confidentialite: { libelle: 'Politique de confidentialité', court: 'Confidentialité', chemin: '/confidentialite' },
};

const ECRAN_LARGE = '(min-width: 992px)';

const dateLongue = (iso) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

function ancre(texte, dejaPris) {
  const base = texte
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60) || 'section';
  let id = base;
  for (let n = 2; dejaPris.has(id); n += 1) id = `${base}-${n}`;
  dejaPris.add(id);
  return id;
}

/** Ajoute des ancres aux titres d'articles et prépare les liens externes. */
function preparer(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const racine = doc.body.firstElementChild;
  const pris = new Set();
  const sommaire = [];
  racine.querySelectorAll('h2').forEach((h) => {
    const titre = h.textContent.trim();
    if (!titre) return;
    h.id = ancre(titre, pris);
    sommaire.push({ id: h.id, titre });
  });
  racine.querySelectorAll('a[href]').forEach((a) => {
    if (/^https?:\/\//i.test(a.getAttribute('href'))) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return { html: racine.innerHTML, sommaire };
}

export default function DocumentLegal({ type }) {
  const doc = DOCUMENTS[type];
  const autre = DOCUMENTS[type === 'cgu' ? 'confidentialite' : 'cgu'];
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const version = Number.parseInt(params.get('version'), 10) || undefined;

  // { cle, donnees?, erreur? } : la clé évite d'afficher un document
  // d'une autre page / version pendant le chargement suivant.
  const cle = `${type}:${version ?? ''}`;
  const [etat, setEtat] = useState({ cle: null });
  const [actif, setActif] = useState(null);

  useEffect(() => {
    let annule = false;
    obtenirDocumentLegal(type, version)
      .then((d) => { if (!annule) setEtat({ cle, donnees: d }); })
      .catch((err) => { if (!annule) setEtat({ cle, erreur: err }); });
    return () => { annule = true; };
  }, [type, version, cle]);

  useEffect(() => {
    document.title = `${doc.libelle} — ApSa`;
  }, [doc.libelle]);

  const charge = etat.cle === cle;
  const donnees = charge ? etat.donnees : null;
  const erreur = charge ? etat.erreur : null;
  const contenu = useMemo(() => preparer(donnees?.contenu_html), [donnees]);

  // Article en cours de lecture, surligné dans le sommaire.
  useEffect(() => {
    if (!contenu.sommaire.length) return undefined;
    const observateur = new IntersectionObserver(
      (entrees) => {
        const visible = entrees.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActif(visible.target.id);
      },
      { rootMargin: '-96px 0px -65% 0px' }
    );
    contenu.sommaire.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observateur.observe(el);
    });
    return () => observateur.disconnect();
  }, [contenu]);

  // Liens internes du texte (/contact…) : navigation sans recharger la page.
  function gererClic(e) {
    const a = e.target.closest('a[href]');
    const href = a?.getAttribute('href');
    if (!href || !href.startsWith('/') || href.startsWith('//') || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    navigate(href);
  }

  function allerA(e, id) {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `#${id}`);
    setActif(id);
  }

  const introuvable = erreur?.status === 404;

  return (
    <div className="info26 legal26">
      <section className="info26-hero">
        <div className="container-aps">
          <div className="info26-hero-bloc legal26-entete">
            <nav className="info26-fil" aria-label="Fil d'Ariane">
              <Link to="/home">Accueil</Link>
              <i className="fa-solid fa-chevron-right" />
              <span>{doc.court}</span>
            </nav>
            <span className="aps-over">Informations légales</span>
            <h1 className="aps-h1 legal26-titre">{donnees?.titre || doc.libelle}</h1>
            {donnees && (
              <div className="legal26-meta">
                <span className={`aps-pill ${donnees.en_vigueur ? '' : 'is-amber'}`}>
                  <i className={`fa-solid ${donnees.en_vigueur ? 'fa-circle-check' : 'fa-box-archive'}`} />
                  Version {donnees.numero}
                </span>
                <span>
                  {donnees.en_vigueur
                    ? `En vigueur depuis le ${dateLongue(donnees.date_publication)}`
                    : `En vigueur du ${dateLongue(donnees.date_publication)} au ${dateLongue(donnees.date_archivage)}`}
                </span>
                <button type="button" className="legal26-imprimer" onClick={() => window.print()}>
                  <i className="fa-solid fa-print" /> Imprimer
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="info26-sec info26-sec-fin legal26-corps">
        <div className="container-aps">
          {!charge ? (
            <div className="legal26-chargement" aria-busy="true">
              <span /><span /><span /><span />
            </div>
          ) : introuvable ? (
            <div className="aps-card legal26-vide">
              <span className="aps-ic"><i className="fa-solid fa-file-circle-question" /></span>
              <h2 className="aps-h3 mt-3">
                {version ? `La version ${version} n'existe pas.` : 'Ce document est en cours de rédaction.'}
              </h2>
              <p className="aps-t-s">
                {version
                  ? <>Consultez <Link to={doc.chemin}>la version en vigueur</Link>.</>
                  : <>Pour toute question, <Link to="/contact">contactez-nous</Link>.</>}
              </p>
            </div>
          ) : erreur ? (
            <div className="aps-card legal26-vide">
              <span className="aps-ic is-red"><i className="fa-solid fa-triangle-exclamation" /></span>
              <h2 className="aps-h3 mt-3">Le document n&apos;a pas pu être chargé.</h2>
              <p className="aps-t-s">Vérifiez votre connexion puis rechargez la page.</p>
            </div>
          ) : (
            <div className="legal26-grille">
              {contenu.sommaire.length > 1 && (
                <aside className="legal26-sommaire" aria-label="Sommaire">
                  {/* Ouvert et fixe sur grand écran, repliable sur téléphone. */}
                  <details open={window.matchMedia(ECRAN_LARGE).matches}>
                    <summary onClick={(e) => { if (window.matchMedia(ECRAN_LARGE).matches) e.preventDefault(); }}>
                      Sommaire
                    </summary>
                    <ol>
                      {contenu.sommaire.map((s) => (
                        <li key={s.id}>
                          <a href={`#${s.id}`} className={actif === s.id ? 'is-active' : ''} onClick={(e) => allerA(e, s.id)}>
                            {s.titre}
                          </a>
                        </li>
                      ))}
                    </ol>
                  </details>
                </aside>
              )}

              <article className="legal26-article">
                {!donnees.en_vigueur && (
                  <div className="legal26-encart is-archive">
                    <i className="fa-solid fa-box-archive" />
                    <div>
                      Vous consultez une version archivée.{' '}
                      <Link to={doc.chemin}>Voir la version en vigueur</Link>
                    </div>
                  </div>
                )}
                {donnees.en_vigueur && donnees.resume_modifications && donnees.historique.length > 1 && (
                  <div className="legal26-encart">
                    <i className="fa-solid fa-circle-info" />
                    <div>
                      <strong>Ce qui change dans cette version</strong>
                      <p className="mb-0">{donnees.resume_modifications}</p>
                    </div>
                  </div>
                )}

                {/* HTML nettoyé côté serveur (lib/htmlDocumentLegal.js). */}
                <div className="legal26-texte" onClick={gererClic} dangerouslySetInnerHTML={{ __html: contenu.html }} />

                <footer className="legal26-pied">
                  <p className="aps-t-s mb-2">
                    Voir aussi : <Link to={autre.chemin}>{autre.libelle}</Link> · Une question ?{' '}
                    <Link to="/contact">Contactez-nous</Link>
                  </p>
                  {donnees.historique.length > 1 && (
                    <details className="legal26-historique">
                      <summary>Versions précédentes</summary>
                      <ul>
                        {donnees.historique.map((h) => (
                          <li key={h.numero}>
                            <Link to={h.en_vigueur ? doc.chemin : `${doc.chemin}?version=${h.numero}`}>
                              Version {h.numero}
                            </Link>{' '}
                            — {h.en_vigueur
                              ? `en vigueur depuis le ${dateLongue(h.date_publication)}`
                              : `du ${dateLongue(h.date_publication)} au ${dateLongue(h.date_archivage)}`}
                            {h.numero === donnees.numero && <span className="aps-t-xs"> (affichée)</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </footer>
              </article>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
