import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// Åpen white-label-søknad (fra /white-label på alle tenant-domener).
// Lagres med hvilken merkevare søknaden kom via — en søknad på VoiceBanks
// domene er en potensiell VoiceBank-kunde, ikke vår.
export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (body.website) return NextResponse.json({ ok: true }) // honeypot — bots fyller alt

    const company = String(body.company || '').trim()
    const contactName = String(body.contactName || '').trim()
    const email = String(body.email || '').trim()
    if (!company || !contactName || !email.includes('@')) {
      return NextResponse.json({ error: 'Fyll ut firma, kontaktperson og en gyldig e-post.' }, { status: 400 })
    }

    const tenant = await getTenant()
    const { error } = await admin().from('whitelabel_applications').insert({
      applied_via_tenant_id: tenant.id === 'root' ? null : tenant.id,
      applied_via_host: request.headers.get('x-forwarded-host') || request.headers.get('host') || null,
      company,
      contact_name: contactName,
      email,
      phone: body.phone ? String(body.phone).trim() : null,
      message: body.message ? String(body.message).slice(0, 2000) : null,
    })
    if (error) return NextResponse.json({ error: 'Kunne ikke sende søknaden akkurat nå. Prøv igjen senere.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
