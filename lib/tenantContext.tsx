'use client'

import { createContext, useContext } from 'react'

// Klient-side tenant-info (speiler AuthProvider-mønsteret).
// Fylles fra server-oppslaget i app/layout.tsx.
export interface TenantInfo {
  id: string
  slug: string
  app_name: string
  logo_url: string | null
  billing_mode: 'direct' | 'invoice'
  price_multiplier: number
  vertical: string | null
  currency?: string | null
  show_language_toggle?: boolean | null
  show_advanced_admin?: boolean | null
}

const DEFAULT: TenantInfo = {
  id: 'root',
  slug: 'centerforge',
  app_name: 'CenterForge',
  logo_url: null,
  billing_mode: 'direct',
  price_multiplier: 1,
  vertical: null,
  currency: 'nok',
  show_language_toggle: true,
  show_advanced_admin: true,
}

const TenantCtx = createContext<TenantInfo>(DEFAULT)

export function TenantProvider({ tenant, children }: { tenant: TenantInfo; children: React.ReactNode }) {
  return <TenantCtx.Provider value={tenant}>{children}</TenantCtx.Provider>
}

export function useTenant(): TenantInfo {
  return useContext(TenantCtx)
}
