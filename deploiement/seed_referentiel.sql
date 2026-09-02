-- =====================================================================
-- APS — Seed des référentiels transverses
-- Rôles (IAM) + Langues, Devises, Pays, Villes (Afrique centrale &
-- Afrique de l'Ouest)
--
-- Compatible avec le schema.prisma fourni :
--   - toutes les PK sont des UUID générés par gen_random_uuid()
--     (extension pgcrypto déjà activée dans le datasource)
--   - le script est idempotent : rejouable sans créer de doublons
--     (ON CONFLICT sur les colonnes uniques, NOT EXISTS ailleurs)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Rôles (table "role")
--    Reprend exactement le référentiel de la capture d'écran fournie.
-- ---------------------------------------------------------------------
INSERT INTO role (role_id, libelle, description) VALUES
  (gen_random_uuid(), 'patient',               'Patient utilisateur de la plateforme'),
  (gen_random_uuid(), 'medecin',                'Médecin ou professionnel de santé'),
  (gen_random_uuid(), 'admin',                  'Administrateur de la plateforme'),
  (gen_random_uuid(), 'superadmin',             'Administrateur supérieur'),
  (gen_random_uuid(), 'agent_structure_sante',  'Agent représentant une structure de santé'),
  (gen_random_uuid(), 'agent_pharmacie',        'Agent représentant une pharmacie'),
  (gen_random_uuid(), 'agent_ambulance',        'Agent représentant un service d ambulance'),
  (gen_random_uuid(), 'agent_pompes_funebres',  'Agent représentant une entreprise de pompes funèbres'),
  (gen_random_uuid(), 'agent_assurance',        'Agent représentant une compagnie d assurance')
ON CONFLICT (libelle) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Langues (table "langue")
--    Pas de contrainte UNIQUE sur "nom" dans le schéma -> on protège
--    l'idempotence avec un NOT EXISTS.
-- ---------------------------------------------------------------------
INSERT INTO langue (langue_id, nom)
SELECT gen_random_uuid(), v.nom
FROM (VALUES
  ('Français'),
  ('Anglais'),
  ('Portugais'),
  ('Espagnol')
) AS v(nom)
WHERE NOT EXISTS (SELECT 1 FROM langue l WHERE l.nom = v.nom);

-- ---------------------------------------------------------------------
-- 3. Devises (table "devise")
--    Idem, pas d'UNIQUE sur "libelle" -> NOT EXISTS.
-- ---------------------------------------------------------------------
INSERT INTO devise (devise_id, libelle)
SELECT gen_random_uuid(), v.libelle
FROM (VALUES
  ('Franc CFA BEAC (XAF)'),
  ('Franc CFA BCEAO (XOF)'),
  ('Franc congolais (CDF)'),
  ('Dobra santoméen (STN)'),
  ('Naira nigérian (NGN)'),
  ('Cedi ghanéen (GHS)'),
  ('Franc guinéen (GNF)'),
  ('Leone sierra-léonais (SLE)'),
  ('Dollar libérien (LRD)'),
  ('Dalasi gambien (GMD)'),
  ('Escudo cap-verdien (CVE)'),
  ('Ouguiya mauritanien (MRU)')
) AS v(libelle)
WHERE NOT EXISTS (SELECT 1 FROM devise d WHERE d.libelle = v.libelle);

-- ---------------------------------------------------------------------
-- 4. Pays (table "pays")
--    code_iso2 est UNIQUE -> ON CONFLICT DO NOTHING.
--    devise_id / langue_id résolus par sous-requête sur les libellés
--    insérés aux étapes 2 et 3.
--    statut_activation : 'pilote' par défaut pour tous les pays ajoutés
--    ici (à ajuster ensuite pays par pays selon le go-to-market réel).
-- ---------------------------------------------------------------------

-- 4.a Afrique centrale (CEMAC / CEEAC)
INSERT INTO pays (pays_id, code_iso2, nom, devise_id, langue_id, statut_activation)
SELECT gen_random_uuid(), v.code_iso2, v.nom,
       (SELECT devise_id FROM devise WHERE libelle = v.devise_libelle),
       (SELECT langue_id FROM langue WHERE nom = v.langue_nom),
       v.statut::"StatutActivationPays"
FROM (VALUES
  ('CM', 'Cameroun',                          'Franc CFA BEAC (XAF)',     'Français', 'actif'),
  ('CF', 'République centrafricaine',         'Franc CFA BEAC (XAF)',     'Français', 'pilote'),
  ('TD', 'Tchad',                              'Franc CFA BEAC (XAF)',     'Français', 'pilote'),
  ('CG', 'Congo',                              'Franc CFA BEAC (XAF)',     'Français', 'pilote'),
  ('GA', 'Gabon',                              'Franc CFA BEAC (XAF)',     'Français', 'pilote'),
  ('GQ', 'Guinée équatoriale',                 'Franc CFA BEAC (XAF)',     'Espagnol', 'pilote'),
  ('CD', 'République démocratique du Congo',   'Franc congolais (CDF)',   'Français', 'pilote'),
  ('ST', 'São Tomé-et-Príncipe',               'Dobra santoméen (STN)',   'Portugais','pilote')
) AS v(code_iso2, nom, devise_libelle, langue_nom, statut)
WHERE NOT EXISTS (SELECT 1 FROM pays p WHERE p.code_iso2 = v.code_iso2)
ON CONFLICT (code_iso2) DO NOTHING;

-- 4.b Afrique de l'Ouest (CEDEAO / UEMOA)
INSERT INTO pays (pays_id, code_iso2, nom, devise_id, langue_id, statut_activation)
SELECT gen_random_uuid(), v.code_iso2, v.nom,
       (SELECT devise_id FROM devise WHERE libelle = v.devise_libelle),
       (SELECT langue_id FROM langue WHERE nom = v.langue_nom),
       v.statut::"StatutActivationPays"
FROM (VALUES
  ('SN', 'Sénégal',           'Franc CFA BCEAO (XOF)',    'Français', 'actif'),
  ('CI', 'Côte d''Ivoire',    'Franc CFA BCEAO (XOF)',    'Français', 'actif'),
  ('ML', 'Mali',              'Franc CFA BCEAO (XOF)',    'Français', 'pilote'),
  ('BF', 'Burkina Faso',      'Franc CFA BCEAO (XOF)',    'Français', 'pilote'),
  ('NE', 'Niger',             'Franc CFA BCEAO (XOF)',    'Français', 'pilote'),
  ('GW', 'Guinée-Bissau',     'Franc CFA BCEAO (XOF)',    'Portugais','pilote'),
  ('BJ', 'Bénin',             'Franc CFA BCEAO (XOF)',    'Français', 'pilote'),
  ('TG', 'Togo',              'Franc CFA BCEAO (XOF)',    'Français', 'pilote'),
  ('NG', 'Nigeria',           'Naira nigérian (NGN)',     'Anglais',  'pilote'),
  ('GH', 'Ghana',             'Cedi ghanéen (GHS)',       'Anglais',  'pilote'),
  ('GN', 'Guinée',            'Franc guinéen (GNF)',      'Français', 'pilote'),
  ('SL', 'Sierra Leone',      'Leone sierra-léonais (SLE)','Anglais', 'pilote'),
  ('LR', 'Liberia',           'Dollar libérien (LRD)',    'Anglais',  'pilote'),
  ('GM', 'Gambie',            'Dalasi gambien (GMD)',     'Anglais',  'pilote'),
  ('CV', 'Cap-Vert',          'Escudo cap-verdien (CVE)', 'Portugais','pilote'),
  ('MR', 'Mauritanie',        'Ouguiya mauritanien (MRU)','Français', 'pilote')
) AS v(code_iso2, nom, devise_libelle, langue_nom, statut)
WHERE NOT EXISTS (SELECT 1 FROM pays p WHERE p.code_iso2 = v.code_iso2)
ON CONFLICT (code_iso2) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. Villes (table "ville")
--    Pas d'UNIQUE sur (pays_id, nom) dans le schéma -> NOT EXISTS.
--    code_postal laissé à NULL (peu de systèmes postaux structurés
--    dans la zone) : le champ reste éditable ensuite via l'API.
-- ---------------------------------------------------------------------
INSERT INTO ville (ville_id, pays_id, nom, code_postal)
SELECT gen_random_uuid(),
       (SELECT pays_id FROM pays WHERE code_iso2 = v.code_iso2),
       v.nom,
       NULL
FROM (VALUES
  -- Afrique centrale
  ('CM', 'Yaoundé'), ('CM', 'Douala'), ('CM', 'Garoua'),
  ('CF', 'Bangui'), ('CF', 'Berbérati'),
  ('TD', 'N''Djaména'), ('TD', 'Moundou'),
  ('CG', 'Brazzaville'), ('CG', 'Pointe-Noire'),
  ('GA', 'Libreville'), ('GA', 'Port-Gentil'),
  ('GQ', 'Malabo'), ('GQ', 'Bata'),
  ('CD', 'Kinshasa'), ('CD', 'Lubumbashi'), ('CD', 'Goma'),
  ('ST', 'São Tomé'),
  -- Afrique de l'Ouest
  ('SN', 'Dakar'), ('SN', 'Thiès'), ('SN', 'Saint-Louis'),
  ('CI', 'Abidjan'), ('CI', 'Yamoussoukro'), ('CI', 'Bouaké'),
  ('ML', 'Bamako'), ('ML', 'Sikasso'),
  ('BF', 'Ouagadougou'), ('BF', 'Bobo-Dioulasso'),
  ('NE', 'Niamey'), ('NE', 'Zinder'),
  ('GW', 'Bissau'),
  ('BJ', 'Cotonou'), ('BJ', 'Porto-Novo'),
  ('TG', 'Lomé'), ('TG', 'Sokodé'),
  ('NG', 'Lagos'), ('NG', 'Abuja'), ('NG', 'Kano'),
  ('GH', 'Accra'), ('GH', 'Kumasi'),
  ('GN', 'Conakry'), ('GN', 'Kankan'),
  ('SL', 'Freetown'), ('SL', 'Bo'),
  ('LR', 'Monrovia'),
  ('GM', 'Banjul'), ('GM', 'Serekunda'),
  ('CV', 'Praia'), ('CV', 'Mindelo'),
  ('MR', 'Nouakchott'), ('MR', 'Nouadhibou')
) AS v(code_iso2, nom)
WHERE NOT EXISTS (
  SELECT 1 FROM ville vi
  JOIN pays p ON p.pays_id = vi.pays_id
  WHERE p.code_iso2 = v.code_iso2 AND vi.nom = v.nom
);

COMMIT;

-- =====================================================================
-- Vérifications rapides (optionnel, à exécuter séparément) :
--
-- SELECT libelle, description FROM role ORDER BY libelle;
-- SELECT nom FROM langue ORDER BY nom;
-- SELECT libelle FROM devise ORDER BY libelle;
-- SELECT p.code_iso2, p.nom, d.libelle AS devise, l.nom AS langue, p.statut_activation
--   FROM pays p JOIN devise d ON d.devise_id = p.devise_id
--              JOIN langue l ON l.langue_id = p.langue_id
--   ORDER BY p.nom;
-- SELECT p.nom AS pays, v.nom AS ville FROM ville v
--   JOIN pays p ON p.pays_id = v.pays_id ORDER BY p.nom, v.nom;
-- =====================================================================