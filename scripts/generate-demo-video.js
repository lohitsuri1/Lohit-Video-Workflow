/**
 * generate-demo-video.js
 *
 * Standalone script to generate a devotional demo video using:
 *   1. Gemini image generation API  → library/images/demo_devotional.png
 *   2. Kling V1.6 image-to-video API → library/videos/demo_devotional.mp4
 *
 * Usage:
 *   npm run demo:video
 *   node scripts/generate-demo-video.js
 *
 * Required environment variables (set in .env):
 *   GEMINI_API_KEY     – Google Gemini API key
 *   KLING_ACCESS_KEY   – Kling AI access key
 *   KLING_SECRET_KEY   – Kling AI secret key
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEVOTIONAL_PROMPT =
  'Lord Ganesha in golden light, divine temple background, cinematic 4K, soft ethereal glow, ultra realistic';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const KLING_ACCESS_KEY = process.env.KLING_ACCESS_KEY;
const KLING_SECRET_KEY = process.env.KLING_SECRET_KEY;

const KLING_BASE_URL = 'https://api-singapore.klingai.com';

// Output paths
const OUTPUT_IMAGE = path.join(ROOT_DIR, 'library', 'images', 'demo_devotional.png');
const OUTPUT_VIDEO = path.join(ROOT_DIR, 'library', 'videos', 'demo_devotional.mp4');

// Cost estimate constants (Kling V1.6, 5-second clip, standard mode)
const COST_ESTIMATE_LOW = 0.01;
const COST_ESTIMATE_HIGH = 0.025;

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check that all required API keys are present.
 * Prints a helpful message and exits if any are missing.
 */
function validateKeys() {
  const missing = [];
  if (!GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
  if (!KLING_ACCESS_KEY) missing.push('KLING_ACCESS_KEY');
  if (!KLING_SECRET_KEY) missing.push('KLING_SECRET_KEY');

  if (missing.length > 0) {
    console.error('\n❌  Missing required API keys:\n');
    missing.forEach((key) => console.error(`   • ${key}`));
    console.error(`
How to fix:
  1. Copy .env.example to .env (if it exists), or create a new .env file in the project root.
  2. Add the following keys:

     GEMINI_API_KEY=<your Google Gemini API key>
       → Get one at: https://aistudio.google.com/app/apikey

     KLING_ACCESS_KEY=<your Kling AI access key>
     KLING_SECRET_KEY=<your Kling AI secret key>
       → Get them at: https://klingai.com/dev (Developer Console)

  3. Re-run:  npm run demo:video
`);
    process.exit(1);
  }
}

// ============================================================================
// KLING JWT AUTHENTICATION
// ============================================================================

/**
 * Generate a short-lived JWT for Kling AI API requests (valid 30 minutes).
 */
function generateKlingJWT(accessKey, secretKey) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: accessKey,
    exp: now + 1800, // 30 minutes (1800 seconds)
    nbf: now - 5,    // allow 5 s clock skew
  };

  const b64url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

  const header64 = b64url(header);
  const payload64 = b64url(payload);
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(`${header64}.${payload64}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${header64}.${payload64}.${signature}`;
}

// ============================================================================
// STEP 1 – GENERATE IMAGE WITH GEMINI
// ============================================================================

/**
 * Call the Gemini image generation API and return a raw PNG buffer.
 *
 * Uses the `gemini-2.0-flash-preview-image-generation` model which supports
 * the `responseModalities: ['IMAGE', 'TEXT']` response mode.
 */
async function generateGeminiImage(prompt) {
  console.log('\n🎨  Generating devotional image with Gemini…');
  console.log(`    Prompt: "${prompt}"`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();

  // Extract the first image part from the response
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith('image/'));

  if (!imagePart) {
    throw new Error(
      'Gemini did not return an image. Response: ' + JSON.stringify(data).slice(0, 500)
    );
  }

  const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
  console.log(`    ✅  Image generated (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
  return imageBuffer;
}

// ============================================================================
// STEP 2 – ANIMATE IMAGE WITH KLING V1.6
// ============================================================================

/**
 * Submit an image-to-video task to Kling V1.6 and return the task ID.
 */
async function createKlingVideoTask(imageBase64, prompt) {
  console.log('\n🎬  Submitting image-to-video task to Kling V1.6…');

  const token = generateKlingJWT(KLING_ACCESS_KEY, KLING_SECRET_KEY);

  const body = {
    model_name: 'kling-v1-6',
    mode: 'std',
    duration: '5',
    aspect_ratio: '16:9',
    prompt,
    image: imageBase64,
  };

  const response = await fetch(`${KLING_BASE_URL}/v1/videos/image2video`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Kling API error (${response.status}): ${errText}`);
  }

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(`Kling API error: ${result.message || 'Unknown error'}`);
  }

  const taskId = result.data?.task_id;
  if (!taskId) {
    throw new Error('No task ID returned from Kling API');
  }

  console.log(`    ✅  Task created: ${taskId}`);
  return taskId;
}

/**
 * Poll the Kling task until it succeeds or fails, then return the video URL.
 * Times out after 5 minutes.
 */
async function pollKlingTask(taskId, maxWaitMs = 300000) { // Default: 5 minutes (300000ms)
  console.log(`\n⏳  Polling Kling task ${taskId} for completion…`);

  const token = generateKlingJWT(KLING_ACCESS_KEY, KLING_SECRET_KEY);
  const pollInterval = 5000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const response = await fetch(
      `${KLING_BASE_URL}/v1/videos/image2video/${taskId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Kling poll error (${response.status}): ${errText}`);
    }

    const result = await response.json();

    if (result.code !== 0) {
      throw new Error(`Kling API error: ${result.message || 'Unknown error'}`);
    }

    const status = result.data?.task_status;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`    Status: ${status}  (${elapsed}s elapsed)`);

    if (status === 'succeed') {
      const videoUrl = result.data?.task_result?.videos?.[0]?.url;
      if (!videoUrl) {
        throw new Error('No video URL in successful Kling response');
      }
      console.log(`    ✅  Video ready: ${videoUrl}`);
      return videoUrl;
    }

    if (status === 'failed') {
      throw new Error(
        `Kling generation failed: ${result.data?.task_status_msg || 'Unknown error'}`
      );
    }
  }

  throw new Error('Kling generation timed out after 5 minutes');
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Download a URL to a local file path and return the number of bytes written.
 */
async function downloadFile(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file (${response.status}): ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return buffer.length;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  TwitCanva – Devotional Demo Video Generator');
  console.log('═══════════════════════════════════════════════════');

  // Validate API keys first
  validateKeys();

  // Ensure output directories exist
  ensureDir(path.dirname(OUTPUT_IMAGE));
  ensureDir(path.dirname(OUTPUT_VIDEO));

  // ── Step 1: Generate image with Gemini ──────────────────────────────────
  const imageBuffer = await generateGeminiImage(DEVOTIONAL_PROMPT);

  // Save the generated image
  fs.writeFileSync(OUTPUT_IMAGE, imageBuffer);
  console.log(`    💾  Saved image → ${OUTPUT_IMAGE}`);

  // Encode image as raw base64 for Kling
  const imageBase64 = imageBuffer.toString('base64');

  // ── Step 2: Animate with Kling V1.6 ─────────────────────────────────────
  const taskId = await createKlingVideoTask(imageBase64, DEVOTIONAL_PROMPT);
  const videoUrl = await pollKlingTask(taskId);

  // Download and save the video
  console.log('\n💾  Downloading video…');
  const videoBytes = await downloadFile(videoUrl, OUTPUT_VIDEO);
  console.log(`    Saved video  → ${OUTPUT_VIDEO}  (${(videoBytes / 1024).toFixed(1)} KB)`);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  ✅  Demo video generation complete!');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Image : ${OUTPUT_IMAGE}`);
  console.log(`  Video : ${OUTPUT_VIDEO}`);
  console.log(
    `  Cost estimate: $${COST_ESTIMATE_LOW}–$${COST_ESTIMATE_HIGH} (Kling V1.6, 5-sec, standard mode)`
  );
  console.log('═══════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\n❌  Script failed:', err.message);
  process.exit(1);
});
