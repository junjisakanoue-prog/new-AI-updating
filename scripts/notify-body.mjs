// 通知メールの件名と本文を組み立てて標準出力に書く。
//   1 行目 = 件名
//   2 行目以降 = 本文
// GitHub Actions のメール送信ステップから呼ばれる。

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = process.env.SITE_URL ?? 'https://junjisakanoue-prog.github.io/new-AI-updating/';

function jstDate(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

const date = jstDate();
const article = JSON.parse(
  await readFile(path.join(ROOT, 'data', 'articles', `${date}.json`), 'utf8'),
);

const lines = [];

// 件名（1 行目）
lines.push(`【AI Daily Brief】${date} — ${article.topics?.length ?? 0}件`);

// 本文
lines.push('');
lines.push('■ 三行要約');
(article.threeLineSummary ?? []).forEach((s, i) => lines.push(`${i + 1}. ${s}`));

lines.push('');
lines.push('■ 今日のトピック');
for (const s of article.sections ?? []) {
  const t = (article.topics ?? []).find((x) => x.index === s.topic_index);
  const badge = t
    ? (t.confidence === 'primary' ? '[一次情報]' : `[${t.domainCount}ソースで確認]`)
    : '';
  lines.push('');
  lines.push(`● ${s.heading} ${badge}`);
  if (s.plain_explanation) lines.push(`  ${s.plain_explanation}`);
}

if (article.xPosts?.length) {
  lines.push('');
  lines.push('■ X 投稿案');
  article.xPosts.forEach((p) => lines.push(`・${p}`));
}

lines.push('');
lines.push('───────────────');
lines.push(`続きを読む: ${SITE_URL}article.html?date=${date}`);
lines.push(`ダッシュボード: ${SITE_URL}`);
lines.push('');
lines.push(`収集 ${article.stats?.itemsCollected ?? '—'} 件 / 直近 ${article.stats?.windowHours ?? '—'} 時間 / 生成 ${article.generator ?? ''}`);

// 末尾の改行は必須。
// これが無いと、呼び出し側でヒアドキュメントの終端記号が
// 最終行に連結してしまい "Matching delimiter not found" になる。
process.stdout.write(`${lines.join('\n')}\n`);
