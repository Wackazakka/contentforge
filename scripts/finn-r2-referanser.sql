-- Hvor i databasen peker noe paa personmaterialet i den offentlige R2-boetta?
-- Kontroll FOER `node scripts/flytt-r2-personmateriale.mjs --slett-r2`.
--
-- Skriptet kjenner radene koden skriver. Denne leter i ALLE tekst-, varchar-,
-- jsonb- og array-kolonner i public, saa en rad ingen husket paa ogsaa blir
-- funnet. Bare lesing: query_to_xml kjoerer en count(*) per kolonne.
--
-- Etter --kopier skal bare rader skriptet IKKE skriver om staa igjen (f.eks.
-- utkast som peker paa own-voice/). Alt annet her betyr: ikke slett ennaa.
--
-- ASCII-only (Supabase-editoren tygger ae/oe/aa ved innliming).

with kolonner as (
  select c.table_name, c.column_name
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
  where c.table_schema = 'public'
    and c.data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY')
),
treff as (
  select k.table_name, k.column_name,
         (xpath('/row/n/text()', query_to_xml(format(
           'select count(*) as n from public.%I where %I::text ~ %L',
           k.table_name, k.column_name,
           'r2\.dev/(voice-actors|lesninger|own-voice|trening)/'
         ), false, true, '')))[1]::text::int as rader
  from kolonner k
)
select table_name, column_name, rader
from treff
where rader > 0
order by rader desc, table_name, column_name;
