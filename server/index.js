import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import chatAgent from './agent/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Ensure library directories exist
const LIBRARY_DIR = path.join(__dirname, '..', 'library');
const WORKFLOWS_DIR = path.join(LIBRARY_DIR, 'workflows');
const IMAGES_DIR = path.join(LIBRARY_DIR, 'images');
const VIDEOS_DIR = path.join(LIBRARY_DIR, 'videos');
const CHATS_DIR = path.join(LIBRARY_DIR, 'chats');
const LIBRARY_ASSETS_DIR = path.join(LIBRARY_DIR, 'assets');

[LIBRARY_DIR, WORKFLOWS_DIR, IMAGES_DIR, VIDEOS_DIR, CHATS_DIR, LIBRARY_ASSETS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Serve static assets from library
app.use('/library', express.static(LIBRARY_DIR));

app.use(cors());
app.use(express.json({ limit: '100mb' }));

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.warn("SERVER WARNING: GEMINI_API_KEY is not set in environment or .env file.");
}

const getClient = () => {
    return new GoogleGenAI({ apiKey: API_KEY || '' });
};

// ============================================================================
// KLING AI CONFIGURATION
// ============================================================================

const KLING_ACCESS_KEY = process.env.KLING_ACCESS_KEY;
const KLING_SECRET_KEY = process.env.KLING_SECRET_KEY;
const KLING_BASE_URL = 'https://api-singapore.klingai.com';

if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
    console.warn("SERVER WARNING: KLING_ACCESS_KEY or KLING_SECRET_KEY not set. Kling AI models will not work.");
}

/**
 * Generate JWT token for Kling AI API authentication
 * Token is valid for 30 minutes
 */
function generateKlingJWT() {
    if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
        throw new Error('Kling API credentials not configured');
    }

    const header = {
        alg: 'HS256',
        typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: KLING_ACCESS_KEY,
        exp: now + 1800, // 30 minutes
        nbf: now - 5     // Valid from 5 seconds ago to handle clock skew
    };

    // Base64url encode
    const base64UrlEncode = (obj) => {
        const json = JSON.stringify(obj);
        const base64 = Buffer.from(json).toString('base64');
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    };

    const headerEncoded = base64UrlEncode(header);
    const payloadEncoded = base64UrlEncode(payload);
    const signatureInput = `${headerEncoded}.${payloadEncoded}`;

    // HMAC-SHA256 signature
    const signature = crypto.createHmac('sha256', KLING_SECRET_KEY)
        .update(signatureInput)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

    return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

/**
 * Resolve an image URL or base64 to a base64 data URL
 * Handles both file paths (/library/images/...) and data URLs
 */
function resolveImageToBase64(imageInput) {
    if (!imageInput) return null;

    // Already a base64 data URL
    if (imageInput.startsWith('data:')) {
        return imageInput;
    }

    // File URL - read from disk
    // Supports older /assets/ paths (legacy) and new /library/ paths
    let filePath = null;
    if (imageInput.startsWith('/assets/images/')) {
        const filename = imageInput.replace('/assets/images/', '');
        filePath = path.join(IMAGES_DIR, filename);
    } else if (imageInput.startsWith('/library/images/')) {
        const filename = imageInput.replace('/library/images/', '');
        filePath = path.join(IMAGES_DIR, filename);
    }

    if (filePath && fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }

    // Return as-is if unknown format
    return imageInput;
}

// --- Helper Functions ---

const mapAspectRatio = (ratio) => {
    if (!ratio || ratio === 'Auto') return "1:1";
    switch (ratio) {
        case "1:1": return "1:1";
        case "3:4": return "3:4";
        case "4:3": return "4:3";
        case "9:16": return "9:16";
        case "16:9": return "16:9";
        case "3:2": return "4:3";
        case "2:3": return "3:4";
        case "5:4": return "4:3";
        case "4:5": return "3:4";
        case "21:9": return "16:9";
        default: return "1:1";
    }
};

// ============================================================================
// KLING AI VIDEO GENERATION HELPERS
// ============================================================================

/**
 * Map frontend model ID to Kling API model_name
 */
function mapKlingModelName(modelId) {
    const mapping = {
        'kling-v1': 'kling-v1',
        'kling-v1-5': 'kling-v1-5',
        'kling-v1-6': 'kling-v1-6',
        'kling-v2-master': 'kling-v2-master',
        'kling-v2-1': 'kling-v2-1',
        'kling-v2-1-master': 'kling-v2-1-master',
        'kling-v2-5-turbo': 'kling-v2-5-turbo'
    };
    return mapping[modelId] || 'kling-v2-1';
}

/**
 * Extract raw base64 from data URL (removes data:image/xxx;base64, prefix)
 */
function extractRawBase64(dataUrl) {
    if (!dataUrl) return null;
    if (dataUrl.startsWith('data:')) {
        return dataUrl.replace(/^data:[^;]+;base64,/, '');
    }
    return dataUrl;
}

/**
 * Poll Kling task status until complete
 * @param {string} taskId - Task ID from create task response
 * @param {string} endpoint - API endpoint (image2video or multi-image2video)
 * @param {number} maxWaitMs - Maximum wait time in milliseconds
 */
async function pollKlingTask(taskId, endpoint, maxWaitMs = 300000) {
    const token = generateKlingJWT();
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < maxWaitMs) {
        const response = await fetch(`${KLING_BASE_URL}/v1/videos/${endpoint}/${taskId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (result.code !== 0) {
            throw new Error(`Kling API error: ${result.message || 'Unknown error'}`);
        }

        const status = result.data?.task_status;
        console.log(`Kling task ${taskId} status: ${status}`);

        if (status === 'succeed') {
            const videoUrl = result.data?.task_result?.videos?.[0]?.url;
            if (!videoUrl) {
                throw new Error('No video URL in successful response');
            }
            return videoUrl;
        } else if (status === 'failed') {
            throw new Error(`Kling generation failed: ${result.data?.task_status_msg || 'Unknown error'}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Kling generation timed out');
}

/**
 * Generate video using Kling AI Image-to-Video API
 */
async function generateKlingVideo({ prompt, imageBase64, lastFrameBase64, modelId, aspectRatio }) {
    const token = generateKlingJWT();
    const modelName = mapKlingModelName(modelId);

    // Use 'pro' mode when doing frame-to-frame (with end frame), otherwise 'std'
    const useProMode = !!lastFrameBase64;

    // Prepare request body
    const body = {
        model_name: modelName,
        mode: useProMode ? 'pro' : 'std', // Pro mode required for frame-to-frame with image_tail
        duration: '5',
        prompt: prompt || ''
    };

    // Add start frame image
    if (imageBase64) {
        const rawBase64 = extractRawBase64(imageBase64);
        body.image = rawBase64;
    }

    // Add end frame image (requires pro mode for most models)
    if (lastFrameBase64) {
        const rawBase64 = extractRawBase64(lastFrameBase64);
        body.image_tail = rawBase64;
    }

    console.log(`Kling Video Gen: Using model ${modelName}, mode: ${body.mode}, has image: ${!!imageBase64}, has tail: ${!!lastFrameBase64}`);

    // Create task
    const response = await fetch(`${KLING_BASE_URL}/v1/videos/image2video`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });

    const result = await response.json();

    if (result.code !== 0) {
        throw new Error(`Kling API error: ${result.message || 'Failed to create task'}`);
    }

    const taskId = result.data?.task_id;
    if (!taskId) {
        throw new Error('No task ID returned from Kling API');
    }

    console.log(`Kling task created: ${taskId}`);

    // Poll for completion
    return await pollKlingTask(taskId, 'image2video');
}

/**
 * Generate video using Kling AI Multi-Image-to-Video API (for frame-to-frame)
 */
async function generateKlingMultiImageVideo({ prompt, imageList, aspectRatio }) {
    const token = generateKlingJWT();

    // Multi-image only supports kling-v1-6
    const body = {
        model_name: 'kling-v1-6',
        mode: 'std',
        duration: '5',
        prompt: prompt || '',
        aspect_ratio: aspectRatio === '9:16' ? '9:16' : '16:9',
        image_list: imageList.map(img => ({ image: extractRawBase64(img) }))
    };

    console.log(`Kling Multi-Image Gen: ${imageList.length} images`);

    const response = await fetch(`${KLING_BASE_URL}/v1/videos/multi-image2video`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });

    const result = await response.json();

    if (result.code !== 0) {
        throw new Error(`Kling API error: ${result.message || 'Failed to create task'}`);
    }

    const taskId = result.data?.task_id;
    if (!taskId) {
        throw new Error('No task ID returned from Kling API');
    }

    console.log(`Kling multi-image task created: ${taskId}`);

    // Poll for completion
    return await pollKlingTask(taskId, 'multi-image2video');
}

// ============================================================================
// KLING AI IMAGE GENERATION HELPERS
// ============================================================================

/**
 * Poll Kling image task status until complete
 */
async function pollKlingImageTask(taskId, maxWaitMs = 120000) {
    const token = generateKlingJWT();
    const startTime = Date.now();
    const pollInterval = 3000; // 3 seconds for images (faster than video)

    while (Date.now() - startTime < maxWaitMs) {
        const response = await fetch(`${KLING_BASE_URL}/v1/images/generations/${taskId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (result.code !== 0) {
            throw new Error(`Kling API error: ${result.message || 'Unknown error'}`);
        }

        const status = result.data?.task_status;
        console.log(`Kling image task ${taskId} status: ${status}`);

        if (status === 'succeed') {
            const imageUrl = result.data?.task_result?.images?.[0]?.url;
            if (!imageUrl) {
                throw new Error('No image URL in successful response');
            }
            return imageUrl;
        } else if (status === 'failed') {
            throw new Error(`Kling image generation failed: ${result.data?.task_status_msg || 'Unknown error'}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Kling image generation timed out');
}

/**
 * Generate image using Kling AI Image Generation API
 */
async function generateKlingImage({ prompt, imageBase64, modelId, aspectRatio }) {
    const token = generateKlingJWT();

    // Map frontend model ID to Kling API model_name
    const modelMapping = {
        'kling-v1': 'kling-v1',
        'kling-v1-5': 'kling-v1-5',
        'kling-v2': 'kling-v2',
        'kling-v2-new': 'kling-v2-new',
        'kling-v2-1': 'kling-v2-1'
    };
    const modelName = modelMapping[modelId] || 'kling-v2-1';

    // Map aspect ratio - Kling supports: 16:9, 9:16, 1:1, 4:3, 3:4, 3:2, 2:3, 21:9
    const ratioMapping = {
        'Auto': '1:1',
        '1:1': '1:1',
        '16:9': '16:9',
        '9:16': '9:16',
        '4:3': '4:3',
        '3:4': '3:4',
        '3:2': '3:2',
        '2:3': '2:3',
        '21:9': '21:9',
        '5:4': '4:3',
        '4:5': '3:4'
    };
    const mappedRatio = ratioMapping[aspectRatio] || '1:1';

    // Prepare request body
    const body = {
        model_name: modelName,
        prompt: prompt,
        aspect_ratio: mappedRatio,
        n: 1
    };

    // Add reference image if provided (for image-to-image)
    if (imageBase64) {
        // For array of images, use the first one
        const firstImage = Array.isArray(imageBase64) ? imageBase64[0] : imageBase64;
        body.image = extractRawBase64(firstImage);
    }

    console.log(`Kling Image Gen: Using model ${modelName}, aspect ratio: ${mappedRatio}, has reference: ${!!imageBase64}`);

    // Create task
    const response = await fetch(`${KLING_BASE_URL}/v1/images/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });

    const result = await response.json();

    if (result.code !== 0) {
        throw new Error(`Kling API error: ${result.message || 'Failed to create image task'}`);
    }

    const taskId = result.data?.task_id;
    if (!taskId) {
        throw new Error('No task ID returned from Kling API');
    }

    console.log(`Kling image task created: ${taskId}`);

    // Poll for completion
    return await pollKlingImageTask(taskId);
}

// --- Library Assets API ---

// Save curated asset to library
app.post('/api/library', async (req, res) => {
    try {
        const { sourceUrl, name, category, meta } = req.body;

        if (!sourceUrl || !name || !category) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Determine destination directory
        const destDir = path.join(LIBRARY_ASSETS_DIR, category);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Sanitize name for filesystem
        const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

        let destFilename;
        let destPath;

        // HANDLE DATA URL (Base64)
        if (sourceUrl.startsWith('data:')) {
            const matches = sourceUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return res.status(400).json({ error: 'Invalid data URL format' });
            }

            const mimeType = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');

            // Determine extension from mime
            let ext = '.png';
            if (mimeType === 'image/jpeg') ext = '.jpg';
            else if (mimeType === 'video/mp4') ext = '.mp4';
            // Add more as needed

            destFilename = `${safeName}${ext}`;
            destPath = path.join(destDir, destFilename);

            fs.writeFileSync(destPath, buffer);
        }
        // HANDLE FILE PATH OR URL
        else {
            // Determine source file path
            let sourcePath = null;

            // Normalize URL: remove origin if present to get just the path
            let cleanUrl = sourceUrl;
            try {
                // If it's a full URL, extract pathname
                if (sourceUrl.startsWith('http')) {
                    const u = new URL(sourceUrl);
                    cleanUrl = u.pathname;
                }
            } catch (e) {
                // Not a valid URL, treat as path
                cleanUrl = sourceUrl.split('?')[0];
            }

            // Ensure cleanUrl starts with / if it doesn't (though URL.pathname does)
            if (!cleanUrl.startsWith('/')) cleanUrl = '/' + cleanUrl;

            // Handle URL decoding (e.g. %20 -> space)
            cleanUrl = decodeURIComponent(cleanUrl);

            if (cleanUrl.startsWith('/library/images/')) {
                sourcePath = path.join(IMAGES_DIR, cleanUrl.replace('/library/images/', ''));
            } else if (cleanUrl.startsWith('/library/videos/')) {
                sourcePath = path.join(VIDEOS_DIR, cleanUrl.replace('/library/videos/', ''));
            } else if (cleanUrl.startsWith('/assets/images/')) { // Legacy support
                sourcePath = path.join(IMAGES_DIR, cleanUrl.replace('/assets/images/', ''));
            } else if (cleanUrl.startsWith('/assets/videos/')) { // Legacy support
                sourcePath = path.join(VIDEOS_DIR, cleanUrl.replace('/assets/videos/', ''));
            }

            if (!sourcePath || !fs.existsSync(sourcePath)) {
                console.error(`Save asset failed: Source file not found. URL: ${sourceUrl}, Path: ${sourcePath}`);
                return res.status(404).json({ error: "Source file not found", debug: { sourceUrl, sourcePath, cleanUrl } });
            }

            // Copy file
            const ext = path.extname(sourcePath);
            destFilename = `${safeName}${ext}`;
            destPath = path.join(destDir, destFilename);

            fs.copyFileSync(sourcePath, destPath);
        }

        // Update assets.json
        const libraryJsonPath = path.join(LIBRARY_ASSETS_DIR, 'assets.json');
        let libraryData = [];
        if (fs.existsSync(libraryJsonPath)) {
            libraryData = JSON.parse(fs.readFileSync(libraryJsonPath, 'utf8'));
        }

        const newEntry = {
            id: crypto.randomUUID(),
            name: name,
            category: category,
            url: `/library/assets/${category}/${destFilename}`,
            type: sourceUrl.includes('video') || (sourceUrl.startsWith('data:video')) ? 'video' : 'image',
            createdAt: new Date().toISOString(),
            ...meta
        };

        libraryData.push(newEntry);
        fs.writeFileSync(libraryJsonPath, JSON.stringify(libraryData, null, 2));

        res.json({ success: true, asset: newEntry });
    } catch (error) {
        console.error("Save to library error:", error);
        res.status(500).json({ error: error.message });
    }
});

// List library assets
app.get('/api/library', async (req, res) => {
    try {
        const libraryJsonPath = path.join(LIBRARY_ASSETS_DIR, 'assets.json');
        if (!fs.existsSync(libraryJsonPath)) {
            return res.json([]);
        }
        const libraryData = JSON.parse(fs.readFileSync(libraryJsonPath, 'utf8'));
        // Sort newest first
        libraryData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(libraryData);
    } catch (error) {
        console.error("List library error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Delete library asset
app.delete('/api/library/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const libraryJsonPath = path.join(LIBRARY_ASSETS_DIR, 'assets.json');

        if (!fs.existsSync(libraryJsonPath)) {
            return res.status(404).json({ error: "Library not found" });
        }

        let libraryData = JSON.parse(fs.readFileSync(libraryJsonPath, 'utf8'));
        const assetIndex = libraryData.findIndex(a => a.id === id);

        if (assetIndex === -1) {
            return res.status(404).json({ error: "Asset not found" });
        }

        const asset = libraryData[assetIndex];

        // Delete the actual file if it exists in our assets folder
        // asset.url usually looks like /library/assets/Category/file.ext
        if (asset.url && asset.url.startsWith('/library/assets/')) {
            const relativePath = asset.url.replace('/library/assets/', '');
            const filePath = path.join(LIBRARY_ASSETS_DIR, relativePath);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // Remove from array
        libraryData.splice(assetIndex, 1);
        fs.writeFileSync(libraryJsonPath, JSON.stringify(libraryData, null, 2));

        res.json({ success: true });
    } catch (error) {
        console.error("Delete library asset error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- Workflow API Routes ---

// Save/Update workflow
app.post('/api/workflows', async (req, res) => {
    try {
        const workflow = req.body;
        if (!workflow.id) {
            workflow.id = crypto.randomUUID();
        }
        workflow.updatedAt = new Date().toISOString();
        if (!workflow.createdAt) {
            workflow.createdAt = workflow.updatedAt;
        }


        const filePath = path.join(WORKFLOWS_DIR, `${workflow.id}.json`);

        // Preserve existing coverUrl if it exists
        if (fs.existsSync(filePath)) {
            try {
                const existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (existingData.coverUrl) {
                    workflow.coverUrl = existingData.coverUrl;
                }
            } catch (readError) {
                console.warn("Could not read existing workflow to preserve cover:", readError);
            }
        }

        fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));

        res.json({ success: true, id: workflow.id });
    } catch (error) {
        console.error("Save workflow error:", error);
        res.status(500).json({ error: error.message });
    }
});

// List all workflows
app.get('/api/workflows', async (req, res) => {
    try {
        const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'));
        const workflows = files.map(file => {
            const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
            const workflow = JSON.parse(content);
            return {
                id: workflow.id,
                title: workflow.title,
                createdAt: workflow.createdAt,
                updatedAt: workflow.updatedAt,
                nodeCount: workflow.nodes?.length || 0,
                coverUrl: workflow.coverUrl
            };
        });
        workflows.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        res.json(workflows);
    } catch (error) {
        console.error("List workflows error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Load specific workflow
app.get('/api/workflows/:id', async (req, res) => {
    try {
        const filePath = path.join(WORKFLOWS_DIR, `${req.params.id}.json`);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Workflow not found" });
        }
        const content = fs.readFileSync(filePath, 'utf8');
        res.json(JSON.parse(content));
    } catch (error) {
        console.error("Load workflow error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Delete workflow
app.delete('/api/workflows/:id', async (req, res) => {
    try {
        const filePath = path.join(WORKFLOWS_DIR, `${req.params.id}.json`);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Workflow not found" });
        }
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (error) {
        console.error("Delete workflow error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Update workflow cover
app.put('/api/workflows/:id/cover', async (req, res) => {
    try {
        const { coverUrl } = req.body;
        const filePath = path.join(WORKFLOWS_DIR, `${req.params.id}.json`);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Workflow not found" });
        }

        const workflowData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        workflowData.coverUrl = coverUrl;
        fs.writeFileSync(filePath, JSON.stringify(workflowData, null, 2));

        res.json({ success: true, coverUrl });
    } catch (error) {
        console.error("Update cover error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- Image/Video Generation Routes ---

app.post('/api/generate-image', async (req, res) => {
    try {
        const { prompt, aspectRatio, resolution, imageBase64: rawImageBase64, imageModel } = req.body;

        // Determine which provider to use based on model
        const isKlingModel = imageModel && imageModel.startsWith('kling-');

        let imageBuffer;
        let imageFormat = 'png';

        if (isKlingModel) {
            // ============================================================================
            // KLING AI IMAGE GENERATION
            // ============================================================================

            if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
                return res.status(500).json({ error: "Kling API credentials not configured. Add KLING_ACCESS_KEY and KLING_SECRET_KEY to .env" });
            }

            console.log(`Using Kling AI model for image: ${imageModel}`);

            // Resolve images if provided
            let resolvedImages = null;
            if (rawImageBase64) {
                const rawImages = Array.isArray(rawImageBase64) ? rawImageBase64 : [rawImageBase64];
                resolvedImages = rawImages.map(img => resolveImageToBase64(img)).filter(Boolean);
            }

            // Generate using Kling API
            const klingImageUrl = await generateKlingImage({
                prompt,
                imageBase64: resolvedImages,
                modelId: imageModel,
                aspectRatio
            });

            // Download the image from Kling's URL
            const imageResponse = await fetch(klingImageUrl);
            if (!imageResponse.ok) {
                throw new Error('Failed to download image from Kling');
            }
            imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

            // Detect format from URL or content-type
            if (klingImageUrl.includes('.jpg') || klingImageUrl.includes('.jpeg')) {
                imageFormat = 'jpg';
            }

        } else {
            // ============================================================================
            // GEMINI IMAGE GENERATION (Default)
            // ============================================================================

            if (!API_KEY) {
                return res.status(500).json({ error: "Server missing API Key config" });
            }

            const ai = getClient();
            const modelName = 'gemini-3-pro-image-preview';

            const apiRatio = mapAspectRatio(aspectRatio);

            const parts = [];

            if (rawImageBase64) {
                const rawImages = Array.isArray(rawImageBase64) ? rawImageBase64 : [rawImageBase64];
                // Resolve each image to base64 (handles file URLs)
                const images = rawImages.map(img => resolveImageToBase64(img)).filter(Boolean);

                for (const img of images) {
                    const match = img.match(/^data:(image\/\w+);base64,/);
                    const mimeType = match ? match[1] : "image/png";
                    const base64Clean = img.replace(/^data:image\/\w+;base64,/, "");
                    parts.push({
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Clean
                        }
                    });
                }
            }

            parts.push({ text: prompt });

            const response = await ai.models.generateContent({
                model: modelName,
                contents: {
                    parts: parts
                },
                config: {
                    responseModalities: ["TEXT", "IMAGE"],
                    temperature: 1.0,
                }
            });

            const candidates = response.candidates || [];
            if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
                for (const part of candidates[0].content.parts) {
                    if (part.inlineData && part.inlineData.data) {
                        imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                        break;
                    }
                }
            }

            if (!imageBuffer) {
                throw new Error("No image data returned from Gemini");
            }
        }

        // ============================================================================
        // SAVE IMAGE TO LIBRARY (Common for both providers)
        // ============================================================================

        const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const imagePath = path.join(IMAGES_DIR, `${imageId}.${imageFormat}`);
        fs.writeFileSync(imagePath, imageBuffer);

        const imageUrl = `/library/images/${imageId}.${imageFormat}`;

        // SAVE METADATA (Required for History)
        const metadata = {
            id: imageId,
            filename: `${imageId}.${imageFormat}`,
            prompt: prompt,
            model: imageModel || 'gemini-pro',
            createdAt: new Date().toISOString(),
            type: 'images'
        };
        const metaPath = path.join(IMAGES_DIR, `${imageId}.json`);
        fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

        console.log(`Image saved: ${imageUrl} (model: ${imageModel || 'gemini-pro'})`);
        return res.json({ resultUrl: imageUrl });

    } catch (error) {
        console.error("Server Image Gen Error:", error);
        res.status(500).json({ error: error.message || "Image generation failed" });
    }
});

app.post('/api/generate-video', async (req, res) => {
    try {
        const { prompt, imageBase64: rawImageBase64, lastFrameBase64: rawLastFrameBase64, aspectRatio, resolution, videoModel } = req.body;

        // Resolve file URLs to base64 if needed
        const imageBase64 = resolveImageToBase64(rawImageBase64);
        const lastFrameBase64 = resolveImageToBase64(rawLastFrameBase64);

        // Determine which provider to use based on model
        const isKlingModel = videoModel && videoModel.startsWith('kling-');

        let videoUrl;
        let videoBuffer;

        if (isKlingModel) {
            // ============================================================================
            // KLING AI VIDEO GENERATION
            // ============================================================================

            if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
                return res.status(500).json({ error: "Kling API credentials not configured. Add KLING_ACCESS_KEY and KLING_SECRET_KEY to .env" });
            }

            console.log(`Using Kling AI model: ${videoModel}`);

            let klingVideoUrl;

            // For frame-to-frame (start + end frame), use image2video with image_tail in Pro mode
            // This matches how the Kling platform handles it
            klingVideoUrl = await generateKlingVideo({
                prompt,
                imageBase64,
                lastFrameBase64, // Pass through - will trigger Pro mode automatically
                modelId: videoModel,
                aspectRatio
            });

            // Download the video from Kling's URL
            const videoResponse = await fetch(klingVideoUrl);
            if (!videoResponse.ok) {
                throw new Error('Failed to download video from Kling');
            }
            videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

        } else {
            // ============================================================================
            // VEO (GOOGLE) VIDEO GENERATION (Default)
            // ============================================================================

            if (!API_KEY) {
                return res.status(500).json({ error: "Server missing API Key config" });
            }

            const ai = getClient();
            const model = 'veo-3.1-fast-generate-preview';

            let apiResolution = '720p';
            if (resolution === '1080p') apiResolution = '1080p';

            const apiAspectRatio = aspectRatio === '9:16' ? '9:16' : '16:9';

            const videoConfig = {
                numberOfVideos: 1,
                resolution: apiResolution,
                aspectRatio: apiAspectRatio
            };

            // Add last_frame for frame-to-frame interpolation (Veo 3.1 feature)
            if (lastFrameBase64) {
                const lastMatch = lastFrameBase64.match(/^data:(image\/\w+);base64,/);
                let lastMimeType = lastMatch ? lastMatch[1] : 'image/jpeg';
                const lastBase64Clean = lastFrameBase64.replace(/^data:image\/\w+;base64,/, "");

                if (lastMimeType === 'image/png' || lastMimeType === 'image/webp') {
                    lastMimeType = 'image/jpeg';
                }

                videoConfig.lastFrame = {
                    imageBytes: lastBase64Clean,
                    mimeType: lastMimeType
                };
                console.log(`Video Gen: Using last_frame with mimeType: ${lastMimeType}, base64 length: ${lastBase64Clean.length}`);
            }

            const args = {
                model: model,
                prompt: prompt || "A cinematic video",
                config: videoConfig
            };

            if (imageBase64) {
                const match = imageBase64.match(/^data:(image\/\w+);base64,/);
                let mimeType = match ? match[1] : 'image/jpeg';
                const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");

                console.log(`Video Gen: Using image with mimeType: ${mimeType}, base64 length: ${base64Clean.length}`);

                if (mimeType === 'image/png' || mimeType === 'image/webp') {
                    mimeType = 'image/jpeg';
                }

                args.image = {
                    imageBytes: base64Clean,
                    mimeType: mimeType
                };
            }

            console.log('Calling Veo API with args:', { ...args, image: args.image ? { mimeType: args.image.mimeType, length: args.image.imageBytes?.length } : undefined });

            let operation = await ai.models.generateVideos(args);

            while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                operation = await ai.operations.getVideosOperation({ operation: operation });
            }

            const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;

            if (!downloadLink) {
                throw new Error("No video URI returned.");
            }

            const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
            videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        }

        // ============================================================================
        // SAVE VIDEO TO LIBRARY (Common for both providers)
        // ============================================================================

        const videoId = `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const videoPath = path.join(VIDEOS_DIR, `${videoId}.mp4`);
        fs.writeFileSync(videoPath, videoBuffer);

        videoUrl = `/library/videos/${videoId}.mp4`;

        // SAVE METADATA (Required for History)
        const metadata = {
            id: videoId,
            filename: `${videoId}.mp4`,
            prompt: prompt || "A cinematic video",
            model: videoModel || 'veo-3.1',
            createdAt: new Date().toISOString(),
            type: 'videos'
        };
        const metaPath = path.join(VIDEOS_DIR, `${videoId}.json`);
        fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

        console.log(`Video saved: ${videoUrl} (model: ${videoModel || 'veo-3.1'})`);
        return res.json({ resultUrl: videoUrl });

    } catch (error) {
        console.error("Server Video Gen Error:", error);
        res.status(500).json({ error: error.message || "Video generation failed" });
    }
});

// ============================================================================
// ASSET HISTORY API
// ============================================================================

// Save an asset (image or video)
app.post('/api/assets/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const { data, prompt } = req.body;

        if (!['images', 'videos'].includes(type)) {
            return res.status(400).json({ error: 'Invalid asset type' });
        }

        const targetDir = type === 'images' ? IMAGES_DIR : VIDEOS_DIR;
        const id = Date.now().toString();
        const ext = type === 'images' ? 'png' : 'mp4';
        const filename = `${id}.${ext}`;
        const metaFilename = `${id}.json`;

        // Save the asset file
        const base64Data = data.replace(/^data:[^;]+;base64,/, '');
        fs.writeFileSync(path.join(targetDir, filename), base64Data, 'base64');

        // Save metadata
        const metadata = {
            id,
            filename,
            prompt: prompt || '',
            createdAt: new Date().toISOString(),
            type
        };
        fs.writeFileSync(path.join(targetDir, metaFilename), JSON.stringify(metadata, null, 2));

        res.json({ success: true, id, filename, url: `/library/${type}/${filename}` });
    } catch (error) {
        console.error('Save asset error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List all assets of a type
app.get('/api/assets/:type', async (req, res) => {
    try {
        const { type } = req.params;

        if (!['images', 'videos'].includes(type)) {
            return res.status(400).json({ error: 'Invalid asset type' });
        }

        const targetDir = type === 'images' ? IMAGES_DIR : VIDEOS_DIR;

        if (!fs.existsSync(targetDir)) {
            return res.json([]);
        }

        const files = fs.readdirSync(targetDir);
        const assets = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = fs.readFileSync(path.join(targetDir, file), 'utf8');
                    const metadata = JSON.parse(content);
                    metadata.url = `/library/${type}/${metadata.filename}`;
                    assets.push(metadata);
                } catch (e) {
                    // Skip invalid JSON files
                }
            }
        }

        // Sort by createdAt descending (newest first)
        assets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        res.json(assets);
    } catch (error) {
        console.error('List assets error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete an asset
app.delete('/api/assets/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;

        if (!['images', 'videos'].includes(type)) {
            return res.status(400).json({ error: 'Invalid asset type' });
        }

        const targetDir = type === 'images' ? IMAGES_DIR : VIDEOS_DIR;
        const ext = type === 'images' ? 'png' : 'mp4';
        const assetPath = path.join(targetDir, `${id}.${ext}`);
        const metaPath = path.join(targetDir, `${id}.json`);

        if (fs.existsSync(assetPath)) fs.unlinkSync(assetPath);
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);

        res.json({ success: true });
    } catch (error) {
        console.error('Delete asset error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// CHAT AGENT API
// NOTE: Currently using LangGraph.js. If more complex agent capabilities
// are needed (multi-agent, advanced tools), consider migrating to Python.
// ============================================================================

// Send a message to the chat agent
app.post('/api/chat', async (req, res) => {
    try {
        const { sessionId, message, media } = req.body;

        if (!API_KEY) {
            return res.status(500).json({ error: "Server missing API Key config" });
        }

        if (!sessionId) {
            return res.status(400).json({ error: "sessionId is required" });
        }

        if (!message && !media) {
            return res.status(400).json({ error: "message or media is required" });
        }

        const result = await chatAgent.sendMessage(sessionId, message, media, API_KEY);

        res.json({
            success: true,
            response: result.response,
            topic: result.topic,
            messageCount: result.messageCount
        });
    } catch (error) {
        console.error("Chat API Error:", error);
        res.status(500).json({ error: error.message || "Chat failed" });
    }
});

// List all chat sessions
app.get('/api/chat/sessions', async (req, res) => {
    try {
        const sessions = chatAgent.listSessions();
        res.json(sessions);
    } catch (error) {
        console.error("List sessions error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Delete a chat session
app.delete('/api/chat/sessions/:id', async (req, res) => {
    try {
        chatAgent.deleteSession(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error("Delete session error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get full session data (for loading a specific chat)
app.get('/api/chat/sessions/:id', async (req, res) => {
    try {
        const sessionData = chatAgent.getSessionData(req.params.id);
        if (!sessionData) {
            return res.status(404).json({ error: "Session not found" });
        }
        res.json(sessionData);
    } catch (error) {
        console.error("Get session error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
