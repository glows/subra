import { mount, Text, View } from "nsh";
import { PlaceholderPage } from "./ui/components/PlaceholderPage";
import { Sidebar } from "./ui/components/Sidebar";
import { AiProvidersSettings } from "./ui/pages/AiProvidersSettings";
import { AllVideosPage } from "./ui/pages/AllVideosPage";
import { GeneralSettings } from "./ui/pages/GeneralSettings";
import { LocalImportPage } from "./ui/pages/LocalImportPage";
import { SourceDownloadPage } from "./ui/pages/SourceDownloadPage";
import { SpeechSettings } from "./ui/pages/SpeechSettings";
import { TranslationSettings } from "./ui/pages/TranslationSettings";
import { VideoPlayerPage } from "./ui/pages/VideoPlayerPage";
import {
  activeRoute,
  activeVideoId,
  closeVideo,
  dismissedSetupBanner,
  installAllMissingComponents,
  installingComponentId,
  missingComponents,
  statusToast,
  videos,
} from "./ui/store";
import { palette } from "./ui/theme";

function MissingComponentsBanner() {
  return (
    <View>
      {missingComponents().length > 0 && !dismissedSetupBanner() ? (
        <View
          testID="missing-components-banner"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#332615",
            borderBottomColor: "#523B1D",
            borderBottomWidth: 1,
            paddingLeft: 18,
            paddingRight: 18,
            paddingTop: 9,
            paddingBottom: 9,
            gap: 12,
          }}
        >
          <Text style={{ flex: 1, color: "#F6D5A1", fontSize: 12.5 }}>
            {`Missing required components: ${missingComponents()
              .map((c) => c.name)
              .join(", ")}`}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              onPress={() => {
                if (!installingComponentId()) {
                  void installAllMissingComponents();
                }
              }}
              style={{
                backgroundColor: palette.amber,
                borderRadius: 6,
                paddingLeft: 10,
                paddingRight: 10,
                paddingTop: 4,
                paddingBottom: 4,
                cursor: "pointer",
              }}
            >
              <Text style={{ color: "#1B160C", fontSize: 12, fontWeight: "700" }}>
                {installingComponentId() ? "Installing..." : "Install All"}
              </Text>
            </View>
            <View
              onPress={() => {
                closeVideo();
                activeRoute.set("settings-general");
              }}
              style={{
                backgroundColor: palette.buttonBg,
                borderRadius: 6,
                paddingLeft: 10,
                paddingRight: 10,
                paddingTop: 4,
                paddingBottom: 4,
                cursor: "pointer",
              }}
            >
              <Text style={{ color: palette.textPrimary, fontSize: 12 }}>
                Settings
              </Text>
            </View>
            <View
              onPress={() => dismissedSetupBanner.set(true)}
              style={{ padding: 4, cursor: "pointer" }}
            >
              <Text style={{ color: "#C9A56C", fontSize: 12 }}>✕</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ActivePlayerSlot() {
  const openId = activeVideoId();
  const found = openId ? videos().find((v) => v.id === openId) : null;
  return found ? <VideoPlayerPage video={found} /> : null;
}

function ToastOverlay() {
  return (
    <View
      style={{
        position: "absolute",
        right: 20,
        bottom: 20,
        pointerEvents: "none",
      }}
    >
      {statusToast() ? (
        <View
          style={{
            backgroundColor: "#2C2F2B",
            borderColor: "#40443E",
            borderWidth: 1,
            borderRadius: 9,
            paddingLeft: 14,
            paddingRight: 14,
            paddingTop: 9,
            paddingBottom: 9,
          }}
        >
          <Text style={{ color: palette.textPrimary, fontSize: 12.5 }}>
            {statusToast()}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function App() {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        backgroundColor: palette.mainBg,
      }}
    >
      <Sidebar />
      <View style={{ flex: 1, position: "relative" }}>
        <MissingComponentsBanner />
        <View style={{ flex: 1 }}>
          {activeVideoId() ? (
            <ActivePlayerSlot />
          ) : activeRoute() === "all-videos" ? (
            <AllVideosPage />
          ) : activeRoute() === "local-import" ? (
            <LocalImportPage />
          ) : activeRoute() === "settings-general" ? (
            <GeneralSettings />
          ) : activeRoute() === "settings-speech" ? (
            <SpeechSettings />
          ) : activeRoute() === "settings-ai" ? (
            <AiProvidersSettings />
          ) : activeRoute() === "settings-translation" ? (
            <TranslationSettings />
          ) : activeRoute() === "browse" ? (
            <PlaceholderPage
              title="Browse"
              subtitle="Explore and filter transcribed videos, subtitle segments, and saved bookmarks across your library."
              nextMilestone="Milestone C · Full-Text Subtitle Search"
            />
          ) : activeRoute() === "youtube" ? (
            <SourceDownloadPage source="youtube" />
          ) : (
            <SourceDownloadPage source="x" />
          )}
        </View>
        <ToastOverlay />
      </View>
    </View>
  );
}

mount(App);
