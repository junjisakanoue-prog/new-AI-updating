// RSS / Atom を依存ライブラリなしで取得・パースする。
// フィードの XML は素朴なので、正規表現ベースで十分に実用的。

import { FEEDS, BLUESKY_ACCOUNTS, AI_KEYWORDS, AI_KEYWORDS_JA } from './sources.mjs';

const UA = 'Mozilla/5.0 (compatible; AIDailyBrief/1.0; +personal-use)';
const TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 429 / 5xx は指数バックオフで最大 3 回まで再試行する（Reddit 対策） */
async function fetchText(url, attempt = 0) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      redirect: 'follow',
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      clearTimeout(timer);
      await sleep(1500 * 2 ** attempt);
      return fetchText(url, attempt + 1);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function stripTags(s) {
  // フィードによっては HTML が二重エスケープされている（&lt;img&gt; 等）。
  // 先にデコード → タグ除去 → もう一度デコード、の順にしないとタグ文字列が本文に残る。
  const decoded = decodeEntities(String(s ?? ''));
  const stripped = decoded.replace(/<[^>]*>/g, ' ');
  return decodeEntities(stripped).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** HN / Reddit の定型テキストは本文として無価値なので除去する */
function scrubBoilerplate(s) {
  return String(s ?? '')
    .replace(/Article URL:\s*\S+/gi, '')
    .replace(/Comments URL:\s*\S+/gi, '')
    .replace(/Points:\s*\d+/gi, '')
    .replace(/#\s*Comments:\s*\d+/gi, '')
    .replace(/submitted by\s*\/u\/\S+/gi, '')
    .replace(/\[link\]|\[comments\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(block, tags) {
  for (const tag of tags) {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
    if (m) return stripTags(m[1]);
  }
  return '';
}

function pickLink(block) {
  // Atom: <link href="..."/>（rel="alternate" を優先）
  const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  if (alt) return decodeEntities(alt[1]);
  const href = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (href) return decodeEntities(href[1]);
  // RSS: <link>...</link>
  const rss = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (rss) return stripTags(rss[1]);
  const guid = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
  if (guid && /^https?:/i.test(stripTags(guid[1]))) return stripTags(guid[1]);
  return '';
}

function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  return blocks.map((b) => ({
    title: pick(b, ['title']),
    link: pickLink(b),
    summary: scrubBoilerplate(pick(b, ['description', 'summary', 'content:encoded', 'content'])).slice(0, 2000),
    published: pick(b, ['pubDate', 'published', 'updated', 'dc:date']),
    author: pick(b, ['dc:creator', 'author', 'name']),
  })).filter((it) => it.title && it.link);
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'unknown'; }
}

function parseDate(s) {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : Date.now();
}

// 英語キーワードは単語境界で照合する（'ai' が said/email にヒットするのを防ぐ）
const AI_RE = new RegExp(
  `(?<![a-z])(${AI_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![a-z])`,
  'i',
);

function isAIRelated(item) {
  const hay = `${item.title} ${item.summary}`.toLowerCase();
  if (AI_KEYWORDS_JA.some((k) => hay.includes(k))) return true;
  return AI_RE.test(hay);
}

/** 1 フィードを取得して正規化済み item 配列にする。失敗しても throw しない。 */
async function loadFeed(source) {
  try {
    const xml = await fetchText(source.url);
    const items = parseFeed(xml);
    return items.map((it) => ({
      title: it.title,
      url: it.link,
      summary: it.summary,
      author: it.author,
      publishedAt: parseDate(it.published),
      source: source.name,
      sourceTier: source.tier,
      sourceKind: source.kind,
      domain: hostOf(it.link),
    }));
  } catch (err) {
    console.warn(`  [skip] ${source.name}: ${err.message}`);
    return [];
  }
}

/**
 * Bluesky の公開 API から投稿を取得する。認証不要・完全無料。
 * 存在しないハンドルや一時的な障害は空配列を返して黙ってスキップする。
 */
async function loadBlueskyAccount(handle) {
  try {
    const url = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed'
      + `?actor=${encodeURIComponent(handle)}&limit=30&filter=posts_no_replies`;
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const feed = (await res.json()).feed ?? [];

    return feed
      .filter((f) => !f.reason) // リポストを除外（本人の発信のみ）
      .map((f) => {
        const p = f.post;
        const rkey = String(p.uri).split('/').pop();
        return {
          title: String(p.record?.text ?? '').slice(0, 280),
          url: `https://bsky.app/profile/${handle}/post/${rkey}`,
          summary: String(p.record?.text ?? ''),
          author: `@${handle}`,
          publishedAt: Date.parse(p.record?.createdAt) || Date.now(),
          source: `Bluesky / @${handle}`,
          sourceTier: 3,
          sourceKind: 'social',
          domain: `bsky.app/${handle}`,
        };
      })
      .filter((it) => it.title);
  } catch (err) {
    console.warn(`  [skip] Bluesky @${handle}: ${err.message}`);
    return [];
  }
}

/**
 * 全ソースを並列取得する。
 * @param {number} withinHours 直近何時間の記事を対象にするか
 */
export async function collectItems(withinHours = 30) {
  const cutoff = Date.now() - withinHours * 3600_000;

  console.log(`RSS/Atom ${FEEDS.length} 件を取得中...`);
  // slow: true のソース（Reddit 等）は並列アクセスで 429 になるため直列で取得する
  const fast = FEEDS.filter((f) => !f.slow);
  const slow = FEEDS.filter((f) => f.slow);

  const feedResults = await Promise.all(fast.map(loadFeed));
  for (const source of slow) {
    feedResults.push(await loadFeed(source));
    await sleep(1200);
  }

  console.log(`Bluesky ${BLUESKY_ACCOUNTS.length} アカウントを取得中...`);
  const bskyResults = await Promise.all(BLUESKY_ACCOUNTS.map(loadBlueskyAccount));
  const bskyOk = bskyResults.filter((r) => r.length).length;
  console.log(`  Bluesky 取得成功: ${bskyOk}/${BLUESKY_ACCOUNTS.length} アカウント`);

  const all = [...feedResults.flat(), ...bskyResults.flat()];

  // 重複 URL を除去 → 期間で絞る → AI 関連のみ
  const seen = new Set();
  const items = [];
  for (const it of all) {
    const key = it.url.split('?')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    if (it.publishedAt < cutoff) continue;
    if (!isAIRelated(it)) continue;
    items.push(it);
  }

  items.sort((a, b) => b.publishedAt - a.publishedAt);
  console.log(`  収集: 全 ${all.length} 件 → 期間内かつ AI 関連 ${items.length} 件`);
  return items;
}
