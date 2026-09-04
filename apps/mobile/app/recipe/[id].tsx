import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { recipeByUrl, recipeByYoutube, formatSec } from "../../lib/api";
import type { RecipeDoc } from "../../lib/types";
import { StepPlayer, type StepPlayerHandle } from "../../components/StepPlayer";
import { StepList } from "../../components/StepList";
import { IngredientList } from "../../components/IngredientList";
import { colors } from "../../lib/theme";

/**
 * /recipe/<videoId>            → 유튜브
 * /recipe/url?url=<blog url>   → 블로그/기타 URL
 */
export default function RecipeScreen() {
  const { id, url } = useLocalSearchParams<{ id: string; url?: string }>();
  const [doc, setDoc] = useState<RecipeDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"steps" | "ingredients">("steps");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [timer, setTimer] = useState<{ left: number; label: string } | null>(null);
  const player = useRef<StepPlayerHandle>(null);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const d = id === "url" && url ? await recipeByUrl(url, refresh) : await recipeByYoutube(id, refresh);
        setDoc(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "불러오기 실패");
      } finally {
        setLoading(false);
      }
    },
    [id, url],
  );
  useEffect(() => {
    load();
  }, [load]);

  // 재생 위치 → 활성 단계
  const onTime = useCallback(
    (sec: number) => {
      if (!doc) return;
      const steps = doc.recipe.steps;
      let idx: number | null = null;
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (s.startSec === null) continue;
        const end = s.endSec ?? steps.slice(i + 1).find((n) => n.startSec !== null)?.startSec ?? Infinity;
        if (sec >= s.startSec && sec < end) {
          idx = i;
          break;
        }
      }
      setActiveIndex(idx);
    },
    [doc],
  );

  // 간단 타이머 (단계의 timerSec)
  useEffect(() => {
    if (!timer || timer.left <= 0) return;
    const t = setTimeout(() => setTimer((p) => (p ? { ...p, left: p.left - 1 } : null)), 1000);
    return () => clearTimeout(t);
  }, [timer]);
  useEffect(() => {
    if (timer && timer.left === 0) Alert.alert("⏱ 타이머 종료", `${timer.label} 시간이 끝났습니다`);
  }, [timer]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>{id === "url" ? "본문을 읽고 정리하는 중…" : "자막을 읽고 정리하는 중…"}</Text>
        <Text style={styles.loadingSub}>처음 정리하는 레시피는 20~40초 걸립니다</Text>
      </View>
    );
  }
  if (error || !doc) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "레시피를 불러오지 못했습니다"}</Text>
        <Pressable onPress={() => load()} style={styles.btn}><Text style={styles.btnText}>다시 시도</Text></Pressable>
      </View>
    );
  }

  const { recipe, source } = doc;
  const hasVideo = source.type === "youtube" && !!source.videoId;
  const hasTimeline = hasVideo && recipe.steps.some((s) => s.startSec !== null);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: recipe.title || "레시피" }} />
      {hasVideo ? <StepPlayer ref={player} videoId={source.videoId!} onTime={onTime} /> : null}
      <ScrollView contentContainerStyle={styles.body} stickyHeaderIndices={[1]}>
        <View>
          <Text style={styles.title}>{recipe.title}</Text>
          {recipe.summary ? <Text style={styles.summary}>{recipe.summary}</Text> : null}
          <View style={styles.meta}>
            {recipe.servings ? <Text style={styles.metaChip}>{recipe.servings}</Text> : null}
            {recipe.totalTimeMinutes ? <Text style={styles.metaChip}>⏱ {recipe.totalTimeMinutes}분</Text> : null}
            {source.durationSec ? <Text style={styles.metaChip}>▶ {formatSec(source.durationSec)}</Text> : null}
            <Pressable onPress={() => Linking.openURL(source.url)}><Text style={[styles.metaChip, styles.link]}>{source.siteName} · {source.author || "원문"} ↗</Text></Pressable>
          </View>
          {!recipe.isRecipe ? <Text style={styles.warn}>⚠ 이 콘텐츠는 레시피가 아닌 것으로 보입니다</Text> : null}
          {hasVideo && !hasTimeline ? <Text style={styles.warn}>ⓘ 이 영상은 자막·챕터가 없어 단계별 점프를 만들지 못했습니다</Text> : null}
        </View>

        <View style={styles.tabs}>
          <Pressable onPress={() => setTab("steps")} style={[styles.tab, tab === "steps" && styles.tabOn]}>
            <Text style={[styles.tabText, tab === "steps" && styles.tabTextOn]}>조리 순서 {recipe.steps.length}</Text>
          </Pressable>
          <Pressable onPress={() => setTab("ingredients")} style={[styles.tab, tab === "ingredients" && styles.tabOn]}>
            <Text style={[styles.tabText, tab === "ingredients" && styles.tabTextOn]}>재료 {recipe.ingredients.length}</Text>
          </Pressable>
          {timer ? (
            <Pressable onPress={() => setTimer(null)} style={styles.timerPill}>
              <Text style={styles.timerPillText}>⏱ {formatSec(timer.left)} ✕</Text>
            </Pressable>
          ) : null}
        </View>

        {tab === "steps" ? (
          <StepList
            steps={recipe.steps}
            activeIndex={activeIndex}
            hasVideo={hasVideo}
            onSeek={(sec) => player.current?.seekTo(sec)}
            onTimer={(sec, label) => setTimer({ left: sec, label })}
          />
        ) : (
          <IngredientList items={recipe.ingredients} />
        )}

        {recipe.tips.length > 0 ? (
          <View style={styles.tips}>
            <Text style={styles.tipsTitle}>💡 팁</Text>
            {recipe.tips.map((t, i) => (
              <Text key={i} style={styles.tip}>• {t}</Text>
            ))}
          </View>
        ) : null}

        <Pressable onPress={() => load(true)} style={styles.refresh}>
          <Text style={styles.refreshText}>다시 정리하기 (AI 재분석)</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  loadingText: { fontSize: 15, color: colors.text, fontWeight: "600" },
  loadingSub: { fontSize: 12, color: colors.sub },
  error: { color: colors.danger, textAlign: "center" },
  btn: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  btnText: { color: "#fff", fontWeight: "800" },
  body: { padding: 14, paddingBottom: 60 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  summary: { fontSize: 14, color: colors.sub, marginTop: 4, lineHeight: 20 },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  metaChip: { fontSize: 12, color: colors.text, backgroundColor: colors.chip, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
  link: { color: colors.accent, backgroundColor: colors.accentSoft },
  warn: { marginTop: 8, fontSize: 12, color: colors.sub, backgroundColor: colors.chip, padding: 8, borderRadius: 8 },
  tabs: { flexDirection: "row", gap: 8, paddingVertical: 10, backgroundColor: colors.bg, alignItems: "center" },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.chip },
  tabOn: { backgroundColor: colors.text },
  tabText: { fontSize: 13, fontWeight: "700", color: colors.text },
  tabTextOn: { color: "#fff" },
  timerPill: { marginLeft: "auto", backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  timerPillText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  tips: { marginTop: 8, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12 },
  tipsTitle: { fontWeight: "800", marginBottom: 6, color: colors.text },
  tip: { fontSize: 14, color: colors.text, lineHeight: 21 },
  refresh: { marginTop: 18, alignItems: "center" },
  refreshText: { color: colors.sub, fontSize: 13, textDecorationLine: "underline" },
});
