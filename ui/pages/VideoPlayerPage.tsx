import {
  Clipboard,
  keymap,
  Scroll,
  signal,
  Text,
  Video,
  type VideoRef,
  View,
} from "nsh";
import { Button } from "nsh/base";
import { SubraButton } from "../components/SettingsRow";
import {
  activeSubtitles,
  activeSummary,
  closeVideo,
  deleteVideoItem,
  exportVideoSubtitles,
  formatBytes,
  formatDuration,
  revealVideoFolder,
  savePlaybackPosition,
  showToast,
  summarizeActiveVideo,
  summarizingVideoId,
  transcribeProgress,
  transcribeVideo,
  transcribingVideoId,
  translateVideoSubtitles,
  translatingProgress,
} from "../store";
import { palette } from "../theme";
import type { VideoItem } from "../types";

const RATES = [0.75, 1.0, 1.25, 1.5, 2.0];

type InspectorTab = "subtitles" | "summary";

const EXPORT_PRESETS: Array<{
  label: string;
  format: "srt" | "vtt" | "txt";
  mode: "bilingual" | "original" | "translation";
}> = [
  { label: "SRT · Bilingual", format: "srt", mode: "bilingual" },
  { label: "SRT · Original Only", format: "srt", mode: "original" },
  { label: "SRT · Translation Only", format: "srt", mode: "translation" },
  { label: "VTT · Bilingual", format: "vtt", mode: "bilingual" },
  { label: "TXT · Plain Transcript", format: "txt", mode: "bilingual" },
];

export function VideoPlayerPage(props: { video: VideoItem }) {
  const video = props.video;
  let playerRef: VideoRef | null = null;

  const paused = signal(false);
  const currentTime = signal(video.lastPositionSecs || 0);
  const duration = signal(video.durationSecs || 0);
  const rate = signal(1.0);
  const showInspector = signal(true);
  const activeTab = signal<InspectorTab>("subtitles");
  const showExportMenu = signal(false);
  const playbackError = signal("");
  let lastSavedSec = Math.floor(video.lastPositionSecs || 0);
  let restoredInitialPosition = false;

  const activeCue = () => {
    const t = currentTime();
    return (
      activeSubtitles().find((c) => t >= c.startSecs && t <= c.endSecs) ?? null
    );
  };

  const seekTo = (secs: number) => {
    const maxDur = duration();
    const clamped =
      maxDur > 0 ? Math.max(0, Math.min(maxDur, secs)) : Math.max(0, secs);
    currentTime.set(clamped);
    playerRef?.seek(clamped);
  };

  const jumpCue = (delta: -1 | 1) => {
    const cues = activeSubtitles();
    if (cues.length === 0) return;
    const t = currentTime();
    let idx = cues.findIndex((c) => t >= c.startSecs && t <= c.endSecs);
    if (idx === -1) {
      idx = cues.findIndex((c) => c.startSecs > t);
      if (idx === -1) idx = cues.length - 1;
      else if (delta < 0) idx = Math.max(0, idx - 1);
    } else {
      idx = Math.max(0, Math.min(cues.length - 1, idx + delta));
    }
    seekTo(cues[idx].startSecs);
  };

  const stepRate = (delta: -1 | 1) => {
    const idx = RATES.indexOf(rate());
    const nextIdx = Math.max(
      0,
      Math.min(RATES.length - 1, (idx === -1 ? 1 : idx) + delta),
    );
    rate.set(RATES[nextIdx]);
    showToast(`Playback speed: ${RATES[nextIdx]}x`);
  };

  const handleBack = () => {
    savePlaybackPosition(video.id, currentTime());
    closeVideo();
  };

  // Native keyboard shortcuts (automatically unbound when VideoPlayerPage unmounts)
  keymap.bind({
    space: () => paused.set(!paused()),
    left: () => seekTo(currentTime() - 5),
    right: () => seekTo(currentTime() + 5),
    up: () => jumpCue(-1),
    down: () => jumpCue(1),
    "[": () => stepRate(-1),
    "]": () => stepRate(1),
    escape: () => {
      if (showExportMenu()) {
        showExportMenu.set(false);
      } else {
        handleBack();
      }
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#141513" }}>
      {/* Top Header Bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 18,
          paddingRight: 18,
          paddingTop: 14,
          paddingBottom: 14,
          backgroundColor: palette.sidebarBg,
          borderBottomColor: palette.sidebarBorder,
          borderBottomWidth: 1,
          gap: 12,
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <SubraButton
            testID="player-back-btn"
            label="← Back"
            onPress={handleBack}
          />
          <View style={{ flex: 1, gap: 1 }}>
            <Text
              class="truncate"
              style={{
                color: palette.textPrimary,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {video.title}
            </Text>
            <Text style={{ color: palette.textMuted, fontSize: 11.5 }}>
              {[
                video.width > 0 ? `${video.width}×${video.height}` : null,
                duration() > 0 ? formatDuration(duration()) : null,
                formatBytes(video.fileSizeBytes),
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <SubraButton
            label={showInspector() ? "Hide Panel" : "Subtitles & AI"}
            onPress={() => showInspector.set(!showInspector())}
          />
          <SubraButton
            label="Finder"
            onPress={() => {
              void revealVideoFolder(video.id);
            }}
          />
          <Button
            testID="player-delete-btn"
            onPress={() => {
              void deleteVideoItem(video.id);
            }}
            style={{
              backgroundColor: "#3A2222",
              borderRadius: 7,
              paddingLeft: 11,
              paddingRight: 11,
              paddingTop: 6,
              paddingBottom: 6,
            }}
          >
            <Text style={{ color: "#FCA5A5", fontSize: 12.5, fontWeight: "500" }}>
              Delete
            </Text>
          </Button>
        </View>
      </View>

      {/* Player + Inspector Split */}
      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Left: Native Video Surface */}
        <View style={{ flex: 1, backgroundColor: "#0B0C0B" }}>
          <View style={{ flex: 1, position: "relative" }}>
            <Video
              ref={(el) => {
                playerRef = el;
              }}
              src={video.videoUrl}
              paused={paused()}
              controls
              rate={rate()}
              progressUpdateInterval={250}
              onLoad={(e) => {
                playbackError.set("");
                if (e.duration > 0) duration.set(e.duration);
                if (!restoredInitialPosition && video.lastPositionSecs > 2) {
                  restoredInitialPosition = true;
                  playerRef?.seek(video.lastPositionSecs);
                }
              }}
              onProgress={(e) => {
                currentTime.set(e.currentTime);
                if (e.duration > 0) duration.set(e.duration);
                const whole = Math.floor(e.currentTime);
                if (Math.abs(whole - lastSavedSec) >= 5) {
                  lastSavedSec = whole;
                  savePlaybackPosition(video.id, e.currentTime);
                }
              }}
              onError={(e) => {
                playbackError.set(e.message || "Failed to load video");
              }}
              style={{ flex: 1 }}
            />

            {/* Floating Subtitle Overlay */}
            {activeCue() ? (
              <View
                style={{
                  position: "absolute",
                  left: 36,
                  right: 36,
                  bottom: 64,
                  alignItems: "center",
                  pointerEvents: "none",
                }}
              >
                <View
                  style={{
                    backgroundColor: "rgba(12, 13, 12, 0.82)",
                    borderRadius: 8,
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingTop: 8,
                    paddingBottom: 8,
                    gap: 3,
                    maxWidth: 640,
                  }}
                >
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: 15,
                      fontWeight: "600",
                      textAlign: "center",
                    }}
                  >
                    {activeCue()!.text}
                  </Text>
                  {activeCue()!.translation ? (
                    <Text
                      style={{
                        color: palette.amber,
                        fontSize: 13.5,
                        textAlign: "center",
                      }}
                    >
                      {activeCue()!.translation}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {playbackError() ? (
              <View
                style={{
                  position: "absolute",
                  top: 16,
                  left: 16,
                  right: 16,
                  backgroundColor: "#3A2222",
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <Text style={{ color: "#FCA5A5", fontSize: 12.5 }}>
                  {playbackError()}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Bottom Playback Control & Shortcut Hint Bar */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingLeft: 16,
              paddingRight: 16,
              paddingTop: 9,
              paddingBottom: 9,
              backgroundColor: "#161715",
              borderTopColor: palette.sidebarBorder,
              borderTopWidth: 1,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Button
                testID="player-play-pause-btn"
                onPress={() => paused.set(!paused())}
                style={{
                  backgroundColor: palette.buttonBg,
                  borderRadius: 6,
                  paddingLeft: 10,
                  paddingRight: 10,
                  paddingTop: 4,
                  paddingBottom: 4,
                }}
              >
                <Text style={{ color: palette.textPrimary, fontSize: 12 }}>
                  {paused() ? "▶ Play" : "⏸ Pause"}
                </Text>
              </Button>
              <Text style={{ color: palette.textSecondary, fontSize: 12 }}>
                {`${formatDuration(currentTime())} / ${formatDuration(duration())}`}
              </Text>
            </View>

            <Text style={{ color: palette.textMuted, fontSize: 11 }}>
              Space Play · ←/→ 5s · ↑/↓ Cue · [/] Speed
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {RATES.map((r) => {
                const active = rate() === r;
                return (
                  <Button
                    onPress={() => rate.set(r)}
                    style={{
                      paddingLeft: 7,
                      paddingRight: 7,
                      paddingTop: 3,
                      paddingBottom: 3,
                      borderRadius: 5,
                      backgroundColor: active
                        ? palette.amberSoftBg
                        : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        color: active ? palette.amber : palette.textSecondary,
                        fontSize: 11.5,
                        fontWeight: active ? "600" : "400",
                      }}
                    >
                      {`${r}x`}
                    </Text>
                  </Button>
                );
              })}
            </View>
          </View>
        </View>

        {/* Right: Subtitles & AI Summary Inspector */}
        {showInspector() ? (
          <View
            style={{
              width: 360,
              backgroundColor: palette.sidebarBg,
              borderLeftColor: palette.sidebarBorder,
              borderLeftWidth: 1,
            }}
          >
            {/* Inspector Tab Switcher */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 8,
                gap: 6,
                borderBottomColor: palette.sidebarBorder,
                borderBottomWidth: 1,
              }}
            >
              <View
                testID="tab-subtitles"
                onPress={() => activeTab.set("subtitles")}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingTop: 6,
                  paddingBottom: 6,
                  borderRadius: 7,
                  cursor: "pointer",
                  backgroundColor:
                    activeTab() === "subtitles"
                      ? palette.sidebarActiveBg
                      : "transparent",
                }}
              >
                <Text
                  style={{
                    color:
                      activeTab() === "subtitles"
                        ? palette.amber
                        : palette.textSecondary,
                    fontSize: 12.5,
                    fontWeight: "600",
                  }}
                >
                  {`Subtitles (${activeSubtitles().length})`}
                </Text>
              </View>
              <View
                testID="tab-summary"
                onPress={() => {
                  showExportMenu.set(false);
                  activeTab.set("summary");
                }}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingTop: 6,
                  paddingBottom: 6,
                  borderRadius: 7,
                  cursor: "pointer",
                  backgroundColor:
                    activeTab() === "summary"
                      ? palette.sidebarActiveBg
                      : "transparent",
                }}
              >
                <Text
                  style={{
                    color:
                      activeTab() === "summary"
                        ? palette.amber
                        : palette.textSecondary,
                    fontSize: 12.5,
                    fontWeight: "600",
                  }}
                >
                  ✦ AI Summary
                </Text>
              </View>
            </View>

            {/* Tab Content */}
            {activeTab() === "subtitles" ? (
              <View style={{ flex: 1 }}>
                {/* Subtitles Action Bar */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingLeft: 12,
                    paddingRight: 12,
                    paddingTop: 10,
                    paddingBottom: 10,
                    borderBottomColor: palette.sidebarBorder,
                    borderBottomWidth: 1,
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <SubraButton
                      testID="player-transcribe-btn"
                      label={
                        transcribingVideoId() === video.id
                          ? `${transcribeProgress()?.percent ?? 0}%`
                          : "Transcribe"
                      }
                      disabled={transcribingVideoId() !== null}
                      onPress={() => {
                        void transcribeVideo(video.id);
                      }}
                    />
                    <Button
                      testID="player-translate-btn"
                      disabled={
                        translatingProgress() !== null ||
                        activeSubtitles().length === 0
                      }
                      onPress={() => {
                        void translateVideoSubtitles(video.id, video.title);
                      }}
                      style={{
                        backgroundColor:
                          translatingProgress() !== null ||
                          activeSubtitles().length === 0
                            ? palette.buttonDisabledBg
                            : palette.amber,
                        borderRadius: 7,
                        paddingLeft: 10,
                        paddingRight: 10,
                        paddingTop: 6,
                        paddingBottom: 6,
                      }}
                    >
                      <Text
                        style={{
                          color:
                            translatingProgress() !== null ||
                            activeSubtitles().length === 0
                              ? palette.textMuted
                              : "#1B160C",
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        {translatingProgress()
                          ? `${translatingProgress()!.done}/${translatingProgress()!.total}`
                          : "Translate"}
                      </Text>
                    </Button>
                  </View>

                  <SubraButton
                    testID="player-export-btn"
                    label={showExportMenu() ? "Export ▴" : "Export ▾"}
                    disabled={activeSubtitles().length === 0}
                    onPress={() => showExportMenu.set(!showExportMenu())}
                  />
                </View>

                {/* Inline Export Format Menu */}
                {showExportMenu() ? (
                  <View
                    testID="export-format-menu"
                    style={{
                      backgroundColor: "#1E1F1C",
                      borderBottomColor: palette.sidebarBorder,
                      borderBottomWidth: 1,
                      padding: 10,
                      gap: 5,
                    }}
                  >
                    <Text
                      style={{
                        color: palette.textMuted,
                        fontSize: 11,
                        fontWeight: "600",
                        paddingLeft: 4,
                        marginBottom: 2,
                      }}
                    >
                      Export Subtitles As
                    </Text>
                    {EXPORT_PRESETS.map((preset) => (
                      <View
                        onPress={() => {
                          showExportMenu.set(false);
                          void exportVideoSubtitles(
                            video.title,
                            preset.format,
                            preset.mode,
                          );
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingLeft: 10,
                          paddingRight: 10,
                          paddingTop: 7,
                          paddingBottom: 7,
                          borderRadius: 7,
                          backgroundColor: palette.cardBg,
                          cursor: "pointer",
                        }}
                      >
                        <Text
                          style={{
                            color: palette.textPrimary,
                            fontSize: 12.5,
                          }}
                        >
                          {preset.label}
                        </Text>
                        <Text
                          style={{
                            color: palette.amber,
                            fontSize: 11,
                            fontWeight: "600",
                          }}
                        >
                          {`.${preset.format}`}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Live Whisper Transcription Progress Banner */}
                {transcribingVideoId() === video.id && transcribeProgress() ? (
                  <View
                    testID="transcribe-progress-panel"
                    style={{
                      padding: 14,
                      backgroundColor: "#1D1B17",
                      borderBottomColor: palette.sidebarBorder,
                      borderBottomWidth: 1,
                      gap: 8,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          color: palette.amber,
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        {transcribeProgress()!.stage}
                      </Text>
                      <Text
                        style={{
                          color: palette.textSecondary,
                          fontSize: 11.5,
                          fontWeight: "600",
                        }}
                      >
                        {`${transcribeProgress()!.percent}%`}
                      </Text>
                    </View>

                    <View
                      style={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: "#2F312D",
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          width: `${Math.max(3, transcribeProgress()!.percent)}%`,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: palette.amber,
                        }}
                      />
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <Text
                        class="truncate"
                        style={{
                          flex: 1,
                          color: palette.textSecondary,
                          fontSize: 11.5,
                        }}
                      >
                        {transcribeProgress()!.latestLine ||
                          "Preparing audio & Metal GPU..."}
                      </Text>
                      {transcribeProgress()!.segments > 0 ? (
                        <Text style={{ color: palette.textMuted, fontSize: 11 }}>
                          {`${transcribeProgress()!.segments} segs`}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {/* Subtitle Cue List */}
                {activeSubtitles().length === 0 ? (
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 24,
                      gap: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: palette.textPrimary,
                        fontSize: 13.5,
                        fontWeight: "600",
                      }}
                    >
                      {transcribingVideoId() === video.id
                        ? "Running Whisper..."
                        : "No subtitles yet"}
                    </Text>
                    <Text
                      style={{
                        color: palette.textMuted,
                        fontSize: 12,
                        lineHeight: 17,
                        textAlign: "center",
                      }}
                    >
                      {transcribingVideoId() === video.id
                        ? "Extracting audio with FFmpeg and transcribing locally via whisper-cli."
                        : "Click Transcribe above to generate subtitles locally with your selected Whisper model, then Translate or Export."}
                    </Text>
                  </View>
                ) : (
                  <Scroll
                    style={{ flex: 1 }}
                    contentStyle={{ padding: 10, gap: 6 }}
                  >
                    {activeSubtitles().map((cue) => {
                      const isCurrent = activeCue()?.index === cue.index;
                      return (
                        <View
                          onPress={() => seekTo(cue.startSecs)}
                          style={{
                            padding: 10,
                            borderRadius: 8,
                            cursor: "pointer",
                            backgroundColor: isCurrent
                              ? palette.sidebarActiveBg
                              : "#1C1C1A",
                            borderColor: isCurrent
                              ? palette.sidebarActiveBorder
                              : "transparent",
                            borderWidth: 1,
                            gap: 3,
                          }}
                        >
                          <Text
                            style={{
                              color: isCurrent
                                ? palette.amber
                                : palette.textMuted,
                              fontSize: 10.5,
                              fontWeight: "600",
                            }}
                          >
                            {formatDuration(cue.startSecs)}
                          </Text>
                          <Text
                            style={{
                              color: palette.textPrimary,
                              fontSize: 12.5,
                              lineHeight: 17,
                            }}
                          >
                            {cue.text}
                          </Text>
                          {cue.translation ? (
                            <Text
                              style={{
                                color: palette.textSecondary,
                                fontSize: 12,
                                lineHeight: 16,
                              }}
                            >
                              {cue.translation}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </Scroll>
                )}
              </View>
            ) : (
              /* AI Summary Tab */
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingLeft: 12,
                    paddingRight: 12,
                    paddingTop: 10,
                    paddingBottom: 10,
                    borderBottomColor: palette.sidebarBorder,
                    borderBottomWidth: 1,
                    gap: 8,
                  }}
                >
                  <Button
                    testID="player-summarize-btn"
                    disabled={
                      summarizingVideoId() !== null ||
                      activeSubtitles().length === 0
                    }
                    onPress={() => {
                      void summarizeActiveVideo(video.id, video.title);
                    }}
                    style={{
                      backgroundColor:
                        summarizingVideoId() !== null ||
                        activeSubtitles().length === 0
                          ? palette.buttonDisabledBg
                          : palette.amber,
                      borderRadius: 7,
                      paddingLeft: 12,
                      paddingRight: 12,
                      paddingTop: 6,
                      paddingBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        color:
                          summarizingVideoId() !== null ||
                          activeSubtitles().length === 0
                            ? palette.textMuted
                            : "#1B160C",
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      {summarizingVideoId() === video.id
                        ? "Summarizing..."
                        : activeSummary()
                          ? "Regenerate Summary"
                          : "✦ Generate Summary"}
                    </Text>
                  </Button>

                  {activeSummary() ? (
                    <SubraButton
                      testID="copy-summary-btn"
                      label="Copy"
                      onPress={() => {
                        void Clipboard.writeText(activeSummary());
                        showToast("Summary copied to clipboard");
                      }}
                    />
                  ) : null}
                </View>

                {activeSummary() ? (
                  <Scroll
                    style={{ flex: 1 }}
                    contentStyle={{ padding: 14, gap: 8 }}
                  >
                    <Text
                      style={{
                        color: palette.textPrimary,
                        fontSize: 12.5,
                        lineHeight: 20,
                      }}
                    >
                      {activeSummary()}
                    </Text>
                  </Scroll>
                ) : (
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 24,
                      gap: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: palette.textPrimary,
                        fontSize: 13.5,
                        fontWeight: "600",
                      }}
                    >
                      {summarizingVideoId() === video.id
                        ? "Analyzing transcript..."
                        : "AI Video Summary"}
                    </Text>
                    <Text
                      style={{
                        color: palette.textMuted,
                        fontSize: 12,
                        lineHeight: 17,
                        textAlign: "center",
                      }}
                    >
                      {activeSubtitles().length === 0
                        ? "Transcribe the video first, then click Generate Summary to extract key takeaways and timeline highlights."
                        : "Generate a structured TL;DR, key takeaways, and timestamped highlights using your active AI Provider. Saved as summary.md."}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}
