# Scripts

This directory contains standalone utility scripts for the TwitCanva project.

---

## `generate-demo-video.js` — Devotional Demo Video Generator

Generates a devotional demo video in two steps:

1. **Gemini image generation** – creates a devotional image from a text prompt  
2. **Kling V1.6 image-to-video** – animates the image into a 5-second video clip

### Output files

| File | Description |
|------|-------------|
| `library/images/demo_devotional.png` | Generated devotional image |
| `library/videos/demo_devotional.mp4` | Animated 5-second video |

### Prerequisites

1. **Node.js 18+** (uses native `fetch`)
2. A `.env` file in the project root containing the following keys:

```env
# Google Gemini API key
# Get one at: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Kling AI credentials
# Get them at: https://klingai.com/dev (Developer Console → API Keys)
KLING_ACCESS_KEY=your_kling_access_key_here
KLING_SECRET_KEY=your_kling_secret_key_here
```

If the `.env` file is missing or any key is absent, the script will print a
clear error message explaining which keys are needed and where to obtain them.

### Running the script

```bash
# Using the npm script (recommended)
npm run demo:video

# Or directly
node scripts/generate-demo-video.js
```

### What the script does

1. Validates that all required API keys are present in `.env`.
2. Calls the **Gemini** image generation API with the prompt:  
   *"Lord Ganesha in golden light, divine temple background, cinematic 4K, soft ethereal glow, ultra realistic"*
3. Saves the resulting PNG to `library/images/demo_devotional.png`.
4. Submits the image to the **Kling V1.6** image-to-video API (5 seconds, 720p, standard mode).
5. Polls the Kling task until it completes (up to 5 minutes).
6. Downloads and saves the final MP4 to `library/videos/demo_devotional.mp4`.
7. Prints a summary with file paths and a cost estimate.

### Cost estimate

| Item | Estimated cost |
|------|----------------|
| Kling V1.6 – 5-second clip (standard mode) | **$0.01 – $0.025** |
| Gemini image generation | Varies by plan / free tier |

> **Note:** API keys are never hardcoded. Always keep your `.env` file out of
> version control (it is already listed in `.gitignore`).
