// 初心者向けの用語辞書。
// 記事本文に出てきた専門用語を検出し、「つまり…」欄の材料にする。
// ANTHROPIC_API_KEY が無くても解説を出せるようにするための土台。
//
// term:  検出用のキーワード（小文字・表記ゆれを列挙）
// label: 表示名
// plain: 初心者向けの言い換え（1 文・体言止めしない）

export const GLOSSARY = [
  {
    label: 'LLM（大規模言語モデル）',
    terms: ['llm', '大規模言語モデル', 'large language model', 'language model'],
    plain: 'ChatGPT や Claude の「頭脳」にあたる、大量の文章を学習して言葉を扱えるようにしたプログラムのことです',
  },
  {
    label: 'ファインチューニング',
    terms: ['fine-tun', 'ファインチューニング', '微調整', 'finetun'],
    plain: '出来上がったAIに追加で学習させて、特定の用途向けに調整すること。専門学校に通わせるようなイメージです',
  },
  {
    label: 'パラメータ',
    terms: ['パラメータ', 'parameter', 'パラメーター', '27b', '70b', '405b'],
    plain: 'AIの「脳の大きさ」を表す数値。多いほど賢い傾向があるが、動かすのに必要なパソコンの性能も上がります',
  },
  {
    label: 'オープンウェイト / オープンソースモデル',
    terms: ['オープンウェイト', 'open-weight', 'open weight', 'オープンソースモデル', 'open-source model'],
    plain: 'AIの中身が公開されていて、誰でも自分のパソコンやサーバーで動かせるモデルのことです',
  },
  {
    label: '推論（インファレンス）',
    terms: ['推論', 'inference', 'reasoning model', '推論モデル'],
    plain: 'AIが実際に考えて答えを出す処理のこと。ここが速い・安いほど実用しやすくなります',
  },
  {
    label: 'エージェント',
    terms: ['エージェント', 'agent', 'agentic'],
    plain: 'AIが自分でツールを使い、複数の手順を順番にこなして作業を代行する仕組みのことです',
  },
  {
    label: 'マルチモーダル',
    terms: ['マルチモーダル', 'multimodal', 'multi-modal'],
    plain: '文章だけでなく画像・音声・動画もまとめて扱えることです',
  },
  {
    label: 'RAG（検索拡張生成）',
    terms: ['rag', '検索拡張'],
    plain: 'AIが答える前に社内文書などを検索し、その内容を根拠にして回答する仕組み。嘘を減らす狙いがあります',
  },
  {
    label: 'トークン',
    terms: ['トークン', 'token'],
    plain: 'AIが文章を扱うときの文字のかたまり。利用料金はたいていこのトークン数で決まります',
  },
  {
    label: 'ベンチマーク',
    terms: ['ベンチマーク', 'benchmark', 'スコア'],
    plain: 'AIの性能を測るための共通テスト。学力テストの偏差値のようなものです',
  },
  {
    label: 'MoE（専門家混合）',
    terms: ['moe', 'mixture of experts', '専門家混合'],
    plain: 'AI内部に複数の「専門家」を持たせ、質問に応じて必要な担当だけを動かして効率化する構造のことです',
  },
  {
    label: '量子化',
    terms: ['量子化', 'quantiz'],
    plain: 'AIのデータを軽く圧縮して、性能を大きく落とさずに普通のパソコンでも動くようにする技術です',
  },
  {
    label: 'GPU',
    terms: ['gpu', 'nvidia', 'h100', 'blackwell'],
    plain: 'AIの計算に使う高性能な半導体。AI開発ではこれの確保がコストと速度を左右します',
  },
  {
    label: 'API',
    terms: ['api'],
    plain: '自分のアプリやサービスからAIを呼び出して使うための接続口のことです',
  },
  {
    label: 'コンテキストウィンドウ',
    terms: ['コンテキスト', 'context window', 'context length'],
    plain: 'AIが一度に読み込んで覚えていられる文章の量。大きいほど長い資料を丸ごと渡せます',
  },
  {
    label: '拡散モデル（画像生成）',
    terms: ['diffusion', '拡散モデル', 'ディフューザー', '画像生成', '動画生成'],
    plain: 'ノイズから少しずつ絵を描き起こしていく仕組みで、画像や動画を生成するAIの主流方式です',
  },
];

/** 本文に含まれる用語を検出して返す（最大 limit 件、出現順） */
export function detectTerms(text, limit = 2) {
  const hay = String(text ?? '').toLowerCase();
  const hits = [];
  for (const entry of GLOSSARY) {
    const pos = entry.terms
      .map((t) => hay.indexOf(t.toLowerCase()))
      .filter((i) => i >= 0);
    if (pos.length) hits.push({ entry, at: Math.min(...pos) });
  }
  hits.sort((a, b) => a.at - b.at);
  return hits.slice(0, limit).map((h) => h.entry);
}
