import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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

    // Use service_role_key if available (for UPDATE permissions), otherwise fall back to ANON_KEY
    const supabaseKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
    const keyType = SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon'
    
    console.log(`[api/productions/complete] Using Supabase client with key type: ${keyType}`)
    
    // Create Supabase client
    const supabase = createClient(SUPABASE_URL!, supabaseKey!, {
      auth: { persistSession: false },
    })

    // Update production_job status to 'done' and set video URL
    console.log(`[api/productions/complete] Updating job ${jobId} status to 'done'`)
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
      console.error('[api/productions/complete] Update failed with keyType:', keyType)
      return NextResponse.json(
        { error: 'Failed to update production job status', details: updateError },
        { status: 500 }
      )
    }
    
    console.log(`[api/productions/complete] ✅ Job ${jobId} status updated to 'done'`)

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
        name: `Bilde ${index + 1}`,
        bank_type: 'image',
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
        name: 'Video',
        bank_type: 'video',
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
        name: 'Video',
        bank_type: 'video',
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
