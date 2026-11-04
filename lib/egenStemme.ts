// Vakt mot hel låt lastet opp som egen stemme (Lars 4/11). Iselin la låten
// sin (3 min) som stemme på én scene: den ble spilt to ganger oppå hverandre,
// scenen sto i 3 min og renderingen gikk over tiden. En stemme til én scene
// er noen sekunder — er fila lang, spør vi før den lastes opp.

const GRENSE_SEK = 45

function lydLengde(fil: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(fil)
    const a = new Audio()
    const ferdig = (v: number | null) => { URL.revokeObjectURL(url); resolve(v) }
    a.preload = 'metadata'
    a.onloadedmetadata = () => ferdig(Number.isFinite(a.duration) ? a.duration : null)
    a.onerror = () => ferdig(null)
    setTimeout(() => ferdig(null), 8000)
    a.src = url
  })
}

// true = last opp som stemme, false = avbryt.
export async function godtaEgenStemme(fil: Blob, musikkSek: number | null, musikkOrd: string): Promise<boolean> {
  const sek = await lydLengde(fil)
  if (sek === null || sek <= GRENSE_SEK) return true
  const lengde = `${Math.floor(sek / 60)} min ${Math.round(sek % 60)} sek`
  const somLaaten = musikkSek !== null && Math.abs(musikkSek - sek) < 3
  return window.confirm(
    `Denne lydfila er ${lengde}${somLaaten ? ', like lang som låten du har valgt' : ''}. Det ser ut som en hel låt.\n\n` +
    `Her legger du inn stemme til én scene, vanligvis noen sekunder. Låten skal ligge under «${musikkOrd}». ` +
    `Ligger den her også, spilles den to ganger oppå hverandre, og scenen blir like lang som fila.\n\n` +
    `Trykk OK for å bruke fila som stemme likevel, eller Avbryt for å la være.`,
  )
}
