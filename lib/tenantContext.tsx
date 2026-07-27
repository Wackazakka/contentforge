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
}

const DEFAULT: TenantInfo = {
  id: 'root',
  slug: 'centerforge',
  app_name: 'CenterForge',
  logo_url: null,
  billing_mode: 'direct',
}

const TenantCtx = createContext<TenantInfo>(DEFAULT)

export function TenantProvider({ tenant, children }: { tenant: TenantInfo; children: React.ReactNode }) {
  return <TenantCtx.Provider value={tenant}>{children}</TenantCtx.Provider>
}

export function useTenant(): TenantInfo {
  return useContext(TenantCtx)
}
