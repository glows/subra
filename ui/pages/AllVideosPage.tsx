import { Image, Scroll, signal, Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { SettingsCard, SubraButton } from "../components/SettingsRow";
import {
  formatBytes,
  formatDuration,
  importLocalVideos,
  importingVideos,
  openVideo,
  refreshLibrary,
  revealLibraryFolder,
  settings,
  videos,
} from "../store";
import { palette } from "../theme";
import type { VideoItem } from "../types";

type SourceFilter = "all" | "local" | "youtube" | "x";

const FILTER_TABS: { id: SourceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "local", label: "Local" },
  { id: "youtube", label: "YouTube" },
  { id: "x", label: "X" },
];

function sourceLabel(source: string): string {
  if (source === "youtube") return "YouTube";
  if (source === "x") return "X";
  return "Local";
}

function VideoCard(props: { item: VideoItem }) {
  const item = props.item;
  const progressRatio =
    item.durationSecs > 0
      ? Math.min(1, Math.max(0, item.lastPositionSecs / item.durationSecs))
      : 0;

  return (
    <View
      testID={`video-card-${item.id}`}
      onPress={() => openVideo(item.id)}
      style={{
        width: 268,
        backgroundColor: palette.cardBg,
        borderColor: palette.cardBorder,
        borderWidth: 1,
        borderRadius: 11,
        overflow: "hidden",
        cursor: "pointer",
      }}
    >
      {/* 16:9 Thumbnail */}
      <View
        style={{
          width: "100%",
          height: 150,
          backgroundColor: "#141513",
          position: "relative",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {item.coverUrl ? (
          <Image
            src={item.coverUrl}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "#262825",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: palette.amber, fontSize: 18 }}>▶</Text>
          </View>
        )}

        {/* Source pill */}
        <View
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            backgroundColor: "rgba(18, 19, 17, 0.82)",
            borderRadius: 5,
            paddingLeft: 7,
            paddingRight: 7,
            paddingTop: 2,
            paddingBottom: 2,
          }}
        >
          <Text style={{ color: palette.textSecondary, fontSize: 10.5, fontWeight: "600" }}>
            {sourceLabel(item.source)}
          </Text>
        </View>

        {/* Subtitle indicator */}
        {item.subtitleFile ? (
          <View
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              backgroundColor: palette.amberSoftBg,
              borderRadius: 5,
              paddingLeft: 6,
              paddingRight: 6,
              paddingTop: 2,
              paddingBottom: 2,
            }}
          >
            <Text style={{ color: palette.amber, fontSize: 10, fontWeight: "700" }}>
              CC
            </Text>
          </View>
        ) : null}

        {/* Duration badge */}
        {item.durationSecs > 0 ? (
          <View
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              backgroundColor: "rgba(15, 16, 14, 0.85)",
              borderRadius: 5,
              paddingLeft: 6,
              paddingRight: 6,
              paddingTop: 2,
              paddingBottom: 2,
            }}
          >
            <Text style={{ color: palette.textPrimary, fontSize: 11, fontWeight: "600" }}>
              {formatDuration(item.durationSecs)}
            </Text>
          </View>
        ) : null}

        {/* Watch progress bar */}
        {progressRatio > 0.02 ? (
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 3,
              backgroundColor: "rgba(255, 255, 255, 0.14)",
            }}
          >
            <View
              style={{
                width: `${Math.round(progressRatio * 100)}%`,
                height: 3,
                backgroundColor: palette.amber,
              }}
            />
          </View>
        ) : null}
      </View>

      {/* Card Body */}
      <View style={{ padding: 12, gap: 5 }}>
        <Text
          class="line-clamp-2"
          style={{
            color: palette.textPrimary,
            fontSize: 13.5,
            fontWeight: "600",
            lineHeight: 18,
          }}
        >
          {item.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {item.width > 0 && item.height > 0 ? (
            <Text style={{ color: palette.textMuted, fontSize: 11.5 }}>
              {`${item.width}×${item.height}`}
            </Text>
          ) : null}
          <Text style={{ color: palette.textMuted, fontSize: 11.5 }}>
            {formatBytes(item.fileSizeBytes)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function AllVideosPage() {
  const query = signal("");
  const sourceFilter = signal<SourceFilter>("all");

  const filteredVideos = () => {
    const q = query().trim().toLowerCase();
    const src = sourceFilter();
    return videos().filter((v) => {
      if (src !== "all" && v.source !== src) return false;
      if (q && !v.title.toLowerCase().includes(q)) return false;
      return true;
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.mainBg }}>
      {/* Top Toolbar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 28,
          paddingRight: 28,
          paddingTop: 20,
          paddingBottom: 14,
          borderBottomColor: palette.sidebarBorder,
          borderBottomWidth: 1,
          gap: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Text
            style={{
              color: palette.textPrimary,
              fontSize: 18,
              fontWeight: "600",
            }}
          >
            All Videos
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "#161715",
              borderRadius: 8,
              padding: 3,
            }}
          >
            {FILTER_TABS.map((tab) => {
              const active = sourceFilter() === tab.id;
              return (
                <Button
                  onPress={() => sourceFilter.set(tab.id)}
                  style={{
                    paddingLeft: 10,
                    paddingRight: 10,
                    paddingTop: 4,
                    paddingBottom: 4,
                    borderRadius: 6,
                    backgroundColor: active ? palette.buttonBg : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color: active ? palette.textPrimary : palette.textMuted,
                      fontSize: 12,
                      fontWeight: active ? "600" : "400",
                    }}
                  >
                    {tab.label}
                  </Text>
                </Button>
              );
            })}
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Input
            testID="library-search-input"
            value={query()}
            placeholder="Search videos..."
            onChange={({ value }) => query.set(value)}
            style={{
              width: 210,
              color: palette.textPrimary,
              fontSize: 12.5,
              backgroundColor: palette.inputBg,
              borderColor: palette.cardBorder,
              borderWidth: 1,
              borderRadius: 7,
              paddingLeft: 10,
              paddingRight: 10,
              paddingTop: 5,
              paddingBottom: 5,
            }}
          />
          <SubraButton
            testID="refresh-library-btn"
            label="Refresh"
            onPress={() => refreshLibrary()}
          />
          <Button
            testID="toolbar-import-btn"
            disabled={importingVideos()}
            onPress={() => {
              void importLocalVideos();
            }}
            style={{
              backgroundColor: palette.amber,
              borderRadius: 7,
              paddingLeft: 13,
              paddingRight: 13,
              paddingTop: 6,
              paddingBottom: 6,
            }}
          >
            <Text style={{ color: "#1B160C", fontSize: 12.5, fontWeight: "700" }}>
              {importingVideos() ? "Importing..." : "+ Import"}
            </Text>
          </Button>
        </View>
      </View>

      {/* Main Content */}
      <Scroll
        style={{ flex: 1 }}
        contentStyle={{
          padding: 28,
          paddingBottom: 48,
        }}
      >
        {filteredVideos().length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <SettingsCard
              style={{
                width: 480,
                padding: 28,
                alignItems: "center",
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: palette.amberSoftBg,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 4,
                }}
              >
                <Text style={{ color: palette.amber, fontSize: 22 }}>▤</Text>
              </View>
              <Text
                style={{
                  color: palette.textPrimary,
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                {videos().length === 0
                  ? "Your Subra Library is empty"
                  : "No matching videos"}
              </Text>
              <Text
                style={{
                  color: palette.textSecondary,
                  fontSize: 12.5,
                  lineHeight: 18,
                  textAlign: "center",
                }}
              >
                {videos().length === 0
                  ? `Videos imported into ${settings().libraryPath} are stored as plain folders with item.json, cover.jpg, and subtitles.`
                  : "Try clearing your search query or switching the source filter."}
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
                  testID="empty-import-btn"
                  disabled={importingVideos()}
                  onPress={() => {
                    void importLocalVideos();
                  }}
                  style={{
                    backgroundColor: palette.amber,
                    borderRadius: 7,
                    paddingLeft: 14,
                    paddingRight: 14,
                    paddingTop: 7,
                    paddingBottom: 7,
                  }}
                >
                  <Text
                    style={{ color: "#1B160C", fontSize: 12.5, fontWeight: "700" }}
                  >
                    {importingVideos() ? "Importing..." : "Import Local Videos"}
                  </Text>
                </Button>
                <SubraButton
                  label="Open Library Folder"
                  onPress={() => {
                    void revealLibraryFolder();
                  }}
                />
              </View>
            </SettingsCard>
          </View>
        ) : (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 18,
            }}
          >
            {filteredVideos().map((item) => (
              <VideoCard item={item} />
            ))}
          </View>
        )}
      </Scroll>
    </View>
  );
}
