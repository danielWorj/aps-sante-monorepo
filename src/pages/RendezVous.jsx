import { Fragment, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import med1 from '../assets/img/med1.jpg';

/* ============================================================
   RendezVous.jsx — ex pages/rendez_vous.html
   ============================================================ */

const COMMISSION_APS = 1000;

function formatFCFA(montant) {
  return `${String(montant).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;
}

const MOTIFS = [
  { label: 'Consultation standard', honoraires: 15000 },
  { label: 'Téléconsultation', honoraires: 10000 },
  { label: 'Suivi vaccinal', honoraires: 8000 },
];

const DAYS = [
  { dow: 'Lun', num: '04', avail: '6 créneaux' },
  { dow: 'Mar', num: '05', avail: '4 créneaux' },
  { dow: 'Mer', num: '06', avail: '2 créneaux' },
  { dow: 'Jeu', num: '07', avail: '8 créneaux' },
  { dow: 'Ven', num: '08', avail: '3 créneaux' },
  { dow: 'Sam', num: '09', avail: '1 créneau' },
];

const JOURS_COMPLETS = {
  Lun: 'Lundi', Mar: 'Mardi', Mer: 'Mercredi', Jeu: 'Jeudi', Ven: 'Vendredi', Sam: 'Samedi', Dim: 'Dimanche',
};

const TIME_SLOTS = [
  { id: 't1', label: '08:30', disabled: false },
  { id: 't2', label: '09:15', disabled: false },
  { id: 't3', label: '10:00', disabled: false },
  { id: 't4', label: '11:00', disabled: true },
  { id: 't5', label: '14:00', disabled: false },
  { id: 't6', label: '14:45', disabled: false },
  { id: 't7', label: '15:30', disabled: true },
  { id: 't8', label: '16:30', disabled: false },
];

function StepperNav({ steps, current }) {
  return (
    <div className="stepper" style={{ maxWidth: 640 }}>
      {steps.map((label, i) => {
        const n = i + 1;
        const cls = n === current ? 'is-active' : n < current ? 'is-done' : '';
        return (
          <Fragment key={label}>
            <span className={`step ${cls}`} data-step={n}>
              <span className="step-circle">{n}</span>
              <span className="step-label">{label}</span>
            </span>
            {n < steps.length && <span className="step-line" />}
          </Fragment>
        );
      })}
    </div>
  );
}

export default function RendezVous() {
  const totalSteps = 4;
  const [step, setStep] = useState(1);
  const [motifIndex, setMotifIndex] = useState(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [timeSlot, setTimeSlot] = useState('t1');
  const [payMethod, setPayMethod] = useState('mm');
  const [copied, setCopied] = useState(false);
  const formRef = useRef(null);

  const motif = motifIndex !== null ? MOTIFS[motifIndex] : null;
  const honoraires = motif ? motif.honoraires : 0;
  const total = honoraires + COMMISSION_APS;

  const dateLabel = useMemo(() => {
    const d = DAYS[dayIndex];
    return `${JOURS_COMPLETS[d.dow] || d.dow} ${d.num}`;
  }, [dayIndex]);

  const timeLabel = TIME_SLOTS.find((t) => t.id === timeSlot)?.label ?? '';

  const ticketCode = 'APS-7K29-QD41';

  const goNext = () => {
    const activePage = formRef.current?.querySelector(`[data-step-page="${step}"]`);
    if (activePage) {
      const fields = activePage.querySelectorAll('input[required], select[required], textarea[required]');
      for (const field of fields) {
        if (!field.checkValidity()) {
          field.reportValidity();
          return;
        }
      }
    }
    setStep((s) => Math.min(s + 1, totalSteps));
  };
  const goPrev = () => setStep((s) => Math.max(s - 1, 1));

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(ticketCode);
    } catch {
      /* ignore — certains navigateurs/contexte bloquent l'API clipboard */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const RecapRows = ({ withTotal = true }) => (
    <>
      <div className="recap-row"><span className="label">Professionnel</span><span className="val">Dr. Aïcha Ngo</span></div>
      <div className="recap-row"><span className="label">Spécialité</span><span className="val">Pédiatre</span></div>
      <div className="recap-row"><span className="label">Motif</span><span className="val">{motif ? motif.label : 'Consultation standard'}</span></div>
      <div className="recap-row"><span className="label">Date</span><span className="val">{dateLabel}</span></div>
      <div className="recap-row"><span className="label">Heure</span><span className="val">{timeLabel}</span></div>
      <div className="recap-row"><span className="label">Honoraires</span><span className="val">{formatFCFA(honoraires)}</span></div>
      <div className="recap-row"><span className="label">Commission APS</span><span className="val">{formatFCFA(COMMISSION_APS)}</span></div>
      {withTotal && <div className="recap-total"><span>Total</span><span>{formatFCFA(total)}</span></div>}
    </>
  );

  return (
    <>
      <div className="container-aps" style={{ paddingTop: '1.1rem', fontSize: '.82rem' }}>
        <Link to="/" className="text-muted-soft">Accueil</Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: '.6rem' }} />
        <Link to="/medecin" className="text-muted-soft">Médecins</Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: '.6rem' }} />
        <Link to="/profil/aicha-ngo" className="text-muted-soft">Dr. Aïcha Ngo</Link>
        <i className="fa-solid fa-chevron-right text-faint mx-1" style={{ fontSize: '.6rem' }} />
        <span className="text-faint">Rendez-vous</span>
      </div>

      <section style={{ paddingTop: '1.25rem' }}>
        <div className="container-aps">

          <div className="d-flex align-items-center gap-3 mb-4">
            <div className="avatar-ph" style={{ width: 56, height: 56, fontSize: '1.3rem' }}>
              <img src={med1} alt="Dr. Aïcha Ngo" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.35rem' }}>Prendre rendez-vous avec Dr. Aïcha Ngo</h1>
              <p className="mb-0" style={{ fontSize: '.86rem' }}>Pédiatre &middot; Douala — Bonapriso</p>
            </div>
          </div>

          <div>
            <StepperNav steps={['Créneau', 'Vos informations', 'Paiement', 'Confirmation']} current={step} />

            <div className="rdv-shell">
              <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
                {/* Étape 1 : créneau */}
                <div className={`form-page ${step === 1 ? 'active' : ''}`} data-step-page="1">
                  <div className="info-card">
                    <h3><i className="fa-solid fa-stethoscope" /> Motif de consultation</h3>
                    <select
                      className="form-select"
                      id="rdv-motif"
                      required
                      value={motifIndex === null ? '' : motifIndex}
                      onChange={(e) => setMotifIndex(e.target.value === '' ? null : Number(e.target.value))}
                    >
                      <option value="">Sélectionner un motif…</option>
                      {MOTIFS.map((m, i) => (
                        <option key={m.label} value={i}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="info-card">
                    <h3><i className="fa-solid fa-calendar-days" /> Choisir une date</h3>
                    <div className="day-picker">
                      {DAYS.map((d, i) => (
                        <label className={`day-pill ${dayIndex === i ? 'active' : ''}`} key={d.num}>
                          <input type="radio" name="rdv-day" checked={dayIndex === i} onChange={() => setDayIndex(i)} />
                          <span className="dow">{d.dow}</span><span className="num">{d.num}</span><span className="avail">{d.avail}</span>
                        </label>
                      ))}
                    </div>

                    <h3 style={{ fontSize: '.92rem' }}><i className="fa-solid fa-clock" /> Choisir un horaire</h3>
                    <div className="time-grid">
                      {TIME_SLOTS.map((t) => (
                        <div className="time-slot" key={t.id}>
                          <input
                            type="radio"
                            name="time-slot"
                            id={t.id}
                            disabled={t.disabled}
                            checked={timeSlot === t.id}
                            onChange={() => setTimeSlot(t.id)}
                          />
                          <label className="slot-label" htmlFor={t.id}>{t.label}</label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="form-nav-actions">
                    <span />
                    <button type="button" className="btn btn-primary" onClick={goNext}>
                      Continuer <i className="fa-solid fa-arrow-right" />
                    </button>
                  </div>
                </div>

                {/* Étape 2 : informations patient */}
                <div className={`form-page ${step === 2 ? 'active' : ''}`} data-step-page="2">
                  <div className="info-card">
                    <h3><i className="fa-solid fa-user" /> Vos informations</h3>
                    <div className="row">
                      <div className="col-md-6 mb-3">
                        <label className="form-label-aps" htmlFor="p-nom">Nom complet</label>
                        <input type="text" className="form-control" id="p-nom" required />
                      </div>
                      <div className="col-md-6 mb-3">
                        <label className="form-label-aps" htmlFor="p-tel">Téléphone</label>
                        <input type="tel" className="form-control" id="p-tel" placeholder="+237 6 xx xx xx xx" required />
                      </div>
                      <div className="col-md-6 mb-3">
                        <label className="form-label-aps" htmlFor="p-email">E-mail</label>
                        <input type="email" className="form-control" id="p-email" required />
                      </div>
                      <div className="col-md-6 mb-3">
                        <label className="form-label-aps" htmlFor="p-naissance">Date de naissance</label>
                        <input type="date" className="form-control" id="p-naissance" />
                      </div>
                      <div className="col-12 mb-1">
                        <label className="form-label-aps" htmlFor="p-notes">Motif détaillé (facultatif)</label>
                        <textarea className="form-control" id="p-notes" rows="3" placeholder="Décrivez brièvement votre besoin" />
                      </div>
                    </div>
                  </div>
                  <div className="form-nav-actions">
                    <button type="button" className="btn btn-ghost" onClick={goPrev}>
                      <i className="fa-solid fa-arrow-left" /> Retour
                    </button>
                    <button type="button" className="btn btn-primary" onClick={goNext}>
                      Continuer <i className="fa-solid fa-arrow-right" />
                    </button>
                  </div>
                </div>

                {/* Étape 3 : paiement */}
                <div className={`form-page ${step === 3 ? 'active' : ''}`} data-step-page="3">
                  <div className="info-card">
                    <h3><i className="fa-solid fa-credit-card" /> Mode de paiement</h3>
                    <div className="row g-2">
                      {[
                        { id: 'pay-mm', value: 'mm', label: 'Mobile Money' },
                        { id: 'pay-cb', value: 'cb', label: 'Carte bancaire' },
                        { id: 'pay-agence', value: 'agence', label: 'Sur place' },
                      ].map((m) => (
                        <div className="col-md-4" key={m.id}>
                          <div className="form-check border rounded-3 p-3" style={{ borderColor: 'var(--line-strong)' }}>
                            <input
                              className="form-check-input"
                              type="radio"
                              name="pay-method"
                              id={m.id}
                              checked={payMethod === m.value}
                              onChange={() => setPayMethod(m.value)}
                            />
                            <label className="form-check-label" htmlFor={m.id} style={{ fontSize: '.86rem', fontWeight: 700 }}>
                              {m.label}
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div
                      className="mt-3 p-3"
                      style={{
                        background: 'var(--info-tint)', borderRadius: 10, fontSize: '.83rem',
                        color: 'var(--ink-soft)', display: 'flex', gap: '.6rem',
                      }}
                    >
                      <i className="fa-solid fa-lock" style={{ color: 'var(--info)' }} />
                      <span>Vos fonds sont conservés sous séquestre (escrow) et libérés au professionnel uniquement après la consultation.</span>
                    </div>
                    <div className="form-check mt-3">
                      <input className="form-check-input" type="checkbox" id="p-cgu" required />
                      <label className="form-check-label" htmlFor="p-cgu" style={{ fontSize: '.85rem' }}>
                        J&apos;accepte les <a href="#">Conditions générales</a> de réservation.
                      </label>
                    </div>
                  </div>
                  <div className="form-nav-actions">
                    <button type="button" className="btn btn-ghost" onClick={goPrev}>
                      <i className="fa-solid fa-arrow-left" /> Retour
                    </button>
                    <button type="button" className="btn btn-primary" onClick={goNext}>
                      <i className="fa-solid fa-lock" /> Payer &amp; confirmer
                    </button>
                  </div>
                </div>

                {/* Étape 4 : confirmation */}
                <div className={`form-page ${step === 4 ? 'active' : ''}`} data-step-page="4">
                  <div className="ticket">
                    <div className="ticket-top">
                      <div className="ticket-check"><i className="fa-solid fa-check" /></div>
                      <h3 style={{ fontSize: '1.15rem', marginBottom: '.3rem' }}>Rendez-vous confirmé</h3>
                      <p style={{ fontSize: '.87rem', marginBottom: 0 }}>Un rappel vous sera envoyé par SMS et e-mail avant votre consultation.</p>
                    </div>
                    <div className="ticket-divider" />
                    <div className="ticket-bottom">
                      <div className="ticket-code">{ticketCode}</div>
                      <div className="ticket-code-label">Code de confirmation</div>
                      <div className="qr-ph"><i className="fa-solid fa-qrcode" /></div>

                      <table className="hours-table">
                        <tbody>
                          <tr><td>Professionnel</td><td>Dr. Aïcha Ngo</td></tr>
                          <tr><td>Motif</td><td>{motif ? motif.label : 'Consultation standard'}</td></tr>
                          <tr><td>Date</td><td>{dateLabel}</td></tr>
                          <tr><td>Heure</td><td>{timeLabel}</td></tr>
                          <tr><td>Honoraires</td><td>{formatFCFA(honoraires)}</td></tr>
                          <tr><td>Commission APS</td><td>{formatFCFA(COMMISSION_APS)}</td></tr>
                          <tr><td><strong>Total payé</strong></td><td><strong>{formatFCFA(total)}</strong></td></tr>
                        </tbody>
                      </table>

                      <div className="d-flex gap-2 mt-3">
                        <button type="button" className="btn btn-outline-primary btn-block-aps" onClick={copyCode}>
                          <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`} /> {copied ? 'Copié' : 'Copier le code'}
                        </button>
                        <Link to="/medecin" className="btn btn-primary btn-block-aps">Retour à l&apos;annuaire</Link>
                      </div>
                    </div>
                  </div>
                </div>
              </form>

              {/* Récapitulatif latéral */}
              <aside className="recap-card">
                <h3><i className="fa-solid fa-receipt" /> Récapitulatif</h3>
                <RecapRows />
                <p className="recap-note"><i className="fa-solid fa-shield-halved" /> Paiement protégé jusqu&apos;à la consultation.</p>
              </aside>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}