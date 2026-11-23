import { Scroll, Text, View } from "nsh";
import { Button } from "nsh/base";
import {
  CardDivider,
  DotMeter,
  HelperText,
  SectionTitle,
  SettingsCard,
  SubraButton,
} from "../components/SettingsRow";
import {
  deleteWhisperModel,
  downloadingModelId,
  downloadWhisperModel,
  settings,
  showToast,
  updateSettings,
} from "../store";
import { palette } from "../theme";
import { WHISPER_MODELS } from "../types";

export function SpeechSettings() {
  const isDownloaded = (id: string) =>
    settings().downloadedWhisperModels.includes(id);

  const selectModel = (id: string) => {
    if (!isDownloaded(id)) {
      showToast("Download this model first to activate it");
      return;
    }
    updateSettings({ selectedWhisperModel: id });
  };

  const downloadModel = (id: string, name: string) => {
    void downloadWhisperModel(id, name);
  };

  const removeModel = (id: string, name: string) => {
    deleteWhisperModel(id, name);
  };

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
        <SectionTitle title="Whisper" marginTop={0} />
        <SettingsCard>
          {WHISPER_MODELS.map((model, idx) => {
            const downloaded = isDownloaded(model.id);
            const selected = settings().selectedWhisperModel === model.id;

            return (
              <View>
                {idx > 0 ? <CardDivider /> : null}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingTop: 14,
                    paddingBottom: 14,
                    gap: 16,
                  }}
                >
                  {/* Radio + Info */}
                  <Button
                    testID={`whisper-radio-${model.id}`}
                    onPress={() => selectModel(model.id)}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    {/* Radio Circle */}
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: selected ? 0 : 1.5,
                        borderColor: "#6B6F68",
                        backgroundColor: selected
                          ? palette.amber
                          : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {selected ? (
                        <Text
                          style={{
                            color: "#1B160C",
                            fontSize: 11,
                            fontWeight: "700",
                          }}
                        >
                          ✓
                        </Text>
                      ) : null}
                    </View>

                    {/* Model details */}
                    <View style={{ flex: 1, gap: 3 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Text
                          style={{
                            color: palette.textPrimary,
                            fontSize: 13.5,
                            fontWeight: selected ? "600" : "500",
                          }}
                        >
                          {model.name}
                        </Text>
                        {model.recommended ? (
                          <View
                            style={{
                              backgroundColor: palette.amberSoftBg,
                              borderRadius: 5,
                              paddingLeft: 7,
                              paddingRight: 7,
                              paddingTop: 2,
                              paddingBottom: 2,
                            }}
                          >
                            <Text
                              style={{
                                color: palette.amber,
                                fontSize: 10.5,
                                fontWeight: "600",
                              }}
                            >
                              Recommended
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <Text
                        style={{
                          color: palette.textSecondary,
                          fontSize: 12,
                          lineHeight: 17,
                        }}
                      >
                        {model.description}
                      </Text>

                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 14,
                          marginTop: 2,
                        }}
                      >
                        <DotMeter label="Speed" filled={model.speed} />
                        <DotMeter label="Accuracy" filled={model.accuracy} />
                        <Text
                          style={{ color: palette.textMuted, fontSize: 11 }}
                        >
                          {model.sizeLabel}
                        </Text>
                      </View>
                    </View>
                  </Button>

                  {/* Right Action */}
                  {downloaded ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <Text
                        style={{
                          color: palette.textSecondary,
                          fontSize: 12,
                        }}
                      >
                        Downloaded
                      </Text>
                      <Button
                        testID={`whisper-remove-${model.id}`}
                        onPress={() => removeModel(model.id, model.name)}
                        style={{ padding: 4 }}
                      >
                        <Text
                          style={{ color: palette.textSecondary, fontSize: 15 }}
                        >
                          •••
                        </Text>
                      </Button>
                    </View>
                  ) : (
                    <SubraButton
                      testID={`whisper-download-${model.id}`}
                      label={
                        downloadingModelId() === model.id
                          ? "Downloading..."
                          : "Download"
                      }
                      disabled={downloadingModelId() !== null}
                      onPress={() => downloadModel(model.id, model.name)}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </SettingsCard>
        <HelperText text="Detects the language and supports Smart Line Breaks. Bigger is more accurate, but slower and larger; if unsure, use the recommended one." />
      </View>
    </Scroll>
  );
}
