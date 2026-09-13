// N'utilise QUE la clé PUBLIQUE. Ne jamais importer le paquet "stripe"
// (SDK serveur) ici — toujours "@stripe/stripe-js".
import { loadStripe } from '@stripe/stripe-js';

let stripePromise;
export function getStripe() {
  if (!stripePromise) {
    const clePublique = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!clePublique) throw new Error('VITE_STRIPE_PUBLISHABLE_KEY manquant.');
    stripePromise = loadStripe(clePublique);
  }
  return stripePromise;
}