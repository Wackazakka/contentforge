-- 2026-09-22: kjoenn har to verdier, ikke tre (Lars).
--
-- Vokabularet bor i lib/castingAttributes (KJOENN), og fem steder leser
-- derfra — skjemaet, adminen, filtrene og begge rutene fulgte med i samme
-- commit. Men basen hadde sin EGEN liste i to CHECK-skranker, og de maa
-- foelge med: ellers star koden og basen med ulikt vokabular, og en direkte
-- insert kunne lagt inn en verdi ingen flate kan vise. Samme prinsipp som
-- 084 — porten star i basen, ikke bare i koden.
--
-- Ingen rad bruker 'annet' (verifisert foer kjoering: 0 skuespillere,
-- 0 soeknader), saa skranken kan settes VALID uten backfill. Fantes det
-- rader, ville denne migrasjonen feilet paa dem — og det er riktig: da skal
-- et menneske avgjoere hva de skal bli, ikke et skript.
--
-- Idempotent: drop if exists + add.

alter table public.voice_actors
  drop constraint if exists actor_gender;
alter table public.voice_actors
  add constraint actor_gender
    check (gender is null or gender in ('kvinne', 'mann'));

alter table public.voice_actor_applications
  drop constraint if exists soknad_gender;
alter table public.voice_actor_applications
  add constraint soknad_gender
    check (gender is null or gender in ('kvinne', 'mann'));

-- Verifisering:
-- select conrelid::regclass::text, pg_get_constraintdef(oid)
--   from pg_constraint where conname in ('actor_gender','soknad_gender');
--   -- begge: CHECK ((gender IS NULL) OR (gender = ANY (ARRAY['kvinne','mann'])))
