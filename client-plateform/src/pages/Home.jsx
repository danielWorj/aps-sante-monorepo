import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import heroBg from '../assets/img/med7.jpg';

/* ---------------------------- Petits composants réutilisables ---------------------------- */

function StepperNav({ steps, current }) {
  return (
    <div className="stepper">
      {steps.map((label, i) => {
        const n = i + 1;
        const cls = n === current ? 'is-active' : n < current ? 'is-done' : '';
        return (
          <FragmentStep key={label} n={n} label={label} cls={cls} isLast={n === steps.length} />
        );
      })}
    </div>
  );
}

function FragmentStep({ n, label, cls, isLast }) {
  return (
    <>
      <div className={`step ${cls}`} data-step={n}>
        <span className="step-circle">{n}</span>
        <span className="step-label">{label}</span>
      </div>
      {!isLast && <div className="step-line" />}
    </>
  );
}

function UploadBox({ label, icon = 'fa-file-shield' }) {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const applyFile = (f) => {
    if (f) setFile(f);
  };

  return (
    <div className="col-md-6 mb-3">
      {label && <label className="form-label-aps">{label}</label>}
      <div
        className={`upload-box ${file ? 'has-file' : ''} ${dragOver ? 'is-dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          applyFile(e.dataTransfer.files?.[0]);
        }}
      >
        {file && (
          <button
            type="button"
            className="upload-remove"
            aria-label="Retirer le fichier"
            onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ''; }}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        )}
        <i className={`fa-solid ${icon}`} />
        {!file && (
          <span className="upload-default-text">
            <strong>Glissez le fichier ici</strong>
            <span>PDF, JPG — 5 Mo max</span>
          </span>
        )}
        <span className="upload-filename">{file ? file.name : ''}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          onChange={(e) => applyFile(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}

/* ---------------------------- Données administratives (Pays → Région → Département → Arrondissement) ---------------------------- */

const LOCATION_DATA = {
  Cameroun: {
    Adamaoua: {
      Vina: ['Ngaoundéré 1er', 'Ngaoundéré 2e', 'Ngaoundéré 3e', 'Belel'],
      Djérem: ['Tibati', 'Ngaoundal'],
      'Faro-et-Déo': ['Tignère', 'Galim-Tignère'],
      'Mayo-Banyo': ['Banyo', 'Bankim'],
      Mbéré: ['Meiganga', 'Djohong'],
    },
    Centre: {
      Mfoundi: ['Yaoundé 1er', 'Yaoundé 2e', 'Yaoundé 3e', 'Yaoundé 4e', 'Yaoundé 5e', 'Yaoundé 6e', 'Yaoundé 7e'],
      Lekié: ['Monatélé', 'Obala', "Sa'a"],
      'Mbam-et-Inoubou': ['Bafia', 'Ombessa'],
      'Nyong-et-Kellé': ['Eséka', 'Makak'],
      'Nyong-et-Mfoumou': ['Akonolinga', 'Ayos'],
      "Nyong-et-So'o": ['Mbalmayo', 'Ngomedzap'],
      'Haute-Sanaga': ['Nanga-Eboko', 'Bibey'],
      'Mbam-et-Kim': ['Ntui', 'Yoko'],
      'Méfou-et-Afamba': ['Mfou', 'Soa'],
      'Méfou-et-Akono': ['Ngoumou', 'Bikok'],
    },
    Est: {
      'Boumba-et-Ngoko': ['Yokadouma', 'Moloundou'],
      'Haut-Nyong': ['Abong-Mbang', 'Doumé'],
      Kadey: ['Batouri', 'Kentzou'],
      'Lom-et-Djérem': ['Bertoua 1er', 'Bertoua 2e'],
    },
    'Extrême-Nord': {
      Diamaré: ['Maroua 1er', 'Maroua 2e', 'Maroua 3e'],
      'Logone-et-Chari': ['Kousséri', 'Makary'],
      'Mayo-Danay': ['Yagoua', 'Kar-Hay'],
      'Mayo-Kani': ['Kaélé', 'Moulvoudaye'],
      'Mayo-Sava': ['Mora', 'Kolofata'],
      'Mayo-Tsanaga': ['Mokolo', 'Bourrha'],
    },
    Littoral: {
      Wouri: ['Douala 1er', 'Douala 2e', 'Douala 3e', 'Douala 4e', 'Douala 5e', 'Douala 6e'],
      Moungo: ['Nkongsamba 1er', 'Nkongsamba 2e', 'Manjo'],
      Nkam: ['Yabassi', 'Nkondjock'],
      'Sanaga-Maritime': ['Édéa 1er', 'Édéa 2e', 'Pouma'],
    },
    Nord: {
      Bénoué: ['Garoua 1er', 'Garoua 2e', 'Garoua 3e'],
      Faro: ['Poli', 'Béka'],
      'Mayo-Louti': ['Guider', 'Figuil'],
      'Mayo-Rey': ['Tcholliré', 'Rey-Bouba'],
    },
    'Nord-Ouest': {
      Boyo: ['Fundong', 'Belo'],
      Bui: ['Kumbo', 'Jakiri'],
      'Donga-Mantung': ['Nkambe', 'Ndu'],
      Menchum: ['Wum', 'Furu-Awa'],
      Mezam: ['Bamenda 1er', 'Bamenda 2e', 'Bamenda 3e'],
      Momo: ['Mbengwi', 'Batibo'],
      'Ngo-Ketunjia': ['Ndop', 'Babessi'],
    },
    Ouest: {
      Bamboutos: ['Mbouda', 'Galim'],
      'Haut-Nkam': ['Bafang', 'Bandja'],
      'Hauts-Plateaux': ['Baham', 'Bangou'],
      'Koung-Khi': ['Bandjoun', 'Djebem'],
      Menoua: ['Dschang', 'Fongo-Tongo'],
      Mifi: ['Bafoussam 1er', 'Bafoussam 2e', 'Bafoussam 3e'],
      Ndé: ['Bangangté', 'Bazou'],
      Noun: ['Foumban', 'Foumbot'],
    },
    Sud: {
      'Dja-et-Lobo': ['Sangmélima', 'Meyomessala'],
      Mvila: ['Ebolowa 1er', 'Ebolowa 2e'],
      Océan: ['Kribi 1er', 'Kribi 2e'],
      'Vallée-du-Ntem': ['Ambam', 'Olamze'],
    },
    'Sud-Ouest': {
      Fako: ['Limbe 1er', 'Limbe 2e', 'Limbe 3e', 'Buea', 'Tiko'],
      'Koupé-Manengouba': ['Bangem', 'Tombel'],
      Lebialem: ['Menji', 'Alou'],
      Manyu: ['Mamfe', 'Eyumojock'],
      Meme: ['Kumba 1er', 'Kumba 2e', 'Kumba 3e'],
      Ndian: ['Mundemba', 'Isangele'],
    },
  },
  Sénégal: {
    Dakar: {
      Dakar: ['Plateau', 'Médina', 'Grand Dakar'],
      Pikine: ['Pikine Nord', 'Pikine Ouest'],
      Guédiawaye: ['Golf Sud', 'Sam Notaire'],
      Rufisque: ['Rufisque Est', 'Rufisque Ouest'],
      'Keur Massar': ['Keur Massar Nord', 'Keur Massar Sud'],
    },
    Thiès: {
      Thiès: ['Thiès Nord', 'Thiès Est', 'Thiès Ouest'],
      Mbour: ['Mbour', 'Saly'],
      Tivaouane: ['Tivaouane', 'Mékhé'],
    },
    Diourbel: {
      Diourbel: ['Diourbel'],
      Bambey: ['Bambey'],
      Mbacké: ['Mbacké', 'Touba'],
    },
    'Saint-Louis': {
      'Saint-Louis': ['Saint-Louis'],
      Dagana: ['Dagana', 'Richard-Toll'],
      Podor: ['Podor'],
    },
    Ziguinchor: {
      Ziguinchor: ['Ziguinchor'],
      Bignona: ['Bignona'],
      Oussouye: ['Oussouye'],
    },
  },
  "Côte d'Ivoire": {
    Abidjan: {
      Abidjan: ['Cocody', 'Yopougon', 'Plateau', 'Marcory', 'Treichville', 'Abobo'],
    },
    'Haut-Sassandra': {
      'Haut-Sassandra': ['Daloa'],
    },
    Gôh: {
      Gôh: ['Gagnoa'],
    },
    Poro: {
      Poro: ['Korhogo'],
    },
    'Sud-Comoé': {
      'Sud-Comoé': ['Aboisso', 'Grand-Bassam'],
    },
  },
  Gabon: {
    Estuaire: {
      'Komo-Mondah': ['Libreville 1er', 'Libreville 2e', 'Libreville 3e', 'Libreville 4e', 'Libreville 5e'],
      Noya: ['Ntoum'],
    },
    'Haut-Ogooué': {
      'Lékoni-Lékori': ['Franceville'],
    },
    'Ogooué-Maritime': {
      Bendjé: ['Port-Gentil'],
    },
    'Woleu-Ntem': {
      Woleu: ['Oyem'],
    },
  },
};

function LocationCascadeFields({ idPrefix }) {
  const [pays, setPays] = useState('');
  const [region, setRegion] = useState('');
  const [departement, setDepartement] = useState('');
  const [arrondissement, setArrondissement] = useState('');

  const regions = pays ? Object.keys(LOCATION_DATA[pays] || {}) : [];
  const departements = pays && region ? Object.keys(LOCATION_DATA[pays]?.[region] || {}) : [];
  const arrondissements = pays && region && departement ? (LOCATION_DATA[pays]?.[region]?.[departement] || []) : [];

  return (
    <>
      <div className="col-md-6 mb-3">
        <label className="form-label-aps" htmlFor={`${idPrefix}-pays`}>Pays</label>
        <select
          className="form-select"
          id={`${idPrefix}-pays`}
          required
          value={pays}
          onChange={(e) => { setPays(e.target.value); setRegion(''); setDepartement(''); setArrondissement(''); }}
        >
          <option value="">Sélectionner…</option>
          {Object.keys(LOCATION_DATA).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="col-md-6 mb-3">
        <label className="form-label-aps" htmlFor={`${idPrefix}-region`}>Région</label>
        <select
          className="form-select"
          id={`${idPrefix}-region`}
          required
          value={region}
          disabled={!pays}
          onChange={(e) => { setRegion(e.target.value); setDepartement(''); setArrondissement(''); }}
        >
          <option value="">{pays ? 'Sélectionner…' : "Choisissez d'abord un pays"}</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="col-md-6 mb-3">
        <label className="form-label-aps" htmlFor={`${idPrefix}-departement`}>Département</label>
        <select
          className="form-select"
          id={`${idPrefix}-departement`}
          required
          value={departement}
          disabled={!region}
          onChange={(e) => { setDepartement(e.target.value); setArrondissement(''); }}
        >
          <option value="">{region ? 'Sélectionner…' : "Choisissez d'abord une région"}</option>
          {departements.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div className="col-md-6 mb-3">
        <label className="form-label-aps" htmlFor={`${idPrefix}-arrondissement`}>Arrondissement</label>
        <select
          className="form-select"
          id={`${idPrefix}-arrondissement`}
          required
          value={arrondissement}
          disabled={!departement}
          onChange={(e) => setArrondissement(e.target.value)}
        >
          <option value="">{departement ? 'Sélectionner…' : "Choisissez d'abord un département"}</option>
          {arrondissements.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
    </>
  );
}

/* ---------------------------- Formulaire 1 : devenir professionnel de santé ---------------------------- */

function MedecinForm() {
  const totalSteps = 4;
  const [step, setStep] = useState(1);
  const [preview, setPreview] = useState(null);
  const [filename, setFilename] = useState('');
  const formRef = useRef(null);

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

  const onPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(`${file.name} · ${(file.size / 1024).toFixed(0)} Ko`);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className="form-shell">
      <div className="form-shell-grid">
        <aside className="form-side">
          <h4>Pourquoi rejoindre APS ?</h4>
          <p>Votre fiche est visible dès validation de votre inscription à l&apos;Ordre.</p>
          <ul className="form-side-list">
            <li><i className="fa-solid fa-badge-check" /> Badge de vérification à l&apos;Ordre affiché sur votre fiche</li>
            <li><i className="fa-solid fa-calendar-days" /> Agenda et gestion des créneaux inclus</li>
            <li><i className="fa-solid fa-wallet" /> Portefeuille APS avec suivi des retraits</li>
            <li><i className="fa-solid fa-chart-line" /> Statistiques de vues et de conversion</li>
          </ul>
        </aside>

        <div className="form-main">
          <StepperNav steps={['Informations', 'Spécialité & Ordre', 'Justificatifs', 'Confirmation']} current={step} />

          <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
            {/* Étape 1 */}
            <div className={`form-page ${step === 1 ? 'active' : ''}`} data-step-page="1">
              <div className="avatar-upload-row">
                <label className="avatar-upload" htmlFor="med-photo-input">
                  {!preview && <i className="fa-solid fa-camera upload-placeholder-icon" />}
                  {preview && <img id="med-photo-preview" src={preview} alt="Aperçu de la photo de profil" />}
                  <span className="avatar-upload-badge"><i className="fa-solid fa-pen" /></span>
                  <input type="file" id="med-photo-input" accept="image/*" onChange={onPhotoChange} />
                </label>
                <div className="avatar-upload-info">
                  <strong>Photo de profil</strong>
                  <span className="upload-default-text">JPG, PNG — visage bien visible, fond neutre.</span>
                  <span className="upload-filename">{filename}</span>
                </div>
              </div>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label-aps" htmlFor="med-nom">Nom complet</label>
                  <input type="text" className="form-control" id="med-nom" placeholder="Dr. Aïcha Ngo" required />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label-aps" htmlFor="med-email">Adresse e-mail professionnelle</label>
                  <input type="email" className="form-control" id="med-email" placeholder="vous@exemple.com" required />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label-aps" htmlFor="med-tel">Téléphone</label>
                  <input type="tel" className="form-control" id="med-tel" placeholder="+237 6 xx xx xx xx" required />
                </div>
                <LocationCascadeFields idPrefix="med" />
              </div>
              <div className="form-nav-actions">
                <span />
                <button type="button" className="btn btn-primary" onClick={goNext}>
                  Continuer <i className="fa-solid fa-arrow-right" />
                </button>
              </div>
            </div>

            {/* Étape 2 */}
            <div className={`form-page ${step === 2 ? 'active' : ''}`} data-step-page="2">
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label-aps" htmlFor="med-specialite">Spécialité</label>
                  <select className="form-select" id="med-specialite" required defaultValue="">
                    <option value="">Sélectionner…</option>
                    <option>Médecine générale</option>
                    <option>Pédiatrie</option>
                    <option>Gynécologie</option>
                    <option>Cardiologie</option>
                    <option>Dentisterie</option>
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label-aps" htmlFor="med-ordre">Numéro d&apos;inscription à l&apos;Ordre</label>
                  <input type="text" className="form-control" id="med-ordre" placeholder="Ex : ONMC-2024-00123" required />
                  <p className="form-hint">Vérifié automatiquement auprès de la source officielle de votre pays.</p>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label-aps" htmlFor="med-annees">Années d&apos;expérience</label>
                  <input type="number" min="0" className="form-control" id="med-annees" placeholder="Ex : 6" />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label-aps" htmlFor="med-mode">Type de consultation proposée</label>
                  <select className="form-select" id="med-mode">
                    <option>Cabinet uniquement</option>
                    <option>Téléconsultation uniquement</option>
                    <option>Cabinet et téléconsultation</option>
                  </select>
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

            {/* Étape 3 */}
            <div className={`form-page ${step === 3 ? 'active' : ''}`} data-step-page="3">
              <div className="row">
                <UploadBox label="Pièce d'identité" icon="fa-id-card" />
                <UploadBox label="Attestation d'inscription à l'Ordre" icon="fa-file-shield" />
                <div className="col-12 mb-2">
                  <div className="form-check">
                    <input className="form-check-input" type="checkbox" id="med-cgu" required />
                    <label className="form-check-label" htmlFor="med-cgu" style={{ fontSize: '.86rem' }}>
                      J&apos;accepte les <a href="#">Conditions générales d&apos;utilisation</a> et la <a href="#">Politique de confidentialité</a>.
                    </label>
                  </div>
                </div>
              </div>
              <div className="form-nav-actions">
                <button type="button" className="btn btn-ghost" onClick={goPrev}>
                  <i className="fa-solid fa-arrow-left" /> Retour
                </button>
                <button type="button" className="btn btn-primary" onClick={goNext}>
                  <i className="fa-solid fa-paper-plane" /> Envoyer ma demande
                </button>
              </div>
            </div>

            {/* Étape 4 : confirmation */}
            <div className={`form-page ${step === 4 ? 'active' : ''}`} data-step-page="4">
              <div className="form-done">
                <div className="form-done-check"><i className="fa-solid fa-check" /></div>
                <h3>Demande envoyée</h3>
                <p>
                  Votre numéro d&apos;inscription à l&apos;Ordre est en cours de vérification auprès de la source officielle
                  de votre pays. Vous recevrez un e-mail dès la mise en ligne de votre fiche.
                </p>
                <a href="#" className="btn btn-outline-primary btn-sm-aps">
                  <i className="fa-solid fa-clock-rotate-left" /> Suivre l&apos;état de ma demande
                </a>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Formulaire 2 : inscrire un service ---------------------------- */

const SERVICE_TYPES = [
  { value: 'pharmacie', label: 'Pharmacie', icon: 'fa-mortar-pestle' },
  { value: 'clinique', label: 'Clinique / Hôpital', icon: 'fa-hospital' },
  { value: 'assurance', label: 'Assurance / Courtier', icon: 'fa-shield-heart' },
];

function DynamicFields({ type }) {
  switch (type) {
    case 'pharmacie':
      return (
        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label-aps" htmlFor="pha-garde">Participe aux gardes officielles ?</label>
            <select className="form-select" id="pha-garde"><option>Oui</option><option>Non</option></select>
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label-aps" htmlFor="pha-livraison">Livraison à domicile</label>
            <select className="form-select" id="pha-livraison"><option>Oui</option><option>Non</option></select>
          </div>
        </div>
      );
    case 'clinique':
      return (
        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label-aps" htmlFor="cli-type">Type d&apos;établissement</label>
            <select className="form-select" id="cli-type">
              <option>Clinique privée</option><option>Hôpital général</option><option>Centre de santé</option>
            </select>
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label-aps" htmlFor="cli-lits">Capacité (lits)</label>
            <input type="number" className="form-control" id="cli-lits" min="0" />
          </div>
        </div>
      );
    case 'assurance':
      return (
        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label-aps" htmlFor="ass-type">Type d&apos;acteur</label>
            <select className="form-select" id="ass-type"><option>Compagnie d&apos;assurance</option><option>Courtier</option></select>
          </div>
          <div className="col-md-6 mb-3">
            <label className="form-label-aps" htmlFor="ass-produits">Produits santé proposés</label>
            <input type="text" className="form-control" id="ass-produits" placeholder="Ex : mutuelle famille, hospitalisation" />
          </div>
        </div>
      );
    default:
      return null;
  }
}

function ServiceForm() {
  const totalSteps = 4;
  const [step, setStep] = useState(1);
  const [serviceType, setServiceType] = useState('pharmacie');
  const [coverPreview, setCoverPreview] = useState(null);
  const formRef = useRef(null);

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

  const onCoverChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCoverPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className="form-shell">
      <div className="form-shell-grid">
        <aside className="form-side">
          <h4>Un espace par type de service</h4>
          <p>Le formulaire s&apos;adapte automatiquement selon le service choisi.</p>
          <ul className="form-side-list">
            <li><i className="fa-solid fa-file-circle-check" /> Pièces justificatives adaptées à votre activité</li>
            <li><i className="fa-solid fa-eye" /> Statut de modération suivi en temps réel</li>
            <li><i className="fa-solid fa-star" /> Formule de visibilité Basique, Standard ou Premium</li>
          </ul>
        </aside>

        <div className="form-main">
          <StepperNav steps={['Type de service', 'Coordonnées', 'Justificatifs', 'Confirmation']} current={step} />

          <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
            {/* Étape 1 */}
            <div className={`form-page ${step === 1 ? 'active' : ''}`} data-step-page="1">
              <label className="form-label-aps mb-2 d-block">Quel type de service souhaitez-vous inscrire ?</label>
              <div className="service-type-grid">
                {SERVICE_TYPES.map((t) => (
                  <label className="service-type-opt" key={t.value}>
                    <input
                      type="radio"
                      name="service-type"
                      value={t.value}
                      checked={serviceType === t.value}
                      onChange={() => setServiceType(t.value)}
                    />
                    <span className="opt-card"><i className={`fa-solid ${t.icon}`} />{t.label}</span>
                  </label>
                ))}
              </div>

              <label className="cover-upload" htmlFor="srv-photo-input">
                {!coverPreview && (
                  <div className="cover-upload-placeholder">
                    <i className="fa-solid fa-image" />
                    <strong>Photo de la structure</strong>
                    <span>Façade, vitrine ou intérieur — JPG, PNG, 5 Mo max</span>
                  </div>
                )}
                {coverPreview && <img id="srv-photo-preview" src={coverPreview} alt="Aperçu de la photo de la structure" />}
                <div className="cover-upload-overlay"><span><i className="fa-solid fa-pen" /> Changer la photo</span></div>
                <input type="file" id="srv-photo-input" accept="image/*" onChange={onCoverChange} />
              </label>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label-aps" htmlFor="srv-nom">Nom de la structure</label>
                  <input type="text" className="form-control" id="srv-nom" placeholder="Ex : Pharmacie du Rond-Point" required />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label-aps" htmlFor="srv-registre">N° de registre / agrément</label>
                  <input type="text" className="form-control" id="srv-registre" placeholder="Ex : RCCM-2024-0456" required />
                </div>
              </div>

              <div className="dynamic-fields active">
                <DynamicFields type={serviceType} />
              </div>

              <div className="form-nav-actions">
                <span />
                <button type="button" className="btn btn-primary" onClick={goNext}>
                  Continuer <i className="fa-solid fa-arrow-right" />
                </button>
              </div>
            </div>

            {/* Étape 2 */}
            <div className={`form-page ${step === 2 ? 'active' : ''}`} data-step-page="2">
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label-aps" htmlFor="srv-resp">Nom du responsable</label>
                  <input type="text" className="form-control" id="srv-resp" required />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label-aps" htmlFor="srv-email">E-mail</label>
                  <input type="email" className="form-control" id="srv-email" required />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label-aps" htmlFor="srv-tel">Téléphone</label>
                  <input type="tel" className="form-control" id="srv-tel" required />
                </div>
                <LocationCascadeFields idPrefix="srv" />
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

            {/* Étape 3 */}
            <div className={`form-page ${step === 3 ? 'active' : ''}`} data-step-page="3">
              <div className="row">
                <UploadBox label="Registre / agrément officiel" icon="fa-file-shield" />
                <UploadBox label="Pièce d'identité du responsable" icon="fa-id-card" />
                <div className="col-12 mb-2">
                  <div className="form-check">
                    <input className="form-check-input" type="checkbox" id="srv-cgu" required />
                    <label className="form-check-label" htmlFor="srv-cgu" style={{ fontSize: '.86rem' }}>
                      J&apos;accepte les <a href="#">Conditions générales d&apos;utilisation</a> et la <a href="#">Politique de confidentialité</a>.
                    </label>
                  </div>
                </div>
              </div>
              <div className="form-nav-actions">
                <button type="button" className="btn btn-ghost" onClick={goPrev}>
                  <i className="fa-solid fa-arrow-left" /> Retour
                </button>
                <button type="button" className="btn btn-primary" onClick={goNext}>
                  <i className="fa-solid fa-paper-plane" /> Envoyer ma demande
                </button>
              </div>
            </div>

            {/* Étape 4 : confirmation */}
            <div className={`form-page ${step === 4 ? 'active' : ''}`} data-step-page="4">
              <div className="form-done">
                <div className="form-done-check"><i className="fa-solid fa-check" /></div>
                <h3>Demande envoyée</h3>
                <p>Vos pièces justificatives sont en cours de modération. Le statut de votre dossier reste consultable à tout moment depuis votre espace professionnel.</p>
                <a href="#" className="btn btn-outline-primary btn-sm-aps">
                  <i className="fa-solid fa-clock-rotate-left" /> Suivre l&apos;état de ma demande
                </a>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Page Home ---------------------------- */

export default function Home() {
  const [proTab, setProTab] = useState('medecin'); // 'medecin' | 'service'

  return (
    <>
      {/* ============================ HERO ============================ */}
      <section
        className="hero"
        style={{
          backgroundImage: `linear-gradient(120deg, rgba(6,20,40,.88) 0%, rgba(8,30,58,.78) 45%, rgba(10,40,70,.5) 100%), url(${heroBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 30%',
          backgroundRepeat: 'no-repeat',
          color: '#fff',
        }}
      >
        <div className="container-aps">
          <div className="hero-grid">
            <div>
              <span className="eyebrow">Santé accessible, partout</span>
              <h1>Le bon soin, <span className="accent">au bon moment</span>, près de chez vous.</h1>
              <p className="lead-text">
                APS réunit médecins, pharmacies, cliniques, ambulances et assureurs sur une seule plateforme.
                Cherchez, comparez et prenez rendez-vous en quelques minutes, avec un paiement sécurisé à chaque étape.
              </p>
              <div className="d-flex gap-3 flex-wrap">
                <Link to="/medecin" className="btn btn-primary btn-lg-aps">
                  <i className="fa-solid fa-magnifying-glass" /> Trouver un professionnel
                </Link>
                <a href="#rejoindre" className="btn btn-outline-primary btn-lg-aps">
                  <i className="fa-solid fa-user-doctor" /> Je suis professionnel
                </a>
              </div>

              <div className="trust-row">
                <div className="trust-item"><i className="fa-solid fa-circle-check" /> Vérification à l&apos;Ordre</div>
                <div className="trust-item"><i className="fa-solid fa-circle-check" /> Paiement sous séquestre (escrow)</div>
                <div className="trust-item"><i className="fa-solid fa-circle-check" /> Disponible dans plusieurs pays</div>
              </div>
            </div>

            <div className="search-card">
              <div className="search-card-title"><i className="fa-solid fa-magnifying-glass" /> Recherche rapide</div>
              <form onSubmit={(e) => e.preventDefault()}>
                <div className="search-field">
                  <label htmlFor="q-quoi">Spécialité, acte ou établissement</label>
                  <div className="input-icon">
                    <i className="fa-solid fa-stethoscope" />
                    <input type="text" id="q-quoi" className="form-control" placeholder="Ex : pédiatre, dentiste, pharmacie" />
                  </div>
                </div>
                <div className="search-field">
                  <label htmlFor="q-ou">Localisation</label>
                  <div className="input-icon">
                    <i className="fa-solid fa-location-dot" />
                    <select id="q-ou" className="form-select">
                      <option>Utiliser ma position actuelle</option>
                      <option>Douala — Akwa</option>
                      <option>Douala — Bonanjo</option>
                      <option>Douala — Bonapriso</option>
                      <option>Douala — Deido</option>
                      <option>Yaoundé — Bastos</option>
                      <option>Yaoundé — Mvog-Mbi</option>
                    </select>
                  </div>
                </div>
                <div className="search-field">
                  <label htmlFor="q-quand">Disponibilité</label>
                  <div className="input-icon">
                    <i className="fa-solid fa-calendar-days" />
                    <select id="q-quand" className="form-select">
                      <option>N&apos;importe quand</option>
                      <option>Aujourd&apos;hui</option>
                      <option>Cette semaine</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary btn-block-aps btn-lg-aps">Rechercher</button>
              </form>

              <div className="quick-access-row">
                <Link to="/urgences" className="btn btn-urgence btn-sm-aps">
                  <i className="fa-solid fa-truck-medical" /> Urgences
                </Link>
                <a href="#pharmacies" className="btn btn-outline-primary btn-sm-aps">
                  <i className="fa-solid fa-mortar-pestle" /> Pharmacie de garde
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================ ACCÈS RAPIDE ============================ */}
      <section id="urgences">
        <div className="container-aps">
          <div className="section-head">
            <span className="eyebrow">À propos d&apos;APS</span>
            <h2>Toute votre santé, réunie sur une seule plateforme</h2>
            <p>
              APS met en relation patients et professionnels de santé partout où vous êtes.
              Médecins, pharmacies, cliniques, ambulances et assureurs vérifiés sont réunis
              au même endroit, pour que vous trouviez la bonne réponse sans perdre de temps —
              y compris dans les situations qui ne peuvent pas attendre.
            </p>
          </div>

          <div className="access-cards">
            <div className="access-card is-urgence">
              <div className="icon-wrap"><i className="fa-solid fa-truck-medical" /></div>
              <div>
                <h3>Urgences</h3>
                <p>Numéros et services officiels de votre pays, appel direct à l&apos;ambulance la plus proche, bascule automatique si vous êtes à l&apos;étranger.</p>
                <Link to="/urgences" className="btn btn-urgence btn-sm-aps">Voir les numéros d&apos;urgence</Link>
              </div>
            </div>

            <div className="access-card is-garde" id="pharmacies">
              <div className="icon-wrap"><i className="fa-solid fa-mortar-pestle" /></div>
              <div>
                <h3>Pharmacies de garde</h3>
                <p>Planning officiel par créneau, liste triée par proximité et carte, mis à jour par les administrations de garde de chaque pays.</p>
                <a href="#" className="btn btn-outline-primary btn-sm-aps">Voir les pharmacies de garde</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================ COMMENT ÇA MARCHE ============================ */}
      <section className="section-alt">
        <div className="container-aps">
          <div className="section-head">
            <span className="eyebrow">Le parcours</span>
            <h2>Trois étapes, un seul rendez-vous</h2>
            <p>Un parcours pensé pour réduire le temps de réservation et éliminer les blocages du patient.</p>
          </div>

          <div className="steps-row">
            <div className="step-card">
              <span className="step-num">01</span>
              <h3><i className="fa-solid fa-magnifying-glass text-primary" /> Rechercher</h3>
              <p>Filtrez par spécialité, quartier, disponibilité et type de consultation (au cabinet ou téléconsultation).</p>
            </div>
            <div className="step-card">
              <span className="step-num">02</span>
              <h3><i className="fa-solid fa-calendar-check text-primary" /> Choisir un créneau</h3>
              <p>Sélectionnez un horaire libre, recevez un code unique et un QR code de confirmation instantanés.</p>
            </div>
            <div className="step-card">
              <span className="step-num">03</span>
              <h3><i className="fa-solid fa-lock text-primary" /> Confirmer &amp; payer</h3>
              <p>Payez en toute sécurité : les fonds restent sous séquestre jusqu&apos;à la réalisation de la consultation.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================ CATÉGORIES ============================ */}
      <section>
        <div className="container-aps">
          <div className="section-head">
            <span className="eyebrow">L&apos;annuaire</span>
            <h2>Un annuaire, tous les acteurs de santé</h2>
            <p>Chaque fiche est vérifiée et structurée selon le type d&apos;acteur.</p>
          </div>

          <div className="cat-grid">
            <Link to="/medecin" className="cat-card">
              <span className="cat-icon"><i className="fa-solid fa-user-doctor" /></span>
              <span><span className="cat-title">Médecins &amp; professionnels</span><span className="cat-sub">Généralistes, spécialistes, dentistes…</span></span>
              <i className="fa-solid fa-chevron-right" />
            </Link>
            <a href="#" className="cat-card">
              <span className="cat-icon"><i className="fa-solid fa-hospital" /></span>
              <span><span className="cat-title">Cliniques &amp; hôpitaux</span><span className="cat-sub">Établissements et services associés</span></span>
              <i className="fa-solid fa-chevron-right" />
            </a>
            <a href="#" className="cat-card">
              <span className="cat-icon"><i className="fa-solid fa-mortar-pestle" /></span>
              <span><span className="cat-title">Pharmacies</span><span className="cat-sub">De garde ou horaires classiques</span></span>
              <i className="fa-solid fa-chevron-right" />
            </a>
            <a href="#" className="cat-card">
              <span className="cat-icon"><i className="fa-solid fa-truck-medical" /></span>
              <span><span className="cat-title">Ambulances</span><span className="cat-sub">Appel direct, intervention rapide</span></span>
              <i className="fa-solid fa-chevron-right" />
            </a>
            <a href="#" className="cat-card">
              <span className="cat-icon"><i className="fa-solid fa-hands-holding" /></span>
              <span><span className="cat-title">Pompes funèbres</span><span className="cat-sub">Services et accompagnement</span></span>
              <i className="fa-solid fa-chevron-right" />
            </a>
            <Link to="/assurance" className="cat-card">
              <span className="cat-icon"><i className="fa-solid fa-shield-heart" /></span>
              <span><span className="cat-title">Assurances</span><span className="cat-sub">Compagnies et courtiers santé</span></span>
              <i className="fa-solid fa-chevron-right" />
            </Link>
          </div>
        </div>
      </section>

      {/* ============================ REJOINDRE APS (FORMULAIRES) ============================ */}
      <section className="section-alt" id="rejoindre">
        <div className="container-aps">
          <div className="section-head">
            <span className="eyebrow">Espace professionnel</span>
            <h2>Rejoignez APS</h2>
            <p>Que vous soyez médecin ou responsable d&apos;une structure, votre inscription est vérifiée avant mise en ligne.</p>
          </div>

          <div className="pro-tabs">
            <button
              type="button"
              className={`pro-tab-btn ${proTab === 'medecin' ? 'active' : ''}`}
              onClick={() => setProTab('medecin')}
            >
              <i className="fa-solid fa-user-doctor" /> Devenir professionnel de santé
            </button>
            <button
              type="button"
              className={`pro-tab-btn ${proTab === 'service' ? 'active' : ''}`}
              onClick={() => setProTab('service')}
            >
              <i className="fa-solid fa-building-shield" /> Inscrire un service
            </button>
          </div>

          <div>
            <div className={`pro-panel ${proTab === 'medecin' ? 'active' : ''}`}>
              {proTab === 'medecin' && <MedecinForm />}
            </div>
            <div className={`pro-panel ${proTab === 'service' ? 'active' : ''}`}>
              {proTab === 'service' && <ServiceForm />}
            </div>
          </div>
        </div>
      </section>

      {/* ============================ ASSURANCES (aperçu) ============================ */}
      <section id="assurances">
        <div className="container-aps">
          <div className="section-head">
            <span className="eyebrow">Mise en relation</span>
            <h2>Comparez les offres d&apos;assurance santé</h2>
            <p>Consultez les compagnies et courtiers, leurs produits et agences. La souscription se fait directement avec l&apos;assureur.</p>
          </div>
          <div className="row g-3">
            <div className="col-md-4">
              <div className="info-card h-100">
                <h3><i className="fa-solid fa-building-columns" /> Siège &amp; activités</h3>
                <p style={{ fontSize: '.88rem' }}>Présentation de la compagnie, ses agréments et son ancienneté.</p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="info-card h-100">
                <h3><i className="fa-solid fa-box-open" /> Produits &amp; agences</h3>
                <p style={{ fontSize: '.88rem' }}>Détail des produits santé proposés et localisation des agences.</p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="info-card h-100">
                <h3><i className="fa-solid fa-handshake" /> Mise en relation</h3>
                <p style={{ fontSize: '.88rem' }}>Aucune souscription en ligne : un conseiller vous recontacte directement.</p>
              </div>
            </div>
          </div>
          <div className="d-flex justify-content-center mt-4">
            <Link to="/assurance" className="btn btn-outline-primary btn-lg-aps">
              <i className="fa-solid fa-shield-heart" /> Voir l&apos;annuaire des assurances
            </Link>
          </div>
        </div>
      </section>

      {/* ============================ BANDEAU CTA ============================ */}
      <section className="cta-band">
        <div className="container-aps cta-band-inner">
          <div>
            <h3>Besoin d&apos;aide pour démarrer ?</h3>
            <p className="mb-0">Notre équipe support vous accompagne dans votre inscription, gratuitement.</p>
          </div>
          <a href="#" className="btn btn-primary btn-lg-aps"><i className="fa-solid fa-headset" /> Contacter le support</a>
        </div>
      </section>
    </>
  );
}