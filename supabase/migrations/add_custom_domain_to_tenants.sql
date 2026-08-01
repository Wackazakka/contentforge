-- Eget domene per tenant (2026-08-01).
--
-- Bakgrunn: tenant-oppslaget utleder slug fra SUBDOMENE av TENANT_BASE_DOMAIN
-- (norditech.io). Et eget domene som voicebank.ai matcher ingen regel og falt
-- derfor til root-tenanten (CenterForge): feil navn, logo og farger — og
-- verre, credit-checkout avviser alle privat-*-pakkene fordi de er gatet paa
-- slug = 'voicebank'. Prisene ville sett riktige ut (VoiceBanks kjedefaktor er
-- ogsaa 1), saa feilen ville dukket opp foerst i kassen.
--
-- Lagres UTEN www — koden stripper www foer oppslaget, saa baade
-- voicebank.ai og www.voicebank.ai treffer samme rad.

alter table tenants add column if not exists custom_domain text;

-- Ett domene kan bare peke paa en tenant.
create unique index if not exists tenants_custom_domain_key
  on tenants (custom_domain)
  where custom_domain is not null;

update tenants set custom_domain = 'voicebank.ai' where slug = 'voicebank';

-- PostgREST cacher skjemaet: uten denne er den nye kolonnen "not found in
-- schema cache" og oppslaget feiler stille (faller til subdomene-stien).
notify pgrst, 'reload schema';
