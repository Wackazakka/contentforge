import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://contentforge-610.netlify.app'

export async function POST(request: NextRequest) {
  try {
    const { email, name, plan, credits, renewsAt } = await request.json()
    if (!email || !plan) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const firstName = name?.split(' ')[0] ?? 'there'

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Subscription confirmed</title>
</head>
<body style="margin:0;padding:0;background-color:#F1EFE8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1EFE8;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:middle;padding-right:8px;">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <polygon points="12,2.5 20.8,7.75 20.8,16.25 12,21.5 3.2,16.25 3.2,7.75" stroke="#378ADD" stroke-width="1.75" stroke-linejoin="round" fill="none"/>
                  </svg>
                </td>
                <td style="vertical-align:middle;">
                  <span style="font-size:22px;font-weight:700;color:#0C447C;">Center</span><span style="font-size:22px;font-weight:700;color:#378ADD;">Forge</span>
                </td>
              </tr></table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;border:1px solid #e5e7eb;padding:40px 40px 36px;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#378ADD;text-transform:uppercase;letter-spacing:0.08em;">Payment confirmed</p>
              <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#0C447C;">
                You're on ${plan}!
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
                Thanks, ${firstName}. Your subscription is now active and ${credits} credits have been added to your account.
              </p>

              <!-- Summary box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;background-color:#EBF4FF;border-radius:12px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:10px;">
                          <span style="font-size:13px;color:#6b7280;">Plan</span><br/>
                          <span style="font-size:15px;font-weight:600;color:#0C447C;">${plan}</span>
                        </td>
                        <td style="padding-bottom:10px;text-align:right;">
                          <span style="font-size:13px;color:#6b7280;">Credits added</span><br/>
                          <span style="font-size:15px;font-weight:600;color:#0C447C;">${credits}</span>
                        </td>
                      </tr>
                      ${renewsAt ? `<tr><td colspan="2" style="border-top:1px solid #d1e8ff;padding-top:10px;">
                        <span style="font-size:13px;color:#6b7280;">Renews</span><br/>
                        <span style="font-size:14px;font-weight:500;color:#185FA5;">${renewsAt}</span>
                      </td></tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px;background-color:#185FA5;">
                    <a href="${BASE_URL}/dashboard" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
                      Start creating →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                CenterForge by Wackazakka · <a href="${BASE_URL}/dashboard/billing" style="color:#9ca3af;">Manage subscription</a>
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
      subject: `You're on the ${plan} plan — ${credits} credits added`,
      html,
    })

    if (error) {
      console.error('[email/subscription] Resend error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[email/subscription] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
