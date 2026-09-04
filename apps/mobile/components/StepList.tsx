import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Step } from "../lib/types";
import { colors } from "../lib/theme";
import { formatSec } from "../lib/api";

type Props = {
  steps: Step[];
  activeIndex: number | null; // 영상 현재 시간에 해당하는 단계
  hasVideo: boolean;
  onSeek: (sec: number) => void;
  onTimer: (sec: number, label: string) => void;
};

export function StepList({ steps, activeIndex, hasVideo, onSeek, onTimer }: Props) {
  return (
    <View>
      {steps.map((s, i) => {
        const active = activeIndex === i;
        const canSeek = hasVideo && s.startSec !== null;
        return (
          <Pressable
            key={s.order}
            onPress={() => canSeek && onSeek(s.startSec!)}
            style={[styles.step, active && styles.stepActive]}
          >
            <View style={styles.head}>
              <View style={[styles.num, active && styles.numActive]}>
                <Text style={[styles.numText, active && { color: "#fff" }]}>{s.order}</Text>
              </View>
              {canSeek ? (
                <Text style={styles.time}>
                  ▶ {formatSec(s.startSec!)}
                  {s.endSec !== null ? ` ~ ${formatSec(s.endSec)}` : ""}
                </Text>
              ) : null}
              {s.timerSec ? (
                <Pressable onPress={() => onTimer(s.timerSec!, `${s.order}단계`)} style={styles.timerBtn}>
                  <Text style={styles.timerText}>⏱ {Math.round(s.timerSec / 60)}분</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.text}>{s.text}</Text>
            {s.ingredientsUsed.length > 0 ? (
              <View style={styles.chips}>
                {s.ingredientsUsed.map((n) => (
                  <Text key={n} style={styles.chip}>{n}</Text>
                ))}
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12, marginBottom: 10 },
  stepActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  head: { flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 8 },
  num: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center" },
  numActive: { backgroundColor: colors.accent },
  numText: { fontWeight: "800", color: colors.text, fontSize: 13 },
  time: { fontSize: 12, color: colors.accent, fontWeight: "700" },
  timerBtn: { marginLeft: "auto", backgroundColor: colors.chip, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  timerText: { fontSize: 12, fontWeight: "700", color: colors.text },
  text: { fontSize: 15, lineHeight: 22, color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: { fontSize: 11, color: colors.sub, backgroundColor: colors.chip, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
});
