-- 087: hvilken modell og hvilken lydtagg som faktisk leste replikken
--
-- Regien var to tall (stability, style), og de tallene kan ikke be om et rop:
-- lav stabilitet gir mer VARIASJON mellom lesninger, ikke mer intensitet, og
-- style honoreres daarlig av turbo-modellen. "Dramatisk" og "Noeytral" lot
-- like. Sterk regi gaar derfor over til v3-modellen, som tar regien som en
-- TAGG I TEKSTEN ([shouting] ...), med fall tilbake til turbo.
--
-- NB: DERFOR MAA RADEN BAERE MODELLEN. To lesninger med samme regi kan naa
-- komme fra ulike modeller -- hvis v3 feilet paa den ene -- og uten denne
-- kolonnen ville de latt helt ulikt uten at noen kunne se hvorfor. Da er
-- sammenlikningen Audition lover ikke lenger en sammenlikning.
--
-- ADVARSEL: KJOER DENNE FOER DEPLOY. Koden skriver kolonnene ved hver lesning;
-- mangler de, avviser PostgREST hele innsettingen og auditions stopper.
-- Motsatt vei er trygt: kolonnene staar tomme til koden kommer.

alter table public.audition_reads
  add column if not exists model text,
  add column if not exists tag   text;

comment on column public.audition_reads.model is
  'ElevenLabs-modellen som leste (eleven_v3 / eleven_turbo_v2_5). Null paa rader fra foer 087.';
comment on column public.audition_reads.tag is
  'Lydtaggen som ble lagt foran replikken, f.eks. "shouting, desperate". Null naar regien ikke har tagg, eller naar v3 feilet og turbo leste uten.';

-- Hva kontoen faktisk stoetter, leses ut slik etter foerste audition:
--   select direction, model, tag, count(*)
--   from public.audition_reads
--   where model is not null
--   group by 1,2,3 order by 1;
