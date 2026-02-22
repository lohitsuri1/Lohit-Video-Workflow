# Assets Directory

Place your input files here before running `pipeline.py`.

## Directory Structure

```
assets/
├── images/
│   └── radha_krishna.jpg   # Input image (JPG or PNG)
└── music/
    └── background.mp3      # Background music (MP3 or WAV)
```

## Getting Assets Automatically

Run the downloader script to fetch free, open-licensed assets:

```bash
python download_assets.py
```

This fetches:
- **Image**: A public-domain Radha-Krishna devotional painting from [Wikimedia Commons](https://commons.wikimedia.org)
- **Audio**: A public-domain devotional music track from [Internet Archive](https://archive.org)

## Getting Assets Manually

### Images (open-license)
- [Wikimedia Commons – Radha Krishna](https://commons.wikimedia.org/wiki/Category:Radha_Krishna)
- [Pixabay – Krishna search](https://pixabay.com/images/search/krishna/) (free for commercial use)

### Music (royalty-free)
- [Pixabay Music – Meditation](https://pixabay.com/music/search/meditation/) (free for commercial use)
- [Free Music Archive – Meditation](https://freemusicarchive.org/search?q=meditation) (check individual licenses)
- [Internet Archive – devotional music](https://archive.org/search?query=krishna+chant&mediatype=audio)
