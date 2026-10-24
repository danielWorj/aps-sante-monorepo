// presence-horaires.jsx — portails pharmacie et centre de santé, « Horaires ».
//
// Horaires d'ouverture par jour (jusqu'à 4 plages : matin, après-midi…),
// 24 h/24, note libre (« Fermé les jours fériés ») et, pour un centre, service
// d'urgences 24 h/24. Les horaires sont TOUJOURS publics, quel que soit
// l'abonnement, et s'enregistrent sans nouvelle vérification de la fiche.
// Une plage ne passe pas minuit : une ouverture de nuit se saisit sur deux
// jours (20:00 → 00:00, puis 00:00 → 08:00 le lendemain).
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useConfirmation, useToast } from '../../feedback';
import { PresencePortailPage } from '../layouts/presence.portail-sidebar';
import { JOURS_SEMAINE, enregistrerHoraires, libelleOuverture, plagesEnTexte } from '../../../services/espacePresenceService';

const MAX_PLAGES = 4;
const PLAGE_PAR_DEFAUT = { debut: '08:00', fin: '18:00' };
const JOUR_ENTIER = { debut: '00:00', fin: '24:00' };
const OUVRABLES = ['mardi', 'mercredi', 'jeudi', 'vendredi'];

const estJourEntier = (plages) => plages.length === 1 && plages[0].debut === '00:00' && plages[0].fin === '24:00';

// Un champ <input type="time"> ne sait pas afficher 24:00 : minuit en fin de plage s'affiche 00:00.
const versChamp = (h) => (h === '24:00' ? '00:00' : h);
const depuisChamp = (h, cote) => (cote === 'fin' && h === '00:00' ? '24:00' : h);

function semaineDepuis(horaires) {
  return Object.fromEntries(JOURS_SEMAINE.map(([j]) => [j, (horaires?.[j] ?? []).map((p) => ({ ...p }))]));
}

function verifier(semaine) {
  for (const [jour, nom] of JOURS_SEMAINE) {
    const plages = [...semaine[jour]].sort((a, b) => a.debut.localeCompare(b.debut));
    for (let i = 0; i < plages.length; i += 1) {
      const { debut, fin } = plages[i];
      if (!debut || !fin) return `${nom} : renseignez l'heure d'ouverture et de fermeture.`;
      if (fin !== '24:00' && fin <= debut) return `${nom} : la fermeture (${fin}) doit suivre l'ouverture (${debut}). Pour une ouverture de nuit, fermez à 00:00 et reprenez le lendemain à 00:00.`;
      if (i > 0 && debut < plages[i - 1].fin) return `${nom} : les plages se chevauchent.`;
    }
  }
  return null;
}

function LigneJour({ jour, nom, plages, onChange }) {
  const ouvert = plages.length > 0;
  const entier = estJourEntier(plages);
  const majPlage = (i, cote, valeur) => onChange(plages.map((p, k) => (k === i ? { ...p, [cote]: depuisChamp(valeur, cote) } : p)));

  return (
    <div className="py-3 border-bottom">
      <div className="d-flex align-items-center flex-wrap gap-3">
        <strong style={{ minWidth: 90 }}>{nom}</strong>
        <div className="form-check form-switch mb-0">
          <input id={`h-${jour}-ouvert`} type="checkbox" role="switch" className="form-check-input" checked={ouvert}
            onChange={(e) => onChange(e.target.checked ? [{ ...PLAGE_PAR_DEFAUT }] : [])} />
          <label className="form-check-label" htmlFor={`h-${jour}-ouvert`}>{ouvert ? 'Ouvert' : 'Fermé'}</label>
        </div>
        {ouvert && (
          <div className="form-check mb-0">
            <input id={`h-${jour}-24`} type="checkbox" className="form-check-input" checked={entier}
              onChange={(e) => onChange(e.target.checked ? [{ ...JOUR_ENTIER }] : [{ ...PLAGE_PAR_DEFAUT }])} />
            <label className="form-check-label" htmlFor={`h-${jour}-24`}>24 h/24</label>
          </div>
        )}
      </div>
      {ouvert && !entier && (
        <div className="d-flex flex-column gap-2 mt-2">
          {plages.map((p, i) => (
            <div key={i} className="d-flex align-items-center gap-2 flex-wrap">
              <input type="time" className="form-control form-control-sm" style={{ maxWidth: 130 }} value={versChamp(p.debut)}
                onChange={(e) => majPlage(i, 'debut', e.target.value)} aria-label={`${nom}, ouverture ${i + 1}`} required />
              <span className="text-faint">→</span>
              <input type="time" className="form-control form-control-sm" style={{ maxWidth: 130 }} value={versChamp(p.fin)}
                onChange={(e) => majPlage(i, 'fin', e.target.value)} aria-label={`${nom}, fermeture ${i + 1}`} required />
              {plages.length > 1 && (
                <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => onChange(plages.filter((_, k) => k !== i))}
                  aria-label="Retirer cette plage" title="Retirer cette plage">
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>
          ))}
          {plages.length < MAX_PLAGES && (
            <button type="button" className="btn btn-link btn-sm p-0 align-self-start"
              onClick={() => onChange([...plages, { debut: plages.at(-1)?.fin === '24:00' ? '00:00' : plages.at(-1)?.fin ?? '14:00', fin: '19:00' }])}>
              <i className="fa-solid fa-plus" /> Ajouter une plage (ex. après-midi)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PresenceHoraires() {
  const { type, fiche, rechargerFiche } = useOutletContext();
  const toast = useToast();
  const confirmer = useConfirmation();
  const [semaine, setSemaine] = useState(() => semaineDepuis(fiche.horaires));
  const [note, setNote] = useState(fiche.horaires_note ?? '');
  const [urgences, setUrgences] = useState(!!fiche.urgences_24h);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const renseignes = !!fiche.horaires;

  const majJour = (jour) => (plages) => setSemaine((s) => ({ ...s, [jour]: plages }));

  const enregistrer = async (e) => {
    e.preventDefault();
    const probleme = verifier(semaine);
    if (probleme) return setErreur(probleme);
    setErreur(null);
    setEnvoi(true);
    try {
      await enregistrerHoraires(type, fiche.acteur_id, {
        horaires: semaine,
        horaires_note: note.trim(),
        ...(type === 'structure' ? { urgences_24h: urgences } : {}),
      });
      toast.succes('Horaires enregistrés : ils sont déjà visibles sur votre fiche.');
      rechargerFiche();
    } catch (err) {
      setErreur(err?.message || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
    return undefined;
  };

  const effacer = async () => {
    const ok = await confirmer({
      titre: 'Effacer les horaires',
      message: 'Votre fiche affichera « Horaires non renseignés ».',
      labelConfirmer: 'Effacer',
      variante: 'danger',
    });
    if (!ok) return;
    try {
      await enregistrerHoraires(type, fiche.acteur_id, { horaires: null });
      setSemaine(semaineDepuis(null));
      toast.succes('Horaires effacés.');
      rechargerFiche();
    } catch (err) {
      toast.erreur(err?.message || 'Effacement impossible.');
    }
  };

  const actions = (
    <>
      <button type="button" className="btn btn-outline-primary btn-sm-aps"
        onClick={() => setSemaine((s) => ({ ...s, ...Object.fromEntries(OUVRABLES.map((j) => [j, s.lundi.map((p) => ({ ...p }))])) }))}>
        <i className="fa-solid fa-copy" /> Copier le lundi jusqu&apos;au vendredi
      </button>
      <button type="button" className="btn btn-outline-primary btn-sm-aps"
        onClick={() => setSemaine(Object.fromEntries(JOURS_SEMAINE.map(([j]) => [j, [{ ...JOUR_ENTIER }]])))}>
        <i className="fa-solid fa-infinity" /> 24 h/24, 7 j/7
      </button>
    </>
  );

  return (
    <PresencePortailPage
      titre="Horaires"
      description="Vos heures d'ouverture, toujours visibles du public. Elles s'affichent sur votre fiche dès l'enregistrement."
      actions={actions}
    >
      <form className="d-flex flex-column gap-4" onSubmit={enregistrer}>
        {renseignes && fiche.ouverture && (
          <div className="banner-institutionnel">
            <i className="fa-solid fa-clock" />
            <span>En ce moment : <strong>{libelleOuverture(fiche.ouverture)}</strong> (heure de {fiche.pays?.nom ?? 'votre pays'}).</span>
          </div>
        )}
        <div className="info-card">
          <h3><i className="fa-solid fa-calendar-week" /> Semaine type</h3>
          {JOURS_SEMAINE.map(([jour, nom]) => (
            <LigneJour key={jour} jour={jour} nom={nom} plages={semaine[jour]} onChange={majJour(jour)} />
          ))}
          <p className="minimal-note mt-3 mb-0">
            Une plage ne passe pas minuit : pour une ouverture de nuit, fermez à 00:00 et ajoutez une plage 00:00 → … le lendemain.
          </p>
        </div>

        <div className="info-card">
          <h3><i className="fa-solid fa-circle-info" /> Précisions</h3>
          <label className="form-label" htmlFor="h-note">Note affichée avec les horaires <span className="text-faint">(facultatif)</span></label>
          <input id="h-note" className="form-control" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Ex. Fermé les jours fériés · Garde selon le planning officiel" />
          {type === 'structure' && (
            <div className="form-check form-switch mt-3">
              <input id="h-urgences" type="checkbox" role="switch" className="form-check-input" checked={urgences} onChange={(e) => setUrgences(e.target.checked)} />
              <label className="form-check-label" htmlFor="h-urgences">Service d&apos;urgences ouvert 24 h/24, 7 j/7</label>
            </div>
          )}
        </div>

        <div className="info-card">
          <h3><i className="fa-solid fa-eye" /> Aperçu public</h3>
          <table className="hours-table" style={{ width: '100%' }}>
            <tbody>
              {JOURS_SEMAINE.map(([jour, nom]) => (
                <tr key={jour}><td>{nom}</td><td>{plagesEnTexte(semaine[jour])}</td></tr>
              ))}
            </tbody>
          </table>
          {note.trim() && <p className="minimal-note mt-2 mb-0">{note.trim()}</p>}
        </div>

        {erreur && <div className="alert alert-danger mb-0">{erreur}</div>}
        <div className="d-flex justify-content-between flex-wrap gap-2">
          {renseignes
            ? <button type="button" className="btn btn-ghost btn-sm-aps" onClick={effacer}><i className="fa-solid fa-eraser" /> Effacer les horaires</button>
            : <span />}
          <button type="submit" className="btn btn-primary btn-sm-aps" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer les horaires'}</button>
        </div>
      </form>
    </PresencePortailPage>
  );
}
