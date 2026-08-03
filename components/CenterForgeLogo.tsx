'use client'

import { useTenant } from '@/lib/tenantContext'

/**
 * CenterForge "Daylight Studio" brand mark — Logo C ("Smelteåpning" / molten aperture).
 * Two concentric stroked rings + a glowing ember core. Pairs with the Archivo wordmark.
 * White-label: tenants med logo_url får sin egen logo; app_name brukes som wordmark.
 */
export function CenterForgeMark({ size = 30 }: { size?: number }) {
  // Unique gradient id per size so multiple marks on a page don't collide.
  const gid = `cf-mark-${size}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={gid} cx="50%" cy="44%" r="56%">
          <stop stopColor="#FFB76A" />
          <stop offset="0.5" stopColor="#E8632B" />
          <stop offset="1" stopColor="#B8431A" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="12.7" stroke="#A99C86" strokeWidth="1.7" />
      <circle cx="16" cy="16" r="8.7" stroke="#D9967A" strokeWidth="1.2" opacity="0.8" />
      <circle cx="16" cy="16" r="5" fill={`url(#${gid})`} />
      <circle cx="14.3" cy="14.2" r="1.4" fill="#FFF1D8" opacity="0.9" />
    </svg>
  )
}

export function CenterForgeLogo({
  size = 30,
  wordmarkSize = 20,
}: {
  size?: number
  wordmarkSize?: number
}) {
  const tenant = useTenant()

  if (tenant.logo_url) {
    // Tenanten har lastet opp sitt eget merke. Da ER logoen merkevaren, og
    // navnet skal ikke staa en gang til ved siden av (Lars 3/8: «naar det
    // staar Isabel's VideoMaker i logoen trenger vi ikke en tekst som sier
    // det samme»). Baade Isabels og IndigoBooms logoer er lockup med navn.
    // Navnet lever videre i alt-teksten, saa skjermlesere mister ingenting.
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tenant.logo_url}
          alt={tenant.app_name}
          style={{ height: size * 2.4, width: 'auto', maxWidth: '58vw', objectFit: 'contain' }}
        />
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 11 }}>
      <CenterForgeMark size={size} />
      <span
        style={{
          fontFamily: 'var(--font-archivo), sans-serif',
          fontWeight: 800,
          fontSize: wordmarkSize,
          letterSpacing: '-0.02em',
          color: 'var(--ink)',
        }}
      >
        {tenant.app_name}
      </span>
    </span>
  )
}
