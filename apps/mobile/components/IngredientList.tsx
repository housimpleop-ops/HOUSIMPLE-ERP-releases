import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Ingredient } from "../lib/types";
import { colors } from "../lib/theme";

/** 재료 체크리스트 — 장보기/준비 완료 체크용 */
export function IngredientList({ items }: { items: Ingredient[] }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const groups = new Map<string, { i: number; ing: Ingredient }[]>();
  items.forEach((ing, i) => {
    const g = ing.group || "재료";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push({ i, ing });
  });
  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <View>
      {[...groups.entries()].map(([g, rows]) => (
        <View key={g} style={{ marginBottom: 8 }}>
          {groups.size > 1 ? <Text style={styles.group}>{g}</Text> : null}
          {rows.map(({ i, ing }) => {
            const done = checked.has(i);
            return (
              <Pressable key={i} onPress={() => toggle(i)} style={styles.row}>
                <View style={[styles.box, done && styles.boxOn]}>{done ? <Text style={styles.tick}>✓</Text> : null}</View>
                <Text style={[styles.name, done && styles.done]}>{ing.name}</Text>
                <Text style={[styles.amount, done && styles.done]}>{ing.amount}</Text>
                {ing.note ? <Text style={styles.note}>{ing.note}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { fontSize: 12, fontWeight: "700", color: colors.accent, marginBottom: 4, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, flexWrap: "wrap" },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: colors.sub, marginRight: 10, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: colors.green, borderColor: colors.green },
  tick: { color: "#fff", fontSize: 13, fontWeight: "800" },
  name: { fontSize: 15, color: colors.text, flex: 1 },
  amount: { fontSize: 14, color: colors.sub, fontWeight: "600" },
  note: { width: "100%", marginLeft: 30, fontSize: 12, color: colors.sub, marginTop: 2 },
  done: { textDecorationLine: "line-through", color: "#B0A79C" },
});
