-- 093: hvilken trener som laget modellen
--
-- HVORFOR. Vi kjoerer fal-ai/flux-lora-portrait-trainer (Flux 1,
-- portrett-spesialisert, ~$2 per kjoering). fal har naa Flux 2-trenere til
-- $0,0064 per steg -- ved vaare 1500 steg blir det ~$9,60, altsaa fem ganger
-- saa dyrt. Om det gir bedre ansiktslikhet vet vi IKKE, og sammenlikningen er
-- ikke "gammel mot ny": vaar er spesialisert paa portretter, Flux 2-treneren
-- er generell med karakterer som ett av flere bruksomraader.
--
-- NB: DENNE KOLONNEN ER MAALEINSTRUMENTET. Uten den kan to modeller se
-- forskjellige ut uten at noen kan si hvorfor, og sammenlikningen blir en
-- foelelse i stedet for et svar. Rader fra foer er alle portrett-treneren.
--
-- NB: TRENERVALGET ER ADMIN-STYRT, ALDRI KUNDENS. "Vil du ha Flux 1 portrett
-- eller Flux 2 dev?" er ikke et spoersmaal en produsent kan svare paa, og et
-- galt valg gir daarligere likhet hen faar skylden for selv. Kvaliteten paa
-- modellen er en egenskap ved RETTIGHETSHAVEREN -- samme logikk som PVC mot
-- en bibliotekstemme. Kunden velger person, ikke teknologi.

alter table public.user_characters
  add column if not exists trainer text;

update public.user_characters
   set trainer = 'fal-ai/flux-lora-portrait-trainer'
 where trainer is null;

comment on column public.user_characters.trainer is
  'fal-endepunktet som trente modellen. Maaleinstrument: uten den kan to modeller se ulike ut uten at noen vet hvorfor.';
