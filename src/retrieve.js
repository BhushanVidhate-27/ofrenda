const STOPWORDS = new Set(
  `a an and are as at be been but by did do does for from had has have he her hers him his how i if in into is it its me my of on or our she so that the their them then there these they this to was we were what when where which who why will with you your
  al algo como con cual cuando de del el ella ellas ellos en es esa ese eso esta este esto fue ha hasta la las le les lo los mas me mi mis muy no nos o para pero por porque que quien se sin sobre su sus tambien tan te tu tus un una uno unos y ya`.split(
    /\s+/,
  ),
);

export function tokenize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9ñ]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .map(stem);
}

// Enough English/Spanish morphology to match "marigolds" to "marigold" and
// "cooked" to "cook". Anything heavier would be pretending to be a search engine.
function stem(token) {
  if (token.length > 4 && token.endsWith("es") && !token.endsWith("ses")) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  if (token.length > 4 && token.endsWith("ed")) {
    return token.slice(0, -2);
  }
  return token;
}

function termFrequency(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

/**
 * Lexical retrieval with an IDF weight and a title bonus. No embeddings, no
 * network, no vector database: the archive has to work on a plane and stay
 * inspectable with `cat`.
 */
export function retrieve(memories, question, { limit = 4 } = {}) {
  const queryTerms = [...new Set(tokenize(question))];
  if (!queryTerms.length || !memories.length) return [];

  const docs = memories.map((memory) => ({
    memory,
    tokens: tokenize(`${memory.title} ${memory.title} ${memory.body}`),
  }));

  const documentFrequency = new Map();
  for (const doc of docs) {
    for (const term of new Set(doc.tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }

  const total = docs.length;
  return docs
    .map((doc) => {
      const counts = termFrequency(doc.tokens);
      let score = 0;
      for (const term of queryTerms) {
        const tf = counts.get(term) || 0;
        if (!tf) continue;
        const df = documentFrequency.get(term) || 1;
        const idf = Math.log(1 + total / df);
        score += (1 + Math.log(tf)) * idf;
      }
      const titleTerms = new Set(tokenize(doc.memory.title));
      const titleHits = queryTerms.filter((term) => titleTerms.has(term)).length;
      score += titleHits * 1.5;
      score = score / Math.sqrt(Math.max(doc.tokens.length, 1) / 60 || 1);
      return { ...doc.memory, score: Number(score.toFixed(3)) };
    })
    .filter((memory) => memory.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function sentences(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** The sentences from a memory that actually touch the question. */
export function bestSentences(text, question, limit = 2) {
  const queryTerms = new Set(tokenize(question));
  const scored = sentences(text).map((sentence, index) => {
    const tokens = tokenize(sentence);
    const hits = tokens.filter((token) => queryTerms.has(token)).length;
    const score = hits / Math.sqrt(Math.max(tokens.length, 1)) + (index === 0 ? 0.05 : 0);
    return { sentence, score, index };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .filter((entry) => entry.score > 0 || scored.length <= 2)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.sentence);
}

export { STOPWORDS };
