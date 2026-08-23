import { LegalShell } from '@/components/LegalShell'

export default function PrivacyPage() {
  return (
    <LegalShell active="privacy" title="Privacy Policy" updated="Last updated 17 May 2026">
      <div className="cf-legal-callout">
        <p>
          This privacy policy applies to <strong>CenterForge</strong> (also known as ContentForge),
          a content publishing and scheduling platform operated by <strong>Norditech AS</strong>
          {' '}(org.nr. 937 759 487), based in Norway.
        </p>
        <p>
          CenterForge enables users to create, schedule, and publish content to social media platforms
          including TikTok, Instagram, Facebook, LinkedIn, YouTube, and X (Twitter).
        </p>
      </div>

      <section>
        <h2>1. Introduction</h2>
        <p>
          We take your privacy seriously and are committed to protecting your personal data in accordance with applicable law, including the GDPR.
        </p>
      </section>

      <section>
        <h2>2. Data We Collect</h2>
        <p>We collect the following types of personal data:</p>
        <ul>
          <li><strong>Name and email address</strong> (via login)</li>
          <li><strong>Social media access tokens</strong> (stored securely, used only to publish content on your behalf)</li>
          <li><strong>Content you create within the app</strong> (scripts, images, videos)</li>
          <li><strong>Usage data:</strong> Log files, IP address, and user interactions</li>
          <li><strong>Billing data:</strong> Subscription status and credit transaction history (payment details are handled by Stripe and never stored by us)</li>
        </ul>
      </section>

      <section>
        <h2>3. How We Use Your Data</h2>
        <p>We use your data to:</p>
        <ul>
          <li>Authenticate you with connected social media platforms</li>
          <li>Publish content on your behalf when you request it</li>
          <li>Provide and maintain the CenterForge service</li>
          <li>Generate AI-powered content (text, images, videos)</li>
          <li>Process subscription payments and manage credits</li>
          <li>Improve and optimise the platform</li>
        </ul>
        <p><strong>We do not sell your data to third parties.</strong></p>
      </section>

      <section>
        <h2>4. Third-Party Platforms</h2>
        <p>
          CenterForge integrates with TikTok, Meta (Instagram/Facebook), LinkedIn, YouTube, and X (Twitter) APIs.
          Your use of these platforms is also subject to their respective privacy policies.
        </p>
        <p>We also use the following services to operate the platform:</p>
        <ul>
          <li><strong>Supabase:</strong> Database and authentication</li>
          <li><strong>Cloudflare:</strong> CDN and file storage</li>
          <li><strong>Stripe:</strong> Subscription billing and payment processing</li>
          <li><strong>Anthropic:</strong> AI text generation (Claude)</li>
          <li><strong>OpenAI:</strong> AI image generation (DALL-E)</li>
          <li><strong>ElevenLabs:</strong> Voiceover generation</li>
        </ul>
      </section>

      <section>
        <h2>5. Data Retention</h2>
        <ul>
          <li>Access tokens are stored only as long as your account is active</li>
          <li>You can disconnect any platform at any time from your account settings</li>
        </ul>
      </section>

      <section>
        <h2>6. Data Security</h2>
        <p>
          We use industry-standard security measures to protect your personal data, including encryption, secure servers, and access controls. Your data is stored securely in Supabase and Cloudflare R2.
        </p>
      </section>

      <section>
        <h2>7. Your Rights</h2>
        <p>Under the GDPR you have the right to:</p>
        <ul>
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Delete your data (right to be forgotten)</li>
          <li>Restrict processing of your data</li>
          <li>Data portability</li>
        </ul>
        <p>To exercise these rights, contact us using the details below.</p>
      </section>

      {/* Metas app-oppsett krever en EGEN datasletting-URL, og den nektes hvis
          den er identisk med personvern-URL-en. Derfor peker appene hit med
          #data-deletion. Ankeret maa finnes her — uten det ruller lenken
          ingen steder, og en reviewer ser bare toppen av personvernsiden. */}
      <section id="data-deletion">
        <h2>8. Deleting Your Data</h2>
        <p>
          You can delete your account and all data associated with it at any
          time. Deletion removes your profile, your uploaded material, the
          content generated from it, and any connections you have made to
          third-party services such as Facebook, Instagram, LinkedIn or TikTok.
          Access tokens for those services are revoked and erased.
        </p>
        <p>
          To request deletion, email us at{' '}
          <a href="mailto:kilevold@gmail.com">kilevold@gmail.com</a> from the
          address your account is registered with, with the subject
          &laquo;Delete my account&raquo;. We complete deletion within 30 days
          and confirm by email when it is done.
        </p>
        <p>
          You may also remove our access from Facebook itself, under Settings
          &amp; Privacy → Settings → Business Integrations. That revokes the
          connection immediately; email us as well if you want the data we
          already stored removed.
        </p>
      </section>

      <section>
        <h2>9. Cookies</h2>
        <p>
          CenterForge uses cookies only for login and session management. We do not use third-party tracking or advertising cookies.
        </p>
      </section>

      <section>
        <h2>10. Changes to This Policy</h2>
        <p>
          We reserve the right to update this privacy policy. Significant changes will be communicated by email.
        </p>
      </section>

      <section>
        <h2>11. Contact</h2>
        <p>For privacy-related questions, contact:</p>
        <div className="cf-legal-contact">
          <p><strong>Norditech AS / CenterForge</strong></p>
          <p>Email: <a href="mailto:kilevold@gmail.com">kilevold@gmail.com</a></p>
        </div>
      </section>
    </LegalShell>
  )
}
