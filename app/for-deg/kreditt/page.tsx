import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTenant } from '@/lib/tenantServer'
import KredittClient from './KredittClient'

export const metadata: Metadata = {
  title: 'Kjøp kreditt',
  robots: { index: false, follow: false },
}

export default async function KredittPage() {
  const tenant = await getTenant()
  if (tenant.id !== 'root' && tenant.slug !== 'voicebank') notFound()
  return <KredittClient />
}
