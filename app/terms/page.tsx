import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-12">
          <Link href="/" className="text-[#185FA5] hover:text-[#0C447C] mb-4 inline-block">
            ← Back to home
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Terms of Service</h1>
          <p className="text-gray-600">Last updated: 10 May 2026</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-8 space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              By using CenterForge you agree to these terms. The service is operated by Wackazakka and is intended for businesses that want to produce and publish AI-generated content.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Service Description</h2>
            <p className="text-gray-700 leading-relaxed">
              CenterForge is an AI-powered platform that lets users generate articles, video ads, and other marketing content, and publish it to social media platforms such as Facebook, Instagram, TikTok, LinkedIn, X (Twitter), and Reddit.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. User Account</h2>
            <p className="text-gray-700 leading-relaxed">
              You are responsible for keeping your account credentials secure. You must not share your access with others. We reserve the right to terminate accounts that are misused.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Content and Copyright</h2>
            <p className="text-gray-700 leading-relaxed">
              Content you generate via CenterForge belongs to you. You are responsible for ensuring that the content you publish complies with applicable laws, platform rules, and third-party rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Social Media Integrations</h2>
            <p className="text-gray-700 leading-relaxed">
              By connecting to Facebook, Instagram, TikTok, LinkedIn, X, or Reddit you grant CenterForge permission to publish content on your behalf. You can revoke this permission at any time.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Credits and Billing</h2>
            <p className="text-gray-700 leading-relaxed">
              CenterForge operates on a credit-based system. Credits are consumed when generating articles and videos. Subscription payments are handled by Stripe. Unused credits do not carry over when a subscription lapses.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Limitation of Liability</h2>
            <p className="text-gray-700 leading-relaxed">
              CenterForge is provided "as is". We are not liable for losses arising from use of the service, including publishing errors, downtime, or AI-generated content that does not meet your expectations.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Changes to Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update these terms. Significant changes will be communicated by email. Continued use of the service after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Contact</h2>
            <div className="bg-gray-50 rounded p-4 border border-gray-200">
              <p className="text-gray-700"><strong>CenterForge / Wackazakka</strong></p>
              <p className="text-gray-700">Email: contact@centerforge.app</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
