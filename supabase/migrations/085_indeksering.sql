-- 085: Sokemotor-indeksering per tenant (Lars 20.09.2026)
--
-- BAKGRUNN. Layouten satte robots noindex for ALLE tenanter unntatt rota. Det
-- er riktig standard for en white-label: et byraa som selger i egen drakt skal
-- ikke konkurrere med seg selv i Google, og skal ikke dukke opp ved siden av
-- forvalteren paa samme soek.
--
-- Men TwinLedger er ikke en white-label. Det er DESTINASJONEN produsenter skal
-- FINNE. En katalog ingen finner er ingen katalog -- og et gallerikort som
-- aldri blir indeksert, er en rettighetshaver ingen oppdager.
--
-- Derfor en bryter per tenant i stedet for et unntak i koden: neste tenant som
-- skal vaere synlig, skal ikke kreve en ny deploy.
--
-- VIKTIG OM KANONISK ADRESSE. Fra dette punktet kan samme innhold ligge paa TO
-- verter (twinledger.ai og twinledger.norditech.io). Uten en kanonisk adresse
-- ville Google se duplikater. Koden loeser det ved aa kanonisere mot
-- custom_domain naar det er satt -- se getTenantCanonicalOrigin. Sett derfor
-- custom_domain FOER du skrur paa indeksering paa en tenant med to verter.
--
-- ASCII-only (Supabase-editoren tygger ae/oe/aa ved innliming).

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Avbrutt uten endringer.';
  end if;
end $$;

alter table public.tenants
  add column if not exists allow_indexing boolean not null default false;

comment on column public.tenants.allow_indexing is
  'Skal sokemotorer indeksere denne tenantens offentlige sider? Standard av: '
  'en white-label skal ikke konkurrere med forvalteren i sok. Kun for tenanter '
  'som ER en destinasjon. Sett custom_domain FORST hvis tenanten har to verter, '
  'ellers indekseres begge.';

-- TwinLedger er destinasjonen. Rota (centerforge) styres fortsatt av sin egen
-- gren i layouten og trenger ikke flagget.
update public.tenants set allow_indexing = true where slug = 'twinledger';

notify pgrst, 'reload schema';

select slug, allow_indexing, custom_domain
from public.tenants
where slug in ('twinledger', 'centerforge')
order by slug;
