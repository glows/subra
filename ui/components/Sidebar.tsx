import { Image, Text, View } from "nsh";
import { titleBar } from "nsh/desktop";
import appIcon from "../../assets/icon.png";
import {
  activeRoute,
  closeVideo,
  showToast,
  switchLibraryFolder,
  videos,
} from "../store";
import { palette } from "../theme";
import type { NavRoute } from "../types";

interface NavItemProps {
  route: NavRoute;
  icon: string;
  label: string;
  badge?: string;
}

function NavItem(props: NavItemProps) {
  const isActive = () => activeRoute() === props.route;
  return (
    <View
      testID={`nav-${props.route}`}
      desktop={{ windowDrag: false }}
      onPress={() => {
        closeVideo();
        activeRoute.set(props.route);
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: 10,
        paddingRight: 10,
        paddingTop: 7,
        paddingBottom: 7,
        borderRadius: 8,
        cursor: "pointer",
        backgroundColor: isActive() ? palette.sidebarActiveBg : "transparent",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 9,
          pointerEvents: "none",
        }}
      >
        <Text
          style={{
            color: isActive() ? palette.amber : palette.textSecondary,
            fontSize: 13,
            width: 16,
            textAlign: "center",
          }}
        >
          {props.icon}
        </Text>
        <Text
          style={{
            color: isActive() ? palette.textPrimary : "#CFCFCA",
            fontSize: 13,
            fontWeight: isActive() ? "600" : "400",
          }}
        >
          {props.label}
        </Text>
      </View>
      {props.badge ? (
        <Text
          style={{
            color: palette.textMuted,
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          {props.badge}
        </Text>
      ) : null}
    </View>
  );
}

function SidebarSection(props: { label: string }) {
  return (
    <Text
      style={{
        color: palette.textSection,
        fontSize: 11,
        fontWeight: "600",
        paddingLeft: 10,
        marginTop: 18,
        marginBottom: 6,
      }}
    >
      {props.label}
    </Text>
  );
}

export function Sidebar() {
  const topInset = () => Math.max(titleBar().height, 36);

  return (
    <View
      style={{
        width: 210,
        flexShrink: 0,
        backgroundColor: palette.sidebarBg,
        borderRightColor: palette.sidebarBorder,
        borderRightWidth: 1,
        paddingLeft: 10,
        paddingRight: 10,
        paddingBottom: 12,
        justifyContent: "space-between",
      }}
    >
      {/* Top draggable area + Library switcher + Nav groups */}
      <View>
        <View
          desktop={{ windowDrag: true }}
          style={{
            height: topInset(),
          }}
        />

        {/* Library Switcher */}
        <View
          testID="library-switcher"
          desktop={{ windowDrag: false }}
          onPress={() => {
            void switchLibraryFolder();
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingLeft: 6,
            paddingRight: 8,
            paddingTop: 6,
            paddingBottom: 6,
            borderRadius: 9,
            marginBottom: 4,
            cursor: "pointer",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              pointerEvents: "none",
            }}
          >
            <Image
              src={appIcon}
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
              }}
            />
            <View style={{ gap: 1 }}>
              <Text
                style={{
                  color: palette.textPrimary,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                Subra Library
              </Text>
              <Text style={{ color: palette.textMuted, fontSize: 11 }}>
                {`${videos().length} ${videos().length === 1 ? "video" : "videos"}`}
              </Text>
            </View>
          </View>
          <Text
            style={{
              color: palette.textMuted,
              fontSize: 11,
              pointerEvents: "none",
            }}
          >
            ↕
          </Text>
        </View>

        {/* Videos */}
        <SidebarSection label="Videos" />
        <View style={{ gap: 2 }}>
          <NavItem
            route="all-videos"
            icon="▤"
            label="All Videos"
            badge={String(videos().length)}
          />
          <NavItem route="browse" icon="◎" label="Browse" />
        </View>

        {/* Sources */}
        <SidebarSection label="Sources" />
        <View style={{ gap: 2 }}>
          <NavItem route="youtube" icon="▶" label="YouTube" />
          <NavItem route="x" icon="𝕏" label="X" />
          <NavItem route="local-import" icon="⇩" label="Local Import" />
        </View>

        {/* Settings */}
        <SidebarSection label="Settings" />
        <View style={{ gap: 2 }}>
          <NavItem route="settings-general" icon="⚙" label="General" />
          <NavItem route="settings-speech" icon="ılı" label="Speech Recognition" />
          <NavItem route="settings-ai" icon="✦" label="AI Providers" />
          <NavItem route="settings-translation" icon="文" label="Translation" />
        </View>
      </View>

      {/* Footer: Send Feedback */}
      <View
        testID="send-feedback"
        desktop={{ windowDrag: false }}
        onPress={() => showToast("Feedback composer ready in a future release")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 10,
          paddingBottom: 10,
          borderRadius: 10,
          borderColor: palette.sidebarBorder,
          borderWidth: 1,
          backgroundColor: "#1A1917",
          cursor: "pointer",
        }}
      >
        <Text
          style={{
            color: palette.textSecondary,
            fontSize: 14,
            pointerEvents: "none",
          }}
        >
          ✉
        </Text>
        <View style={{ gap: 1, pointerEvents: "none" }}>
          <Text
            style={{
              color: palette.textPrimary,
              fontSize: 12.5,
              fontWeight: "600",
            }}
          >
            Send Feedback
          </Text>
          <Text style={{ color: palette.textMuted, fontSize: 11 }}>
            Write to the developer
          </Text>
        </View>
      </View>
    </View>
  );
}
