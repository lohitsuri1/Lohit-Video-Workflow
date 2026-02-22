"""
download_assets.py

Downloads free, open-licensed assets required by pipeline.py:

  Image : Wikimedia Commons – a public-domain Radha-Krishna devotional painting
  Audio : Internet Archive  – a public-domain / CC devotional music track

Downloaded files are placed in:
    assets/images/radha_krishna.jpg
    assets/music/background.mp3

Both sources are checked against expected magic bytes before saving to disk.
HTTPS is enforced for all downloads.

Usage:
    python download_assets.py
"""

import os
import sys
import urllib.request
import urllib.parse
import json
import shutil
from typing import Optional

# ── Output paths ──────────────────────────────────────────────────────────────

IMAGES_DIR  = os.path.join("assets", "images")
MUSIC_DIR   = os.path.join("assets", "music")
IMAGE_PATH  = os.path.join(IMAGES_DIR, "radha_krishna.jpg")
AUDIO_PATH  = os.path.join(MUSIC_DIR,  "background.mp3")

# Bot-policy-compliant User-Agent (required by Wikimedia)
USER_AGENT  = "DevotionalVideoBot/1.0 (github.com/lohitsuri1/Lohit-Video-Workflow)"

# Network timeouts (seconds)
TIMEOUT = 30

# ── Security helpers ──────────────────────────────────────────────────────────

def _https_only(url: str) -> None:
    """Raise ValueError if *url* is not HTTPS."""
    if not url.startswith("https://"):
        raise ValueError(f"[Security] Refusing non-HTTPS URL: {url}")


def _validate_magic(path: str, expected: str) -> None:
    """
    Check the file's magic bytes.
    *expected* is 'image' (JPEG/PNG) or 'audio' (MP3/OGG).
    Deletes the file and raises ValueError on mismatch.
    """
    with open(path, "rb") as fh:
        header = fh.read(12)

    is_jpeg = header[:2] == b"\xff\xd8"
    is_png  = header[:4] == b"\x89PNG"
    is_mp3  = header[:3] == b"ID3" or (len(header) >= 2 and header[0] == 0xFF and (header[1] & 0xE0) == 0xE0)
    is_ogg  = header[:4] == b"OggS"

    valid = (is_jpeg or is_png) if expected == "image" else (is_mp3 or is_ogg)
    if not valid:
        os.unlink(path)
        raise ValueError(
            f"[Security] Unexpected file header for {os.path.basename(path)} "
            f"(expected {expected}, got 0x{header[:4].hex()})"
        )


def _download(url: str, dest: str, extra_headers: Optional[dict] = None) -> None:
    """Download *url* to *dest* over HTTPS with redirect following."""
    _https_only(url)
    headers = {"User-Agent": USER_AGENT}
    if extra_headers:
        headers.update(extra_headers)

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp, open(dest, "wb") as fh:
        shutil.copyfileobj(resp, fh)


def _fetch_json(url: str, extra_headers: Optional[dict] = None) -> dict:
    """Fetch *url* and return parsed JSON."""
    _https_only(url)
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode())

# ── Image download ─────────────────────────────────────────────────────────────

# Well-known public-domain Radha-Krishna painting on Wikimedia Commons.
# This is "Radha and Krishna in the Grove" (18th-century Pahari painting,
# public domain in all jurisdictions).
_WIKIMEDIA_TITLE = "File:Radha and Krishna in the grove - Google Art Project.jpg"

def download_image(dest: str) -> bool:
    """
    Download a public-domain Radha-Krishna image from Wikimedia Commons.
    Returns True on success, False on failure.
    """
    print("📷  Downloading image from Wikimedia Commons …")
    try:
        encoded_title = urllib.parse.quote(_WIKIMEDIA_TITLE, safe=":/")
        info_url = (
            "https://commons.wikimedia.org/w/api.php"
            f"?action=query&titles={encoded_title}"
            f"&prop=imageinfo&iiprop=url&iiurlwidth=1920&format=json"
        )
        data   = _fetch_json(info_url)
        pages  = data.get("query", {}).get("pages", {})
        page   = next(iter(pages.values()))
        img_url = (
            page.get("imageinfo", [{}])[0].get("thumburl")
            or page.get("imageinfo", [{}])[0].get("url")
        )
        if not img_url:
            raise ValueError("No image URL in Wikimedia API response")

        tmp = dest + ".tmp"
        _download(img_url, tmp)
        _validate_magic(tmp, "image")
        os.replace(tmp, dest)
        size_kb = os.path.getsize(dest) / 1024
        print(f"   ✔  Saved: {dest} ({size_kb:.0f} KB)")
        return True
    except Exception as exc:
        print(f"   ⚠  Wikimedia download failed: {exc}")
        # Clean up partial files
        for p in [dest, dest + ".tmp"]:
            if os.path.exists(p):
                os.unlink(p)
        return False

# ── Audio download ─────────────────────────────────────────────────────────────

# A public-domain Sanskrit chant recording on Internet Archive.
# "Hare Krishna Maha Mantra" – uploaded by user nataraj108, CC0 / public domain.
_IA_IDENTIFIER = "HareKrishnaMahaMantra"

def download_audio(dest: str) -> bool:
    """
    Download a public-domain devotional music track from Internet Archive.
    Returns True on success, False on failure.
    """
    print("🎵  Downloading audio from Internet Archive …")
    try:
        files_url = f"https://archive.org/metadata/{_IA_IDENTIFIER}/files"
        data  = _fetch_json(files_url)
        files = data.get("result", [])

        # Pick the smallest MP3 (keeps download fast in CI)
        mp3_files = [
            f for f in files
            if f.get("name", "").lower().endswith(".mp3")
            and int(f.get("size", 0)) > 0
        ]
        if not mp3_files:
            raise ValueError("No MP3 files found in Internet Archive item")

        audio_file = min(mp3_files, key=lambda f: int(f.get("size", 0)))
        audio_url  = (
            f"https://archive.org/download/{_IA_IDENTIFIER}/"
            + urllib.parse.quote(audio_file["name"])
        )
        size_mb = int(audio_file.get("size", 0)) / (1024 * 1024)
        print(f"   ⬇  {audio_file['name']} ({size_mb:.1f} MB)")

        tmp = dest + ".tmp"
        _download(audio_url, tmp)
        _validate_magic(tmp, "audio")
        os.replace(tmp, dest)
        print(f"   ✔  Saved: {dest}")
        return True
    except Exception as exc:
        print(f"   ⚠  Internet Archive download failed: {exc}")
        for p in [dest, dest + ".tmp"]:
            if os.path.exists(p):
                os.unlink(p)
        return False


def download_audio_fallback(dest: str) -> bool:
    """
    Fallback: download a short royalty-free ambient track from a known URL
    on the Internet Archive (different item).
    Returns True on success, False on failure.
    """
    print("🎵  Trying fallback audio source …")
    # 'Om Namah Shivaya' chant – public domain on Internet Archive
    fallback_url = (
        "https://archive.org/download/om-namah-shivaya-chant/"
        "om-namah-shivaya-chant.mp3"
    )
    try:
        tmp = dest + ".tmp"
        _download(fallback_url, tmp)
        _validate_magic(tmp, "audio")
        os.replace(tmp, dest)
        print(f"   ✔  Saved: {dest}")
        return True
    except Exception as exc:
        print(f"   ⚠  Fallback audio failed: {exc}")
        for p in [dest, dest + ".tmp"]:
            if os.path.exists(p):
                os.unlink(p)
        return False

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    os.makedirs(IMAGES_DIR, exist_ok=True)
    os.makedirs(MUSIC_DIR,  exist_ok=True)

    print("=" * 55)
    print("  Devotional Video Asset Downloader")
    print("=" * 55)

    # ── Image ──────────────────────────────────────────────────
    if os.path.isfile(IMAGE_PATH):
        print(f"📷  Image already present: {IMAGE_PATH}")
    else:
        ok = download_image(IMAGE_PATH)
        if not ok:
            print(
                "\n❌  Could not download image automatically.\n"
                "   Please place any JPG/PNG image at:\n"
                f"     {IMAGE_PATH}\n"
                "   Free sources:\n"
                "     • https://commons.wikimedia.org (search 'Radha Krishna painting')\n"
                "     • https://pixabay.com/images/search/krishna/\n",
                file=sys.stderr,
            )
            sys.exit(1)

    # ── Audio ──────────────────────────────────────────────────
    if os.path.isfile(AUDIO_PATH):
        print(f"🎵  Audio already present: {AUDIO_PATH}")
    else:
        ok = download_audio(AUDIO_PATH)
        if not ok:
            ok = download_audio_fallback(AUDIO_PATH)
        if not ok:
            print(
                "\n❌  Could not download audio automatically.\n"
                "   Please place any MP3/WAV file at:\n"
                f"     {AUDIO_PATH}\n"
                "   Free sources:\n"
                "     • https://pixabay.com/music/search/meditation/\n"
                "     • https://freemusicarchive.org/search?q=meditation\n",
                file=sys.stderr,
            )
            sys.exit(1)

    print("\n✅  All assets ready. Run the pipeline with:")
    print("      python pipeline.py")


if __name__ == "__main__":
    main()
