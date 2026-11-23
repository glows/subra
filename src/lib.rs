//! Subra native Rust layer exported to TSX via `subra/native`.
//!
//! Handles persistent JSON settings storage, local binary detection
//! (`yt-dlp`, `ffmpeg`, `qjs`), native folder picker, Finder reveal,
//! local video library, Whisper transcription, translation cache, and yt-dlp downloads.

mod downloader;
mod library;
mod speech;
mod translate;

use std::path::PathBuf;
use std::process::Command;

use nsh_core::{
    file_dialog::OpenDialog,
    prelude::*,
};
use serde::Serialize;

use crate::downloader::SubraDownloader;
use crate::library::SubraLibrary;
use crate::speech::SubraSpeech;
use crate::translate::SubraTranslate;

/// The crate's native module (`nsh.json` `"rust"`).
#[native_module("subra/native")]
fn native(registry: &mut Registry) {
    registry
        .module::<SubraConfig>()
        .module::<SubraSystem>()
        .module::<SubraLibrary>()
        .module::<SubraSpeech>()
        .module::<SubraTranslate>()
        .module::<SubraDownloader>();
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

pub(crate) fn expand_tilde(raw: &str) -> PathBuf {
    if let Some(rest) = raw.strip_prefix("~/") {
        home_dir().join(rest)
    } else if raw == "~" {
        home_dir()
    } else {
        PathBuf::from(raw)
    }
}

pub(crate) fn app_support_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        home_dir()
            .join("Library")
            .join("Application Support")
            .join("Subra")
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(home_dir)
            .join("Subra")
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        home_dir().join(".config").join("subra")
    }
}

pub(crate) fn legacy_models_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        home_dir()
            .join("Library")
            .join("Application Support")
            .join("Vimpo")
            .join("models")
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(home_dir)
            .join("Vimpo")
            .join("models")
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        home_dir().join(".config").join("vimpo").join("models")
    }
}

fn config_file_path() -> PathBuf {
    app_support_dir().join("settings.json")
}

/// Persistent settings store backed by a JSON file on disk.
#[module]
pub struct SubraConfig;

#[module]
impl SubraConfig {
    /// Returns the absolute path where settings are stored.
    pub fn settings_path() -> String {
        config_file_path().to_string_lossy().into_owned()
    }

    /// Returns the default Subra library display path (reusing existing library if present).
    pub fn default_library_path() -> String {
        #[cfg(target_os = "windows")]
        {
            return "~/Videos/Subra Library.subra".to_owned();
        }
        #[cfg(not(target_os = "windows"))]
        {
            let subra_lib = expand_tilde("~/Movies/Subra Library.subra");
            if subra_lib.is_dir() {
                return "~/Movies/Subra Library.subra".to_owned();
            }
            let legacy_lib = expand_tilde("~/Movies/Vimpo Library.vimpo");
            if legacy_lib.is_dir() {
                return "~/Movies/Vimpo Library.vimpo".to_owned();
            }
            "~/Movies/Subra Library.subra".to_owned()
        }
    }

    /// Loads saved settings JSON from disk, or returns an empty string if none exists yet.
    pub fn load_settings() -> String {
        let path = config_file_path();
        std::fs::read_to_string(path).unwrap_or_default()
    }

    /// Writes settings JSON to disk, creating parent directories if needed.
    pub fn save_settings(json: String) -> bool {
        let path = config_file_path();
        if let Some(parent) = path.parent() {
            if std::fs::create_dir_all(parent).is_err() {
                return false;
            }
        }
        std::fs::write(path, json).is_ok()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectedComponent {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    version: String,
    source: &'static str,
    installed: bool,
    required: bool,
    update_available: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallComponentResult {
    ok: bool,
    error: String,
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn bin_name(cmd: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        if cmd.ends_with(".exe") {
            cmd.to_owned()
        } else {
            format!("{cmd}.exe")
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd.to_owned()
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn resolve_binary_with_source(cmd: &str) -> Option<(PathBuf, &'static str)> {
    let exe = bin_name(cmd);
    let managed = app_support_dir().join("bin").join(&exe);
    if managed.is_file() {
        return Some((managed, "Managed by Subra"));
    }

    #[cfg(target_os = "macos")]
    {
        for sys in [
            PathBuf::from(format!("/opt/homebrew/bin/{exe}")),
            PathBuf::from(format!("/usr/local/bin/{exe}")),
        ] {
            if sys.is_file() {
                return Some((sys, "System PATH"));
            }
        }
    }

    #[cfg(target_os = "windows")]
    let locator = "where";
    #[cfg(not(target_os = "windows"))]
    let locator = "which";

    if let Ok(out) = Command::new(locator).arg(&exe).output() {
        if out.status.success() {
            let first = String::from_utf8_lossy(&out.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_owned();
            if !first.is_empty() {
                return Some((PathBuf::from(first), "System PATH"));
            }
            return Some((PathBuf::from(&exe), "System PATH"));
        }
    }
    None
}

#[cfg(not(target_arch = "wasm32"))]
fn probe_binary_version(cmd: &str, args: &[&str]) -> Option<(String, &'static str)> {
    let (bin, source) = resolve_binary_with_source(cmd)?;
    let output = Command::new(&bin).args(args).output().ok()?;
    if !output.status.success() {
        return Some(("Installed".to_owned(), source));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let first_line = stdout.lines().next().unwrap_or("").trim();
    if cmd == "ffmpeg" {
        if let Some(rest) = first_line.strip_prefix("ffmpeg version ") {
            if let Some(ver) = rest.split_whitespace().next() {
                return Some((ver.to_owned(), source));
            }
        }
    }
    if cmd == "whisper-cli" {
        return Some(("whisper.cpp".to_owned(), source));
    }
    if first_line.is_empty() {
        Some(("Installed".to_owned(), source))
    } else {
        Some((first_line.to_owned(), source))
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn find_brew() -> Option<PathBuf> {
    for candidate in [
        PathBuf::from("/opt/homebrew/bin/brew"),
        PathBuf::from("/usr/local/bin/brew"),
    ] {
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    if Command::new("brew")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return Some(PathBuf::from("brew"));
    }
    None
}

/// Desktop system integrations: component detection, one-click installation, folder picker, Finder reveal.
#[module]
pub struct SubraSystem;

#[module]
impl SubraSystem {
    /// Detects installed `yt-dlp`, `ffmpeg`, `whisper-cli`, and Whisper models and returns JSON.
    pub fn detect_components() -> String {
        #[cfg(not(target_arch = "wasm32"))]
        let items = {
            let ytdlp = probe_binary_version("yt-dlp", &["--version"]);
            let ffmpeg = probe_binary_version("ffmpeg", &["-version"]);
            // Avoid spawning `whisper-cli --help` on startup because whisper.cpp loads Metal libraries first.
            let whisper = resolve_binary_with_source("whisper-cli")
                .map(|(_, src)| ("whisper.cpp".to_owned(), src));
            let model = crate::speech::first_downloaded_model_id();

            vec![
                DetectedComponent {
                    id: "yt-dlp",
                    name: "yt-dlp",
                    description: "Downloads videos and subtitles from YouTube & X",
                    version: ytdlp
                        .as_ref()
                        .map(|(v, _)| v.clone())
                        .unwrap_or_else(|| "Not installed".to_owned()),
                    source: ytdlp
                        .as_ref()
                        .map(|(_, s)| *s)
                        .unwrap_or("Missing"),
                    installed: ytdlp.is_some(),
                    required: true,
                    update_available: false,
                },
                DetectedComponent {
                    id: "ffmpeg",
                    name: "FFmpeg",
                    description: "Extracts covers, media metadata, and 16kHz audio",
                    version: ffmpeg
                        .as_ref()
                        .map(|(v, _)| v.clone())
                        .unwrap_or_else(|| "Not installed".to_owned()),
                    source: ffmpeg
                        .as_ref()
                        .map(|(_, s)| *s)
                        .unwrap_or("Missing"),
                    installed: ffmpeg.is_some(),
                    required: true,
                    update_available: false,
                },
                DetectedComponent {
                    id: "whisper-cli",
                    name: "whisper-cli",
                    description: "Runs local Metal-accelerated speech recognition",
                    version: whisper
                        .as_ref()
                        .map(|(v, _)| v.clone())
                        .unwrap_or_else(|| "Not installed".to_owned()),
                    source: whisper
                        .as_ref()
                        .map(|(_, s)| *s)
                        .unwrap_or("Missing"),
                    installed: whisper.is_some(),
                    required: true,
                    update_available: false,
                },
                DetectedComponent {
                    id: "whisper-model",
                    name: "Whisper Model",
                    description: "Local GGML speech recognition model",
                    version: model
                        .map(|m| m.to_owned())
                        .unwrap_or_else(|| "Not downloaded".to_owned()),
                    source: if model.is_some() {
                        "Local Models"
                    } else {
                        "Missing"
                    },
                    installed: model.is_some(),
                    required: true,
                    update_available: false,
                },
            ]
        };

        #[cfg(target_arch = "wasm32")]
        let items = vec![
            DetectedComponent {
                id: "yt-dlp",
                name: "yt-dlp",
                description: "Downloads videos and subtitles from YouTube & X",
                version: "Desktop only".to_owned(),
                source: "Web Preview",
                installed: true,
                required: true,
                update_available: false,
            },
            DetectedComponent {
                id: "ffmpeg",
                name: "FFmpeg",
                description: "Extracts covers, media metadata, and 16kHz audio",
                version: "Desktop only".to_owned(),
                source: "Web Preview",
                installed: true,
                required: true,
                update_available: false,
            },
            DetectedComponent {
                id: "whisper-cli",
                name: "whisper-cli",
                description: "Runs local Metal-accelerated speech recognition",
                version: "Desktop only".to_owned(),
                source: "Web Preview",
                installed: true,
                required: true,
                update_available: false,
            },
            DetectedComponent {
                id: "whisper-model",
                name: "Whisper Model",
                description: "Local GGML speech recognition model",
                version: "Desktop only".to_owned(),
                source: "Web Preview",
                installed: true,
                required: true,
                update_available: false,
            },
        ];

        serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_owned())
    }

    /// Installs a missing component (`yt-dlp`, `ffmpeg`, or `whisper-cli`).
    pub async fn install_component(component_id: String, proxy: String) -> String {
        #[cfg(not(target_arch = "wasm32"))]
        let result = blocking(move || -> InstallComponentResult {
            match component_id.as_str() {
                "yt-dlp" => {
                    let bin_dir = app_support_dir().join("bin");
                    if let Err(e) = std::fs::create_dir_all(&bin_dir) {
                        return InstallComponentResult {
                            ok: false,
                            error: format!("Cannot create bin folder: {e}"),
                        };
                    }
                    let exe = bin_name("yt-dlp");
                    let dest = bin_dir.join(&exe);
                    let part = bin_dir.join(format!("{exe}.part"));

                    #[cfg(target_os = "macos")]
                    let url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";
                    #[cfg(target_os = "windows")]
                    let url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
                    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
                    let url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

                    let mut cmd = Command::new(bin_name("curl"));
                    cmd.args(["-fSL", "--retry", "2", "-o"]).arg(&part);
                    if !proxy.trim().is_empty() {
                        cmd.args(["--proxy", proxy.trim()]);
                    }
                    cmd.arg(url);

                    match cmd.output() {
                        Ok(out) if out.status.success() => {
                            #[cfg(unix)]
                            {
                                use std::os::unix::fs::PermissionsExt;
                                let _ = std::fs::set_permissions(
                                    &part,
                                    std::fs::Permissions::from_mode(0o755),
                                );
                            }
                            if let Err(e) = std::fs::rename(&part, &dest) {
                                let _ = std::fs::remove_file(&part);
                                return InstallComponentResult {
                                    ok: false,
                                    error: format!("Failed to save yt-dlp: {e}"),
                                };
                            }
                            InstallComponentResult {
                                ok: true,
                                error: String::new(),
                            }
                        }
                        Ok(out) => {
                            let _ = std::fs::remove_file(&part);
                            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_owned();
                            InstallComponentResult {
                                ok: false,
                                error: if stderr.is_empty() {
                                    format!("curl failed (exit {})", out.status)
                                } else {
                                    stderr
                                },
                            }
                        }
                        Err(e) => InstallComponentResult {
                            ok: false,
                            error: format!("Failed to invoke curl: {e}"),
                        },
                    }
                }
                "ffmpeg" | "whisper-cli" => {
                    #[cfg(target_os = "windows")]
                    {
                        if component_id == "ffmpeg" {
                            let mut cmd = Command::new("winget");
                            cmd.args([
                                "install",
                                "--id",
                                "Gyan.FFmpeg",
                                "-e",
                                "--silent",
                                "--accept-source-agreements",
                                "--accept-package-agreements",
                            ]);
                            if !proxy.trim().is_empty() {
                                cmd.env("ALL_PROXY", proxy.trim());
                                cmd.env("HTTPS_PROXY", proxy.trim());
                            }
                            match cmd.output() {
                                Ok(out) if out.status.success() => InstallComponentResult {
                                    ok: true,
                                    error: String::new(),
                                },
                                Ok(out) => {
                                    let stderr = String::from_utf8_lossy(&out.stderr);
                                    let msg = stderr
                                        .lines()
                                        .rfind(|l| !l.trim().is_empty())
                                        .unwrap_or("winget install Gyan.FFmpeg failed")
                                        .to_owned();
                                    InstallComponentResult {
                                        ok: false,
                                        error: msg,
                                    }
                                }
                                Err(e) => InstallComponentResult {
                                    ok: false,
                                    error: format!(
                                        "winget not available ({e}). Install FFmpeg manually or via: winget install Gyan.FFmpeg"
                                    ),
                                },
                            }
                        } else {
                            // Download prebuilt whisper.cpp Windows x64 zip into %APPDATA%\Subra\bin
                            let bin_dir = app_support_dir().join("bin");
                            if let Err(e) = std::fs::create_dir_all(&bin_dir) {
                                return InstallComponentResult {
                                    ok: false,
                                    error: format!("Cannot create bin folder: {e}"),
                                };
                            }
                            let zip_path = bin_dir.join("whisper-bin-x64.zip");
                            let url = "https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper-bin-x64.zip";
                            let mut dl = Command::new("curl.exe");
                            dl.args(["-fSL", "--retry", "2", "-o"]).arg(&zip_path);
                            if !proxy.trim().is_empty() {
                                dl.args(["--proxy", proxy.trim()]);
                            }
                            dl.arg(url);
                            match dl.output() {
                                Ok(out) if out.status.success() => {
                                    let ps_script = format!(
                                        "Expand-Archive -Force -Path '{}' -DestinationPath '{}'",
                                        zip_path.display(),
                                        bin_dir.display()
                                    );
                                    let ex = Command::new("powershell")
                                        .args(["-NoProfile", "-Command", &ps_script])
                                        .output();
                                    let _ = std::fs::remove_file(&zip_path);
                                    match ex {
                                        Ok(o) if o.status.success() => InstallComponentResult {
                                            ok: true,
                                            error: String::new(),
                                        },
                                        Ok(o) => InstallComponentResult {
                                            ok: false,
                                            error: String::from_utf8_lossy(&o.stderr)
                                                .trim()
                                                .to_owned(),
                                        },
                                        Err(e) => InstallComponentResult {
                                            ok: false,
                                            error: format!("Failed to extract whisper zip: {e}"),
                                        },
                                    }
                                }
                                Ok(out) => {
                                    let _ = std::fs::remove_file(&zip_path);
                                    InstallComponentResult {
                                        ok: false,
                                        error: String::from_utf8_lossy(&out.stderr)
                                            .trim()
                                            .to_owned(),
                                    }
                                }
                                Err(e) => InstallComponentResult {
                                    ok: false,
                                    error: format!("Failed to download whisper-cli: {e}"),
                                },
                            }
                        }
                    }

                    #[cfg(not(target_os = "windows"))]
                    {
                        let formula = if component_id == "ffmpeg" {
                            "ffmpeg"
                        } else {
                            "whisper-cpp"
                        };
                        let Some(brew) = find_brew() else {
                            return InstallComponentResult {
                                ok: false,
                                error: format!(
                                    "Homebrew not found. Install Homebrew first, then run: brew install {formula}"
                                ),
                            };
                        };
                        let mut cmd = Command::new(&brew);
                        cmd.args(["install", formula]);
                        if !proxy.trim().is_empty() {
                            cmd.env("ALL_PROXY", proxy.trim());
                            cmd.env("HTTPS_PROXY", proxy.trim());
                        }
                        match cmd.output() {
                            Ok(out) if out.status.success() => InstallComponentResult {
                                ok: true,
                                error: String::new(),
                            },
                            Ok(out) => {
                                let stderr = String::from_utf8_lossy(&out.stderr);
                                let msg = stderr
                                    .lines()
                                    .rfind(|l| !l.trim().is_empty())
                                    .unwrap_or("brew install failed")
                                    .to_owned();
                                InstallComponentResult {
                                    ok: false,
                                    error: msg,
                                }
                            }
                            Err(e) => InstallComponentResult {
                                ok: false,
                                error: format!("Failed to run brew: {e}"),
                            },
                        }
                    }
                }
                other => InstallComponentResult {
                    ok: false,
                    error: format!("Unsupported component: {other}"),
                },
            }
        })
        .await
        .unwrap_or_else(|e| InstallComponentResult {
            ok: false,
            error: format!("Install task failed: {e}"),
        });

        #[cfg(target_arch = "wasm32")]
        let result = {
            let _ = (component_id, proxy);
            InstallComponentResult {
                ok: false,
                error: "Component installation is only available in the desktop app.".to_owned(),
            }
        };

        serde_json::to_string(&result).unwrap_or_default()
    }

    /// Opens a native folder picker for selecting a Vimpo library directory.
    pub async fn pick_library_folder() -> String {
        let picked = pick_paths(
            OpenDialog::folders()
                .multiple(false)
                .button_label("Select Library"),
        )
        .await;

        match picked {
            Ok(Some(mut paths)) if !paths.is_empty() => {
                let path = paths.remove(0);
                let home = home_dir();
                if let Ok(rel) = path.strip_prefix(&home) {
                    format!("~/{}", rel.to_string_lossy())
                } else {
                    path.to_string_lossy().into_owned()
                }
            }
            _ => String::new(),
        }
    }

    /// Reveals the library folder (or its parent if not yet created) in Finder / File Explorer.
    pub async fn reveal_folder(path: String) -> bool {
        let resolved = expand_tilde(&path);
        let target = if resolved.exists() {
            resolved
        } else if let Some(parent) = resolved.parent() {
            if parent.exists() {
                parent.to_path_buf()
            } else {
                home_dir()
            }
        } else {
            home_dir()
        };
        reveal_path(target).await.is_ok()
    }
}
