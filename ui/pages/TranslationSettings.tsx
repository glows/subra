import { Scroll, Text, View } from "nsh";
import { Input } from "nsh/base";
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
  clearTranslationCache,
  formatBytes,
  settings,
  showToast,
  updateSettings,
} from "../store";
import { palette } from "../theme";
import { DEFAULT_TRANSLATION_PROMPT } from "../types";

const TARGET_LANGUAGES = [
  { value: "zh-CN", title: "简体中文" },
  { value: "zh-TW", title: "繁體中文" },
  { value: "en", title: "English" },
  { value: "ja", title: "日本語" },
  { value: "ko", title: "한국어" },
  { value: "es", title: "Español" },
  { value: "fr", title: "Français" },
];

export function TranslationSettings() {
  const isDefaultPrompt = () =>
    settings().translationPrompt.trim() === DEFAULT_TRANSLATION_PROMPT.trim();

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
        {/* Target Language & Smart Translation */}
        <SettingsCard>
          <SettingsRow
            label="Default Target Language"
            right={
              <SubraSelect
                value={settings().targetLanguage}
                items={TARGET_LANGUAGES}
                accessibilityLabel="Default Target Language"
                onChange={(value) => updateSettings({ targetLanguage: value })}
              />
            }
          />
          <CardDivider />
          <SettingsRow
            label="Smart Translation"
            description="Uses context from the whole video when translating"
            right={
              <SubraSwitch
                checked={settings().smartTranslation}
                accessibilityLabel="Smart Translation"
                onChange={(checked) =>
                  updateSettings({ smartTranslation: checked })
                }
              />
            }
          />
        </SettingsCard>

        {/* Prompt */}
        <SectionTitle title="Prompt" />
        <SettingsCard>
          <View style={{ padding: 14 }}>
            <Input
              testID="translation-prompt-input"
              multiline
              value={settings().translationPrompt}
              onChange={({ value }) =>
                updateSettings({ translationPrompt: value })
              }
              style={{
                minHeight: 150,
                color: palette.textPrimary,
                fontFamily: "monospace",
                fontSize: 13,
                lineHeight: 20,
                padding: 4,
              }}
            />
          </View>
          <CardDivider />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingLeft: 16,
              paddingRight: 16,
              paddingTop: 10,
              paddingBottom: 10,
            }}
          >
            <Text style={{ color: palette.textMuted, fontSize: 12.5 }}>
              {isDefaultPrompt() ? "Using default prompt" : "Custom prompt"}
            </Text>
            <SubraButton
              testID="restore-prompt-btn"
              label="Restore Defaults"
              disabled={isDefaultPrompt()}
              onPress={() => {
                updateSettings({
                  translationPrompt: DEFAULT_TRANSLATION_PROMPT,
                });
                showToast("Restored default translation prompt");
              }}
            />
          </View>
        </SettingsCard>
        <HelperText text="Use {{language}} for the target language. You can add style requirements, such as conversational tone, keeping person names in English, or proper-noun glossaries. Subra adds the response format automatically, so don't include it here." />

        {/* Cache */}
        <SectionTitle title="Cache" />
        <SettingsCard>
          <SettingsRow
            label="Cached"
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Text style={{ color: palette.textSecondary, fontSize: 12.5 }}>
                  {`${settings().cachedSentences.toLocaleString()} sentences · ${formatBytes(settings().cachedBytes)}`}
                </Text>
                <SubraButton
                  testID="clear-cache-btn"
                  label="Clear"
                  disabled={settings().cachedSentences === 0}
                  onPress={() => clearTranslationCache()}
                />
              </View>
            }
          />
        </SettingsCard>
        <HelperText text="Identical sentences, models, languages, and prompts aren't requested again." />
      </View>
    </Scroll>
  );
}
