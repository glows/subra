//! Local Vimpo video library management (`item.json`, FFmpeg probing/thumbnails, SRT parsing).

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use nsh_core::{
    file_dialog::{FileFilter, OpenDialog},
    prelude::*,
};
use serde::{Deserialize, Serialize};

use crate::expand_tilde;

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "mkv", "webm", "m4v"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoItem {
    pub id: String,
    pub title: String,
    pub source: String,
    pub video_file: String,
    pub cover_file: Option<String>,
    pub subtitle_file: Option<String>,
    pub duration_secs: f64,
    pub width: u32,
    pub height: u32,
    pub file_size_bytes: u64,
    pub created_at_ms: u64,
    pub last_position_secs: f64,
    #[serde(default)]
    pub video_url: String,
    #[serde(default)]
    pub cover_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    imported: Vec<VideoItem>,
    errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SubtitleCue {
    index: usize,
    start_secs: f64,
    end_secs: f64,
    text: String,
    translation: String,
}

pub(crate) fn now_ms() -> u64 {
    #[cfg(not(target_arch = "wasm32"))]
    {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }
    #[cfg(target_arch = "wasm32")]
    {
        nsh_core::time::unix_ms() as u64
    }
}

fn path_to_file_url(path: &Path) -> String {
    let raw = path.to_string_lossy();
    let mut encoded = String::with_capacity(raw.len() + 16);
    encoded.push_str("file://");
    for ch in raw.chars() {
        match ch {
            ' ' => encoded.push_str("%20"),
            '#' => encoded.push_str("%23"),
            '?' => encoded.push_str("%3F"),
            '%' => encoded.push_str("%25"),
            _ => encoded.push(ch),
        }
    }
    encoded
}

pub(crate) fn sanitize_slug(name: &str) -> String {
    let mut out = String::new();
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if (ch == ' ' || ch == '-' || ch == '_') && !out.ends_with('-') {
            out.push('-');
        }
        if out.len() >= 36 {
            break;
        }
    }
    let trimmed = out.trim_matches('-');
    if trimmed.is_empty() {
        "video".to_owned()
    } else {
        trimmed.to_owned()
    }
}

pub(crate) fn probe_media(video_path: &Path) -> (f64, u32, u32) {
    #[cfg(target_arch = "wasm32")]
    {
        let _ = video_path;
        return (0.0, 0, 0);
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let ffprobe_bin = crate::resolve_binary_with_source("ffprobe")
            .map(|(p, _)| p)
            .unwrap_or_else(|| PathBuf::from(crate::bin_name("ffprobe")));
        let output = Command::new(&ffprobe_bin)
            .args([
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
            ])
            .arg(video_path)
            .output();

        let Ok(out) = output else {
            return (0.0, 0, 0);
        };
        if !out.status.success() {
            return (0.0, 0, 0);
        }
        let Ok(val) = serde_json::from_slice::<serde_json::Value>(&out.stdout) else {
            return (0.0, 0, 0);
        };

        let duration = val
            .get("format")
            .and_then(|f| f.get("duration"))
            .and_then(|d| d.as_str())
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);

        let mut width = 0_u32;
        let mut height = 0_u32;
        if let Some(streams) = val.get("streams").and_then(|s| s.as_array()) {
            for stream in streams {
                if stream.get("codec_type").and_then(|t| t.as_str()) == Some("video") {
                    width = stream.get("width").and_then(|w| w.as_u64()).unwrap_or(0) as u32;
                    height = stream.get("height").and_then(|h| h.as_u64()).unwrap_or(0) as u32;
                    break;
                }
            }
        }
        (duration, width, height)
    }
}

fn extract_cover(video_path: &Path, cover_path: &Path) -> bool {
    #[cfg(target_arch = "wasm32")]
    {
        let _ = (video_path, cover_path);
        return false;
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let ffmpeg_bin = crate::resolve_binary_with_source("ffmpeg")
            .map(|(p, _)| p)
            .unwrap_or_else(|| PathBuf::from(crate::bin_name("ffmpeg")));
        let try_at = |ts: &str| {
            Command::new(&ffmpeg_bin)
                .args(["-y", "-ss", ts, "-i"])
                .arg(video_path)
                .args(["-frames:v", "1", "-vf", "scale=640:-1", "-q:v", "4"])
                .arg(cover_path)
                .output()
                .map(|o| o.status.success() && cover_path.exists())
                .unwrap_or(false)
        };
        try_at("00:00:01") || try_at("00:00:00")
    }
}

pub(crate) fn hydrate_urls(folder: &Path, item: &mut VideoItem) {
    let vpath = folder.join(&item.video_file);
    item.video_url = path_to_file_url(&vpath);
    if let Some(cover) = &item.cover_file {
        let cpath = folder.join(cover);
        if cpath.exists() {
            item.cover_url = path_to_file_url(&cpath);
        }
    }
}

fn discover_item_in_folder(folder: &Path) -> Option<VideoItem> {
    let item_json = folder.join("item.json");
    if item_json.exists() {
        if let Ok(raw) = fs::read_to_string(&item_json) {
            if let Ok(mut item) = serde_json::from_str::<VideoItem>(&raw) {
                hydrate_urls(folder, &mut item);
                return Some(item);
            }
        }
    }

    // Fallback: auto-discover plain video file inside subfolder
    let entries = fs::read_dir(folder).ok()?;
    let mut video_file = None;
    let mut cover_file = None;
    let mut subtitle_file = None;
    let mut file_size_bytes = 0_u64;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        let fname = path.file_name()?.to_string_lossy().into_owned();
        if video_file.is_none() && VIDEO_EXTENSIONS.contains(&ext.as_str()) {
            file_size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
            video_file = Some(fname);
        } else if cover_file.is_none() && matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp") {
            cover_file = Some(fname);
        } else if subtitle_file.is_none() && matches!(ext.as_str(), "srt" | "vtt") {
            subtitle_file = Some(fname);
        }
    }

    let video_file = video_file?;
    let id = folder.file_name()?.to_string_lossy().into_owned();
    let title = Path::new(&video_file)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| id.clone());

    let mut item = VideoItem {
        id,
        title,
        source: "local".to_owned(),
        video_file,
        cover_file,
        subtitle_file,
        duration_secs: 0.0,
        width: 0,
        height: 0,
        file_size_bytes,
        created_at_ms: now_ms(),
        last_position_secs: 0.0,
        video_url: String::new(),
        cover_url: String::new(),
    };
    hydrate_urls(folder, &mut item);
    Some(item)
}

fn import_one_file(library_root: &Path, src_path: &Path) -> Result<VideoItem, String> {
    if !src_path.is_file() {
        return Err(format!("Not a file: {}", src_path.display()));
    }
    fs::create_dir_all(library_root)
        .map_err(|e| format!("Failed to create library folder: {e}"))?;

    let stem = src_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled");
    let ext = src_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4")
        .to_ascii_lowercase();

    let ts = now_ms();
    let id = format!("{}-{ts}", sanitize_slug(stem));
    let item_dir = library_root.join(&id);
    fs::create_dir_all(&item_dir).map_err(|e| format!("Failed to create video folder: {e}"))?;

    let dest_video_name = format!("video.{ext}");
    let dest_video_path = item_dir.join(&dest_video_name);
    fs::copy(src_path, &dest_video_path).map_err(|e| format!("Failed to copy video: {e}"))?;

    let file_size_bytes = fs::metadata(&dest_video_path).map(|m| m.len()).unwrap_or(0);
    let (duration_secs, width, height) = probe_media(&dest_video_path);

    let cover_path = item_dir.join("cover.jpg");
    let cover_file = if extract_cover(&dest_video_path, &cover_path) {
        Some("cover.jpg".to_owned())
    } else {
        None
    };

    // Copy sibling .srt or .vtt sidecar if present
    let mut subtitle_file = None;
    for sub_ext in ["srt", "vtt"] {
        let sidecar = src_path.with_extension(sub_ext);
        if sidecar.is_file() {
            let dest_sub = format!("subtitles.{sub_ext}");
            if fs::copy(&sidecar, item_dir.join(&dest_sub)).is_ok() {
                subtitle_file = Some(dest_sub);
                break;
            }
        }
    }

    let mut item = VideoItem {
        id,
        title: stem.to_owned(),
        source: "local".to_owned(),
        video_file: dest_video_name,
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

    let json = serde_json::to_string_pretty(&item)
        .map_err(|e| format!("Failed to serialize item.json: {e}"))?;
    fs::write(item_dir.join("item.json"), json)
        .map_err(|e| format!("Failed to write item.json: {e}"))?;

    hydrate_urls(&item_dir, &mut item);
    Ok(item)
}

fn parse_timestamp(ts: &str) -> Option<f64> {
    let cleaned = ts.trim().replace(',', ".");
    let parts: Vec<&str> = cleaned.split(':').collect();
    match parts.as_slice() {
        [h, m, s] => {
            let hh: f64 = h.parse().ok()?;
            let mm: f64 = m.parse().ok()?;
            let ss: f64 = s.parse().ok()?;
            Some(hh * 3600.0 + mm * 60.0 + ss)
        }
        [m, s] => {
            let mm: f64 = m.parse().ok()?;
            let ss: f64 = s.parse().ok()?;
            Some(mm * 60.0 + ss)
        }
        _ => None,
    }
}

fn parse_srt_or_vtt(content: &str) -> Vec<SubtitleCue> {
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    let mut cues = Vec::new();
    for block in normalized.split("\n\n") {
        let lines: Vec<&str> = block
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .collect();
        if lines.is_empty() || lines[0].starts_with("WEBVTT") {
            continue;
        }
        let time_idx = lines.iter().position(|l| l.contains("-->"));
        let Some(t_idx) = time_idx else {
            continue;
        };
        let mut range_parts = lines[t_idx].split("-->");
        let Some(start_raw) = range_parts.next() else {
            continue;
        };
        let Some(end_raw) = range_parts.next() else {
            continue;
        };
        let end_clean = end_raw.split_whitespace().next().unwrap_or(end_raw);
        let (Some(start_secs), Some(end_secs)) =
            (parse_timestamp(start_raw), parse_timestamp(end_clean))
        else {
            continue;
        };
        let text_lines = &lines[t_idx + 1..];
        if text_lines.is_empty() {
            continue;
        }
        let (text, translation) = if text_lines.len() >= 2 {
            (text_lines[0].to_owned(), text_lines[1..].join(" "))
        } else {
            (text_lines[0].to_owned(), String::new())
        };
        cues.push(SubtitleCue {
            index: cues.len() + 1,
            start_secs,
            end_secs,
            text,
            translation,
        });
    }
    cues
}

/// Native Subra video library manager.
#[module]
pub struct SubraLibrary;

#[module]
impl SubraLibrary {
    /// Scans all video subfolders in `library_path` and returns a JSON array of `VideoItem`.
    pub fn scan_library(library_path: String) -> String {
        let root = expand_tilde(&library_path);
        let Ok(entries) = fs::read_dir(&root) else {
            return "[]".to_owned();
        };

        let mut items = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(item) = discover_item_in_folder(&path) {
                    items.push(item);
                }
            }
        }
        items.sort_by(|a, b| b.created_at_ms.cmp(&a.created_at_ms));
        serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_owned())
    }

    /// Opens a native video file picker and imports chosen videos into the library.
    pub async fn pick_and_import_videos(library_path: String) -> String {
        let picked = pick_paths(
            OpenDialog::files()
                .multiple(true)
                .filter(FileFilter::new(
                    "Videos",
                    ["mp4", "mov", "mkv", "webm", "m4v"],
                ))
                .button_label("Import"),
        )
        .await;

        let paths = match picked {
            Ok(Some(paths)) if !paths.is_empty() => paths,
            _ => {
                return serde_json::to_string(&ImportResult {
                    imported: Vec::new(),
                    errors: Vec::new(),
                })
                .unwrap_or_else(|_| r#"{"imported":[],"errors":[]}"#.to_owned());
            }
        };

        #[cfg(not(target_arch = "wasm32"))]
        let result = {
            let root = expand_tilde(&library_path);
            blocking(move || {
                let mut imported = Vec::new();
                let mut errors = Vec::new();
                for path in paths {
                    match import_one_file(&root, &path) {
                        Ok(item) => imported.push(item),
                        Err(err) => errors.push(err),
                    }
                }
                ImportResult { imported, errors }
            })
            .await
            .unwrap_or_else(|e| ImportResult {
                imported: Vec::new(),
                errors: vec![format!("Import task failed: {e}")],
            })
        };

        #[cfg(target_arch = "wasm32")]
        let result = {
            let _ = (library_path, paths);
            ImportResult {
                imported: Vec::new(),
                errors: vec!["Local file import is only available in the desktop app.".to_owned()],
            }
        };

        serde_json::to_string(&result)
            .unwrap_or_else(|_| r#"{"imported":[],"errors":[]}"#.to_owned())
    }

    /// Loads and parses subtitles (`subtitles.srt` or `subtitles.vtt`) for a video item.
    pub fn load_subtitles(library_path: String, video_id: String) -> String {
        let folder = expand_tilde(&library_path).join(&video_id);
        let candidates = [folder.join("subtitles.srt"), folder.join("subtitles.vtt")];
        for path in candidates {
            if let Ok(raw) = fs::read_to_string(&path) {
                let cues = parse_srt_or_vtt(&raw);
                return serde_json::to_string(&cues).unwrap_or_else(|_| "[]".to_owned());
            }
        }
        "[]".to_owned()
    }

    /// Saves the last playback position into `item.json`.
    pub fn update_playback_position(
        library_path: String,
        video_id: String,
        position_secs: f64,
    ) -> bool {
        let item_json = expand_tilde(&library_path)
            .join(&video_id)
            .join("item.json");
        let Ok(raw) = fs::read_to_string(&item_json) else {
            return false;
        };
        let Ok(mut item) = serde_json::from_str::<VideoItem>(&raw) else {
            return false;
        };
        item.last_position_secs = position_secs.max(0.0);
        let Ok(next) = serde_json::to_string_pretty(&item) else {
            return false;
        };
        fs::write(item_json, next).is_ok()
    }

    /// Deletes a video folder from the library (moving to Trash when available).
    pub async fn delete_video(library_path: String, video_id: String) -> bool {
        let folder: PathBuf = expand_tilde(&library_path).join(&video_id);
        if !folder.exists() {
            return false;
        }
        if move_to_trash(&folder).await.is_ok() {
            return true;
        }
        fs::remove_dir_all(&folder).is_ok()
    }

    /// Reveals a video's folder in Finder / File Explorer.
    pub async fn reveal_video_folder(library_path: String, video_id: String) -> bool {
        let folder = expand_tilde(&library_path).join(&video_id);
        if folder.exists() {
            reveal_path(folder).await.is_ok()
        } else {
            false
        }
    }
}
