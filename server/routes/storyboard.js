/**
 * storyboard.js
 * 
 * Routes for AI storyboard script generation.
 * Uses Gemini 2.0 Flash for generating scene descriptions from user story input.
 */

import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();

/**
 * Helper to retry async operations with exponential backoff
 */
async function retryOperation(operation, maxRetries = 3, initialDelayMs = 2000) {
    let delay = initialDelayMs;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            const isLastAttempt = i === maxRetries - 1;
            console.warn(`[Storyboard] API Call Failed (Attempt ${i + 1}/${maxRetries}):`, error.message);

            if (isLastAttempt) throw error;

            console.log(`[Storyboard] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
    }
}

// ============================================================================
// SCRIPT GENERATION
// ============================================================================

/**
 * Generate storyboard scripts using Gemini LLM
 * 
 * POST /api/storyboard/generate-scripts
 * Body: { story, characterDescriptions, sceneCount }
 * Returns: { scripts: [{ sceneNumber, description, cameraAngle, mood }] }
 */
router.post('/generate-scripts', async (req, res) => {
    try {
        const { story, characterDescriptions, sceneCount, characterImages } = req.body;
        const { GEMINI_API_KEY } = req.app.locals;
        const { resolveImageToBase64 } = await import('../utils/imageHelpers.js');

        if (!GEMINI_API_KEY) {
            return res.status(500).json({
                error: "Gemini API key not configured. Add GEMINI_API_KEY to .env"
            });
        }

        if (!story || !sceneCount) {
            return res.status(400).json({
                error: "Missing required fields: story and sceneCount"
            });
        }

        // Validate sceneCount
        const count = parseInt(sceneCount, 10);
        if (isNaN(count) || count < 1 || count > 10) {
            return res.status(400).json({
                error: "sceneCount must be between 1 and 10"
            });
        }

        console.log(`[Storyboard] Generating ${count} scene scripts`);

        // Initialize Gemini
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // Build character context with emphasis on visual details
        const characterContext = characterDescriptions && characterDescriptions.length > 0
            ? `\n\nCHARACTERS (create a detailed "Character DNA" for each - this MUST be repeated verbatim in every scene):\n${characterDescriptions.map((c, i) => `${i + 1}. ${c.name}: ${c.description || 'Create a detailed physical description including age, ethnicity, hair style/color, distinctive features, and exact clothing'}`).join('\n')}`
            : '';

        const systemPrompt = `You are a professional film storyboard artist and cinematographer.

Create a cinematic storyboard that tells a REAL story like a movie scene, with professional camera work.

REQUIREMENTS:
1. **Character Consistency**: 
   - If reference images are provided, use them as the ABSOLUTE GROUND TRUTH for gender, age, clothing, and physical appearance.
   - If no image is provided, create a detailed specific look and keep it consistent.

2. **Cinematic Camera Progression**: Vary camera angles like a real film:
   - Scene 1: Establishing shot (Wide/Extreme wide) - set the scene
   - Middle scenes: Mix of Medium shots, Close-ups, Over-the-shoulder
   - Final scene: Impactful shot (can be wide for epic, or close-up for emotional)

3. **Story Arc**: Beginning → Rising action → Climax → Resolution

4. **Lighting Consistency**: Maintain logical lighting throughout (time of day, indoor/outdoor)

${characterContext}

STORY SYNOPSIS:
${story}

Generate exactly ${count} scenes. Return a JSON object with:
- "styleAnchor": A consistent style description (e.g., "photorealistic, cinematic lighting, 35mm film grain, high detail")
- "characterDNA": Object with detailed description for each character that stays CONSTANT
- "scenes": Array of scene objects

Each scene must have:
- "sceneNumber": Scene number
- "description": Detailed visual description (2-3 sentences) that:
  * Uses the character's NAME primarily (do NOT repeat their physical description every time if it's already in characterDNA)
  * Describes the action, environment, and emotion
  * Specifies lighting and atmosphere
- "cameraAngle": Professional camera terminology
- "cameraMovement": Static, Pan, Tilt, Dolly, Tracking, Crane, Handheld
- "lighting": Description of lighting
- "mood": Emotional tone

Example format:
{
  "styleAnchor": "photorealistic, cinematic, 35mm film, shallow depth of field",
  "characterDNA": {
    "Shawn": "Asian male, mid-20s, pink dyed wavy hair, round wire-frame glasses, clean-shaven, wearing light blue denim jacket over white t-shirt, dark jeans"
  },
  "scenes": [
    {
      "sceneNumber": 1,
      "description": "Shawn stands in the doorway of an abandoned warehouse...",
      "cameraAngle": "Wide shot",
      "cameraMovement": "Static",
      "lighting": "Dusty beams of afternoon sunlight streaming through broken windows",
      "mood": "Mysterious, curious"
    }
  ]
}

Respond ONLY with valid JSON, no other text.`;

        // Process images for multimodal prompt
        const promptParts = [systemPrompt];

        if (characterImages && Object.keys(characterImages).length > 0) {
            console.log('[Storyboard] Processing character images for scripts...');
            for (const [name, url] of Object.entries(characterImages)) {
                try {
                    const fullDataUrl = await resolveImageToBase64(url);
                    if (fullDataUrl && fullDataUrl.startsWith('data:')) {
                        const matches = fullDataUrl.match(/^data:(.+);base64,(.+)$/);
                        if (matches) {
                            const mimeType = matches[1];
                            const rawBase64 = matches[2];

                            promptParts.push(`\nREFERENCE IMAGE FOR CHARACTER: ${name}\n(This image is the visual truth for ${name}. Ignore any conflicting text description. Ensure the script matches this character's gender, clothing, and appearance.)\n`);
                            promptParts.push({
                                inlineData: {
                                    data: rawBase64,
                                    mimeType: mimeType
                                }
                            });
                            console.log(`[Storyboard] Added ref image for scripts: ${name} (${mimeType})`);
                        }
                    }
                } catch (e) {
                    console.error(`[Storyboard] Failed to process image for ${name}:`, e.message);
                }
            }
        }

        // Call Gemini with RETRY logic
        const result = await retryOperation(() => model.generateContent(promptParts));
        const responseText = result.response.text();

        // Parse JSON from response
        let parsed;
        try {
            // Try to extract JSON from the response (handle potential markdown code blocks)
            let jsonStr = responseText;
            if (responseText.includes('```json')) {
                jsonStr = responseText.split('```json')[1].split('```')[0].trim();
            } else if (responseText.includes('```')) {
                jsonStr = responseText.split('```')[1].split('```')[0].trim();
            }

            parsed = JSON.parse(jsonStr);
        } catch (parseError) {
            console.error('[Storyboard] Failed to parse Gemini response:', parseError);
            console.error('[Storyboard] Raw response:', responseText);
            return res.status(500).json({
                error: "Failed to parse AI response. Please try again."
            });
        }

        // Extract data from parsed response
        const { styleAnchor, characterDNA, scenes } = parsed;
        const scripts = scenes || parsed.scripts || parsed;

        // Validate scripts array
        if (!Array.isArray(scripts) || scripts.length === 0) {
            return res.status(500).json({
                error: "AI returned invalid script format. Please try again."
            });
        }

        console.log(`[Storyboard] Generated ${scripts.length} scripts successfully`);

        return res.json({
            scripts,
            styleAnchor: styleAnchor || 'photorealistic, cinematic lighting, high detail',
            characterDNA: characterDNA || {}
        });

    } catch (error) {
        console.error("[Storyboard] Script Generation Error:", error);
        res.status(500).json({ error: error.message || "Script generation failed" });
    }
});

// ============================================================================
// STORY BRAINSTORMING
// ============================================================================

/**
 * Brainstorm a story using Gemini LLM based on selected characters
 * 
 * POST /api/storyboard/brainstorm-story
 * Body: { characterDescriptions, genre? }
 * Returns: { story: string }
 */
router.post('/brainstorm-story', async (req, res) => {
    try {
        const { characterDescriptions, genre } = req.body;
        const { GEMINI_API_KEY } = req.app.locals;

        if (!GEMINI_API_KEY) {
            return res.status(500).json({
                error: "Gemini API key not configured. Add GEMINI_API_KEY to .env"
            });
        }

        console.log(`[Storyboard] Brainstorming story with ${characterDescriptions?.length || 0} characters`);

        // Initialize Gemini
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // Build character context
        const characterContext = characterDescriptions && characterDescriptions.length > 0
            ? `Characters to feature in the story:\n${characterDescriptions.map((c, i) => `${i + 1}. ${c.name}: ${c.description || 'A unique character'}`).join('\n')}`
            : 'Create original characters as needed for the story.';

        const genreHint = genre ? `\nGenre preference: ${genre}` : '';

        const systemPrompt = `You are a creative storyteller specializing in visual narratives perfect for storyboards.

${characterContext}${genreHint}

Create a compelling, concise story synopsis (3-5 sentences) that would make for an exciting visual storyboard.
The story should:
- Have a clear beginning, middle, and end
- Include vivid visual moments that would look great as images
- Feature the characters in interesting situations
- Be suitable for AI image generation

Respond with ONLY the story synopsis, no additional text or formatting.`;

        // Call Gemini with RETRY
        const result = await retryOperation(() => model.generateContent(systemPrompt));
        const story = result.response.text().trim();

        console.log(`[Storyboard] Generated story: ${story.substring(0, 100)}...`);

        return res.json({ story });

    } catch (error) {
        console.error("[Storyboard] Story Brainstorm Error:", error);
        res.status(500).json({ error: error.message || "Story brainstorming failed" });
    }
});

// ============================================================================
// STORY OPTIMIZATION
// ============================================================================

/**
 * Optimize an existing story idea for visual storyboard generation
 * 
 * POST /api/storyboard/optimize-story
 * Body: { story: string }
 * Returns: { optimizedStory: string }
 */
router.post('/optimize-story', async (req, res) => {
    try {
        const { story } = req.body;
        const { GEMINI_API_KEY } = req.app.locals;

        if (!GEMINI_API_KEY) {
            return res.status(500).json({
                error: "Gemini API key not configured. Add GEMINI_API_KEY to .env"
            });
        }

        if (!story || typeof story !== 'string') {
            return res.status(400).json({
                error: "Missing required field: story"
            });
        }

        console.log(`[Storyboard] Optimizing story length: ${story.length} chars`);

        // Initialize Gemini
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const systemPrompt = `You are an expert storyboard artist and writer.
        
Your task is to REWRITE and OPTIMIZE the following story idea to make it perfect for AI image generation and storyboard creation.

ORIGINAL STORY:
"${story}"

INSTRUCTIONS:
1. Keep the core narrative, characters, and key events exactly the same.
2. Enhance visual descriptors (lighting, mood, environment, action).
3. Make the language concise, punchy, and cinematic.
4. Ensure clarity of action for each potential scene.
5. Do NOT make it too long (keep it under 150 words).

Respond with ONLY the optimized story text.`;

        const result = await retryOperation(() => model.generateContent(systemPrompt));
        const optimizedStory = result.response.text().trim();

        console.log(`[Storyboard] Optimized story: ${optimizedStory.substring(0, 50)}...`);

        return res.json({ optimizedStory });

    } catch (error) {
        console.error("[Storyboard] Story Optimization Error:", error);
        res.status(500).json({ error: error.message || "Story optimization failed" });
    }
});

// ============================================================================
// COMPOSITE STORYBOARD GENERATION
// ============================================================================

/**
 * Generate a composite storyboard image with all scenes in a grid
 * 
 * POST /api/storyboard/generate-composite
 * Body: { scripts, styleAnchor, characterDNA, sceneCount }
 * Returns: { imageUrl: string }
 */
router.post('/generate-composite', async (req, res) => {
    try {
        const { scripts, styleAnchor, characterDNA, sceneCount, characterImages } = req.body;
        const { GEMINI_API_KEY } = req.app.locals;
        const { resolveImageToBase64 } = await import('../utils/imageHelpers.js');

        if (!GEMINI_API_KEY) {
            return res.status(500).json({
                error: "Gemini API key not configured. Add GEMINI_API_KEY to .env"
            });
        }

        if (!scripts || scripts.length === 0) {
            return res.status(400).json({
                error: "Missing required field: scripts"
            });
        }

        const count = scripts.length;
        console.log(`[Storyboard] Request Recieved: Generating composite image with ${count} panels`);

        // Log deep debug info
        console.log(`[Storyboard] Style Anchor: ${styleAnchor?.substring(0, 50)}...`);
        console.log(`[Storyboard] Character DNA Keys: ${characterDNA ? Object.keys(characterDNA).join(', ') : 'None'}`);
        console.log(`[Storyboard] Reference Images Keys: ${characterImages ? Object.keys(characterImages).join(', ') : 'None'}`);

        // Determine grid layout based on scene count
        let layout;
        if (count <= 3) layout = `1x${count}`;
        else if (count === 4) layout = '2x2';
        else if (count <= 6) layout = '2x3';
        else if (count <= 9) layout = '3x3';
        else layout = '2x5';

        // Helper to normalize names for matching (remove spaces, lowercase)
        const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Prepare multimodal prompt parts
        const promptParts = [];
        let hasReferenceImages = false;
        const scriptNamesWithImages = new Set();

        // Add character reference images if available
        if (characterImages && Object.keys(characterImages).length > 0) {
            console.log('[Storyboard] Processing character reference images...');
            for (const [name, url] of Object.entries(characterImages)) {
                if (!url) continue;

                try {
                    console.log(`[Storyboard] Resolving image for: ${name}`);
                    const base64Data = resolveImageToBase64(url);
                    if (base64Data) {
                        const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
                        if (matches) {
                            const mimeType = matches[1];
                            const dataLength = matches[2].length;
                            console.log(`[Storyboard] Resolved ${name}: ${mimeType}, Size: ${(dataLength / 1024 / 1024).toFixed(2)} MB`);

                            // Try to find matching script name from DNA keys
                            let linkedScriptName = name;
                            if (characterDNA) {
                                const normName = normalize(name);
                                const match = Object.keys(characterDNA).find(k => normalize(k) === normName);
                                if (match) linkedScriptName = match;
                                else {
                                    // If no direct match, check for partial match
                                    const partialMatch = Object.keys(characterDNA).find(k => normalize(k).includes(normName) || normName.includes(normalize(k)));
                                    if (partialMatch) linkedScriptName = partialMatch;
                                }
                            }

                            // Track that this character has an image so we can strip text descriptions later
                            scriptNamesWithImages.add(linkedScriptName);

                            promptParts.push({ text: `REFERENCE IMAGE for character "${name}" (referred to as "${linkedScriptName}" in script):` });
                            promptParts.push({
                                inlineData: {
                                    mimeType: mimeType,
                                    data: matches[2]
                                }
                            });
                            hasReferenceImages = true;
                            console.log(`[Storyboard] Added reference image for ${name} (linked to ${linkedScriptName})`);
                        }
                    } else {
                        console.warn(`[Storyboard] Failed to resolve base64 for ${url}`);
                    }
                } catch (err) {
                    console.warn(`[Storyboard] Failed to resolve image for ${name}:`, err.message);
                }
            }
        }

        // Build character DNA context
        // FILTERED: Remove DNA descriptions for characters that have reference images
        const characterDNAContext = characterDNA && Object.keys(characterDNA).length > 0
            ? `\n\nCHARACTER APPEARANCES (must be consistent across ALL panels):\n${Object.entries(characterDNA)
                .filter(([name]) => !scriptNamesWithImages.has(name)) // OMIT if image exists
                .map(([name, desc]) => `- ${name}: ${desc}`)
                .join('\n')
            }`
            : '';

        // Build the composite generation prompt
        // STRIPPED: Remove parenthetical descriptions from scripts for characters with images
        const panelDescriptions = scripts.map((script, i) => {
            let cleanDesc = script.description;

            // For characters with images, strip their text description aggressively
            for (const name of scriptNamesWithImages) {
                // Escape name for regex
                const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                // Regex matches: Name (optional 's) followed by optional whitespace and ANY parenthetical group
                // We look for name, maybe 's, maybe space, then an opening paren
                const regex = new RegExp(`${escapedName}(?:'s)?\\s*\\([^)]+\\)`, 'gi');

                const before = cleanDesc;
                cleanDesc = cleanDesc.replace(regex, (match) => {
                    // Return just the name part (stripping the parenthesis)
                    return match.split('(')[0].trim();
                });

                if (before !== cleanDesc) {
                    console.log(`[Storyboard] STRIPPED description for ${name} in Panel ${i + 1}`);
                    console.log(`   BEFORE: ${before.substring(before.indexOf(name), before.indexOf(name) + 50)}...`);
                    console.log(`   AFTER:  ${cleanDesc.substring(cleanDesc.indexOf(name), cleanDesc.indexOf(name) + 20)}...`);
                } else {
                    console.log(`[Storyboard] NO MATCH for ${name} in Panel ${i + 1} (Regex: ${regex})`);
                }
            }

            return `Panel ${i + 1}: ${cleanDesc}. Camera: ${script.cameraAngle}. Mood: ${script.mood}.`;
        }).join('\n');

        console.log('[Storyboard] Panel Descriptions Being Sent to Gemini:');
        console.log(panelDescriptions.substring(0, 500) + '...');

        // FORCE UNIFORM aspect ratio and layout
        const [rows, cols] = layout.split('x');
        const compositePrompt = `Create a cohesive, professional movie storyboard sheet with ${count} panels.
        
LAYOUT INSTRUCTIONS:
- STRICT ${rows}x${cols} GRID (${rows} rows, ${cols} columns).
- ALL PANELS MUST BE EXACTLY THE SAME SIZE AND ASPECT RATIO.
- NO COLLAGES. NO VARYING ASPECT RATIOS. NO DUPLICATE PANELS.
- Do NOT Create a 2x2 grid if 1x3 is requested.
- The layout must be a perfect, regular grid.
- Draw distinct borders between panels.
- Add HIGH-CONTRAST WHITE SCENE NUMBERS (1, 2, 3...) in the top-left corner of each panel.

${hasReferenceImages ? 'IMPORTANT: USE THE PROVIDED REFERENCE IMAGES as the ABSOLUTE GROUND TRUTH for the characters\' appearance, gender, and clothing. \n- If the character name (e.g. "Fashion Model") implies a specific gender/look but the image shows otherwise, OBEY THE IMAGE.\n- Do NOT default to stereotypes. The image is the only truth.' : ''}
        
STORY CONTEXT: The panels depict a sequence where the environment changes according to the script.
        
ART STYLE: ${styleAnchor || 'photorealistic, cinematic lighting, detailed illustration'}
Maintain this exact art style, color grading, and rendering technique across all panels.

${hasReferenceImages ? 'IMPORTANT: USE THE PROVIDED REFERENCE IMAGES as the ABSOLUTE GROUND TRUTH for the characters\' facial features, hair, and body type. Do NOT change their identity. If the text description conflicts with the reference image regarding physical appearance, FOLLOW THE IMAGE. The provided scripts have stripped text descriptions for these characters to rely solely on your visual understanding of the reference image.' : ''}
        
${characterDNAContext}
        
PANEL INSTRUCTIONS:
${panelDescriptions}
        
CRITICAL: 
1. Draw all panels on a SINGLE sheet with thin borders separating them.
2. Keep character faces, body types, and clothing details 100% consistent with the reference images/descriptions.
3. LABELING: ADD A VISIBLE, HIGH-CONTRAST WHITE NUMBER (1, ${count > 1 ? '2, ' : ''}...) in the corner of each panel.`;

        console.log(`[Storyboard] Composite prompt preview: ${compositePrompt.substring(0, 100)}...`);
        console.log(`[Storyboard] Sending request to Gemini... Parts: ${promptParts.length + 1}`);

        promptParts.push({ text: compositePrompt });

        // Initialize Gemini for image generation
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: 'gemini-3-pro-image-preview',
            generationConfig: {
                // Adjusting timeout by NOT setting it (default is usually reasonable, but 503 suggests server-side limit)
                responseModalities: ['Text', 'Image']
            }
        });

        // Generate the composite image with RETRY
        const startTime = Date.now();
        const result = await retryOperation(() => model.generateContent(promptParts));
        const duration = Date.now() - startTime;
        console.log(`[Storyboard] Gemini response received in ${duration}ms`);

        const response = result.response;

        // Extract image from response
        let imageUrl = null;
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                // Save the image
                const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                const timestamp = Date.now();
                const fileName = `storyboard_composite_${timestamp}.png`;
                const fs = await import('fs/promises');
                const path = await import('path');
                const assetsDir = req.app.locals.IMAGES_DIR || './library/images';
                const filePath = path.join(assetsDir, fileName);

                await fs.writeFile(filePath, imageBuffer);
                imageUrl = `/library/images/${fileName}`;
                console.log(`[Storyboard] Composite image saved: ${imageUrl}`);
                break;
            }
        }

        if (!imageUrl) {
            return res.status(500).json({
                error: "Failed to generate composite image. Please try again."
            });
        }

        return res.json({ imageUrl });

    } catch (error) {
        console.error("[Storyboard] Composite Generation Error:", error);
        res.status(500).json({ error: error.message || "Composite generation failed" });
    }
});

export default router;
