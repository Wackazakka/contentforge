import { NextResponse } from 'next/server'
import { cronVakt } from '@/lib/cronVakt'
import { fullfoerTreninger } from '@/lib/faceTraining'

// Fullfoerer ansiktstreninger som er ferdige hos fal — uavhengig av om noen
// har en side aapen.
//
// 🔑 FOER LAA DETTE BARE I GET /api/characters. Modellen ble flippet til
// «ready», proevebildene laget og godkjenningsmailen sendt FOERST naar
// adminen som eide karakteren aapnet «Medvirkende». Lars trente sin foerste
// modell 22.09 og spurte hvor han kunne se at trening paagikk — og svaret
// var «ingen steder, og den blir ikke ferdig foer du aapner en bestemt side».
// En rettighetshaver som venter paa e-posten sin skal ikke vaere avhengig av
// at en admin husker aa klikke.
//
// Kalles av netlify/functions/cron-face-training.mjs hvert tiende minutt.
// Samme hemmelighet som face-approvals. Idempotent: en rad som alt er
// «ready» eller «failed» roeres ikke, og varselet gaar bare der
// approval_sent_at er tom (se lib/faceTraining).

export async function POST(request: Request) {
  const stopp = cronVakt(request)
  if (stopp) return stopp
  try {
    const resultat = await fullfoerTreninger()
    return NextResponse.json({ ok: true, ...resultat })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
