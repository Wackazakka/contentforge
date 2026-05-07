'use client'

import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Tilbake til startsiden
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Personvernpolicy</h1>
          <p className="text-gray-600">Sist oppdatert: 7. mai 2026</p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 space-y-8">
          {/* Introduction */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduksjon</h2>
            <p className="text-gray-700 leading-relaxed">
              ContentForge er en AI-drevet plattform for innholdsgenerering. Vi tar ditt personvern alvorlig og er forpliktet til å beskytte dine personopplysninger i samsvar med gjeldende lovgivning, inkludert GDPR.
            </p>
          </section>

          {/* Data Collection */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Innsamling av data</h2>
            <p className="text-gray-700 leading-relaxed mb-4">Vi samler inn følgende typer personopplysninger:</p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li><strong>Kontoinformasjon:</strong> E-postadresse, navn, og påloggingsinformasjon</li>
              <li><strong>Prosjektdata:</strong> Innhold du genererer, artikler, videoer, og kampanjeinformasjon</li>
              <li><strong>Integrasjonsdata:</strong> Facebook/Instagram-token for sosial mediepublisering</li>
              <li><strong>Bruksdata:</strong> Loggfiler, IP-adresse, og brukerinteraksjoner</li>
            </ul>
          </section>

          {/* Data Usage */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Bruk av data</h2>
            <p className="text-gray-700 leading-relaxed mb-4">Vi bruker dine data til å:</p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>Tilby og vedlikeholde ContentForge-tjenesten</li>
              <li>Generere AI-drevet innhold (tekst, bilder, videoer)</li>
              <li>Publisere innhold til sosiale medier på dine vegne</li>
              <li>Forbedre og optimalisere plattformen</li>
              <li>Kommunisere med deg om tjenesten</li>
            </ul>
          </section>

          {/* Data Protection */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Databeskyttelse</h2>
            <p className="text-gray-700 leading-relaxed">
              Vi bruker industristandard sikkerhetstiltak for å beskytte dine personopplysninger, inkludert kryptering, sikre servere, og tilgangskontroll. Dine data lagres sikkert i Supabase og Cloudflare R2.
            </p>
          </section>

          {/* Third Parties */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Deling med tredjeparter</h2>
            <p className="text-gray-700 leading-relaxed mb-4">Vi deler dine data med følgende tredjeparttjenester:</p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li><strong>Supabase:</strong> Databasetjeneste for lagring av data</li>
              <li><strong>Cloudflare:</strong> CDN og fillagring</li>
              <li><strong>Facebook/Meta:</strong> For sosial mediepublisering (via OAuth)</li>
              <li><strong>OpenAI:</strong> For AI-drevet innholdsgenerering</li>
              <li><strong>ElevenLabs:</strong> For voiceover-generering</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              Vi deler aldri dine personopplysninger med andre tredjeparter uten ditt samtykke.
            </p>
          </section>

          {/* User Rights */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Dine rettigheter</h2>
            <p className="text-gray-700 leading-relaxed mb-4">Under GDPR har du rett til:</p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>Tilgang til dine personopplysninger</li>
              <li>Rettelse av unøyaktige data</li>
              <li>Sletting av dine data (retten til å bli glemt)</li>
              <li>Å begrense behandlingen av dine data</li>
              <li>Dataportabilitet</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              For å utøve disse rettighetene, kontakt oss på kontaktinformasjonen nedenfor.
            </p>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Cookies og sporing</h2>
            <p className="text-gray-700 leading-relaxed">
              ContentForge bruker cookies kun for pålogging og sesjonsstyring. Vi bruker ikke tredjepartscookies for sporing eller reklame.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Kontakt</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Hvis du har spørsmål om denne personvernpolicyen eller dine personopplysninger, kontakt oss:
            </p>
            <div className="bg-gray-50 rounded p-4 border border-gray-200">
              <p className="text-gray-700"><strong>ContentForge</strong></p>
              <p className="text-gray-700">E-post: privacy@contentforge.app</p>
            </div>
          </section>

          {/* Changes */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Endringer i policyen</h2>
            <p className="text-gray-700 leading-relaxed">
              Vi forbeholder oss retten til å oppdatere denne personvernpolicyen. Vesentlige endringer vil bli varslet via e-post.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
