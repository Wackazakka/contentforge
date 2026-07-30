# Plan: Farge-jobben for white-label-sidene

_Utkast skrevet natt til 30. juli 2026, basert på kartlegging av kodebasen.
**Ikke påbegynt** — venter på Lars' gjennomlesing og justering._

## Mål

En white-label-tenant (Både Og, Bombaza, kommende IndigoBoom) skal se ut som
sitt eget merke på **alle innloggede flater** — ikke bare den skreddersydde
forsiden. I dag får en tenant-bruker CenterForge-oransje (ember) i spinnere,
fokusrammer, kort-hover og tekstmarkering uansett hva tenanten har satt av
farger.

## Godt utgangspunkt: systemet finnes, adopsjonen mangler

Kartleggingen viste at infrastrukturen allerede er bygget og virker:

- `tenants.colors` (JSONB) injiseres som CSS-variabler på `<html>` i
  [app/layout.tsx:120](app/layout.tsx) — hvilken som helst token flyter
  DB → nettleser uten ny rørlegging.
- Skrivevei med validering finnes ([app/api/partners/route.ts:148](app/api/partners/route.ts)),
  og admin-UI-et eksponerer 4 tokens ([app/dashboard/partners/page.tsx:24](app/dashboard/partners/page.tsx)).
- Token-vokabularet ligger i [app/globals.css:46-62](app/globals.css)
  (`--paper`, `--ink`, `--ember`, `--ember-deep`, tint- og border-tokens m.fl.).

Problemet er alt som **omgår** systemet. Fire kategorier, i stigende størrelse:

1. **13 hardkodede ember-linjer i selve globals.css** — beseirer tenant-farger
   selv der alt annet er riktig: spinner (l.31), `::selection` (l.83),
   `.cf-card:hover` (l.130), `.cf-price-cta` (l.132), **`.cf-input:focus`
   (l.148–149, hvert skjemafelt i appen)**, legal-lenker og -toggle (l.210, 253–255).
2. **Hardkodet Daylight papir/blekk** (`#F4EEE2`, `#1C1A16` osv.) på mange
   sider — en mørk tenant som Både Og blir uleselig. Verst: dashboard-forsiden,
   calendar (29 treff), billing (18), AuthUI, NavBar, ProductModal, admin.
3. **Rå Tailwind-nøytraler** (`bg-white`, `text-gray-*`) fra før
   Daylight-designet — ignorerer både tokens og tenant-farger. Størst flate:
   avatar-siden (156 treff), produktsiden (128), radio (112),
   **video-editoren (106)**, voice-bank (102+75).
4. **34 fremmede aksentklasser** (blue/purple/amber) i 17 filer — bl.a. er
   «valgt»-tilstanden i dashboard/new `bg-blue-50 border-blue-500`
   ([app/dashboard/new/page.tsx:522](app/dashboard/new/page.tsx)) — en
   semantisk aksent som burde vært tenantens.

I tillegg tre funn utenfor selve fargene (eget spor, se fase 5):

- **Fallback-logoen** er CenterForge-ember-disken — en tenant uten opplastet
  `logo_url` får CenterForge-merket på login, navbar og start-siden
  ([components/CenterForgeLogo.tsx:22](components/CenterForgeLogo.tsx)).
- **Transaksjons-e-postene** (welcome/low-credits/subscription) er 100 %
  CenterForge: hardkodet palett, «CenterForge» i emne/bunntekst og avsender
  `hello@centerforge.app` — ingen tenant-oppslag i det hele tatt.
- **privacy/terms** hardkoder «CenterForge» — og begge de skreddersydde
  landingssidene lenker rett til dem.
- **`custom_domain`-kolonnen er død kode**: bare `<slug>.centerforge.app`
  resolver til tenant i dag; `badeog.no`/`bombaza.no` som apex gjør det ikke
  ([lib/tenantServer.ts:69-78](lib/tenantServer.ts)).

Landingssidene (`BombazaLanding`, `BadeOgLanding`) har bevisst egne, lukkede
paletter (`bz-*`/`bo-*`) — kommentarene i filene sier at tenant-tokens kun
skal styre innloggede flater. **Anbefaling: la dem være.** De er
skreddersydde uttrykk og har ikke problemet.

## Faseplan (prioritert etter hevstang)

### Fase 1 — token-integritet (liten, høyest effekt) ~1 time
Fiks alt som beseirer systemet for tenanter som allerede HAR satt farger:
- De 13 globals.css-linjene → `var(--ember*)`-tokens.
- Definer de foreldreløse tokene `--glow`/`--orb-lo` i `:root` (brukes i
  app/page.tsx med rå fallback; partner-API-et forventer dem allerede).
- Near-miss-hexene: `border-[#E3A883]` i publish (4 steder), pricing (2),
  `hover:text-[#1C1A16]` i white-label + partners.
- E-post-CTA-en i [lib/approvals.ts:105](lib/approvals.ts) (`#C5451B`).

### Fase 2 — nøytral-tokenisering av kjerneflater ~2–3 timer
Hardkodet Daylight papir/blekk → `--paper`/`--ink`/`--text-muted`-tokens, slik
at mørke paletter fungerer. Rekkefølge etter hva tenant-brukere ser mest:
AuthUI (login/registrering) → NavBar → dashboard-forsiden → ProductModal →
calendar → billing → LegalShell → admin-layout.
Klientkonteksten trenger samtidig `colors` i `TenantInfo`
([lib/tenantContext.tsx:7](lib/tenantContext.tsx) + [app/layout.tsx:134](app/layout.tsx))
hvis noe skal kunne velge lys/mørk krom klient-side.

### Fase 3 — Tailwind-nøytraler + fremmede aksenter (størst, kan deles opp) ~3–5 timer
`bg-white` → `bg-paper` osv., og semantiske aksenter (valgt/aktiv/fokus) →
tenant-tokens. Mekanisk, side for side — prioriter sidene
IndigoBoom-artister vil bruke: dashboard/new → products/[id] →
video-editoren → publish → voice-bank. Resten kan tas fortløpende senere.

### Fase 4 — admin-UI for hele paletten ~1 time
Utvid `COLOR_FIELDS` fra 4 til hele vokabularet (paper/ink/muted/border/glow)
med fargevelgere — skriveveien validerer og merger allerede. Da kan en ny
tenant (IndigoBoom) settes opp komplett fra admin uten DB-editering.

### Fase 5 — utenfor fargene, men avdekket (eget spor, kan vente)
- Tenant-aware transaksjons-e-poster (avsendernavn, palett, app_name).
- privacy/terms med tenant-navn.
- `custom_domain`-resolusjon (krever også DNS/Netlify-oppsett per domene).
- Nøytral fallback-logo, eller krav om `logo_url` ved tenant-oppretting.

## Verifisering

1. Opprett en test-tenant med bevisst grell palett (f.eks. grønn/rosa) og
   klikk gjennom alle hovedflater — alt som fortsatt er oransje/Daylight er
   en miss.
2. Både Og (mørk palett) som realistisk test nummer to.
3. Screenshots per flate før/etter.

⚠️ Praktisk: Next 16-dev plukker ikke opp globals.css-endringer (kjent
Turbopack-feil) — restart dev-serveren etter hver CSS-endring, ellers ser
fiksen død ut.

## Åpne spørsmål til Lars

1. **Omfang i morgen:** Anbefalingen min er fase 1 + 2 + 4 før
   IndigoBoom-byggingen (da kan IndigoBoom-tenanten fødes med riktig look),
   og fase 3 per-side etterpå. Enig?
2. Skal landingssidene forbli egne lukkede paletter? (Anbefaler ja.)
3. `custom_domain` nå eller senere? (Påvirker om badeog.no/bombaza.no kan
   peke på egen forside.)
4. E-post-brandingen — del av denne jobben eller eget spor?
5. Har IndigoBoom brand-retningslinjer/palett vi kan legge inn fra dag én?
