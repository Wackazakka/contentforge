import { NextResponse } from 'next/server'

export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: process.env.META_REDIRECT_URI!,
    scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_business_basic,instagram_content_publish',
    response_type: 'code',
  })
  
  return NextResponse.redirect(
    `https://www.facebook.com/dialog/oauth?${params.toString()}`
  )
}
