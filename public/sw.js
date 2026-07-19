// オフラインでも読めるようにするための Service Worker。
//
// 方針:
//   - 記事データ (data/*.json) は「ネットワーク優先」。
//     つながれば必ず最新を表示し、圏外のときだけキャッシュを返す。
//     （古い記事が最新として表示される事故を防ぐため）
//   - 画面素材 (html/css/js/icon) は「キャッシュ優先」。表示を速くする。
//
// キャッシュ名の版を上げると、古いキャッシュは activate 時に破棄される。

const VERSION = 'v1';
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'article.html',
  'style.css',
  'hero.js',
  'icon.svg',
  'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      // 1 つでも失敗すると全体が失敗するため、個別に追加して失敗を無視する
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 出典リンク等は素通し

  // 記事データ: ネットワーク優先
  if (url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r ?? offlineJson())),
    );
    return;
  }

  // 画面素材: キャッシュ優先（無ければ取得してキャッシュ）
  e.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
      return res;
    })),
  );
});

function offlineJson() {
  return new Response(
    JSON.stringify({ articles: [], offline: true }),
    { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}
