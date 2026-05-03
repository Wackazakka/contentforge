import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request: NextRequest) {
  try {
    const { jobId, videoUrl, imageUrls = [], service, campaignId } = await request.json()

    if (!jobId || !videoUrl) {
      return NextResponse.json(
        { error: 'Missing jobId or videoUrl' },
        { status: 400 }
      )
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })

    // Update production_job status to 'done' and set video URL
    const { error: updateError } = await supabase
      .from('production_jobs')
      .update({
        status: 'done',
        completed_at: new Date().toISOString(),
        // Store video URL and image URLs in ai_parameters
        ai_parameters: {
          video_url: videoUrl,
          image_urls: imageUrls,
          service,
          campaignId,
        },
      })
      .eq('id', jobId)

    if (updateError) {
      console.error('[api/productions/complete] Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update production job status' },
        { status: 500 }
      )
    }

    // Get product_id from production_jobs if needed
    let productId = null
    try {
      const { data: jobData } = await supabase
        .from('production_jobs')
        .select('product_id')
        .eq('id', jobId)
        .single()
      
      productId = jobData?.product_id
    } catch (err) {
      console.warn('[api/productions/complete] Could not fetch product_id for job', jobId)
    }

    // Store generated assets in asset_banks table
    if (imageUrls && imageUrls.length > 0) {
      const assetInserts: Array<Record<string, any>> = imageUrls.map((url: string, index: number) => ({
        job_id: jobId,
        product_id: productId, // Link to product if available
        asset_type: 'image',
        asset_url: url,
        metadata: {
          index,
          source: 'dalle-3',
          campaignId,
        },
        created_at: new Date().toISOString(),
      }))

      // Add video asset
      assetInserts.push({
        job_id: jobId,
        product_id: productId, // Link to product if available
        asset_type: 'video',
        asset_url: videoUrl,
        metadata: {
          source: 'contentforge-server',
          campaignId,
        },
        created_at: new Date().toISOString(),
      })

      console.log(`[api/productions/complete] Inserting ${assetInserts.length} assets with imageUrls=${imageUrls.length}`)
      const { error: assetError, data: assetData } = await supabase
        .from('asset_banks')
        .insert(assetInserts)

      if (assetError) {
        console.error('[api/productions/complete] Asset insert error:', assetError)
        // Don't fail the whole request if asset storage fails
        console.warn('[api/productions/complete] Continuing despite asset storage error')
      } else {
        console.log(`[api/productions/complete] ✅ Stored ${assetInserts.length} assets in asset_banks`)
      }
    } else {
      console.warn(`[api/productions/complete] No imageUrls provided (empty array), only storing video`)
      // Still store video even if no images
      const videoAsset = {
        job_id: jobId,
        product_id: productId,
        asset_type: 'video',
        asset_url: videoUrl,
        metadata: {
          source: 'contentforge-server',
          campaignId,
        },
        created_at: new Date().toISOString(),
      }
      
      const { error: videoError } = await supabase
        .from('asset_banks')
        .insert([videoAsset])
      
      if (videoError) {
        console.error('[api/productions/complete] Video asset insert error:', videoError)
      }
    }

    console.log(`[api/productions/complete] Job ${jobId} marked as done with video URL: ${videoUrl} and ${imageUrls.length} images`)

    return NextResponse.json({
      jobId,
      status: 'done',
      videoUrl,
      imageUrls,
      assetsStored: imageUrls.length + 1, // images + video
    })
  } catch (err) {
    console.error('[api/productions/complete] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
