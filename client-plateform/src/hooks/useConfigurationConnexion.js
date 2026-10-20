// src/hooks/useConfigurationConnexion.js
//
// Configuration de la connexion (GET /auth/configuration-connexion) :
// vérification du numéro par code active ou non, canaux proposés. Un seul
// appel partagé par toutes les pages.
import { useEffect, useState } from 'react';
import authService from '../services/authService';

let configuration = null;
const PAR_DEFAUT = { verification_telephone: false, canaux: ['sms'], connexion_application: true };

export function useConfigurationConnexion() {
  const [config, setConfig] = useState(configuration);
  useEffect(() => {
    if (configuration) return undefined;
    let annule = false;
    authService.configurationConnexion()
      .then((c) => { configuration = c; if (!annule) setConfig(c); })
      .catch(() => { if (!annule) setConfig(PAR_DEFAUT); });
    return () => { annule = true; };
  }, []);
  return config;
}
