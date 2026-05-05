import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

interface DraftRequest {
  productId: string
  campaignId: string
  topic: string
  segmentCount?: number
}

interface Segment {
  index: number
  text: string
  voiceover: string
  image_url?: string
  approved: boolean
}

// Generate script using Claude
async function generateScript(topic: string, segmentCount: number): Promise<Segment[]> {
  console.log(`[generateDraft] Calling Claude to generate script with ${segmentCount} segments for topic: "${topic}"`)

  const prompt = `Generate a video script for a TikTok/Reels video about: "${topic}"

The script should have exactly ${segmentCount} segments.

For each segment, provide:
1. Text (what to display on screen, max 200 chars)
2. Voiceover (what to say, max 300 chars)

Write everything in Norwegian.

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
      model: 'claude-sonnet-4-20250514',
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
    const { productId, campaignId, topic, segmentCount = 4 } = body

    if (!productId || !campaignId || !topic) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    console.log(`[generateDraft] ========== START DRAFT GENERATION ==========`)
    console.log(`[generateDraft] Product ID: ${productId}`)
    console.log(`[generateDraft] Campaign ID: ${campaignId}`)
    console.log(`[generateDraft] Topic: "${topic}"`)
    console.log(`[generateDraft] Segments: ${segmentCount}`)

    // Step 1: Generate script with Claude (NO IMAGE GENERATION)
    console.log(`[generateDraft] Step 1: Generating script...`)
    let segments = await generateScript(topic, segmentCount)
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
        campaign_id: campaignId,
        status: 'draft',
        segments: segments,
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
