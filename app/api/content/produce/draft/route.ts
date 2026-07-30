import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildSenderContext, fetchVerticalForOrganization } from '@/lib/senderContext.mjs'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Validate UUID format
const isValidUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)

interface DraftRequest {
  productId: string
  campaignId: string
  topic: string
  title?: string
  segmentCount?: number
  targetAudience?: string
  problem?: string
  voiceId?: string
  tone?: string
  perspective?: 'du' | 'jeg' | 'vi'
  cta?: string
  videoFormat?: string
  musicStyle?: string
  musicFile?: string | null
  includeOutroCard?: boolean
}

interface Segment {
  index: number
  text: string
  voiceover: string
  image_url?: string
  approved: boolean
}

// Generate script using Claude
async function generateScript(
  topic: string,
  segmentCount: number,
  targetAudience: string = '',
  problem: string = '',
  tone: string = 'Energisk',
  cta: string = '',
  perspective: 'du' | 'jeg' | 'vi' = 'du',
  senderContext: string = ''
): Promise<Segment[]> {
  console.log(`[generateDraft] Calling Claude to generate script with ${segmentCount} segments for topic: "${topic}"`)

  const audienceContext = targetAudience ? `Target audience: ${targetAudience}` : ''
  const problemContext = problem ? `Problem to solve: ${problem}` : ''
  const toneContext = `Tone: ${tone}`
  const ctaContext = cta ? `Call-to-action: ${cta}` : ''
  const perspectiveContext = perspective === 'jeg'
    ? 'Perspective: First person ("jeg/I"). The narrator speaks from personal experience — "Jeg gjorde dette...", "Da jeg prøvde...", "Her er hva jeg lærte...". Avoid addressing the viewer as "du".'
    : perspective === 'vi'
    ? 'Perspective: First person plural ("vi/we"). The band/group/company speaks together — "Vi slipper...", "Vi gleder oss til...", "Her er hva vi har jobbet med...". Avoid addressing the viewer as "du".'
    : 'Perspective: Second person ("du"). Address the viewer directly — "Du bør...", "Har du noen gang...", "Dette gjør du...".'

  const prompt = `Generate a video script for a TikTok/Reels video about: "${topic}"

${senderContext}
${audienceContext}
${problemContext}
${toneContext}
${perspectiveContext}
${ctaContext}

The script should have exactly ${segmentCount} segments.

For each segment, provide:
1. Text (what to display on screen, max 100 chars — one short line)
2. Voiceover (what to say, max 85 chars / ~12 words — ONE short punchy sentence, about 4-5 seconds spoken. Never longer; short segments keep the video dynamic)
3. Image prompt (descriptive, cinematic, for DALL-E 3 — IMPORTANT: add "no text, no words, no letters" at the end)

Write in the same language as the topic and sender description above. Match the language naturally.
IMPORTANT PUNCTUATION:
- End each line of text with proper punctuation (period, exclamation mark, or question mark)
- Ensure every sentence is complete and properly punctuated

Return JSON with exactly this structure:
{
  "segments": [
    {
      "index": 0,
      "text": "Text for segment 1",
      "voiceover": "Voiceover for segment 1"
    },
    {
      "index": 1,
      "text": "Text for segment 2",
      "voiceover": "Voiceover for segment 2"
    }
    ... (${segmentCount} total segments)
  ]
}

Make each segment engaging and suitable for short-form video.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error(`[generateDraft] Claude API error`, { status: response.status, error: errorData })
    throw new Error(`Claude API error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.content?.[0]?.text

  if (!content) {
    throw new Error('No content in Claude response')
  }

  // Extract JSON from response
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No JSON found in Claude response')
  }

  const parsed = JSON.parse(jsonMatch[0])
  console.log(`[generateDraft] ✅ Generated ${parsed.segments?.length || 0} segments`)
  return parsed.segments || []
}

export async function POST(request: NextRequest) {
  try {
    const body: DraftRequest = await request.json()
    const { 
      productId, 
      campaignId, 
      topic,
      title,
      segmentCount = 4,
      targetAudience,
      problem,
      voiceId,
      tone,
      perspective = 'du',
      cta,
      videoFormat,
      musicStyle,
      musicFile,
      includeOutroCard,
    } = body

    if (!productId || !campaignId || !topic) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    console.log(`[generateDraft] ========== START DRAFT GENERATION ==========`)
    console.log(`[generateDraft] Product ID: ${productId}`)
    console.log(`[generateDraft] Campaign ID: ${campaignId}`)
    console.log(`[generateDraft] Topic: "${topic}"`)
    console.log(`[generateDraft] Segments: ${segmentCount}`)

    // Fetch website_url (+ service_area) from product profile to enrich CTA/context
    const supabaseForProfile = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')
    // select('*') tåler at valgfrie kolonner (service_area/phone/address) mangler
    const { data: profile } = await supabaseForProfile
      .from('product_profiles')
      .select('*')
      .eq('product_id', productId)
      .maybeSingle()
    const websiteUrl = profile?.website_url || null
    // Use explicit CTA if provided, otherwise fall back to website URL
    const effectiveCta = cta?.trim() || (websiteUrl ? `Besøk ${websiteUrl}` : '')
    console.log(`[generateDraft] CTA: "${effectiveCta}" (websiteUrl: ${websiteUrl})`)

    // «Om avsenderen»-kontekst: produktet/bedriften/artisten bak videoen —
    // delt hjelper (lib/senderContext.mjs) med vertikal-bevisste etiketter.
    // Defensivt: mangler rad/vertikal ⇒ default-etiketter eller utelates.
    const { data: productRow } = await supabaseForProfile
      .from('products')
      .select('name, description, category, organization_id')
      .eq('id', productId)
      .maybeSingle()
    const vertical = await fetchVerticalForOrganization(supabaseForProfile, productRow?.organization_id)
    const senderContext = buildSenderContext({ product: productRow, profile, vertical, media: 'video' })

    // Step 1: Generate script with Claude (NO IMAGE GENERATION)
    console.log(`[generateDraft] Step 1: Generating script...`)
    let segments = await generateScript(topic, segmentCount, targetAudience, problem, tone, effectiveCta, perspective, senderContext)
    console.log(`[generateDraft] Step 1: ✅ Script generated`)

    // Set empty image_url for each segment (images will be generated client-side)
    segments = segments.map((seg) => ({
      ...seg,
      image_url: '',
      approved: false,
    }))

    // Step 2: Save to production_drafts table
    console.log(`[generateDraft] Step 2: Saving draft to database...`)
    const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

    const { data: draftData, error: draftError } = await supabase
      .from('production_drafts')
      .insert({
        product_id: productId,
        campaign_id: isValidUuid(campaignId) ? campaignId : null,
        title: title || topic,
        status: 'draft',
        segments: segments,
        target_audience: targetAudience || '',
        problem: problem || '',
        voice_id: voiceId || 'nhvaqgRyAq6BmFs3WcdX',
        tone: tone || 'Energisk',
        cta: cta || '',
        video_format: videoFormat || '9:16',
        music_style: musicStyle || 'Upbeat',
        music_file: musicFile || null,
      })
      .select('id')
      .single()

    if (draftError) {
      console.error(`[generateDraft] Database error:`, draftError)
      throw new Error(`Failed to save draft: ${draftError.message}`)
    }

    const draftId = draftData.id
    console.log(`[generateDraft] ✅ Draft saved with ID: ${draftId}`)

    console.log(`[generateDraft] ========== ✅ DRAFT GENERATION SUCCESS ==========`)
    console.log(`[generateDraft] Note: Images will be generated client-side after draft is loaded`)

    return NextResponse.json({
      success: true,
      draftId,
      segments,
    })
  } catch (error) {
    console.error('[generateDraft] ========== ❌ DRAFT GENERATION FAILED ==========')
    console.error('[generateDraft] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate draft' },
      { status: 500 }
    )
  }
}
