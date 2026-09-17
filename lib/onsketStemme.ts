// «Bruk denne stemmen» (Lars 17/9): kunden velger en stemme på Stemmer-siden,
// og den skal stå valgt når neste video opprettes. Veien dit går via Oversikt →
// produkt → «ny video», så valget må overleve et par sidebytter. localStorage,
// med utløp: et valg fra i forgårs skal ikke dukke opp i en video i dag.
//
// Settes KUN på et nytt utkast, i det det fødes. Da finnes ingen lydfiler å
// kaste — å bytte stemme på et eksisterende utkast sletter AI-opptakene
// (se updateVoice i editoren), og det skal aldri skje bak kundens rygg.

const KEY = 'cf.onsketStemme'
const MAKS_ALDER_MS = 24 * 3600_000

export interface OnsketStemme { voiceId: string; name: string }

export function settOnsketStemme(v: OnsketStemme): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...v, at: Date.now() })) } catch { /* privat modus o.l. */ }
}

export function lesOnsketStemme(): OnsketStemme | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as { voiceId?: string; name?: string; at?: number }
    if (!d.voiceId || !d.name || !d.at || Date.now() - d.at > MAKS_ALDER_MS) {
      localStorage.removeItem(KEY)
      return null
    }
    return { voiceId: d.voiceId, name: d.name }
  } catch { return null }
}

export function fjernOnsketStemme(): void {
  try { localStorage.removeItem(KEY) } catch { /* ingenting å fjerne */ }
}
