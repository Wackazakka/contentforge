import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTenant } from '@/lib/tenantServer'
import { OccasionChip, StepCard, PriceRow, Cta, CtaGhost } from './ui'
import { HeroPhone, Gallery } from './media'

// «TYPISK FORBRUK»-radene — MÅ VERIFISERES FØR LANSERING mot ekte taxameter
// (bygg representativ 30-s invitasjon / 15-s kunngjøring / 40-s lydhilsen på
// VoiceBank-tenanten). «ca. 100 kr for 30 sek» er bekreftet av Lars; resten er
// modellberegnede anslag.
const PRICE_ROWS = [
  { label: 'Invitasjon, 30 sek', amount: 'ca. 100 kr' },
  { label: 'Kunngjøring, 15 sek', amount: 'ca. 55 kr' },
  { label: 'Lydhilsen, 40 sek', amount: 'ca. 15 kr' },
]

export default async function ForDegPage() {
  const tenant = await getTenant()
  // VoiceBank-markedsside: blokker ANDRE white-label-domener; rot slipper
  // gjennom (lokal dev og Netlify-previews mangler tenant-oppslag og faller til rot)
  if (tenant.id !== 'root' && tenant.slug !== 'voicebank') notFound()

  return (
    <div>
      {/* 1. Header */}
      <header className="fd-header">
        <span className="fd-logo-box">
          {tenant.icon_url ? <img src={tenant.icon_url} alt="" /> : 'V'}
        </span>
        <span className="fd-wordmark">VoiceBank</span>
        <span className="fd-header-pill">FOR PRIVAT OG FORENING</span>
        <nav className="fd-nav">
          <a href="#eksempler">Eksempler</a>
          <a href="#slik">Slik gjør du det</a>
          <a href="#pris">Pris</a>
          <Link href="/for-deg/kreditt" className="fd-nav-cta">Kjøp kreditt →</Link>
        </nav>
      </header>

      {/* 2. Hero */}
      <section className="fd-hero">
        <div className="fd-hero-left">
          <h1 className="fd-h1">Det ser ut som noen har laget det for deg.</h1>
          <p className="fd-ingress">
            Fordi noen gjorde det. Du skrev bare hva det gjelder — bursdagen, dugnaden,
            årsmøtet — og fikk en ferdig video med stemme, bilder og musikk. Ingen
            designerfaring, ingen programmer å laste ned.
          </p>
          <div className="fd-chips">
            <OccasionChip label="Bursdag og jubileum" accent="sand" />
            <OccasionChip label="Dugnad og loppemarked" accent="green" />
            <OccasionChip label="Kunngjøring til medlemmer" accent="rose" />
            <OccasionChip label="Innkalling til årsmøte" accent="lilac" />
            <OccasionChip label="Kampoppsett og treningsstart" accent="sand" />
            <OccasionChip label="Hilsen til én person" accent="green" />
          </div>
          <div className="fd-cta-row">
            <Cta href="/for-deg/kreditt">Kjøp kreditt og kom i gang →</Cta>
            <CtaGhost href="#eksempler">Se hva andre har laget</CtaGhost>
          </div>
          <p className="fd-hero-note">
            En 30-sekunders video koster rundt hundre kroner. Ingen abonnement.
          </p>
        </div>
        <HeroPhone />
      </section>

      {/* 3. Eksempelgalleri */}
      <section id="eksempler" className="fd-section">
        <div className="fd-section-head">
          <h2 className="fd-h2">Laget av folk som ikke driver med sånt</h2>
          <p className="fd-section-side">
            Et korps, en gjeng naboer, en tante med en tale. Alle laget på under ti minutter.
          </p>
        </div>
        <Gallery />
      </section>

      {/* 4. Slik gjør du det */}
      <section id="slik" className="fd-section" style={{ paddingBottom: 72, gap: 40 }}>
        <h2 className="fd-h2">Slik gjør du det</h2>
        <div className="fd-steps">
          <StepCard n={1} title="Skriv hva det gjelder" accent="sand">
            To setninger holder. «Basar i menighetshuset søndag kl 14, alle er velkomne.»
            Du trenger ikke skrive manus.
          </StepCard>
          <StepCard n={2} title="Se gjennom og godkjenn" accent="green">
            Du får forslag til tekst, bilder og stemme — bit for bit. Bytt det du vil,
            godkjenn resten. Prisen står hele tiden synlig.
          </StepCard>
          <StepCard n={3} title="Last ned eller legg ut" accent="lilac">
            Ferdig video i det formatet du trenger — eller legg den ut på Facebook og
            Instagram direkte fra siden.
          </StepCard>
        </div>
      </section>

      {/* 5. Pris og CTA */}
      <section id="pris" className="fd-price-outer">
        <div className="fd-price-panel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <h2 className="fd-price-h2">Rundt hundre kroner for en video på 30 sekunder</h2>
            <p className="fd-price-body">
              Du kjøper kreditt med kort, og bruker av den når du lager noe. Ingen
              månedsavgift, ingen binding — kreditten står der til neste gang korpset
              trenger noe.
            </p>
            <div className="fd-price-cta-row">
              <Cta href="/for-deg/kreditt" tone="mustard">Kjøp kreditt og kom i gang →</Cta>
              <span className="fd-price-fine">Kort. Ingen abonnement.</span>
            </div>
          </div>
          <div className="fd-price-list">
            <span className="fd-price-label">TYPISK FORBRUK</span>
            {PRICE_ROWS.map((r) => (
              <PriceRow key={r.label} label={r.label} amount={r.amount} />
            ))}
            <PriceRow label="Minste kredittkjøp" amount="200 kr" highlight divider={false} />
          </div>
        </div>
      </section>

      {/* 6. Footer */}
      <footer className="fd-footer">
        <span>VoiceBank © {new Date().getFullYear()} · Innhold, stemmer og rettigheter — én plattform</span>
        <span className="fd-footer-links">
          <Link href="/privacy">Personvern</Link>
          <Link href="/terms">Vilkår</Link>
          <Link href="/">For bedrifter og byråer</Link>
        </span>
        <span className="fd-ai-line">Innholdet lages med KI-verktøy ut fra teksten du skriver — du ser og godkjenner alt før det er ferdig.</span>
      </footer>
    </div>
  )
}
