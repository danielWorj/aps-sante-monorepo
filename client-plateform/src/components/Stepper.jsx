// components/Stepper.jsx
import { useState } from 'react';

export default function Stepper({ steps }) {
  // steps = [{ label: 'Compte', content: <StepAccount /> }, ...]
  const [current, setCurrent] = useState(0);

  const next = (isValid) => isValid && setCurrent((c) => Math.min(c + 1, steps.length - 1));
  const prev = () => setCurrent((c) => Math.max(c - 1, 0));

  return (
    <div data-stepper>
      <ol className="stepper-nav">
        {steps.map((s, i) => (
          <li key={s.label} className={i === current ? 'is-active' : i < current ? 'is-done' : ''}>
            {s.label}
          </li>
        ))}
      </ol>
      <div className="form-page active">{steps[current].content}</div>
      <div className="form-nav-actions">
        {current > 0 && <button type="button" className="btn btn-ghost" onClick={prev}>Retour</button>}
        {current < steps.length - 1 && (
          <button type="button" className="btn btn-primary" onClick={() => next(true)}>Suivant</button>
        )}
      </div>
    </div>
  );
}