-- 089: samtykkeport foer LoRA-trening
--
-- HULLET DETTE LUKKER. Skjemaet hadde allerede en avkryssing med riktig tekst
-- ("jeg bekrefter at personen paa bildene har samtykket"), men den ble aldri
-- sendt til serveren -- kallet var {name, zipUrl} og ikke noe mer. Boksen
-- gatet en knapp i nettleseren og forsvant. Spurte noen etterpaa "samtykket
-- denne personen?", var svaret "noen huket av en boks, og vi beholdt ikke
-- noe".
--
-- ElevenLabs gater proff-kloning med sin egen verifisering: du maa spille inn
-- en erklaering om at stemmen er din. Det er ogsaa selverklaert -- men det er
-- LAGRET, og det er forskjellen. Vi kan ikke verifisere et ansikt teknisk;
-- vi kan kreve en erklaering og beholde den.
--
-- NB: TRE ULIKE SVAR, IKKE JA/NEI. "Har du lov?" er ett spoersmaal med tre
-- helt ulike begrunnelser, og de har ulik risiko:
--   self             -- bildene er av meg selv
--   other_consented  -- en annen person, som har sagt ja
--   not_a_person     -- fiktiv/generert, ingen aa samtykke paa vegne av
-- En ren boolean ville slaatt de tre sammen og gjort loggen ubrukelig den
-- dagen noen spoer hvem som gikk god for hva.
--
-- HISTORIKKEN MERKES, IKKE OMSKRIVES. Rader fra foer i dag kan ikke faa et
-- samtykke i ettertid. De settes til 'legacy_undeclared' -- et aerlig navn paa
-- det de er -- slik at skranken kan staa VALID og gjelde alt. Koden skriver
-- aldri den verdien.
--
-- ADVARSEL: KJOER FOER DEPLOY. Koden skriver de nye kolonnene ved hver
-- trening; mangler de, avviser PostgREST innsettingen og trening stopper.

alter table public.user_characters
  add column if not exists consent_subject     text,
  add column if not exists consent_declared_at timestamptz,
  add column if not exists consent_declared_by uuid;

comment on column public.user_characters.consent_subject is
  'Hvem bildene viser: self | other_consented | not_a_person. legacy_undeclared = rad fra foer 089, uten erklaering.';
comment on column public.user_characters.consent_declared_at is
  'Naar erklaeringen ble avgitt. Null kun paa legacy_undeclared.';
comment on column public.user_characters.consent_declared_by is
  'auth.users.id til den som erklaerte. Et samtykke uten avsender er en paastand uten ansvarlig.';

-- Historikk merkes foer skranken settes, saa den kan staa VALID.
update public.user_characters
   set consent_subject = 'legacy_undeclared'
 where consent_subject is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_characters_krever_samtykke'
  ) then
    alter table public.user_characters
      add constraint user_characters_krever_samtykke check (
        consent_subject in ('self', 'other_consented', 'not_a_person', 'legacy_undeclared')
        and (consent_subject = 'legacy_undeclared' or consent_declared_at is not null)
      );
  end if;
end $$;

-- Hva som faktisk er erklaert, leses slik:
--   select consent_subject, count(*) from public.user_characters group by 1 order by 2 desc;
