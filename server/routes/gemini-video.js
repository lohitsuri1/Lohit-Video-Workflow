/**
 * gemini-video.js (route)
 *
 * Express route for short video clip generation via Google Gemini Veo 2.
 * Exposes POST /api/generate/video
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateShortClip } from '../services/gemini-video.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * POST /api/generate/video
 *
 * Body: { prompt, aspectRatio?, durationSeconds? }
 * Returns: { filePath }
 */
router.post('/video', async (req, res) => {
    try {
        const { prompt, aspectRatio = '16:9', durationSeconds = 8 } = req.body;
        const { GEMINI_API_KEY, VIDEOS_DIR } = req.app.locals;

        if (!prompt) {
            return res.status(400).json({ error: 'prompt is required' });
        }

        if (!GEMINI_API_KEY) {
            return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
        }

        // Build a unique output path inside library/videos/
        const timestamp = Date.now();
        const filename = `veo2-${timestamp}.mp4`;
        const outputPath = path.join(VIDEOS_DIR, filename);

        console.log(`[Route /api/generate/video] prompt="${prompt.substring(0, 80)}..." aspectRatio=${aspectRatio} durationSeconds=${durationSeconds}`);

        const savedPath = await generateShortClip({
            prompt,
            outputPath,
            apiKey: GEMINI_API_KEY,
            aspectRatio,
            durationSeconds,
        });

        return res.json({ filePath: `/library/videos/${path.basename(savedPath)}` });
    } catch (error) {
        console.error('[Route /api/generate/video] Error:', error);
        res.status(500).json({ error: error.message || 'Video generation failed' });
    }
});

export default router;
