//! yt-dlp integration for YouTube and X video metadata preview and download into Vimpo Library.

#[cfg(not(target_arch = "wasm32"))]
use std::fs;
#[cfg(not(target_arch = "wasm32"))]
use std::path::{Path, PathBuf};
#[cfg(not(target_arch = "wasm32"))]
use std::process::Command;

use nsh_core::prelude::*;
use serde::Serialize;

#[cfg(not(target_arch = "wasm32"))]
use crate::expand_tilde;
#[cfg(not(target_arch = "wasm32"))]
use crate::library::{VideoItem, hydrate_urls, now_ms, probe_media, sanitize_slug};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoPreviewResult {
    ok: bool,
    error: String,
    id: String,
    title: String,
    uploader: String,
    duration_secs: f64,
    thumbnail_url: String,
    webpage_url: String,
    source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadResult {
    ok: bool,
    error: String,
    #[cfg(not(target_arch = "wasm32"))]
    item: Option<VideoItem>,
    #[cfg(target_arch = "wasm32")]
    item: Option<serde_json::Value>,
}

#[cfg(not(target_arch = "wasm32"))]
fn find_yt_dlp() -> PathBuf {
    crate::resolve_binary_with_source("yt-dlp")
        .map(|(p, _)| p)
        .unwrap_or_else(|| PathBuf::from(crate::bin_name("yt-dlp")))
}

#[cfg(not(target_arch = "wasm32"))]
fn detect_source_from_url(url: &str) -> &'static str {
    let lower = url.to_ascii_lowercase();
    if lower.contains("x.com/") || lower.contains("twitter.com/") {
        "x"
    } else if lower.contains("youtube.com/") || lower.contains("youtu.be/") {
        "youtube"
    } else {
        "youtube"
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn format_selector(quality: &str) -> &'static str {
    match quality {
        "1080p" => "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b",
        "720p" => "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b",
        "audio" => "ba[ext=m4a]/ba",
        _ => "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn normalize_downloaded_assets(folder: &Path) -> (Option<String>, Option<String>, Option<String>) {
    let mut video_file = None;
    let mut cover_file = None;
    let mut subtitle_file = None;

    let Ok(entries) = fs::read_dir(folder) else {
        return (None, None, None);
    };

    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .collect();
    files.sort();

    for path in &files {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        let fname = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();

        if video_file.is_none()
            && matches!(ext.as_str(), "mp4" | "mkv" | "webm" | "mov" | "m4a")
        {
            video_file = Some(fname);
        } else if cover_file.is_none() && matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp") {
            let target = folder.join("cover.jpg");
            if path != &target {
                let _ = fs::rename(path, &target);
            }
            cover_file = Some("cover.jpg".to_owned());
        } else if subtitle_file.is_none() && matches!(ext.as_str(), "srt" | "vtt") {
            let dest_name = format!("subtitles.{ext}");
            let target = folder.join(&dest_name);
            if path != &target {
                let _ = fs::rename(path, &target);
            }
            subtitle_file = Some(dest_name);
        }
    }

    (video_file, cover_file, subtitle_file)
}

/// Native yt-dlp video preview and download manager.
#[module]
pub struct SubraDownloader;

#[module]
impl SubraDownloader {
    /// Fetches metadata for a YouTube or X URL using `yt-dlp --dump-json`.
    pub async fn fetch_video_info(url: String, proxy: String) -> String {
        let trimmed = url.trim().to_owned();
        if trimmed.is_empty() {
            return serde_json::to_string(&VideoPreviewResult {
                ok: false,
                error: "Please paste a video URL first.".to_owned(),
                id: String::new(),
                title: String::new(),
                uploader: String::new(),
                duration_secs: 0.0,
                thumbnail_url: String::new(),
                webpage_url: String::new(),
                source: "youtube".to_owned(),
            })
            .unwrap_or_default();
        }

        #[cfg(not(target_arch = "wasm32"))]
        let result = blocking(move || -> VideoPreviewResult {
            let ytdlp = find_yt_dlp();
            let mut cmd = Command::new(&ytdlp);
            cmd.args(["--dump-json", "--no-playlist", "--no-warnings"]);
            if !proxy.trim().is_empty() {
                cmd.args(["--proxy", proxy.trim()]);
            }
            cmd.arg(&trimmed);

            match cmd.output() {
                Ok(out) if out.status.success() => {
                    let Ok(val) = serde_json::from_slice::<serde_json::Value>(&out.stdout) else {
                        return VideoPreviewResult {
                            ok: false,
                            error: "Failed to parse yt-dlp metadata JSON.".to_owned(),
                            id: String::new(),
                            title: String::new(),
                            uploader: String::new(),
                            duration_secs: 0.0,
                            thumbnail_url: String::new(),
                            webpage_url: trimmed,
                            source: "youtube".to_owned(),
                        };
                    };
                    let id = val
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_owned();
                    let title = val
                        .get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Untitled Video")
                        .to_owned();
                    let uploader = val
                        .get("uploader")
                        .or_else(|| val.get("channel"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_owned();
                    let duration_secs = val
                        .get("duration")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.0);
                    let thumbnail_url = val
                        .get("thumbnail")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_owned();
                    let webpage_url = val
                        .get("webpage_url")
                        .and_then(|v| v.as_str())
                        .unwrap_or(&trimmed)
                        .to_owned();
                    let source = detect_source_from_url(&webpage_url).to_owned();

                    VideoPreviewResult {
                        ok: true,
                        error: String::new(),
                        id,
                        title,
                        uploader,
                        duration_secs,
                        thumbnail_url,
                        webpage_url,
                        source,
                    }
                }
                Ok(out) => {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    let msg = stderr
                        .lines()
                        .rfind(|l| !l.trim().is_empty())
                        .unwrap_or("yt-dlp failed to fetch video info")
                        .to_owned();
                    VideoPreviewResult {
                        ok: false,
                        error: msg,
                        id: String::new(),
                        title: String::new(),
                        uploader: String::new(),
                        duration_secs: 0.0,
                        thumbnail_url: String::new(),
                        webpage_url: trimmed,
                        source: "youtube".to_owned(),
                    }
                }
                Err(e) => VideoPreviewResult {
                    ok: false,
                    error: format!("Failed to run yt-dlp: {e}"),
                    id: String::new(),
                    title: String::new(),
                    uploader: String::new(),
                    duration_secs: 0.0,
                    thumbnail_url: String::new(),
                    webpage_url: trimmed,
                    source: "youtube".to_owned(),
                },
            }
        })
        .await
        .unwrap_or_else(|e| VideoPreviewResult {
            ok: false,
            error: format!("Metadata task failed: {e}"),
            id: String::new(),
            title: String::new(),
            uploader: String::new(),
            duration_secs: 0.0,
            thumbnail_url: String::new(),
            webpage_url: String::new(),
            source: "youtube".to_owned(),
        });

        #[cfg(target_arch = "wasm32")]
        let result = {
            let _ = proxy;
            VideoPreviewResult {
                ok: false,
                error: "yt-dlp video fetching is only available in the desktop app.".to_owned(),
                id: String::new(),
                title: String::new(),
                uploader: String::new(),
                duration_secs: 0.0,
                thumbnail_url: String::new(),
                webpage_url: trimmed,
                source: "youtube".to_owned(),
            }
        };

        serde_json::to_string(&result).unwrap_or_default()
    }

    /// Downloads a video from YouTube or X using `yt-dlp` directly into the Vimpo Library.
    pub async fn download_video(
        url: String,
        library_path: String,
        source: String,
        quality: String,
        download_subs: bool,
        proxy: String,
    ) -> String {
        let trimmed = url.trim().to_owned();
        if trimmed.is_empty() {
            return serde_json::to_string(&DownloadResult {
                ok: false,
                error: "Please enter a video URL.".to_owned(),
                item: None,
            })
            .unwrap_or_default();
        }

        #[cfg(not(target_arch = "wasm32"))]
        let result = blocking(move || -> DownloadResult {
            let ytdlp = find_yt_dlp();
            let root = expand_tilde(&library_path);
            if let Err(e) = fs::create_dir_all(&root) {
                return DownloadResult {
                    ok: false,
                    error: format!("Failed to create library folder: {e}"),
                    item: None,
                };
            }

            // 1. Fetch basic metadata first for folder naming & title
            let mut meta_cmd = Command::new(&ytdlp);
            meta_cmd.args(["--dump-json", "--no-playlist", "--no-warnings"]);
            if !proxy.trim().is_empty() {
                meta_cmd.args(["--proxy", proxy.trim()]);
            }
            meta_cmd.arg(&trimmed);

            let (title, remote_id, meta_duration) = match meta_cmd.output() {
                Ok(out) if out.status.success() => {
                    if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
                        let t = val
                            .get("title")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Downloaded Video")
                            .to_owned();
                        let rid = val
                            .get("id")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_owned();
                        let dur = val
                            .get("duration")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0);
                        (t, rid, dur)
                    } else {
                        ("Downloaded Video".to_owned(), String::new(), 0.0)
                    }
                }
                Ok(out) => {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    let msg = stderr
                        .lines()
                        .rfind(|l| !l.trim().is_empty())
                        .unwrap_or("yt-dlp failed to inspect URL")
                        .to_owned();
                    return DownloadResult {
                        ok: false,
                        error: msg,
                        item: None,
                    };
                }
                Err(e) => {
                    return DownloadResult {
                        ok: false,
                        error: format!("Failed to invoke yt-dlp: {e}"),
                        item: None,
                    };
                }
            };

            let ts = now_ms();
            let folder_id = if !remote_id.is_empty() {
                format!("{}-{}", sanitize_slug(&title), remote_id)
            } else {
                format!("{}-{ts}", sanitize_slug(&title))
            };
            let item_dir = root.join(&folder_id);
            if let Err(e) = fs::create_dir_all(&item_dir) {
                return DownloadResult {
                    ok: false,
                    error: format!("Failed to create video folder: {e}"),
                    item: None,
                };
            }

            // 2. Download video + thumbnail + optional subtitles
            let output_template = item_dir.join("video.%(ext)s");
            let mut dl_cmd = Command::new(&ytdlp);
            dl_cmd
                .args([
                    "--no-playlist",
                    "--no-warnings",
                    "-f",
                    format_selector(&quality),
                    "--merge-output-format",
                    "mp4",
                    "--write-thumbnail",
                    "--convert-thumbnails",
                    "jpg",
                    "-o",
                ])
                .arg(&output_template);

            if download_subs {
                dl_cmd.args([
                    "--write-subs",
                    "--write-auto-subs",
                    "--sub-format",
                    "srt",
                    "--sub-langs",
                    "en.*,en,zh-Hans,zh.*",
                ]);
            }
            if !proxy.trim().is_empty() {
                dl_cmd.args(["--proxy", proxy.trim()]);
            }
            dl_cmd.arg(&trimmed);

            match dl_cmd.output() {
                Ok(out) if out.status.success() => {}
                Ok(out) => {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    let msg = stderr
                        .lines()
                        .rfind(|l| !l.trim().is_empty())
                        .unwrap_or("yt-dlp download failed")
                        .to_owned();
                    return DownloadResult {
                        ok: false,
                        error: msg,
                        item: None,
                    };
                }
                Err(e) => {
                    return DownloadResult {
                        ok: false,
                        error: format!("Failed to run yt-dlp: {e}"),
                        item: None,
                    };
                }
            }

            let (video_file_opt, cover_file, subtitle_file) =
                normalize_downloaded_assets(&item_dir);
            let Some(video_file) = video_file_opt else {
                return DownloadResult {
                    ok: false,
                    error: "Download finished but no video file was produced.".to_owned(),
                    item: None,
                };
            };

            let video_path = item_dir.join(&video_file);
            let file_size_bytes = fs::metadata(&video_path).map(|m| m.len()).unwrap_or(0);
            let (probed_duration, width, height) = probe_media(&video_path);
            let duration_secs = if probed_duration > 0.0 {
                probed_duration
            } else {
                meta_duration
            };

            let normalized_source = if source.trim().is_empty() {
                detect_source_from_url(&trimmed).to_owned()
            } else {
                source
            };

            let mut item = VideoItem {
                id: folder_id,
                title,
                source: normalized_source,
                video_file,
                cover_file,
                subtitle_file,
                duration_secs,
                width,
                height,
                file_size_bytes,
                created_at_ms: ts,
                last_position_secs: 0.0,
                video_url: String::new(),
                cover_url: String::new(),
            };

            if let Ok(json) = serde_json::to_string_pretty(&item) {
                let _ = fs::write(item_dir.join("item.json"), json);
            }
            hydrate_urls(&item_dir, &mut item);

            DownloadResult {
                ok: true,
                error: String::new(),
                item: Some(item),
            }
        })
        .await
        .unwrap_or_else(|e| DownloadResult {
            ok: false,
            error: format!("Download task failed: {e}"),
            item: None,
        });

        #[cfg(target_arch = "wasm32")]
        let result = {
            let _ = (library_path, source, quality, download_subs, proxy);
            DownloadResult {
                ok: false,
                error: "yt-dlp downloads are only available in the desktop app.".to_owned(),
                item: None,
            }
        };

        serde_json::to_string(&result).unwrap_or_default()
    }
}
