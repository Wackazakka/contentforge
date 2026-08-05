-- IndigoBoom faar samme forenklede admin som Isabel (Lars 5/8: "kan vi gjoere
-- IndigoBoom-varianten identisk?").
--
-- Hva dette skjuler: Partnere og API-noekler i dashbord-menyen. Begge er
-- ubrukte -- white-label-pitchen har ikke skjedd, og per-ledd-prisingen er
-- ikke ferdig, saa menyvalgene lover mer enn de leverer.
--
-- Hva som BLIR staaende: Paaslag og Avregning. De handler om IndigoBooms egne
-- penger, og dem trenger de fra dag en.
--
-- Hva som IKKE endres, med vilje:
--   * show_language_toggle -- IndigoBoom distribuerer internasjonalt. Uten
--     bryteren ville en ikke-norsk artist vaert laast til norsk. Isabels
--     tjeneste er engelsk hele veien, saa der hadde bryteren motsatt effekt.
--   * colors -- magenta er IndigoBooms egen logofarge, ikke en arv fra oss.
--   * default_locale / currency -- norsk og kroner er riktig for dem.
--
-- Reversering er en linje: sett flagget til true igjen.
--
-- ASCII-only: Supabase-editoren tygger ae/oe/aa feil ved innliming.

-- ---------------------------------------------------------------------------
-- SPERRE: ReelHome har en tabell med SAMME navn i et ANNET Supabase-prosjekt
-- (jvnavubholyvihvytqkn). Denne blokken avbryter uten endringer der.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tenants'
  ) or not exists (
    select 1 from public.tenants where slug = 'centerforge'
  ) then
    raise exception 'FEIL PROSJEKT. Denne migrasjonen hoerer til ContentForge (wxnevywhtmovangkobal). Avbrutt uten endringer.';
  end if;
end $$;

update public.tenants
set show_advanced_admin = false
where slug = 'indigoboom';

-- Kontroll: IndigoBoom og Isabel skal naa staa likt paa admin-flagget, og
-- fortsatt ULIKT paa spraak, valuta og spraakbryter.
select slug,
       show_advanced_admin,
       show_language_toggle,
       default_locale,
       currency
from public.tenants
where slug in ('indigoboom', 'isabel')
order by slug;
