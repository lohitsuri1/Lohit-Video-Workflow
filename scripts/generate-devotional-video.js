/**
 * generate-devotional-video.js
 *
 * Downloads royalty-free Radha-Krishna devotional images and audio from
 * multiple public sources, then stitches them into a 15-minute video.
 *
 * Image sources (tried in order):
 *   1. Wikimedia Commons  – public-domain paintings via the MediaWiki API
 *   2. Metropolitan Museum of Art Open API – public-domain Indian/Asian art
 *   3. ffmpeg colour placeholders          – local fallback, no network needed
 *
 * Audio sources (tried in order):
 *   1. Internet Archive (archive.org) – CC/public-domain devotional music
 *   2. ffmpeg 432 Hz harmonic synthesis – local fallback, no network needed
 *
 * Folder layout (created automatically):
 *   library/assets/devotion/radha-krishna/images/  – downloaded images
 *   library/assets/devotion/radha-krishna/music/   – downloaded/generated audio
 *   library/videos/radha-krishna-15min.mp4          – final video
 *
 * No external API keys are required.
 *
 * Usage:
 *   node scripts/generate-devotional-video.js
 */

import fs from 'fs';
import https from 'https';
import http from 'http';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

// ── Configuration ────────────────────────────────────────────────────────────

const THEME = 'devotion';
const GOD_NAME = 'radha-krishna';
const BASE_ASSETS = path.join('library', 'assets', THEME, GOD_NAME);
const IMAGES_DIR = path.join(BASE_ASSETS, 'images');
const MUSIC_DIR = path.join(BASE_ASSETS, 'music');
const OUTPUT_DIR = path.join('library', 'videos');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'radha-krishna-15min.mp4');

const VIDEO_DURATION_SECS = 900; // 15 minutes
const SECONDS_PER_IMAGE = 60;    // each image is displayed for 60 seconds
const NUM_IMAGES = Math.ceil(VIDEO_DURATION_SECS / SECONDS_PER_IMAGE); // 15
const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const FPS = 25;

// Network timeouts
const SEARCH_TIMEOUT_MS = 20_000;
const INFO_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;

// Ken-Burns animation parameters
const ZOOM_RATE = 0.0005;
const MAX_ZOOM = 1.2;

// Fallback colours used when an image cannot be downloaded (saffron palette)
const FALLBACK_COLORS = [
    '0xFF7B00', '0xFF9500', '0xFFD700', '0xB5451B',
    '0x8B0000', '0x4B0082', '0x800080', '0xFF1493',
    '0xFF6347', '0xFFAA00', '0xCC5500', '0xDC143C',
    '0xC71585', '0x9400D3', '0xFF8C00',
];

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Download a URL to destPath, following up to maxRedirects redirects. */
function downloadFile(url, destPath, maxRedirects = 8) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        const protocol = url.startsWith('https://') ? https : http;
        const req = protocol.get(url, { timeout: DOWNLOAD_TIMEOUT_MS }, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode)) {
                const loc = res.headers.location;
                res.resume();
                downloadFile(loc, destPath, maxRedirects - 1).then(resolve).catch(reject);
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

/** Run ffmpeg with the supplied argument array.  Throws on non-zero exit. */
function runFFmpeg(args) {
    const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
    if (result.status !== 0) {
        throw new Error(`ffmpeg exited with code ${result.status}. ` +
            'Ensure ffmpeg is installed (apt-get install -y ffmpeg).');
    }
}

// ── Step 1: Collect images from multiple royalty-free sources ─────────────────

/** Source A: Wikimedia Commons – returns as many image paths as it can find. */
async function fetchWikimediaImages(targetCount) {
    console.log(`  🌐  Wikimedia Commons (target: ${targetCount} images)…`);

    const searchQueries = [
        'Radha Krishna painting',
        'Radha Krishna artwork Hindu',
        'Krishna flute painting',
        'Vrindavan Krishna devotional art',
    ];

    const fileNames = new Set();
    for (const query of searchQueries) {
        const apiUrl =
            'https://commons.wikimedia.org/w/api.php?action=query&list=search' +
            `&srsearch=${encodeURIComponent(query)}&srnamespace=6&srlimit=10&format=json`;
        try {
            const res = await fetch(apiUrl, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
            const data = await res.json();
            for (const item of data.query?.search ?? []) {
                if (/\.(jpe?g|png)$/i.test(item.title)) fileNames.add(item.title);
            }
        } catch (err) {
            console.warn(`    ⚠  Search "${query}" failed: ${err.message}`);
        }
    }

    const candidates = [...fileNames].slice(0, targetCount + 5);
    const downloaded = [];
    let idx = 1;

    for (const title of candidates) {
        if (downloaded.length >= targetCount) break;
        const infoUrl =
            'https://commons.wikimedia.org/w/api.php?action=query' +
            `&titles=${encodeURIComponent(title)}&prop=imageinfo` +
            `&iiprop=url&iiurlwidth=${TARGET_WIDTH}&format=json`;
        try {
            const res = await fetch(infoUrl, { signal: AbortSignal.timeout(INFO_TIMEOUT_MS) });
            const data = await res.json();
            const page = Object.values(data.query?.pages ?? {})[0];
            const imageUrl = page?.imageinfo?.[0]?.thumburl ?? page?.imageinfo?.[0]?.url;
            if (!imageUrl) continue;

            const ext = path.extname(new URL(imageUrl).pathname).toLowerCase() || '.jpg';
            const destPath = path.join(IMAGES_DIR, `wm-${String(idx).padStart(2, '0')}${ext}`);
            console.log(`    ⬇  wm-${String(idx).padStart(2, '0')}${ext}`);
            await downloadFile(imageUrl, destPath);
            downloaded.push(destPath);
            idx++;
        } catch (err) {
            console.warn(`    ⚠  Skipping "${title}": ${err.message}`);
        }
    }
    console.log(`    ✔  Wikimedia: ${downloaded.length} image(s)`);
    return downloaded;
}

/** Source B: Metropolitan Museum of Art Open API – public-domain Asian/Indian art. */
async function fetchMetMuseumImages(targetCount) {
    console.log(`  🏛   Metropolitan Museum of Art API (target: ${targetCount} images)…`);
    const downloaded = [];

    // Department 6 = Asian Art (includes South Asian/Indian paintings)
    const searchUrl =
        'https://collectionapi.metmuseum.org/public/collection/v1/search?' +
        'q=krishna+radha&isPublicDomain=true&departmentId=6';
    try {
        const res = await fetch(searchUrl, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
        const data = await res.json();
        const objectIDs = (data.objectIDs ?? []).slice(0, targetCount + 10);
        console.log(`    Found ${objectIDs.length} candidate objects`);

        let idx = 1;
        for (const id of objectIDs) {
            if (downloaded.length >= targetCount) break;
            try {
                const objRes = await fetch(
                    `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
                    { signal: AbortSignal.timeout(INFO_TIMEOUT_MS) }
                );
                const obj = await objRes.json();
                const imageUrl = obj.primaryImage || obj.primaryImageSmall;
                if (!imageUrl) continue;

                const ext = path.extname(new URL(imageUrl).pathname).toLowerCase() || '.jpg';
                const destPath = path.join(IMAGES_DIR, `met-${String(idx).padStart(2, '0')}${ext}`);
                const title = (obj.title ?? 'Untitled').slice(0, 40);
                console.log(`    ⬇  met-${String(idx).padStart(2, '0')}${ext}  "${title}"`);
                await downloadFile(imageUrl, destPath);
                downloaded.push(destPath);
                idx++;
            } catch (err) {
                console.warn(`    ⚠  Met object ${id}: ${err.message}`);
            }
        }
    } catch (err) {
        console.warn(`    ⚠  Met Museum search failed: ${err.message}`);
    }
    console.log(`    ✔  Met Museum: ${downloaded.length} image(s)`);
    return downloaded;
}

/**
 * Orchestrator: collect NUM_IMAGES images from all sources,
 * filling any gap with ffmpeg colour placeholders.
 */
async function collectImages() {
    console.log('\n📷  Collecting Radha-Krishna images from royalty-free sources…');

    // Try Wikimedia first
    const wikimediaImages = await fetchWikimediaImages(NUM_IMAGES);
    let allImages = [...wikimediaImages];

    // Fill remaining slots from Met Museum
    if (allImages.length < NUM_IMAGES) {
        const metImages = await fetchMetMuseumImages(NUM_IMAGES - allImages.length);
        allImages = [...allImages, ...metImages];
    }

    // Fill any remaining with ffmpeg colour placeholders
    let idx = allImages.length + 1;
    while (allImages.length < NUM_IMAGES) {
        const color = FALLBACK_COLORS[(idx - 1) % FALLBACK_COLORS.length];
        const destPath = path.join(IMAGES_DIR, `placeholder-${String(idx).padStart(2, '0')}.jpg`);
        console.log(`  🎨  [${idx}/${NUM_IMAGES}] Colour placeholder (${color})`);
        runFFmpeg([
            '-y', '-f', 'lavfi',
            '-i', `color=c=${color}:size=${TARGET_WIDTH}x${TARGET_HEIGHT}:rate=1`,
            '-frames:v', '1', destPath,
        ]);
        allImages.push(destPath);
        idx++;
    }

    console.log(`  ✅  ${allImages.length} images ready in ${IMAGES_DIR}`);
    return allImages;
}

// ── Step 2: Obtain background music from royalty-free sources ─────────────────

/**
 * Source A: Internet Archive – searches for CC/public-domain devotional music,
 * downloads the first suitable audio file, and loops it to VIDEO_DURATION_SECS.
 * Returns true on success, false if all candidates failed.
 */
async function fetchInternetArchiveAudio(destPath) {
    console.log('  🌐  Internet Archive (CC/public-domain devotional music)…');
    const searchParams = new URLSearchParams({
        q: 'subject:dhyana OR subject:bhajan OR subject:dhrupad OR krishna devotional',
        mediatype: 'audio',
        'fl[]': 'identifier,title',
        rows: '10',
        output: 'json',
    });
    const searchUrl = `https://archive.org/advancedsearch.php?${searchParams}`;
    let docs = [];
    try {
        const res = await fetch(searchUrl, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
        const data = await res.json();
        docs = data.response?.docs ?? [];
        console.log(`    Found ${docs.length} candidate item(s)`);
    } catch (err) {
        console.warn(`    ⚠  Internet Archive search failed: ${err.message}`);
        return false;
    }

    const tmpAudio = path.join(MUSIC_DIR, '_download_tmp');

    for (const doc of docs) {
        try {
            const filesRes = await fetch(
                `https://archive.org/metadata/${doc.identifier}/files`,
                { signal: AbortSignal.timeout(INFO_TIMEOUT_MS) }
            );
            const filesData = await filesRes.json();

            // Pick the smallest MP3/OGG under 40 MB to keep CI fast
            const audioFile = (filesData.result ?? [])
                .filter(f => /\.(mp3|ogg)$/i.test(f.name) && parseInt(f.size ?? '0', 10) < 40_000_000)
                .reduce((smallest, f) =>
                    !smallest || parseInt(f.size ?? '0', 10) < parseInt(smallest.size ?? '0', 10) ? f : smallest
                , null);
            if (!audioFile) continue;

            const audioUrl =
                `https://archive.org/download/${doc.identifier}/` +
                encodeURIComponent(audioFile.name);
            const sizeMB = (parseInt(audioFile.size ?? '0', 10) / 1024 / 1024).toFixed(1);
            console.log(`    ⬇  "${doc.title ?? doc.identifier}" – ${audioFile.name} (${sizeMB} MB)`);
            await downloadFile(audioUrl, tmpAudio);

            // Loop the downloaded audio to the full video duration
            console.log(`    🔁  Looping to ${VIDEO_DURATION_SECS}s…`);
            runFFmpeg([
                '-y', '-stream_loop', '-1', '-i', tmpAudio,
                '-t', String(VIDEO_DURATION_SECS),
                '-c:a', 'aac', '-b:a', '128k',
                destPath,
            ]);
            fs.unlinkSync(tmpAudio);
            console.log('    ✔  Internet Archive audio ready');
            return true;
        } catch (err) {
            console.warn(`    ⚠  ${doc.identifier}: ${err.message}`);
            if (fs.existsSync(tmpAudio)) fs.unlinkSync(tmpAudio);
        }
    }
    return false;
}

/** Source B (fallback): synthesise a 432 Hz harmonic ambient track with ffmpeg. */
function synthesizeAmbientAudio(destPath) {
    console.log('  🎹  Synthesising 432 Hz devotional ambient audio with ffmpeg…');
    const overtones = [
        '0.25*sin(2*PI*432*t)',   // A4 root (432 Hz)
        '0.15*sin(2*PI*540*t)',   // C#5 major third
        '0.12*sin(2*PI*648*t)',   // E5 fifth
        '0.08*sin(2*PI*864*t)',   // A5 octave
        '0.05*sin(2*PI*1080*t)',  // C#6 higher overtone
        '0.04*sin(2*PI*216*t)',   // A3 sub-octave
    ].join('+');
    runFFmpeg([
        '-y', '-f', 'lavfi',
        '-i', `aevalsrc=${overtones}:s=44100:c=stereo`,
        '-t', String(VIDEO_DURATION_SECS),
        '-c:a', 'aac', '-b:a', '128k',
        destPath,
    ]);
}

/** Orchestrator: try Internet Archive first, fall back to ffmpeg synthesis. */
async function collectAudio() {
    const musicPath = path.join(MUSIC_DIR, 'om-devotional-ambient.aac');
    if (fs.existsSync(musicPath)) {
        console.log(`\n🎵  Reusing cached audio: ${musicPath}`);
        return musicPath;
    }

    console.log('\n🎵  Obtaining royalty-free background music…');

    const iaSuccess = await fetchInternetArchiveAudio(musicPath);
    if (!iaSuccess) {
        console.warn('  ⚠  Internet Archive unavailable; falling back to local synthesis.');
        synthesizeAmbientAudio(musicPath);
    }

    console.log(`  ✅  Background audio ready: ${musicPath}`);
    return musicPath;
}

// ── Step 3: Build the 15-minute video ────────────────────────────────────────

async function buildVideo(imagePaths, musicPath) {
    console.log('\n🎬  Building 15-minute Radha-Krishna devotional video…');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devotional-video-'));
    const segPaths = [];

    try {
        // Animate each image as a 60-second Ken-Burns segment
        for (let i = 0; i < imagePaths.length; i++) {
            const segPath = path.join(tmpDir, `seg-${String(i).padStart(3, '0')}.mp4`);
            const totalFrames = SECONDS_PER_IMAGE * FPS;
            // Alternate zoom-in / zoom-out for visual variety
            const zoomExpr = i % 2 === 0
                ? `min(zoom+${ZOOM_RATE},${MAX_ZOOM})`
                : `if(lte(zoom,1.0),${MAX_ZOOM},max(zoom-${ZOOM_RATE},1.0))`;
            const vf =
                `zoompan=z='${zoomExpr}':d=${totalFrames}` +
                `:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` +
                `,scale=${TARGET_WIDTH}:${TARGET_HEIGHT},fps=${FPS}`;

            console.log(`  🖼  Animating image ${i + 1}/${imagePaths.length}: ${path.basename(imagePaths[i])}`);
            runFFmpeg([
                '-y', '-loop', '1', '-i', imagePaths[i],
                '-vf', vf,
                '-t', String(SECONDS_PER_IMAGE),
                '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'fast',
                segPath,
            ]);
            segPaths.push(segPath);
        }

        // Concatenate all segments into a silent video
        const concatList = path.join(tmpDir, 'concat.txt');
        fs.writeFileSync(concatList, segPaths.map(p => `file '${p}'`).join('\n'));
        const silentVideo = path.join(tmpDir, 'silent.mp4');
        console.log('  🔗  Concatenating segments…');
        runFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', silentVideo]);

        // Mux silent video with background music
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
    console.log(`\n✅  Video saved: ${OUTPUT_FILE} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    return OUTPUT_FILE;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('🙏  Radha-Krishna Devotional Video Generator');
    console.log('==============================================');
    console.log(`Theme    : ${THEME}`);
    console.log(`Subject  : ${GOD_NAME}`);
    console.log(`Duration : ${VIDEO_DURATION_SECS / 60} minutes`);
    console.log(`Images   : ${NUM_IMAGES} (${SECONDS_PER_IMAGE}s each)\n`);

    // Ensure all output directories exist up front
    for (const dir of [IMAGES_DIR, MUSIC_DIR, OUTPUT_DIR]) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const imagePaths = await collectImages();
    const musicPath = await collectAudio();
    await buildVideo(imagePaths, musicPath);

    console.log('\n🙏  Generation complete!');
    console.log(`📁  Assets : ${BASE_ASSETS}`);
    console.log(`🎥  Video  : ${OUTPUT_FILE}`);
}

main().catch((err) => {
    console.error('\n❌  Error:', err.message);
    process.exit(1);
});
