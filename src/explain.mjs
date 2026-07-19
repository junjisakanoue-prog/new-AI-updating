// 「つまり…」欄（初心者向けのかみ砕き説明）を組み立てる。
// ANTHROPIC_API_KEY があれば Claude が書くが、無い場合はここで
// 用語辞書 + トピック種別のテンプレートから 100〜200 字程度の説明を生成する。

import { detectTerms } from './glossary.mjs';

/** トピックの性質を推定する（説明の書き出しを変えるため） */
function classify(text) {
  const t = String(text ?? '').toLowerCase();
  if (/リリース|発表|登場|launch|releas|announce|introduc|公開|提供開始/.test(t)) return 'release';
  if (/値下げ|価格|料金|無料|pricing|price|cost|プラン|subscription|サブスク/.test(t)) return 'pricing';
  if (/訴訟|規制|法|lawsuit|regulat|policy|sue|裁判|方針/.test(t)) return 'policy';
  if (/研究|論文|paper|research|study|arxiv|実験/.test(t)) return 'research';
  if (/セキュリティ|脆弱性|security|incident|attack|漏洩|流出/.test(t)) return 'security';
  if (/提携|買収|投資|資金|funding|acquisi|partnership|億ドル|調達/.test(t)) return 'business';
  return 'general';
}

const OPENERS = {
  release: '新しい機能やモデルが使えるようになった、という話です。',
  pricing: 'AIを使うときの値段や条件が変わる、という話です。',
  policy: 'AIをめぐるルールや法的な争いの話です。',
  research: '研究段階の成果で、すぐ製品になるとは限らない話です。',
  security: 'AIの安全性やリスクに関する話です。',
  business: '企業どうしのお金や提携の動きに関する話です。',
  general: 'AI業界の動きに関する話です。',
};

const CLOSERS = {
  release: '実際に触れるようになったタイミングで試すと、違いが分かりやすいはずです。',
  pricing: '普段使っているツールの請求や使える範囲に影響する可能性があります。',
  policy: '結果によっては、使えるサービスや条件が変わることがあります。',
  research: '今すぐ影響はありませんが、今後の製品に反映されていく可能性があります。',
  security: '自分が使っているサービスが該当するかどうかを確認しておくと安心です。',
  business: '業界の力関係が変わると、使えるツールの選択肢にも影響してきます。',
  general: '今の時点では、こういう動きがあると知っておけば十分です。',
};

/**
 * 1 セクション分の「つまり…」テキストを作る。
 * 目標 100〜200 字。用語が検出できればその解説を挟む。
 */
export function buildPlainExplanation({ heading, body, confidence }) {
  const source = `${heading} ${body}`;
  const kind = classify(source);
  const terms = detectTerms(source, 2);

  const parts = [`つまり、${OPENERS[kind]}`];

  for (const t of terms) {
    parts.push(`記事に出てくる「${t.label}」は、${t.plain}。`);
  }

  // 用語が拾えなかった場合は確度の説明で字数を補い、読者に判断材料を残す
  if (!terms.length) {
    parts.push(
      confidence === 'primary'
        ? 'これは開発元自身が公式に発表した内容なので、情報としては確定しています。'
        : '複数のメディアが同じ内容を報じているため、情報としては比較的確かです。',
    );
  }

  parts.push(CLOSERS[kind]);

  let text = parts.join('');

  // 200 字を超えたら用語解説を 1 件に減らして作り直す
  if (text.length > 200 && terms.length > 1) {
    text = [`つまり、${OPENERS[kind]}`, `記事に出てくる「${terms[0].label}」は、${terms[0].plain}。`, CLOSERS[kind]].join('');
  }
  // それでも長い場合は末尾を落とす
  if (text.length > 220) text = `${text.slice(0, 209)}…`;

  return text;
}
