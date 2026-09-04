import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTimestamp, extractChapters, parseIsoDuration, extractYoutubeId } from "./util.js";
import { parseTimedText, transcriptToText } from "./youtube.js";

test("parseTimestamp", () => {
  assert.equal(parseTimestamp("1:23"), 83);
  assert.equal(parseTimestamp("01:02:03"), 3723);
  assert.equal(parseTimestamp("5분 30초"), 330);
  assert.equal(parseTimestamp("abc"), null);
});

test("extractChapters from description", () => {
  const desc = `오늘은 김치찌개!\n0:00 인트로\n0:35 재료 손질\n[2:10] 볶기\n(4:05) - 끓이기\n감사합니다`;
  const ch = extractChapters(desc);
  assert.deepEqual(ch.map((c) => c.sec), [0, 35, 130, 245]);
  assert.equal(ch[1].label, "재료 손질");
  assert.equal(ch[3].label, "끓이기");
});

test("parseIsoDuration", () => {
  assert.equal(parseIsoDuration("PT1H2M3S"), 3723);
  assert.equal(parseIsoDuration("PT7M"), 420);
  assert.equal(parseIsoDuration("bad"), null);
});

test("extractYoutubeId", () => {
  assert.equal(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1s"), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractYoutubeId("https://blog.naver.com/a/1"), null);
});

test("parseTimedText + bucket", () => {
  const xml = `<transcript><text start="0.5" dur="2">안녕하세요</text><text start="3" dur="2">오늘은 &amp; 김치찌개</text><text start="20" dur="2">양파를 썬다</text></transcript>`;
  const lines = parseTimedText(xml);
  assert.equal(lines.length, 3);
  assert.equal(lines[1].text, "오늘은 & 김치찌개");
  const txt = transcriptToText(lines);
  assert.equal(txt, "[0:00] 안녕하세요 오늘은 & 김치찌개\n[0:20] 양파를 썬다");
});
