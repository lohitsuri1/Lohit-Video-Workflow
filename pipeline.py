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


def generate_video(image_path: str, audio_path: str, output_path: str) -> None:
    """
    Combine *image_path* and *audio_path* into a high-quality MP4 at *output_path*.

    FFmpeg settings:
      - libx264 with -tune stillimage  → optimised for a single static frame
      - scale to 1920×1080 with letterbox padding  → always 1080p output
      - AAC audio at 192k bitrate
      - yuv420p pixel format for broad playback compatibility
      - -shortest  → video length equals the audio duration
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    vf = (
        "scale=1920:1080:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2"
    )

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", image_path,
        "-i", audio_path,
        "-c:v", "libx264", "-tune", "stillimage",
        "-c:a", "aac", "-b:a", "192k",
        "-vf", vf,
        "-pix_fmt", "yuv420p",
        "-shortest",
        output_path,
    ]

    print("▶  Running FFmpeg …")
    print("   " + " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        stderr_tail = result.stderr[-2000:] if result.stderr else "(no output)"
        print(stderr_tail, file=sys.stderr)
        raise RuntimeError(f"FFmpeg failed (exit code {result.returncode})")

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"\n✅  Video saved: {output_path} ({size_mb:.1f} MB)")


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
