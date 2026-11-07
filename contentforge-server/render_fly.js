// Fly.io-dispatch for ekstern render (skalering steg 3, Lars 11/8).
//
// RENDER_MODE=fly: i stedet for aa kjore renderen lokalt, pakker vi jobbens
// input til R2, starter en Fly-maskin som kjorer cf-render-remote (henter fra
// R2, rendrer, laster output opp), og venter paa at output dukker opp i R2.
//
// Dropleten forblir orkestrator; kun det CPU-tunge render-steget flyttes ut.
// Native er alltid fallback (RENDER_MODE=native).
//
// Delt inn saa hver del kan testes for seg: packageToR2 (testbar mot R2 uten
// Fly-token), launchMachine (krever FLY_API_TOKEN), waitForOutput, finalize.

const fs = require('fs')
const { S3Client, PutObjectCommand, HeadObjectCommand, CopyObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')

const BUCKET = process.env.R2_BUCKET_NAME || 'contentforge-assets'
const PREFIX = 'render-jobs'

function r2() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

// Alle absolutte /root-stier i config, i rekkefolge, uten dubletter.
// Speiler abs_paths() i render_remote.py — MAA holdes i sync.
function absPaths(cfg) {
  const out = []
  const seen = new Set()
  const walk = (v) => {
    if (typeof v === 'string' && v.startsWith('/root/') && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    } else if (Array.isArray(v)) {
      v.forEach(walk)
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk)
    }
  }
  walk(cfg)
  return out
}

function jobIdFrom(cfg) {
  // .../contentforge-output/<jobId>/output.mp4
  const parts = cfg.output.split('/')
  return parts[parts.length - 2]
}

// R2-nokkel = render-jobs/<jobId>/ + absolutt sti uten ledende «/».
// Path-treet rekonstrueres bit-likt i containeren → make_tiktok uendret.
function keyFor(jobId, absPath) {
  return `${PREFIX}/${jobId}/${absPath.replace(/^\/+/, '')}`
}

// Pakk config + alle input-filer til R2. Returnerer jobId.
async function packageToR2(configPath) {
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const jobId = jobIdFrom(cfg)
  const s3 = r2()
  const output = cfg.output

  // Inputer som mangler lokalt null-es UT av configen maskinen faar.
  // render_remote.py laster ned HVER /root-sti den finner, og en manglende
  // fil gir exit 1 etter 4 sek (Astrid 3/11: standardlaaten laa paa feil
  // sti). Med null rendrer make_tiktok uten — samme oppfoersel som native.
  const mangler = new Set(absPaths(cfg).filter((p) => p !== output && !fs.existsSync(p)))
  for (const p of mangler) console.warn(`[render-fly] input mangler lokalt, fjernes fra config: ${p}`)
  const utenManglende = (v) => {
    if (typeof v === 'string') return mangler.has(v) ? null : v
    if (Array.isArray(v)) return v.map(utenManglende)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, utenManglende(x)]))
    return v
  }

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: `${PREFIX}/${jobId}/config.json`,
    Body: mangler.size ? JSON.stringify(utenManglende(cfg), null, 2) : fs.readFileSync(configPath),
    ContentType: 'application/json',
  }))

  let n = 1
  for (const p of absPaths(cfg)) {
    if (p === output || mangler.has(p)) continue // output SKRIVES av renderen
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: keyFor(jobId, p),
      Body: fs.readFileSync(p),
    }))
    n++
  }
  console.log(`[render-fly] pakket jobb ${jobId}: ${n} filer -> r2://${BUCKET}/${PREFIX}/${jobId}/`)
  return { jobId, cfg }
}

// Start en Fly-maskin som kjorer cf-render-remote med jobId. Maskinen henter
// input fra R2, rendrer, laster output opp, og SELVdestruerer (auto_destroy +
// restart:no) — vi betaler kun for de ~7 minuttene den lever.
//
// R2-noklene settes som Fly-SECRETS paa appen EN gang (fly secrets set …), ikke
// i denne bodyen — da ligger de ikke i hver request og injiseres som env i
// containeren. jobId foyes til imagets entrypoint via init.cmd:
//   ENTRYPOINT ["python3","/app/render_remote.py","run"]  +  cmd:[jobId]
//   → python3 /app/render_remote.py run <jobId>
async function launchMachine(jobId) {
  const token = process.env.FLY_API_TOKEN
  const app = process.env.FLY_APP_NAME || 'cf-render'
  const image = process.env.RENDER_IMAGE || 'ghcr.io/wackazakka/cf-render-remote:latest'
  const region = process.env.FLY_REGION || 'ams'
  if (!token) throw new Error('FLY_API_TOKEN mangler — kan ikke starte Fly-maskin')

  // Nettfeil og 5xx/429 proeves igjen (Astrid 3/11: ett «fetch failed» mot
  // api.machines.dev veltet hele filmen). 4xx er feil i selve forespoerselen.
  const ventetider = [5000, 15000]
  for (let forsok = 0; ; forsok++) {
    try {
      return await opprettMaskin(jobId, { token, app, image, region })
    } catch (e) {
      if (e.ikkeProvIgjen || forsok >= ventetider.length) throw e
      console.warn(`[render-fly] start av maskin feilet for ${jobId} (${e.message}) — proever igjen om ${ventetider[forsok] / 1000} s`)
      await new Promise((r) => setTimeout(r, ventetider[forsok]))
    }
  }
}

async function opprettMaskin(jobId, { token, app, image, region }) {
  const res = await fetch(`https://api.machines.dev/v1/apps/${app}/machines`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      region,
      config: {
        image,
        auto_destroy: true,
        restart: { policy: 'no' },
        // performance (dedikert, IKKE strupet) — shared-cpu grindet encode-
        // steget saa sakte at det saa hengt ut. performance gir ~dropletens
        // fart (~7 min). Dyrere per sekund, men fortsatt faa oere/render.
        // 8 GB (Lars 7/11): Lises film (2,5 min, seks KI-klipp) ble drept av
        // minnet (oom_killed) etter 26 min paa 4 GB. Ekstra-RAM-en koster
        // ~1 oere per render.
        guest: { cpu_kind: 'performance', cpus: 2, memory_mb: Number(process.env.RENDER_FLY_MEM_MB || 8192) },
        init: { cmd: [jobId] },
        // R2-noklene sendes med fra job-queues eget miljo — sparer et eget
        // «fly secrets set»-steg. Maskinen er kortlivd og config er kun synlig
        // for app-eier. Kan hardnes til ekte Fly-secrets senere.
        env: {
          R2_ENDPOINT: process.env.R2_ENDPOINT || '',
          R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
          R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
          R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || 'contentforge-assets',
        },
      },
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    const err = new Error(`Fly create machine feilet (${res.status}): ${txt.slice(0, 200)}`)
    err.ikkeProvIgjen = res.status < 500 && res.status !== 429
    throw err
  }
  const m = await res.json()
  console.log(`[render-fly] maskin startet for ${jobId}: ${m.id} (${region})`)
  return m.id
}

// Maskinens tilstand + exit-kode, eller null hvis Fly ikke svarer (da
// fortsetter vi bare aa vente — tilstandssjekken er en snarvei, ikke fasit).
async function maskinStatus(machineId) {
  const app = process.env.FLY_APP_NAME || 'cf-render'
  try {
    const res = await fetch(`https://api.machines.dev/v1/apps/${app}/machines/${machineId}`, {
      headers: { Authorization: `Bearer ${process.env.FLY_API_TOKEN}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const m = await res.json()
    const exit = (m.events || []).find((e) => e.type === 'exit')
    return { state: m.state, exitCode: exit?.request?.exit_event?.exit_code ?? null, oom: exit?.request?.exit_event?.oom_killed === true }
  } catch (_) {
    return null
  }
}

// Vent til containeren har lastet output opp til R2 (den skriver til samme
// render-jobs-nokkel som input). Tak i minutter; poller hvert 10. sek.
// Med machineId sjekkes maskinen hvert 30. sek: er den stoppet uten output,
// gir vi opp MED EN GANG i stedet for aa vente ut taket (Astrid 3/11: maskinen
// doede etter 4 sek, dropleten ventet 30 min).
async function waitForOutput(jobId, cfg, takMin = 30, machineId = null) {
  const s3 = r2()
  const key = keyFor(jobId, cfg.output)
  const finnes = () => s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })).then(() => true, () => false)
  const deadline = Date.now() + takMin * 60 * 1000
  for (let runde = 1; Date.now() < deadline; runde++) {
    if (await finnes()) return key
    if (machineId && runde % 3 === 0) {
      const st = await maskinStatus(machineId)
      if (st && ['stopped', 'destroying', 'destroyed', 'failed'].includes(st.state)) {
        // Opplastingen kan ha landet rett foer maskinen avsluttet
        if (await finnes()) return key
        throw new Error(`Fly-maskinen ${machineId} stoppet (${st.state}, exit ${st.exitCode ?? '?'}${st.oom ? ', TOM FOR MINNE' : ''}) uten output for ${jobId}`)
      }
    }
    await new Promise((r) => setTimeout(r, 10000))
  }
  throw new Error(`Fly-render for ${jobId} ga ikke output innen ${takMin} min`)
}

// Flytt output fra render-jobs-nokkelen til den endelige videos/<jobId>/-plassen
// der appen leser den. Returnerer den offentlige URL-en.
async function finalize(jobId, cfg) {
  const s3 = r2()
  const src = keyFor(jobId, cfg.output)
  const dst = `videos/${jobId}/output.mp4`
  await s3.send(new CopyObjectCommand({
    Bucket: BUCKET,
    CopySource: `/${BUCKET}/${src}`,
    Key: dst,
    ContentType: 'video/mp4',
  }))
  return `${process.env.R2_PUBLIC_URL}/${dst}`
}

// Last den ferdige videoen ned fra R2 til den lokale output-stien. Da tar den
// EKSISTERENDE polleren i job-queue over (opplasting til videos/ + webhook),
// akkurat som for native — vi rorer ikke den kritiske fullforingskoden.
// De ~11 MB er trivielt; optimalisering (finalize direkte, hopp over
// re-opplasting) kan komme senere.
async function downloadOutput(jobId, cfg, localPath) {
  const s3 = r2()
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: keyFor(jobId, cfg.output) }))
  const chunks = []
  for await (const c of res.Body) chunks.push(c)
  fs.writeFileSync(localPath, Buffer.concat(chunks))
}

module.exports = { packageToR2, launchMachine, waitForOutput, finalize, downloadOutput, absPaths, keyFor, jobIdFrom }
