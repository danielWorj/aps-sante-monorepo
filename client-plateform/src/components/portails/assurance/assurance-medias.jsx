// assurance-medias.jsx — portail assurance, « Multimédia ».
//
// Médiathèque de la fiche : photos et vidéos (Cloudinary). Le serveur
// applique les quotas de l'abonnement (photos : `max_photos`, null =
// illimité ; vidéos : seulement si l'abonnement inclut la vidéo de
// présentation) et décide de ce qui est visible du public. L'ordre des
// photos compte : quand le quota baisse, seules les premières restent
// visibles (les autres sont conservées, masquées).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useConfirmation, useToast } from '../../feedback';
import { AssurancePortailPage } from '../layouts/assurance.portail-sidebar';
import {
  ajouterMedia,
  listerMediasGestion,
  modifierMedia,
  ordonnerMedias,
  supprimerMedia,
} from '../../../services/portailAssuranceService';

const TAILLE_MAX = { image: 5 * 1024 * 1024, video: 50 * 1024 * 1024 };
const ACCEPT = { image: 'image/jpeg,image/png,image/webp', video: 'video/mp4,video/webm,video/quicktime' };
const taille = (o) => (o >= 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1)} Mo` : `${Math.round(o / 1024)} Ko`);

function FormulaireAjout({ serviceId, type, quota, onAjoute }) {
  const entree = useRef(null);
  const [titre, setTitre] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const plein = quota.max !== null && quota.utilise >= quota.max;

  const envoyer = async (e) => {
    e.preventDefault();
    setErreur(null);
    const fichier = entree.current?.files?.[0];
    if (!fichier) return setErreur('Choisissez un fichier.');
    if (fichier.size > TAILLE_MAX[type]) {
      return setErreur(`Fichier trop volumineux (${taille(TAILLE_MAX[type])} maximum).`);
    }
    setEnvoi(true);
    try {
      await ajouterMedia(serviceId, fichier, titre);
      setTitre('');
      entree.current.value = '';
      onAjoute();
    } catch (err) {
      setErreur(err?.message || 'Téléversement impossible.');
    } finally {
      setEnvoi(false);
    }
    return undefined;
  };

  if (plein) {
    return (
      <p className="minimal-note mb-0">
        <i className="fa-solid fa-circle-info" />{' '}
        {quota.max === 0
          ? <>{type === 'video' ? 'Les vidéos de présentation ne sont pas incluses' : "Les photos ne sont pas incluses"} dans votre abonnement. <Link to="/portail/assurance-abonnement">Voir les formules</Link></>
          : `Vous avez atteint le maximum (${quota.max}). Supprimez un élément pour en ajouter un autre.`}
      </p>
    );
  }

  return (
    <form onSubmit={envoyer} className="row g-2 align-items-end">
      <div className="col-md-5">
        <label className="form-label small" htmlFor={`media-${type}`}>
          {type === 'video' ? 'Vidéo (MP4, WEBM, MOV — 50 Mo)' : 'Photo (JPEG, PNG, WEBP — 5 Mo)'}
        </label>
        <input id={`media-${type}`} ref={entree} type="file" accept={ACCEPT[type]} className="form-control" />
      </div>
      <div className="col-md-5">
        <label className="form-label small" htmlFor={`titre-${type}`}>Légende (facultatif)</label>
        <input id={`titre-${type}`} className="form-control" maxLength={150} value={titre} onChange={(e) => setTitre(e.target.value)} />
      </div>
      <div className="col-md-2">
        <button type="submit" className="btn btn-primary w-100" disabled={envoi}>
          {envoi ? <span className="spinner-border spinner-border-sm" role="status" /> : <><i className="fa-solid fa-upload" /> Ajouter</>}
        </button>
      </div>
      {envoi && type === 'video' && <div className="col-12 minimal-note">Envoi de la vidéo en cours, cela peut prendre une minute…</div>}
      {erreur && <div className="col-12"><p className="status-card-error mb-0"><i className="fa-solid fa-circle-exclamation" /> {erreur}</p></div>}
    </form>
  );
}

function CarteMedia({ media, index, total, onDeplacer, onSupprimer, onRenommer }) {
  const [edition, setEdition] = useState(false);
  const [titre, setTitre] = useState(media.titre ?? '');

  const valider = async (e) => {
    e.preventDefault();
    if (await onRenommer(media, titre)) setEdition(false);
  };

  return (
    <div className={`media-carte ${media.visible_au_public ? '' : 'is-masque'}`}>
      <div className="media-apercu">
        {media.type === 'video'
          ? <video src={media.url} poster={media.vignette_url} controls preload="none" />
          : <a href={media.url} target="_blank" rel="noreferrer"><img src={media.vignette_url} alt={media.titre || 'Photo'} loading="lazy" /></a>}
        {!media.visible_au_public && (
          <span className="media-badge"><i className="fa-solid fa-eye-slash" /> Masqué au public</span>
        )}
      </div>
      <div className="media-pied">
        {edition ? (
          <form onSubmit={valider} className="d-flex gap-1">
            <input className="form-control form-control-sm" maxLength={150} value={titre} onChange={(e) => setTitre(e.target.value)} aria-label="Légende" autoFocus />
            <button type="submit" className="btn btn-primary btn-sm-aps" aria-label="Enregistrer"><i className="fa-solid fa-check" /></button>
          </form>
        ) : (
          <div className="small text-truncate" title={media.titre || ''}>{media.titre || <span className="text-faint">Sans légende</span>}</div>
        )}
        <div className="d-flex justify-content-between align-items-center mt-1">
          <span className="text-faint" style={{ fontSize: '.72rem' }}>{media.taille_octets ? taille(media.taille_octets) : ''}</span>
          <span className="d-flex gap-1">
            <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" disabled={index === 0} onClick={() => onDeplacer(index, -1)} aria-label="Avancer">
              <i className="fa-solid fa-arrow-left" />
            </button>
            <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" disabled={index === total - 1} onClick={() => onDeplacer(index, 1)} aria-label="Reculer">
              <i className="fa-solid fa-arrow-right" />
            </button>
            <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => setEdition((v) => !v)} aria-label="Modifier la légende">
              <i className="fa-solid fa-pen" />
            </button>
            <button type="button" className="btn btn-ghost btn-sm-aps btn-icon" onClick={() => onSupprimer(media)} aria-label="Supprimer">
              <i className="fa-solid fa-trash" />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

function SectionMedias({ serviceId, type, medias, quota, onChange, setErreur }) {
  const confirmer = useConfirmation();
  const toast = useToast();
  const liste = medias.filter((m) => m.type === type);

  const deplacer = async (index, sens) => {
    const ids = liste.map((m) => m.media_id);
    const cible = index + sens;
    [ids[index], ids[cible]] = [ids[cible], ids[index]];
    try {
      await ordonnerMedias(serviceId, type, ids);
      onChange();
    } catch (err) {
      setErreur(err?.message || 'Réorganisation impossible.');
    }
  };

  const supprimer = async (m) => {
    const video = type === 'video';
    const ok = await confirmer({
      titre: video ? 'Supprimer la vidéo' : 'Supprimer la photo',
      message: `${video ? 'Cette vidéo' : 'Cette photo'} sera supprimée définitivement.`,
      labelConfirmer: 'Supprimer',
      variante: 'danger',
    });
    if (!ok) return;
    try {
      await supprimerMedia(m.media_id);
      onChange();
      toast.succes(video ? 'Vidéo supprimée.' : 'Photo supprimée.');
    } catch (err) {
      setErreur(err?.message || 'Suppression impossible.');
    }
  };

  const renommer = async (m, titre) => {
    try {
      await modifierMedia(m.media_id, titre);
      onChange();
      return true;
    } catch (err) {
      setErreur(err?.message || 'Modification impossible.');
      return false;
    }
  };

  return (
    <div className="info-card">
      <h3>
        <i className={`fa-solid ${type === 'video' ? 'fa-film' : 'fa-images'}`} /> {type === 'video' ? 'Vidéos' : 'Photos'}{' '}
        <small className="text-faint">({quota.utilise} / {quota.max === null ? 'illimité' : quota.max === 0 ? 'non inclus' : quota.max})</small>
      </h3>
      {type === 'image' && liste.length > 1 && (
        <p className="minimal-note">La première photo est mise en avant sur votre fiche. Utilisez les flèches pour changer l&apos;ordre.</p>
      )}
      {liste.length > 0 ? (
        <div className="media-grille mb-3">
          {liste.map((m, i) => (
            <CarteMedia key={m.media_id} media={m} index={i} total={liste.length}
              onDeplacer={deplacer} onSupprimer={supprimer} onRenommer={renommer} />
          ))}
        </div>
      ) : (
        <div className="aps-empty-state mb-3">
          <i className={`fa-solid ${type === 'video' ? 'fa-film' : 'fa-images'}`}></i>
          <div>{type === 'video' ? 'Aucune vidéo.' : 'Aucune photo.'}</div>
        </div>
      )}
      <FormulaireAjout serviceId={serviceId} type={type} quota={quota} onAjoute={onChange} />
    </div>
  );
}

export default function AssuranceMedias() {
  const { serviceId } = useOutletContext();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [erreurAction, setErreurAction] = useState(null);

  const charger = useCallback(
    () =>
      listerMediasGestion(serviceId)
        .then((d) => { setDonnees(d); setErreur(null); setErreurAction(null); })
        .catch((err) => setErreur(err?.message || 'Médiathèque indisponible.')),
    [serviceId]
  );
  useEffect(() => { charger(); }, [charger]);

  return (
    <AssurancePortailPage
      titre="Multimédia"
      description="Les photos et vidéos qui présentent votre compagnie sur votre fiche publique."
    >
      {erreur && <div className="alert alert-danger">{erreur}</div>}
      {!erreur && !donnees && <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>}
      {donnees && (
        <div className="d-flex flex-column gap-4">
          {!donnees.fiche_publiee && (
            <div className="banner-institutionnel">
              <i className="fa-solid fa-hourglass-half" />
              <span>Votre fiche n&apos;est pas encore publiée : vos médias apparaîtront au public après sa validation.</span>
            </div>
          )}
          {erreurAction && (
            <div className="alert alert-danger d-flex align-items-center" role="alert">
              <i className="fa-solid fa-circle-exclamation me-2"></i>
              <div className="flex-grow-1">{erreurAction}</div>
              <button type="button" className="btn-close" aria-label="Fermer" onClick={() => setErreurAction(null)} />
            </div>
          )}
          <SectionMedias serviceId={serviceId} type="image" medias={donnees.medias} quota={donnees.quotas.photos} onChange={charger} setErreur={setErreurAction} />
          <SectionMedias serviceId={serviceId} type="video" medias={donnees.medias} quota={donnees.quotas.videos} onChange={charger} setErreur={setErreurAction} />
        </div>
      )}
    </AssurancePortailPage>
  );
}
