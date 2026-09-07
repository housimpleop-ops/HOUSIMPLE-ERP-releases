/**
 * 숨은 WebView 안에서 실행되는 스크립트.
 * 폰의 통신망·브라우저로 페이지를 읽으므로 서버 IP 차단과 무관하다.
 * 결과는 window.ReactNativeWebView.postMessage 로 앱에 돌아온다.
 */

export type ExtractOk = {
  ok: true;
  videoId?: string | null;
  title: string;
  author: string;
  siteName: string;
  thumbnail: string;
  description: string;
  durationSec: number | null;
  chapters: { sec: number; label: string }[];
  transcript: { start: number; text: string }[];
};
export type ExtractFail = { ok: false; error: string };
export type ExtractResult = ExtractOk | ExtractFail;

/** 네이버 블로그는 본문이 iframe 안에 있어 PostView 주소로 바꿔서 연다 */
export function normalizeUrl(url: string): string {
  const u = url.trim();
  if (/blog\.naver\.com/.test(u) && !/PostView/i.test(u)) {
    const m = u.match(/blog\.naver\.com\/([^/?#]+)\/(\d+)/) ?? u.match(/blogId=([^&]+)[\s\S]*?logNo=(\d+)/);
    if (m) return `https://blog.naver.com/PostView.naver?blogId=${m[1]}&logNo=${m[2]}`;
  }
  return u;
}

const POST = `
function __post(o){ try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e) {} }
function __fail(m){ __post({ ok:false, error:String(m) }); }
`;

/** 유튜브 watch 페이지에서 제목·설명·길이·자막을 읽는다 */
export const YOUTUBE_JS = `
(function(){
${POST}
  function playerResponse(){
    if (window.ytInitialPlayerResponse) return window.ytInitialPlayerResponse;
    var html = document.documentElement.innerHTML;
    var m = html.match(/ytInitialPlayerResponse\\s*=\\s*(\\{.+?\\})\\s*;\\s*(?:var|<\\/script>)/);
    if (!m) m = html.match(/ytInitialPlayerResponse\\s*=\\s*(\\{.+?\\});/);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch(e) { return null; }
  }
  function chapters(desc){
    var out = [], lines = (desc||'').split(/\\r?\\n/);
    for (var i=0;i<lines.length;i++){
      var m = lines[i].match(/(?:^|\\s|\\[|\\()((?:\\d{1,2}:)?\\d{1,2}:\\d{2})(?:\\]|\\))?\\s*[-–:|~]?\\s*(.+)$/);
      if (!m) continue;
      var p = m[1].split(':').map(Number), sec = p.length === 3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1];
      out.push({ sec: sec, label: String(m[2]).trim() });
    }
    return out.sort(function(a,b){ return a.sec-b.sec; });
  }
  function run(tries){
    var pr = playerResponse();
    if (!pr) {
      if (tries > 0) return setTimeout(function(){ run(tries-1); }, 700);
      return __fail('영상 정보를 읽지 못했습니다');
    }
    var vd = pr.videoDetails || {};
    var desc = vd.shortDescription || '';
    var base = {
      ok: true,
      videoId: vd.videoId || null,
      title: vd.title || document.title,
      author: vd.author || '',
      siteName: 'YouTube',
      thumbnail: ((((vd.thumbnail||{}).thumbnails)||[]).slice(-1)[0]||{}).url || '',
      description: desc,
      durationSec: Number(vd.lengthSeconds || 0) || null,
      chapters: chapters(desc),
      transcript: []
    };
    var tracks = (((pr.captions||{}).playerCaptionsTracklistRenderer)||{}).captionTracks || [];
    var ko = tracks.filter(function(t){ return (t.languageCode||'').indexOf('ko') === 0; });
    var pick = ko.filter(function(t){ return t.kind !== 'asr'; })[0] || ko[0] || tracks[0];
    if (!pick || !pick.baseUrl) return __post(base);
    // 같은 origin(youtube.com)이므로 추가 권한 없이 자막을 받을 수 있다
    fetch(pick.baseUrl + '&fmt=json3')
      .then(function(r){ return r.json(); })
      .then(function(j){
        base.transcript = (j.events || [])
          .filter(function(e){ return e.segs; })
          .map(function(e){
            return {
              start: (e.tStartMs || 0) / 1000,
              text: e.segs.map(function(s){ return s.utf8 || ''; }).join('').replace(/\\s+/g,' ').trim()
            };
          })
          .filter(function(e){ return e.text; });
        __post(base);
      })
      .catch(function(){ __post(base); });
  }
  try { run(6); } catch(e) { __fail(e); }
})();
true;
`;

/** 블로그·레시피 사이트에서 JSON-LD와 본문 텍스트를 읽는다 */
export const BLOG_JS = `
(function(){
${POST}
  function meta(p){
    var el = document.querySelector("meta[property='og:" + p + "']") || document.querySelector("meta[name='" + p + "']");
    return el ? (el.getAttribute('content') || '').trim() : '';
  }
  function textOf(sel, doc){
    var el = (doc || document).querySelector(sel);
    return el ? el.innerText || el.textContent || '' : '';
  }
  function jsonLd(){
    var out = '', title = '', author = '';
    var nodes = document.querySelectorAll("script[type='application/ld+json']");
    for (var i=0;i<nodes.length;i++){
      try {
        var j = JSON.parse(nodes[i].textContent);
        var arr = Array.isArray(j) ? j : (j['@graph'] ? j['@graph'] : [j]);
        for (var k=0;k<arr.length;k++){
          var n = arr[k], t = n && n['@type'];
          if (t === 'Recipe' || (Array.isArray(t) && t.indexOf('Recipe') >= 0)) {
            out = JSON.stringify(n);
            if (n.name) title = n.name;
            if (n.author && n.author.name) author = n.author.name;
          }
        }
      } catch(e) {}
    }
    return { text: out, title: title, author: author };
  }
  function body(){
    var host = location.hostname;
    // 네이버 블로그를 메인 주소로 열면 본문이 iframe(#mainFrame) 안에 있다
    var fr = document.getElementById('mainFrame');
    var doc = (fr && fr.contentDocument) ? fr.contentDocument : document;
    if (host.indexOf('10000recipe.com') >= 0) {
      return textOf('#divConfirmedMaterialArea', doc) + '\\n\\n[조리순서]\\n' + textOf('.view_step', doc) + '\\n\\n[팁]\\n' + textOf('#recipeTip', doc);
    }
    if (host.indexOf('blog.naver.com') >= 0) {
      return textOf('.se-main-container', doc) || textOf('#postViewArea', doc) || textOf('body', doc);
    }
    if (host.indexOf('tistory.com') >= 0 || document.querySelector('.tt_article_useless_p_margin')) {
      return textOf('.tt_article_useless_p_margin', doc) || textOf('.entry-content', doc) || textOf('.article', doc) || textOf('body', doc);
    }
    return textOf('article', doc) || textOf('main', doc) || textOf('body', doc);
  }
  function run(tries){
    try {
      var ld = jsonLd();
      var raw = (body() || '').replace(/[ \\t]+/g,' ').replace(/\\n\\s*\\n+/g,'\\n').trim();
      if (raw.length < 120 && tries > 0) return setTimeout(function(){ run(tries-1); }, 800);
      if (raw.length < 60 && !ld.text) return __fail('본문을 읽지 못했습니다 (로그인이 필요한 페이지일 수 있습니다)');
      var desc = (ld.text ? '[구조화 데이터 JSON-LD]\\n' + ld.text + '\\n\\n' : '') + '[본문]\\n' + raw.slice(0, 20000);
      __post({
        ok: true,
        videoId: null,
        title: ld.title || meta('title') || document.title,
        author: ld.author || meta('author') || '',
        siteName: meta('site_name') || location.hostname,
        thumbnail: meta('image'),
        description: desc,
        durationSec: null,
        chapters: [],
        transcript: []
      });
    } catch(e) { __fail(e); }
  }
  run(5);
})();
true;
`;
