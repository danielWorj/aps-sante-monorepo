// PinOublie.jsx — « Code PIN oublié » (vérification du numéro active).
//
// Numéro -> code reçu par SMS/WhatsApp -> nouveau code PIN. Le compte est
// débloqué. Sans vérification active, on renvoie vers la connexion par email.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import authService from '../services/authService';
import { listerPays } from '../services/geoService';
import VerificationTelephone from '../components/auth/VerificationTelephone';
import { useConfigurationConnexion } from '../hooks/useConfigurationConnexion';

const chiffres = (v) => v.replace(/\D/g, '').slice(0, 6);

export default function PinOublie() {
  const navigate = useNavigate();
  const config = useConfigurationConnexion();
  const [pays, setPays] = useState([]);
  const [form, setForm] = useState({ pays_iso2: 'CM', telephone: '', pin: '', confirmation: '' });
  const [preuve, setPreuve] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let annule = false;
    listerPays().then((d) => { if (!annule) setPays((d?.pays ?? []).filter((p) => p.code_iso2)); }).catch(() => {});
    return () => { annule = true; };
  }, []);

  if (config && !config.verification_telephone) {
    return (
      <section style={{ padding: '3rem 0' }}>
        <div className="container-aps" style={{ maxWidth: 480 }}>
          <div className="info-card" style={{ padding: '2rem' }}>
            <h1 style={{ fontSize: '1.4rem' }}>Code PIN oublié</h1>
            <p className="text-muted-soft">
              Connectez-vous avec votre email et votre mot de passe, puis choisissez un nouveau code PIN depuis le menu
              (« Code PIN »). Sans email, contactez le support APS Santé.
            </p>
            <Link to="/login" className="btn btn-primary">Retour à la connexion</Link>
          </div>
        </div>
      </section>
    );
  }

  const changer = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: name === 'pin' || name === 'confirmation' ? chiffres(value) : value }));
  };

  const soumettre = async (e) => {
    e.preventDefault();
    setErreur(null);
    if (!preuve) return setErreur('Vérifiez d’abord votre numéro avec le code reçu.');
    if (form.pin.length !== 6) return setErreur('Le code PIN comporte 6 chiffres.');
    if (form.pin !== form.confirmation) return setErreur('Les deux codes PIN ne sont pas identiques.');
    setEnvoi(true);
    try {
      await authService.reinitialiserPin({
        telephone: form.telephone, pays_iso2: form.pays_iso2, preuve_telephone: preuve, nouveau_pin: form.pin,
      });
      navigate('/login', { replace: true, state: { message: 'Code PIN modifié : connectez-vous avec votre numéro.' } });
    } catch (err) {
      setErreur(err.message);
      if (err.data?.code === 'PREUVE_INVALIDE') setPreuve(null);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section style={{ padding: '3rem 0' }}>
      <div className="container-aps" style={{ maxWidth: 480 }}>
        <div className="info-card" style={{ padding: '2rem' }}>
          <span className="eyebrow">Connexion</span>
          <h1 style={{ fontSize: '1.45rem', marginTop: '.6rem' }}>Code PIN oublié</h1>
          <p className="text-muted-soft">Recevez un code sur votre numéro, puis choisissez un nouveau code PIN.</p>
          {erreur && <div className="alert alert-danger" role="alert">{erreur}</div>}
          <form onSubmit={soumettre} noValidate>
            <div className="search-field">
              <label className="form-label-aps" htmlFor="po-tel">Numéro de téléphone</label>
              <div className="d-flex gap-2">
                <select className="form-select" style={{ maxWidth: 140 }} name="pays_iso2" aria-label="Pays du numéro"
                  value={form.pays_iso2} onChange={changer} disabled={Boolean(preuve)}>
                  {(pays.length ? pays : [{ code_iso2: 'CM', nom: 'Cameroun' }]).map((p) => (
                    <option key={p.code_iso2} value={p.code_iso2}>{p.nom}</option>
                  ))}
                </select>
                <input id="po-tel" name="telephone" type="tel" inputMode="tel" className="form-control"
                  placeholder="6XX XX XX XX" value={form.telephone} onChange={changer} disabled={Boolean(preuve)} />
              </div>
            </div>
            {config && (
              <VerificationTelephone
                telephone={form.telephone}
                pays_iso2={form.pays_iso2}
                objet="reinitialisation_mot_de_passe"
                canaux={config.canaux}
                preuve={preuve}
                onPreuve={setPreuve}
              />
            )}
            {preuve && (
              <>
                <div className="search-field">
                  <label className="form-label-aps" htmlFor="po-pin">Nouveau code PIN (6 chiffres)</label>
                  <input id="po-pin" name="pin" type="password" inputMode="numeric" maxLength={6} autoComplete="new-password"
                    className="form-control" style={{ letterSpacing: '.4em' }} value={form.pin} onChange={changer} />
                </div>
                <div className="search-field">
                  <label className="form-label-aps" htmlFor="po-conf">Confirmez le code PIN</label>
                  <input id="po-conf" name="confirmation" type="password" inputMode="numeric" maxLength={6} autoComplete="new-password"
                    className="form-control" style={{ letterSpacing: '.4em' }} value={form.confirmation} onChange={changer} />
                </div>
                <button type="submit" className="btn btn-primary btn-block-aps btn-lg-aps" disabled={envoi}>
                  {envoi ? 'Enregistrement…' : 'Enregistrer mon nouveau code PIN'}
                </button>
              </>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
