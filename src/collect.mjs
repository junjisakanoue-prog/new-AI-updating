// 収集 → クラスタリング → 裏取り判定 → 記事生成 → 保存 の一連を実行するエントリポイント。
// 毎朝 4:30 に Windows タスクスケジューラから叩かれる想定（scripts/register-task.ps1）。

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectItems } from './feeds.mjs';
import { clusterItems } from './cluster.mjs';
import { writeArticle } from './summarize.mjs';
import { translateMany } from './translate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const ARTICLES = path.join(DATA, 'articles');

function jstDateString(d = new Date()) {
  // JST 固定（毎朝 5:00 JST 基準の日付にしたいため）
  const jst = new Date(d.getTime() + 9 * 3600_000);
  return jst.toISOString().slice(0, 10);
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function main() {
  const started = Date.now();
  const date = jstDateString();
  console.log(`\n=== AI Daily Brief: ${date} ===`);

  await mkdir(ARTICLES, { recursive: true });

  // まず広めに取得しておき、期間を狭い順に試す。
  // 静かな日（週末・祝日）は 36h だと裏取りが成立しないため、段階的に広げる。
  const MAX_WINDOW = 96;
  const pool = await collectItems(MAX_WINDOW);
  if (!pool.length) {
    console.error('収集結果が 0 件でした。ネットワークかフィード側の問題の可能性があります。');
    process.exitCode = 1;
    return;
  }

  const MIN_TOPICS = 3;
  let items = pool;
  let clusters = [];
  let verified = [];
  let windowHours = MAX_WINDOW;

  for (const w of [36, 48, 72, MAX_WINDOW]) {
    const cutoff = Date.now() - w * 3600_000;
    const subset = pool.filter((i) => i.publishedAt >= cutoff);
    const c = clusterItems(subset);
    const v = c.filter((x) => x.verified);
    console.log(`  直近 ${w}h: ${subset.length} 件 → クラスタ ${c.length}（裏取り済み ${v.length}）`);
    items = subset; clusters = c; verified = v; windowHours = w;
    if (v.length >= MIN_TOPICS) break;
  }

  const unverified = clusters.filter((c) => !c.verified);
  console.log(`採用: 直近 ${windowHours}h / 裏取り済み ${verified.length} 件`);

  console.log('記事を生成中...');
  const article = await writeArticle(verified.slice(0, 12), date);
  if (!article) {
    console.error('裏取りの取れたトピックがなく、記事を生成できませんでした。');
    process.exitCode = 1;
    return;
  }

  // 出典リストは記事から独立して保持する（[n] 参照とセクションを紐付けるため）
  const topics = verified.slice(0, 12).map((c, i) => ({
    index: i + 1,
    headline: c.title,
    confidence: c.confidence,
    domainCount: c.domainCount,   // 裏取りに数えた編集済みソースのドメイン数
    socialCount: c.socialCount,   // SNS での言及数（話題性の目安。裏取りには使わない）
    sourceCount: c.sourceCount,
    sources: c.items.map((it, n) => ({
      n: n + 1,
      source: it.source,
      title: it.title,
      url: it.url,
      domain: it.domain,
      tier: it.sourceTier,
      kind: it.sourceKind,
      publishedAt: new Date(it.publishedAt).toISOString(),
    })),
  }));

  // 記事が実際に取り上げたトピックだけを残す（件数表示の不一致を防ぐ）。
  // index は本文の [n] 参照と対応しているため、値は振り直さない。
  const usedIndexes = new Set((article.sections ?? []).map((s) => s.topic_index));
  const usedTopics = topics.filter((t) => usedIndexes.has(t.index));

  // 「裏取り待ち」欄も日本語で表示する（サイト上に英語を残さない）
  const watch = unverified.slice(0, 8);
  console.log('  裏取り待ちの見出しを日本語化中...');
  const watchJa = await translateMany(watch.map((c) => c.title));

  const record = {
    date,
    generatedAt: new Date().toISOString(),
    generator: article.generator,
    title: article.title,
    threeLineSummary: article.three_line_summary,
    lead: article.lead,
    sections: article.sections,
    xPosts: article.x_posts,
    topics: usedTopics,
    watchlist: watch.map((c, i) => ({
      headline: watchJa[i],
      headlineOriginal: c.title,
      source: c.items[0].source,
      url: c.items[0].url,
      note: '単一ソースのみ。裏取り待ち。',
    })),
    stats: {
      windowHours,
      itemsCollected: items.length,
      itemsInPool: pool.length,
      clusters: clusters.length,
      verifiedTopics: verified.length,
      unverifiedTopics: unverified.length,
      elapsedMs: Date.now() - started,
    },
  };

  await writeFile(path.join(ARTICLES, `${date}.json`), JSON.stringify(record, null, 2), 'utf8');

  // アーカイブ索引を更新
  const indexPath = path.join(DATA, 'index.json');
  const index = await readJson(indexPath, { articles: [] });
  index.articles = index.articles.filter((a) => a.date !== date);
  index.articles.unshift({
    date,
    title: record.title,
    threeLineSummary: record.threeLineSummary,
    topicCount: usedTopics.length,
    generatedAt: record.generatedAt,
  });
  index.articles.sort((a, b) => b.date.localeCompare(a.date));
  index.updatedAt = new Date().toISOString();
  await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');

  console.log(`\n✓ 保存: data/articles/${date}.json`);
  console.log(`  タイトル: ${record.title}`);
  console.log(`  トピック: ${usedTopics.length} 件 / 生成: ${record.generator}`);
  console.log(`  所要: ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
}

main().catch((err) => {
  console.error('収集処理が失敗しました:', err);
  process.exitCode = 1;
});
