import { Scroll, signal, Text, View } from "nsh";
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
import { settings, showToast, updateProvider, updateSettings } from "../store";
import { palette } from "../theme";
import type { AiProviderConfig, ProviderGroup } from "../types";

const PROVIDER_GROUPS: ProviderGroup[] = ["Cloud", "This Mac", "Other"];

const REASONING_ITEMS = [
  { value: "Off", title: "Off" },
  { value: "Low", title: "Low" },
  { value: "Medium", title: "Medium" },
  { value: "High", title: "High" },
];

export function AiProvidersSettings() {
  const showApiKey = signal(false);
  const testing = signal(false);

  const selectedProvider = (): AiProviderConfig => {
    const list = settings().providers;
    return (
      list.find((p) => p.id === settings().selectedProviderId) ?? list[0]
    );
  };

  const testConnection = async () => {
    const p = selectedProvider();
    if (!p.baseUrl.trim()) {
      showToast("Please enter a Base URL first");
      return;
    }
    testing.set(true);
    const start = Date.now();
    try {
      const headers: Record<string, string> = {};
      if (p.apiKey.trim()) {
        headers["Authorization"] = `Bearer ${p.apiKey.trim()}`;
      }
      for (const h of p.customHeaders) {
        if (h.key.trim()) headers[h.key.trim()] = h.value;
      }
      const url = `${p.baseUrl.replace(/\/+$/, "")}/models`;
      const res = await fetch(url, { method: "GET", headers });
      const elapsed = Date.now() - start;
      if (res.ok) {
        showToast(`Connected to ${p.name} (${elapsed} ms)`);
      } else {
        showToast(`${p.name} responded HTTP ${res.status} (${elapsed} ms)`);
      }
    } catch (err) {
      showToast(`Connection failed: ${String(err)}`);
    } finally {
      testing.set(false);
    }
  };

  const addHeader = () => {
    const p = selectedProvider();
    updateProvider(p.id, {
      customHeaders: [...p.customHeaders, { key: "", value: "" }],
    });
  };

  const updateHeader = (idx: number, field: "key" | "value", value: string) => {
    const p = selectedProvider();
    const next = p.customHeaders.map((h, i) =>
      i === idx ? { ...h, [field]: value } : h,
    );
    updateProvider(p.id, { customHeaders: next });
  };

  const removeHeader = (idx: number) => {
    const p = selectedProvider();
    updateProvider(p.id, {
      customHeaders: p.customHeaders.filter((_, i) => i !== idx),
    });
  };

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: palette.mainBg }}>
      {/* Middle Column: Provider List */}
      <Scroll
        style={{
          width: 220,
          backgroundColor: palette.providerListBg,
          borderRightColor: palette.sidebarBorder,
          borderRightWidth: 1,
        }}
        contentStyle={{
          paddingTop: 18,
          paddingBottom: 24,
          paddingLeft: 10,
          paddingRight: 10,
        }}
      >
        {PROVIDER_GROUPS.map((group, gIdx) => {
          const items = settings().providers.filter((p) => p.group === group);
          return (
            <View style={{ marginTop: gIdx === 0 ? 0 : 16 }}>
              <Text
                style={{
                  color: palette.textSection,
                  fontSize: 11,
                  fontWeight: "600",
                  paddingLeft: 8,
                  marginBottom: 6,
                }}
              >
                {group}
              </Text>
              <View style={{ gap: 2 }}>
                {items.map((provider) => {
                  const isSelected =
                    settings().selectedProviderId === provider.id;
                  return (
                    <Button
                      testID={`provider-${provider.id}`}
                      onPress={() => {
                        showApiKey.set(false);
                        updateSettings({ selectedProviderId: provider.id });
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingLeft: 8,
                        paddingRight: 10,
                        paddingTop: 6,
                        paddingBottom: 6,
                        borderRadius: 8,
                        backgroundColor: isSelected
                          ? "#262825"
                          : "transparent",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 9,
                        }}
                      >
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            backgroundColor: provider.badgeColor,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              color: "#FFFFFF",
                              fontSize: 9.5,
                              fontWeight: "700",
                            }}
                          >
                            {provider.badgeText}
                          </Text>
                        </View>
                        <Text
                          style={{
                            color: isSelected
                              ? palette.textPrimary
                              : "#D4D7D2",
                            fontSize: 12.5,
                            fontWeight: isSelected ? "600" : "400",
                          }}
                        >
                          {provider.name}
                        </Text>
                      </View>
                      {provider.enabled ? (
                        <View
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 3.5,
                            backgroundColor: palette.greenDot,
                          }}
                        />
                      ) : null}
                    </Button>
                  );
                })}
              </View>
            </View>
          );
        })}
      </Scroll>

      {/* Right Column: Provider Detail */}
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
        <View style={{ width: "100%", maxWidth: 620 }}>
          {/* Provider Header Card */}
          <SettingsCard>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 16,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: selectedProvider().badgeColor,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {selectedProvider().badgeText}
                  </Text>
                </View>
                <View style={{ gap: 2 }}>
                  <Text
                    style={{
                      color: palette.textPrimary,
                      fontSize: 14.5,
                      fontWeight: "600",
                    }}
                  >
                    {selectedProvider().name}
                  </Text>
                  <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                    {selectedProvider().subtitle}
                  </Text>
                </View>
              </View>

              <SubraSwitch
                checked={selectedProvider().enabled}
                accessibilityLabel={`Enable ${selectedProvider().name}`}
                onChange={(checked) =>
                  updateProvider(selectedProvider().id, { enabled: checked })
                }
              />
            </View>
          </SettingsCard>

          {/* Connection */}
          <SectionTitle title="Connection" />
          <SettingsCard>
            {/* Base URL */}
            <SettingsRow
              label="Base URL"
              description="Any service compatible with OpenAI Chat Completions works, such as One API, New API, vLLM, or an internal company gateway."
              right={
                <Input
                  testID="provider-base-url"
                  value={selectedProvider().baseUrl}
                  placeholder="https://api.openai.com/v1"
                  onChange={({ value }) =>
                    updateProvider(selectedProvider().id, { baseUrl: value })
                  }
                  style={{
                    width: 220,
                    color: palette.textPrimary,
                    fontSize: 12.5,
                    textAlign: "right",
                    paddingTop: 4,
                    paddingBottom: 4,
                  }}
                />
              }
            />
            <CardDivider />

            {/* API Key */}
            <SettingsRow
              label="API Key"
              right={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Input
                    testID="provider-api-key"
                    value={selectedProvider().apiKey}
                    masked={!showApiKey()}
                    placeholder="sk-..."
                    onChange={({ value }) =>
                      updateProvider(selectedProvider().id, { apiKey: value })
                    }
                    style={{
                      width: 190,
                      color: palette.textPrimary,
                      fontSize: 12.5,
                      textAlign: "right",
                      paddingTop: 4,
                      paddingBottom: 4,
                    }}
                  />
                  <Button
                    testID="toggle-api-key-btn"
                    onPress={() => showApiKey.set(!showApiKey())}
                    style={{ padding: 4 }}
                  >
                    <Text style={{ color: palette.textSecondary, fontSize: 13 }}>
                      {showApiKey() ? "🙈" : "👁"}
                    </Text>
                  </Button>
                </View>
              }
            />
            <CardDivider />

            {/* Model */}
            <SettingsRow
              label="Model"
              right={
                <SubraSelect
                  value={selectedProvider().model}
                  items={selectedProvider().availableModels.map((m) => ({
                    value: m,
                    title: m,
                  }))}
                  accessibilityLabel="Model"
                  minWidth={220}
                  onChange={(value) =>
                    updateProvider(selectedProvider().id, { model: value })
                  }
                />
              }
            />
            <CardDivider />

            {/* Reasoning Effort */}
            <SettingsRow
              label="Reasoning Effort"
              description='Translation usually doesn’t need deep reasoning. Choose "Off" or "Low" for speed and lower cost.'
              right={
                <SubraSelect
                  value={selectedProvider().reasoningEffort}
                  items={REASONING_ITEMS}
                  accessibilityLabel="Reasoning Effort"
                  minWidth={110}
                  onChange={(value) =>
                    updateProvider(selectedProvider().id, {
                      reasoningEffort: value as AiProviderConfig["reasoningEffort"],
                    })
                  }
                />
              }
            />
            <CardDivider />

            {/* Max Concurrency */}
            <SettingsRow
              label="Max Concurrency"
              description='If you see "too many requests" or 429 errors, lower the max concurrency.'
              right={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text
                    style={{
                      color: palette.textPrimary,
                      fontSize: 13,
                      minWidth: 20,
                      textAlign: "right",
                    }}
                  >
                    {String(selectedProvider().maxConcurrency)}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    <Button
                      testID="concurrency-dec"
                      onPress={() =>
                        updateProvider(selectedProvider().id, {
                          maxConcurrency: Math.max(
                            1,
                            selectedProvider().maxConcurrency - 1,
                          ),
                        })
                      }
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        backgroundColor: palette.buttonBg,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: palette.textPrimary, fontSize: 13 }}>
                        −
                      </Text>
                    </Button>
                    <Button
                      testID="concurrency-inc"
                      onPress={() =>
                        updateProvider(selectedProvider().id, {
                          maxConcurrency: Math.min(
                            32,
                            selectedProvider().maxConcurrency + 1,
                          ),
                        })
                      }
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        backgroundColor: palette.buttonBg,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: palette.textPrimary, fontSize: 13 }}>
                        +
                      </Text>
                    </Button>
                  </View>
                </View>
              }
            />
            <CardDivider />

            {/* Connection Test */}
            <SettingsRow
              label="Connection"
              right={
                <SubraButton
                  testID="test-connection-btn"
                  label={testing() ? "Testing..." : "Test"}
                  disabled={testing()}
                  onPress={() => {
                    void testConnection();
                  }}
                />
              }
            />
          </SettingsCard>

          {/* Custom Headers */}
          <SectionTitle title="Custom Headers" />
          <SettingsCard>
            {selectedProvider().customHeaders.map((header, idx) => (
              <View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingLeft: 14,
                    paddingRight: 14,
                    paddingTop: 10,
                    paddingBottom: 10,
                  }}
                >
                  <Input
                    value={header.key}
                    placeholder="Header-Name"
                    onChange={({ value }) => updateHeader(idx, "key", value)}
                    style={{
                      flex: 1,
                      color: palette.textPrimary,
                      fontSize: 12.5,
                      backgroundColor: palette.inputBg,
                      borderColor: palette.cardBorder,
                      borderWidth: 1,
                      borderRadius: 6,
                      paddingLeft: 8,
                      paddingRight: 8,
                      paddingTop: 5,
                      paddingBottom: 5,
                    }}
                  />
                  <Input
                    value={header.value}
                    placeholder="Value"
                    onChange={({ value }) => updateHeader(idx, "value", value)}
                    style={{
                      flex: 1,
                      color: palette.textPrimary,
                      fontSize: 12.5,
                      backgroundColor: palette.inputBg,
                      borderColor: palette.cardBorder,
                      borderWidth: 1,
                      borderRadius: 6,
                      paddingLeft: 8,
                      paddingRight: 8,
                      paddingTop: 5,
                      paddingBottom: 5,
                    }}
                  />
                  <Button
                    onPress={() => removeHeader(idx)}
                    style={{ padding: 6 }}
                  >
                    <Text style={{ color: palette.textMuted, fontSize: 13 }}>
                      ✕
                    </Text>
                  </Button>
                </View>
                <CardDivider />
              </View>
            ))}

            <Button
              testID="add-header-btn"
              onPress={addHeader}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 12,
                paddingBottom: 12,
              }}
            >
              <Text style={{ color: palette.textSecondary, fontSize: 14 }}>
                +
              </Text>
              <Text style={{ color: palette.textSecondary, fontSize: 13 }}>
                Add Header
              </Text>
            </Button>
          </SettingsCard>
          <HelperText text="Sent with every request. A header with the same name overrides the default auth header. Stored securely in app settings." />
        </View>
      </Scroll>
    </View>
  );
}
