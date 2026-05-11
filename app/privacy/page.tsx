'use client'

import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-12">
          <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Back to home
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
          <p className="text-gray-600">Last updated: 10 May 2026</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-8 space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
            <p className="text-gray-700 leading-relaxed">
              CenterForge is an AI-powered content generation platform. We take your privacy seriously and are committed to protecting your personal data in accordance with applicable law, including the GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Data We Collect</h2>
            <p className="text-gray-700 leading-relaxed mb-4">We collect the following types of personal data:</p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li><strong>Account information:</strong> Email address, name, and login credentials</li>
              <li><strong>Project data:</strong> Content you generate — articles, videos, and campaign information</li>
              <li><strong>Integration tokens:</strong> OAuth tokens for social media publishing (Facebook/Instagram, TikTok, LinkedIn, X, Reddit)</li>
              <li><strong>Usage data:</strong> Log files, IP address, and user interactions</li>
              <li><strong>Billing data:</strong> Subscription status and credit transaction history (payment details are handled by Stripe and never stored by us)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. How We Use Your Data</h2>
            <p className="text-gray-700 leading-relaxed mb-4">We use your data to:</p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>Provide and maintain the CenterForge service</li>
              <li>Generate AI-powered content (text, images, videos)</li>
              <li>Publish content to social media on your behalf</li>
              <li>Process subscription payments and manage credits</li>
              <li>Improve and optimise the platform</li>
              <li>Communicate with you about the service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Data Security</h2>
            <p className="text-gray-700 leading-relaxed">
              We use industry-standard security measures to protect your personal data, including encryption, secure servers, and access controls. Your data is stored securely in Supabase and Cloudflare R2.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Third-Party Services</h2>
            <p className="text-gray-700 leading-relaxed mb-4">We share data with the following third-party services where necessary to operate the platform:</p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li><strong>Supabase:</strong> Database and authentication</li>
              <li><strong>Cloudflare:</strong> CDN and file storage</li>
              <li><strong>Stripe:</strong> Subscription billing and payment processing</li>
              <li><strong>Anthropic:</strong> AI text generation (Claude)</li>
              <li><strong>OpenAI:</strong> AI image generation (DALL-E)</li>
              <li><strong>ElevenLabs:</strong> Voiceover generation</li>
              <li><strong>Facebook / Meta:</strong> Social media publishing via OAuth</li>
              <li><strong>TikTok:</strong> Video publishing via OAuth</li>
              <li><strong>LinkedIn:</strong> Publishing via OAuth</li>
              <li><strong>X (Twitter):</strong> Publishing via OAuth</li>
              <li><strong>Reddit:</strong> Publishing via OAuth</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              We never sell or share your personal data with other third parties without your consent.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Your Rights</h2>
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
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Cookies</h2>
            <p className="text-gray-700 leading-relaxed">
              CenterForge uses cookies only for login and session management. We do not use third-party tracking or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Changes to This Policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to update this privacy policy. Significant changes will be communicated by email.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Contact</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you have questions about this privacy policy or your personal data, please contact us:
            </p>
            <div className="bg-gray-50 rounded p-4 border border-gray-200">
              <p className="text-gray-700"><strong>CenterForge / Wackazakka</strong></p>
              <p className="text-gray-700">Email: privacy@centerforge.app</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
