# ContentForge v2 Status Document
*Oppdatert: 2026-05-05 17:25 UTC*

## Stack
- **Frontend:** Next.js på Netlify (`contentforge-610.netlify.app`)
- **Repo:** `github.com/Wackazakka/contentforge` (main branch)
- **Backend/server:** Node.js job-queue på droplet `139.59.212.218`, port 3002, kjører som `systemd contentforge.service`
- **Database:** Supabase (jvnavubholyvihvytqkn)
- **Fillagring:** Cloudflare R2 bucket `contentforge-assets` + Public URL `https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev`
- **Video-rendering:** Python (`make_tiktok_reforhandle.py`) + ffmpeg på droplet
- **Netlify:** Auto-deploy via GitHub webhook

---

## Tabeller i Supabase
| Tabell | Innhold |
|--------|---------|
| `products` | Produkter (f.eks. BilDeal) |
| `product_profiles` | Merkevareprofil per produkt |
| `production_jobs` | Videojobber med status og ai_parameters |
| `asset_banks` | Ferdige assets (bilder + videoer) med R2-URLs |
| `organizations` | Organisasjoner |
| `subscriptions` | Abonnementer |

---

## ✅ Hva som fungerer (Session 2026-05-05)

### Authentication & Core
- ✅ Auth redirect loop FIXED (removed requireAuth from dashboard layout)
- ✅ Supabase client singleton pattern with localStorage persistence
- ✅ AuthContext provides session state to all pages

### Product ID Pipeline (End-to-End)
- ✅ Frontend extracts productId from URL (`/dashboard/new?productId=xyz`)
- ✅ API stores productId in production_jobs table
- ✅ API passes productId to droplet
- ✅ Droplet includes productId in webhook payload
- ✅ Webhook receives productId and stores in asset_banks

### Image Generation & Storage
- ✅ DALL-E generates 4 images per job
- ✅ Images uploaded to R2 (`images/{campaignId}/{jobId}/image-N.png`)
- ✅ asset_banks records created with product_id
- ✅ Product page gallery displays images from asset_banks
- ✅ Download buttons work

### Video Generation & Playback
- ✅ Python/ffmpeg generates H.264 video (yuv420p, 9:16 portrait)
- ✅ Video specs: 1080×1920, 24fps, ~1.9 MB, 16-23 seconds
- ✅ "Ferdigstilte videoer" section displays video with player
- ✅ Download button works (droplet URL)
- ✅ ffmpeg uses `-pix_fmt yuv420p` for browser compatibility
- ✅ **R2-upload of video works** — Python writes .done marker file when complete
- ✅ **Videos display and play on product page from R2-URL** — Content Banks gallery

### Audio & Music 
- ✅ Voiceovers generated with Google TTS
- ✅ Background music loaded from `/contentforge-server/music/` with subdirectories (global/, singlepicker/)
- ✅ Music mixed with voiceovers using CompositeAudioClip
- ✅ AAC audio codec applied in ffmpeg
- ✅ **Music file paths fixed** — `path.join(MUSIC_DIR, musicFile)` preserves subdirectory structure
- ✅ Both Reklame and Storytelling modes support custom music selection

### File Stability & R2 Upload
- ✅ **waitForFile() now waits for .done marker file** (Python signals completion)
- ✅ Python writes `output.mp4.done` after ffmpeg finishes encoding
- ✅ Node waits for .done file (max 30 attempts, 60 seconds total)
- ✅ .done file deleted after detected (cleanup)
- ✅ Prevents race condition (video still being written when upload starts)
- ✅ ai_parameters.r2_url stored in production_jobs
- ✅ Service automatically restarts on code update

### Logging & Debugging
- ✅ Webhook logs full request body
- ✅ Droplet logs file size and wait attempts
- ✅ All console.log outputs visible in systemd logs

### Code Quality
- ✅ Removed debug console.log statements
- ✅ Removed duplicate "Videoer" section from Content Banks
- ✅ Grid layout cleaned up (2 cols instead of 3)
- ✅ Explicit column selection in Supabase queries

---

### Articles Generation & Display
- ✅ API route `/api/content/produce/article` — single platform per call
- ✅ Frontend parallel execution via `Promise.all()` for multiple platforms
- ✅ Claude generates Norwegian articles with platform-specific tone
- ✅ LinkedIn articles start with strong opening sentence
- ✅ UUID validation for campaignId (set to null if invalid)
- ✅ Robust JSON parsing handles both markdown code blocks and raw JSON
- ✅ Articles section on product page displays with preview (100 chars)
- ✅ Article cards now clickable using `<a>` tag (navigation works!)
- ✅ Article detail page `/dashboard/products/[id]/article/[articleId]` shows full content
- ✅ Markdown rendering: `**bold**` → strong, `*italic*` → em
- ✅ Copy-to-clipboard functionality on article detail page

### Video Draft System (Complete Pipeline)
- ✅ **Draft creation** with Claude manus generation
- ✅ **Segment approval workflow** with Supabase persistence
- ✅ **Voiceover preview** — generate and play audio per segment
  - Uses ElevenLabs `eleven_turbo_v2_5` model
  - Norwegian language support (`language_code: 'no'`)
  - Cache-busting with timestamp on R2 URLs
  - Button states: "🎙️ Hør stemme" / "🔊 Regenerer lyd" / "⏳ Genererer..."
- ✅ **Image regeneration and asset bank selection**
- ✅ **Production submission** to job-queue with all draft parameters
- ✅ **Real-time status tracking** via polling (`/api/job-status` proxy)
- ✅ **Video playback** from R2 via proxy (`/api/video`)
- ✅ **Product logo integration**
  - Logo upload to R2 via `/api/products/upload-logo`
  - Logo preview on product page
  - Logo passed to Python renderer via `logoUrl` in config.json
  - Dynamic logo download from URL with fallback to local logo
  - Logo rendered on all video segments

### Draft Form Extended Features
- ✅ **Voice selection** — 7 Norwegian ElevenLabs voices
- ✅ **Tone selection** — Buttons: Vennlig, Energisk, Profesjonell, Rolig
- ✅ **Music selection** — Dynamic music library from droplet with preview players
- ✅ **Video format** — Buttons: 9:16 (TikTok), 16:9, 1:1
- ✅ **Target audience & problem context** — sent to Claude for better manus
- ✅ **CTA (Call-to-Action)** — included in Claude prompt
- ✅ **Musicstyle** — Upbeat, Minimal, Cinematisk

### Text Processing & Rendering
- ✅ **Emoji stripping** — removed from segment text before sending to renderer
- ✅ **Punctuation requirements** — explicit in Claude prompt for proper sentence structure
- ✅ **Newline handling** — Python splits on `\n` and word-wraps per paragraph
- ✅ **Text bar positioning** — 25% of screen height, 185 alpha transparency
- ✅ **Text positioning** — starts at H*0.80 for proper alignment

### Image Generation for Articles
- ✅ `/api/content/generate-image` API route (POST)
- ✅ DALL-E 3 generates professional article images
- ✅ Images uploaded to R2 bucket (`images/articles/[uuid].png`)
- ✅ Falls back to DALL-E URL if R2 upload fails
- ✅ Images inserted into `asset_banks` table with metadata
- ✅ Campaign image displayed above articles on generation page
- ✅ Loading spinner while image generates

## 🟢 Fixed This Session (2026-05-05)

### Build Issues
- ✅ **Missing @aws-sdk/client-s3** — Caused build failures (commit `18fb769`)
- ✅ **Article cards not clickable** — Changed from `onClick` to `<a>` tag (commit `e9a901f`)
- ✅ **Duplicate Articles section** — Removed hardcoded empty state that was blocking dynamic content (commit `eda4224`)
- ✅ **Grid layout** — Moved articles section into `grid md:grid-cols-3` (commit `54728c7`)

### JSON Parsing
- ✅ Improved Claude response parsing to handle markdown code blocks
- ✅ Added fallback for both `` ```json ``` `` and raw JSON formats

### Image Generation
- ✅ Added comprehensive error logging with R2 config checks
- ✅ Step-by-step logging for debugging (DALL-E → R2 → asset_banks)
- ✅ asset_banks insertion with all required fields

## 🔴 Kjente problemer / TODO

### 1. product_profiles 406 Error
**Status:** ❌ Not investigated  
**Details:** `GET product_profiles?select=*&product_id=...` returns 406 Not Acceptable  
**Impact:** Merkevareprofil (brand info) doesn't display on product page  
**To debug:** Check Supabase query permissions, table structure, RLS policies

### 2. Cache-Busting
**Status:** ✅ Mitigated  
**Details:** Netlify cache sometimes serves stale code. Added `ignore = "/bin/false"` in netlify.toml.  
**Workaround:** Use "Clear cache and deploy" on Netlify dashboard if needed

---

## 🔧 Important Config

### Netlify (`netlify.toml`)
```toml
[build]
  command = "npm run build"
  publish = ".next"
  ignore = "/bin/false"

[build.environment]
  NEXT_PUBLIC_SUPABASE_URL = "https://jvnavubholyvihvytqkn.supabase.co"
  NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJ..."
  SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
```

### Droplet Service
```bash
systemctl restart contentforge      # Restart
systemctl status contentforge       # Check status
journalctl -u contentforge -n 100 --no-pager  # View logs
```

### Environment Variables (Droplet)
```
ELEVENLABS_API_KEY=...
OPENAI_API_KEY=...
R2_ENDPOINT=https://c2fde28004c6c81dfe77184575d12d96.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=contentforge-assets
R2_PUBLIC_URL=https://pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev
```

---

## 📋 Recent Commits (Session 2026-05-05, Afternoon)

| Commit | Message | Status |
|--------|---------|--------|
| `9e8a879` | feat: improve logo upload UI with file picker and preview | ✅ |
| `892d8a1` | feat: fetch and send product logo_url to job-queue | ✅ |
| `b86f5b8` | feat: add product logo upload and management UI | ✅ |
| `7ad5c6e` | fix: add timestamp to voiceover filename to prevent browser caching | ✅ |
| `bca6435` | fix: use eleven_turbo_v2_5 with language_code: 'no' to match job-queue | ✅ |
| `c52f01d` | fix: remove language_code to let ElevenLabs auto-detect | ✓ (reverted) |
| `64130e4` | fix: change voiceover language back to Norwegian | ✓ (reverted) |
| `aef5510` | fix: change voiceover language from Norwegian to Danish | ✓ (reverted) |
| `3514a65` | Revert "feat: add voiceover preview generation and playback per segment" | ✓ (reverted) |
| `2eaadde` | Revert "fix: add language_code: 'no' to preview-voiceover API request" | ✓ (reverted) |
| `f387e4c` | Revert "debug: improve error logging in preview-voiceover API" | ✓ (reverted) |
| `8c1e542` | fix: change button text from 'Forhør lyd' to 'Hør stemme' | ✅ |
| `e5efa1f` | debug: improve error logging in preview-voiceover API | ✓ (reverted) |
| `cd39799` | fix: add language_code: 'no' to preview-voiceover API request | ✓ (reverted) |
| `c2f53b8` | feat: add voiceover preview generation and playback per segment | ✅ |
| `e65cf6b` | feat: add explicit punctuation requirements to Claude prompt | ✅ |
| `ead42f9` | fix: strip emojis from segment text before sending to Python renderer | ✅ |
| `4a8a6c0` | fix: use R2 video URL directly instead of proxy endpoint | ✅ |
| `90b4d0f` | feat: add targetAudience, problem, and musicStyle to draft workflow | ✅ |
| `eae4243` | refactor: redesign draft form with storytelling UX | ✅ |
| `f05de08` | feat: replace voice textinput with dropdown, tone with button toggles | ✅ |
| `79b63f0` | feat: improve music file selection with filename, name, folder | ✅ |
| `3170b1b` | feat: add music proxy API and extend draft form | ✅ |
| `127a636` | fix: update job-status API to use async params pattern | ✅ |
| `69446ff` | feat: add job-status API proxy and update video status page | ✅ |
| `f4af007` | feat: add video proxy API and update status page | ✅ |
| `e9a901f` | fix: replace onClick with <a> tag for article card navigation | ✅ Works! |
| `f7f3142` | fix: remove 150-word constraint from article generation prompts | ✅ |
| `ab20777` | fix: update asset_banks insert with all required fields | ✅ |
| `c5a0f1a` | fix: rename asset_type to bank_type in asset_banks insert | ✅ |
| `aa684ac` | feat: add asset_banks insert for generated article images | ✅ |
| `2398e80` | debug: enhance R2 upload error logging | ✅ |
| `526c7f9` | debug: improve error logging in image generation | ✅ |
| `8ca334a` | feat: add article detail page + clickable article cards | ✅ |
| `a34f665` | feat: add DALL-E image generation API | ✅ |
| `8e425e3` | feat: add simple markdown renderer for article content | ✅ |
| `eda4224` | **fix: remove duplicate hardcoded Articles section** | ✅ |
| `58f3074` | cleanup: remove debug text from articles section | ✅ |
| `54728c7` | debug: move articles into grid layout | ✅ |
| `c625557` | debug: add console logging to articles fetch | ✅ |
| `ce013bb` | docs: update status with articles feature | ✅ |
| `0ede2d3` | feat: add robust JSON extraction with better error handling | — |
| `e4f6753` | refactor: remove session check from articles fetch | — |
| `9171bb6` | feat: add articles section to product page | — |
| `57f4090` | feat: add strong opening sentence to LinkedIn articles | — |
| `bca85a6` | fix: validate campaignId as UUID | — |
| `748c31c` | feat: generate articles in Norwegian | — |
| `90f09ce` | feat: disable DALL-E image generation temporarily | — |
| `3c33b20` | refactor: single-platform API with Promise.all() | — |
| `bb898fc` | fix: use crypto.randomUUID instead of uuid | — |
| `cf90290` | feat: add articles generation feature | — |
| `ed409f0` | feat: add brand profile editor form | — |
| `c18476e` | refactor: remove read-only profile section | — |
| `a6a5422` | fix: use maybeSingle() for product_profiles | — |
| `e165632` | feat: restore Videos section in Content Banks with droplet URLs | `69f85fbd2779` |
| `2d41ead` | docs: add comprehensive ContentForge v2 status document | — |
| `bd47570` | cleanup: remove videos from asset_banks section | — |
| `30fd9d7` | fix: store R2 video URL in ai_parameters.r2_url | `69f8451bc914` |
| `a38b66d` | build: add ignore rule to netlify.toml | `69f77fe8015a` |
| `d2e183e` | debug: verify deploy | — |
| `f8e276e` | fix: update finished videos section | `69f78273478ce` |
| `0b613c7` | fix: cast video.name to any | `69f77da3bd2b` |
| `b11972d` | feat: display videos from asset_banks | — |
| `db9526a` | debug: add detailed logging of webhook | `69f778c74d55` |
| `71f10a6` | feat: insert job into production_jobs | `69f76dae015a` |
| `174b68b` | fix: use useEffect to extract productId | `69f7698005fa` |
| `e7ada5c` | **fix: remove requireAuth() from dashboard** | `69f75f77c143` |

**Auth Loop Fixed (e7ada5c):** Removed `await requireAuth()` call from dashboard/layout.tsx which was redirecting to login before page could render.

---

## 🚀 Next Priority Actions

1. **Fix R2 upload race condition**
   - Option A: Python writes `.done` marker file after encoding
   - Option B: Node reads file more carefully (stream instead of buffer)
   - Option C: Increase stability check threshold to 3 equal-size reads

2. **Investigate product_profiles 406 error**
   - Check RLS policies on product_profiles table
   - Verify column names match query
   - Test query directly in Supabase dashboard

3. **Re-enable Videos section in Content Banks**
   - Once R2 upload is reliable, re-add the Videos gallery
   - Test end-to-end: generate video → upload to R2 → display in gallery

4. **Production hardening**
   - Remove all debug console.log (done)
   - Add error boundaries in React
   - Set up monitoring/alerting for droplet
   - Document deployment process

---

## 📊 Test Checklist (E2E)

- [ ] Login with valid credentials
- [ ] Navigate to product page
- [ ] Click "Ny kampanje"
- [ ] Fill in campaign form
- [ ] Submit → video generation starts
- [ ] Wait for completion (~5-10 min)
- [ ] "Ferdigstilte videoer" shows video player
- [ ] Video plays correctly
- [ ] Download button works
- [ ] Asset bank entries created in DB
- [ ] Images display in gallery
- [ ] Navigate back to products list
- [ ] All assets persist across page reloads

---

## 📞 Support Info

**Live Site:** https://contentforge-610.netlify.app  
**GitHub:** https://github.com/Wackazakka/contentforge (main branch)  
**Droplet:** ssh root@139.59.212.218  
**Supabase:** https://app.supabase.com (project: jvnavubholyvihvytqkn)  
**Netlify:** https://app.netlify.com/sites/contentforge-610  

---

**Last Updated:** 2026-05-04 08:15 UTC  
**Session Notes:** Major fixes to auth loop and productId pipeline. Video upload still has race condition but "Ferdigstilte videoer" section uses droplet URL as workaround.
