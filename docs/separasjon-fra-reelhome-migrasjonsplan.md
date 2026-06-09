# Migrasjonsplan: Skille ContentForge ut fra ReelHomes Supabase-prosjekt

*Utarbeidet: 2026-06-09 · Opus plan-agent (read-only, verifisert mot live-DB)*

## Sammendrag

ContentForge og ReelHome deler i dag det samme Supabase-prosjektet (`jvnavubholyvihvytqkn`). Repoene, Netlify-sitene og R2-tilgangen er allerede separate, men **databasen og `auth.users` er fysisk delt**. Målet er å gi ContentForge sitt eget Supabase-prosjekt og fjerne all delt database-tilstand, uten å ta ned noen av de to produksjonsappene.

Verifiseringen endrer noen antakelser på viktige punkter:

1. **Env-vars for ContentForge er IKKE «secret» i Netlify** — de ligger i klartekst i `~/contentforge/netlify.toml` (`[build.environment]`). Ompeking er triviell (commit + redeploy), ikke via dashboard. Fjerner den største usikkerheten.
2. **R2 er delt, men ContentForge bruker ikke Supabase Storage** — kun Cloudflare R2 (`@aws-sdk/client-s3`, bucket `contentforge-assets`). INGEN Supabase Storage-buckets å migrere.
3. **Den ekte delingen er smalere enn antatt, men `auth.users` er kjernen.**

Anbefalt strategi: **Engangs, planlagt cutover med kort freeze-vindu (lavtrafikk), full `pg_dump`-basert kopi av hele prosjektet til nytt ContentForge-prosjekt, deretter sletting av ReelHome-tabeller i KOPIEN.** Tryggere enn selektiv tabell-eksport fordi FK-kjeden og `auth.users`-koblingen bevares intakt og UUID-er ikke kolliderer.

---

## Nåværende koblingsbilde (verifisert)

### Tabeller ContentForge bruker (grep `.from(...)`)
`social_connections`, `production_jobs`, `scheduled_publications`, `product_profiles`, `articles`, `publications`, `asset_banks`, `production_drafts`, `products`, `stripe_subscriptions`, `user_credits`, `organizations`, `credit_transactions`.

### Tabeller ReelHome bruker (topp)
`reelhome_sellers`, `profiles`, `organizations`, `video_credits`, `scheduled_publications`, `property_videos`, `social_connections`, `organization_members`, `reelhome_*`, `video_collections`, `properties`, `publications`, `credits`.

### Reell status på de «delte» tabellene (verifisert mot live-DB, read-only)

| Tabell | Rader (live) | Delt? | Hvordan |
|---|---|---|---|
| `auth.users` | (samme innlogginger) | **JA – ekte deling** | Begge apper autentiserer mot samme brukerbase. CF gjør `auth.admin.listUsers({perPage:1000})` og ser ALLE brukere, også ReelHomes. |
| `organizations` | 16 | **JA – ekte deling** | Begge apper skriver/leser. Ingen produkt-diskriminatorkolonne. |
| `social_connections` | 8 | **JA – ekte deling** | Nøklet på `user_id` + `platform`. Ingen `product_id`. (6×facebook, 1×linkedin live.) |
| `scheduled_publications` | **0** | Schema-delt, **ingen data** | Tom. Begge apper skriver til den. |
| `publications` | 26 | Schema-delt, **divergerte kolonner** | Live-tabellen har CF-skjema (`product_id`, `draft_id`). ReelHome skriver `property_id`+`connection_id`. De 26 radene er sannsynligvis CF sine. |

### FK-kjede i ContentForge
```
auth.users
  └─ organizations (owner_id → auth.users)
       └─ products (organization_id → organizations, ON DELETE CASCADE)
            ├─ product_profiles (product_id, UNIQUE)
            ├─ production_jobs (product_id)
            ├─ asset_banks (product_id)
            ├─ articles (product_id)
            └─ production_drafts (product_id)
auth.users
  ├─ user_credits (user_id → auth.users)
  ├─ credit_transactions (user_id → auth.users)
  └─ stripe_subscriptions (user_id → auth.users)
```
Alle CF-tabeller har RLS aktivert med `auth.uid()`-baserte policies.

### Delt infrastruktur utenfor DB
- **R2:** Bucket `contentforge-assets`. Samme bucket i BÅDE `~/boligforge/.env.local` og `~/contentforge/netlify.toml`. CF bruker kun R2, ikke Supabase Storage. → Ingen Storage-migrasjon; R2 forblir delt eller splittes senere.
- **Stripe:** CF har `app/api/stripe/webhook`. `stripe_subscriptions`/`user_credits`/`credit_transactions` (1 rad hver) er CF-only.
- **Netlify scheduled functions (CF):** `cron-publish.mjs` (leser `scheduled_publications`), `generate-image-background.mjs`. `CRON_SECRET=cf-cron-2026`.
- **Delte env-nøkler:** `SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL` peker på samme prosjekt i begge. R2-nøkler delt.

---

## Beslutning: delt auth & delte tabeller

### `auth.users` — ANBEFALING: (A) Kopier ALLE brukere til nytt prosjekt
- Det finnes **ingen ren tenant-grense**. Samme person kan ha både ReelHome- og CF-data under én `auth.users.id`. Å splitte brukere (B) løser ikke «begge»-brukere. Ekstern IdP/SSO (C) er for stor/risikabel arkitekturendring (berører BankID i ReelHome).
- (A) er trygt: `pg_dump` av `auth`-skjemaet bevarer `id` (UUID) og `encrypted_password` (bcrypt) → brukere logger inn i nytt CF-prosjekt med **samme passord**, og alle FK-er forblir gyldige uten remapping.
- Konsekvens: etter splitt finnes brukeren i to uavhengige `auth.users`. Passordendring i det ene propagerer ikke til det andre — forventet for to separate produkter. ReelHome-only-brukere blir ubrukte i CF-prosjektet (kan slettes i valgfri opprydding).

> Reneste måte: **full prosjekt-klon** (kopier HELE databasen, så slett det irrelevante), ikke selektiv eksport av `auth`-skjemaet.

### `organizations` — kopier ALLE (16), fjern ReelHome-eide senere (valgfritt)
### `social_connections` — kopier ALLE (8); ReelHomes blir foreldreløse i CF og ignoreres
### `scheduled_publications` — tom, ingen datamigrasjon, bare skjema
### `publications` — kopier ALLE (26); live-skjemaet er CF-varianten

### Speilbilde i ReelHome: ingenting slettes der i denne operasjonen
ReelHomes prosjekt forblir **100 % urørt**. CF slutter bare å peke på det. Valgfri opprydding av CF-data fra ReelHome-prosjektet = fase 6, ikke kritisk, høy risiko, utsett.

---

## Målarkitektur

**Nytt prosjekt:** `contentforge-prod` (ref-plassholder `cf_NEWREF`), samme region som ReelHome, Pro-tier.

| Komponent | Etter splitt |
|---|---|
| CF database | `cf_NEWREF`: CF-tabellene + `auth.users` (full kopi) + delte tabeller (kopiert) |
| CF auth | Egen `auth.users` i `cf_NEWREF` (samme UUID-er + passord-hasher) |
| CF Storage | Ingen (bruker R2) |
| CF R2 | Uendret bucket `contentforge-assets` (delt eller splittes senere) |
| CF Stripe webhook | Peker mot CF-app; uendret URL, men service-role byttes |
| ReelHome | **Helt uendret**, beholder `jvnavubholyvihvytqkn` med alle tabeller inkl. de delte |

---

## Skjema-migrasjon

**Strategi: full klon, så beskjær.** Ikke håndplukk tabeller — det river FK-kjeden og `auth`-koblingen.

1. **Opprett nytt prosjekt** `cf_NEWREF` i samme Supabase-org.
2. **Dump kildeprosjektet** (read-only, krever DB-passord fra dashboard — IKKE service-role):
   ```
   pg_dump --no-owner --no-privileges --schema=auth --schema=storage \
     -f auth_schema.sql "postgresql://postgres:<DBPW>@db.jvnavubholyvihvytqkn.supabase.co:5432/postgres"
   pg_dump --no-owner --no-privileges --schema=public -f public_schema.sql "<samme URI>"
   ```
   Bruk `supabase db dump` hvis tilgjengelig — håndterer `auth` korrekt.
3. **Restore til `cf_NEWREF`** — gir ALLE tabeller (også ReelHome-spesifikke). Bevisst: behold intakt `auth.users` + FK-graf først.
4. **Dropp ReelHome-spesifikke tabeller i KUN `cf_NEWREF`** (fase 5, etter dataverifisering): `properties`, `property_videos`, `profiles`, `video_credits`, `video_collections`, `collection_videos`, `organization_members`, `agent_profiles`, `reelhome_*`, `credits`, `app_config`. Behold delte: `organizations`, `social_connections`, `scheduled_publications`, `publications`.
5. **Verifiser RLS-policies** fulgte med (de er `auth.uid()`-baserte og fungerer uendret siden UUID-er bevares).

> Begge apper definerte `organizations` — én fysisk tabell, ingen omdøping nødvendig.

---

## Data-migrasjon

Full klon løser FK-rekkefølge og UUID-kollisjon automatisk (ett konsistent snapshot). Rekkefølge ved selektiv dump:
1. `auth.users` → 2. `organizations` → 3. `products` → 4. `product_profiles`/`production_jobs`/`asset_banks`/`articles`/`production_drafts` → 5. `user_credits`/`credit_transactions`/`stripe_subscriptions` → 6. `social_connections`/`publications` → 7. `scheduled_publications` (tom).

- **UUID-kollisjon:** ikke et problem (kopierer samme UUID-er til tomt nytt prosjekt).
- **Snapshot-konsistens:** ta dumpen under freeze-vinduet.

---

## Env & Storage & Stripe

### Env-ompeking (ContentForge) — sjekkliste
Bytt til `cf_NEWREF`:
- `NEXT_PUBLIC_SUPABASE_URL` → `https://cf_NEWREF.supabase.co` (i `netlify.toml`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → ny anon-key (i `netlify.toml`, committet i klartekst i dag)
- `SUPABASE_SERVICE_ROLE_KEY` → ny service-role (**ligger i Netlify-dashboard, ikke i toml** — bytt der)
- `SUPABASE_WEBHOOK_SECRET` (hvis brukt) → nytt
- **Uendret:** alle `R2_*`, `CF_ACCOUNT_ID`, `TIKTOK_*`, `RESEND_API_KEY`, `CRON_SECRET`, `ADMIN_EMAILS`, OAuth-secrets.
- Grep `~/contentforge` for alle `process.env.*SUPABASE*` for å bekrefte ingen hardkodede URL-er utenfor toml.

### Storage
CF bruker ingen Supabase Storage → ingen bucket-migrasjon. R2 forblir. (Splitt R2 senere hvis ønsket: ny bucket, rclone-kopi, oppdater `R2_BUCKET_NAME` + public URL. Utsett.)

### Stripe
- `stripe_subscriptions`/`user_credits`/`credit_transactions` kopieres med klonen.
- Webhook flytter med appen (samme Netlify-domene, URL endres ikke). Etter env-bytte skriver den til `cf_NEWREF`.
- Ingen dobbel-prosessering: kun én CF-webhook; ReelHome bruker ikke disse tabellene (bekreftet).

---

## Cutover

Lavtrafikk-vindu. Forventet freeze: 15–45 min.

1. **T-1 dag:** Opprett `cf_NEWREF`, prøve-klon, kjør verifiserings-sjekkliste mot kopien. Ikke pek CF mot den ennå.
2. **T-0 Freeze:** Sett CF i vedlikeholdsmodus / pause deploy + **deaktiver `cron-publish.mjs` + `generate-image-background.mjs`** så ingen CF-writes skjer.
3. **Snapshot:** Fersk `pg_dump`, restore til `cf_NEWREF`.
4. **Verifiser radantall** matcher kilde (alle 13 CF-tabeller + `auth.users`).
5. **Bytt env:** `netlify.toml` (anon+URL) + Netlify-dashboard (service-role). Commit til `~/contentforge`.
6. **Redeploy ContentForge** mot `cf_NEWREF`.
7. **Røyktest** CF (login, dashboard, produkt, credits).
8. **Re-aktiver CF cron** mot nytt prosjekt.
9. **Unfreeze.** ReelHome var aldri berørt.
10. **IKKE** slett noe i ReelHome-prosjektet ennå.

ReelHome har **null nedetid** — røres aldri. Kun CF har et freeze-vindu.

---

## Rollback

- **Hvis CF feiler etter cutover:** revert `netlify.toml` + sett service-role tilbake → redeploy. CF peker da igjen på `jvnavubholyvihvytqkn` som før. Kun writes i den korte feilperioden tapes.
- **Behold `cf_NEWREF`** ved feil — feilsøk uten tidspress.
- **Aldri DROP noe i `jvnavubholyvihvytqkn`** før CF har kjørt stabilt på nytt prosjekt i noen dager.
- Arbeid på branch i `~/contentforge`.

Farligste feil å unngå: slette ReelHome-tabeller i feil prosjekt. **Alle drop-operasjoner kjøres mot `cf_NEWREF`, aldri mot `jvnavubholyvihvytqkn`.** Verifiser prosjekt-ref før hver DDL.

---

## Verifisering

**ContentForge (mot `cf_NEWREF`):**
- [ ] Radantall matcher kilde: `products`=2, `product_profiles`=2, `articles`=120, `asset_banks`=587, `production_drafts`=38, `production_jobs`=16, `stripe_subscriptions`=1, `user_credits`=1, `credit_transactions`=1, `social_connections`=8, `organizations`=16, `publications`=26.
- [ ] Login med eksisterende bruker (passord uendret) fungerer.
- [ ] Dashboard laster produkter; produkt åpner med profil/jobs/assets.
- [ ] Credits-saldo vises riktig.
- [ ] R2-bilder/-videoer laster (R2 uendret).
- [ ] Publiser-flyt + OAuth-callback skriver til nytt prosjekt.
- [ ] `cron-publish.mjs` kjører mot nytt prosjekt.
- [ ] Stripe webhook test-event lander i `cf_NEWREF`.
- [ ] RLS: bruker ser kun egne produkter (test med to brukere).

**ReelHome (mot `jvnavubholyvihvytqkn`, skal være uendret):**
- [ ] reelhome.ai laster, login fungerer, property/video-flyt uendret.
- [ ] `organizations`/`social_connections`/`scheduled_publications`/`publications` uendret radantall.
- [ ] Ingen 500-feil relatert til CF-tabeller.

---

## Risiko

| Risiko | Alvorlighet | Tiltak |
|---|---|---|
| **DROP mot feil prosjekt (`jvnavubholyvihvytqkn`)** → tar ned ReelHome OG CF | **Kritisk / katastrofal** | Alle DDL mot `cf_NEWREF`. Verifiser ref før hver kommando. Ingen drop før CF er stabilt. |
| `auth.users`-hasher ikke korrekt kopiert → CF-brukere låst ute | Høy | Full `auth`-skjema-dump. Test login før unfreeze. Rollback klar. |
| Service-role i dashboard glemt byttet → CF skriver til feil prosjekt | Høy | Eksplisitt sjekkliste; test write etter cutover. |
| Stripe-webhook til gammelt prosjekt under freeze → tapt event | Middels | Kort freeze i lavtrafikk; Stripe retryer; verifiser etterpå. |
| Writes mellom dump og cutover (race) → datatap | Middels | Freeze CF + disable cron FØR endelig dump. |
| R2 fortsatt delt | Lav | Akseptabel; splitt senere. |

**Farligst:** en `DROP`/`DELETE` rettet mot ReelHome-prosjektet. Eneste operasjon som kan ta ned BEGGE. Derfor er opprydding (fase 6) frivillig, utsatt, og kjøres aldri mot `jvnavubholyvihvytqkn` uten ekstra verifisering.

---

## Faseplan

- **Fase 0 – Forberedelse** (ingen prod-endring): DB-passord, opprett `cf_NEWREF`, verifiser CLI-tilgang.
- **Fase 1 – Prøveklon + skjemaverifisering**: full dump → restore → verifiser radantall/FK/RLS. *(Fase 0)*
- **Fase 2 – Env-forberedelse**: hent nye keys, branch i `~/contentforge` med oppdatert `netlify.toml`. *(Fase 0)*
- **Fase 3 – Cutover (freeze)**: freeze, disable cron, fersk dump, restore, verifiser, bytt env, redeploy, røyktest, re-aktiver cron, unfreeze. *(Fase 1+2)*
- **Fase 4 – Post-cutover verifisering**: full sjekkliste, overvåk 24–72 t. *(Fase 3)*
- **Fase 5 – Beskjæring i `cf_NEWREF`** (frivillig): DROP ReelHome-tabeller i KUN nytt prosjekt. *(Fase 4 stabil)*
- **Fase 6 – Opprydding i ReelHome-prosjektet** (frivillig, HØY risiko): **anbefales utsatt på ubestemt tid**. *(Fase 5 + lang stabil periode)*

---

## Anbefalt gjennomføring (MVP-kuttlinje)

**Tryggeste minimumsleveranse = Fase 0 → 4.** Gir ContentForge fullstendig eget Supabase-prosjekt med egen `auth.users`, egen database og egne writes — målet nådd — **uten å røre ReelHome-prosjektet**.

1. Opprett `cf_NEWREF`, full klon (skjema + data inkl. `auth`).
2. Verifiser kopien grundig (radantall + login + RLS) mens CF fortsatt kjører mot gammelt prosjekt.
3. Kort freeze, fersk dump, bytt env (`netlify.toml` + dashboard service-role), redeploy, røyktest, unfreeze.
4. La det gamle prosjektet stå **urørt** som rollback-mål i minst noen dager.

**Utenfor MVP (utsett):** R2-splitt, sletting av ReelHome-tabeller i CF-prosjektet (Fase 5), sletting av CF-data fra ReelHome-prosjektet (Fase 6). Den fysiske isolasjonen som betyr noe — separate `auth.users` + separat database — oppnås allerede i MVP.

---

### Kritiske filer for gjennomføring
- `~/contentforge/netlify.toml`
- `~/contentforge/migrations/001_phase1_schema.sql`
- `~/contentforge/supabase/credits-migration.sql`
- `~/contentforge/app/api/stripe/webhook`
- `~/boligforge/.env.local`
