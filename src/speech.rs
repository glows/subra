//! Local Whisper speech recognition (GGML model management + FFmpeg + whisper-cli with live progress).

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};

#[cfg(not(target_arch = "wasm32"))]
use std::io::{BufRead, BufReader};
#[cfg(not(target_arch = "wasm32"))]
use std::process::Stdio;

use nsh_core::prelude::*;
use serde::Serialize;

use crate::{app_support_dir, expand_tilde, legacy_models_dir};

const MODEL_SPECS: &[(&str, &str)] = &[
    ("tiny", "ggml-tiny.bin"),
    ("base", "ggml-base.bin"),
    ("small", "ggml-small.bin"),
    ("medium", "ggml-medium.bin"),
    ("large-v3-turbo-compressed", "ggml-large-v3-turbo-q5_0.bin"),
    ("large-v3-turbo", "ggml-large-v3-turbo.bin"),
    ("large-v3", "ggml-large-v3.bin"),
];

const HF_BASE_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveCue {
    index: usize,
    start_secs: f64,
    end_secs: f64,
    text: String,
    translation: String,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscribeProgress {
    active: bool,
    video_id: String,
    stage: String,
    percent: u32,
    segments: usize,
    latest_line: String,
    live_cues: Vec<LiveCue>,
}

fn progress_state() -> &'static Mutex<TranscribeProgress> {
    static STATE: OnceLock<Mutex<TranscribeProgress>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(TranscribeProgress::default()))
}

fn set_progress(mut f: impl FnMut(&mut TranscribeProgress)) {
    if let Ok(mut guard) = progress_state().lock() {
        f(&mut guard);
    }
}

fn models_dir() -> PathBuf {
    app_support_dir().join("models")
}

pub(crate) fn find_model_file(filename: &str) -> Option<PathBuf> {
    let primary = models_dir().join(filename);
    if primary.is_file() {
        return Some(primary);
    }
    let legacy = legacy_models_dir().join(filename);
    if legacy.is_file() {
        return Some(legacy);
    }
    None
}

pub(crate) fn first_downloaded_model_id() -> Option<&'static str> {
    for (id, file) in MODEL_SPECS {
        if find_model_file(file).is_some() {
            return Some(*id);
        }
    }
    None
}

fn model_filename(model_id: &str) -> Option<&'static str> {
    MODEL_SPECS
        .iter()
        .find(|(id, _)| *id == model_id)
        .map(|(_, file)| *file)
}

#[cfg(not(target_arch = "wasm32"))]
fn find_whisper_cli() -> Option<PathBuf> {
    crate::resolve_binary_with_source("whisper-cli").map(|(p, _)| p)
}

fn locate_video_file(folder: &Path) -> Option<PathBuf> {
    let item_json = folder.join("item.json");
    if let Ok(raw) = fs::read_to_string(&item_json) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(vf) = val.get("videoFile").and_then(|v| v.as_str()) {
                let candidate = folder.join(vf);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    let entries = fs::read_dir(folder).ok()?;
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        if matches!(ext.as_str(), "mp4" | "mov" | "mkv" | "webm" | "m4v") {
            return Some(p);
        }
    }
    None
}

fn update_item_subtitle_file(folder: &Path, subtitle_name: &str) {
    let item_json = folder.join("item.json");
    let Ok(raw) = fs::read_to_string(&item_json) else {
        return;
    };
    let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return;
    };
    if let Some(obj) = val.as_object_mut() {
        obj.insert(
            "subtitleFile".to_owned(),
            serde_json::Value::String(subtitle_name.to_owned()),
        );
        if let Ok(pretty) = serde_json::to_string_pretty(&val) {
            let _ = fs::write(&item_json, pretty);
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn parse_whisper_progress_percent(line: &str) -> Option<u32> {
    let idx = line.find("progress =")?;
    let rest = line[idx + "progress =".len()..].trim();
    let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    num_str.parse::<u32>().ok().map(|p| p.min(100))
}

#[cfg(not(target_arch = "wasm32"))]
fn parse_ts_secs(ts: &str) -> Option<f64> {
    let cleaned = ts.trim().replace(',', ".");
    let parts: Vec<&str> = cleaned.split(':').collect();
    match parts.as_slice() {
        [h, m, s] => Some(
            h.parse::<f64>().ok()? * 3600.0
                + m.parse::<f64>().ok()? * 60.0
                + s.parse::<f64>().ok()?,
        ),
        [m, s] => Some(m.parse::<f64>().ok()? * 60.0 + s.parse::<f64>().ok()?),
        _ => None,
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn parse_whisper_stdout_cue(line: &str) -> Option<(f64, f64, String)> {
    let trimmed = line.trim();
    if !trimmed.starts_with('[') {
        return None;
    }
    let end_bracket = trimmed.find(']')?;
    let range = &trimmed[1..end_bracket];
    let mut parts = range.split("-->");
    let start_secs = parse_ts_secs(parts.next()?)?;
    let end_secs = parse_ts_secs(parts.next()?)?;
    let spoken = trimmed[end_bracket + 1..].trim();
    if spoken.is_empty() {
        return None;
    }
    Some((start_secs, end_secs, spoken.to_owned()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpResult {
    ok: bool,
    error: String,
    cue_count: usize,
}

/// Native Whisper speech recognition & model manager.
#[module]
pub struct SubraSpeech;

#[module]
impl SubraSpeech {
    /// Returns the live transcription progress JSON (`{ active, videoId, stage, percent, segments, latestLine, liveCues }`).
    pub fn get_transcribe_progress() -> String {
        let snap = progress_state()
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default();
        serde_json::to_string(&snap).unwrap_or_else(|_| "{}".to_owned())
    }

    /// Returns a JSON array of Whisper model IDs currently present on disk.
    pub fn list_downloaded_models() -> String {
        let mut found = Vec::new();
        for (id, file) in MODEL_SPECS {
            if find_model_file(file).is_some() {
                found.push(*id);
            }
        }
        serde_json::to_string(&found).unwrap_or_else(|_| "[]".to_owned())
    }

    /// Downloads a GGML Whisper model file into the Vimpo models directory.
    pub async fn download_model(model_id: String, proxy: String) -> String {
        let Some(filename) = model_filename(&model_id) else {
            return serde_json::to_string(&OpResult {
                ok: false,
                error: format!("Unknown Whisper model: {model_id}"),
                cue_count: 0,
            })
            .unwrap_or_default();
        };

        #[cfg(not(target_arch = "wasm32"))]
        let result = blocking(move || -> OpResult {
            let dir = models_dir();
            if let Err(e) = fs::create_dir_all(&dir) {
                return OpResult {
                    ok: false,
                    error: format!("Cannot create models folder: {e}"),
                    cue_count: 0,
                };
            }
            let dest = dir.join(filename);
            if dest.is_file() {
                return OpResult {
                    ok: true,
                    error: String::new(),
                    cue_count: 0,
                };
            }

            let part = dir.join(format!("{filename}.part"));
            let url = format!("{HF_BASE_URL}/{filename}");

            let mut cmd = Command::new("curl");
            cmd.args(["-fSL", "--retry", "2", "-o"]).arg(&part);
            if !proxy.trim().is_empty() {
                cmd.args(["--proxy", proxy.trim()]);
            }
            cmd.arg(&url);

            match cmd.output() {
                Ok(out) if out.status.success() => {
                    if let Err(e) = fs::rename(&part, &dest) {
                        let _ = fs::remove_file(&part);
                        OpResult {
                            ok: false,
                            error: format!("Failed to finalize model file: {e}"),
                            cue_count: 0,
                        }
                    } else {
                        OpResult {
                            ok: true,
                            error: String::new(),
                            cue_count: 0,
                        }
                    }
                }
                Ok(out) => {
                    let _ = fs::remove_file(&part);
                    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_owned();
                    OpResult {
                        ok: false,
                        error: if stderr.is_empty() {
                            format!("Download failed (exit {})", out.status)
                        } else {
                            stderr
                        },
                        cue_count: 0,
                    }
                }
                Err(e) => OpResult {
                    ok: false,
                    error: format!("Failed to invoke curl: {e}"),
                    cue_count: 0,
                },
            }
        })
        .await
        .unwrap_or_else(|e| OpResult {
            ok: false,
            error: format!("Download task failed: {e}"),
            cue_count: 0,
        });

        #[cfg(target_arch = "wasm32")]
        let result = {
            let _ = (filename, proxy);
            OpResult {
                ok: false,
                error: "Whisper model download is only available in the desktop app.".to_owned(),
                cue_count: 0,
            }
        };

        serde_json::to_string(&result).unwrap_or_default()
    }

    /// Deletes a downloaded Whisper model file from disk.
    pub fn delete_model(model_id: String) -> bool {
        let Some(filename) = model_filename(&model_id) else {
            return false;
        };
        let path = models_dir().join(filename);
        if path.is_file() {
            fs::remove_file(path).is_ok()
        } else {
            false
        }
    }

    /// Extracts audio with FFmpeg and transcribes a video using `whisper-cli`, updating live progress.
    pub async fn transcribe_video(
        library_path: String,
        video_id: String,
        model_id: String,
    ) -> String {
        let folder = expand_tilde(&library_path).join(&video_id);
        let vid_for_progress = video_id.clone();

        #[cfg(not(target_arch = "wasm32"))]
        let result = blocking(move || -> OpResult {
            set_progress(|p| {
                p.active = true;
                p.video_id = vid_for_progress.clone();
                p.stage = "Checking Whisper & FFmpeg...".to_owned();
                p.percent = 2;
                p.segments = 0;
                p.latest_line.clear();
                p.live_cues.clear();
            });

            let finish_inactive = || {
                set_progress(|p| {
                    p.active = false;
                });
            };

            let Some(whisper_bin) = find_whisper_cli() else {
                finish_inactive();
                return OpResult {
                    ok: false,
                    error: "whisper-cli not found. Install via: brew install whisper-cpp"
                        .to_owned(),
                    cue_count: 0,
                };
            };

            let Some(filename) = model_filename(&model_id) else {
                finish_inactive();
                return OpResult {
                    ok: false,
                    error: format!("Unknown Whisper model: {model_id}"),
                    cue_count: 0,
                };
            };
            let Some(model_path) = find_model_file(filename) else {
                finish_inactive();
                return OpResult {
                    ok: false,
                    error: format!(
                        "Model '{model_id}' is not downloaded. Download it in Speech Recognition settings."
                    ),
                    cue_count: 0,
                };
            };

            let Some(video_path) = locate_video_file(&folder) else {
                finish_inactive();
                return OpResult {
                    ok: false,
                    error: "Video file not found in library folder.".to_owned(),
                    cue_count: 0,
                };
            };

            // Step 1: Extract 16kHz mono PCM WAV with FFmpeg
            set_progress(|p| {
                p.stage = "Extracting audio with FFmpeg...".to_owned();
                p.percent = 8;
            });

            let ffmpeg_bin = crate::resolve_binary_with_source("ffmpeg")
                .map(|(p, _)| p)
                .unwrap_or_else(|| PathBuf::from(crate::bin_name("ffmpeg")));
            let wav_path = folder.join(".subra_tmp_audio.wav");
            let ff = Command::new(&ffmpeg_bin)
                .args(["-y", "-i"])
                .arg(&video_path)
                .args(["-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le"])
                .arg(&wav_path)
                .output();

            match ff {
                Ok(out) if out.status.success() && wav_path.is_file() => {}
                Ok(out) => {
                    finish_inactive();
                    let err = String::from_utf8_lossy(&out.stderr);
                    return OpResult {
                        ok: false,
                        error: format!(
                            "FFmpeg audio extraction failed: {}",
                            err.lines().last().unwrap_or("")
                        ),
                        cue_count: 0,
                    };
                }
                Err(e) => {
                    finish_inactive();
                    return OpResult {
                        ok: false,
                        error: format!("Failed to run ffmpeg: {e}"),
                        cue_count: 0,
                    };
                }
            }

            // Step 2: Run whisper-cli with `-pp` and stream stdout/stderr for real-time progress
            set_progress(|p| {
                p.stage = "Loading Whisper model...".to_owned();
                p.percent = 14;
            });

            let out_prefix = folder.join("subtitles");
            let mut child = match Command::new(&whisper_bin)
                .arg("-m")
                .arg(&model_path)
                .arg("-f")
                .arg(&wav_path)
                .args(["-l", "auto", "-pp", "-osrt", "-of"])
                .arg(&out_prefix)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
            {
                Ok(c) => c,
                Err(e) => {
                    let _ = fs::remove_file(&wav_path);
                    finish_inactive();
                    return OpResult {
                        ok: false,
                        error: format!("Failed to run whisper-cli: {e}"),
                        cue_count: 0,
                    };
                }
            };

            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            // Parse whisper-cli stderr for `progress = XX%` and detected language
            let stderr_handle = std::thread::spawn(move || {
                let mut last_err = String::new();
                if let Some(err_stream) = stderr {
                    let reader = BufReader::new(err_stream);
                    for line in reader.lines().map_while(Result::ok) {
                        if let Some(pct) = parse_whisper_progress_percent(&line) {
                            // Map whisper 0..100% into 16..98%
                            let mapped = 16 + ((pct as f32) * 0.82).round() as u32;
                            set_progress(|p| {
                                p.stage = format!("Transcribing ({pct}%)...");
                                p.percent = mapped.min(98);
                            });
                        } else if line.contains("auto-detected language:") {
                            set_progress(|p| {
                                p.stage = "Transcribing...".to_owned();
                                if p.percent < 16 {
                                    p.percent = 16;
                                }
                            });
                        } else if !line.trim().is_empty() {
                            last_err = line;
                        }
                    }
                }
                last_err
            });

            // Parse whisper-cli stdout for live recognized subtitle lines
            if let Some(out_stream) = stdout {
                let reader = BufReader::new(out_stream);
                for line in reader.lines().map_while(Result::ok) {
                    if let Some((start_secs, end_secs, spoken)) = parse_whisper_stdout_cue(&line) {
                        set_progress(|p| {
                            let next_idx = p.live_cues.len() + 1;
                            p.segments = next_idx;
                            p.latest_line = spoken.clone();
                            p.live_cues.push(LiveCue {
                                index: next_idx,
                                start_secs,
                                end_secs,
                                text: spoken.clone(),
                                translation: String::new(),
                            });
                            if p.percent < 16 {
                                p.percent = 16;
                            }
                        });
                    }
                }
            }

            let status = child.wait();
            let last_stderr = stderr_handle.join().unwrap_or_default();
            let _ = fs::remove_file(&wav_path);

            match status {
                Ok(s) if s.success() => {
                    let srt_path = folder.join("subtitles.srt");
                    if !srt_path.is_file() {
                        finish_inactive();
                        return OpResult {
                            ok: false,
                            error: "whisper-cli finished but subtitles.srt was not created."
                                .to_owned(),
                            cue_count: 0,
                        };
                    }
                    update_item_subtitle_file(&folder, "subtitles.srt");
                    let raw = fs::read_to_string(&srt_path).unwrap_or_default();
                    let cue_count = raw.matches("-->").count();
                    set_progress(|p| {
                        p.stage = "Done".to_owned();
                        p.percent = 100;
                        p.segments = cue_count;
                        p.active = false;
                    });
                    OpResult {
                        ok: true,
                        error: String::new(),
                        cue_count,
                    }
                }
                Ok(_) => {
                    finish_inactive();
                    OpResult {
                        ok: false,
                        error: format!(
                            "whisper-cli failed: {}",
                            if last_stderr.is_empty() {
                                "unknown error"
                            } else {
                                &last_stderr
                            }
                        ),
                        cue_count: 0,
                    }
                }
                Err(e) => {
                    finish_inactive();
                    OpResult {
                        ok: false,
                        error: format!("Failed waiting for whisper-cli: {e}"),
                        cue_count: 0,
                    }
                }
            }
        })
        .await
        .unwrap_or_else(|e| {
            set_progress(|p| p.active = false);
            OpResult {
                ok: false,
                error: format!("Transcription task failed: {e}"),
                cue_count: 0,
            }
        });

        #[cfg(target_arch = "wasm32")]
        let result = {
            let _ = (folder, model_id, vid_for_progress);
            OpResult {
                ok: false,
                error: "Local Whisper transcription is only available in the desktop app."
                    .to_owned(),
                cue_count: 0,
            }
        };

        serde_json::to_string(&result).unwrap_or_default()
    }
}
