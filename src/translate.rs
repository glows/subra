//! Persistent subtitle translation cache and bilingual SRT writer.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use nsh_core::{
    file_dialog::{FileFilter, SaveDialog},
    prelude::*,
};
use serde::{Deserialize, Serialize};

use crate::{app_support_dir, expand_tilde};

fn cache_file_path() -> PathBuf {
    app_support_dir().join("translation_cache.json")
}

fn load_cache_map() -> HashMap<String, String> {
    let path = cache_file_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return HashMap::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CacheStats {
    sentences: usize,
    bytes: u64,
}

fn current_stats(map: &HashMap<String, String>) -> CacheStats {
    let bytes = fs::metadata(cache_file_path())
        .map(|m| m.len())
        .unwrap_or(0);
    CacheStats {
        sentences: map.len(),
        bytes,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CueInput {
    index: usize,
    start_secs: f64,
    end_secs: f64,
    text: String,
    #[serde(default)]
    translation: String,
}

fn format_srt_time(secs: f64) -> String {
    let total_ms = (secs.max(0.0) * 1000.0).round() as u64;
    let ms = total_ms % 1000;
    let total_s = total_ms / 1000;
    let s = total_s % 60;
    let m = (total_s / 60) % 60;
    let h = total_s / 3600;
    format!("{h:02}:{m:02}:{s:02},{ms:03}")
}

fn format_vtt_time(secs: f64) -> String {
    format_srt_time(secs).replace(',', ".")
}

fn format_mmss(secs: f64) -> String {
    let total_s = secs.max(0.0).floor() as u64;
    let h = total_s / 3600;
    let m = (total_s % 3600) / 60;
    let s = total_s % 60;
    if h > 0 {
        format!("{h:02}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportResult {
    ok: bool,
    cancelled: bool,
    path: String,
    error: String,
}

fn pick_lines<'a>(cue: &'a CueInput, mode: &str) -> Vec<&'a str> {
    let orig = cue.text.trim();
    let tr = cue.translation.trim();
    match mode {
        "original" => {
            if orig.is_empty() {
                Vec::new()
            } else {
                vec![orig]
            }
        }
        "translation" => {
            if !tr.is_empty() {
                vec![tr]
            } else if !orig.is_empty() {
                vec![orig]
            } else {
                Vec::new()
            }
        }
        _ => {
            let mut v = Vec::new();
            if !orig.is_empty() {
                v.push(orig);
            }
            if !tr.is_empty() {
                v.push(tr);
            }
            v
        }
    }
}

fn format_cues_output(cues: &[CueInput], format: &str, mode: &str) -> String {
    match format {
        "vtt" => {
            let mut out = String::from("WEBVTT\n\n");
            for cue in cues {
                let lines = pick_lines(cue, mode);
                if lines.is_empty() {
                    continue;
                }
                out.push_str(&format!(
                    "{} --> {}\n{}\n\n",
                    format_vtt_time(cue.start_secs),
                    format_vtt_time(cue.end_secs),
                    lines.join("\n")
                ));
            }
            out
        }
        "txt" => {
            let mut out = String::new();
            for cue in cues {
                let lines = pick_lines(cue, mode);
                if lines.is_empty() {
                    continue;
                }
                out.push_str(&format!(
                    "[{}] {}\n",
                    format_mmss(cue.start_secs),
                    lines.join(" / ")
                ));
            }
            out
        }
        _ => {
            let mut out = String::new();
            let mut seq = 1_usize;
            for cue in cues {
                let lines = pick_lines(cue, mode);
                if lines.is_empty() {
                    continue;
                }
                out.push_str(&format!(
                    "{seq}\n{} --> {}\n{}\n\n",
                    format_srt_time(cue.start_secs),
                    format_srt_time(cue.end_secs),
                    lines.join("\n")
                ));
                seq += 1;
            }
            out
        }
    }
}

/// Native translation cache & bilingual SRT persistence.
#[module]
pub struct SubraTranslate;

#[module]
impl SubraTranslate {
    /// Returns JSON `{ sentences, bytes }` for the on-disk translation cache.
    pub fn cache_stats() -> String {
        let map = load_cache_map();
        serde_json::to_string(&current_stats(&map))
            .unwrap_or_else(|_| r#"{"sentences":0,"bytes":0}"#.to_owned())
    }

    /// Clears the on-disk translation cache.
    pub fn clear_cache() -> bool {
        let path = cache_file_path();
        if path.exists() {
            fs::remove_file(&path).is_ok()
        } else {
            true
        }
    }

    /// Looks up a JSON array of cache keys and returns a JSON object `{ key: translation }`.
    pub fn lookup_cache(keys_json: String) -> String {
        let keys: Vec<String> = serde_json::from_str(&keys_json).unwrap_or_default();
        if keys.is_empty() {
            return "{}".to_owned();
        }
        let map = load_cache_map();
        let mut hits = HashMap::new();
        for key in keys {
            if let Some(val) = map.get(&key) {
                hits.insert(key, val.clone());
            }
        }
        serde_json::to_string(&hits).unwrap_or_else(|_| "{}".to_owned())
    }

    /// Merges a JSON object `{ key: translation }` into the on-disk cache and returns updated stats.
    pub fn save_cache_entries(entries_json: String) -> String {
        let incoming: HashMap<String, String> =
            serde_json::from_str(&entries_json).unwrap_or_default();
        let mut map = load_cache_map();
        for (k, v) in incoming {
            if !v.trim().is_empty() {
                map.insert(k, v);
            }
        }
        let path = cache_file_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(serialized) = serde_json::to_string(&map) {
            let _ = fs::write(&path, serialized);
        }
        serde_json::to_string(&current_stats(&map))
            .unwrap_or_else(|_| r#"{"sentences":0,"bytes":0}"#.to_owned())
    }

    /// Writes bilingual cues (`[{ index, startSecs, endSecs, text, translation }]`) to `subtitles.srt`.
    pub fn save_bilingual_subtitles(
        library_path: String,
        video_id: String,
        cues_json: String,
    ) -> bool {
        let Ok(cues) = serde_json::from_str::<Vec<CueInput>>(&cues_json) else {
            return false;
        };
        let folder = expand_tilde(&library_path).join(&video_id);
        if !folder.is_dir() {
            return false;
        }

        let mut out = String::new();
        for (idx, cue) in cues.iter().enumerate() {
            let num = if cue.index > 0 { cue.index } else { idx + 1 };
            out.push_str(&format!(
                "{num}\n{} --> {}\n{}\n",
                format_srt_time(cue.start_secs),
                format_srt_time(cue.end_secs),
                cue.text.trim()
            ));
            if !cue.translation.trim().is_empty() {
                out.push_str(cue.translation.trim());
                out.push('\n');
            }
            out.push('\n');
        }

        let srt_path = folder.join("subtitles.srt");
        fs::write(srt_path, out).is_ok()
    }

    /// Opens a native Save dialog and exports subtitles as `srt`, `vtt`, or `txt` (`bilingual` | `original` | `translation`).
    pub async fn export_subtitles(
        cues_json: String,
        suggested_title: String,
        format: String,
        mode: String,
    ) -> String {
        let Ok(cues) = serde_json::from_str::<Vec<CueInput>>(&cues_json) else {
            return serde_json::to_string(&ExportResult {
                ok: false,
                cancelled: false,
                path: String::new(),
                error: "Invalid subtitles payload.".to_owned(),
            })
            .unwrap_or_default();
        };

        let ext = match format.as_str() {
            "vtt" => "vtt",
            "txt" => "txt",
            _ => "srt",
        };
        let label = match ext {
            "vtt" => "WebVTT Subtitles",
            "txt" => "Plain Text Transcript",
            _ => "SubRip Subtitles",
        };
        let safe_stem: String = suggested_title
            .chars()
            .map(|c| {
                if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                    '_'
                } else {
                    c
                }
            })
            .collect();
        let file_name = format!(
            "{}.{ext}",
            if safe_stem.trim().is_empty() {
                "subtitles"
            } else {
                safe_stem.trim()
            }
        );

        let content = format_cues_output(&cues, ext, &mode);

        let picked = pick_save_path(
            SaveDialog::new()
                .file_name(file_name)
                .filter(FileFilter::new(label, [ext]))
                .button_label("Export"),
        )
        .await;

        let result = match picked {
            Ok(Some(dest)) => match fs::write(&dest, content) {
                Ok(_) => ExportResult {
                    ok: true,
                    cancelled: false,
                    path: dest.to_string_lossy().into_owned(),
                    error: String::new(),
                },
                Err(e) => ExportResult {
                    ok: false,
                    cancelled: false,
                    path: String::new(),
                    error: format!("Failed to write file: {e}"),
                },
            },
            Ok(None) => ExportResult {
                ok: false,
                cancelled: true,
                path: String::new(),
                error: String::new(),
            },
            Err(e) => ExportResult {
                ok: false,
                cancelled: false,
                path: String::new(),
                error: format!("Save dialog unavailable: {e}"),
            },
        };

        serde_json::to_string(&result).unwrap_or_default()
    }

    /// Loads saved AI summary markdown (`summary.md`) from the video folder, if present.
    pub fn load_summary(library_path: String, video_id: String) -> String {
        let path = expand_tilde(&library_path)
            .join(&video_id)
            .join("summary.md");
        fs::read_to_string(path).unwrap_or_default()
    }

    /// Saves AI summary markdown to `summary.md` in the video folder.
    pub fn save_summary(library_path: String, video_id: String, content: String) -> bool {
        let folder = expand_tilde(&library_path).join(&video_id);
        if !folder.is_dir() {
            return false;
        }
        fs::write(folder.join("summary.md"), content).is_ok()
    }
}
