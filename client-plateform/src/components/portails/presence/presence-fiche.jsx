// presence-fiche.jsx — portails pharmacie et centre de santé, « Ma fiche ».
//
// Informations d'identité et de contact de la fiche (nom, téléphone, e-mail,
// numéro d'ordre du titulaire ou type de structure, ville, adresse, position),
// photo principale et pièces justificatives, équipe rattachée.
// Toute modification ici repasse la fiche en vérification par ApSa (une
// fiche déjà publiée reste en ligne pendant la vérification). Les horaires,
// photos, actualités, prestations et messages se gèrent dans leurs rubriques,
// sans nouvelle vérification.
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useConfirmation, useToast } from '../../feedback';
import GoogleMapPicker from '../../maps/GoogleMapPicker';
import { PresencePortailPage } from '../layouts/presence.portail-sidebar';
import { listerVilles } from '../../../services/geoService';
import { modifierPharmacie } from '../../../services/pharmacieService';
import { TYPES_STRUCTURE, modifierCentreSante } from '../../../services/structureSanteService';
import { BandeauFicheHorsLigne } from './presenceCommun';

const CHAMP_IMAGE = { pharmacie: 'image_pharmacie', structure: 'image_structure' };

function versFormulaire(f) {
  return {
    nom: f.nom ?? '',
    telephone: f.telephone ?? '',
    email: f.email ?? '',
    numero_ordre_titulaire: f.numero_ordre_titulaire ?? '',
    type_structure: f.type_structure ?? '',
    ville_id: f.ville_id ?? '',
    adresse: f.adresse ?? '',
    latitude: f.geolocalisation?.latitude ?? '',
    longitude: f.geolocalisation?.longitude ?? '',
  };
}

function FormulaireFiche({ type, fiche, onEnregistre }) {
  const toast = useToast();
  const confirmer = useConfirmation();
  const [form, setForm] = useState(() => versFormulaire(fiche));
  const [fichiers, setFichiers] = useState({});
  const [villes, setVilles] = useState([]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [cle, setCle] = useState(0); // réinitialise les champs fichier après envoi

  useEffect(() => {
    listerVilles(fiche.pays_id).then((d) => setVilles(d?.villes || [])).catch(() => setVilles([]));
  }, [fiche.pays_id]);

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));
  const fichier = (champ) => (e) => setFichiers((f) => ({ ...f, [champ]: e.target.files?.[0] ?? undefined }));

  const enregistrer = async (e) => {
    e.preventDefault();
    setErreur(null);
    if (fiche.en_ligne && fiche.statut_verification === 'publie') {
      const ok = await confirmer({
        titre: 'Enregistrer les modifications',
        message: 'Votre fiche repassera en vérification par ApSa. Elle reste visible du public pendant la vérification.',
        labelConfirmer: 'Enregistrer',
      });
      if (!ok) return;
    }
    setEnvoi(true);
    try {
      const { latitude, longitude, numero_ordre_titulaire, type_structure, ...communs } = form;
      const position = latitude !== '' && longitude !== '' ? { latitude: Number(latitude), longitude: Number(longitude) } : {};
      if (type === 'pharmacie') {
        await modifierPharmacie(fiche.acteur_id, { ...communs, numero_ordre_titulaire, ...position, ...fichiers });
      } else {
        await modifierCentreSante(fiche.acteur_id, { ...communs, type_structure, ...position }, fichiers);
      }
      setFichiers({});
      setCle((c) => c + 1);
      toast.succes('Fiche enregistrée. Elle repasse en vérification par ApSa.', { duree: 6000 });
      onEnregistre();
    } catch (err) {
      setErreur(err?.message || 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  const pieces = [
    [CHAMP_IMAGE[type], 'Photo principale (publique avec abonnement)', 'image/jpeg,image/png,image/webp', fiche.image_url],
    ['piece_identite', type === 'pharmacie' ? 'Pièce d’identité du titulaire' : 'Pièce d’identité du responsable', 'image/jpeg,image/png,image/webp,application/pdf', fiche.piece_identite_url],
    ['document_agrement', 'Agrément officiel', 'image/jpeg,image/png,image/webp,application/pdf', fiche.document_agrement_url],
  ];

  return (
    <form className="d-flex flex-column gap-4" onSubmit={enregistrer}>
      <div className="info-card">
        <h3><i className="fa-solid fa-id-card" /> Identité et contact</h3>
        <div className="row g-3">
          <div className="col-md-8">
            <label className="form-label" htmlFor="pf-nom">{type === 'pharmacie' ? 'Nom de la pharmacie' : 'Nom de la structure'}</label>
            <input id="pf-nom" className="form-control" required maxLength={200} value={form.nom} onChange={maj('nom')} />
          </div>
          {type === 'pharmacie' ? (
            <div className="col-md-4">
              <label className="form-label" htmlFor="pf-ordre">N° d&apos;ordre du titulaire</label>
              <input id="pf-ordre" className="form-control" required maxLength={100} value={form.numero_ordre_titulaire} onChange={maj('numero_ordre_titulaire')} />
            </div>
          ) : (
            <div className="col-md-4">
              <label className="form-label" htmlFor="pf-type">Type de structure</label>
              <select id="pf-type" className="form-select" required value={form.type_structure} onChange={maj('type_structure')}>
                {TYPES_STRUCTURE.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
              </select>
            </div>
          )}
          <div className="col-md-6">
            <label className="form-label" htmlFor="pf-tel">Téléphone</label>
            <input id="pf-tel" type="tel" className="form-control" required maxLength={20} value={form.telephone} onChange={maj('telephone')} />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="pf-email">E-mail de contact <span className="text-faint">(facultatif)</span></label>
            <input id="pf-email" type="email" className="form-control" maxLength={255} value={form.email} onChange={maj('email')} />
          </div>
          <div className="col-12">
            <p className="minimal-note mb-0">
              <i className="fa-solid fa-circle-info" /> Le téléphone et l&apos;e-mail ne sont visibles du public qu&apos;avec un abonnement
              qui inclut le contact direct.
            </p>
          </div>
        </div>
      </div>

      <div className="info-card">
        <h3><i className="fa-solid fa-location-dot" /> Localisation</h3>
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label" htmlFor="pf-ville">Ville</label>
            <select id="pf-ville" className="form-select" value={form.ville_id} onChange={maj('ville_id')}>
              {!villes.some((v) => v.ville_id === form.ville_id) && fiche.ville && <option value={fiche.ville_id}>{fiche.ville.nom}</option>}
              {villes.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
            </select>
          </div>
          <div className="col-md-8">
            <label className="form-label" htmlFor="pf-adr">Adresse</label>
            <input id="pf-adr" className="form-control" maxLength={255} value={form.adresse} onChange={maj('adresse')}
              placeholder="Quartier, rue, point de repère" />
          </div>
          <div className="col-12">
            <span className="form-label d-block">Position sur la carte</span>
            <GoogleMapPicker
              latitude={form.latitude === '' ? null : Number(form.latitude)}
              longitude={form.longitude === '' ? null : Number(form.longitude)}
              onPositionChange={(lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }))}
              region={fiche.pays?.code_iso2?.toLowerCase()}
            />
          </div>
        </div>
      </div>

      <div className="info-card" key={cle}>
        <h3><i className="fa-solid fa-folder-open" /> Photo et pièces justificatives</h3>
        <p className="minimal-note">La pièce d&apos;identité et l&apos;agrément ne sont jamais visibles du public. Laissez vide pour conserver le fichier actuel.</p>
        <div className="row g-3">
          {pieces.map(([champ, libelle, accept, actuel]) => (
            <div className="col-md-4" key={champ}>
              <label className="form-label" htmlFor={`pf-${champ}`}>{libelle}</label>
              <input id={`pf-${champ}`} type="file" accept={accept} className="form-control" onChange={fichier(champ)} />
              {actuel && <a href={actuel} target="_blank" rel="noreferrer" className="small d-inline-block mt-1">Voir le fichier actuel</a>}
            </div>
          ))}
        </div>
      </div>

      {erreur && <div className="alert alert-danger mb-0">{erreur}</div>}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span className="minimal-note"><i className="fa-solid fa-shield-halved" /> Toute modification de cette page est vérifiée par ApSa.</span>
        <button type="submit" className="btn btn-primary btn-sm-aps" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer la fiche'}</button>
      </div>
    </form>
  );
}

function Equipe({ equipe, type }) {
  return (
    <div className="info-card">
      <h3><i className="fa-solid fa-users" /> Équipe ayant accès à cet espace</h3>
      <ul className="list-unstyled mb-2">
        {equipe.map((a, i) => (
          <li key={i} className="py-1">
            <strong>{[a.prenom, a.nom].filter(Boolean).join(' ')}</strong>
            <span className="text-faint"> · {a.fonction}</span>
            {a.moi && <span className="chip chip-complet ms-2">Vous</span>}
          </li>
        ))}
      </ul>
      <p className="minimal-note mb-0">
        Pour ajouter ou retirer un gestionnaire de {type === 'pharmacie' ? 'cette pharmacie' : 'ce centre'}, contactez ApSa depuis la page Contact.
      </p>
    </div>
  );
}

export default function PresenceFiche() {
  const { type, fiche, equipe, rechargerFiche } = useOutletContext();
  const [version, setVersion] = useState(0);

  return (
    <PresencePortailPage titre="Ma fiche" description="L'identité, les coordonnées et la localisation de votre établissement.">
      <div className="d-flex flex-column gap-4">
        <BandeauFicheHorsLigne fiche={fiche} />
        <FormulaireFiche
          key={version}
          type={type}
          fiche={fiche}
          onEnregistre={() => { rechargerFiche().then(() => setVersion((v) => v + 1)); }}
        />
        <Equipe equipe={equipe} type={type} />
      </div>
    </PresencePortailPage>
  );
}
