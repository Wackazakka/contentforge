import { createClient } from '@supabase/supabase-js'

// Netlify Background Function (name ends in -background → up to 15 min, returns 202).
// Moves the slow Claude call off the synchronous /api/content/produce/article path so long
// articles (esp. LinkedIn) no longer time out the CDN function. Fills the article row that the
// route created, then triggers the existing image-generation background function.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://contentforge-610.netlify.app'

async function generateArticleContent(topic, platform, includeLink, websiteUrl, ctaText) {
  const platformGuides = {
    facebook:
      'Write for Facebook: SHORT and punchy — aim for 50-90 words total, never more. A strong hook, 2-3 tight lines, then the point. No walls of text (long posts get cut with "See more" and lose reach). Conversational, a few emojis. End with maximum 3 relevant hashtags.',
    linkedin:
      'Write for LinkedIn: concise thought-leadership — aim for 120-180 words, never more. Short, scannable paragraphs. START WITH A STRONG, COMPLETE OPENING SENTENCE that grabs attention. Get to the point fast. No excessive emojis.',
    x: 'Write for X/Twitter: concise (under 280 chars per tweet), punchy, with relevant hashtags.',
  }

  const prompt = `Generate a ${platform} article about: "${topic}"

Write in the same language as the topic above. If the topic is in English, write in English. If it is in Norwegian, write in Norwegian. Match the language naturally.

Be specific and concrete — mention real names, models, and examples where you know them. If you are genuinely uncertain about a specific fact (an exact number, date, or technical detail), acknowledge it briefly, but do not let uncertainty stop you from writing a specific, engaging article. Vague articles that avoid all concrete details are unhelpful.

${platformGuides[platform] || 'Write engaging content'}

Return JSON with:
{
  "title": "Article title",
  "content": "Full article content optimized for ${platform}"
}`

  let finalPrompt
  if (includeLink && websiteUrl && !ctaText?.trim()) {
    const ctaGuides = {
      facebook: 'End the article with a single natural sentence that subtly references this URL: ' + websiteUrl + '. Keep it brief and unforced. No call-to-action language.',
      linkedin: 'Close the article with one understated sentence that references this URL: ' + websiteUrl + '. Make it feel like a natural sign-off, not a sales pitch.',
      x: 'Add the URL ' + websiteUrl + ' at the very end on its own line. Nothing else.',
    }
    finalPrompt = prompt + '\n\n' + (ctaGuides[platform] || 'End with: ' + websiteUrl)
  } else {
    finalPrompt = prompt
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: finalPrompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Claude API error: ${response.status} — ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text
  if (!text) throw new Error('No content in Claude response')

  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in Claude response')

  const parsed = JSON.parse(jsonMatch[0])

  if (includeLink && ctaText?.trim()) {
    let ctaSuffix = ctaText.trim()
    if (websiteUrl?.trim()) {
      const url = websiteUrl.trim().startsWith('http') ? websiteUrl.trim() : `https://${websiteUrl.trim()}`
      ctaSuffix += '\n' + url
    }
    parsed.content = String(parsed.content).trimEnd() + '\n\n---CTA---\n' + ctaSuffix
  }

  return parsed
}

export default async function handler(req) {
  let body
  try {
    body = await req.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  const { articleId, topic, platform, includeLink, websiteUrl, ctaText, productId, logoUrl, imageStyle } = body
  if (!articleId || !topic || !platform) return new Response('Missing fields', { status: 400 })

  const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')
  console.log(`[bg-article] Starting ${platform} article ${articleId}: "${topic}"`)

  try {
    const { title, content } = await generateArticleContent(topic, platform, includeLink, websiteUrl, ctaText)
    const { error } = await supabase.from('articles').update({ title, content }).eq('id', articleId)
    if (error) throw new Error(`Supabase update failed: ${error.message}`)
    console.log(`[bg-article] ✅ Content saved for ${articleId}: "${title.substring(0, 60)}"`)

    // Trigger image generation (reuses the existing background function), using the real title.
    // MUST await: a background function is frozen on return, so an un-awaited fire-and-forget
    // fetch never actually goes out → the image job never starts (root cause of missing images).
    // Awaiting a call to a *-background function returns 202 immediately, so this is cheap.
    try {
      await fetch(SITE_URL + '/.netlify/functions/generate-image-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, topic: title, productId, logoUrl: logoUrl || null, imageStyle: imageStyle || 'tech' }),
      });
    } catch (imgErr) {
      console.error('[bg-article] Failed to trigger image for', articleId, imgErr?.message || imgErr);
    }

    return new Response('OK', { status: 200 })
  } catch (e) {
    console.error(`[bg-article] Failed for ${articleId}:`, e)
    // Remove the empty placeholder so it doesn't linger in the queue; UI polling treats it as failed.
    await supabase.from('articles').delete().eq('id', articleId).catch(() => {})
    return new Response('Error', { status: 500 })
  }
}
