/**
 * gemini-video.js
 *
 * Standalone video generation service using Google Gemini Veo 2.
 * Falls back to Imagen-3 + ffmpeg for free-tier API keys that do not
 * have GCP billing enabled (Veo requires a paid account).
 * Exports generateShortClip({ prompt, outputPath, apiKey }).
 */

import { GoogleGenAI } from '@google/genai';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Generate a short video clip using Veo 2 and save it to disk.
 * If the API key is on the free tier (no GCP billing), falls back to
 * Imagen-3 image generation + ffmpeg Ken-Burns video composition.
 *
 * @param {Object} options
 * @param {string} options.prompt - Text prompt for the video
 * @param {string} options.outputPath - File path to save the resulting video
 * @param {string} options.apiKey - Google Gemini API key
 * @param {string} [options.aspectRatio='16:9'] - Aspect ratio
 * @param {number} [options.durationSeconds=8] - Duration in seconds
 * @returns {Promise<string>} Resolved output path
 */
export async function generateShortClip({ prompt, outputPath, apiKey, aspectRatio = '16:9', durationSeconds = 8 }) {
    const ai = new GoogleGenAI({ apiKey });

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log('[Gemini Video] Starting video generation with Veo 2...');

    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: prompt,
            config: {
                aspectRatio: aspectRatio,
                durationSeconds: durationSeconds,
                numberOfVideos: 1,
            },
        });

        // Poll until complete (max 20 minutes / ~120 polls × 10 s)
        const MAX_POLLS = 120;
        let polls = 0;
        while (!operation.done) {
            if (polls >= MAX_POLLS) {
                throw new Error('[Gemini Video] Timed out waiting for video generation to complete');
            }
            await new Promise(resolve => setTimeout(resolve, 10000));
            operation = await ai.operations.getVideosOperation({ operation });
            polls++;
            console.log('[Gemini Video] Still processing...');
        }

        // Validate response structure
        const generatedSamples = operation.response?.generatedSamples;
        if (!generatedSamples || generatedSamples.length === 0) {
            throw new Error('[Gemini Video] No generated samples in response');
        }

        // Extract video URI and download
        const videoUri = generatedSamples[0].video?.uri;
        if (!videoUri) {
            throw new Error('[Gemini Video] No video URI in generated sample');
        }
        const downloadUrl = new URL(videoUri);
        downloadUrl.searchParams.set('key', apiKey);

        const videoResponse = await fetch(downloadUrl.toString());
        if (!videoResponse.ok) {
            throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
        }

        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
        fs.writeFileSync(outputPath, videoBuffer);
        console.log(`[Gemini Video] ✅ Video saved to: ${outputPath}`);
        return outputPath;

    } catch (error) {
        // Veo requires GCP billing. When the free-tier key is used the API
        // returns FAILED_PRECONDITION (HTTP 400). Fall back to generating a
        // high-quality image with Imagen-3 and turning it into a video with
        // ffmpeg using a Ken-Burns zoom/pan effect.
        const isBillingError =
            error?.status === 400 &&
            (error?.message?.includes('FAILED_PRECONDITION') ||
                error?.message?.includes('billing'));

        if (!isBillingError) {
            throw error;
        }

        console.warn('[Gemini Video] ⚠️  Veo 2 requires GCP billing which is not enabled for this API key.');
        console.warn('[Gemini Video] Falling back to free-tier: Imagen-3 image → ffmpeg Ken-Burns video.');
        return generateImageFallbackVideo({ ai, prompt, outputPath, aspectRatio, durationSeconds });
    }
}

/**
 * Free-tier fallback: generate an image with Imagen-3 and animate it into a
 * short video using ffmpeg's zoompan filter (Ken-Burns effect).
 *
 * @param {Object} opts
 * @param {GoogleGenAI} opts.ai
 * @param {string} opts.prompt
 * @param {string} opts.outputPath
 * @param {string} opts.aspectRatio
 * @param {number} opts.durationSeconds
 * @returns {Promise<string>} Resolved output path
 */
async function generateImageFallbackVideo({ ai, prompt, outputPath, aspectRatio, durationSeconds }) {
    // Map Veo aspect ratio strings to Imagen-3 supported values
    const imagenRatioMap = {
        '16:9': '16:9',
        '9:16': '9:16',
        '1:1': '1:1',
        '4:3': '4:3',
        '3:4': '3:4',
    };
    const imagenRatio = imagenRatioMap[aspectRatio] || '16:9';

    console.log('[Gemini Video] Generating frame with Imagen-3 (free tier)...');
    const imgResponse = await ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: prompt,
        config: {
            numberOfImages: 1,
            aspectRatio: imagenRatio,
        },
    });

    const imageData = imgResponse?.generatedImages?.[0]?.image?.imageBytes;
    if (!imageData) {
        throw new Error('[Gemini Video] Imagen-3 returned no image data');
    }

    // Write the image to a temp file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-video-'));
    const framePath = path.join(tmpDir, 'frame.jpg');

    try {
        fs.writeFileSync(framePath, Buffer.from(imageData, 'base64'));
        console.log('[Gemini Video] Frame saved, composing video with ffmpeg...');

        // Build a Ken-Burns zoom effect using ffmpeg's zoompan filter.
        // The total frame count drives the duration of the effect.
        const FPS = 25;
        const totalFrames = durationSeconds * FPS;
        const zoompanFilter = `zoompan=z='min(zoom+0.0008,1.3)':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',scale=1280:720,fps=${FPS}`;

        // Use spawnSync with an argument array to avoid any shell-escaping issues.
        const result = spawnSync('ffmpeg', [
            '-y',
            '-loop', '1',
            '-i', framePath,
            '-vf', zoompanFilter,
            '-t', String(durationSeconds),
            '-pix_fmt', 'yuv420p',
            '-c:v', 'libx264',
            outputPath,
        ], { stdio: 'inherit' });

        if (result.status !== 0) {
            throw new Error(
                `[Gemini Video] ffmpeg exited with code ${result.status}. ` +
                'Make sure ffmpeg is installed (apt-get install -y ffmpeg).'
            );
        }
    } finally {
        // Clean up temp directory even if ffmpeg fails
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    console.log(`[Gemini Video] ✅ Fallback video saved to: ${outputPath}`);
    return outputPath;
}

// Standalone test entrypoint
if (process.argv[1] && process.argv[1].includes('gemini-video')) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY not set!');
        process.exit(1);
    }
    const testOutputPath = './library/videos/test-clip.mp4';
    try {
        await generateShortClip({
            prompt: 'A golden sunset over ocean waves, cinematic style, smooth camera pan',
            outputPath: testOutputPath,
            apiKey,
        });
    } catch (err) {
        // Fall back to FFmpeg when the Gemini API is unavailable (e.g. billing not enabled)
        if (err.message && (err.message.includes('FAILED_PRECONDITION') || err.message.includes('billing'))) {
            console.warn('⚠️  Veo 2 requires GCP billing. Generating a fallback test video with FFmpeg...');
            const outputDir = path.dirname(testOutputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            try {
                execFileSync('ffmpeg', [
                    '-y', '-f', 'lavfi',
                    '-i', 'color=c=blue:size=1280x720:rate=30',
                    '-t', '5',
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    testOutputPath,
                ], { stdio: 'inherit' });
                console.log(`✅ Fallback test video saved to: ${testOutputPath}`);
            } catch (ffmpegErr) {
                console.error('❌ FFmpeg fallback failed:', ffmpegErr.message);
                throw ffmpegErr;
            }
        } else {
            throw err;
        }
    }
}
