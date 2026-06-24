import { LegalShell } from '@/components/LegalShell'

export default function TermsPage() {
  return (
    <LegalShell active="terms" title="Terms of Service" updated="Last updated 16 May 2026">
      <div className="cf-legal-callout">
        <p>
          These Terms of Service apply to <strong>CenterForge</strong> (also known as ContentForge),
          operated by <strong>Abrakadabra Communication AS</strong> (org.nr. 976 842 790), based in Norway.
        </p>
      </div>

      <section>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using CenterForge, you agree to be bound by these Terms of Service. If you do not agree, you may not use the service. The service is intended for businesses and individuals who want to produce and publish AI-generated content to social media platforms.
        </p>
      </section>

      <section>
        <h2>2. Service Description</h2>
        <p>
          CenterForge is an AI-powered content publishing platform that allows users to generate articles, videos, and other marketing content, and publish it to social media platforms including Facebook, Instagram, TikTok, LinkedIn, X (Twitter), Reddit, and YouTube.
        </p>
      </section>

      <section>
        <h2>3. User Accounts</h2>
        <p>
          You are responsible for maintaining the security of your account credentials. You must not share your login with others. We reserve the right to suspend or terminate accounts that are misused or violate these terms.
        </p>
      </section>

      <section>
        <h2>4. Content and Intellectual Property</h2>
        <p>
          Content you generate via CenterForge belongs to you. You are solely responsible for ensuring that the content you create and publish complies with applicable laws, platform terms of service, and third-party intellectual property rights. CenterForge does not review or endorse content published by users.
        </p>
      </section>

      <section>
        <h2>5. Social Media and Platform Integrations</h2>
        <p>
          By connecting your accounts on Facebook, Instagram, TikTok, LinkedIn, X, Reddit, or YouTube, you grant CenterForge permission to publish content on your behalf using the access you provide. You can revoke this permission at any time from your account settings.
        </p>
        <p>
          Your use of connected platforms is also subject to their respective terms of service. CenterForge is not responsible for changes to third-party platform APIs or policies that affect the service.
        </p>
      </section>

      <section>
        <h2>6. YouTube API Services</h2>
        <p>
          CenterForge uses YouTube API Services to upload and publish videos to YouTube on your behalf. By connecting your YouTube account, you agree to be bound by the{' '}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a>.
        </p>
        <p>
          CenterForge&apos;s use of information received from Google APIs adheres to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.
        </p>
      </section>

      <section>
        <h2>7. Credits and Billing</h2>
        <p>
          CenterForge operates on a credit-based subscription model. Credits are consumed when generating articles and videos. Subscription payments are processed by Stripe. Unused credits do not carry over when a subscription lapses. All prices are displayed in the billing section of your account.
        </p>
      </section>

      <section>
        <h2>8. Prohibited Uses</h2>
        <p>You may not use CenterForge to:</p>
        <ul>
          <li>Publish content that is illegal, defamatory, or infringes on third-party rights</li>
          <li>Spam, harass, or deceive users on any platform</li>
          <li>Circumvent platform policies or API rate limits</li>
          <li>Use the service for any purpose other than legitimate content publishing</li>
        </ul>
      </section>

      <section>
        <h2>9. Limitation of Liability</h2>
        <p>
          CenterForge is provided &quot;as is&quot; without warranties of any kind. Abrakadabra Communication AS is not liable for losses arising from use of the service, including publishing errors, downtime, AI-generated content quality, or changes to third-party platform APIs.
        </p>
      </section>

      <section>
        <h2>10. Governing Law</h2>
        <p>
          These terms are governed by Norwegian law. Any disputes shall be resolved in Norwegian courts.
        </p>
      </section>

      <section>
        <h2>11. Changes to Terms</h2>
        <p>
          We may update these terms from time to time. Significant changes will be communicated by email. Continued use of the service after changes constitutes acceptance of the updated terms.
        </p>
      </section>

      <section>
        <h2>12. Contact</h2>
        <div className="cf-legal-contact">
          <p><strong>Abrakadabra Communication AS / CenterForge</strong></p>
          <p>Email: <a href="mailto:kilevold@gmail.com">kilevold@gmail.com</a></p>
        </div>
      </section>
    </LegalShell>
  )
}
