import { Scroll, Text, View } from "nsh";
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
  components,
  installComponent,
  installingComponentId,
  redetectComponents,
  revealLibraryFolder,
  settings,
  showToast,
  switchLibraryFolder,
  updateSettings,
} from "../store";
import { palette } from "../theme";

const LANGUAGE_ITEMS = [
  { value: "system", title: "Follow System" },
  { value: "en", title: "English" },
  { value: "zh-CN", title: "简体中文" },
  { value: "zh-TW", title: "繁體中文" },
  { value: "ja", title: "日本語" },
];

function ComponentBadge(props: { id: string; installed: boolean }) {
  const symbol = !props.installed
    ? "!"
    : props.id === "yt-dlp"
      ? "↓"
      : props.id === "ffmpeg"
        ? "▤"
        : props.id === "whisper-cli"
          ? "ılı"
          : "✦";
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        backgroundColor: props.installed
          ? palette.greenIconBg
          : palette.amberSoftBg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: props.installed ? palette.greenIconFg : palette.amber,
          fontSize: 13,
          fontWeight: "700",
        }}
      >
        {symbol}
      </Text>
    </View>
  );
}

export function GeneralSettings() {
  return (
    <Scroll
      style={{
        flex: 1,
        backgroundColor: palette.mainBg,
      }}
      contentStyle={{
        alignItems: "center",
        paddingTop: 28,
        paddingBottom: 48,
        paddingLeft: 32,
        paddingRight: 32,
      }}
    >
      <View style={{ width: "100%", maxWidth: 680 }}>
        {/* Library */}
        <SectionTitle title="Library" marginTop={0} />
        <SettingsCard>
          <SettingsRow
            label="Current Library"
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ color: palette.textSecondary, fontSize: 12.5 }}>
                  {settings().libraryPath}
                </Text>
                <Button
                  testID="reveal-library-btn"
                  onPress={() => {
                    void revealLibraryFolder();
                  }}
                  style={{ padding: 4, borderRadius: 5 }}
                >
                  <Text style={{ color: palette.textSecondary, fontSize: 14 }}>
                    📁
                  </Text>
                </Button>
                <Button
                  testID="switch-library-btn"
                  onPress={() => {
                    void switchLibraryFolder();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingLeft: 6,
                    paddingRight: 6,
                    paddingTop: 4,
                    paddingBottom: 4,
                    borderRadius: 6,
                  }}
                >
                  <Text
                    style={{
                      color: palette.textPrimary,
                      fontSize: 13,
                      fontWeight: "500",
                    }}
                  >
                    Switch
                  </Text>
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: palette.buttonBg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: palette.textSecondary, fontSize: 11 }}>
                      ⌄
                    </Text>
                  </View>
                </Button>
              </View>
            }
          />
        </SettingsCard>
        <HelperText text="Each video is a folder in the library. Videos, covers, subtitles, and item.json are plain files. Switching libraries stops tasks in progress." />

        {/* Language */}
        <SectionTitle title="Language" />
        <SettingsCard>
          <SettingsRow
            label="App Language"
            right={
              <SubraSelect
                value={settings().appLanguage}
                items={LANGUAGE_ITEMS}
                accessibilityLabel="App Language"
                onChange={(value) => updateSettings({ appLanguage: value })}
              />
            }
          />
        </SettingsCard>

        {/* Update */}
        <SectionTitle title="Update" />
        <SettingsCard>
          <SettingsRow
            label="Check for Updates Automatically"
            right={
              <SubraSwitch
                checked={settings().autoCheckUpdates}
                accessibilityLabel="Check for Updates Automatically"
                onChange={(checked) =>
                  updateSettings({ autoCheckUpdates: checked })
                }
              />
            }
          />
          <CardDivider />
          <SettingsRow
            label={`Current version ${settings().appVersion}`}
            right={
              <SubraButton
                testID="check-updates-btn"
                label="Check for Updates..."
                onPress={() =>
                  showToast(`Subra ${settings().appVersion} is up to date`)
                }
              />
            }
          />
        </SettingsCard>

        {/* Playback */}
        <SectionTitle title="Playback" />
        <SettingsCard>
          <SettingsRow
            label="Full Screen When Opening Videos"
            right={
              <SubraSwitch
                checked={settings().fullscreenOnOpen}
                accessibilityLabel="Full Screen When Opening Videos"
                onChange={(checked) =>
                  updateSettings({ fullscreenOnOpen: checked })
                }
              />
            }
          />
        </SettingsCard>

        {/* Components */}
        <SectionTitle title="Components" />
        <SettingsCard>
          {components().map((comp, idx) => (
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
                  gap: 12,
                }}
              >
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <ComponentBadge id={comp.id} installed={comp.installed} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        color: palette.textPrimary,
                        fontSize: 13.5,
                        fontWeight: "500",
                      }}
                    >
                      {comp.name}
                    </Text>
                    <Text style={{ color: palette.textMuted, fontSize: 11.5 }}>
                      {comp.installed
                        ? `${comp.version} · ${comp.source}`
                        : `Not installed · ${comp.description || "Required component"}`}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {!comp.installed ? (
                    <Button
                      testID={`install-component-${comp.id}`}
                      disabled={installingComponentId() !== null}
                      onPress={() => {
                        void installComponent(comp.id, comp.name);
                      }}
                      style={{
                        backgroundColor:
                          installingComponentId() !== null
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
                            installingComponentId() !== null
                              ? palette.textMuted
                              : "#1B160C",
                          fontSize: 12.5,
                          fontWeight: "700",
                        }}
                      >
                        {installingComponentId() === comp.id
                          ? "Installing..."
                          : "Install"}
                      </Text>
                    </Button>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Text style={{ color: palette.greenIconFg, fontSize: 12, fontWeight: "500" }}>
                        Ready
                      </Text>
                      {comp.id === "yt-dlp" ? (
                        <SubraButton
                          label={
                            installingComponentId() === comp.id
                              ? "Updating..."
                              : "Update"
                          }
                          disabled={installingComponentId() !== null}
                          onPress={() => {
                            void installComponent(comp.id, comp.name);
                          }}
                        />
                      ) : null}
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))}
        </SettingsCard>

        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginTop: 7,
            gap: 16,
          }}
        >
          <Text
            style={{
              flex: 1,
              color: palette.textMuted,
              fontSize: 11.5,
              lineHeight: 16,
            }}
          >
            Subra checks yt-dlp, FFmpeg, whisper-cli, and Whisper models on startup.
            Missing components can be installed automatically on macOS and Windows.
          </Text>
          <Button
            testID="detect-again-btn"
            onPress={() => redetectComponents()}
            style={{ paddingTop: 1, paddingBottom: 1 }}
          >
            <Text
              style={{
                color: palette.blueLink,
                fontSize: 12,
                fontWeight: "500",
              }}
            >
              Detect Again
            </Text>
          </Button>
        </View>

        {/* Network */}
        <SectionTitle title="Network" />
        <SettingsCard>
          <SettingsRow
            label="HTTP / SOCKS Proxy"
            description="Optional proxy URL used by yt-dlp and model downloads."
            right={
              <Input
                value={settings().networkProxy}
                placeholder="http://127.0.0.1:7890"
                onChange={({ value }) => updateSettings({ networkProxy: value })}
                style={{
                  width: 220,
                  color: palette.textPrimary,
                  fontSize: 12.5,
                  textAlign: "right",
                  backgroundColor: palette.inputBg,
                  borderColor: palette.cardBorder,
                  borderWidth: 1,
                  borderRadius: 6,
                  paddingLeft: 10,
                  paddingRight: 10,
                  paddingTop: 5,
                  paddingBottom: 5,
                }}
              />
            }
          />
        </SettingsCard>
      </View>
    </Scroll>
  );
}
