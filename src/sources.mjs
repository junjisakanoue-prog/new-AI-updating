// 情報ソース定義。
// tier: 1 = 一次情報 / 大手技術メディア（信頼度高）、2 = 業界メディア、3 = SNS・コミュニティ（要裏取り）
// 裏取りロジックは「異なる tier / 異なるドメインで 2 件以上」を必須にしている（cluster.mjs 参照）。

export const FEEDS = [
  // ---- 一次情報（開発元公式） ----
  // 注: Anthropic と Meta AI は公開 RSS を提供していないため、
  //     報道（TechCrunch 等）と X 経由で拾う設計にしている。
  { name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml', tier: 1, kind: 'official' },
  { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', tier: 1, kind: 'official' },
  { name: 'Google Research', url: 'https://research.google/blog/rss/', tier: 1, kind: 'official' },
  { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', tier: 1, kind: 'official' },
  { name: 'DeepMind Blog', url: 'https://deepmind.google/blog/rss.xml', tier: 1, kind: 'official' },
  { name: 'Mistral AI', url: 'https://mistral.ai/rss.xml', tier: 1, kind: 'official' },

  // ---- 海外テックメディア ----
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', tier: 1, kind: 'press' },
  { name: 'TechCrunch AI (tag)', url: 'https://techcrunch.com/tag/ai/feed/', tier: 1, kind: 'press' },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', tier: 1, kind: 'press' },
  { name: 'Ars Technica AI', url: 'https://arstechnica.com/ai/feed/', tier: 1, kind: 'press' },
  { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', tier: 2, kind: 'press' },
  { name: 'MIT Technology Review AI', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', tier: 1, kind: 'press' },
  { name: 'Wired AI', url: 'https://www.wired.com/feed/tag/ai/latest/rss', tier: 2, kind: 'press' },
  { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', tier: 2, kind: 'blog' },
  { name: 'Import AI', url: 'https://importai.substack.com/feed', tier: 2, kind: 'blog' },

  // ---- 日本語ソース（翻訳不要でそのまま使える） ----
  { name: 'ITmedia AI+', url: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml', tier: 1, kind: 'press', lang: 'ja' },
  { name: 'Publickey', url: 'https://www.publickey1.jp/atom.xml', tier: 2, kind: 'press', lang: 'ja' },
  { name: 'GIGAZINE', url: 'https://gigazine.net/news/rss_2.0/', tier: 2, kind: 'press', lang: 'ja' },
  { name: 'CNET Japan', url: 'https://japan.cnet.com/rss/index.rdf', tier: 2, kind: 'press', lang: 'ja' },

  // ---- 論文 ----
  { name: 'arXiv cs.AI', url: 'https://rss.arxiv.org/rss/cs.AI', tier: 2, kind: 'paper' },
  { name: 'arXiv cs.CL', url: 'https://rss.arxiv.org/rss/cs.CL', tier: 2, kind: 'paper' },

  // ---- SNS / コミュニティ（単独では採用しない。裏取り材料として使う） ----
  // Reddit は同時アクセスで 429 を返すため、feeds.mjs 側で直列＋リトライ処理をしている。
  { name: 'Hacker News (AI)', url: 'https://hnrss.org/newest?q=AI&points=50', tier: 3, kind: 'social' },
  { name: 'Hacker News (LLM)', url: 'https://hnrss.org/newest?q=LLM&points=30', tier: 3, kind: 'social' },
  { name: 'r/LocalLLaMA', url: 'https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day', tier: 3, kind: 'social', slow: true },
  { name: 'r/singularity', url: 'https://www.reddit.com/r/singularity/top/.rss?t=day', tier: 3, kind: 'social', slow: true },
  { name: 'Lobsters AI', url: 'https://lobste.rs/t/ai.rss', tier: 3, kind: 'social' },
];

// SNS は Bluesky を使う。
// X は公式 API が有料、RSS ブリッジ（rsshub / nitter）は実測で全滅だったため不採用。
// Bluesky の public API は認証不要・完全無料で、AI 関連の発信者も揃っている。
// ここに載せているハンドルは実在を確認済み。存在しないものは静かにスキップされる。
export const BLUESKY_ACCOUNTS = [
  'simonwillison.net',
  'emollick.bsky.social',
  'karpathy.bsky.social',
  'arxiv-cs-ai.bsky.social',
];

// AI 関連かどうかの判定に使うキーワード（汎用フィード混入対策）。
// 英語は単語境界で判定する。'ai' を単純な部分一致にすると
// said / email / available / chair などが全部ヒットしてしまうため。
export const AI_KEYWORDS_JA = [
  '生成ai', '人工知能', '機械学習', '大規模言語モデル', '深層学習', 'ディープラーニング',
  '画像生成', '自然言語', '推論モデル', 'チャットボット', '基盤モデル', 'エージェント',
];

export const AI_KEYWORDS = [
  'ai', 'artificial intelligence', 'llm', 'gpt', 'claude', 'gemini', 'llama',
  'openai', 'anthropic', 'deepmind', 'mistral', 'hugging face', 'huggingface',
  'transformer', 'neural', 'machine learning', 'agent', 'copilot', 'diffusion',
  'chatbot', 'inference', 'fine-tun', 'multimodal', 'rag', 'embedding',
  'nvidia', 'gpu', 'model', 'benchmark', 'open-source model', 'sora', 'midjourney',
  'stable diffusion', 'grok', 'qwen', 'deepseek', 'perplexity', 'cursor', 'devin',
];
