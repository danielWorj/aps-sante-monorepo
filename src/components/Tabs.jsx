// components/Tabs.jsx
import { useState } from 'react';

export default function Tabs({ tabs }) {
  // tabs = [{ id: 'infos', label: 'Infos', content: <...> }, ...]
  const [active, setActive] = useState(tabs[0].id);

  return (
    <>
      <div className="aps-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={active === t.id ? 'active' : ''}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} className={`tab-panel ${active === t.id ? 'active' : ''}`}>
          {t.content}
        </div>
      ))}
    </>
  );
}