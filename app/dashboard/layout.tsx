import NavBar from './NavBar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: 'var(--paper)', fontFamily: 'var(--font-hanken), sans-serif', color: 'var(--ink)' }}>
      <div className="cf-grain" aria-hidden="true" />
      <NavBar />
      <main
        style={{
          position: 'relative', zIndex: 2,
          maxWidth: 1080, margin: '0 auto', width: '100%',
          padding: 'clamp(36px,5vw,64px) 26px 80px',
        }}
      >
        {children}
      </main>
    </div>
  )
}
