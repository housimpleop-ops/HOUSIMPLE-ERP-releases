import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "../lib/theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "레시피 타임라인" }} />
        <Stack.Screen name="recipe/[id]" options={{ title: "레시피" }} />
        <Stack.Screen name="settings" options={{ title: "설정", presentation: "modal" }} />
      </Stack>
    </>
  );
}
