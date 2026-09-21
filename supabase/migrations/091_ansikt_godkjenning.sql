-- 091: skuespilleren godkjenner sin egen ansiktsmodell
--
-- HULLET. Samtykkeporten (089) registrerer at NOEN gikk god for ansiktet --
-- men paa stemmesiden er det skuespilleren SELV som avgir erklaeringen, paa
-- sin egen ElevenLabs-konto. Paa ansiktssiden roerte hen aldri flyten: en
-- admin krysset av paa hennes vegne, og modellen var brukbar i samme
-- sekund som treningen var ferdig.
--
-- NB: MAN KAN IKKE VISE NOEN EN LoRA-FIL. Man kan bare vise hva den lager.
-- Godkjenning er derfor: tren, generer proevebilder MED modellen, og la
-- personen se seg selv slik den gjengir henne. Det er den eneste formen for
-- samtykke som er informert -- en signatur foer man har sett resultatet er en
-- signatur paa noe ingen visste hvordan saa ut.
--
-- NB: ERKLAERINGEN FRA 089 BESTEMMER OM DET TRENGS.
--   self / not_a_person  -> not_required (ingen tredjepart aa spoerre)
--   other_consented      -> pending, og GENERERING ER STENGT til hen svarer
-- Det var derfor 089 ble tre svar og ikke en boolean. Her betaler det seg.
--
-- DEFAULT ER STENGT. Rader fra foer settes til not_required -- vi kan ikke
-- kreve godkjenning i ettertid av modeller som alt er i bruk, og et stille
-- stopp av dem ville vaert verre enn hullet. Nye rader med other_consented
-- faar pending av koden.
--
-- ADVARSEL: KJOER FOER DEPLOY. Porten leser kolonnen ved hvert oppslag.

alter table public.user_characters
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists subject_email   text,
  add column if not exists approval_token  text,
  add column if not exists approval_sent_at timestamptz,
  add column if not exists approved_at     timestamptz,
  add column if not exists sample_urls     jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_characters_godkjenning') then
    alter table public.user_characters
      add constraint user_characters_godkjenning check (
        approval_status in ('not_required', 'pending', 'approved', 'rejected')
      );
  end if;
end $$;

-- Tokenet er en magisk lenke: det ER autentiseringen for den som skal svare.
-- Unikt, og bare der det finnes.
create unique index if not exists user_characters_approval_token_idx
  on public.user_characters(approval_token) where approval_token is not null;

comment on column public.user_characters.approval_status is
  'not_required | pending | approved | rejected. pending og rejected stenger ALL generering (lib/faceWithdrawal).';
comment on column public.user_characters.subject_email is
  'Personen som skal godkjenne. Settes naar consent_subject = other_consented.';
comment on column public.user_characters.sample_urls is
  'Proevebildene hen faktisk saa da hen sa ja. Fryses paa raden: "hva godkjente jeg?" maa vaere besvarbart i ettertid.';

-- ---------------------------------------------------------------------------
-- DEL 2: bildene inn i soeknaden
--
-- Soeknadsskjemaet tok bare LYD (.mp3/.wav/.m4a). En skuespiller som krysset
-- av for "ansikt" sendte inn et oenske og ingenting mer, og bildene maatte
-- komme utenom systemet -- e-post, WeTransfer, hva det naa ble.
--
-- Det er ikke en praktisk detalj. Det betyr at bilder av et virkelig menneske
-- reiste gjennom en kanal hovedboken ikke kjenner, til et produkt som selger
-- sporbarhet. Vi visste naar LoRA-en ble trent, men ikke hvor bildene kom fra
-- eller hvem som sendte dem.

alter table public.voice_actor_applications
  add column if not exists photo_urls jsonb not null default '[]'::jsonb;

comment on column public.voice_actor_applications.photo_urls is
  'Bildene soekeren selv lastet opp til ansiktstrening. Kommer fra hen, ikke fra en innboks.';
