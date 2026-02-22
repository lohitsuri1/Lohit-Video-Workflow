"""
pipeline.py

High-quality video generator: combines a static image with background music
using FFmpeg to produce a properly muxed MP4 video.

Usage:
    python pipeline.py [--image PATH] [--audio PATH] [--output PATH]

Defaults:
    --image  assets/images/radha_krishna.jpg
    --audio  assets/music/background.mp3
    --output output/final_video.mp4

The script auto-downloads placeholder assets if the default files are missing.
Run `python download_assets.py` first to fetch free/open-licensed assets.

Auto quality enhancements applied on every run:
  - Warm golden colour grade (saturation +20 %, reds +8 %, blues -8 %, brightness +3 %)
  - Gentle sharpening        (unsharp 5×5 luma mask)
  - 2-second black fade-in and fade-out
  - libx264 CRF 20 with fast preset  (high quality, smaller file than default)
  - Scale to 1920×1080 with letterbox padding
  - AAC 192 kbps audio
  - yuv420p for broad playback compatibility
"""

import argparse
import os
import subprocess
import sys


DEFAULT_IMAGE  = os.path.join("assets", "images", "radha_krishna.jpg")
DEFAULT_AUDIO  = os.path.join("assets", "music",  "background.mp3")
DEFAULT_OUTPUT = os.path.join("output", "final_video.mp4")


def check_ffmpeg() -> None:
    """Raise RuntimeError if ffmpeg is not available on PATH."""
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
    except FileNotFoundError:
        raise RuntimeError(
            "ffmpeg not found. Install it with:\n"
            "  Linux/macOS : sudo apt-get install -y ffmpeg  (or brew install ffmpeg)\n"
            "  Windows     : https://ffmpeg.org/download.html"
        )


def get_audio_duration(audio_path: str) -> float:
    """Return the audio duration in seconds using ffprobe, or 0.0 on failure."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", audio_path],
        capture_output=True, text=True,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return 0.0
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def generate_video(image_path: str, audio_path: str, output_path: str) -> None:
    """
    Combine *image_path* and *audio_path* into a high-quality MP4 at *output_path*.

    Auto quality enhancements:
      - Warm golden colour grade  (saturation +20 %, reds +8 %, blues -8 %, brightness +3 %)
      - Gentle sharpening         (unsharp 5×5 luma mask)
      - 2-second black fade-in and fade-out
      - libx264 CRF 20 with fast preset  → high quality, compact file
      - Scale to 1920×1080 with letterbox padding
      - AAC audio at 192 kbps
      - yuv420p pixel format for broad playback compatibility
      - -shortest  → video length equals the audio duration
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    fps = 25
    duration = get_audio_duration(audio_path)

    vf_parts = [
        "scale=1920:1080:force_original_aspect_ratio=decrease",
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
        f"fps={fps}",
        # Auto quality enhancements
        "unsharp=5:5:0.8:5:5:0.0",
        "eq=brightness=0.03:saturation=1.2:gamma_r=1.08:gamma_b=0.92",
        "fade=t=in:st=0:d=2",
    ]
    if duration > 4:
        vf_parts.append(f"fade=t=out:st={duration - 2:.1f}:d=2")
    vf = ",".join(vf_parts)

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", image_path,
        "-i", audio_path,
        "-c:v", "libx264", "-crf", "20", "-preset", "fast",
        "-c:a", "aac", "-b:a", "192k",
        "-vf", vf,
        "-pix_fmt", "yuv420p",
        "-shortest",
        output_path,
    ]

    print("▶  Running FFmpeg with quality enhancements …")
    print("   Filters: warm colour grade · sharpening · fade in/out")
    print("   " + " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        stderr_tail = result.stderr[-2000:] if result.stderr else "(no output)"
        print(stderr_tail, file=sys.stderr)
        raise RuntimeError(f"FFmpeg failed (exit code {result.returncode})")

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"\n✅  Video saved: {output_path} ({size_mb:.1f} MB)")
    print("   Quality: 1920×1080 | CRF 20 | AAC 192k | Warm grade | Sharpened | Fade in/out")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Combine an image and audio file into a high-quality MP4 video."
    )
    parser.add_argument("--image",  default=DEFAULT_IMAGE,
                        help=f"Input image (default: {DEFAULT_IMAGE})")
    parser.add_argument("--audio",  default=DEFAULT_AUDIO,
                        help=f"Input audio (default: {DEFAULT_AUDIO})")
    parser.add_argument("--output", default=DEFAULT_OUTPUT,
                        help=f"Output video path (default: {DEFAULT_OUTPUT})")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    # Validate inputs exist
    for label, path in [("Image", args.image), ("Audio", args.audio)]:
        if not os.path.isfile(path):
            print(
                f"❌  {label} file not found: {path}\n"
                "   Run `python download_assets.py` to fetch free assets,\n"
                "   or pass --image / --audio with your own files.",
                file=sys.stderr,
            )
            sys.exit(1)

    check_ffmpeg()
    generate_video(args.image, args.audio, args.output)


if __name__ == "__main__":
    main()
