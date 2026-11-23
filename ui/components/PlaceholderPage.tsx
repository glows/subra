import { Text, View } from "nsh";
import { activeRoute } from "../store";
import { palette } from "../theme";
import { SettingsCard, SubraButton } from "./SettingsRow";

export function PlaceholderPage(props: {
  title: string;
  subtitle: string;
  nextMilestone: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.mainBg,
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <SettingsCard
        style={{
          width: 460,
          padding: 24,
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <Text
          style={{
            color: palette.textPrimary,
            fontSize: 18,
            fontWeight: "600",
          }}
        >
          {props.title}
        </Text>
        <Text
          style={{
            color: palette.textSecondary,
            fontSize: 13,
            lineHeight: 19,
          }}
        >
          {props.subtitle}
        </Text>
        <View
          style={{
            backgroundColor: palette.amberSoftBg,
            borderRadius: 6,
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 5,
            paddingBottom: 5,
            marginTop: 4,
          }}
        >
          <Text style={{ color: palette.amber, fontSize: 11.5, fontWeight: "500" }}>
            {props.nextMilestone}
          </Text>
        </View>
        <View style={{ marginTop: 10 }}>
          <SubraButton
            label="Go to General Settings"
            onPress={() => activeRoute.set("settings-general")}
          />
        </View>
      </SettingsCard>
    </View>
  );
}
