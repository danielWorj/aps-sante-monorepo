// FeedbackProvider.jsx
//
// Fournit useToast(), useConfirmation() et useSaisie() (voir
// feedback-context.js) à toute l'application. Les modales sont mises en file :
// si deux demandes arrivent en même temps, la seconde s'ouvre quand la
// première est résolue.
import { useCallback, useMemo, useRef, useState } from 'react';
import { DialogContext, ToastContext } from './feedback-context';
import ToastStack from './ToastStack';
import FeedbackDialog from './FeedbackDialog';
import './feedback.css';

const DUREES = { succes: 4000, info: 4500, avertissement: 6000, erreur: 7000 };
const MAX_TOASTS = 4;
const DUREE_SORTIE = 200; // doit correspondre à l'animation de sortie (feedback.css)

export default function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [file, setFile] = useState([]);
  const compteur = useRef(0);

  const fermerToast = useCallback((id) => {
    setToasts((liste) => liste.map((t) => (t.id === id ? { ...t, sortie: true } : t)));
    setTimeout(() => setToasts((liste) => liste.filter((t) => t.id !== id)), DUREE_SORTIE);
  }, []);

  const toast = useMemo(() => {
    const afficher = (type, message, options = {}) => {
      if (!message) return null;
      const id = ++compteur.current;
      const duree = options.duree ?? DUREES[type];
      setToasts((liste) => [...liste, { id, type, message, titre: options.titre, duree }].slice(-MAX_TOASTS));
      return id;
    };
    return {
      succes: (message, options) => afficher('succes', message, options),
      erreur: (message, options) => afficher('erreur', message, options),
      info: (message, options) => afficher('info', message, options),
      avertissement: (message, options) => afficher('avertissement', message, options),
      fermer: fermerToast,
    };
  }, [fermerToast]);

  const dialogue = useMemo(() => {
    const ouvrir = (mode, options) => new Promise((resolve) => {
      const opts = typeof options === 'string' ? { message: options } : (options || {});
      const titre = opts.titre || (mode === 'saisie' ? 'Saisie requise' : 'Confirmation');
      setFile((f) => [...f, { ...opts, titre, mode, id: ++compteur.current, resolve }]);
    });
    return {
      confirmer: (options) => ouvrir('confirmation', options),
      saisir: (options) => ouvrir('saisie', options),
    };
  }, []);

  const demande = file[0];
  const repondre = (valeur) => {
    demande.resolve(valeur);
    setFile((f) => f.slice(1));
  };

  return (
    <ToastContext.Provider value={toast}>
      <DialogContext.Provider value={dialogue}>
        {children}
        {demande && <FeedbackDialog key={demande.id} demande={demande} onRepondre={repondre} />}
        <ToastStack toasts={toasts} onFermer={fermerToast} />
      </DialogContext.Provider>
    </ToastContext.Provider>
  );
}
