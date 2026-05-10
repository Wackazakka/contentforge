import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-12">
          <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Tilbake til startsiden
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Vilkår for bruk</h1>
          <p className="text-gray-600">Sist oppdatert: 10. mai 2026</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-8 space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Aksept av vilkår</h2>
            <p className="text-gray-700 leading-relaxed">
              Ved å bruke CenterForge godtar du disse vilkårene. Tjenesten drives av Wackazakka og er beregnet på bedrifter som ønsker å produsere og publisere AI-generert innhold.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Tjenestebeskrivelse</h2>
            <p className="text-gray-700 leading-relaxed">
              CenterForge er en AI-drevet plattform som lar brukere generere artikler, videoannonser og annet markedsinnhold, og publisere dette til sosiale medier som Facebook, Instagram og TikTok.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Brukerkonto</h2>
            <p className="text-gray-700 leading-relaxed">
              Du er ansvarlig for å holde kontoinformasjonen din sikker. Du må ikke dele tilgangen din med andre. Vi forbeholder oss retten til å avslutte kontoer som misbrukes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Innhold og opphavsrett</h2>
            <p className="text-gray-700 leading-relaxed">
              Innhold du genererer via CenterForge tilhører deg. Du er ansvarlig for at innholdet du publiserer overholder gjeldende lover, plattformregler og tredjeparts rettigheter.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Sosiale medier-integrasjoner</h2>
            <p className="text-gray-700 leading-relaxed">
              Ved å koble til Facebook, Instagram eller TikTok gir du CenterForge tillatelse til å publisere innhold på dine vegne. Du kan når som helst trekke tilbake denne tillatelsen.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Ansvarsbegrensning</h2>
            <p className="text-gray-700 leading-relaxed">
              CenterForge leveres «som den er». Vi er ikke ansvarlige for tap som følge av bruk av tjenesten, inkludert publiseringsfeil, driftsavbrudd eller AI-generert innhold som ikke møter dine forventninger.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Endringer i vilkårene</h2>
            <p className="text-gray-700 leading-relaxed">
              Vi kan oppdatere disse vilkårene. Vesentlige endringer varsles via e-post. Fortsatt bruk av tjenesten etter endringer innebærer aksept av de nye vilkårene.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Kontakt</h2>
            <div className="bg-gray-50 rounded p-4 border border-gray-200">
              <p className="text-gray-700"><strong>CenterForge / Wackazakka</strong></p>
              <p className="text-gray-700">E-post: contact@centerforge.app</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
