-- 111: TLID — tvillingens permanente, lesbare referanse (23.10.2026).
--
-- Investordokumentet: «Hver tvilling får en permanent TLID — en global
-- referanse som lisenser, kreditering og oppgjoer henger paa.» Foer dette
-- fantes bare uuid-en: permanent og unik, men ulesbar og usynlig.
--
-- 🔑 EN PER PERSON, KOMPONENTEN SOM TILLEGG. En rad i voice_actors er en
-- person med stemme og/eller ansikt. TLID-en hoerer til raden; en komponent
-- pekes ut som TL-7K4M-Q2XD/ansikt i grensesnittet (Lars 23.10).
--
-- 🔑 LESBAR. «TL-» + 8 tegn i to grupper, fra et alfabet uten tegn som kan
-- forveksles (ingen 0/O, 1/I/L, U): kan leses opp i telefonen og skrives inn
-- i en kontrakt. 30^8 ≈ 6,6e11 kombinasjoner; kollisjon proeves paa nytt.
--
-- 🔑 PERMANENT, HAANDHEVET I DATABASEN. En trigger nekter enhver endring.
-- En referanse lisenser henger paa kan ikke flyttes stille.
--
-- Ikke en hemmelighet: random() holder. Unikheten er det som teller.

create or replace function public.generer_tlid() returns text
language plpgsql volatile as $$
declare
  alfabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  kandidat text;
begin
  loop
    kandidat := 'TL-';
    for i in 1..8 loop
      if i = 5 then kandidat := kandidat || '-'; end if;
      kandidat := kandidat || substr(alfabet, 1 + floor(random() * 30)::int, 1);
    end loop;
    exit when not exists (select 1 from public.voice_actors where tlid = kandidat);
  end loop;
  return kandidat;
end $$;

alter table public.voice_actors add column if not exists tlid text;

-- Eksisterende rader faar sin naa, i opprettelsesrekkefoelge.
update public.voice_actors set tlid = public.generer_tlid() where tlid is null;

alter table public.voice_actors alter column tlid set default public.generer_tlid();
alter table public.voice_actors alter column tlid set not null;
create unique index if not exists voice_actors_tlid_key on public.voice_actors (tlid);

create or replace function public.tlid_er_permanent() returns trigger
language plpgsql as $$
begin
  if new.tlid is distinct from old.tlid then
    raise exception 'TLID er permanent og kan ikke endres (%)', old.tlid;
  end if;
  return new;
end $$;

drop trigger if exists tlid_permanent on public.voice_actors;
create trigger tlid_permanent
  before update of tlid on public.voice_actors
  for each row execute function public.tlid_er_permanent();

-- Laerdommen fra 096: ingenting nytt aapent for anon/authenticated.
-- (Triggerfunksjonen roeres ikke — den kan ikke kalles som RPC, og
-- rettigheter paa den skal ikke kunne stoppe en oppdatering av raden.)
revoke execute on function public.generer_tlid() from public, anon, authenticated;
grant execute on function public.generer_tlid() to service_role;
