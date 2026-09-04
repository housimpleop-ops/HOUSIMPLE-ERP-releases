import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";
import { formatSec } from "../lib/api";

type Props = {
  title: string;
  author: string;
  thumbnail: string;
  type: "youtube" | "blog";
  durationSec: number | null;
  subtitle?: string;
  onPress: () => void;
};

export function ResultCard({ title, author, thumbnail, type, durationSec, subtitle, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <View style={styles.thumbWrap}>
        {thumbnail ? <Image source={{ uri: thumbnail }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbEmpty]} />}
        <View style={[styles.badge, type === "youtube" ? styles.badgeYt : styles.badgeBlog]}>
          <Text style={styles.badgeText}>{type === "youtube" ? "▶ 유튜브" : "✎ 블로그"}</Text>
        </View>
        {durationSec ? <Text style={styles.duration}>{formatSec(durationSec)}</Text> : null}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.title}>{title}</Text>
        <Text numberOfLines={1} style={styles.author}>{author || " "}</Text>
        {subtitle ? <Text numberOfLines={2} style={styles.sub}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: "hidden", marginBottom: 10 },
  thumbWrap: { width: 128, height: 96 },
  thumb: { width: "100%", height: "100%" },
  thumbEmpty: { backgroundColor: colors.chip },
  badge: { position: "absolute", top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeYt: { backgroundColor: "#D0342C" },
  badgeBlog: { backgroundColor: "#2B8A3E" },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  duration: { position: "absolute", right: 6, bottom: 6, color: "#fff", fontSize: 11, fontWeight: "600", backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  body: { flex: 1, padding: 10, justifyContent: "center" },
  title: { fontSize: 14, fontWeight: "700", color: colors.text, lineHeight: 19 },
  author: { fontSize: 12, color: colors.sub, marginTop: 3 },
  sub: { fontSize: 11, color: colors.sub, marginTop: 4 },
});
