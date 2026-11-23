// SourceVillesCard.jsx
//
// Référentiel : choix de la source des villes (manuel / Google Maps) et
// test de la clé Google. Voir server/src/services/sourceVilles.service.js.
// Le mode « Google Maps » peut être choisi avant que la clé soit
// régularisée : tant que Google ne répond pas, le serveur applique le mode
// manuel de lui-même (« mode appliqué » ci-dessous).
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { estSuperadmin } from '../utils/roles';
import { useToast } from './feedback';
import * as referentielService from '../services/referentielService';

const RAISONS = {
  cle_absente: 'aucune clé GOOGLE_MAPS_API_KEY sur le serveur',
  google_indisponible: "Google n'a pas répondu correctement (clé, API Places non activée, facturation ou quota) — nouvel essai automatique dans quelques minutes",
};

function formaterDate(valeur) {
  if (!valeur) return null;
  return new Date(valeur).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function SourceVillesCard({ onChange }) {
  const { user } = useAuth();
  const superadmin = estSuperadmin(user);
  const toast = useToast();
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(null); // 'source' | 'test'

  const charger = useCallback(
    () =>
      referentielService
        .obtenirSourceVilles()
        .then((r) => {
          setErreur(null);
          setEtat(r);
        })
        .catch((err) => setErreur(err.message || 'Impossible de lire la source des villes.')),
    []
  );

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    if (etat) onChange?.(etat);
  }, [etat, onChange]);

  async function choisir(source) {
    if (!superadmin || etat?.source_choisie === source) return;
    setEnCours('source');
    try {
      const r = await referentielService.modifierSourceVilles(source);
      setEtat(r);
      toast.succes?.(source === 'google' ? 'Villes : mode Google Maps choisi.' : 'Villes : mode manuel choisi.');
    } catch (err) {
      toast.erreur?.(err.message || 'Modification impossible.');
    } finally {
      setEnCours(null);
    }
  }

  async function tester() {
    setEnCours('test');
    try {
      const r = await referentielService.testerSourceVilles();
      setEtat(r);
      if (r.dernier_test_ok) toast.succes?.('La clé Google Maps répond.');
      else toast.erreur?.('La clé Google Maps ne répond pas : mode manuel appliqué.');
    } catch (err) {
      toast.erreur?.(err.message || 'Test impossible.');
    } finally {
      setEnCours(null);
    }
  }

  if (erreur) {
    return (
      <div className="aps-notice is-danger mb-4">
        <i className="fa-solid fa-triangle-exclamation"></i>
        <div className="flex-grow-1">{erreur}</div>
        <button className="btn btn-sm btn-light" onClick={charger}>
          <i className="fa-solid fa-rotate-right me-1"></i>Réessayer
        </button>
      </div>
    );
  }
  if (!etat) return null;

  const googleApplique = etat.source_effective === 'google';
  const repli = etat.source_choisie === 'google' && !googleApplique;

  return (
    <div className="aps-card p-3 mb-4">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <h6 className="mb-1">
            <i className="fa-solid fa-map-location-dot me-2"></i>Source des villes
          </h6>
          <div className="aps-text-muted" style={{ fontSize: '.88rem' }}>
            En mode Google Maps, les formulaires proposent aussi les villes Google qui ne sont pas encore dans le
            référentiel ; la ville choisie y est ajoutée automatiquement. Les pays restent ceux de ce référentiel.
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <div className="btn-group" role="group" aria-label="Source des villes">
            <button
              type="button"
              className={`btn btn-sm ${etat.source_choisie === 'manuel' ? 'btn-primary' : 'btn-light'}`}
              onClick={() => choisir('manuel')}
              disabled={!superadmin || enCours !== null}
            >
              Manuel
            </button>
            <button
              type="button"
              className={`btn btn-sm ${etat.source_choisie === 'google' ? 'btn-primary' : 'btn-light'}`}
              onClick={() => choisir('google')}
              disabled={!superadmin || enCours !== null}
            >
              Google Maps
            </button>
          </div>
          {superadmin && (
            <button type="button" className="btn btn-sm btn-light" onClick={tester} disabled={enCours !== null}>
              {enCours === 'test' ? (
                <i className="fa-solid fa-spinner fa-spin me-1"></i>
              ) : (
                <i className="fa-solid fa-plug-circle-check me-1"></i>
              )}
              Tester la clé
            </button>
          )}
        </div>
      </div>

      <div className={`aps-notice ${repli ? 'is-warning' : 'is-info'} mt-3 mb-0`}>
        <i className={`fa-solid ${repli ? 'fa-triangle-exclamation' : 'fa-circle-info'}`}></i>
        <div>
          Mode appliqué : <strong>{googleApplique ? 'Google Maps' : 'manuel'}</strong>
          {repli && RAISONS[etat.raison_repli] && <> — repli automatique : {RAISONS[etat.raison_repli]}.</>}
          {etat.dernier_test_le && (
            <div className="mt-1" style={{ fontSize: '.85rem' }}>
              Dernier contrôle de la clé ({formaterDate(etat.dernier_test_le)}) :{' '}
              {etat.dernier_test_ok ? 'OK' : 'échec'}
              {etat.dernier_message ? ` — ${etat.dernier_message}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
