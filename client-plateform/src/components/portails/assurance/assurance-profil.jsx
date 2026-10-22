// assurance-profil.jsx — portail assurance, « Profil ».
//
// L'agent modifie sa fiche (identité, contacts, agrément, présentation,
// ville, position du siège, logo), ses activités / produits et leurs
// options, ses agences. Les modifications sont publiées aussitôt : la fiche
// garde son statut de vérification (pas de re-modération).
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../feedback';
import { useOutletContext } from 'react-router-dom';
import { AssurancePortailPage } from '../layouts/assurance.portail-sidebar';
import AgencesAssurance from '../../assurances/gestion/AgencesAssurance';
import ActivitesAssurance from '../../assurances/gestion/ActivitesAssurance';
import { obtenirGestionServiceAssurance } from '../../../services/abonnementAssuranceService';
import { modifierServiceAssurance } from '../../../services/assuranceService';
import { listerVilles } from '../../../services/geoService';
import { obtenirPosition } from '../../../lib/geolocConsentement';

function versFormulaire(f) {
  return {
    nom: f.nom ?? '',
    type_acteur: f.type_acteur ?? 'compagnie',
    telephone: f.telephone ?? '',
    email: f.email ?? '',
    agrement: f.agrement ?? '',
    description: f.description ?? '',
    ville_id: f.ville_id ?? '',
    latitude: f.geolocalisation?.latitude ?? '',
    longitude: f.geolocalisation?.longitude ?? '',
  };
}

function FormulaireFiche({ fiche, onEnregistre }) {
  const [form, setForm] = useState(() => versFormulaire(fiche));
  const [logo, setLogo] = useState(null);
  const [villes, setVilles] = useState([]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const toast = useToast();

  useEffect(() => {
    listerVilles(fiche.pays_id).then((d) => setVilles(d?.villes || [])).catch(() => setVilles([]));
  }, [fiche.pays_id]);

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  const positionActuelle = () => {
    if (!navigator.geolocation) return setErreur("La géolocalisation n'est pas disponible sur cet appareil.");
    obtenirPosition(
      (p) => setForm((f) => ({ ...f, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })),
      () => setErreur('Position introuvable : saisissez-la à la main ou autorisez la localisation.')
    );
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const donnees = { ...form, description: form.description };
      if (form.latitude === '' || form.longitude === '') {
        delete donnees.latitude;
        delete donnees.longitude;
      }
      if (logo) donnees.image_assurance = logo;
      await modifierServiceAssurance(fiche.service_assurance_id, donnees);
      setLogo(null);
      toast.succes('Fiche enregistrée.');
      onEnregistre();
    } catch (err) {
      setErreur(err?.message || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form className="info-card" onSubmit={enregistrer}>
      <h3><i className="fa-solid fa-building-shield" /> Ma fiche</h3>
      <div className="row g-3">
        <div className="col-md-8">
          <label className="form-label" htmlFor="as-nom">Dénomination</label>
          <input id="as-nom" className="form-control" required maxLength={200} value={form.nom} onChange={maj('nom')} />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="as-type">Type</label>
          <select id="as-type" className="form-select" value={form.type_acteur} onChange={maj('type_acteur')}>
            <option value="compagnie">Compagnie d&apos;assurance</option>
            <option value="courtier">Courtier</option>
          </select>
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="as-tel">Téléphone</label>
          <input id="as-tel" className="form-control" required maxLength={20} value={form.telephone} onChange={maj('telephone')} />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="as-email">E-mail</label>
          <input id="as-email" type="email" className="form-control" required maxLength={255} value={form.email} onChange={maj('email')} />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="as-agrement">N° d&apos;agrément</label>
          <input id="as-agrement" className="form-control" required maxLength={100} value={form.agrement} onChange={maj('agrement')} />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="as-desc">Présentation</label>
          <textarea id="as-desc" className="form-control" rows={4} value={form.description} onChange={maj('description')}
            placeholder="Votre histoire, vos engagements, vos points forts…" />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="as-ville">Ville du siège</label>
          <select id="as-ville" className="form-select" value={form.ville_id} onChange={maj('ville_id')}>
            {!villes.some((v) => v.ville_id === form.ville_id) && fiche.ville && (
              <option value={fiche.ville_id}>{fiche.ville.nom}</option>
            )}
            {villes.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label" htmlFor="as-lat">Latitude</label>
          <input id="as-lat" type="number" step="any" min={-90} max={90} className="form-control" value={form.latitude} onChange={maj('latitude')} />
        </div>
        <div className="col-md-3">
          <label className="form-label" htmlFor="as-lng">Longitude</label>
          <input id="as-lng" type="number" step="any" min={-180} max={180} className="form-control" value={form.longitude} onChange={maj('longitude')} />
        </div>
        <div className="col-md-2 d-flex align-items-end">
          <button type="button" className="btn btn-outline-primary w-100" onClick={positionActuelle} title="Utiliser ma position actuelle">
            <i className="fa-solid fa-location-crosshairs" />
          </button>
        </div>
        <div className="col-12 d-flex align-items-center gap-3 flex-wrap">
          {fiche.image_url && <img src={fiche.image_url} alt="Logo actuel" className="assurance-logo-apercu" />}
          <div>
            <label className="form-label" htmlFor="as-logo">Remplacer le logo (JPEG, PNG, WEBP — 5 Mo)</label>
            <input id="as-logo" type="file" accept="image/jpeg,image/png,image/webp" className="form-control"
              onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          </div>
        </div>
      </div>
      {erreur && <div className="alert alert-danger mt-3 mb-0">{erreur}</div>}
      <div className="text-end mt-3">
        <button type="submit" className="btn btn-primary btn-sm-aps" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer la fiche'}
        </button>
      </div>
    </form>
  );
}

export default function AssuranceProfil() {
  const { serviceId, rechargerFiche } = useOutletContext();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [version, setVersion] = useState(0); // remonte le formulaire après enregistrement

  const charger = useCallback(
    () =>
      obtenirGestionServiceAssurance(serviceId)
        .then((d) => { setDonnees(d); setErreur(null); })
        .catch((err) => setErreur(err?.message || 'Profil indisponible.')),
    [serviceId]
  );
  useEffect(() => { charger(); }, [charger]);

  return (
    <AssurancePortailPage titre="Profil" description="Votre fiche, vos activités et vos agences, telles que le public les voit.">
      {erreur && <div className="alert alert-danger">{erreur}</div>}
      {!erreur && !donnees && <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>}
      {donnees && (
        <div className="d-flex flex-column gap-4">
          <FormulaireFiche
            key={version}
            fiche={donnees.service_assurance}
            onEnregistre={() => { charger().then(() => setVersion((v) => v + 1)); rechargerFiche(); }}
          />
          <section id="activites">
            <ActivitesAssurance
              serviceId={serviceId}
              activites={donnees.activites}
              visiblesAuPublic={donnees.droits.afficher_activites}
              onChange={charger}
            />
          </section>
          <section id="agences">
            <AgencesAssurance
              serviceId={serviceId}
              agences={donnees.agences}
              quota={donnees.quotas.agences}
              visiblesAuPublic={donnees.droits.afficher_agences}
              onChange={charger}
            />
          </section>
        </div>
      )}
    </AssurancePortailPage>
  );
}
