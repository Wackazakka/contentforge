-- 090: kundens vei til en lisens
--
-- BLINDVEIEN DETTE LUKKER. Produksjonsflaten stenger "Produser" naar en
-- rettighetshaver er valgt uten hjemmel, og lenket til "Opprett lisens" --
-- som gaar til /dashboard/voice-bank, en ADMIN-beskyttet side. En ekte kunde
-- som trykket der fikk 403 og en tom flate. Porten var riktig; doera paa
-- utsiden av den fantes ikke.
--
-- Og grunnen er stoerre enn lenken: det fantes ingen kundevei til en lisens i
-- det hele tatt. Lisenser opprettes i admin, og det er riktig -- takstkortet
-- er en TILBUDSGENERATOR, ikke en prisliste, og satsene skal forhandles. Men
-- da maa kunden ha en doer som sier "be om", ikke en som later som om hen kan
-- lage den selv.
--
-- NB: FELTENE ER TAKSTKORTETS EGNE AKSER, ikke fritekst. media_class,
-- territory, term_months og exclusivity er noeyaktig det foreslaaPris() tar
-- inn (lib/rateCard.ts). En forespoersel er dermed raastoffet til et tilbud:
-- kunden som har fylt ut dette har i praksis fylt ut halve lisensen, og
-- ingen maa oversette for haand.
--
-- Fritekst finnes bare i `note` -- det kunden vet som skjemaet ikke spoer om.

create table if not exists public.licence_requests (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid not null references public.voice_actors(id) on delete cascade,
  organization_id uuid,
  tenant_id       uuid,
  requested_by    uuid,
  requested_email text,

  -- Takstkortets akser. Samme verdier som lib/rateCard.ts -- ikke finn paa nye.
  asset_type   text not null check (asset_type  in ('voice', 'face', 'both')),
  media_class  text not null check (media_class in ('internal', 'online', 'broadcast')),
  territory    text not null check (territory   in ('no', 'nordic', 'world')),
  term_months  int  not null check (term_months in (3, 12, 0)),
  exclusivity  text not null check (exclusivity in ('none', 'category', 'full')),

  note        text,
  -- open: venter paa oss. quoted: tilbud sendt. closed: avvist eller trukket.
  -- En lisens som faktisk blir inngaatt lever i `licences`; denne raden er
  -- SPOERSMAALET, ikke avtalen, og skal ikke forveksles med den.
  status      text not null default 'open' check (status in ('open', 'quoted', 'closed')),
  licence_id  uuid references public.licences(id) on delete set null,

  created_at  timestamptz not null default now(),
  handled_at  timestamptz
);

create index if not exists licence_requests_actor_idx  on public.licence_requests(actor_id);
create index if not exists licence_requests_tenant_idx on public.licence_requests(tenant_id, status);

-- EN AAPEN FORESPOERSEL PER KUNDE OG SKUESPILLER. Uten denne sender en kunde
-- som treffer den stengte knappen fem ganger, fem like forespoersler -- og da
-- blir innboksen et sted man slutter aa se i.
create unique index if not exists licence_requests_en_aapen
  on public.licence_requests(actor_id, organization_id)
  where status = 'open';

alter table public.licence_requests enable row level security;

-- Ingen anon-tilgang. Alt gaar gjennom ruta med service-noekkel, som selv
-- avgjoer hvem som spoer -- samme moenster som resten av banken.
