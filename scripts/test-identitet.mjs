// Publiseringssperren og byrålenken (lib/identitet.ts)
// Kjør:  node --experimental-strip-types scripts/test-identitet.mjs
import { kanPubliseres, lesBekreftelse, erGyldigNoekkel, byraaLenke, kanBekreftesIMoete } from '../lib/identitet.ts'

let ok = 0, feil = 0
const sjekk = (navn, faktisk, forventet) => {
  const likt = JSON.stringify(faktisk) === JSON.stringify(forventet)
  if (likt) ok++; else { feil++; console.log('FEIL:', navn, '\n  fikk     ', JSON.stringify(faktisk), '\n  forventet', JSON.stringify(forventet)) }
}

// Sperren: bare den selverklærte stoppes
sjekk('selverklært stoppes', kanPubliseres('self_declared'), false)
sjekk('byrå slipper gjennom', kanPubliseres('vouched'), true)
sjekk('BankID slipper gjennom', kanPubliseres('bankid'), true)
sjekk('lagt inn av admin før 101 (null) stoppes ikke', kanPubliseres(null), true)
sjekk('ukjent felt (undefined) stoppes ikke', kanPubliseres(undefined), true)
sjekk('bekreftet i møte slipper gjennom (125)', kanPubliseres('in_person'), true)

// Bekreftet i møte (125): kan løfte alt unntatt seg selv
sjekk('selverklært kan bekreftes i møte', kanBekreftesIMoete('self_declared'), true)
sjekk('byrå kan løftes til møte', kanBekreftesIMoete('vouched'), true)
sjekk('BankID kan løftes til møte', kanBekreftesIMoete('bankid'), true)
sjekk('lagt inn før 101 kan bekreftes i møte', kanBekreftesIMoete(null), true)
sjekk('alt bekreftet i møte kan ikke bekreftes igjen', kanBekreftesIMoete('in_person'), false)
sjekk('møte', lesBekreftelse('meeting:lars@norditech.io'), { av: 'moete', epost: 'lars@norditech.io' })
sjekk('meeting: uten e-post er ingenting', lesBekreftelse('meeting:'), { av: null })

// Hvem bekreftet
sjekk('byrå', lesBekreftelse('agent:3f2a'), { av: 'byraa', agentId: '3f2a' })
sjekk('admin', lesBekreftelse('admin:lars@norditech.io'), { av: 'admin', epost: 'lars@norditech.io' })
sjekk('bankid', lesBekreftelse('bankid'), { av: 'bankid' })
sjekk('tom', lesBekreftelse(null), { av: null })
sjekk('agent: uten id er ingenting', lesBekreftelse('agent:'), { av: null })
sjekk('ukjent format', lesBekreftelse('noe annet'), { av: null })

// Nøkkelen i lenken
sjekk('24 tegn base64url er gyldig', erGyldigNoekkel('Ab3_-x9ZQ2lmN0pRsT4uVw8y'), true)
sjekk('for kort', erGyldigNoekkel('abc'), false)
sjekk('ulovlige tegn', erGyldigNoekkel('Ab3_-x9ZQ2lmN0pRsT4u/w8y'), false)
sjekk('ikke en streng', erGyldigNoekkel(12345), false)
sjekk('tom', erGyldigNoekkel(''), false)

// Lenken
sjekk('lenke', byraaLenke('https://twinledger.ai', 'Ab3_-x9ZQ2lmN0pRsT4uVw8y'), 'https://twinledger.ai/bli-stemme?byraa=Ab3_-x9ZQ2lmN0pRsT4uVw8y')
sjekk('lenke uten dobbel skråstrek', byraaLenke('https://twinledger.ai/', 'Ab3_-x9ZQ2lmN0pRsT4uVw8y'), 'https://twinledger.ai/bli-stemme?byraa=Ab3_-x9ZQ2lmN0pRsT4uVw8y')

console.log(`${ok} ok, ${feil} feil`)
process.exit(feil ? 1 : 0)
