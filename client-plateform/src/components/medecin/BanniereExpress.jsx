// src/components/medecin/BanniereExpress.jsx
// Bannière « Rendez-vous express » posée juste au-dessus de la liste des
// médecins (page /medecin). Explique le principe de la demande rapide
// (RDV aléatoire) et mène à /demande-rapide ; `lien` transporte déjà la
// spécialité, le pays et la ville filtrés.
import { Link } from 'react-router-dom';

const ETAPES = [
  { icone: 'fa-pen-to-square', texte: 'Décrivez votre besoin : spécialité, ville, jour et heure' },
  { icone: 'fa-user-doctor', texte: 'Les médecins disponibles vous répondent avec leur tarif' },
  { icone: 'fa-circle-check', texte: 'Choisissez votre médecin et payez pour confirmer' },
];

export default function BanniereExpress({ lien = '/demande-rapide' }) {
  return (
    <section className="express26" aria-labelledby="express26-titre">
      <div className="express26-corps">
        <span className="express26-eyebrow">
          <i className="fa-solid fa-bolt" /> Rendez-vous express
        </span>
        <h2 id="express26-titre">Pas le temps de chercher ? Laissez les médecins venir à vous.</h2>
        <p>
          Publiez une seule demande : les médecins disponibles à l&apos;heure qui vous arrange vous proposent
          leurs services. Vous comparez leurs profils et leurs tarifs, puis vous choisissez.
        </p>
        <ol className="express26-etapes">
          {ETAPES.map((e, i) => (
            <li key={e.icone}>
              <span className="express26-num">{i + 1}</span>
              <span>{e.texte}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="express26-action">
        <Link to={lien} className="express26-btn">
          <i className="fa-solid fa-bolt" /> Faire une demande express
          <i className="fa-solid fa-arrow-right" />
        </Link>
        <span className="express26-note">
          <i className="fa-solid fa-clock" /> Moins d&apos;une minute à remplir
        </span>
      </div>
    </section>
  );
}
