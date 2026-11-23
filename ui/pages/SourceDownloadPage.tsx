import { Image, Scroll, signal, Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import {
  CardDivider,
  HelperText,
  SectionTitle,
  SettingsCard,
  SettingsRow,
  SubraButton,
  SubraSelect,
  SubraSwitch,
} from "../components/SettingsRow";
import {
  downloadRemoteVideo,
  downloadingUrl,
  fetchRemoteVideoInfo,
  formatBytes,
  formatDuration,
  openVideo,
  settings,
  showToast,
  type VideoPreviewInfo,
  videos,
} from "../store";
import { palette } from "../theme";

const QUALITY_ITEMS = [
  { value: "best", title: "Best Available (MP4)" },
  { value: "1080p", title: "1080p HD" },
  { value: "720p", title: "720p" },
  { value: "audio", title: "Audio Only (M4A)" },
];

export function SourceDownloadPage(props: { source: "youtube" | "x" }) {
  const isYouTube = props.source === "youtube";
  const url = signal("");
  const quality = signal("best");
  const downloadSubs = signal(true);
  const fetching = signal(false);
  const preview = signal<VideoPreviewInfo | null>(null);
  const errorMsg = signal("");
  const lastDownloadedId = signal<string | null>(null);

  const sourceVideos = () => videos().filter((v) => v.source === props.source);

  const handleFetch = async () => {
    const rawUrl = url().trim();
    if (!rawUrl) {
      showToast("Paste a link first");
      return;
    }
    fetching.set(true);
    errorMsg.set("");
    try {
      const info = await fetchRemoteVideoInfo(rawUrl);
      if (info.ok) {
        preview.set(info);
      } else {
        preview.set(null);
        errorMsg.set(info.error || "Could not fetch video info");
      }
    } catch (err) {
      errorMsg.set(String(err));
    } finally {
      fetching.set(false);
    }
  };

  const handleDownload = async () => {
    const rawUrl = url().trim();
    if (!rawUrl) {
      showToast("Paste a link first");
      return;
    }
    errorMsg.set("");
    lastDownloadedId.set(null);
    const item = await downloadRemoteVideo({
      url: rawUrl,
      source: props.source,
      quality: quality(),
      downloadSubs: downloadSubs(),
    });
    if (item) {
      lastDownloadedId.set(item.id);
      url.set("");
      preview.set(null);
    }
  };

  return (
    <Scroll
      style={{ flex: 1, backgroundColor: palette.mainBg }}
      contentStyle={{
        alignItems: "center",
        paddingTop: 28,
        paddingBottom: 48,
        paddingLeft: 32,
        paddingRight: 32,
      }}
    >
      <View style={{ width: "100%", maxWidth: 680 }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              backgroundColor: isYouTube ? "#3F1D1D" : "#2B2D2A",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: isYouTube ? "#F87171" : palette.textPrimary,
                fontSize: 15,
                fontWeight: "700",
              }}
            >
              {isYouTube ? "▶" : "𝕏"}
            </Text>
          </View>
          <View style={{ gap: 2 }}>
            <Text
              style={{
                color: palette.textPrimary,
                fontSize: 18,
                fontWeight: "600",
              }}
            >
              {isYouTube ? "YouTube" : "X"}
            </Text>
            <Text style={{ color: palette.textMuted, fontSize: 12 }}>
              {isYouTube
                ? "Download YouTube videos via yt-dlp directly into your Subra library."
                : "Download videos from X posts via yt-dlp directly into your Subra library."}
            </Text>
          </View>
        </View>

        {/* URL Input Card */}
        <SettingsCard style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Input
              testID={`source-url-input-${props.source}`}
              value={url()}
              placeholder={
                isYouTube
                  ? "https://www.youtube.com/watch?v=..."
                  : "https://x.com/username/status/..."
              }
              onChange={({ value }) => url.set(value)}
              style={{
                flex: 1,
                color: palette.textPrimary,
                fontSize: 13,
                backgroundColor: palette.inputBg,
                borderColor: palette.cardBorder,
                borderWidth: 1,
                borderRadius: 8,
                paddingLeft: 12,
                paddingRight: 12,
                paddingTop: 8,
                paddingBottom: 8,
              }}
            />
            <SubraButton
              testID={`source-fetch-btn-${props.source}`}
              label={fetching() ? "Checking..." : "Fetch Info"}
              disabled={fetching() || downloadingUrl() !== null}
              onPress={() => {
                void handleFetch();
              }}
            />
            <Button
              testID={`source-download-btn-${props.source}`}
              disabled={downloadingUrl() !== null}
              onPress={() => {
                void handleDownload();
              }}
              style={{
                backgroundColor:
                  downloadingUrl() !== null
                    ? palette.buttonDisabledBg
                    : palette.amber,
                borderRadius: 7,
                paddingLeft: 14,
                paddingRight: 14,
                paddingTop: 7,
                paddingBottom: 7,
              }}
            >
              <Text
                style={{
                  color:
                    downloadingUrl() !== null ? palette.textMuted : "#1B160C",
                  fontSize: 12.5,
                  fontWeight: "700",
                }}
              >
                {downloadingUrl() !== null ? "Downloading..." : "Download"}
              </Text>
            </Button>
          </View>

          {errorMsg() ? (
            <View
              style={{
                backgroundColor: "#3A2222",
                borderRadius: 7,
                padding: 10,
              }}
            >
              <Text style={{ color: "#FCA5A5", fontSize: 12 }}>
                {errorMsg()}
              </Text>
            </View>
          ) : null}

          {lastDownloadedId() ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "#1E3324",
                borderRadius: 8,
                paddingLeft: 12,
                paddingRight: 12,
                paddingTop: 8,
                paddingBottom: 8,
              }}
            >
              <Text style={{ color: "#86EFAC", fontSize: 12.5 }}>
                Download complete and added to your library.
              </Text>
              <SubraButton
                label="Play Now"
                onPress={() => {
                  const id = lastDownloadedId();
                  if (id) openVideo(id);
                }}
              />
            </View>
          ) : null}

          {/* Preview Box */}
          {preview() ? (
            <View
              style={{
                flexDirection: "row",
                gap: 14,
                padding: 12,
                borderRadius: 9,
                backgroundColor: "#1B1D1A",
                borderColor: palette.cardBorder,
                borderWidth: 1,
                alignItems: "center",
              }}
            >
              {preview()!.thumbnailUrl ? (
                <Image
                  src={preview()!.thumbnailUrl}
                  style={{
                    width: 140,
                    height: 80,
                    borderRadius: 6,
                    objectFit: "cover",
                  }}
                />
              ) : null}
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  class="line-clamp-2"
                  style={{
                    color: palette.textPrimary,
                    fontSize: 13.5,
                    fontWeight: "600",
                    lineHeight: 18,
                  }}
                >
                  {preview()!.title}
                </Text>
                <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                  {[
                    preview()!.uploader || null,
                    preview()!.durationSecs > 0
                      ? formatDuration(preview()!.durationSecs)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
            </View>
          ) : null}
        </SettingsCard>

        {/* Download Options */}
        <SectionTitle title="Download Options" />
        <SettingsCard>
          <SettingsRow
            label="Preferred Quality"
            right={
              <SubraSelect
                value={quality()}
                items={QUALITY_ITEMS}
                accessibilityLabel="Preferred Quality"
                minWidth={190}
                onChange={(v) => quality.set(v)}
              />
            }
          />
          <CardDivider />
          <SettingsRow
            label="Download Available Subtitles"
            description="Automatically fetch English / Chinese subtitles when provided by the source."
            right={
              <SubraSwitch
                checked={downloadSubs()}
                accessibilityLabel="Download Available Subtitles"
                onChange={(checked) => downloadSubs.set(checked)}
              />
            }
          />
        </SettingsCard>
        <HelperText
          text={
            settings().networkProxy.trim()
              ? `Using proxy from General Settings: ${settings().networkProxy}`
              : "Direct connection. Configure an HTTP/SOCKS proxy in Settings → General if needed."
          }
        />

        {/* Previously Downloaded from this Source */}
        {sourceVideos().length > 0 ? (
          <View>
            <SectionTitle
              title={`Downloaded from ${isYouTube ? "YouTube" : "X"} (${sourceVideos().length})`}
            />
            <SettingsCard>
              {sourceVideos().map((item, idx) => (
                <View>
                  {idx > 0 ? <CardDivider /> : null}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingLeft: 16,
                      paddingRight: 16,
                      paddingTop: 12,
                      paddingBottom: 12,
                      gap: 14,
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        class="truncate"
                        style={{
                          color: palette.textPrimary,
                          fontSize: 13.5,
                          fontWeight: "500",
                        }}
                      >
                        {item.title}
                      </Text>
                      <Text style={{ color: palette.textMuted, fontSize: 11.5 }}>
                        {[
                          item.durationSecs > 0
                            ? formatDuration(item.durationSecs)
                            : null,
                          item.width > 0 ? `${item.width}×${item.height}` : null,
                          formatBytes(item.fileSizeBytes),
                          item.subtitleFile ? "CC" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    <SubraButton
                      label="Play"
                      onPress={() => openVideo(item.id)}
                    />
                  </View>
                </View>
              ))}
            </SettingsCard>
          </View>
        ) : null}
      </View>
    </Scroll>
  );
}
