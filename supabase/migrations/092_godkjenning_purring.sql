-- 092: purring paa ubesvarte ansiktsgodkjenninger
--
-- HULLET. Godkjenningen (091) har ingen frist. Svarer hun aldri, staar
-- modellen stengt for alltid -- som er den trygge feilretningen, men det
-- betyr at en glemt e-post blir et arbeid som stopper uten at noen vet
-- hvorfor. Kunden ser "venter paa godkjenning", adminen ser ingenting, og
-- hun har kanskje aldri sett e-posten.
--
-- NB: INGEN AUTOMATISK JA. Stemmesidens godkjenninger har timeout som
-- godkjenner selv hvis ingen svarer -- fordi det gjelder EN enkelt bruk med
-- en frist kunden maa rekke. Her gjelder det GRUNNLAGET: om et menneskes
-- ansikt i det hele tatt kan brukes. Taushet kan aldri bli et ja til det.
-- Purringen gjoer spoersmaalet synlig; den svarer aldri paa hennes vegne.
--
-- NB: TO PURRINGER, SAA STILLHET. Dag 3 og dag 10. Deretter slutter vi aa
-- mase og forteller adminen i stedet -- da er det et menneskeproblem, ikke et
-- e-postproblem, og noen boer ta en telefon. Endelos purring er sin egen skade.

alter table public.user_characters
  add column if not exists approval_reminded_at timestamptz,
  add column if not exists approval_reminders   int not null default 0;

comment on column public.user_characters.approval_reminded_at is
  'Siste purring. Sammen med approval_sent_at gir den klokka sveipet trenger.';
comment on column public.user_characters.approval_reminders is
  'Antall purringer sendt. Stopper paa 2 -- se 092 for hvorfor vi slutter aa mase.';

-- Sveipet leter etter ventende modeller. Faa rader, men spoerringen kjoerer
-- hver dag paa hele tabellen uten denne.
create index if not exists user_characters_pending_approval_idx
  on public.user_characters(approval_sent_at)
  where approval_status = 'pending';
