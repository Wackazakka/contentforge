'use client'

import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-12">
          <Link href="/" className="text-[#185FA5] hover:text-[#0C447C] mb-4 inline-block">
            ← Back to home
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
          <p className="text-gray-600">Last updated: 16 May 2026</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-8 space-y-8">

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <p className="text-gray-800 leading-relaxed mb-2">
              This privacy policy applies to <strong>CenterForge</strong> (also known as ContentForge),
              a content publishing platform developed and operated by <strong>Abrakadabra Communication AS</strong>
              (org.nr. 976 842 790), based in Norway.
            </p>
            <p className="text-gray-800 leading-relaxed">
              CenterForge helps users create and publish content to social media platforms
              including TikTok, Instagram, Facebook, and LinkedIn.
            </p>
          </div>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
            <p className="text-gray-700 leading-relaxed">
              We take your privacy seriously and are committed to protecting your personal data in accordance with applicable law, including the GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Data We Collect</h2>
            <p className="text-gray-700 leading-relaxed mb-4">We collect the following types of personal data:</p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li><strong>Name and email address</strong> (via login)</li>
              <li><strong>Social media access tokens</strong> (stored securely, used only to publish content on your behalf)</li>
              <li><strong>Content you create within the app</strong> (scripts, images, videos)</li>
              <li><strong>Usage data:</strong> Log files, IP address, and user interactions</li>
              <li><strong>Billing data:</strong> Subscription status and credit transaction history (payment details are handled by Stripe and never stored by us)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. How We Use Your Data</h2>
            <p className="text-gray-700 leading-relaxed mb-4">We use your data to:</p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>Authenticate you with connected social media platforms</li>
              <li>Publish content on your behalf when you request it</li>
              <li>Provide and maintain the CenterForge service</li>
              <li>Generate AI-powered content (text, images, videos)</li>
              <li>Process subscription payments and manage credits</li>
              <li>Improve and optimise the platform</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4 font-medium">We do not sell your data to third parties.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Third-Party Platforms</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              CenterForge integrates with TikTok, Meta (Instagram/Facebook), and LinkedIn APIs.
              Your use of these platforms is also subject to their respective privacy policies.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">We also use the following services to operate the platform:</p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li><strong>Supabase:</strong> Database and authentication</li>
              <li><strong>Cloudflare:</strong> CDN and file storage</li>
              <li><strong>Stripe:</strong> Subscription billing and payment processing</li>
              <li><strong>Anthropic:</strong> AI text generation (Claude)</li>
              <li><strong>OpenAI:</strong> AI image generation (DALL-E)</li>
              <li><strong>ElevenLabs:</strong> Voiceover generation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Data Retention</h2>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>Access tokens are stored only as long as your account is active</li>
              <li>You can disconnect any platform at any time from your account settings</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Data Security</h2>
            <p className="text-gray-700 leading-relaxed">
              We use industry-standard security measures to protect your personal data, including encryption, secure servers, and access controls. Your data is stored securely in Supabase and Cloudflare R2.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Your Rights</h2>
            <p className="text-gray-700 leading-relaxed mb-4">Under the GDPR you have the right to:</p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your data (right to be forgotten)</li>
              <li>Restrict processing of your data</li>
              <li>Data portability</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              To exercise these rights, contact us using the details below.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Cookies</h2>
            <p className="text-gray-700 leading-relaxed">
              CenterForge uses cookies only for login and session management. We do not use third-party tracking or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Changes to This Policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to update this privacy policy. Significant changes will be communicated by email.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Contact</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              For privacy-related questions, contact:
            </p>
            <div className="bg-gray-50 rounded p-4 border border-gray-200">
              <p className="text-gray-700"><strong>Abrakadabra Communication AS / CenterForge</strong></p>
              <p className="text-gray-700">Email: <a href="mailto:kilevold@gmail.com" className="text-[#185FA5] hover:underline">kilevold@gmail.com</a></p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
