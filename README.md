# Subra

Cross-platform native video library, `yt-dlp` downloader, local Whisper speech recognition, and AI bilingual subtitle translator — built with **Native Shell (`nsh`)** (Rust + TSX).

## Features

- **Local Video Library**: Plain folder-per-video structure (`item.json`, `cover.jpg`, `subtitles.srt`, `summary.md`), FFmpeg metadata & cover extraction, native `<Video>` playback with resume, speed control, and keyboard shortcuts (`Space`, `←/→`, `↑/↓`, `[/]`, `Esc`).
- **YouTube & X Downloads**: Built-in `yt-dlp` metadata preview and one-click download with quality selector, auto-subtitles, and HTTP/SOCKS proxy support.
- **Local Whisper Transcription**: Metal GPU-accelerated `whisper-cli` with real-time progress bar and live sentence-by-sentence streaming subtitles.
- **AI Subtitle Translation & Summary**: Concurrent OpenAI-compatible batch translation (19 built-in providers + custom headers), persistent translation cache, bilingual `.srt` / `.vtt` / `.txt` export, and one-click AI video summary (`summary.md`).
- **Cross-Platform Component Setup**: Automatic startup health check and one-click installer for `yt-dlp`, `FFmpeg`, `whisper-cli`, and Whisper GGML models on macOS and Windows.

## Development

```bash
# Install Native Shell CLI
curl -fsSL https://nsh.dev/install.sh | sh

# Run macOS desktop app
nsh run

# Type-check & test
nsh check
nsh test
```

## Packaging

```bash
# macOS (.app)
nsh package --target macos --arch arm64 --out dist

# Windows (.exe + .zip)
nsh package --target windows --out dist
```

Pushing a `v*` tag triggers [GitHub Actions](.github/workflows/release.yml) to automatically build and publish macOS (`arm64`) and Windows (`x64`) release archives to GitHub Releases.
