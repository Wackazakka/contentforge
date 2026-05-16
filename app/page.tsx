'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

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
  const t = useTranslations('home')

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#F1EFE8' }}>

      {/* Nav */}
      <nav className="border-b bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-10" style={{ borderColor: '#e5e2d9' }}>
        <div className="flex items-center gap-2">
          <HexagonIcon />
          <span className="text-xl font-bold tracking-tight" style={{ color: '#0C447C' }}>
            Center<span style={{ color: '#378ADD' }}>Forge</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a href="#pricing" className="text-sm font-medium hidden sm:block" style={{ color: '#6b7280' }}>
            Priser
          </a>
          <Link
            href="/login"
            className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors text-white"
            style={{ backgroundColor: '#185FA5' }}
          >
            {t('loginLink')}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 text-center py-20 sm:py-28 relative overflow-hidden">
        {/* Subtle radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(55,138,221,0.10) 0%, transparent 70%)',
          }}
        />

        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm mb-8 relative z-10"
          style={{ backgroundColor: '#EBF4FF', border: '1px solid #378ADD', color: '#185FA5' }}
        >
          {t('badge')}
        </div>

        <h1
          className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-2xl leading-tight mb-6 relative z-10"
          style={{ color: '#0C447C' }}
        >
          {t('headline')}{' '}
          <span style={{ color: '#185FA5' }}>{t('headlineHighlight')}</span>
        </h1>

        <p className="text-base sm:text-lg max-w-xl mb-10 relative z-10" style={{ color: '#6b7280' }}>
          {t('subtitle')}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-center relative z-10">
          <Link
            href="/login"
            className="rounded-full text-white font-semibold px-8 py-3.5 text-base transition-colors shadow-md"
            style={{ backgroundColor: '#185FA5' }}
            onMouseEnter={(e: any) => (e.currentTarget.style.backgroundColor = '#0C447C')}
            onMouseLeave={(e: any) => (e.currentTarget.style.backgroundColor = '#185FA5')}
          >
            {t('ctaPrimary')}
          </Link>
          <a
            href="#features"
            className="rounded-full border font-medium px-8 py-3.5 text-base transition-colors"
            style={{ borderColor: '#c5c2ba', color: '#2C2C2A' }}
            onMouseEnter={(e: any) => (e.currentTarget.style.borderColor = '#185FA5')}
            onMouseLeave={(e: any) => (e.currentTarget.style.borderColor = '#c5c2ba')}
          >
            {t('ctaSecondary')}
          </a>
        </div>

        {/* Stats row */}
        <div className="mt-14 flex flex-wrap justify-center gap-8 relative z-10">
          {[
            { value: '< 60s', label: 'Video klar' },
            { value: '3 formater', label: 'Per produksjon' },
            { value: '4 plattformer', label: 'Publisering' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-extrabold" style={{ color: '#0C447C' }}>{stat.value}</p>
              <p className="text-xs mt-0.5 uppercase tracking-wider" style={{ color: '#9ca3af' }}>{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 relative z-10">
          <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#9ca3af' }}>
            {t('usedBy')}
          </p>
          <div className="flex gap-6 items-center justify-center font-semibold text-sm" style={{ color: '#6b7280' }}>
            <span>Reforhandle</span>
            <span style={{ color: '#d1cec7' }}>·</span>
            <span>SinglePicker</span>
          </div>
        </div>
      </main>

      {/* Features */}
      <section id="features" className="border-t py-16 sm:py-20 px-4 sm:px-6 bg-white" style={{ borderColor: '#e5e2d9' }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4" style={{ color: '#2C2C2A' }}>
            {t('featuresTitle')}
          </h2>
          <p className="text-center text-sm mb-12" style={{ color: '#9ca3af' }}>
            Alt du trenger — ingen separate verktøy, ingen designkompetanse nødvendig.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                icon: '🎬',
                title: t('feature1Title'),
                desc: t('feature1Desc'),
              },
              {
                icon: '📝',
                title: t('feature2Title'),
                desc: t('feature2Desc'),
              },
              {
                icon: '✅',
                title: t('feature3Title'),
                desc: t('feature3Desc'),
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl p-6 flex flex-col"
                style={{ border: '1px solid #e5e2d9', backgroundColor: '#F8F7F2' }}
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-semibold mb-2" style={{ color: '#2C2C2A' }}>{f.title}</h3>
                <p className="text-sm leading-relaxed flex-1" style={{ color: '#6b7280' }}>{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              href="/login"
              className="inline-block rounded-full text-white font-semibold px-8 py-3 text-sm transition-colors"
              style={{ backgroundColor: '#185FA5' }}
              onMouseEnter={(e: any) => (e.currentTarget.style.backgroundColor = '#0C447C')}
              onMouseLeave={(e: any) => (e.currentTarget.style.backgroundColor = '#185FA5')}
            >
              Prøv gratis →
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t py-16 sm:py-20 px-4 sm:px-6" style={{ borderColor: '#e5e2d9', backgroundColor: '#F1EFE8' }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3" style={{ color: '#2C2C2A' }}>
            Enkle, forutsigbare priser
          </h2>
          <p className="text-center text-sm mb-12" style={{ color: '#9ca3af' }}>
            Betal for det du bruker. Kreditter gir full fleksibilitet.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                name: 'Starter',
                price: '199',
                credits: '50',
                highlight: false,
                features: ['50 kreditter/mnd', '1 produkt', 'Artikkel-generering', 'Facebook-publisering'],
              },
              {
                name: 'Vekst',
                price: '499',
                credits: '150',
                highlight: true,
                features: ['150 kreditter/mnd', 'Ubegrenset produkter', 'Video + artikler', 'Alle plattformer', 'Planlegging'],
              },
              {
                name: 'Pro',
                price: '999',
                credits: '400',
                highlight: false,
                features: ['400 kreditter/mnd', 'Alt i Vekst', 'Prioritert support', 'Egendefinert merkevare'],
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl p-6 flex flex-col relative"
                style={{
                  border: plan.highlight ? '2px solid #185FA5' : '1px solid #e5e2d9',
                  backgroundColor: plan.highlight ? '#fff' : '#F8F7F2',
                  boxShadow: plan.highlight ? '0 4px 24px rgba(24,95,165,0.10)' : 'none',
                }}
              >
                {plan.highlight && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full text-white"
                    style={{ backgroundColor: '#185FA5' }}
                  >
                    Mest populær
                  </div>
                )}
                <h3 className="font-bold text-lg mb-1" style={{ color: '#2C2C2A' }}>{plan.name}</h3>
                <p className="mb-4" style={{ color: '#6b7280' }}>
                  <span className="text-3xl font-extrabold" style={{ color: '#0C447C' }}>kr {plan.price}</span>
                  <span className="text-sm">/mnd</span>
                </p>
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm" style={{ color: '#4b5563' }}>
                      <span style={{ color: '#1D9E75', flexShrink: 0 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className="block text-center rounded-lg py-2.5 font-semibold text-sm transition-colors"
                  style={plan.highlight
                    ? { backgroundColor: '#185FA5', color: '#fff' }
                    : { backgroundColor: '#e5e2d9', color: '#2C2C2A' }
                  }
                >
                  Kom i gang
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-xs mt-8" style={{ color: '#9ca3af' }}>
            Ingen bindingstid. Avbestill når som helst. Kreditter rulles ikke over.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6 px-6 text-center text-xs bg-white" style={{ borderColor: '#e5e2d9', color: '#9ca3af' }}>
        <p>{t('footer', { year: new Date().getFullYear() })}</p>
        <div className="flex justify-center gap-4 mt-2">
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          <Link href="/terms" className="hover:underline">Terms of Service</Link>
        </div>
      </footer>
    </div>
  )
}
