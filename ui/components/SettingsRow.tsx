import { Text, View } from "nsh";
import { Button, Select, type SelectItem, Switch } from "nsh/base";
import type { JSX } from "nsh/jsx-runtime";
import { palette } from "../theme";

export function SectionTitle(props: { title: string; marginTop?: number }) {
  return (
    <Text
      style={{
        color: palette.textPrimary,
        fontSize: 13,
        fontWeight: "600",
        marginTop: props.marginTop ?? 24,
        marginBottom: 8,
      }}
    >
      {props.title}
    </Text>
  );
}

export function SettingsCard(props: { children?: JSX.Element; style?: object }) {
  return (
    <View
      style={{
        backgroundColor: palette.cardBg,
        borderColor: palette.cardBorder,
        borderWidth: 1,
        borderRadius: 11,
        overflow: "hidden",
        ...(props.style ?? {}),
      }}
    >
      {props.children}
    </View>
  );
}

export function CardDivider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: palette.divider,
        marginLeft: 16,
        marginRight: 16,
      }}
    />
  );
}

export function HelperText(props: { text: string }) {
  return (
    <Text
      style={{
        color: palette.textMuted,
        fontSize: 11.5,
        lineHeight: 16,
        marginTop: 7,
      }}
    >
      {props.text}
    </Text>
  );
}

export function SettingsRow(props: {
  label: string;
  description?: string;
  right?: JSX.Element;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 12,
        paddingBottom: 12,
        gap: 16,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            color: palette.textPrimary,
            fontSize: 13.5,
            fontWeight: "500",
          }}
        >
          {props.label}
        </Text>
        {props.description ? (
          <Text
            style={{
              color: palette.textMuted,
              fontSize: 11.5,
              lineHeight: 16,
            }}
          >
            {props.description}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {props.right}
      </View>
    </View>
  );
}

export function SubraSwitch(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  accessibilityLabel?: string;
}) {
  return (
    <Switch
      checked={props.checked}
      accessibilityLabel={props.accessibilityLabel}
      onChange={({ checked }) => props.onChange(checked)}
      trackStyle={{
        width: 38,
        height: 22,
        borderRadius: 11,
        padding: 2,
        justifyContent: "center",
        backgroundColor: props.checked ? palette.switchOn : palette.switchOff,
      }}
      thumbStyle={{
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: palette.switchThumb,
        transform: [{ translateX: props.checked ? 16 : 0 }],
      }}
    />
  );
}

export function SubraButton(props: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Button
      testID={props.testID}
      disabled={props.disabled}
      onPress={props.onPress}
      style={{
        backgroundColor: props.disabled
          ? palette.buttonDisabledBg
          : palette.buttonBg,
        borderRadius: 7,
        paddingLeft: 12,
        paddingRight: 12,
        paddingTop: 6,
        paddingBottom: 6,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: props.disabled ? palette.textMuted : palette.textPrimary,
          fontSize: 12.5,
          fontWeight: "500",
        }}
      >
        {props.label}
      </Text>
    </Button>
  );
}

export function SubraSelect(props: {
  value: string;
  items: SelectItem[];
  onChange: (value: string) => void;
  accessibilityLabel?: string;
  minWidth?: number;
}) {
  const currentTitle = () =>
    props.items.find((i) => i.value === props.value)?.title ?? props.value;

  return (
    <Select
      value={props.value}
      items={props.items}
      accessibilityLabel={props.accessibilityLabel}
      onChange={({ value }) => {
        if (value !== null) props.onChange(value);
      }}
      popupStyle={{
        backgroundColor: "#2B2E2A",
        borderColor: "#3D413C",
        borderWidth: 1,
        borderRadius: 9,
        padding: 4,
        minWidth: props.minWidth ?? 160,
      }}
      itemStyle={{
        paddingLeft: 10,
        paddingRight: 10,
        paddingTop: 6,
        paddingBottom: 6,
        borderRadius: 6,
        color: palette.textPrimary,
        fontSize: 12.5,
      }}
      trigger={
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingLeft: 8,
            paddingRight: 6,
            paddingTop: 4,
            paddingBottom: 4,
            borderRadius: 6,
          }}
        >
          <Text style={{ color: palette.textPrimary, fontSize: 13 }}>
            {currentTitle()}
          </Text>
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              backgroundColor: palette.buttonBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: palette.textSecondary, fontSize: 10 }}>↕</Text>
          </View>
        </View>
      }
    />
  );
}

export function DotMeter(props: { label: string; filled: number; total?: number }) {
  const total = props.total ?? 5;
  const dots = Array.from({ length: total }, (_, idx) => idx < props.filled);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Text style={{ color: palette.textMuted, fontSize: 11 }}>{props.label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        {dots.map((on) => (
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 2.5,
              backgroundColor: on ? "#9FA39C" : "#444742",
            }}
          />
        ))}
      </View>
    </View>
  );
}
