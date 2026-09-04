import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_URL = "settings.apiUrl";
const KEY_APPKEY = "settings.appKey";

export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787";
export const DEFAULT_APP_KEY = process.env.EXPO_PUBLIC_APP_KEY ?? "";

export async function loadSettings(): Promise<{ apiUrl: string; appKey: string }> {
  try {
    const [u, k] = await Promise.all([AsyncStorage.getItem(KEY_URL), AsyncStorage.getItem(KEY_APPKEY)]);
    return { apiUrl: u || DEFAULT_API_URL, appKey: k ?? DEFAULT_APP_KEY };
  } catch {
    return { apiUrl: DEFAULT_API_URL, appKey: DEFAULT_APP_KEY };
  }
}

export async function saveSettings(s: { apiUrl: string; appKey: string }): Promise<void> {
  await AsyncStorage.setItem(KEY_URL, s.apiUrl.trim().replace(/\/+$/, ""));
  await AsyncStorage.setItem(KEY_APPKEY, s.appKey.trim());
}
