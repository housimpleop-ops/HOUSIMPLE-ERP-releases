import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import YoutubePlayer, { PLAYER_STATES, type YoutubeIframeRef } from "react-native-youtube-iframe";

export type StepPlayerHandle = { seekTo: (sec: number) => void };

type Props = {
  videoId: string;
  /** 1초마다 현재 재생 위치를 알려줌 → 활성 단계 하이라이트에 사용 */
  onTime: (sec: number) => void;
};

/** 유튜브 임베드 플레이어. 단계를 누르면 seekTo로 해당 장면으로 점프 */
export const StepPlayer = forwardRef<StepPlayerHandle, Props>(function StepPlayer({ videoId, onTime }, ref) {
  const player = useRef<YoutubeIframeRef>(null);
  const [playing, setPlaying] = useState(false);
  const { width } = useWindowDimensions();
  const height = Math.round((width * 9) / 16);

  useImperativeHandle(ref, () => ({
    seekTo: (sec) => {
      player.current?.seekTo(sec, true);
      setPlaying(true);
    },
  }));

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(async () => {
      const cur = await player.current?.getCurrentTime().catch(() => null);
      if (typeof cur === "number") onTime(cur);
    }, 1000);
    return () => clearInterval(t);
  }, [playing, onTime]);

  return (
    <YoutubePlayer
      ref={player}
      height={height}
      videoId={videoId}
      play={playing}
      onChangeState={(s: PLAYER_STATES) => {
        if (s === PLAYER_STATES.PLAYING) setPlaying(true);
        else if (s === PLAYER_STATES.PAUSED || s === PLAYER_STATES.ENDED) setPlaying(false);
      }}
      initialPlayerParams={{ modestbranding: true, rel: false }}
      webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }}
    />
  );
});
