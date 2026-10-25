-- 2026-10-25: tre nivåer, og en vurdering før trening (Lars: «Ja, jeg vil at
-- du bygger det»).
--
-- FØR: alle kunne melde seg på, og en drop-in sto likt med en kjent
-- skuespiller. Publiseringen hadde en port (116), men ingenting stoppet en
-- trening — og hver trening er en regning hos fal.ai.
--
-- NÅ:
--   tier           new (nye ansikter) · pro (profesjonelle) · star (kjente navn)
--   intake_status  pending · accepted · declined
--
-- 🔑 NIVÅET SETTES BARE AV SERVEREN. Påmeldingen gir alltid «new»; byrålenken
-- gir «pro» og godtar påmeldingen (byrået går god for personen). «star» settes
-- bare av Norditech. Kolonnene er stengt for nettleseren som resten av raden
-- (096) — verifiser med anon: voice_actors?select=tier → 42501.
--
-- 🔑 PUBLISERING KREVER EN GODTATT PÅMELDING, i basen og ikke bare i ruta.
-- Triggeren fra 116 utvides: den slår til når is_public, identity_basis eller
-- intake_status ENDRES, så ingen profil som alt er publisert, tas ned av
-- migrasjonen.
--
-- Treningsporten står i API-ruta (/api/characters/train), fordi treningen
-- skriver til user_characters, som ikke har noen kobling til denne raden.

do $$
begin
  if not exists (select 1 from public.tenants where slug = 'centerforge') then
    raise exception 'FEIL PROSJEKT. Denne migrasjonen hoerer til ContentForge (wxnevywhtmovangkobal). Avbrutt uten endringer.';
  end if;
end $$;

alter table public.voice_actors
  add column if not exists tier text not null default 'new',
  add column if not exists intake_status text not null default 'pending',
  add column if not exists intake_decided_at timestamptz,
  add column if not exists intake_decided_by text,
  add column if not exists intake_note text;

alter table public.voice_actors drop constraint if exists voice_actors_tier_check;
alter table public.voice_actors add constraint voice_actors_tier_check
  check (tier in ('new', 'pro', 'star'));
alter table public.voice_actors drop constraint if exists voice_actors_intake_check;
alter table public.voice_actors add constraint voice_actors_intake_check
  check (intake_status in ('pending', 'accepted', 'declined'));

-- Alle som finnes i dag, er lagt inn av oss eller har meldt seg på før
-- vurderingen fantes: de godtas. Byrå-bekreftede blir profesjonelle.
update public.voice_actors
   set intake_status = 'accepted', intake_decided_at = now(), intake_decided_by = 'migrasjon:123'
 where intake_decided_at is null;
update public.voice_actors
   set tier = 'pro'
 where talent_agent_id is not null
    or (identity_basis = 'vouched' and coalesce(identity_confirmed_by, '') like 'agent:%');

create index if not exists voice_actors_intake_idx
  on public.voice_actors(owner_tenant_id, intake_status) where intake_status = 'pending';

create or replace function public.publisering_krever_identitet() returns trigger
language plpgsql as $$
begin
  if new.is_public is true
     and (tg_op = 'INSERT'
          or old.is_public is distinct from new.is_public
          or old.identity_basis is distinct from new.identity_basis
          or old.intake_status is distinct from new.intake_status) then
    if new.identity_basis = 'self_declared' then
      raise exception 'Profilen kan ikke publiseres før identiteten er bekreftet med BankID eller av et byrå'
        using errcode = 'P0001', hint = 'IDENTITY_UNCONFIRMED';
    end if;
    if new.intake_status is distinct from 'accepted' then
      raise exception 'Profilen kan ikke publiseres før påmeldingen er godtatt'
        using errcode = 'P0001', hint = 'INTAKE_NOT_ACCEPTED';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists publisering_krever_identitet on public.voice_actors;
create trigger publisering_krever_identitet
  before insert or update of is_public, identity_basis, intake_status on public.voice_actors
  for each row execute function public.publisering_krever_identitet();

notify pgrst, 'reload schema';

-- Kontroll
select 'nivå' as hva, tier as verdi, count(*) as antall from public.voice_actors group by tier
union all
select 'vurdering', intake_status, count(*) from public.voice_actors group by intake_status
order by 1, 2;
-- forventet: alle «accepted»; «pro» for dem som kom gjennom et byrå, resten «new»
