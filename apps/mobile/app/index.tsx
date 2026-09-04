import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { search, recentRecipes, docRef, type SourceFilter } from "../lib/api";
import type { RecipeDoc, SearchResult } from "../lib/types";
import { ResultCard } from "../components/ResultCard";
import { colors } from "../lib/theme";

const FILTERS: { key: SourceFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "youtube", label: "유튜브" },
  { key: "blog", label: "블로그" },
];

export default function SearchScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [recent, setRecent] = useState<RecipeDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecent = useCallback(() => {
    recentRecipes().then((r) => setRecent(r.results)).catch(() => {});
  }, []);
  useEffect(loadRecent, [loadRecent]);

  const isUrl = /^https?:\/\//i.test(q.trim());

  const run = async () => {
    const query = q.trim();
    if (!query) return;
    Keyboard.dismiss();
    setError(null);
    // URL을 붙여넣으면 검색 대신 바로 정리 화면으로
    if (isUrl) {
      router.push({ pathname: "/recipe/[id]", params: { id: "url", url: query } });
      return;
    }
    setLoading(true);
    try {
      const r = await search(query, filter);
      setResults(r.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색 실패");
    } finally {
      setLoading(false);
    }
  };

  const open = (r: { type: "youtube" | "blog"; id: string; url: string }) => {
    const ref = docRef(r);
    router.push({ pathname: "/recipe/[id]", params: ref.kind === "yt" ? { id: ref.value } : { id: "url", url: ref.value } });
  };

  const header = (
    <View>
      <View style={styles.searchRow}>
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={run}
          placeholder="요리 이름 검색 또는 유튜브/블로그 URL 붙여넣기"
          placeholderTextColor="#A69E93"
          returnKeyType="search"
          autoCorrect={false}
          style={styles.input}
        />
        <Pressable onPress={run} style={styles.btn}>
          <Text style={styles.btnText}>{isUrl ? "정리" : "검색"}</Text>
        </Pressable>
      </View>
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, filter === f.key && styles.chipOn]}>
            <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
        <Link href="/settings" asChild>
          <Pressable style={[styles.chip, { marginLeft: "auto" }]}>
            <Text style={styles.chipText}>⚙ 설정</Text>
          </Pressable>
        </Link>
      </View>
      {loading ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {results && results.length === 0 && !loading ? <Text style={styles.empty}>검색 결과가 없습니다</Text> : null}
      {results === null && recent.length > 0 ? <Text style={styles.section}>최근 정리한 레시피</Text> : null}
    </View>
  );

  const data: { key: string; node: React.ReactElement }[] = results
    ? results.map((r) => ({
        key: `${r.type}:${r.id}`,
        node: (
          <ResultCard
            title={r.title}
            author={r.author}
            thumbnail={r.thumbnail}
            type={r.type}
            durationSec={r.durationSec}
            subtitle={r.description}
            onPress={() => open(r)}
          />
        ),
      }))
    : recent.map((d) => ({
        key: d.id,
        node: (
          <ResultCard
            title={d.recipe.title}
            author={d.source.author}
            thumbnail={d.source.thumbnail}
            type={d.source.type}
            durationSec={d.source.durationSec}
            subtitle={`재료 ${d.recipe.ingredients.length} · ${d.recipe.steps.length}단계`}
            onPress={() => open({ type: d.source.type, id: d.id, url: d.source.url })}
          />
        ),
      }));

  return (
    <FlatList
      data={data}
      keyExtractor={(i) => i.key}
      renderItem={({ item }) => item.node}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      onRefresh={loadRecent}
      refreshing={false}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 14, paddingBottom: 40 },
  searchRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text },
  btn: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 16, justifyContent: "center" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  filters: { flexDirection: "row", gap: 8, marginTop: 10, marginBottom: 12, alignItems: "center" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.chip },
  chipOn: { backgroundColor: colors.text },
  chipText: { fontSize: 13, color: colors.text, fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  section: { fontSize: 13, fontWeight: "700", color: colors.sub, marginBottom: 8 },
  error: { color: colors.danger, marginBottom: 10 },
  empty: { color: colors.sub, textAlign: "center", marginVertical: 20 },
});
