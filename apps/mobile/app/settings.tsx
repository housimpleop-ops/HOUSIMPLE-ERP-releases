import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { loadSettings, saveSettings } from "../lib/settings";
import { health } from "../lib/api";
import { colors } from "../lib/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const [apiUrl, setApiUrl] = useState("");
  const [appKey, setAppKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    loadSettings().then((s) => {
      setApiUrl(s.apiUrl);
      setAppKey(s.appKey);
    });
  }, []);

  const save = async () => {
    await saveSettings({ apiUrl, appKey });
    try {
      await health();
      setStatus("✓ 서버 연결 성공");
      setTimeout(() => router.back(), 600);
    } catch (e) {
      setStatus(`✗ 연결 실패: ${e instanceof Error ? e.message : ""}`);
      Alert.alert("서버에 연결할 수 없습니다", "주소와 포트, 같은 와이파이인지 확인하세요.");
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>서버 주소</Text>
      <TextInput value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.0.10:8787" style={styles.input} />
      <Text style={styles.help}>PC에서 서버를 실행한 뒤, PC의 내부 IP와 포트를 입력하세요.</Text>
      <Text style={styles.label}>앱 키 (서버 APP_API_KEY, 선택)</Text>
      <TextInput value={appKey} onChangeText={setAppKey} autoCapitalize="none" autoCorrect={false} secureTextEntry style={styles.input} />
      <Pressable onPress={save} style={styles.btn}>
        <Text style={styles.btnText}>저장하고 연결 확인</Text>
      </Pressable>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: "700", color: colors.sub, marginTop: 8 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text },
  help: { fontSize: 12, color: colors.sub },
  btn: { backgroundColor: colors.accent, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 16 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  status: { marginTop: 10, color: colors.text },
});
