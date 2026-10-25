-- 2026-10-25: sperren paa publisering, og byraaets paameldingslenke (Lars:
-- «start med sperren og byraalenken»). Steg 2 av tre i registreringen (101).
--
-- FOER: identity_basis fantes (101) med tre verdier, men ingenting brukte den.
-- En selverklaert profil — bare en avkryssing gikk god for at personen finnes
-- — kunne publiseres med ett klikk. Investordokumentet lover det motsatte:
-- foer profilen publiseres, bekreftes identiteten med BankID eller ved at
-- byraaet som bringer henne inn, gaar god for henne.
--
-- 🔑 SPERREN STAAR OGSAA I BASEN. Adminruta stopper med en forklaring, men en
-- trigger stopper alle veier — ogsaa en rute ingen har tenkt paa ennaa. Den
-- slaar bare til naar is_public eller identity_basis ENDRES: ingen profil som
-- alt er publisert, blir tatt ned av denne migrasjonen.
--
-- 🔑 ADMINEN OVERSTYRER MED AAPNE OEYNE, IKKE MED ET SMUTTHULL (101 sa «en
-- admin skal kunne overstyre»). Overstyringen er aa gaa god for personen selv:
-- identity_basis='vouched', identity_confirmed_by='admin:<e-post>'. Da staar
-- det paa raden hvem som tok ansvaret, og naar.
--
-- 🔑 BYRAALENKEN ER EN NOEKKEL, OG BYRAAET SER HVEM SOM BRUKTE DEN. Hvert byraa
-- faar en tilfeldig enroll_token. Den som melder seg paa gjennom lenken, blir
-- vouched med talent_agent_id — og byraaet faar en e-post med navnet og en
-- lenke «Ikke vaar klient» (agent_objection_token). En lekket lenke gir
-- dermed ingen stille tilgang: byraaet ser det og kan trekke garantien.
-- Ny lenke = ny token; den gamle slutter aa virke.
--
-- Null i identity_basis = rad lagt inn av admin foer paameldingen fantes.
-- Den er ikke selverklaert og stoppes ikke.
--
-- Additiv og idempotent. Ingen eksisterende rad endres.

alter table public.talent_agents
  add column if not exists enroll_token text;
create unique index if not exists talent_agents_enroll_token_idx
  on public.talent_agents (enroll_token) where enroll_token is not null;
comment on column public.talent_agents.enroll_token is
  'Paameldingslenken: /bli-stemme?byraa=<token>. Ny token = ny lenke, den gamle slutter aa virke. Null = ingen lenke.';

alter table public.voice_actors
  add column if not exists identity_confirmed_at timestamptz,
  add column if not exists identity_confirmed_by text,
  add column if not exists agent_objection_token text;
create unique index if not exists voice_actors_agent_objection_idx
  on public.voice_actors (agent_objection_token) where agent_objection_token is not null;
comment on column public.voice_actors.identity_confirmed_by is
  'Hvem bekreftet identiteten: agent:<talent_agents.id> (byraalenken), admin:<e-post> (adminen gikk god for), bankid.';
comment on column public.voice_actors.agent_objection_token is
  'Lenken «Ikke vaar klient» i e-posten til byraaet. Brennes naar den brukes.';

create or replace function public.publisering_krever_identitet() returns trigger
language plpgsql as $$
begin
  if new.is_public is true
     and new.identity_basis = 'self_declared'
     and (tg_op = 'INSERT'
          or old.is_public is distinct from new.is_public
          or old.identity_basis is distinct from new.identity_basis) then
    raise exception 'Profilen kan ikke publiseres før identiteten er bekreftet med BankID eller av et byrå'
      using errcode = 'P0001', hint = 'IDENTITY_UNCONFIRMED';
  end if;
  return new;
end $$;

drop trigger if exists publisering_krever_identitet on public.voice_actors;
create trigger publisering_krever_identitet
  before insert or update of is_public, identity_basis on public.voice_actors
  for each row execute function public.publisering_krever_identitet();

-- Verifisering (anon-noekkelen, utenfra):
--   voice_actors?select=identity_confirmed_by  -> 42501 (finnes, stengt)
--   talent_agents?select=enroll_token          -> 42501
-- Triggeren proeves med en DO-blokk som ruller seg selv tilbake.
