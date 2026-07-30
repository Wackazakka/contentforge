# Plan: IndigoBoom-white-label (artist-vertikal)

_Utkast skrevet natt til 30. juli 2026, basert på kartlegging av kodebasen.
**Ikke påbegynt** — venter på Lars' gjennomlesing. Forutsetter at
farge-jobben (egen plan: PLAN_FARGEJOBB_WHITELABEL.md) gjøres først, slik at
IndigoBoom-tenanten fødes med riktig look._

## Målbilde (fra kveldens samtale 29. juli)

Innholdsverktøy for IndigoBooms ~2 000 artister — promo for singelslipp,
album, turné, konsert, demo/øving og bandpresentasjon, med artistens **egen
musikk** som ryggrad (én låt eller crossfadet medley). Sangstemme-banken
(Kits.AI, ~200 stemmer) er OPPSALGET inne i verktøyet — ikke del av første
bygging (blokkert på Kits-vilkår og artist-avtale; se minnenotatet).

## Hva kartleggingen fant

**Godt nytt — dette finnes og gjenbrukes som det er:**
- Vertikal-mekanismen ([lib/verticals.ts](lib/verticals.ts)): ny vertikal =
  én oppføring + én meldingsfil per språk, null komponentendringer (bevist
  med craftsman/Bombaza).
- Tenant-treet med markup, lisensavgift og 3 % infrastrukturavgift; ny
  tenant er én DB-rad.
- Fire innholdspipelines (video/radio/avatar/artikkel) med
  godkjenn-alle-segmenter-gate, Stripe-checkout, publisering til 8
  plattformer + planlegging.
- Produkt-scopet lydlagring finnes allerede (jingle-mønsteret
  `jingles-<productId>`, opplasting + avspillingsproxy med Range-støtte).

**Hull som må bygges (eller utsettes bevisst):**
- **Musikk-bed/crossfade finnes ikke** — ingen ffmpeg i webappen; all
  lydmiks skjer i droplet-rendereren (Python). Medley = jobb på dropleten.
- **Musikkdomenet finnes ikke** — null treff på artist/band/track/release i
  koden. Alt artist-spesifikt er nytt.
- **Ingen katalogimport** — IndigoBooms katalog (lydfiler, slippdatoer,
  covers) krever integrasjon som ikke kan bygges før partnerskapet er
  avtalt. V1 = artisten laster opp egne låter manuelt.
- **Ingen TTS-provider-abstraksjon** — ElevenLabs er hardkodet i kolonnenavn
  (`elevenlabs_voice_id`) og fem kallsteder; MiniMax er en parallell kopi,
  ikke adapter. Kits.AI har ingen søm å plugges inn i. (Berører ikke
  innholdsverktøyet — kun stemmebank-oppsalget senere.)
- **Prompt-laget har ingen vertikal-krok** — `senderContext` er duplisert i
  to filer med hardkodede engelske etiketter.
- **Org = én eier** — ingen medlemsroller. Et band blir i praksis én
  organisasjon med én innlogget eier (vokalist/manager) i v1.

## Faseplan

### Fase 1 — IndigoBoom-tenant + artist-vertikal (~2–3 timer)
1. Tenant-rad: slug `indigoboom` (→ indigoboom.centerforge.app), navn,
   farger/logo (behøver brand-materiell fra Lars/IndigoBoom — åpent spm. 1).
2. Ny vertikal `music` i [lib/verticals.ts](lib/verticals.ts):
   `categoryOptions` = sjangerliste, kontaktfelter (booking-e-post/telefon,
   nettside), logoUpload på (bandfoto/logo). «Produkt» = band/artist;
   beskrivelsen = bio.
3. Meldingsfiler `messages/verticals/music.{no,en}.json` — all UI-tekst i
   artistspråk («Registrer bandet», «Bandets bio», osv. — klarspråk).
4. Refaktorer `senderContext` til én delt hjelper med vertikal-bevisste
   etiketter («Artist/band:», «Sjanger:») — fjerner dupliseringen i
   [app/api/content/produce/draft/route.ts](app/api/content/produce/draft/route.ts)
   og [netlify/functions/generate-article-background.mjs](netlify/functions/generate-article-background.mjs).

### Fase 2 — kampanjemaler for artister (~2–4 timer)
Seks kampanjetyper som strukturerte brief-maler i «ny produksjon»-flyten
(vertikal-gatet, synlige kun for music-vertikalen):
- **Singelslipp** (låttittel, slippdato, pre-save-lenke, cover)
- **Albumslipp** (tittel, dato, låtliste-utdrag)
- **Turné** (datoliste med byer/venues, billettlenke)
- **Enkeltkonsert** (venue, dato, billettlenke)
- **Demo/øving** (rå-innramming: «ny låt under arbeid» — ikke poler)
- **Bandpresentasjon** (EPK: medlemmer, sjanger, historie)

Malen fyller topic-feltet + prompt-konteksten strukturert; resten av
pipelinen (Claude-utkast → segmentgodkjenning → produksjon → publisering)
gjenbrukes urørt.

### Fase 3a — egen musikk per artist (~1–2 timer)
Gjenbruk jingle-mønsteret: produkt-scopet musikkmappe
(`music-<productId>`), opplasting fra produktsiden, valgbar som bakgrunn i
video/radio-editorene. Ren kopi av eksisterende mekanikk.

### Fase 3b — crossfade-medley (~3–5 timer, droplet-arbeid)
Ny lydsammensetting i droplet-rendereren: N valgte låter → klipp per låt +
crossfade + loudness-normalisering → én bed tilpasset videolengden. UI: enkel
«velg 2–5 låter + rekkefølge»-komponent i editoren.
⚠️ Droplet-deploy: rendereren ligger UTENFOR dette repoet — følg
ContentForge-deploy-rutinen for dropleten, og test på en jobb uten kunde
først.

### Fase 4 — PARKERT (bevisst)
- **Kits.AI/stemmebank-oppsalget:** blokkert på Kits-vilkår i skala +
  artist-avtale (papir). Når det bygges: innfør `provider` +
  `provider_voice_id` som søm — IKKE en tredje parallell kopi à la MiniMax.
- **IndigoBoom-katalogintegrasjon** (auto-lastet musikk + slippdato-drevet
  promo): venter på partnerskapsavtale og API-tilgang. Dette er
  hovedargumentet i pitchen — men bygges etter avtale, ikke før.
- **Avregningsmotor** (rabatt/raker beregnes i dag manuelt): trengs først
  når stemme-royalty blir reell.

## Rekkefølge i morgen

1. Farge-jobben fase 1 + 2 + 4 (se egen plan) — så IndigoBoom-tenanten kan
   settes opp komplett fra partner-adminen.
2. Denne planens fase 1 → 2 → 3a. Fase 3b hvis dagen strekker til, ellers
   dag 2.
3. Verifisering: registrer et testband på indigoboom-tenanten, kjør én
   kampanje av hver type gjennom utkast-fasen, én hel produksjon med egen
   musikk som bed.

## Åpne spørsmål til Lars

1. **IndigoBoom brand-materiell:** logo/palett — har du noe, eller lager vi
   midlertidig og bytter ved pitch?
2. **Kampanjetypene:** riktig liste og prioritering? Noen som kan vente?
3. **Demo/øving-typen:** dagens videopipeline er AI-bilde-segmenter — ekte
   øvingsopptak (mobilvideo) som råmateriale er IKKE verifisert støttet.
   Sjekkes i morgen; kan bli «bilder + lyd fra øvinga» i v1.
4. **Medley (3b) i morgen eller dag 2?**
5. **Skal tenanten hete `indigoboom`** (synlig i URL-en
   indigoboom.centerforge.app) — OK før pitchen er tatt, eller nøytralt
   arbeidsnavn?

## Viktige forbehold

- **Migrasjonsdisiplin:** mange tabeller/kolonner i prod mangler
  migrasjonsfiler i repoet. Alt nytt i denne jobben skal ha migrasjonsfil —
  og huskeregelen for Supabase SQL-editoren gjelder (ALDRI lim inn æ/ø/å
  der; ASCII eller service-klient).
- **Sikkerhetsfunn under kartleggingen:** netlify.toml har live-hemmeligheter
  (R2/Resend/TikTok) committet i klartekst. Egen opprydding + rotering — det
  ligger en oppgave-chip klar for dette. Bør tas før eller samtidig med
  morgendagens arbeid.
