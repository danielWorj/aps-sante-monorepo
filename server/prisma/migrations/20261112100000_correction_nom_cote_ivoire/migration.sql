-- Corrige le nom « Côte d'Ivoire » enregistré avec un « ô » mal encodé
-- (ex. « C“te d'Ivoire », « C?te d'Ivoire », « CÃ´te d'Ivoire »).
UPDATE "pays"
SET "nom" = 'Côte d''Ivoire'
WHERE "nom" <> 'Côte d''Ivoire'
  AND ("nom" ILIKE 'C_te d''Ivoire' OR "nom" ILIKE 'C__te d''Ivoire');
