-- Prøver hovedbokens kjede og append-only (migrasjon 118) i drift, uten å
-- etterlate noe: alt prøves i en blokk som ruller seg selv tilbake, og
-- resultatet hentes ut via en midlertidig tabell. Kjøres ETTER 118.
--
-- Forventet: alle linjer «ok».

do $$
declare
  res text[] := '{}';
  foer record; etter record; ny record; kilde record;
  feil text;
begin
  begin
    select * into foer from public.kontroller_hovedboken();
    res := res || format('før: %s rader, %s uten kjede, %s brudd — %s', foer.rader, foer.uten_kjede, foer.brudd,
                         case when foer.brudd = 0 and foer.uten_kjede = 0 then 'ok' else 'FEIL' end);

    -- Ny rad, slik koden skriver dem
    select actor_id, used_by_tenant_id, asset_type into kilde from public.voice_usage_events order by kjede_seq desc limit 1;
    insert into public.voice_usage_events (actor_id, used_by_tenant_id, actor_rate_nok, customer_price_nok, asset_type, meta)
    values (kilde.actor_id, kilde.used_by_tenant_id, 1.5, 3, kilde.asset_type, '{"kind":"test","kilde":"test-hovedbok.sql"}')
    returning kjede_seq, prev_hash, row_hash into ny;
    res := res || format('ny rad fikk nummer %s og forrige fingeravtrykk = rotverdien før — %s', ny.kjede_seq,
                         case when ny.kjede_seq = foer.rader + 1 and ny.prev_hash = foer.rotverdi and ny.row_hash is not null then 'ok' else 'FEIL' end);
    select * into etter from public.kontroller_hovedboken();
    res := res || format('etter ny rad: %s brudd — %s', etter.brudd, case when etter.brudd = 0 and etter.rader = foer.rader + 1 then 'ok' else 'FEIL' end);

    -- Endring stoppes
    begin
      update public.voice_usage_events set actor_rate_nok = 999 where kjede_seq = ny.kjede_seq;
      res := res || ('endring av beløp: SLAPP GJENNOM — FEIL'::text);
    exception when others then res := res || ('endring av beløp stoppet — ok'::text); end;

    -- Sletting stoppes
    begin
      delete from public.voice_usage_events where kjede_seq = ny.kjede_seq;
      res := res || ('sletting: SLAPP GJENNOM — FEIL'::text);
    exception when others then res := res || ('sletting stoppet — ok'::text); end;

    -- Tømming stoppes
    begin
      truncate public.voice_usage_events;
      res := res || ('tømming: SLAPP GJENNOM — FEIL'::text);
    exception when others then res := res || ('tømming stoppet — ok'::text); end;

    -- Frakobling av en peker er lov (on delete set null)
    begin
      update public.voice_usage_events set organization_id = null where kjede_seq = ny.kjede_seq;
      res := res || ('frakobling av organisasjon tillatt — ok'::text);
    exception when others then
      get stacked diagnostics feil = message_text;
      res := res || ('frakobling av organisasjon: ' || feil || ' — FEIL');
    end;

    -- Juks oppdages: slå av vernet, endre beløpet, slå på igjen
    alter table public.voice_usage_events disable trigger hovedbok_bare_tillegg;
    update public.voice_usage_events set actor_rate_nok = 999 where kjede_seq = ny.kjede_seq;
    alter table public.voice_usage_events enable trigger hovedbok_bare_tillegg;
    select * into etter from public.kontroller_hovedboken();
    res := res || format('juks i rad %s: kontrollen fant %s brudd i rad %s — %s', ny.kjede_seq, etter.brudd, etter.foerste_brudd,
                         case when etter.brudd = 1 and etter.foerste_brudd = ny.kjede_seq then 'ok' else 'FEIL' end);

    raise exception 'rull tilbake';
  exception when others then
    get stacked diagnostics feil = message_text;
    if feil <> 'rull tilbake' then res := res || ('UVENTET: ' || feil); end if;
  end;
  create temp table if not exists hovedbok_testresultat (nr int, resultat text);
  delete from hovedbok_testresultat;
  insert into hovedbok_testresultat select i, res[i] from generate_subscripts(res, 1) i;
end $$;

select resultat from hovedbok_testresultat order by nr;
