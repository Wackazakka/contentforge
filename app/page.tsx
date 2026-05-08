'use client'

import Link from 'next/link'

function HexagonIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polygon
        points="12,2.5 20.8,7.75 20.8,16.25 12,21.5 3.2,16.25 3.2,7.75"
        stroke="#378ADD"
        strokeWidth="1.75"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-cf-bg">

      {/* Nav */}
      <nav className="border-b bg-white px-6 py-4 flex items-center justify-between" style={{ borderColor: '#e5e2d9' }}>
        <div className="flex items-center gap-2">
          <HexagonIcon />
          <span className="text-xl font-bold tracking-tight" style={{ color: '#0C447C' }}>
            Center<span style={{ color: '#378ADD' }}>Forge</span>
          </span>
        </div>
        <Link href="/login" className="text-sm font-medium transition-colors" style={{ color: '#185FA5' }}>
          Logg inn →
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 text-center py-16 sm:py-24">
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm mb-8"
          style={{ backgroundColor: '#EBF4FF', border: '1px solid #378ADD', color: '#185FA5' }}
        >
          MVP — Beta
        </div>

        <h1
          className="text-3xl sm:text-5xl font-extrabold tracking-tight max-w-2xl leading-tight mb-6"
          style={{ color: '#0C447C' }}
        >
          Profesjonelt annonsemateriell på{' '}
          <span style={{ color: '#185FA5' }}>sekunder</span>
        </h1>

        <p className="text-base sm:text-lg max-w-xl mb-10" style={{ color: '#6b7280' }}>
          Gi en brief — få ferdige videoannonser og artikler i alle social
          media-formater. Ingen designkompetanse nødvendig.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <Link
            href="/login"
            className="rounded-full text-white font-semibold px-8 py-3 text-base transition-colors"
            style={{ backgroundColor: '#185FA5' }}
            onMouseEnter={(e: any) => (e.currentTarget.style.backgroundColor = '#0C447C')}
            onMouseLeave={(e: any) => (e.currentTarget.style.backgroundColor = '#185FA5')}
          >
            Kom i gang
          </Link>
          <a
            href="#features"
            className="rounded-full border font-medium px-8 py-3 text-base transition-colors"
            style={{ borderColor: '#d1cec7', color: '#2C2C2A' }}
          >
            Se funksjoner
          </a>
        </div>

        <p className="mt-12 text-xs uppercase tracking-widest" style={{ color: '#9ca3af' }}>
          Tjenester som bruker CenterForge
        </p>
        <div className="mt-4 flex gap-6 items-center font-semibold text-sm" style={{ color: '#6b7280' }}>
          <span>Reforhandle</span>
          <span style={{ color: '#d1cec7' }}>·</span>
          <span>SinglePicker</span>
        </div>
      </main>

      {/* Features */}
      <section id="features" className="border-t py-16 sm:py-20 px-4 sm:px-6 bg-white" style={{ borderColor: '#e5e2d9' }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12" style={{ color: '#2C2C2A' }}>
            Alt du trenger for innholdsproduksjon
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                icon: '🎬',
                title: 'Video-annonser',
                desc: 'DALL-E 3 bilder + ffmpeg Ken Burns animasjoner. Produserer 16:9, 9:16 og 1:1.',
              },
              {
                icon: '📝',
                title: 'Artikler & copy',
                desc: 'AI-generert tekst tilpasset tone og målgruppe. Klar til publisering.',
              },
              {
                icon: '✅',
                title: 'Godkjenningsflyt',
                desc: 'Innebygd Paperclip-workflow. Gjennomgå og godkjenn innhold før publisering.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl p-6 shadow-sm"
                style={{ border: '1px solid #e5e2d9', backgroundColor: '#F1EFE8' }}
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-semibold mb-2" style={{ color: '#2C2C2A' }}>{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#6b7280' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6 px-6 text-center text-xs bg-white" style={{ borderColor: '#e5e2d9', color: '#9ca3af' }}>
        CenterForge © {new Date().getFullYear()} — Wackazakka
      </footer>
    </div>
  )
}
