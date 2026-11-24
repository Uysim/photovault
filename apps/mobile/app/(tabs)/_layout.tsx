import { Tabs } from "expo-router";
import { AlbumsIcon, LibraryIcon } from "../../src/tab-icons";
import { color, font } from "../../src/theme";

// The two sections of the app. Everything deeper (an album, the viewer) pushes over the bar.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: color.cloth },
        headerTintColor: color.ink,
        headerTitleStyle: { fontFamily: font.bold, fontSize: 20, color: color.ink },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: color.cloth },
        tabBarActiveTintColor: color.ink,
        tabBarInactiveTintColor: color.inkDim,
        tabBarStyle: { backgroundColor: color.cloth, borderTopColor: color.clothLine, borderTopWidth: 1 },
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "PhotoVault", tabBarLabel: "Library", tabBarIcon: ({ color: c }) => <LibraryIcon color={c} /> }}
      />
      <Tabs.Screen
        name="albums"
        options={{ title: "Albums", tabBarLabel: "Albums", tabBarIcon: ({ color: c }) => <AlbumsIcon color={c} /> }}
      />
    </Tabs>
  );
}
