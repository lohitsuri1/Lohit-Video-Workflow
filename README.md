Download all the generated videos and use a free professional video editor like **DaVinci Resolve** (recommended for India 🇮🇳 — no watermark, no ban) or **VN Video Editor** (mobile) to create a final video. See [DaVinci Resolve Workflow Guide](docs/davinci-resolve-workflow.md) for step-by-step instructions. Check result below.

---

## 🎬 Gemini Veo 2 Short Video Generation

This project supports generating short video clips using Google's **Veo 2** model (`veo-2.0-generate-001`) via the Gemini API.

### Setting Up the `GEMINI_API_KEY` GitHub Actions Secret

1. Go to [Repository Secrets](https://github.com/lohitsuri1/Lohit-Video-Workflow/settings/secrets/actions)
2. Click **New repository secret**
3. Name: `GEMINI_API_KEY`
4. Value: Your Google Gemini API key
5. Click **Add secret**

### Using the Video Generation Endpoint

Send a `POST` request to `/api/generate/video`:

```json
{
  "prompt": "A golden sunset over ocean waves, cinematic style, smooth camera pan",
  "aspectRatio": "16:9",
  "durationSeconds": 8
}
```

**Response:**
```json
{
  "filePath": "/library/videos/veo2-1700000000000.mp4"
}
```

### Running the GitHub Actions Workflow Manually

1. Go to the [Actions tab](https://github.com/lohitsuri1/Lohit-Video-Workflow/actions)
2. Select **Generate Test Video with Gemini Veo**
3. Click **Run workflow** → **Run workflow**

The workflow will use the `GEMINI_API_KEY` secret to generate a test video clip and save it to `library/videos/test-clip.mp4`.

### Local Setup

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```
