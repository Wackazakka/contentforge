# ContentForge v2 Status Document
*Oppdatert: 2026-05-04 08:15 UTC*

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

## ✅ Hva som fungerer (Session 2026-05-04)

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

### File Stability & R2 Upload
- ✅ waitForFile() waits for file to stabilize (6+ seconds no growth)
- ✅ Max 30 attempts (60 seconds total wait)
- ✅ Logging shows file size progression
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

## 🔴 Kjente problemer / TODO

### 1. R2 Video Upload (PARTIAL UPLOAD)
**Status:** ⚠️ Partial — Videos upload but often truncated  
**Details:** Python writes file in chunks, Node uploads to R2 after stability check. But sometimes only ~524 KB of 1.9 MB arrives in R2 (race condition still possible).  
**Workaround:** "Ferdigstilte videoer" uses droplet URL which has full file.  
**Long-term fix:** Need Python to explicitly signal completion before Node uploads (e.g., write a `.done` marker file).

### 2. product_profiles 406 Error
**Status:** ❌ Not investigated  
**Details:** `GET product_profiles?select=*&product_id=...` returns 406 Not Acceptable  
**Impact:** Merkevareprofil (brand info) doesn't display on product page  
**To debug:** Check Supabase query permissions, table structure, RLS policies

### 3. Cache-Busting
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

## 📋 Recent Commits (Session 2026-05-04)

| Commit | Message | Deploy ID |
|--------|---------|-----------|
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
