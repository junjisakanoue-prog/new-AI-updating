// 英語テキストの日本語化。
// 優先順位:
//   1. Claude（ANTHROPIC_API_KEY がある場合）— 文脈を踏まえた自然な訳
//   2. MyMemory API（無料・キー不要）— 見出しなど短文向け
//   3. 原文のまま（どちらも失敗した場合）
// 訳文は data/.translation-cache.json にキャッシュし、再実行時の無駄な通信を避ける。

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_PATH = path.join(ROOT, 'data', '.translation-cache.json');

let cache = null;
let cacheDirty = false;

async function loadCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(CACHE_PATH, 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

export async function saveCache() {
  if (!cacheDirty || !cache) return;
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  cacheDirty = false;
}

/** 日本語がすでに含まれていれば翻訳不要とみなす */
export function isJapanese(text) {
  return /[぀-ゟ゠-ヿ一-鿿]/.test(String(text ?? ''));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * MyMemory 無料 API。1 リクエストあたり 500 バイト制限があるため、
 * 長文は文単位に分割して投げ、結果を連結する。
 */
async function translateViaMyMemory(text) {
  const chunks = splitForMyMemory(text);
  const out = [];

  for (const chunk of chunks) {
    // 匿名利用。de=（連絡先メール）は妥当な形式でないと
    // 翻訳文の代わりに "INVALID EMAIL PROVIDED" が返るため付けない。
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|ja`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
    const json = await res.json();
    const t = json?.responseData?.translatedText;
    if (!t) throw new Error('MyMemory 空応答');

    // MyMemory は失敗時も HTTP 200 で、エラー文言を「訳文」として返してくる。
    // そのまま採用すると記事本文に英語のエラーメッセージが載るので必ず弾く。
    if (json.responseStatus && Number(json.responseStatus) !== 200) {
      throw new Error(`MyMemory status ${json.responseStatus}`);
    }
    if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID EMAIL|NO QUERY SPECIFIED|USAGE LIMIT/i.test(t)) {
      throw new Error(`MyMemory エラー応答: ${t.slice(0, 40)}`);
    }
    out.push(t);
    await sleep(300); // レート制限対策
  }
  return out.join('');
}

/** 500 バイト以内になるよう文単位で分割する */
function splitForMyMemory(text, limit = 450) {
  const sentences = String(text).split(/(?<=[.!?])\s+/);
  const chunks = [];
  let buf = '';
  for (const s of sentences) {
    const candidate = buf ? `${buf} ${s}` : s;
    if (Buffer.byteLength(candidate, 'utf8') > limit && buf) {
      chunks.push(buf);
      buf = s;
    } else {
      buf = candidate;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

/**
 * 文字列配列をまとめて日本語化する。
 * すでに日本語のもの・空文字はそのまま返す。
 */
export async function translateMany(texts) {
  await loadCache();
  const results = [...texts];

  for (let i = 0; i < texts.length; i++) {
    const src = String(texts[i] ?? '').trim();
    if (!src || isJapanese(src)) continue;

    if (cache[src]) {
      results[i] = cache[src];
      continue;
    }

    try {
      const ja = await translateViaMyMemory(src);
      results[i] = ja;
      cache[src] = ja;
      cacheDirty = true;
    } catch (err) {
      console.warn(`  [翻訳スキップ] ${err.message}: ${src.slice(0, 40)}…`);
      results[i] = src; // 失敗時は原文のまま（表示は途切れさせない）
    }
  }

  await saveCache();
  return results;
}

export async function translateOne(text) {
  return (await translateMany([text]))[0];
}
