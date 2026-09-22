-- 105: kvalitetsport paa proevebildene (22.09.2026).
--
-- Foer et menneske blir spurt «er dette deg?», skaares hvert proevebilde
-- mot sentroiden av hennes egne leverte bilder (102). Lars sa nei til tre
-- Flux 2-bilder som maalt laa paa 0,36 — de burde aldri vaert sendt.
-- Tallene lagres her saa terskelen kan kalibreres paa ekte data.
--   { "scores": [0.81, 0.79, 0.84], "mean": 0.813, "threshold": 0.6,
--     "passed": true, "decided_at": "..." }
alter table user_characters add column if not exists sample_scores jsonb;
