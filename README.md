Download all the generated videos and use a free professional video editor like **DaVinci Resolve** (recommended for India 🇮🇳 — no watermark, no ban) or **VN Video Editor** (mobile) to create a final video. See [DaVinci Resolve Workflow Guide](docs/davinci-resolve-workflow.md) for step-by-step instructions. Check result below.

---

## 🎬 Basic Video Pipeline (Python + FFmpeg)

The simplest way to generate a high-quality devotional video: one static image
+ background music → 1080p MP4 with audio, all done locally with Python and FFmpeg.

### Prerequisites

**FFmpeg** must be installed:

```bash
# Ubuntu / Debian
sudo apt-get update && sudo apt-get install -y ffmpeg

# macOS (Homebrew)
brew install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html and add to PATH
```

**Python dependencies:**

```bash
pip install -r requirements-pipeline.txt
```

> 💡 **Using GitHub Actions?** The [Generate Devotional Video (Python Pipeline)](../../actions/workflows/generate-pipeline-video.yml) workflow installs all prerequisites (FFmpeg, Python dependencies, assets) automatically — no manual setup required.

### Quick Start

```bash
# 1. Download free, open-licensed assets (image + music)
python download_assets.py

# 2. Generate the video
python pipeline.py
```

The output is saved to `output/final_video.mp4`.

### Folder Structure

```
Lohit-Video-Workflow/
├── assets/
│   ├── images/
│   │   └── radha_krishna.jpg   # input image (auto-downloaded or place your own)
│   └── music/
│       └── background.mp3      # input audio  (auto-downloaded or place your own)
├── output/
│   └── final_video.mp4         # generated video (1080p, AAC 192k)
├── pipeline.py                 # main video generation script
└── download_assets.py          # fetches free/open-licensed assets
```

### Custom Assets

You can use your own image and audio files:

```bash
python pipeline.py --image path/to/image.jpg --audio path/to/music.mp3 --output output/my_video.mp4
```

### Video Quality

- Resolution: **1920×1080** (1080p) with letterbox padding
- Video codec: **libx264** (CRF 20, `fast` preset — high quality, efficient encode)
- Audio codec: **AAC 192k**
- Pixel format: **yuv420p** (broad compatibility)
- Duration: equals the audio track length
- **Auto quality enhancements** applied by `pipeline.py`:
  - 🎨 Warm golden colour grade (saturation +20%, reds +8%, blues -8%, brightness +3%)
  - 🔍 Gentle sharpening (unsharp 5×5 luma mask)
  - 🌅 2-second black fade-in and fade-out

### FFmpeg Filters Used

```bash
# pipeline.py automatically detects audio duration and computes fade-out start.
# The command below shows the structure; <duration-2> is replaced at runtime.
ffmpeg -loop 1 -i assets/images/radha_krishna.jpg -i assets/music/background.mp3 \
  -c:v libx264 -crf 20 -preset fast -c:a aac -b:a 192k \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,
       pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=25,
       unsharp=5:5:0.8:5:5:0.0,
       eq=brightness=0.03:saturation=1.2:gamma_r=1.08:gamma_b=0.92,
       fade=t=in:st=0:d=2,fade=t=out:st=<duration-2>:d=2" \
  -pix_fmt yuv420p -shortest output/final_video.mp4
# Note: replace <duration-2> with your audio duration minus 2 (e.g. 178 for a 180s track).
#       pipeline.py calculates this automatically via ffprobe.
```

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
