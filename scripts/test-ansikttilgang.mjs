// Hvem får generere med en trent ansiktsmodell (lib/ansiktTilgang.ts)
// Kjør:  node --experimental-strip-types scripts/test-ansikttilgang.mjs
import { kanBrukeAnsikt } from '../lib/ansiktTilgang.ts'

let ok = 0, feil = 0
const sjekk = async (navn, loefte, forventet) => {
  const faktisk = await loefte
  if (faktisk === forventet) ok++; else { feil++; console.log('FEIL:', navn, '\n  fikk     ', faktisk, '\n  forventet', forventet) }
}

const TL = 'twinledger-id', FORELDER = 'forelder-id', ANNEN = 'annen-tenant-id'
const LARS = 'lars-id', KARI = 'kari-id'
const ja = async () => true, nei = async () => false
// Oppslag som ikke skal gjøres: kaster, så testen avslører unødvendige kall.
const aldri = async () => { throw new Error('oppslaget skulle ikke vært gjort') }
const paaTL = (brukerId, erAdmin = nei, viaBank = nei) => ({ tenantId: TL, kjede: [TL, FORELDER], brukerId, erAdmin, viaBank })
const paaRot = (brukerId, erAdmin = nei, viaBank = aldri) => ({ tenantId: 'root', kjede: [], brukerId, erAdmin, viaBank })

// Hullet 25.10: en registrert bruker med en annens id
await sjekk('annen bruker, annens modell, ikke bank', kanBrukeAnsikt({ owner_tenant_id: TL, created_by: LARS }, paaTL(KARI)), false)
await sjekk('på rot: annens modell fra twinledger', kanBrukeAnsikt({ owner_tenant_id: TL, created_by: LARS }, paaRot(KARI)), false)
await sjekk('på rot: eierløs, laget av en annen', kanBrukeAnsikt({ owner_tenant_id: null, created_by: LARS }, paaRot(KARI)), false)
await sjekk('på rot: Lawrence/Mari (eierløs skaper)', kanBrukeAnsikt({ owner_tenant_id: TL, created_by: null }, paaRot(KARI)), false)

// 1. Egen modell
await sjekk('egen modell i egen tenant', kanBrukeAnsikt({ owner_tenant_id: TL, created_by: KARI }, paaTL(KARI, aldri, aldri)), true)
await sjekk('egen modell eid av forelderen', kanBrukeAnsikt({ owner_tenant_id: FORELDER, created_by: KARI }, paaTL(KARI, aldri, aldri)), true)
await sjekk('egen modell, men i en annen tenant', kanBrukeAnsikt({ owner_tenant_id: ANNEN, created_by: KARI }, paaTL(KARI)), false)
await sjekk('egen eierløs modell på rot', kanBrukeAnsikt({ owner_tenant_id: null, created_by: KARI }, paaRot(KARI, aldri)), true)
await sjekk('egen eierløs modell, men ikke på rot', kanBrukeAnsikt({ owner_tenant_id: null, created_by: KARI }, paaTL(KARI)), false)

// 2. Admin
await sjekk('admin, modell i kjeden', kanBrukeAnsikt({ owner_tenant_id: TL, created_by: LARS }, paaTL(KARI, ja, aldri)), true)
await sjekk('admin, modell eid av en annen tenant', kanBrukeAnsikt({ owner_tenant_id: ANNEN, created_by: LARS }, paaTL(KARI, aldri)), false)
await sjekk('admin, eierløs modell', kanBrukeAnsikt({ owner_tenant_id: null, created_by: LARS }, paaTL(KARI, aldri)), false)

// 3. Bankansikt
await sjekk('bankansikt i egen tenant', kanBrukeAnsikt({ owner_tenant_id: TL, created_by: null }, paaTL(KARI, nei, ja)), true)
await sjekk('delt bankansikt fra en annen tenant', kanBrukeAnsikt({ owner_tenant_id: ANNEN, created_by: LARS }, paaTL(KARI, aldri, ja)), true)
await sjekk('ikke bank, ikke admin, ikke egen', kanBrukeAnsikt({ owner_tenant_id: TL, created_by: null }, paaTL(KARI, nei, nei)), false)

// Feil i et oppslag skal stenge, ikke åpne (kallstedet fanger og nekter)
let kastet = false
try { await kanBrukeAnsikt({ owner_tenant_id: TL, created_by: LARS }, paaTL(KARI, nei, aldri)) } catch { kastet = true }
await sjekk('bankoppslaget feiler → kaster (ikke ja)', Promise.resolve(kastet), true)

console.log(`${ok} ok, ${feil} feil`)
if (feil) process.exit(1)
