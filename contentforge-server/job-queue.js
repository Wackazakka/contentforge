/**
 * ContentForge Job Queue Server
 * Runs on the production droplet at port 3002.
 *
 * POST /jobs  — enqueue a new production job
 * GET  /jobs/:jobId — poll job status
 * GET  /videos/:jobId/output.mp4 — serve completed video
 */

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const FormData = require("form-data");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;
const OUTPUT_DIR = process.env.OUTPUT_DIR || "/root/contentforge-output";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// In-memory job store
const jobs = new Map();

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function jobDir(jobId) {
  return path.join(OUTPUT_DIR, jobId);
}

function updateJob(jobId, patch) {
  const job = jobs.get(jobId);
  if (job) jobs.set(jobId, { ...job, ...patch });
}

/** Generate voiceover audio via ElevenLabs TTS */
async function generateVoiceover(text, voiceId, outPath) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error: ${res.status} ${err}`);
  }
  const buffer = await res.buffer();
  fs.writeFileSync(outPath, buffer);
}

/** Generate image via DALL-E 3 and save as PNG */
async function generateImage(prompt, outPath) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1792x1024",
      response_format: "url",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DALL-E error: ${res.status} ${err}`);
  }
  const data = await res.json();
  const imageUrl = data.data[0].url;

  // Download image
  const imgRes = await fetch(imageUrl);
  const buffer = await imgRes.buffer();
  fs.writeFileSync(outPath, buffer);
}

/** Build a video from a single image + audio clip using ffmpeg */
function buildSegmentVideo(imagePath, audioPath, outPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .inputOptions(["-loop 1"])
      .input(audioPath)
      .outputOptions([
        "-c:v libx264",
        "-tune stillimage",
        "-c:a aac",
        "-b:a 192k",
        "-pix_fmt yuv420p",
        "-shortest",
        "-vf scale=1920:1080",
      ])
      .output(outPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
}

/** Concatenate multiple video clips into one output file */
function concatenateVideos(clipPaths, outPath) {
  return new Promise((resolve, reject) => {
    const listFile = outPath + ".list.txt";
    const content = clipPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n");
    fs.writeFileSync(listFile, content);

    ffmpeg()
      .input(listFile)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .output(outPath)
      .on("end", () => {
        fs.unlinkSync(listFile);
        resolve();
      })
      .on("error", reject)
      .run();
  });
}

// ──────────────────────────────────────────────
// Storytelling pipeline: segments → video
// ──────────────────────────────────────────────

async function runStorytellingPipeline(job) {
  const { jobId, segments, voiceId } = job;
  const dir = jobDir(jobId);
  fs.mkdirSync(dir, { recursive: true });

  const totalSteps = segments.length * 2 + 1; // audio + image per segment, concat
  let completed = 0;

  function tick() {
    completed++;
    updateJob(jobId, {
      progress: Math.round(10 + (completed / totalSteps) * 85),
    });
  }

  const clipPaths = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const audioPath = path.join(dir, `seg${i}.mp3`);
    const imagePath = path.join(dir, `seg${i}.png`);
    const clipPath = path.join(dir, `clip${i}.mp4`);

    // Generate voiceover
    await generateVoiceover(seg.text, voiceId, audioPath);
    tick();

    // Generate image
    await generateImage(seg.imagePrompt, imagePath);
    tick();

    // Combine into clip
    await buildSegmentVideo(imagePath, audioPath, clipPath);
    clipPaths.push(clipPath);
  }

  // Concatenate all clips
  const outputPath = path.join(dir, "output.mp4");
  await concatenateVideos(clipPaths, outputPath);
  tick();

  updateJob(jobId, { status: "done", progress: 100 });
}

// ──────────────────────────────────────────────
// Existing Reklame pipeline (buildDynamicConfig)
// ──────────────────────────────────────────────

async function runReklamePipeline(job) {
  const { jobId, service, headline, bodyCopy, voiceId, cta } = job;
  const dir = jobDir(jobId);
  fs.mkdirSync(dir, { recursive: true });

  const config = buildDynamicConfig({ service, headline, bodyCopy, voiceId, cta });

  // Delegate to existing render logic
  await renderFromConfig(jobId, config, dir);

  updateJob(jobId, { status: "done", progress: 100 });
}

/**
 * Builds a render configuration object for the reklame pipeline.
 * Reads backgroundMusic setting from a per-service config file if present.
 */
function buildDynamicConfig({ service, headline, bodyCopy, voiceId, cta }) {
  const configPath = path.join(OUTPUT_DIR, "config", `${service}.json`);
  let serviceConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      serviceConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
      // ignore malformed config
    }
  }

  return {
    service,
    headline,
    bodyCopy,
    voiceId,
    cta,
    backgroundMusic: serviceConfig.backgroundMusic ?? "upbeat",
    brand: serviceConfig.brand ?? service,
  };
}

/** Placeholder — replace with the actual render implementation on the droplet. */
async function renderFromConfig(jobId, config, dir) {
  // The production droplet has the full render implementation.
  // This stub simulates progress for local development.
  for (let p = 10; p <= 90; p += 10) {
    await new Promise((r) => setTimeout(r, 500));
    updateJob(jobId, { progress: p });
  }
  const outputPath = path.join(dir, "output.mp4");
  if (!fs.existsSync(outputPath)) {
    fs.writeFileSync(outputPath, ""); // placeholder
  }
}

// ──────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────

app.post("/jobs", async (req, res) => {
  const { jobId, campaignId, service, headline, bodyCopy, voiceId, cta, segments } =
    req.body;

  if (!jobId || !service) {
    return res.status(400).json({ error: "Missing jobId or service" });
  }

  jobs.set(jobId, {
    jobId,
    campaignId,
    service,
    headline,
    bodyCopy,
    voiceId,
    cta,
    segments,
    status: "queued",
    progress: 5,
    createdAt: Date.now(),
  });

  res.json({ jobId, status: "queued" });

  // Run pipeline asynchronously
  (async () => {
    try {
      updateJob(jobId, { status: "processing", progress: 10 });

      if (Array.isArray(segments) && segments.length > 0) {
        await runStorytellingPipeline(jobs.get(jobId));
      } else {
        await runReklamePipeline(jobs.get(jobId));
      }
    } catch (err) {
      console.error(`[job ${jobId}] Pipeline failed:`, err);
      updateJob(jobId, { status: "failed", progress: 0, error: err.message });
    }
  })();
});

app.get("/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.json({ jobId: req.params.jobId, status: "not_found" });
  res.json({ jobId: job.jobId, status: job.status, progress: job.progress });
});

app.get("/videos/:jobId/output.mp4", (req, res) => {
  const filePath = path.join(jobDir(req.params.jobId), "output.mp4");
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Video not found" });
  }
  res.setHeader("Content-Type", "video/mp4");
  fs.createReadStream(filePath).pipe(res);
});

// Legacy flat path (older clients)
app.get("/videos/:jobId.mp4", (req, res) => {
  const filePath = path.join(jobDir(req.params.jobId), "output.mp4");
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Video not found" });
  }
  res.setHeader("Content-Type", "video/mp4");
  fs.createReadStream(filePath).pipe(res);
});

app.listen(PORT, () => {
  console.log(`ContentForge job-queue listening on port ${PORT}`);
});
