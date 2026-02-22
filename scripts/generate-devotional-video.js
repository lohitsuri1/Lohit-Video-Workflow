/**
 * generate-devotional-video.js
 *
 * Downloads royalty-free Radha-Krishna devotional images and audio from
 * multiple public sources, then stitches them into a 15-minute meditation video.
 *
 * Image sources (tried in order, API-key sources skipped when key not set):
 *   1. Pixabay              – devotional illustrations  (PIXABAY_API_KEY  secret, free tier)
 *   2. Pexels               – spiritual photography     (PEXELS_API_KEY   secret, free tier)
 *   3. Wikimedia Commons    – public-domain paintings   (no key required)
 *   4. Metropolitan Museum  – public-domain Indian art  (no key required)
 *   5. Cleveland Museum     – public-domain Asian art   (no key required)
 *   6. OpenAI DALL-E 3      – AI-generated art, fills gaps (OPENAI_API_KEY secret, paid)
 *   7. ffmpeg colour placeholders – local fallback      (no key required)
 *
 * Audio sources (tried in order, API-key sources skipped when key not set):
 *   1. Freesound.org   – real meditation ambient sounds (FREESOUND_API_KEY secret, free tier)
 *   2. ccMixter        – Creative Commons music         (no key required)
 *   3. Internet Archive – CC/public-domain devotional   (no key required)
 *   4. ffmpeg 432 Hz harmonic synthesis – local fallback (no key required)
 *
 * Folder layout (created automatically):
 *   library/assets/devotion/radha-krishna/images/  – downloaded images
 *   library/assets/devotion/radha-krishna/music/   – downloaded/generated audio
 *   library/videos/radha-krishna-15min.mp4          – final video
 *
 * API keys are read from environment variables (set as GitHub Actions secrets).
 * All sources with no key degrade gracefully when keys are absent.
 *
 * Note on Kling AI: Kling AI is a video/image *generation* service (like Veo/Sora)
 * that creates content from text prompts — it has no searchable public image library
 * for download and requires paid API credits. It is not suitable as a royalty-free
 * asset source for this pipeline.
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

// Maximum audio file size to download (keep CI fast)
const MAX_AUDIO_FILE_SIZE_BYTES = 40_000_000; // 40 MB

// Ken-Burns animation parameters
const ZOOM_RATE = 0.0005;
const MAX_ZOOM = 1.2;

// Optional API keys – read from environment / GitHub Actions secrets.
// Each source is silently skipped when its key is not set.
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY ?? '';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY ?? '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const FREESOUND_API_KEY = process.env.FREESOUND_API_KEY ?? '';

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

/** Source C: Cleveland Museum of Art Open Access API – public-domain Asian/Indian art. */
async function fetchClevelandMuseumImages(targetCount) {
    console.log(`  🏺  Cleveland Museum of Art API (target: ${targetCount} images)…`);
    const downloaded = [];

    // Search for Indian/Hindu artworks (paintings only, must have an image)
    const searchUrl =
        'https://openaccess-api.clevelandart.org/api/artworks/?' +
        `q=${encodeURIComponent('krishna OR radha OR vishnu OR shiva OR hindu')}&has_image=1` +
        `&type=Painting&limit=${targetCount + 10}`;
    try {
        const res = await fetch(searchUrl, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
        const data = await res.json();
        const artworks = data.data ?? [];
        console.log(`    Found ${artworks.length} candidate artwork(s)`);

        let idx = 1;
        for (const art of artworks) {
            if (downloaded.length >= targetCount) break;
            try {
                const imageUrl = art.images?.web?.url || art.images?.print?.url;
                if (!imageUrl) continue;

                const ext = path.extname(new URL(imageUrl).pathname).toLowerCase() || '.jpg';
                const destPath = path.join(IMAGES_DIR, `cma-${String(idx).padStart(2, '0')}${ext}`);
                const title = (art.title ?? 'Untitled').slice(0, 40);
                console.log(`    ⬇  cma-${String(idx).padStart(2, '0')}${ext}  "${title}"`);
                await downloadFile(imageUrl, destPath);
                downloaded.push(destPath);
                idx++;
            } catch (err) {
                console.warn(`    ⚠  CMA artwork ${art.id}: ${err.message}`);
            }
        }
    } catch (err) {
        console.warn(`    ⚠  Cleveland Museum search failed: ${err.message}`);
    }
    console.log(`    ✔  Cleveland Museum: ${downloaded.length} image(s)`);
    return downloaded;
}

/** Source D: Pixabay – royalty-free devotional illustrations (requires PIXABAY_API_KEY). */
async function fetchPixabayImages(targetCount) {
    if (!PIXABAY_API_KEY) return [];
    console.log(`  🖼  Pixabay (target: ${targetCount} images)…`);
    const downloaded = [];

    const queries = ['krishna radha devotional', 'krishna flute spiritual', 'radha krishna temple art'];
    const seen = new Set();

    for (const q of queries) {
        if (seen.size >= targetCount + 5) break;
        const searchUrl =
            `https://pixabay.com/api/?key=${encodeURIComponent(PIXABAY_API_KEY)}` +
            `&q=${encodeURIComponent(q)}&image_type=illustration&per_page=20&safesearch=true`;
        try {
            const res = await fetch(searchUrl, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
            const data = await res.json();
            for (const hit of data.hits ?? []) {
                seen.add(JSON.stringify({ url: hit.webformatURL, id: hit.id }));
            }
        } catch (err) {
            console.warn(`    ⚠  Pixabay "${q}": ${err.message}`);
        }
    }

    let idx = 1;
    for (const itemStr of seen) {
        if (downloaded.length >= targetCount) break;
        const item = JSON.parse(itemStr);
        try {
            const destPath = path.join(IMAGES_DIR, `pixabay-${String(idx).padStart(2, '0')}.jpg`);
            console.log(`    ⬇  pixabay-${String(idx).padStart(2, '0')}.jpg (id:${item.id})`);
            await downloadFile(item.url, destPath);
            downloaded.push(destPath);
            idx++;
        } catch (err) {
            console.warn(`    ⚠  Pixabay id ${item.id}: ${err.message}`);
        }
    }
    console.log(`    ✔  Pixabay: ${downloaded.length} image(s)`);
    return downloaded;
}

/** Source E: Pexels – royalty-free spiritual photography (requires PEXELS_API_KEY). */
async function fetchPexelsImages(targetCount) {
    if (!PEXELS_API_KEY) return [];
    console.log(`  📸  Pexels (target: ${targetCount} images)…`);
    const downloaded = [];

    const queries = ['krishna devotional art', 'radha krishna painting', 'hindu temple meditation'];
    const seen = new Set();

    for (const q of queries) {
        if (seen.size >= targetCount + 5) break;
        try {
            const res = await fetch(
                `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=15&orientation=landscape`,
                { headers: { Authorization: PEXELS_API_KEY }, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) }
            );
            const data = await res.json();
            for (const photo of data.photos ?? []) {
                seen.add(JSON.stringify({ url: photo.src.large2x ?? photo.src.large, id: photo.id }));
            }
        } catch (err) {
            console.warn(`    ⚠  Pexels "${q}": ${err.message}`);
        }
    }

    let idx = 1;
    for (const itemStr of seen) {
        if (downloaded.length >= targetCount) break;
        const item = JSON.parse(itemStr);
        try {
            const destPath = path.join(IMAGES_DIR, `pexels-${String(idx).padStart(2, '0')}.jpg`);
            console.log(`    ⬇  pexels-${String(idx).padStart(2, '0')}.jpg (id:${item.id})`);
            await downloadFile(item.url, destPath);
            downloaded.push(destPath);
            idx++;
        } catch (err) {
            console.warn(`    ⚠  Pexels id ${item.id}: ${err.message}`);
        }
    }
    console.log(`    ✔  Pexels: ${downloaded.length} image(s)`);
    return downloaded;
}

/**
 * Source F: OpenAI DALL-E 3 – generates custom Radha-Krishna devotional art
 * (requires OPENAI_API_KEY; used last to fill remaining slots, ~$0.04/image).
 */
async function generateDallEImages(targetCount) {
    if (!OPENAI_API_KEY) return [];
    console.log(`  🤖  OpenAI DALL-E 3 (generating ${targetCount} custom devotional image(s))…`);
    const downloaded = [];

    // Five distinct painting styles rotated across the slides
    const prompts = [
        'Sacred painting of Radha and Krishna together in Vrindavan forest, traditional Rajasthani miniature painting style, warm golden hues, lotus flowers, peacocks, devotional meditative atmosphere',
        'Sri Krishna playing bansuri flute under a kadamba tree at twilight, traditional Pahari painting style, vivid jewel-toned colors, moonlit sky, divine luminous aura',
        'Radha Krishna Ras Lila dance scene, traditional Madhubani art style, intricate colorful floral patterns, joyful spiritual celebration, golden warm tones',
        'Lord Krishna with divine lotus and conch shell, traditional Tanjore painting style, embossed gold leaf background, jeweled crown, serene meditative expression',
        'Radha offering marigold garland to Krishna in garden, traditional Pichvai painting style, sacred cows, roses, spiritual devotion scene, soft saffron sunset light',
    ];

    let idx = 1;
    for (let i = 0; i < targetCount; i++) {
        const prompt = prompts[i % prompts.length];
        try {
            const res = await fetch('https://api.openai.com/v1/images/generations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
                body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1792x1024', quality: 'standard' }),
                signal: AbortSignal.timeout(90_000),
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error?.message ?? `HTTP ${res.status}`);
            }
            const data = await res.json();
            const imageUrl = data.data?.[0]?.url;
            if (!imageUrl) continue;

            const destPath = path.join(IMAGES_DIR, `dalle-${String(idx).padStart(2, '0')}.jpg`);
            console.log(`    ⬇  dalle-${String(idx).padStart(2, '0')}.jpg (style ${(i % prompts.length) + 1})`);
            await downloadFile(imageUrl, destPath);
            downloaded.push(destPath);
            idx++;
        } catch (err) {
            console.warn(`    ⚠  DALL-E 3 image ${i + 1}: ${err.message}`);
        }
    }
    console.log(`    ✔  DALL-E 3: ${downloaded.length} image(s)`);
    return downloaded;
}

/**
 * Orchestrator: collect NUM_IMAGES images from all sources,
 * filling any gap with ffmpeg colour placeholders.
 */
async function collectImages() {
    console.log('\n📷  Collecting Radha-Krishna images from royalty-free sources…');

    // API-key sources first (best quality when keys are available)
    const pixabayImages = await fetchPixabayImages(NUM_IMAGES);
    let allImages = [...pixabayImages];

    if (allImages.length < NUM_IMAGES) {
        const pexelsImages = await fetchPexelsImages(NUM_IMAGES - allImages.length);
        allImages = [...allImages, ...pexelsImages];
    }

    // No-key museum sources
    if (allImages.length < NUM_IMAGES) {
        const wikimediaImages = await fetchWikimediaImages(NUM_IMAGES - allImages.length);
        allImages = [...allImages, ...wikimediaImages];
    }

    if (allImages.length < NUM_IMAGES) {
        const metImages = await fetchMetMuseumImages(NUM_IMAGES - allImages.length);
        allImages = [...allImages, ...metImages];
    }

    if (allImages.length < NUM_IMAGES) {
        const cmaImages = await fetchClevelandMuseumImages(NUM_IMAGES - allImages.length);
        allImages = [...allImages, ...cmaImages];
    }

    // DALL-E 3 fills any remaining gaps (only charges for what's actually needed)
    if (allImages.length < NUM_IMAGES) {
        const dalleImages = await generateDallEImages(NUM_IMAGES - allImages.length);
        allImages = [...allImages, ...dalleImages];
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
 * Source A: Freesound.org – real meditation ambient sounds via HQ preview URLs.
 * (requires FREESOUND_API_KEY; free tier, no OAuth needed for previews)
 */
async function fetchFreesoundAudio(destPath) {
    if (!FREESOUND_API_KEY) return false;
    console.log('  🔔  Freesound.org (meditation ambient sounds)…');

    const searchParams = new URLSearchParams({
        query: 'meditation bells ambient om',
        token: FREESOUND_API_KEY,
        fields: 'id,name,previews,duration',
        filter: 'duration:[60 TO *]',
        sort: 'rating_desc',
        page_size: '10',
    });
    let sounds = [];
    try {
        const res = await fetch(`https://freesound.org/apiv2/search/text/?${searchParams}`,
            { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
        const data = await res.json();
        sounds = data.results ?? [];
        console.log(`    Found ${sounds.length} candidate sound(s)`);
    } catch (err) {
        console.warn(`    ⚠  Freesound search failed: ${err.message}`);
        return false;
    }

    const tmpAudio = path.join(MUSIC_DIR, '_freesound_tmp');

    for (const sound of sounds) {
        // HQ preview URLs are publicly accessible without OAuth
        const previewUrl = sound.previews?.['preview-hq-mp3'];
        if (!previewUrl) continue;
        try {
            console.log(`    ⬇  "${sound.name}" (${Math.round(sound.duration)}s)`);
            await downloadFile(previewUrl, tmpAudio);

            console.log(`    🔁  Looping to ${VIDEO_DURATION_SECS}s…`);
            runFFmpeg([
                '-y', '-stream_loop', '-1', '-i', tmpAudio,
                '-t', String(VIDEO_DURATION_SECS),
                '-c:a', 'aac', '-b:a', '128k',
                destPath,
            ]);
            fs.unlinkSync(tmpAudio);
            console.log('    ✔  Freesound audio ready');
            return true;
        } catch (err) {
            console.warn(`    ⚠  Freesound sound ${sound.id}: ${err.message}`);
            if (fs.existsSync(tmpAudio)) fs.unlinkSync(tmpAudio);
        }
    }
    return false;
}

/**
 * Source B: ccMixter – Creative Commons licensed music (no API key required).
 * Searches for ambient/meditation tracks, downloads and loops to VIDEO_DURATION_SECS.
 * Returns true on success, false if all candidates failed.
 */
async function fetchCcMixterAudio(destPath) {
    console.log('  🎼  ccMixter (Creative Commons ambient/meditation music)…');
    const searchUrl = 'https://ccmixter.org/api/query?f=json&search=meditation+ambient+peaceful&limit=10';
    let tracks = [];
    try {
        const res = await fetch(searchUrl, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
        tracks = await res.json();
        console.log(`    Found ${tracks.length} candidate track(s)`);
    } catch (err) {
        console.warn(`    ⚠  ccMixter search failed: ${err.message}`);
        return false;
    }

    const tmpAudio = path.join(MUSIC_DIR, '_ccmixter_tmp');

    for (const track of tracks) {
        // The API returns upload_file[] with a download_url per file
        const fileUrl = (track.upload_file ?? [])
            .find(f => /\.mp3$/i.test(f.file_name ?? ''))?.download_url;
        if (!fileUrl) continue;
        try {
            const title = track.upload_name ?? track.upload_id ?? 'unknown';
            const artist = track.user_name ?? 'unknown';
            console.log(`    ⬇  "${title}" by ${artist}`);
            await downloadFile(fileUrl, tmpAudio);

            console.log(`    🔁  Looping to ${VIDEO_DURATION_SECS}s…`);
            runFFmpeg([
                '-y', '-stream_loop', '-1', '-i', tmpAudio,
                '-t', String(VIDEO_DURATION_SECS),
                '-c:a', 'aac', '-b:a', '128k',
                destPath,
            ]);
            fs.unlinkSync(tmpAudio);
            console.log('    ✔  ccMixter audio ready');
            return true;
        } catch (err) {
            console.warn(`    ⚠  ${track.upload_id}: ${err.message}`);
            if (fs.existsSync(tmpAudio)) fs.unlinkSync(tmpAudio);
        }
    }
    return false;
}

/**
 * Source C: Internet Archive – searches for CC/public-domain devotional music,
 * downloads the first suitable audio file, and loops it to VIDEO_DURATION_SECS.
 * Returns true on success, false if all candidates failed.
 */
async function fetchInternetArchiveAudio(destPath) {
    console.log('  🌐  Internet Archive (CC/public-domain devotional music)…');
    const searchParams = new URLSearchParams({
        q: 'subject:meditation OR subject:bhajan OR subject:kirtan OR subject:mantra OR subject:krishna',
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

            // Pick the smallest MP3/OGG under MAX_AUDIO_FILE_SIZE_BYTES to keep CI fast
            const audioFile = (filesData.result ?? [])
                .filter(f => /\.(mp3|ogg)$/i.test(f.name) && parseInt(f.size ?? '0', 10) < MAX_AUDIO_FILE_SIZE_BYTES)
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

/** Source D (fallback): synthesise a 432 Hz harmonic ambient track with ffmpeg. */
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

/** Orchestrator: try Freesound → ccMixter → Internet Archive → ffmpeg synthesis. */
async function collectAudio() {
    const musicPath = path.join(MUSIC_DIR, 'om-devotional-ambient.aac');
    if (fs.existsSync(musicPath)) {
        console.log(`\n🎵  Reusing cached audio: ${musicPath}`);
        return musicPath;
    }

    console.log('\n🎵  Obtaining royalty-free background music…');

    const fsSuccess = await fetchFreesoundAudio(musicPath);
    if (!fsSuccess) {
        const ccSuccess = await fetchCcMixterAudio(musicPath);
        if (!ccSuccess) {
            const iaSuccess = await fetchInternetArchiveAudio(musicPath);
            if (!iaSuccess) {
                console.warn('  ⚠  All download sources unavailable; falling back to local synthesis.');
                synthesizeAmbientAudio(musicPath);
            }
        }
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
            // Fade in over first second, fade out over last second.
            // Warm golden EQ: slightly brighter, more saturated, reds up, blues down.
            const fadeOutStart = SECONDS_PER_IMAGE - 1;
            const vf =
                `zoompan=z='${zoomExpr}':d=${totalFrames}` +
                `:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` +
                `,scale=${TARGET_WIDTH}:${TARGET_HEIGHT},fps=${FPS}` +
                `,fade=t=in:st=0:d=1,fade=t=out:st=${fadeOutStart}:d=1` +
                `,eq=brightness=0.03:saturation=1.2:gamma_r=1.08:gamma_b=0.92`;

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
