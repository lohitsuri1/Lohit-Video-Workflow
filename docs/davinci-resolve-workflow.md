# 🎬 DaVinci Resolve Workflow Guide

> **For Indian users and anyone looking for a professional, free, watermark-free video editor.**  
> CapCut is banned in India — DaVinci Resolve by Blackmagic Design is the best free replacement for assembling AI-generated devotional or creative videos.

---

## 📥 Installation

1. Download **DaVinci Resolve (Free)** from: https://www.blackmagicdesign.com/products/davinciresolve
2. Install and launch — no account required for the free version
3. No watermark, no export limits, supports up to **4K export for free**

---

## 🕉️ Complete Devotional Video Workflow (15 Minutes)

### Step 1 — Generate Assets with TwitCanva

Use your TwitCanva canvas to generate all AI assets:

1. **Open TwitCanva** (`npm run dev` → http://localhost:5173)
2. **Right-click canvas** → Add Nodes → **Image Node**
3. Enter devotional prompts, for example:
   - "Lord Ganesha in golden light, divine temple background, cinematic 4K"
   - "Sacred lotus flower in calm water, sunrise, ultra realistic"
   - "Ancient Shiva temple in misty mountains, golden hour"
4. **Generate images** using Stable Diffusion (local/free) or Gemini Pro
5. **Connect Image → Video Node** to animate key scenes using Kling V1.6
6. **Export all clips** to `library/videos/` using the Video Editor Node

> 📖 See [video-editor-node.md](./video-editor-node.md) for trimming clips before export.

---

### Step 2 — Download Free Devotional Assets (India-safe sources)

| Asset Type | Source | Cost |
|---|---|---|
| 🖼️ Deity images | [Wikimedia Commons](https://commons.wikimedia.org) | FREE |
| 🌸 Nature/flower imagery | [Unsplash](https://unsplash.com), [Pexels](https://pexels.com) | FREE |
| 🕉️ Mandala / spiritual art | [Pixabay](https://pixabay.com/images/search/mandala/) | FREE |
| 🎵 Bhajan / mantra music | [YouTube Audio Library](https://studio.youtube.com) | FREE |
| 🎵 Royalty-free devotional | [Free Music Archive](https://freemusicarchive.org) | FREE |

---

### Step 3 — Set Up DaVinci Resolve Project

1. **Open DaVinci Resolve** → New Project → Name it (e.g., `Devotional_Video_Feb2026`)
2. Go to **File → Project Settings**:
   - Timeline Resolution: `1920 x 1080 HD`
   - Timeline Frame Rate: `25 fps` (standard for India)
   - Playback Frame Rate: `25`
3. Click **Save**

---

### Step 4 — Import All Assets into Media Pool

1. Go to the **Media** tab (top left)
2. Click **Import Media** or drag and drop:
   - All MP4 clips from `library/videos/`
   - All PNG images from `library/images/`
   - Downloaded devotional images (JPG/PNG)
   - Background music (MP3/WAV)
3. Organize in **bins** (right-click → Add Bin):
   - 📁 `AI_Clips` — Kling/Hailuo generated videos
   - 📁 `Images` — Static devotional images
   - 📁 `Music` — Bhajan/background tracks
   - 📁 `Overlays` — Mandalas, text graphics

---

### Step 5 — Build the 15-Minute Timeline

Go to the **Edit** tab and assemble your timeline:

#### Recommended 15-Minute Structure

```
00:00 - 00:30  → Opening title card (image + fade in + title text)
00:30 - 02:00  → Intro devotional scene (AI animated clip, slow music)
02:00 - 05:00  → Deity/Temple scenes (mix of AI clips + static images with Ken Burns)
05:00 - 07:00  → Nature/Mandala visuals (AI generated imagery)
07:00 - 10:00  → Verse/Mantra section (text overlays on scenic imagery)
10:00 - 13:00  → Deeper devotional scenes (cinematic AI clips)
13:00 - 14:30  → Closing blessing scene (soft fade, music swells)
14:30 - 15:00  → Outro/title card (fade to black)
```

#### Adding Ken Burns Effect to Static Images

1. Drag a static image to the timeline
2. Click the image clip → open **Inspector** (top right)
3. Enable **Dynamic Zoom** — this gives a smooth cinematic pan/zoom
4. Adjust start and end zoom position for each image

---

### Step 6 — Add Devotional Text / Slokas

1. Go to **Effects Library** (top left) → **Titles** → **Text+**
2. Drag a **Text+** title onto the timeline above your clip
3. Double-click the title → type your Sanskrit shloka or devotional text
4. Customize:
   - Font: Use `Noto Serif` or `Devanagari` fonts for Hindi/Sanskrit text
   - Color: Gold (`#FFD700`) or white on dark backgrounds
   - Size: 60–80px for subtitles, 100px+ for title cards
5. Add **Fade In/Out** transitions via the Inspector → Composite tab

---

### Step 7 — Add Background Music

1. Drag your bhajan/mantra MP3 to the **A1 audio track** in the timeline
2. Right-click the audio clip → **Change Clip Speed** if needed to match video length
3. Use the **Mixer** panel to set volume level (~-12 dB for background)
4. Add a **Fade In** at the start and **Fade Out** at the end:
   - Hover over the clip's corner → drag the white fade handle

#### Adding Narration (Optional)
1. Go to **Fairlight** tab for advanced audio
2. Record voice narration directly or import MP3
3. Use **EQ** and **Compressor** plugins for clean devotional narration

---

### Step 8 — Color Grade for Devotional Warmth

1. Go to the **Color** tab
2. Select all clips (Ctrl+A in timeline)
3. Apply a warm, golden look:
   - **Lift**: Slightly increase Red/Green (warm shadows)
   - **Gamma**: Push towards amber/gold midtones
   - **Gain**: Brighten highlights slightly
4. Apply **LUT** (optional): Download free "Golden Hour" or "Warm Cinematic" LUTs from [LUTify.me](https://lutify.me/free-luts/) and load via Color → LUTs

---

### Step 9 — Export the Final Video

1. Go to the **Deliver** tab
2. Choose **Custom Export**:
   - Format: `MP4`
   - Codec: `H.264`
   - Resolution: `1920 x 1080`
   - Frame Rate: `25`
   - Quality: `Restrict to 10,000 Kb/s` (good balance of size and quality)
3. Click **Add to Render Queue**
4. Click **Start Render**
5. Your final video will be saved to your chosen output folder ✅

---

## 📱 Mobile Alternative: VN Video Editor (India-safe)

If you are on mobile or don't have a powerful PC:

| Step | Action |
|---|---|
| 1 | Transfer all `library/videos/` clips to your phone via USB/Google Drive |
| 2 | Open **VN Video Editor** (free, no watermark, available on Android/iOS) |
| 3 | Create new project → Import all clips + images |
| 4 | Arrange timeline → Add music → Add text for shlokas |
| 5 | Export in **1080p** — completely free, no watermark |

> **Download VN Video Editor**: https://www.vnvideoedit.com/

---

## 💰 Cost Summary (India — DaVinci Resolve Workflow)

| Item | Tool | Cost |
|---|---|---|
| AI image generation | Stable Diffusion (local) | ₹0 |
| Free devotional images | Wikimedia / Pixabay | ₹0 |
| Background bhajan music | YouTube Audio Library | ₹0 |
| AI cinematic clips (10 × 5s) | Kling V1.6 API | ~₹35–₹130 |
| Final video assembly | **DaVinci Resolve** | ₹0 |
| Text/slokas overlays | Built into DaVinci | ₹0 |
| Color grading + export | Built into DaVinci | ₹0 |
| **Total per 15-min video** | | **~₹35–₹130** |

---

## 🛠️ Troubleshooting

### DaVinci Resolve is slow on my PC
- Go to **Preferences → Memory and GPU** → enable GPU acceleration
- Reduce playback quality to **Quarter** during editing (top right of viewer)
- Optimized media: Right-click clips → **Generate Optimized Media**

### Video clips from TwitCanva not importing
- Ensure clips are in `.mp4` (H.264) format — check `library/videos/`
- If `.webm` format: convert using FFmpeg: `ffmpeg -i input.webm output.mp4`

### Hindi / Sanskrit fonts not showing
- Download **Noto Serif Devanagari** from [Google Fonts](https://fonts.google.com/noto/specimen/Noto+Serif+Devanagari)
- Install on your system → restart DaVinci Resolve

---

## 🔗 Related Docs

- [Video Editor Node](./video-editor-node.md) — Trim clips inside TwitCanva before exporting
- [Local Model Support](./local-model-support.md) — Run Stable Diffusion locally for free image generation
- [Camera Angle Control](./camera-angle-control.md) — Add cinematic camera movement to images

---

*DaVinci Resolve is developed by Blackmagic Design (Australia) — not subject to India's app ban. Free version has no watermark and supports full HD export.*