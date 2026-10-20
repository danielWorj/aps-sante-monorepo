// CreerPin.jsx — « Créer mon code PIN ».
//
// Deux usages :
//   - mode 'definir' (par défaut, session ouverte) : après une connexion par
//     email + mot de passe, le compte choisit son numéro de connexion et son
//     code PIN. « Plus tard » mène directement à son espace.
//   - mode 'initial' : PIN provisoire donné par un administrateur ; aucune
//     session n'est encore ouverte, le token restreint (state.token) ne
//     sert qu'à choisir le PIN personnel.
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listerPays } from '../services/geoService';
import { destinationEspace } from '../utils/apresConnexion';
import VerificationTelephone from '../components/auth/VerificationTelephone';
import { useConfigurationConnexion } from '../hooks/useConfigurationConnexion';

const PAYS_PAR_DEFAUT = 'CM';
const chiffres = (v) => v.replace(/\D/g, '').slice(0, 6);

export default function CreerPin() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { user, status, espaces, definirPin, changerPinInitial } = useAuth();
  const initial = state?.mode === 'initial';
  const retour = state?.retour ?? null;

  const [pays, setPays] = useState([]);
  const [form, setForm] = useState({ pays_iso2: PAYS_PAR_DEFAUT, telephone: user?.telephone ?? '', pin: '', confirmation: '', ancien_pin: '' });
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  // Vérification du numéro par code (si activée sur le serveur).
  const config = useConfigurationConnexion();
  const [preuve, setPreuve] = useState(null);
  const numeroInchange = Boolean(user?.telephone_verifie) && form.telephone === (user?.telephone ?? '');
  const verificationRequise = !initial && Boolean(config?.verification_telephone) && !numeroInchange;

  useEffect(() => {
    if (initial) return undefined;
    let annule = false;
    listerPays()
      .then((d) => { if (!annule) setPays((d?.pays ?? []).filter((p) => p.code_iso2)); })
      .catch(() => {});
    return () => { annule = true; };
  }, [initial]);

  if (initial && !state?.token) return <Navigate to="/login" replace />;
  if (!initial && status === 'unauthenticated') return <Navigate to="/login" replace />;

  const suite = (role, listeEspaces) => {
    const { to } = destinationEspace({ role, espaces: listeEspaces, retour });
    navigate(to, { replace: true });
  };

  const changer = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: ['pin', 'confirmation', 'ancien_pin'].includes(name) ? chiffres(value) : value }));
  };

  const soumettre = async (e) => {
    e.preventDefault();
    setErreur(null);
    if (!initial && !form.telephone.trim()) return setErreur('Renseignez votre numéro de téléphone.');
    if (form.pin.length !== 6) return setErreur('Le code PIN comporte 6 chiffres.');
    if (form.pin !== form.confirmation) return setErreur('Les deux codes PIN ne sont pas identiques.');
    if (verificationRequise && !preuve) return setErreur('Vérifiez d’abord votre numéro avec le code reçu.');

    setEnvoi(true);
    try {
      if (initial) {
        const data = await changerPinInitial(state.token, form.pin);
        suite(data.utilisateur?.role, data.espaces ?? []);
      } else {
        await definirPin({
          telephone: form.telephone,
          pays_iso2: form.pays_iso2,
          pin: form.pin,
          ...(user?.pin_defini && { ancien_pin: form.ancien_pin }),
          ...(preuve && { preuve_telephone: preuve }),
        });
        suite(user?.role, espaces);
      }
    } catch (err) {
      setErreur(err?.message || 'Enregistrement impossible. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section style={{ padding: '3rem 0' }}>
      <div className="container-aps" style={{ maxWidth: 480 }}>
        <div className="info-card" style={{ padding: '2rem' }}>
          <span className="eyebrow">{initial ? 'Première connexion' : 'Connexion plus simple'}</span>
          <h1 style={{ fontSize: '1.45rem', marginTop: '.6rem' }}>
            {initial ? 'Choisissez votre code PIN' : user?.pin_defini ? 'Changer mon code PIN' : 'Créez votre code PIN'}
          </h1>
          <p className="text-muted-soft">
            {initial
              ? 'Le code que vous avez reçu est provisoire. Choisissez maintenant votre code personnel à 6 chiffres.'
              : 'Connectez-vous ensuite avec votre numéro de téléphone et un code à 6 chiffres, sans email ni mot de passe.'}
          </p>

          {erreur && <div className="alert alert-danger" role="alert">{erreur}</div>}

          <form onSubmit={soumettre} noValidate>
            {!initial && (
              <div className="search-field">
                <label className="form-label-aps" htmlFor="pin-telephone">Numéro de téléphone</label>
                <div className="d-flex gap-2">
                  <select className="form-select" style={{ maxWidth: 140 }} name="pays_iso2" aria-label="Pays du numéro"
                    value={form.pays_iso2} onChange={changer} disabled={envoi}>
                    {(pays.length ? pays : [{ code_iso2: PAYS_PAR_DEFAUT, nom: 'Cameroun' }]).map((p) => (
                      <option key={p.code_iso2} value={p.code_iso2}>{p.nom}</option>
                    ))}
                  </select>
                  <input id="pin-telephone" name="telephone" type="tel" inputMode="tel" className="form-control"
                    placeholder="6XX XX XX XX" value={form.telephone} onChange={changer} disabled={envoi} autoComplete="tel" />
                </div>
                <p className="form-hint">C'est ce numéro que vous saisirez pour vous connecter.</p>
              </div>
            )}

            {verificationRequise && (
              <VerificationTelephone
                telephone={form.telephone}
                pays_iso2={form.pays_iso2}
                objet="changement_telephone"
                canaux={config.canaux}
                preuve={preuve}
                onPreuve={setPreuve}
              />
            )}

            {!initial && user?.pin_defini && (
              <div className="search-field">
                <label className="form-label-aps" htmlFor="pin-ancien">Code PIN actuel</label>
                <input id="pin-ancien" name="ancien_pin" type="password" inputMode="numeric" maxLength={6}
                  className="form-control" style={{ letterSpacing: '.4em' }} value={form.ancien_pin} onChange={changer} disabled={envoi} />
              </div>
            )}

            <div className="search-field">
              <label className="form-label-aps" htmlFor="pin-nouveau">Nouveau code PIN (6 chiffres)</label>
              <input id="pin-nouveau" name="pin" type="password" inputMode="numeric" maxLength={6} autoComplete="new-password"
                className="form-control" style={{ letterSpacing: '.4em' }} value={form.pin} onChange={changer} disabled={envoi} />
              <p className="form-hint">Évitez les suites (123456), les répétitions (111111) et votre date de naissance.</p>
            </div>

            <div className="search-field">
              <label className="form-label-aps" htmlFor="pin-confirmation">Confirmez le code PIN</label>
              <input id="pin-confirmation" name="confirmation" type="password" inputMode="numeric" maxLength={6} autoComplete="new-password"
                className="form-control" style={{ letterSpacing: '.4em' }} value={form.confirmation} onChange={changer} disabled={envoi} />
            </div>

            <button type="submit" className="btn btn-primary btn-block-aps btn-lg-aps" disabled={envoi}>
              {envoi ? <><i className="fa-solid fa-spinner fa-spin" /> Enregistrement…</> : 'Enregistrer mon code PIN'}
            </button>
            {!initial && (
              <button type="button" className="btn btn-link btn-block-aps mt-2" disabled={envoi} onClick={() => suite(user?.role, espaces)}>
                Plus tard
              </button>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
