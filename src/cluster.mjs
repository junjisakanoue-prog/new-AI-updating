// 収集した item を「トピック」にまとめ、裏取り（複数ソース確認）の状態を判定する。

const STOPWORDS = new Set(`
a an the and or but if then than that this these those with without within into onto from for to of in on at by as is are was were be been being
it its it's we our you your they their he she his her i me my
new now more most just also very can could would should will may might must
how what when where why who which
says say said report reports reported new latest update updates announce announced announcement
via ai llm model models
`.trim().split(/\s+/));

/** タイトルなどから比較用のキーワード集合を作る */
function keywords(text) {
  const tokens = String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return new Set(tokens);
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** 固有名詞っぽい語（大文字始まり・製品名）を抽出。クラスタ判定の補強に使う。 */
function entities(text) {
  const found = new Set();
  const known = ['gpt', 'claude', 'gemini', 'llama', 'qwen', 'deepseek', 'mistral', 'grok', 'sora', 'openai', 'anthropic', 'deepmind', 'nvidia', 'meta', 'google', 'microsoft', 'apple', 'amazon', 'perplexity', 'cursor', 'copilot'];
  const lower = String(text).toLowerCase();
  for (const k of known) if (lower.includes(k)) found.add(k);
  // バージョン付き製品名（例: gpt-5, claude 4.8, llama 4）
  for (const m of lower.matchAll(/\b([a-z]{3,12})[\s-]?(\d+(?:\.\d+)?)\b/g)) {
    if (known.includes(m[1])) found.add(`${m[1]}${m[2]}`);
  }
  return found;
}

const SIM_THRESHOLD = 0.28;

/**
 * 貪欲法でクラスタリング。新しい順に走査し、既存クラスタと十分似ていれば合流。
 * @param {Array} items
 */
export function clusterItems(items) {
  const clusters = [];

  for (const item of items) {
    const kw = keywords(`${item.title} ${item.summary.slice(0, 200)}`);
    const ents = entities(`${item.title} ${item.summary.slice(0, 200)}`);

    let best = null;
    let bestScore = 0;
    for (const c of clusters) {
      const base = jaccard(kw, c.keywords);
      let score = base;
      // 同じ固有名詞を共有していれば加点（言い回しが違っても同一トピックとみなす）。
      // ただし語の重なりが全く無い場合に加点すると「Google」だけで無関係な記事が
      // 合流してしまうため、最低限の類似がある場合に限る。
      if (base >= 0.10) {
        let sharedEnt = 0;
        for (const e of ents) if (c.entities.has(e)) sharedEnt++;
        if (sharedEnt) score += 0.10 * Math.min(sharedEnt, 3);
      }
      if (score > bestScore) { bestScore = score; best = c; }
    }

    if (best && bestScore >= SIM_THRESHOLD) {
      best.items.push(item);
      for (const k of kw) best.keywords.add(k);
      for (const e of ents) best.entities.add(e);
    } else {
      clusters.push({ items: [item], keywords: kw, entities: ents });
    }
  }

  return clusters.map(finalizeCluster).sort((a, b) => b.score - a.score);
}

/**
 * 裏取り判定。
 * - verified          : 独立した 2 ドメイン以上、または tier1 の一次情報を含む
 * - single-source     : 1 ソースのみ。記事本文には採用せず「未確認」枠に回す
 */
function finalizeCluster(c) {
  const items = c.items.sort((a, b) => a.sourceTier - b.sourceTier || b.publishedAt - a.publishedAt);
  const domains = new Set(items.map((i) => i.domain));
  const hasPrimary = items.some((i) => i.sourceTier === 1);
  const socialCount = items.filter((i) => i.sourceKind === 'social').length;
  // 一次情報 = 発表元本人の公式ブログ。発表そのものが事実なので単独でも確定として扱える。
  const isOfficial = items.some((i) => i.sourceKind === 'official');

  // 裏取りに数えるのは編集済みソース（公式発表・報道・論文）のみ。
  // HN や Reddit は「同じ記事へのリンク」が複数並ぶだけで独立検証にならないため、
  // 話題性のシグナルとしては使うが、裏取りの根拠にはしない。
  const editorialDomains = new Set(
    items.filter((i) => i.sourceKind !== 'social').map((i) => i.domain),
  );

  // 裏取りの原則: 独立した編集済み 2 ドメイン以上。例外は公式発表のみ。
  const verified = editorialDomains.size >= 2 || isOfficial;

  let confidence;
  if (editorialDomains.size >= 3) confidence = 'high';
  else if (editorialDomains.size >= 2 && hasPrimary) confidence = 'medium-high';
  else if (editorialDomains.size >= 2) confidence = 'medium';
  else if (isOfficial) confidence = 'primary';
  else confidence = 'unverified';

  // ランキングスコア：ソース数・独立ドメイン数・一次情報の有無・新しさ
  const hoursOld = (Date.now() - Math.max(...items.map((i) => i.publishedAt))) / 3600_000;
  const score =
    editorialDomains.size * 4 +
    items.length * 1.2 +
    (hasPrimary ? 4 : 0) +
    Math.min(socialCount, 3) * 1.5 + // SNS で話題なら注目度加点（裏取りには使わない）
    Math.max(0, 12 - hoursOld) * 0.3;

  return {
    id: slug(items[0].title),
    title: items[0].title,
    items,
    domains: [...domains],
    sourceCount: items.length,
    // 表示・判定に使うのは編集済みソースの数
    domainCount: editorialDomains.size,
    allDomainCount: domains.size,
    socialCount,
    hasPrimary,
    verified,
    confidence,
    score,
    latestAt: Math.max(...items.map((i) => i.publishedAt)),
  };
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60);
}
