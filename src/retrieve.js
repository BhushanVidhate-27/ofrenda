// Two kinds of noise: grammar words, and the filler that shows up in every
// spoken question ("ever", "talk about", "something"). Leaving the second kind
// in means a question about a husband who is not in the archive matches a
// memory that merely says "we did not talk". The archive should stay quiet
// instead of quoting the wrong sentence.
const STOPWORDS = new Set(
  `a an and are as at be been but by did do does for from had has have he her hers him his how i if in into is it its me my of on or our she so that the their them then there these they this to was we were what when where which who why will with you your
  al algo como con cual cuando de del el ella ellas ellos en es esa ese eso esta este esto fue ha hasta la las le les lo los mas me mi mis muy no nos o para pero por porque que quien se sin sobre su sus tambien tan te tu tus un una uno unos y ya
  ever never always sometimes often usually really actually just also still even only again away around thing things something anything nothing someone somebody nobody anyone everyone people person time times way talk talked talking say says said tell tells told like liked want wanted happen happened mean meant`.split(
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

// Enough English/Spanish morphology to match "marigolds" to "marigold",
// "cooked" to "cook", and "crying" to "cried". Anything heavier would be
// pretending to be a search engine.
function stem(token) {
  if (token.length > 4 && (token.endsWith("ies") || token.endsWith("ied"))) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 5 && token.endsWith("ing")) {
    const base = token.slice(0, -3);
    if (base.length >= 3) return base;
  }
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

  const chosen = new Set();
  const ranked = [...scored].sort((a, b) => b.score - a.score || a.index - b.index);
  for (const entry of ranked) {
    if (chosen.size >= limit) break;
    if (entry.score <= 0 && scored.length > 2) continue;
    chosen.add(entry.index);
    // A sentence that answers the question rarely finishes the thought on its
    // own: "she would not stop crying" needs the sentence after it.
    for (let next = entry.index + 1; next < scored.length && chosen.size < limit; next += 1) {
      chosen.add(next);
    }
  }

  if (!chosen.size) return scored.slice(0, limit).map((entry) => entry.sentence);
  return [...chosen].sort((a, b) => a - b).map((index) => scored[index].sentence);
}

export { STOPWORDS };
