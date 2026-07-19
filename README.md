# AI Daily Brief

毎朝 5:00 までに AI 関連の最新情報を自動収集し、複数ソースで裏取りしたうえで
1 本の日本語記事にまとめるブラウザアプリ。

## 使い方

```bash
npm install
npm run collect     # 収集して記事を生成
npm run serve       # http://localhost:4173
```

毎朝 4:30 に自動実行するタスクを登録する（Windows）:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1
```

## スマホから見る（GitHub Pages）

PC の電源が入っていなくても、毎朝自動で更新されて外出先から読めます。

### 1. GitHub にリポジトリを作って push

```bash
# GitHub で空のリポジトリ new-AI-updating を作成してから
git remote add origin https://github.com/<ユーザー名>/new-AI-updating.git
git push -u origin main
```

> ⚠️ **公開リポジトリにすると、生成された記事はインターネット上に公開されます。**
> 人に見せたくない場合は Private リポジトリにしてください
> （Private でも GitHub Pages は使えますが、無料プランでは公開設定のみです。
> 完全に非公開にしたい場合は後述の「自宅 Wi-Fi 内だけで見る」を使ってください）

### 2. Pages を有効化

リポジトリの **Settings → Pages → Build and deployment → Source** を
**「GitHub Actions」** に変更します。

### 3. 初回実行

**Actions タブ → 「毎朝のAI情報収集とデプロイ」→ Run workflow** を押します。
2〜3 分でこの URL に公開されます。

```
https://<ユーザー名>.github.io/new-AI-updating/
```

以降は毎朝 4:00 JST に自動実行されます（Actions の cron は数分〜20 分ほど
遅延することがあるため、5:00 に対して 1 時間の余裕を取っています）。

### 4. スマホのホーム画面に追加

上記 URL をスマホで開き、

- **iPhone (Safari)**: 共有ボタン → 「ホーム画面に追加」
- **Android (Chrome)**: メニュー → 「ホーム画面に追加」

アプリのように全画面で開き、**一度読み込んだ記事は圏外でも読めます**
（Service Worker によるオフライン対応。記事データは常に最新を優先取得します）。

### Claude で記事を書かせる場合（任意）

リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で
`ANTHROPIC_API_KEY` を登録すると、記事の文章を Claude が執筆します。
未登録でも無料経路で動作します。

## 自宅 Wi-Fi 内だけで見る（PC 必須）

`npm run serve` を実行すると、同じ Wi-Fi 内からアクセスできる URL が表示されます。

```
AI Daily Brief → http://localhost:4173
同一 Wi-Fi 内から  → http://192.168.x.x:4173
```

スマホのブラウザでその URL を開いてください。初回は Windows Defender
ファイアウォールの許可ダイアログで「プライベートネットワーク」を許可します。
PC がスリープすると見られなくなります。

## 環境変数

| 変数 | 必須 | 効果 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 任意 | Claude が記事を執筆・翻訳する。未設定時は無料経路で生成 |
| `PORT` | 任意 | サーバーのポート（既定 4173） |

**キーなしで完全に動作します。** 情報取得はすべて無料・認証不要の経路のみを
使っています。`ANTHROPIC_API_KEY` を設定すると記事の文章品質が上がりますが、
必須ではありません。

## 日本語化

サイト表示は全て日本語です。取得経路は 2 種類あります。

1. **日本語ソースはそのまま使用**（ITmedia AI+ / Publickey / GIGAZINE / CNET Japan）
2. **英語ソースは翻訳して表示** — `ANTHROPIC_API_KEY` があれば Claude、
   無ければ **MyMemory API**（無料・キー不要）で日本語化します。

翻訳結果は `data/.translation-cache.json` にキャッシュされ、再実行時は
再翻訳しません。出典リンクとメディア名は原語（英語）のまま表示します。

## 初心者向け「かんたん解説」

各トピックに、「つまり、」で始まる 100〜200 字のかみ砕いた説明が自動で付きます。
本文の要約ではなく、**前提知識の補足と「自分にどう関係するか」** を書く欄です。

生成方法は 2 通りあります。

- `ANTHROPIC_API_KEY` あり → Claude が文脈に応じて執筆
- キーなし → `src/glossary.mjs` の用語辞書（LLM、ファインチューニング、
  パラメータ、MoE、量子化など 16 語）から自動生成

用語を追加したい場合は `src/glossary.mjs` に 1 エントリ足すだけです。
`plain` は「です・ます」で終わる完結した文にしてください
（テンプレート側では語尾を補いません）。

## 裏取りのルール

これが本アプリの中核です。**単独ソースの情報は記事本文に載りません。**

| 判定 | 条件 | 記事掲載 |
|---|---|---|
| `high` | 独立した編集済みソース 3 ドメイン以上 | ○ |
| `medium-high` | 独立した 2 ドメイン以上 + 大手/一次情報を含む | ○ |
| `medium` | 独立した 2 ドメイン以上 | ○ |
| `primary` | 開発元自身の公式発表（発表自体が事実） | ○ |
| `unverified` | 上記以外（単独ソースのみ） | × 「裏取り待ち」欄へ |

重要な設計判断が 2 つあります。

1. **単独の報道記事は裏取り済みとみなしません。** TechCrunch だけが報じている
   段階の話は、大手であっても本文には載せず「裏取り待ち」に回します。
2. **HN / Reddit / Bluesky は裏取りに数えません。** これらは「同じ記事への
   リンクが複数並ぶ」だけで独立検証にならないためです。話題性のシグナル
   （SNS言及数）としては使い、記事のランキングには反映させます。

## 収集ウィンドウ

既定は直近 36 時間ですが、裏取りが 3 件に満たない場合は
48h → 72h → 96h と自動的に広げます。週末や祝日は新規記事が少なく、
36 時間では裏取りが成立しないことが実際に多いためです。
採用したウィンドウは記事の `stats.windowHours` に記録されます。

## 構成

```
src/
  sources.mjs    情報ソース定義（RSS フィード / X アカウント）
  feeds.mjs      取得と RSS/Atom パース（依存なし・429 リトライ付き）
  cluster.mjs    トピックのクラスタリングと裏取り判定
  summarize.mjs  記事執筆（Claude / フォールバック）
  glossary.mjs   初心者向け用語辞書
  explain.mjs    「かんたん解説」欄の組み立て
  translate.mjs  日本語化（Claude / MyMemory / キャッシュ）
  collect.mjs    収集パイプラインのエントリポイント
  server.mjs     静的配信 + JSON API
public/          ダッシュボードと記事ページ
  hero.js        トップのヒーローイラスト（インライン SVG・外部通信なし）
data/
  index.json     アーカイブ索引
  articles/      YYYY-MM-DD.json（1 日 1 本）
```

## SNS について

**X（Twitter）は使っていません。** 公式 API が有料で、無料の RSS ブリッジ
（rsshub / nitter）は実測で 0/10 件と全滅だったためです。

代わりに **Bluesky の公開 API** を使っています。認証不要・完全無料で、
実測 4/4 アカウント取得できています。ハンドルは `src/sources.mjs` の
`BLUESKY_ACCOUNTS` で追加できます（実在しないものは静かにスキップされます）。

## 既知の制約

- **Anthropic と Meta AI は公開 RSS を提供していません。** 報道（ITmedia、
  TechCrunch 等）と Bluesky 経由で拾う設計にしています。
- Reddit は並列アクセスで 429 を返すため直列取得＋リトライにしていますが、
  それでも失敗することがあります。1 ソース落ちても収集は続行します。
- MyMemory は無料枠に 1 日あたりの上限があります。上限に達した場合は
  その項目のみ原文（英語）のまま表示され、処理は継続します。
