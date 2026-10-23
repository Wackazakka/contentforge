'use client'

import { useEffect } from 'react'

// Fjerner en søkestreng som har hengt seg på resultatadressen (/tlid/TL-…?q=…).
// Netlify hekter den opprinnelige søkestrengen på ved omdirigering fra
// /tlid?q=…; skjemaet unngår omdirigeringen, men uten JavaScript, eller via en
// delt lenke, kan den fortsatt komme hit.
//
// 🔑 I NETTLESEREN, IKKE EN NY SERVEROMDIRIGERING. En omdirigering til den
// rene adressen ville fått søkestrengen hektet på igjen — en løkke.
// replaceState endrer bare adresselinja, uten ny forespørsel og uten nytt
// historikk-innslag.
export default function RensAdresse() {
  useEffect(() => {
    if (window.location.search) window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])
  return null
}
