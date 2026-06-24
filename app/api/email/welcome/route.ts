import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://contentforge-610.netlify.app'

export async function POST(request: NextRequest) {
  try {
    const { email, name } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 })
    }

    const firstName = name?.split(' ')[0] ?? 'there'

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to CenterForge</title>
</head>
<body style="margin:0;padding:0;background-color:#F4EEE2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4EEE2;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:8px;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <polygon points="12,2.5 20.8,7.75 20.8,16.25 12,21.5 3.2,16.25 3.2,7.75" stroke="#C5451B" stroke-width="1.75" stroke-linejoin="round" fill="none"/>
                    </svg>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:22px;font-weight:700;color:#1C1A16;">Center</span><span style="font-size:22px;font-weight:700;color:#C5451B;">Forge</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#FFFDF8;border-radius:16px;border:1px solid #E6DDCC;padding:40px 40px 36px;">

              <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#1C1A16;line-height:1.2;">
                Welcome, ${firstName}!
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:#5E564A;line-height:1.6;">
                Your CenterForge account is ready. Start creating AI-powered content and publishing it to your social media channels — all from one place.
              </p>

              <!-- Steps -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                ${[
                  ['1', 'Add a product', 'Describe what you sell — name, category, and a short description.'],
                  ['2', 'Generate content', 'Create articles and short-form videos with one click using AI.'],
                  ['3', 'Connect & publish', 'Link your social accounts and publish directly from CenterForge.'],
                ].map(([step, title, desc]) => `
                <tr>
                  <td style="padding-bottom:16px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align:top;padding-right:14px;padding-top:1px;">
                          <div style="width:24px;height:24px;border-radius:50%;background-color:#C5451B;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#FFFDF8;">${step}</div>
                        </td>
                        <td>
                          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#1C1A16;">${title}</p>
                          <p style="margin:0;font-size:13px;color:#5E564A;">${desc}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`).join('')}
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px;background-color:#1C1A16;">
                    <a href="${BASE_URL}/dashboard" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#FFFDF8;text-decoration:none;border-radius:10px;">
                      Go to dashboard →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#978B79;">
                CenterForge by Wackazakka · <a href="${BASE_URL}/privacy" style="color:#978B79;">Privacy policy</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    const { error } = await getResend().emails.send({
      from: 'CenterForge <hello@centerforge.app>',
      to: email,
      subject: 'Welcome to CenterForge!',
      html,
    })

    if (error) {
      console.error('[email/welcome] Resend error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[email/welcome] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
