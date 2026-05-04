// ─── BM25 lexical scoring ────────────────────────────────────────────
//
// Implements the standard Okapi BM25 formula on top of a code-aware
// tokenizer. Score(D, Q) for a query Q against document D:
//
//   Σ over q in Q of:
//     IDF(q) × (f(q,D) × (k1+1)) / (f(q,D) + k1 × (1 - b + b × |D|/avgdl))
//
// where IDF(q) = ln((N - n(q) + 0.5) / (n(q) + 0.5) + 1)
//
// k1 (term-frequency saturation) and b (length normalization) are the
// classical defaults used by Lucene/Elasticsearch.

const K1 = 1.2;
const B = 0.75;

/**
 * Code-aware tokenizer.
 *  - Splits on non-word chars
 *  - Splits camelCase → ["camel", "Case"]
 *  - Lowercases everything
 *  - Drops 1-char tokens (too noisy)
 *  - Preserves Unicode letters/digits (\p{L}, \p{N})
 */
export function tokenize(text) {
  if (!text || typeof text !== "string") return [];

  const tokens = [];
  // Unicode-aware word match (letters, numbers, underscore is split via \W elsewhere).
  const wordRe = /[\p{L}\p{N}_]+/gu;
  // Camel/Pascal split — Unicode-aware lowercase/uppercase classes.
  // Order matters: longer alternatives first.
  const camelRe = /\p{Lu}+(?=\p{Lu}\p{Ll})|\p{Lu}?\p{Ll}+|\p{Lu}+|\p{N}+/gu;

  for (const word of text.match(wordRe) || []) {
    // Split snake_case and camelCase further
    for (const piece of word.split("_")) {
      const camelParts = piece.match(camelRe);
      if (!camelParts) continue;
      for (const p of camelParts) {
        const lower = p.toLowerCase();
        if (lower.length >= 2) tokens.push(lower);
      }
    }
  }

  return tokens;
}

/**
 * Build a BM25 index over a corpus of strings.
 * Returns precomputed IDF table and per-document term frequencies + lengths.
 *
 * @param {string[]} docs
 * @returns {{ idf: Map<string, number>, docs: Array<{tf: Map<string, number>, len: number}>, avgDl: number, n: number }}
 */
export function buildBm25Index(docs) {
  const docInfos = [];
  const docFreq = new Map();
  let totalLen = 0;

  for (const doc of docs) {
    const tokens = tokenize(doc);
    totalLen += tokens.length;

    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

    for (const term of tf.keys()) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }

    docInfos.push({ tf, len: tokens.length });
  }

  const n = docs.length;
  const avgDl = n > 0 ? totalLen / n : 0;
  const idf = new Map();
  for (const [term, df] of docFreq) {
    // Smoothed IDF — always positive thanks to the +1.
    idf.set(term, Math.log((n - df + 0.5) / (df + 0.5) + 1));
  }

  return { idf, docs: docInfos, avgDl, n };
}

/**
 * Score a tokenized query against a single document in the BM25 index.
 *
 * @param {string[]} queryTokens
 * @param {{tf: Map<string, number>, len: number}} doc
 * @param {Map<string, number>} idf
 * @param {number} avgDl
 * @returns {number}
 */
export function scoreBm25(queryTokens, doc, idf, avgDl) {
  if (avgDl === 0 || doc.len === 0) return 0;
  let score = 0;
  for (const q of queryTokens) {
    const idfQ = idf.get(q);
    if (!idfQ) continue;
    const f = doc.tf.get(q) || 0;
    if (f === 0) continue;
    const numerator = f * (K1 + 1);
    const denominator = f + K1 * (1 - B + B * (doc.len / avgDl));
    score += idfQ * (numerator / denominator);
  }
  return score;
}

/**
 * Convenience: build index + score in one shot for a query.
 * Returns array of {index, score} sorted desc, score>0 only.
 */
export function bm25Search(query, docs) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || docs.length === 0) return [];

  const idx = buildBm25Index(docs);
  const out = [];
  for (let i = 0; i < idx.docs.length; i++) {
    const s = scoreBm25(queryTokens, idx.docs[i], idx.idf, idx.avgDl);
    if (s > 0) out.push({ index: i, score: s });
  }
  return out.sort((a, b) => b.score - a.score);
}
