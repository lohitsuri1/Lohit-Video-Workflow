/**
 * generate-sample-video.js
 *
 * Generates a SHORT quality-test video (2 minutes, 3 slides) using the same
 * pipeline, effects, and asset sources as the full 15-minute script.
 *
 * Purpose: quickly validate image quality, Ken-Burns animation, fade
 * transitions, warm golden EQ and audio before committing to the 15-min run.
 *
 * Image sources (tried in order):
 *   1. Wikimedia Commons             – public-domain paintings (User-Agent required)
 *   2. Metropolitan Museum of Art    – public-domain Indian devotional art
 *   3. Cleveland Museum of Art       – public-domain Hindu/Asian paintings
 *   4. ffmpeg saffron colour slides  – local fallback, no network needed
 *
 * Audio: ffmpeg 432 Hz harmonic synthesis (instant, no download needed).
 *
 * Output:
 *   library/videos/radha-krishna-sample-2min.mp4   (≈ 8–15 MB)
 *
 * Usage:
 *   node scripts/generate-sample-video.js
 */

import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

// ── Configuration ─────────────────────────────────────────────────────────────

const THEME    = 'devotion';
const GOD_NAME = 'radha-krishna';
const BASE_ASSETS  = path.join('library', 'assets', THEME, GOD_NAME);
const IMAGES_DIR   = path.join(BASE_ASSETS, 'images');
const MUSIC_DIR    = path.join(BASE_ASSETS, 'music');
const OUTPUT_DIR   = path.join('library', 'videos');
const OUTPUT_FILE  = path.join(OUTPUT_DIR, 'radha-krishna-sample-2min.mp4');

// Sample: 3 slides × 40 seconds = 2 minutes
const NUM_IMAGES        = 3;
const SECONDS_PER_IMAGE = 40;
const VIDEO_DURATION_SECS = NUM_IMAGES * SECONDS_PER_IMAGE; // 120 s

const TARGET_WIDTH  = 1280;
const TARGET_HEIGHT = 720;
const FPS           = 25;

// Ken-Burns zoom
const ZOOM_RATE = 0.0005;
const MAX_ZOOM  = 1.2;

// Network timeouts
const SEARCH_TIMEOUT_MS   = 20_000;
const INFO_TIMEOUT_MS     = 15_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;

// User-Agent required by Wikimedia bot policy
const USER_AGENT = 'DevotionalVideoBot/1.0 (github.com/lohitsuri1/Lohit-Video-Workflow)';

// Saffron palette for local fallback slides
const FALLBACK_COLORS = ['0xFF7B00', '0xFF9500', '0xFFD700'];

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Download a URL to destPath over HTTPS only. */
function downloadFile(url, destPath, maxRedirects = 8, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        if (!url.startsWith('https://')) {
            return reject(new Error(`[Security] Refusing non-HTTPS URL: ${url}`));
        }
        const req = https.get(url, {
            timeout: DOWNLOAD_TIMEOUT_MS,
            headers: { ...extraHeaders, 'User-Agent': USER_AGENT },
        }, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode)) {
                const loc = res.headers.location;
                res.resume();
                downloadFile(loc, destPath, maxRedirects - 1, extraHeaders).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            const file = fs.createWriteStream(destPath);
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
            file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
        });
        req.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
        req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout downloading ${url}`)); });
    });
}

/** Validate magic bytes. Deletes file and throws on mismatch. */
function validateFileHeader(filePath, type) {
    const fd  = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    const isJPEG = buf[0] === 0xFF && buf[1] === 0xD8;
    const isPNG  = buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG';
    const isWebP = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
    if (!(isJPEG || isPNG || isWebP)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
        throw new Error(
            `[Security] Unexpected file header for ${path.basename(filePath)} ` +
            `(got 0x${buf.slice(0, 4).toString('hex')})`
        );
    }
}

/** Run ffmpeg. Throws on non-zero exit. */
function runFFmpeg(args) {
    const result = spawnSync('ffmpeg', args, { stdio: 'pipe' });
    if (result.status !== 0) {
        const stderr = result.stderr?.toString().slice(-300) ?? '';
        throw new Error(`ffmpeg exited ${result.status}: ${stderr}`);
    }
}

// ── Step 1: Collect 3 sample images ───────────────────────────────────────────

async function fetchWikimediaImages(need) {
    console.log(`  🌐  Wikimedia Commons…`);
    const queries = ['Radha Krishna painting', 'Krishna flute painting'];
    const fileNames = new Set();
    for (const q of queries) {
        try {
            const url = 'https://commons.wikimedia.org/w/api.php?action=query&list=search' +
                `&srsearch=${encodeURIComponent(q)}&srnamespace=6&srlimit=8&format=json`;
            const res = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
            });
            const data = await res.json();
            for (const item of data.query?.search ?? []) {
                if (/\.(jpe?g|png)$/i.test(item.title)) fileNames.add(item.title);
            }
        } catch (e) { console.warn(`    ⚠  Search failed: ${e.message}`); }
    }

    const downloaded = [];
    let idx = 1;
    for (const title of [...fileNames].slice(0, need + 4)) {
        if (downloaded.length >= need) break;
        try {
            const infoUrl = 'https://commons.wikimedia.org/w/api.php?action=query' +
                `&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&iiurlwidth=${TARGET_WIDTH}&format=json`;
            const res = await fetch(infoUrl, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(INFO_TIMEOUT_MS),
            });
            const data = await res.json();
            const page     = Object.values(data.query?.pages ?? {})[0];
            const imageUrl = page?.imageinfo?.[0]?.thumburl ?? page?.imageinfo?.[0]?.url;
            if (!imageUrl) continue;
            const ext      = path.extname(new URL(imageUrl).pathname).toLowerCase() || '.jpg';
            const destPath = path.join(IMAGES_DIR, `sample-wm-${String(idx).padStart(2, '0')}${ext}`);
            console.log(`    ⬇  ${path.basename(destPath)}`);
            await downloadFile(imageUrl, destPath);
            validateFileHeader(destPath, 'image');
            downloaded.push(destPath);
            idx++;
        } catch (e) { console.warn(`    ⚠  Skipping "${title}": ${e.message}`); }
    }
    console.log(`    ✔  Wikimedia: ${downloaded.length}`);
    return downloaded;
}

async function fetchMetMuseumImages(need) {
    console.log(`  🏛   Met Museum…`);
    const downloaded = [];
    try {
        const searchRes = await fetch(
            'https://collectionapi.metmuseum.org/public/collection/v1/search?q=india+devotional+painting&isPublicDomain=true&hasImages=true',
            { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) }
        );
        const searchData = await searchRes.json();
        const ids = (searchData.objectIDs ?? []).slice(0, need + 8);
        let idx = 1;
        for (const id of ids) {
            if (downloaded.length >= need) break;
            try {
                const objRes  = await fetch(
                    `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
                    { signal: AbortSignal.timeout(INFO_TIMEOUT_MS) }
                );
                const obj      = await objRes.json();
                const imageUrl = obj.primaryImage || obj.primaryImageSmall;
                if (!imageUrl) continue;
                const ext      = path.extname(new URL(imageUrl).pathname).toLowerCase() || '.jpg';
                const destPath = path.join(IMAGES_DIR, `sample-met-${String(idx).padStart(2, '0')}${ext}`);
                const title    = (obj.title ?? 'Untitled').slice(0, 40);
                console.log(`    ⬇  ${path.basename(destPath)}  "${title}"`);
                await downloadFile(imageUrl, destPath);
                validateFileHeader(destPath, 'image');
                downloaded.push(destPath);
                idx++;
            } catch (e) { console.warn(`    ⚠  Met obj ${id}: ${e.message}`); }
        }
    } catch (e) { console.warn(`    ⚠  Met search failed: ${e.message}`); }
    console.log(`    ✔  Met Museum: ${downloaded.length}`);
    return downloaded;
}

async function fetchClevelandMuseumImages(need) {
    console.log(`  🏺  Cleveland Museum…`);
    const downloaded = [];
    try {
        const searchRes = await fetch(
            `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent('krishna OR radha OR vishnu OR shiva OR hindu')}&has_image=1&type=Painting&limit=${need + 6}`,
            { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) }
        );
        const data = await searchRes.json();
        let idx = 1;
        for (const art of data.data ?? []) {
            if (downloaded.length >= need) break;
            try {
                const imageUrl = art.images?.web?.url || art.images?.print?.url;
                if (!imageUrl) continue;
                const ext      = path.extname(new URL(imageUrl).pathname).toLowerCase() || '.jpg';
                const destPath = path.join(IMAGES_DIR, `sample-cma-${String(idx).padStart(2, '0')}${ext}`);
                const title    = (art.title ?? 'Untitled').slice(0, 40);
                console.log(`    ⬇  ${path.basename(destPath)}  "${title}"`);
                await downloadFile(imageUrl, destPath);
                validateFileHeader(destPath, 'image');
                downloaded.push(destPath);
                idx++;
            } catch (e) { console.warn(`    ⚠  CMA art ${art.id}: ${e.message}`); }
        }
    } catch (e) { console.warn(`    ⚠  CMA search failed: ${e.message}`); }
    console.log(`    ✔  Cleveland: ${downloaded.length}`);
    return downloaded;
}

async function collectSampleImages() {
    console.log('\n📷  Collecting sample images (need ' + NUM_IMAGES + ')…');
    let images = await fetchWikimediaImages(NUM_IMAGES);
    if (images.length < NUM_IMAGES) {
        const met = await fetchMetMuseumImages(NUM_IMAGES - images.length);
        images = [...images, ...met];
    }
    if (images.length < NUM_IMAGES) {
        const cma = await fetchClevelandMuseumImages(NUM_IMAGES - images.length);
        images = [...images, ...cma];
    }
    // Fill remaining with ffmpeg colour placeholders
    let idx = images.length + 1;
    while (images.length < NUM_IMAGES) {
        const color    = FALLBACK_COLORS[(idx - 1) % FALLBACK_COLORS.length];
        const destPath = path.join(IMAGES_DIR, `sample-placeholder-${idx}.jpg`);
        console.log(`  🎨  Colour placeholder (${color})`);
        runFFmpeg([
            '-y', '-f', 'lavfi',
            '-i', `color=c=${color}:size=${TARGET_WIDTH}x${TARGET_HEIGHT}:rate=1`,
            '-frames:v', '1', destPath,
        ]);
        images.push(destPath);
        idx++;
    }
    console.log(`  ✅  ${images.length} images ready`);
    return images;
}

// ── Step 2: Synthesize 2-minute ambient audio ─────────────────────────────────

function synthesizeSampleAudio(destPath) {
    console.log('\n🎵  Synthesizing 432 Hz ambient audio…');
    // 432 Hz root + harmonic overtones – same as full script
    const overtones = [
        '0.25*sin(2*PI*432*t)',
        '0.15*sin(2*PI*540*t)',
        '0.12*sin(2*PI*648*t)',
        '0.08*sin(2*PI*864*t)',
        '0.05*sin(2*PI*1080*t)',
        '0.04*sin(2*PI*216*t)',
    ].join('+');
    runFFmpeg([
        '-y', '-f', 'lavfi',
        '-i', `aevalsrc=${overtones}:s=44100:c=stereo`,
        '-t', String(VIDEO_DURATION_SECS),
        '-c:a', 'aac', '-b:a', '128k',
        destPath,
    ]);
    console.log('  ✅  Audio ready');
    return destPath;
}

// ── Step 3: Build the 2-minute sample video ───────────────────────────────────

async function buildSampleVideo(imagePaths, musicPath) {
    console.log('\n🎬  Building 2-minute sample video…');
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'sample-video-'));
    const segPaths = [];

    try {
        for (let i = 0; i < imagePaths.length; i++) {
            const segPath    = path.join(tmpDir, `seg-${String(i).padStart(2, '0')}.mp4`);
            const totalFrames = SECONDS_PER_IMAGE * FPS;

            // Alternate zoom-in / zoom-out
            const zoomExpr = i % 2 === 0
                ? `min(zoom+${ZOOM_RATE},${MAX_ZOOM})`
                : `if(lte(zoom,1.0),${MAX_ZOOM},max(zoom-${ZOOM_RATE},1.0))`;

            // Fade in + out + warm golden EQ – identical to full script
            const fadeOutStart = SECONDS_PER_IMAGE - 1;
            const vf =
                `zoompan=z='${zoomExpr}':d=${totalFrames}` +
                `:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` +
                `,scale=${TARGET_WIDTH}:${TARGET_HEIGHT},fps=${FPS}` +
                `,fade=t=in:st=0:d=1,fade=t=out:st=${fadeOutStart}:d=1` +
                `,eq=brightness=0.03:saturation=1.2:gamma_r=1.08:gamma_b=0.92`;

            console.log(`  🖼  Slide ${i + 1}/${imagePaths.length}: ${path.basename(imagePaths[i])}`);
            runFFmpeg([
                '-y', '-loop', '1', '-i', imagePaths[i],
                '-vf', vf,
                '-t', String(SECONDS_PER_IMAGE),
                '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'fast',
                segPath,
            ]);
            segPaths.push(segPath);
        }

        // Concatenate segments
        const concatList  = path.join(tmpDir, 'concat.txt');
        const silentVideo = path.join(tmpDir, 'silent.mp4');
        fs.writeFileSync(concatList, segPaths.map(p => `file '${p}'`).join('\n'));
        console.log('  🔗  Concatenating…');
        runFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', silentVideo]);

        // Mux with audio
        console.log('  🎵  Mixing audio…');
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        runFFmpeg([
            '-y', '-i', silentVideo, '-i', musicPath,
            '-c:v', 'copy', '-c:a', 'aac', '-shortest',
            OUTPUT_FILE,
        ]);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    const { size } = fs.statSync(OUTPUT_FILE);
    console.log(`\n✅  Sample video saved: ${OUTPUT_FILE} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    return OUTPUT_FILE;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('🙏  Radha-Krishna Sample Video Generator (Quality Test)');
    console.log('========================================================');
    console.log(`Slides   : ${NUM_IMAGES} × ${SECONDS_PER_IMAGE}s = ${VIDEO_DURATION_SECS / 60} min`);
    console.log(`Output   : ${OUTPUT_FILE}`);
    console.log(`Effects  : Ken-Burns zoom, fade in/out, warm golden EQ\n`);

    for (const dir of [IMAGES_DIR, MUSIC_DIR, OUTPUT_DIR]) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const imagePaths = await collectSampleImages();
    const musicPath  = synthesizeSampleAudio(path.join(MUSIC_DIR, 'sample-ambient.aac'));
    await buildSampleVideo(imagePaths, musicPath);

    console.log('\n🙏  Done!');
    console.log(`📁  Assets : ${BASE_ASSETS}`);
    console.log(`🎥  Video  : ${OUTPUT_FILE}`);
    console.log('\n💡  Tip: Review the video to check:');
    console.log('    • Image quality and relevance (devotional Hindu art)');
    console.log('    • Ken-Burns smooth zoom animation');
    console.log('    • 1-second black fade in at start of each slide, fade out at end');
    console.log('    • Warm golden colour grade (saturation, reds up, blues down)');
    console.log('    • 432 Hz harmonic ambient audio');
    console.log('\n    If satisfied, run the full 15-min version:');
    console.log('    node scripts/generate-devotional-video.js');
}

main().catch((err) => {
    console.error('\n❌  Error:', err.message);
    process.exit(1);
});
