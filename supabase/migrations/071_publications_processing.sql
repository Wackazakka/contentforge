-- 071: Instagram-publisering i to steg.
-- Publish-ruta oppretter containeren hos Meta og logger raden med
-- status 'processing' (container-id laaner post_id). Klientens polling eller
-- cronen fullfoerer og setter 'published' / 'failed'. Se lib/instagramPublish.ts.
-- Additiv og idempotent -- kjoert mot wxnevywhtmovangkobal 2026-09-14.

alter table publications add column if not exists error text;
alter table publications add column if not exists connection_id uuid;

comment on column publications.error is 'Feilmelding naar status = failed';
comment on column publications.connection_id is 'social_connections.id som ble brukt -- trengs for aa fullfoere en processing-rad';

create index if not exists idx_publications_processing
  on publications (created_at)
  where status = 'processing';
