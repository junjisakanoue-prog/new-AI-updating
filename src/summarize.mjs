// クラスタ群を 1 本の日本語記事にまとめる。
// ANTHROPIC_API_KEY があれば Claude で執筆し、無ければ抽出型のフォールバックで生成する。

import Anthropic from '@anthropic-ai/sdk';
import { translateMany } from './translate.mjs';
import { buildPlainExplanation } from './explain.mjs';

const MODEL = 'claude-opus-4-8';

const SYSTEM = `あなたは AI 業界を追う日本語のテックエディターです。
複数ソースで裏取り済みのトピック群を受け取り、1 本の読み物としてまとめた記事を書きます。

厳守事項:
- 出力はすべて日本語。英語ソースの見出しや本文は日本語に翻訳して書く。
  ただし製品名・企業名・モデル名（GPT-5、Claude、Gemini 等）は原語のままでよい。
- 与えられた入力に書かれていない事実を絶対に足さない。推測は「〜とみられる」等と明示する。
- 各トピックについて、何が新しいのか・なぜ重要なのかを実務者目線で書く。
- 誇張しない。「革命的」「衝撃」のような煽り表現は使わない。
- 読者は AI ツールを使い始めたばかりの初心者。専門用語をそのまま使わず、
  必要なら「これは〜のこと」と補足する。ツールの実利用にどう効くかを重視する。
- 各セクションには plain_explanation（「つまり、」で始まる 100〜200 字の
  初心者向け解説）を必ず付ける。背景知識の補足を目的とし、本文の要約にはしない。
- 本文中で言及した内容には [1] [2] のような出典番号を付ける（番号は入力の sources の番号に対応）。
- confidence が unverified のトピックは本文に含めない。
- confidence の意味: high / medium-high / medium = 独立した複数ソースで裏取り済み、
  primary = 開発元自身の公式発表（単独でも事実として確定）。`;

/** Claude に渡す入力を組み立てる */
function buildPayload(clusters) {
  return clusters.map((c, ci) => ({
    topic_index: ci + 1,
    headline: c.title,
    confidence: c.confidence,
    independent_domains: c.domainCount,
    sources: c.items.map((it, i) => ({
      n: i + 1,
      source: it.source,
      title: it.title,
      url: it.url,
      excerpt: it.summary.slice(0, 600),
      published: new Date(it.publishedAt).toISOString(),
    })),
  }));
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: '記事全体のタイトル（40字以内）' },
    three_line_summary: {
      type: 'array',
      items: { type: 'string' },
      description: '記事全体の三行要約。各行 60 字以内。',
    },
    lead: { type: 'string', description: '導入文（2〜3 文）' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          body: { type: 'string', description: 'Markdown 段落。出典は [1] 形式で示す。' },
          why_it_matters: { type: 'string', description: '実務者にとっての意味を 1〜2 文で' },
          plain_explanation: {
            type: 'string',
            description:
              'AI 初心者向けのかみ砕いた説明。必ず「つまり、」で書き始める。100〜200 字。'
              + '専門用語が出てきたら、その用語自体を日常的な言葉で説明する。'
              + '記事本文の繰り返しではなく、前提知識の補足と「自分にどう関係するか」を書く。',
          },
          topic_index: { type: 'integer', description: '対応する入力トピックの番号' },
        },
        required: ['heading', 'body', 'why_it_matters', 'plain_explanation', 'topic_index'],
        additionalProperties: false,
      },
    },
    x_posts: {
      type: 'array',
      items: { type: 'string' },
      description: 'X にそのまま投稿できる二次情報ポスト案。各 130 字以内、ハッシュタグなし、事実ベース。3 本。',
    },
  },
  required: ['title', 'three_line_summary', 'lead', 'sections', 'x_posts'],
  additionalProperties: false,
};

export async function writeArticle(clusters, dateLabel) {
  const usable = clusters.filter((c) => c.verified);
  if (!usable.length) return null;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await writeWithClaude(usable, dateLabel);
    } catch (err) {
      console.warn(`  [warn] Claude 執筆に失敗、フォールバックを使用: ${err.message}`);
    }
  } else {
    console.log('  ANTHROPIC_API_KEY 未設定 → 抽出型フォールバック（無料翻訳付き）で生成します');
  }
  return writeFallback(usable, dateLabel);
}

async function writeWithClaude(clusters, dateLabel) {
  const client = new Anthropic();
  const payload = buildPayload(clusters);

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    messages: [{
      role: 'user',
      content: `${dateLabel} 時点の AI 関連トピックです。裏取り済みのものだけを使って、日本語の記事を 1 本書いてください。

重要なトピックから順に、3〜7 個のセクションにまとめてください。関連するトピック同士は 1 セクションに統合して構いません。

${JSON.stringify(payload, null, 2)}`,
    }],
  });

  const text = res.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('空のレスポンス');
  const article = JSON.parse(text);
  return { ...article, generator: `claude:${MODEL}` };
}

/**
 * API キーなしでも動く抽出型サマリ。1 文目 + 見出しを組み合わせて記事の形にする。
 * 英語ソースの見出し・抜粋は無料翻訳 API で日本語化してから組み立てる。
 */
async function writeFallback(clusters, dateLabel) {
  const top = clusters.slice(0, 7);

  // 翻訳対象（見出しと抜粋）をまとめて 1 回で処理する
  const headlines = top.map((c) => (c.items.find((it) => it.sourceTier === 1) ?? c.items[0]).title);
  const excerpts = top.map((c) => {
    const primary = c.items.find((it) => it.sourceTier === 1) ?? c.items[0];
    return firstSentences(primary.summary, 3) || primary.title;
  });

  console.log(`  ${headlines.length} 件の見出しと抜粋を日本語化中...`);
  const [jaHeadlines, jaExcerpts] = await Promise.all([
    translateMany(headlines),
    translateMany(excerpts),
  ]);

  const sections = top.map((c, i) => {
    const primary = c.items.find((it) => it.sourceTier === 1) ?? c.items[0];
    const excerpt = jaExcerpts[i];
    // 同じ媒体の続報が並ぶと冗長なので、初出以外はドメイン単位で 1 件に絞る
    const seenDomains = new Set([primary.domain]);
    const others = c.items
      .map((it, n) => ({ it, n }))
      .filter(({ it }) => {
        if (seenDomains.has(it.domain)) return false;
        seenDomains.add(it.domain);
        return true;
      })
      .slice(0, 3)
      .map(({ it, n }) => `${it.source} [${n + 1}]`)
      .join('、');

    const basis = c.confidence === 'primary'
      ? `開発元の公式発表（${primary.source}）に基づく。`
      : `独立した ${c.domainCount} ソースで確認済み（確度: ${labelConfidence(c.confidence)}）。`;
    const body = `${excerpt}\n\n初出は ${primary.source} [1]。${others ? `${others} でも同内容が報じられている。` : ''}`;

    return {
      heading: jaHeadlines[i],
      body,
      why_it_matters: basis,
      // 用語辞書ベースの初心者向け解説（API キー不要）
      plain_explanation: buildPlainExplanation({
        heading: jaHeadlines[i],
        body: `${excerpt} ${primary.title} ${primary.summary}`,
        confidence: c.confidence,
      }),
      topic_index: i + 1,
    };
  });

  return {
    title: `AI 最新まとめ ${dateLabel}`,
    three_line_summary: jaHeadlines.slice(0, 3).map((h) => truncate(h, 60)),
    lead: `${dateLabel} 時点で、複数ソースの裏取りが取れた AI 関連トピック ${top.length} 件をまとめた。`,
    sections,
    x_posts: top.slice(0, 3).map((c, i) => {
      const tag = c.confidence === 'primary' ? '公式発表' : `${c.domainCount}ソースで確認`;
      return truncate(`${jaHeadlines[i]}（${tag}）`, 130);
    }),
    generator: 'fallback:extractive+mymemory',
  };
}

function firstSentences(text, n) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const parts = clean.split(/(?<=[.!?。！？])\s+/).slice(0, n);
  return truncate(parts.join(' '), 400);
}

function truncate(s, n) {
  const t = String(s ?? '').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function labelConfidence(c) {
  return { high: '高', 'medium-high': 'やや高', medium: '中', primary: '一次情報', unverified: '未確認' }[c] ?? c;
}
