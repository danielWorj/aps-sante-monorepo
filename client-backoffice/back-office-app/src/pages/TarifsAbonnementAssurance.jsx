// src/pages/TarifsAbonnementAssurance.jsx
//
// Prix des abonnements assurance, pilotés sans déploiement (EF-ADM-03 —
// guide abonnements v3, §3.1.2 et §3.2.2) :
//   1. grille niveau × pays × type d'acteur (devise locale en minuscules,
//      contre-valeur USD indicative). Une ligne « tous types » sert de
//      tarif générique ; une ligne par type d'acteur l'emporte sur elle ;
//   2. remises par durée (une durée absente n'est pas proposée) ;
//   3. paramètres par pays : gratuité d'amorçage et durée de grâce.
// Un changement de prix n'est JAMAIS rétroactif : le prix est figé sur
// chaque abonnement à sa création.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfirmation, useToast } from '../components/feedback';
import './../assets/style/Referentiel.css';
import FondsModal from '../components/FondsModal';
import { listerPays } from '../services/referentielService';
import {
  listerNiveaux,
  listerTarifs,
  enregistrerTarif,
  listerRemises,
  enregistrerRemises,
  supprimerRemise,
  listerConfigs,
  enregistrerConfig,
  dateCourte,
} from '../services/abonnementAssuranceService';
import { montantDevise } from '../utils/fonds';

const TYPES_ACTEUR = [
  ['', 'Tous types (générique)'],
  ['compagnie', 'Compagnie'],
  ['courtier', 'Courtier'],
];

const TARIF_VIDE = { niveau_id: '', pays_id: '', type_acteur: '', devise: 'xaf', prix_mensuel: '', prix_usd_indicatif: '', actif: true };

function Tarifs({ niveaux, pays }) {
  const [paysFiltre, setPaysFiltre] = useState('');
  const [tarifs, setTarifs] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [form, setForm] = useState(null);
  const [erreurForm, setErreurForm] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  // Pas de setState synchrone : appelée depuis un effet (react-hooks/set-state-in-effect).
  const charger = useCallback(
    () =>
      listerTarifs(paysFiltre)
        .then((t) => { setTarifs(t); setErreur(null); })
        .catch((err) => setErreur(err.message || 'Chargement impossible.'))
        .finally(() => setChargement(false)),
    [paysFiltre]
  );
  useEffect(() => { charger(); }, [charger]);

  const ouvrir = (t) => {
    setErreurForm(null);
    setForm(t
      ? {
          niveau_id: t.niveau_id,
          pays_id: t.pays_id,
          type_acteur: t.type_acteur ?? '',
          devise: t.devise,
          prix_mensuel: String(Number(t.prix_mensuel)),
          prix_usd_indicatif: t.prix_usd_indicatif == null ? '' : String(Number(t.prix_usd_indicatif)),
          actif: t.actif,
          existant: true,
        }
      : { ...TARIF_VIDE, pays_id: paysFiltre });
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    setErreurForm(null);
    setEnvoi(true);
    try {
      await enregistrerTarif({
        niveau_id: form.niveau_id,
        pays_id: form.pays_id,
        type_acteur: form.type_acteur || null,
        devise: form.devise.trim().toLowerCase(),
        prix_mensuel: Number(form.prix_mensuel),
        prix_usd_indicatif: form.prix_usd_indicatif === '' ? null : Number(form.prix_usd_indicatif),
        actif: form.actif,
      });
      setForm(null);
      await charger();
    } catch (err) {
      setErreurForm(err.message || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  const maj = (champ, valeur) => setForm((f) => ({ ...f, [champ]: valeur }));

  return (
    <div className="aps-card mb-4">
      <div className="aps-toolbar p-3 d-flex gap-3 align-items-center flex-wrap">
        <h2 className="h6 mb-0 me-auto"><i className="fa-solid fa-tags me-2"></i>Grille de tarifs mensuels</h2>
        <select className="form-select" style={{ maxWidth: 240 }} value={paysFiltre} onChange={(e) => setPaysFiltre(e.target.value)}>
          <option value="">Tous les pays</option>
          {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => ouvrir(null)} disabled={!niveaux.length}>
          <i className="fa-solid fa-plus me-2"></i>Ligne de tarif
        </button>
      </div>
      {erreur && <div className="alert alert-danger m-3">{erreur}</div>}
      <div className="aps-table-wrap">
        <table className="table aps-table">
          <thead>
            <tr><th>Pays</th><th>Niveau</th><th>Type d&apos;acteur</th><th className="text-end">Prix / mois</th><th className="text-end">USD indicatif</th><th>Statut</th><th></th></tr>
          </thead>
          <tbody>
            {chargement ? (
              <tr><td colSpan={7}><div className="aps-empty-mini">Chargement…</div></td></tr>
            ) : tarifs.length === 0 ? (
              <tr><td colSpan={7}><div className="aps-empty-mini">Aucun tarif : sans tarif, la souscription en ligne est indisponible dans ce pays.</div></td></tr>
            ) : tarifs.map((t) => (
              <tr key={t.tarif_id}>
                <td>{t.pays?.nom}</td>
                <td>{t.niveau?.libelle}</td>
                <td>{TYPES_ACTEUR.find(([v]) => v === (t.type_acteur ?? ''))?.[1]}</td>
                <td className="text-end"><strong>{montantDevise(t.prix_mensuel, t.devise)}</strong></td>
                <td className="text-end">{t.prix_usd_indicatif == null ? '—' : `${Number(t.prix_usd_indicatif)} USD`}</td>
                <td><span className={`aps-badge ${t.actif ? 'is-success' : 'is-neutral'}`}>{t.actif ? 'Actif' : 'Inactif'}</span></td>
                <td className="text-end"><button className="btn btn-sm btn-light" onClick={() => ouvrir(t)}><i className="fa-solid fa-pen"></i></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FondsModal
        titre={form?.existant ? 'Modifier le tarif' : 'Nouvelle ligne de tarif'}
        ouvert={!!form}
        occupe={envoi}
        onFermer={() => setForm(null)}
        pied={
          <>
            <button className="btn btn-light" onClick={() => setForm(null)} disabled={envoi}>Annuler</button>
            <button className="btn btn-primary" type="submit" form="form-tarif" disabled={envoi}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}Enregistrer
            </button>
          </>
        }
      >
        {form && (
          <form id="form-tarif" onSubmit={enregistrer}>
            {erreurForm && <div className="alert alert-danger">{erreurForm}</div>}
            <div className="mb-2">
              <label className="form-label" htmlFor="t-pays">Pays</label>
              <select id="t-pays" className="form-select" required disabled={form.existant} value={form.pays_id} onChange={(e) => maj('pays_id', e.target.value)}>
                <option value="">— Choisir —</option>
                {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
              </select>
            </div>
            <div className="mb-2">
              <label className="form-label" htmlFor="t-niveau">Niveau</label>
              <select id="t-niveau" className="form-select" required disabled={form.existant} value={form.niveau_id} onChange={(e) => maj('niveau_id', e.target.value)}>
                <option value="">— Choisir —</option>
                {niveaux.map((n) => <option key={n.niveau_id} value={n.niveau_id}>{n.libelle}</option>)}
              </select>
            </div>
            <div className="mb-2">
              <label className="form-label" htmlFor="t-type">Type d&apos;acteur</label>
              <select id="t-type" className="form-select" disabled={form.existant} value={form.type_acteur} onChange={(e) => maj('type_acteur', e.target.value)}>
                {TYPES_ACTEUR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="row g-2 mb-2">
              <div className="col-4">
                <label className="form-label" htmlFor="t-devise">Devise</label>
                <input id="t-devise" className="form-control" required maxLength={3} value={form.devise} onChange={(e) => maj('devise', e.target.value)} />
              </div>
              <div className="col-8">
                <label className="form-label" htmlFor="t-prix">Prix mensuel</label>
                <input id="t-prix" type="number" min="1" step="any" className="form-control" required value={form.prix_mensuel} onChange={(e) => maj('prix_mensuel', e.target.value)} />
              </div>
            </div>
            <div className="mb-2">
              <label className="form-label" htmlFor="t-usd">Contre-valeur USD indicative (facultatif)</label>
              <input id="t-usd" type="number" min="0" step="any" className="form-control" value={form.prix_usd_indicatif} onChange={(e) => maj('prix_usd_indicatif', e.target.value)} />
            </div>
            <div className="form-check form-switch">
              <input id="t-actif" type="checkbox" className="form-check-input" checked={form.actif} onChange={(e) => maj('actif', e.target.checked)} />
              <label className="form-check-label" htmlFor="t-actif">Actif</label>
            </div>
            <small className="aps-text-muted d-block mt-2">
              Au Cameroun, saisissez la devise <strong>xaf</strong> : le Mobile Money (CamPay) n&apos;accepte que le XAF.
              Le nouveau prix ne s&apos;applique qu&apos;aux abonnements créés ensuite.
            </small>
          </form>
        )}
      </FondsModal>
    </div>
  );
}

function Remises() {
  const confirmer = useConfirmation();
  const toast = useToast();
  const [lignes, setLignes] = useState([]);
  const [nouvelle, setNouvelle] = useState({ duree_mois: '', remise_pourcent: '' });
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(
    () =>
      listerRemises()
        .then((r) => setLignes(r.map((x) => ({ duree_mois: x.duree_mois, remise_pourcent: String(Number(x.remise_pourcent)) }))))
        .catch((err) => setErreur(err.message || 'Chargement impossible.')),
    []
  );
  useEffect(() => { charger(); }, [charger]);

  const enregistrer = async () => {
    setErreur(null);
    setEnvoi(true);
    try {
      const aEnvoyer = lignes.map((l) => ({ duree_mois: l.duree_mois, remise_pourcent: Number(l.remise_pourcent) }));
      if (nouvelle.duree_mois !== '') {
        aEnvoyer.push({ duree_mois: Number(nouvelle.duree_mois), remise_pourcent: Number(nouvelle.remise_pourcent || 0) });
      }
      await enregistrerRemises(aEnvoyer);
      setNouvelle({ duree_mois: '', remise_pourcent: '' });
      toast.succes('Remises enregistrées.');
      await charger();
    } catch (err) {
      setErreur(err.message || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async (duree) => {
    const ok = await confirmer({
      titre: 'Retirer cette durée',
      message: `La durée de ${duree} mois ne sera plus proposée à la vente.`,
      labelConfirmer: 'Retirer',
      variante: 'danger',
    });
    if (!ok) return;
    try {
      await supprimerRemise(duree);
      toast.succes(`Durée de ${duree} mois retirée de la vente.`);
      await charger();
    } catch (err) {
      setErreur(err.message || 'Suppression impossible.');
    }
  };

  return (
    <div className="aps-card mb-4">
      <div className="aps-card__body">
        <h2 className="h6"><i className="fa-solid fa-percent me-2"></i>Durées proposées et remises</h2>
        <p className="aps-text-muted small">Une durée absente de ce tableau n&apos;est pas proposée à la vente. Proposition : 0 / 5 / 10 / 15 % pour 1 / 3 / 6 / 12 mois (à valider).</p>
        {erreur && <div className="alert alert-danger">{erreur}</div>}
        <table className="table aps-table" style={{ maxWidth: 520 }}>
          <thead><tr><th>Durée (mois)</th><th>Remise (%)</th><th></th></tr></thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={l.duree_mois}>
                <td>{l.duree_mois}</td>
                <td>
                  <input type="number" min="0" max="99.99" step="any" className="form-control form-control-sm" value={l.remise_pourcent}
                    onChange={(e) => setLignes((ls) => ls.map((x, j) => (j === i ? { ...x, remise_pourcent: e.target.value } : x)))} />
                </td>
                <td className="text-end"><button className="btn btn-sm btn-light" onClick={() => retirer(l.duree_mois)}><i className="fa-solid fa-trash"></i></button></td>
              </tr>
            ))}
            <tr>
              <td><input type="number" min="1" max="36" step="1" className="form-control form-control-sm" placeholder="Nouvelle durée"
                value={nouvelle.duree_mois} onChange={(e) => setNouvelle({ ...nouvelle, duree_mois: e.target.value })} /></td>
              <td><input type="number" min="0" max="99.99" step="any" className="form-control form-control-sm" placeholder="0"
                value={nouvelle.remise_pourcent} onChange={(e) => setNouvelle({ ...nouvelle, remise_pourcent: e.target.value })} /></td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <button className="btn btn-primary btn-sm" onClick={enregistrer} disabled={envoi}>
          {envoi && <span className="spinner-border spinner-border-sm me-2" />}Enregistrer les remises
        </button>
      </div>
    </div>
  );
}

function ParametresPays({ niveaux, pays }) {
  const [configs, setConfigs] = useState([]);
  const [form, setForm] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [erreurForm, setErreurForm] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(
    () =>
      listerConfigs()
        .then(setConfigs)
        .catch((err) => setErreur(err.message || 'Chargement impossible.')),
    []
  );
  useEffect(() => { charger(); }, [charger]);

  const parPays = useMemo(() => new Map(configs.map((c) => [c.pays_id, c])), [configs]);

  const ouvrir = (p) => {
    const c = parPays.get(p.pays_id);
    setErreurForm(null);
    setForm({
      pays_id: p.pays_id,
      nom: p.nom,
      gratuite_active: c?.gratuite_active ?? false,
      gratuite_niveau_id: c?.gratuite_niveau_id ?? '',
      gratuite_jusqu_au: c?.gratuite_jusqu_au ? String(c.gratuite_jusqu_au).slice(0, 10) : '',
      grace_jours: String(c?.grace_jours ?? 7),
    });
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    setErreurForm(null);
    setEnvoi(true);
    try {
      await enregistrerConfig(form.pays_id, {
        gratuite_active: form.gratuite_active,
        gratuite_niveau_id: form.gratuite_niveau_id || null,
        gratuite_jusqu_au: form.gratuite_jusqu_au || null,
        grace_jours: Number(form.grace_jours),
      });
      setForm(null);
      await charger();
    } catch (err) {
      setErreurForm(err.message || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  const maj = (champ, valeur) => setForm((f) => ({ ...f, [champ]: valeur }));
  const nomNiveau = (id) => niveaux.find((n) => n.niveau_id === id)?.libelle ?? '—';

  return (
    <div className="aps-card">
      <div className="aps-card__body">
        <h2 className="h6"><i className="fa-solid fa-earth-africa me-2"></i>Paramètres par pays</h2>
        <p className="aps-text-muted small">
          Gratuité d&apos;amorçage : le niveau choisi est offert jusqu&apos;à la date indiquée (incluse) ; prévenir les
          assureurs 60 jours avant la bascule. Grâce : nombre de jours après l&apos;échéance avant expiration (les
          contenus enrichis sont masqués au public dès l&apos;échéance).
        </p>
        {erreur && <div className="alert alert-danger">{erreur}</div>}
        <table className="table aps-table">
          <thead><tr><th>Pays</th><th>Gratuité</th><th>Grâce</th><th></th></tr></thead>
          <tbody>
            {pays.map((p) => {
              const c = parPays.get(p.pays_id);
              return (
                <tr key={p.pays_id}>
                  <td>{p.nom}</td>
                  <td>
                    {c?.gratuite_active
                      ? <span className="aps-badge is-success">{nomNiveau(c.gratuite_niveau_id)} offert{c.gratuite_jusqu_au ? ` jusqu'au ${dateCourte(c.gratuite_jusqu_au)}` : ''}</span>
                      : <span className="aps-text-muted">Non</span>}
                  </td>
                  <td>{c?.grace_jours ?? 7} j{!c && <span className="aps-text-muted small"> (défaut)</span>}</td>
                  <td className="text-end"><button className="btn btn-sm btn-light" onClick={() => ouvrir(p)}><i className="fa-solid fa-pen"></i></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FondsModal
        titre={form ? `Paramètres — ${form.nom}` : ''}
        ouvert={!!form}
        occupe={envoi}
        onFermer={() => setForm(null)}
        pied={
          <>
            <button className="btn btn-light" onClick={() => setForm(null)} disabled={envoi}>Annuler</button>
            <button className="btn btn-primary" type="submit" form="form-config" disabled={envoi}>
              {envoi && <span className="spinner-border spinner-border-sm me-2" />}Enregistrer
            </button>
          </>
        }
      >
        {form && (
          <form id="form-config" onSubmit={enregistrer}>
            {erreurForm && <div className="alert alert-danger">{erreurForm}</div>}
            <div className="form-check form-switch mb-2">
              <input id="c-grat" type="checkbox" className="form-check-input" checked={form.gratuite_active} onChange={(e) => maj('gratuite_active', e.target.checked)} />
              <label className="form-check-label" htmlFor="c-grat">Gratuité d&apos;amorçage active</label>
            </div>
            <div className="mb-2">
              <label className="form-label" htmlFor="c-niv">Niveau offert</label>
              <select id="c-niv" className="form-select" value={form.gratuite_niveau_id} onChange={(e) => maj('gratuite_niveau_id', e.target.value)}>
                <option value="">— Aucun —</option>
                {niveaux.map((n) => <option key={n.niveau_id} value={n.niveau_id}>{n.libelle}</option>)}
              </select>
            </div>
            <div className="mb-2">
              <label className="form-label" htmlFor="c-fin">Offert jusqu&apos;au (inclus, facultatif)</label>
              <input id="c-fin" type="date" className="form-control" value={form.gratuite_jusqu_au} onChange={(e) => maj('gratuite_jusqu_au', e.target.value)} />
            </div>
            <div>
              <label className="form-label" htmlFor="c-grace">Durée de grâce (jours)</label>
              <input id="c-grace" type="number" min="0" max="90" step="1" className="form-control" required value={form.grace_jours} onChange={(e) => maj('grace_jours', e.target.value)} />
            </div>
          </form>
        )}
      </FondsModal>
    </div>
  );
}

export default function TarifsAbonnementAssurance() {
  const [niveaux, setNiveaux] = useState([]);
  const [pays, setPays] = useState([]);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let annule = false;
    Promise.all([listerNiveaux(), listerPays()])
      .then(([n, p]) => { if (!annule) { setNiveaux(n); setPays(p ?? []); } })
      .catch((err) => { if (!annule) setErreur(err.message || 'Chargement impossible.'); });
    return () => { annule = true; };
  }, []);

  return (
    <main className="aps-content">
      <div className="aps-page-header">
        <div>
          <div className="aps-breadcrumb">Back-office <span className="sep">/</span> Assurances <span className="sep">/</span> Tarifs d&apos;abonnement</div>
          <h1>Tarifs d&apos;abonnement</h1>
        </div>
      </div>
      {erreur && <div className="alert alert-danger">{erreur}</div>}
      <Tarifs niveaux={niveaux} pays={pays} />
      <Remises />
      <ParametresPays niveaux={niveaux} pays={pays} />
    </main>
  );
}
