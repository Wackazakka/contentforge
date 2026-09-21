import { getTenant } from '@/lib/tenantServer'
import NavBar from './NavBar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // ⚠️ MENYEN ER EN SIDEKOLONNE BARE PÅ TWINLEDGER (Claude Design 7). De andre
  // tenantene har topplinje, og da skal innholdet ikke rykke inn. Flagget må
  // avgjøres her OG i NavBar: den ene tegner menyen, den andre lager plass.
  const tenant = await getTenant()
  const sidemeny = tenant.slug === 'twinledger'
  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: 'var(--paper)', fontFamily: 'var(--font-hanken), sans-serif', color: 'var(--ink)' }}>
      <div className="cf-grain" aria-hidden="true" />
      <NavBar />
      <main
        className={sidemeny ? 'cf-with-sidenav' : undefined}
        style={{
          position: 'relative', zIndex: 2, width: '100%',
          ...(sidemeny
            ? { marginLeft: 236, maxWidth: 1180, padding: 'clamp(28px,4vw,48px) clamp(20px,3vw,40px) 80px' }
            : { maxWidth: 1080, margin: '0 auto', padding: 'clamp(36px,5vw,64px) 26px 80px' }),
        }}
      >
        {children}
      </main>
    </div>
  )
}
