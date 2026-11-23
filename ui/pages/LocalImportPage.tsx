import { Scroll, Text, View } from "nsh";
import { Button } from "nsh/base";
import {
  CardDivider,
  HelperText,
  SectionTitle,
  SettingsCard,
  SubraButton,
} from "../components/SettingsRow";
import {
  formatBytes,
  formatDuration,
  importLocalVideos,
  importingVideos,
  openVideo,
  revealLibraryFolder,
  settings,
  videos,
} from "../store";
import { palette } from "../theme";

export function LocalImportPage() {
  const localVideos = () => videos().filter((v) => v.source === "local");

  return (
    <Scroll
      style={{ flex: 1, backgroundColor: palette.mainBg }}
      contentStyle={{
        alignItems: "center",
        paddingTop: 32,
        paddingBottom: 48,
        paddingLeft: 32,
        paddingRight: 32,
      }}
    >
      <View style={{ width: "100%", maxWidth: 680 }}>
        <Text
          style={{
            color: palette.textPrimary,
            fontSize: 18,
            fontWeight: "600",
            marginBottom: 14,
          }}
        >
          Local Import
        </Text>

        {/* Primary Import Dropzone Card */}
        <SettingsCard
          style={{
            padding: 32,
            alignItems: "center",
            gap: 10,
          }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              backgroundColor: palette.amberSoftBg,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 4,
            }}
          >
            <Text style={{ color: palette.amber, fontSize: 22 }}>⇩</Text>
          </View>
          <Text
            style={{
              color: palette.textPrimary,
              fontSize: 15.5,
              fontWeight: "600",
            }}
          >
            Import Videos into Subra Library
          </Text>
          <Text
            style={{
              color: palette.textSecondary,
              fontSize: 12.5,
              lineHeight: 18,
              textAlign: "center",
              maxWidth: 460,
            }}
          >
            Select MP4, MOV, MKV, WebM, or M4V files. Subra copies each video
            into its own library folder, extracts a cover thumbnail with FFmpeg,
            and automatically picks up matching .srt / .vtt subtitle files.
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginTop: 10,
            }}
          >
            <Button
              testID="local-import-pick-btn"
              disabled={importingVideos()}
              onPress={() => {
                void importLocalVideos();
              }}
              style={{
                backgroundColor: palette.amber,
                borderRadius: 8,
                paddingLeft: 18,
                paddingRight: 18,
                paddingTop: 8,
                paddingBottom: 8,
              }}
            >
              <Text
                style={{ color: "#1B160C", fontSize: 13, fontWeight: "700" }}
              >
                {importingVideos() ? "Importing..." : "Choose Video Files..."}
              </Text>
            </Button>
            <SubraButton
              label="Reveal Library"
              onPress={() => {
                void revealLibraryFolder();
              }}
            />
          </View>
        </SettingsCard>

        <HelperText text={`Target Library: ${settings().libraryPath}`} />

        {/* Recently Imported Local Videos */}
        {localVideos().length > 0 ? (
          <View>
            <SectionTitle title={`Imported Local Videos (${localVideos().length})`} />
            <SettingsCard>
              {localVideos().map((item, idx) => (
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
                          item.subtitleFile ? "Subtitles attached" : null,
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
