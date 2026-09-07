import { useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { BLOG_JS, YOUTUBE_JS, normalizeUrl, type ExtractResult } from "../lib/inject";

/** 데스크톱 UA — 유튜브가 자막 트랙이 들어 있는 전체 페이지를 내려주도록 */
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type ExtractJob = { kind: "youtube" | "blog"; url: string };

type Props = {
  job: ExtractJob | null;
  onResult: (r: ExtractResult) => void;
};

/**
 * 화면에 보이지 않는 WebView. 폰의 브라우저로 페이지를 열어 원문을 읽어온다.
 * 서버가 아니라 폰이 요청하므로 데이터센터 IP 차단의 영향을 받지 않는다.
 */
export function HiddenExtractor({ job, onResult }: Props) {
  const done = useRef(false);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      if (done.current) return;
      done.current = true;
      try {
        onResult(JSON.parse(e.nativeEvent.data) as ExtractResult);
      } catch {
        onResult({ ok: false, error: "결과를 해석하지 못했습니다" });
      }
    },
    [onResult],
  );

  if (!job) return null;
  done.current = false;

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        key={job.url}
        source={{ uri: normalizeUrl(job.url), headers: { "Accept-Language": "ko-KR,ko;q=0.9" } }}
        userAgent={DESKTOP_UA}
        injectedJavaScript={job.kind === "youtube" ? YOUTUBE_JS : BLOG_JS}
        onMessage={onMessage}
        onError={() => {
          if (done.current) return;
          done.current = true;
          onResult({ ok: false, error: "페이지를 열지 못했습니다 (인터넷 연결 확인)" });
        }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        originWhitelist={["*"]}
        // 영상 자동재생을 막아 데이터·배터리 낭비를 줄인다
        mediaPlaybackRequiresUserAction
      />
    </View>
  );
}

// 0x0 크기는 일부 안드로이드에서 스크립트가 실행되지 않으므로 1x1 투명으로 둔다
const styles = StyleSheet.create({
  hidden: { position: "absolute", width: 1, height: 1, opacity: 0, top: -10, left: -10 },
});
