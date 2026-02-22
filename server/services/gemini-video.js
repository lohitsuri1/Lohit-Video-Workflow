/**
 * gemini-video.js
 *
 * Standalone video generation service using Google Gemini Veo 2.
 * Exports generateShortClip({ prompt, outputPath, apiKey }).
 */

import { GoogleGenAI } from '@google/genai';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Generate a short video clip using Veo 2 and save it to disk.
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
