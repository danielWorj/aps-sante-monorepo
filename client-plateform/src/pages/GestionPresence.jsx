// GestionPresence.jsx — espace gestionnaire d'une pharmacie ou d'un centre
// de santé (abonnement de présence). Routes /pharmacie/:id/gestion et
// /structure-sante/:id/gestion, protégées par RequireAuth ; le serveur
// n'autorise que l'agent de la fiche ou un administrateur.
//
// Les contenus enrichis sont lus dans la vue /gestion, JAMAIS dans les GET
// publics (qui les masquent hors droits) : la donnée est conservée et
// réapparaît au public dès l'activation d'un abonnement.
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/feedback';
import { Link, useParams } from 'react-router-dom';
import { obtenirGestionPresence, LIBELLES_AVANTAGES } from '../services/abonnementPresenceService';
import { modifierPharmacie } from '../services/pharmacieService';
import { modifierCentreSante } from '../services/structureSanteService';
import MonAbonnementPresence from '../components/abonnements/MonAbonnementPresence';
import StatistiquesFichePresence from '../components/abonnements/StatistiquesFichePresence';

const CONFIG = {
  pharmacie: {
    titre: 'Ma pharmacie',
    fichePublique: (id) => `/pharmacie/${id}`,
    champs: [
      // [champ, libellé, aide, droit qui l'expose au public]
      ['description_enrichie', 'Description de l’officine', 'Présentation factuelle : horaires détaillés, accès, langues parlées…', 'description_enrichie'],
      ['services_particuliers', 'Services particuliers', 'Ex. : préparations magistrales, tests rapides, livraison, matériel médical…', 'description_enrichie'],
    ],
    enregistrer: (id, champs) => modifierPharmacie(id, champs),
  },
  structure: {
    titre: 'Mon centre de santé',
    fichePublique: (id) => `/structure-sante/${id}`,
    champs: [
      ['description_enrichie', 'Présentation et spécialités', 'Spécialités, plateau technique, horaires détaillés, accès…', 'description_enrichie'],
      ['presentation_equipe', 'Présentation de l’équipe', 'Médecins, services, responsables… (informations factuelles)', 'presentation_equipe'],
    ],
    enregistrer: (id, champs) => modifierCentreSante(id, champs),
  },
};

function ContenusEnrichis({ type, donnees, onEnregistre }) {
  const config = CONFIG[type];
  const [valeurs, setValeurs] = useState(() =>
    Object.fromEntries(config.champs.map(([cle]) => [cle, donnees.contenus[cle] ?? '']))
  );
  const [envoi, setEnvoi] = useState(false);
  const toast = useToast();
  const [erreur, setErreur] = useState(null);

  const enregistrer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await config.enregistrer(donnees.fiche.acteur_id, valeurs);
      toast.succes('Contenus enregistrés. Votre fiche repasse en vérification par ApSa avant publication.', { duree: 6000 });
      onEnregistre();
    } catch (err) {
      setErreur(err?.message || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  const droits = donnees.droits;
  return (
    <form className="info-card mb-3" onSubmit={enregistrer}>
      <h3><i className="fa-solid fa-pen-to-square" /> Informations enrichies</h3>
      <p className="minimal-note">
        Ces informations sont toujours conservées. Elles ne sont visibles du public qu&apos;avec un abonnement actif qui
        les inclut, après contrôle qualité par ApSa. Restez factuel : aucun message promotionnel.
      </p>
      {config.champs.map(([cle, libelle, aide, droit]) => (
        <div className="mb-3" key={cle}>
          <label className="form-label-aps" htmlFor={`contenu-${cle}`}>
            {libelle}{' '}
            <span className={`badge ${droits[droit] ? 'bg-success' : 'bg-secondary'}`}>
              {droits[droit] ? 'Visible' : 'Masqué au public'}
            </span>
          </label>
          <textarea
            id={`contenu-${cle}`}
            className="form-control"
            rows={4}
            maxLength={5000}
            placeholder={aide}
            value={valeurs[cle]}
            onChange={(e) => setValeurs((v) => ({ ...v, [cle]: e.target.value }))}
          />
        </div>
      ))}
      {erreur && <p className="status-card-error"><i className="fa-solid fa-circle-exclamation" /> {erreur}</p>}
      <button type="submit" className="btn btn-primary btn-sm-aps" disabled={envoi}>
        {envoi ? <><i className="fa-solid fa-spinner fa-spin" /> Enregistrement…</> : 'Enregistrer'}
      </button>
    </form>
  );
}

function CeQueVoitLePublic({ donnees }) {
  const { droits, contenus } = donnees;
  const lignes = [
    ['Nom, adresse, localisation', true],
    ['Téléphone', droits.contact_direct, contenus.telephone],
    ['Photo', droits.photos],
    ...Object.entries(LIBELLES_AVANTAGES)
      .filter(([cle]) => ['description_enrichie', 'presentation_equipe'].includes(cle))
      .map(([cle, libelle]) => [libelle, droits[cle]]),
  ];
  return (
    <div className="info-card mb-3">
      <h3><i className="fa-solid fa-eye" /> Ce que voit le public</h3>
      <ul className="list-unstyled mb-0" style={{ fontSize: '.9rem' }}>
        {lignes.map(([libelle, visible, detail]) => (
          <li key={libelle}>
            <i className={`fa-solid ${visible ? 'fa-check text-success' : 'fa-eye-slash text-muted'} me-2`} />
            {libelle}{detail ? ` (${detail})` : ''} — {visible ? 'visible' : 'masqué'}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function GestionPresence({ type }) {
  const { id } = useParams();
  const config = CONFIG[type];
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(() => {
    obtenirGestionPresence(type, id)
      .then((d) => { setDonnees(d); setErreur(null); })
      .catch((err) => setErreur(err?.status === 403 ? 'Accès réservé au gestionnaire de cette fiche.' : err?.message || 'Chargement impossible.'));
  }, [type, id]);
  useEffect(() => { charger(); }, [charger]);

  if (erreur) {
    return (
      <div className="container-aps status-page">
        <div className="status-card is-neutral">
          <div className="status-card-icon"><i className="fa-solid fa-lock" /></div>
          <h1>{config.titre}</h1>
          <p className="status-card-text">{erreur}</p>
        </div>
      </div>
    );
  }
  if (!donnees) {
    return <div className="container-aps" style={{ padding: '3rem 0' }}><p className="minimal-note">Chargement…</p></div>;
  }

  return (
    <section style={{ padding: '2.5rem 0' }}>
      <div className="container-aps">
        <span className="eyebrow">{config.titre}</span>
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <h1 style={{ fontSize: '1.6rem', margin: 0 }}>{donnees.fiche.nom}</h1>
          <Link to={config.fichePublique(donnees.fiche.acteur_id)} className="btn btn-outline-primary btn-sm-aps">
            <i className="fa-solid fa-arrow-up-right-from-square" /> Voir ma fiche publique
          </Link>
        </div>
        <div className="row g-4">
          <div className="col-lg-7">
            <MonAbonnementPresence type={type} donnees={donnees} onRecharger={charger} />
            <ContenusEnrichis key={donnees.fiche.statut_verification} type={type} donnees={donnees} onEnregistre={charger} />
          </div>
          <div className="col-lg-5">
            <CeQueVoitLePublic donnees={donnees} />
            <StatistiquesFichePresence type={type} acteurId={donnees.fiche.acteur_id} />
          </div>
        </div>
      </div>
    </section>
  );
}
