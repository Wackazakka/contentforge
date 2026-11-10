-- Hendelseslogg for ferdige filmer (Lars 10.11.2026).
--
-- «Kan du se om de har lastet ned filmene?» — det kunne vi ikke: ingenting
-- registrerte nedlastinger. Og morgenoppsummeringen skal skille filmer
-- brukeren fikk til selv fra filmer vi startet på nytt for dem.
--
-- type:
--   'nedlasting'        brukeren trykket «Last ned» (via /api/video-proxy)
--   'startet_av_oss'    vi startet produksjonen på nytt for brukeren
--
-- Bare servicenøkkelen skriver og leser (RLS på, ingen policyer).

create table if not exists public.film_hendelser (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  type text not null check (type in ('nedlasting', 'startet_av_oss')),
  job_id text,
  product_id uuid,
  user_id uuid,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists film_hendelser_job_idx on public.film_hendelser (job_id);
create index if not exists film_hendelser_tid_idx on public.film_hendelser (created_at);

alter table public.film_hendelser enable row level security;

-- Filmene vi har startet på nytt så langt
insert into public.film_hendelser (type, job_id, meta) values
  ('startet_av_oss', '8fc4c04c-349f-4d67-bb30-1ce505f88b70', '{"hvem":"Astrid","grunn":"standardlåten lå på feil sti (3.11)"}'),
  ('startet_av_oss', 'a7246e0a-133e-4738-b95a-dad9c21461d3', '{"hvem":"Amy","grunn":"dropleten gikk tom for minne (8.11)"}');
