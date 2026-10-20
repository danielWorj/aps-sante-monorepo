// ListeAnnonces.jsx — « Annonces reçues », commune à tous les portails.
//
// Annonces publiées par APS Santé depuis le back-office (GET /annonces,
// route publique). « En cours » = actives et non expirées ; « Toutes »
// ajoute les expirées (les annonces désactivées ne sont jamais montrées).
// Ouvrir la page marque les annonces comme vues (voir annoncesVues.js) ;
// l'étiquette « Nouveau » reste visible pendant cette visite.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { listerAnnonces } from '../../services/annonceService';
import { derniereVisite, estNouvelle, marquerAnnoncesVues } from './annoncesVues';
import './annonces.css';

const ONGLETS = [
  { cle: 'en_cours', libelle: 'En cours' },
  { cle: 'toutes', libelle: 'Toutes' },
];

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function dateFin(annonce) {
  const fin = new Date(annonce.date_creation);
  fin.setDate(fin.getDate() + annonce.jour_validite);
  return fin.toISOString();
}

const estPdf = (url) => /\.pdf($|\?)/i.test(url ?? '');

function CarteAnnonce({ annonce, nouvelle }) {
  const pdf = estPdf(annonce.file_url);
  return (
    <article className={`info-card annonce-carte ${annonce.expiree ? 'is-expiree' : ''}`}>
      <div className="annonce-visuel">
        {annonce.file_url && !pdf ? (
          <img src={annonce.file_url} alt="" loading="lazy" />
        ) : (
          <i className={`fa-solid ${pdf ? 'fa-file-pdf' : 'fa-bullhorn'}`} />
        )}
      </div>
      <div className="annonce-corps">
        <div className="annonce-entete">
          <h2>{annonce.libelle}</h2>
          {nouvelle && !annonce.expiree && <span className="chip chip-verifie">Nouveau</span>}
          {annonce.expiree && <span className="chip chip-complet">Expirée</span>}
        </div>
        <div className="annonce-meta">
          <span><i className="fa-solid fa-calendar-days" /> Publiée le {formatDate(annonce.date_creation)}</span>
          {!annonce.expiree && (
            <span><i className="fa-solid fa-hourglass-half" /> Jusqu'au {formatDate(dateFin(annonce))}</span>
          )}
        </div>
        {(annonce.courte_description || annonce.description) && (
          <p className="annonce-texte">{annonce.courte_description || annonce.description}</p>
        )}
        <div className="annonce-actions">
          <Link to={`/annonces/${annonce.id}`} className="btn btn-outline-primary btn-sm-aps">
            Lire l'annonce
          </Link>
          {pdf && (
            <a href={annonce.file_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm-aps">
              <i className="fa-solid fa-file-pdf" /> Ouvrir le PDF
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ListeAnnonces() {
  const { user } = useAuth();
  const [onglet, setOnglet] = useState('en_cours');
  const [annonces, setAnnonces] = useState(null);
  const [erreur, setErreur] = useState(null);
  // Figée à l'ouverture : les annonces nouvelles le restent pendant la visite.
  const [depuis] = useState(() => derniereVisite(user));

  const charger = useCallback(
    () =>
      listerAnnonces({ statut: true })
        .then((liste) => { setAnnonces(Array.isArray(liste) ? liste : []); setErreur(null); })
        .catch((err) => setErreur(err?.message || 'Annonces indisponibles.')),
    []
  );

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (annonces) marquerAnnoncesVues(user);
  }, [annonces, user]);

  const visibles = (annonces ?? []).filter((a) => onglet === 'toutes' || !a.expiree);

  return (
    <div className="annonces-liste">
      <div className="tdb-segment mb-3" role="group" aria-label="Période">
        {ONGLETS.map((o) => (
          <button key={o.cle} type="button" className={onglet === o.cle ? 'is-actif' : ''} aria-pressed={onglet === o.cle} onClick={() => setOnglet(o.cle)}>
            {o.libelle}
          </button>
        ))}
      </div>

      {erreur && (
        <div className="alert alert-danger d-flex align-items-center" role="alert">
          <i className="fa-solid fa-circle-exclamation me-2" />
          <div className="flex-grow-1">{erreur}</div>
          <button className="btn btn-sm btn-outline-danger" onClick={charger}>Réessayer</button>
        </div>
      )}
      {!annonces && !erreur && <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>}

      {annonces && visibles.length === 0 && (
        <div className="aps-empty-state">
          <i className="fa-solid fa-bullhorn" />
          <div>{onglet === 'en_cours' ? "Aucune annonce en cours pour le moment." : "Aucune annonce reçue pour le moment."}</div>
        </div>
      )}

      {visibles.map((a) => (
        <CarteAnnonce key={a.id} annonce={a} nouvelle={estNouvelle(a, depuis)} />
      ))}
    </div>
  );
}
