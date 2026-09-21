'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Opptakeren for proffklone-løypa.
//
// 🔑 MÅLER MENS HUN LESER, IKKE ETTERPÅ. Et opptak som viser seg å være for
// lavt eller fullt av romklang etter tjue minutters lesing, er tjue minutter
// kastet bort — og andre gangen kommer hun ikke tilbake. Nivå, toppunkt og
// støygulv står på skjermen hele tiden, og hun får beskjed før hun begynner
// på neste tekst.
//
// 🔑 SAMME MIKROFON HELE VEIEN. ElevenLabs' veiledning er tydelig: variert
// LEVERING er bra, varierte mikrofoner er ikke. Derfor låses enheten ved
// første opptak, og bytter hun senere, sier vi fra. Det er den ene feilen som
// ikke kan rettes opp i etterkant uten å ta alt på nytt.
//
// Kravene (ElevenLabs): −23 til −18 dB RMS, toppunkt under −3 dB.

const RMS_MIN = -23
const RMS_MAX = -18
const PEAK_MAKS = -3
/** Over dette i pausene er rommet for støyende til en proffklone. */
const STOEYGULV_MAKS = -50

export interface OpptakResultat {
  blob: Blob
  sekunder: number
  rmsDb: number
  peakDb: number
  stoeygulvDb: number
  deviceId: string | null
}

const db = (v: number) => (v <= 0 ? -100 : Math.max(-100, 20 * Math.log10(v)))

export default function Opptaker({ onFerdig, laastDeviceId, disabled }: {
  onFerdig: (r: OpptakResultat) => void
  /** Enheten tidligere opptak ble gjort med. Bytte varsles. */
  laastDeviceId?: string | null
  disabled?: boolean
}) {
  const [tar, setTar] = useState(false)
  const [sek, setSek] = useState(0)
  const [rms, setRms] = useState(-100)
  const [peak, setPeak] = useState(-100)
  const [feil, setFeil] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const bitene = useRef<Blob[]>([])
  // Målingene samles gjennom hele opptaket, ikke bare siste bilde: et
  // øyeblikksbilde sier ingenting om hvordan opptaket som helhet ble.
  const rmsSum = useRef(0)
  const rmsAntall = useRef(0)
  const peakMaks = useRef(0)
  // Stillepartiene forteller hvor støyende rommet er. Vi tar den 10. persentilen
  // av rammene — altså hvor lavt det blir når hun IKKE snakker.
  const rammer = useRef<number[]>([])

  const rydd = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    ctxRef.current?.close().catch(() => {})
    rafRef.current = null; streamRef.current = null; ctxRef.current = null
  }, [])

  useEffect(() => rydd, [rydd])

  const start = async () => {
    setFeil(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // ⚠️ AV, ALLE TRE. Nettleserens støydemping og automatiske
          // nivåjustering er laget for tale i møter, ikke for opptak som skal
          // trene en modell. De pumper nivået opp og ned og spiser konsonanter
          // — og klonen arver det.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      })
      streamRef.current = stream
      const enhet = stream.getAudioTracks()[0]?.getSettings().deviceId ?? null
      setDeviceId(enhet)

      const ctx = new AudioContext()
      ctxRef.current = ctx
      const kilde = ctx.createMediaStreamSource(stream)
      const analyse = ctx.createAnalyser()
      analyse.fftSize = 2048
      kilde.connect(analyse)
      const buf = new Float32Array(analyse.fftSize)

      rmsSum.current = 0; rmsAntall.current = 0; peakMaks.current = 0; rammer.current = []
      const tikk = () => {
        analyse.getFloatTimeDomainData(buf)
        let sum = 0, topp = 0
        for (let i = 0; i < buf.length; i++) {
          sum += buf[i] * buf[i]
          const a = Math.abs(buf[i])
          if (a > topp) topp = a
        }
        const r = Math.sqrt(sum / buf.length)
        rmsSum.current += r; rmsAntall.current++
        if (topp > peakMaks.current) peakMaks.current = topp
        rammer.current.push(r)
        setRms(db(r)); setPeak(db(topp))
        rafRef.current = requestAnimationFrame(tikk)
      }
      tikk()

      const rec = new MediaRecorder(stream, { mimeType: velgFormat() })
      mediaRef.current = rec
      bitene.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) bitene.current.push(e.data) }
      const startet = Date.now()
      rec.onstop = () => {
        const sorterte = [...rammer.current].sort((a, b) => a - b)
        const stoey = sorterte.length > 0 ? sorterte[Math.floor(sorterte.length * 0.1)] : 0
        onFerdig({
          blob: new Blob(bitene.current, { type: rec.mimeType }),
          sekunder: Math.round((Date.now() - startet) / 1000),
          rmsDb: Math.round(db(rmsAntall.current ? rmsSum.current / rmsAntall.current : 0) * 10) / 10,
          peakDb: Math.round(db(peakMaks.current) * 10) / 10,
          stoeygulvDb: Math.round(db(stoey) * 10) / 10,
          deviceId: enhet,
        })
        rydd()
      }
      rec.start(250)
      setTar(true); setSek(0)
      const iv = setInterval(() => setSek((s) => s + 1), 1000)
      rec.addEventListener('stop', () => clearInterval(iv), { once: true })
    } catch (e: any) {
      setFeil(e?.name === 'NotAllowedError'
        ? 'Du må gi nettleseren tilgang til mikrofonen for å ta opp.'
        : `Fikk ikke tilgang til mikrofonen (${e?.message || 'ukjent feil'}).`)
      rydd()
    }
  }

  const stopp = () => { mediaRef.current?.stop(); setTar(false) }

  const byttetMikrofon = !!(laastDeviceId && deviceId && laastDeviceId !== deviceId)
  const forLavt = tar && rms > -100 && rms < RMS_MIN
  const forHoyt = tar && (rms > RMS_MAX || peak > PEAK_MAKS)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={tar ? stopp : start} disabled={disabled}
          style={{
            padding: '14px 28px', fontWeight: 700, fontSize: 16, cursor: disabled ? 'default' : 'pointer',
            border: tar ? '1.5px solid var(--ink)' : 'none',
            background: tar ? 'transparent' : 'var(--ember-deep)',
            color: tar ? 'var(--ink)' : 'var(--on-ember)',
            opacity: disabled ? 0.4 : 1,
          }}>
          {tar ? 'Stopp opptaket' : 'Start opptak'}
        </button>
        <span style={{ fontFamily: 'var(--font-cfmono), monospace', fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>
          {String(Math.floor(sek / 60)).padStart(2, '0')}:{String(sek % 60).padStart(2, '0')}
        </span>
      </div>

      {/* Nivåmåleren. Det grønne feltet er kravet, ikke en anbefaling. */}
      <Maaler rms={rms} peak={peak} aktiv={tar} />

      <div style={{ minHeight: 44, marginTop: 10 }}>
        {feil && <Beskjed type="feil">{feil}</Beskjed>}
        {byttetMikrofon && (
          <Beskjed type="feil">
            Dette er en annen mikrofon enn de forrige opptakene. Varierte mikrofoner
            ødelegger klonen — bytt tilbake, eller ta hele løpet på nytt med denne.
          </Beskjed>
        )}
        {forLavt && <Beskjed type="raad">For lavt. Gå nærmere mikrofonen, eller skru opp inngangsnivået.</Beskjed>}
        {forHoyt && <Beskjed type="raad">For høyt — det vil klippe. Gå litt lenger unna, eller skru ned.</Beskjed>}
      </div>
    </div>
  )
}

function Maaler({ rms, peak, aktiv }: { rms: number; peak: number; aktiv: boolean }) {
  const pos = (d: number) => Math.min(100, Math.max(0, ((d + 60) / 60) * 100))
  return (
    <div style={{ position: 'relative', height: 26, background: 'var(--paper-sunken, #EFEBE3)', border: '1px solid var(--ds-border-strong, #D8CDB8)' }}>
      <div style={{
        position: 'absolute', left: `${pos(RMS_MIN)}%`, width: `${pos(RMS_MAX) - pos(RMS_MIN)}%`,
        top: 0, bottom: 0, background: 'rgba(60, 140, 80, 0.22)',
      }} />
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: `${aktiv ? pos(rms) : 0}%`,
        background: 'var(--ink)', opacity: 0.75, transition: 'width 60ms linear',
      }} />
      {aktiv && (
        <div style={{ position: 'absolute', left: `${pos(peak)}%`, top: 0, bottom: 0, width: 2, background: 'var(--ember-deep)' }} />
      )}
      <span style={{
        position: 'absolute', right: 8, top: 4, fontFamily: 'var(--font-cfmono), monospace',
        fontSize: 11, color: 'var(--text-muted, #5E564A)', fontVariantNumeric: 'tabular-nums',
      }}>
        {aktiv ? `${rms.toFixed(0)} dB` : 'klar'}
      </span>
    </div>
  )
}

function Beskjed({ type, children }: { type: 'feil' | 'raad'; children: React.ReactNode }) {
  return (
    <p style={{
      margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.5,
      color: type === 'feil' ? 'var(--ember-deep)' : 'var(--text-muted, #5E564A)',
    }}>
      {children}
    </p>
  )
}

/** Best tilgjengelige format. Safari og Chrome er uenige om hva de støtter. */
function velgFormat(): string {
  const kandidater = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const k of kandidater) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(k)) return k
  }
  return ''
}

export { RMS_MIN, RMS_MAX, PEAK_MAKS, STOEYGULV_MAKS }
