// Små input-hjelpere for skjemafelter (første i kodebasen — gjenbruk her
// fremfor å inline regexer i komponenter).

// Normaliser nettside-input: trim, prepend https:// hvis skjema mangler.
// Tom input → null. Kaster ikke — åpenbart ugyldig (mellomrom) → null.
export function normalizeUrl(input: string | null | undefined): string | null {
  const s = (input || '').trim()
  if (!s) return null
  if (/\s/.test(s)) return null
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

// Romslig telefonvalidering (norsk-vennlig): valgfritt +, deretter 8–15 sifre,
// mellomrom tillatt. Tom input → null; ugyldig → null.
export function normalizePhone(input: string | null | undefined): string | null {
  const s = (input || '').trim()
  if (!s) return null
  const digits = s.replace(/[\s]/g, '')
  return /^\+?\d{8,15}$/.test(digits) ? s : null
}
