# ContentForge v2 Status Document
*Oppdatert: 2026-05-05 08:32 UTC*

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

## 📋 Recent Commits (Session 2026-05-05)

| Commit | Message | Status |
|--------|---------|--------|
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
