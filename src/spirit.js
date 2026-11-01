import {
  SCHEMAS,
  chat,
  config,
  loadPrompt,
  modelLabel,
  modelStatus,
  parseJsonObject,
} from "./model.js";
import { bestSentences, retrieve } from "./retrieve.js";
import { truncate, wordCount } from "./util.js";

const UNKNOWN_ANSWER =
  "The archive does not hold that yet. Add a memory about it — even two sentences is enough — and ask again.";

const FIRST_PERSON = /\b(I|me|my|mine|we|us|our|ours)\b/;

// The keeper wrote the memories, so first person is everywhere in the source
// material. The remembrance has to step outside it. Direct quotations are fine.
function slipsIntoFirstPerson(text) {
  const unquoted = String(text).replace(/"[^"]*"|“[^”]*”|‘[^’]*’/g, " ");
  return FIRST_PERSON.test(unquoted);
}

function years(person) {
  if (person.born && person.died) return `${person.born}–${person.died}`;
  if (person.born) return `${person.born}–`;
  if (person.died) return `–${person.died}`;
  return "";
}

function offeringLine(person) {
  const offerings = person.offerings || {};
  const parts = [
    offerings.foods?.length ? `food: ${offerings.foods.join(", ")}` : "",
    offerings.songs?.length ? `music: ${offerings.songs.join(", ")}` : "",
    offerings.places?.length ? `places: ${offerings.places.join(", ")}` : "",
    offerings.phrases?.length ? `sayings: ${offerings.phrases.join(", ")}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "nothing recorded yet";
}

function memoryBlock(memories, limit = 1400) {
  return memories
    .map((memory) => {
      const meta = [memory.year && `year: ${memory.year}`, memory.people?.length && `people: ${memory.people.join(", ")}`]
        .filter(Boolean)
        .join(" · ");
      return `### ${memory.title}${meta ? ` (${meta})` : ""}\n${truncate(memory.body, limit)}`;
    })
    .join("\n\n");
}

function allowedTitles(memories) {
  return new Map(memories.map((memory) => [memory.title.toLowerCase(), memory]));
}

function sanitizeCites(rawCites, memories) {
  const allowed = allowedTitles(memories);
  const seen = new Set();
  const cites = [];

  for (const cite of Array.isArray(rawCites) ? rawCites : []) {
    if (typeof cite !== "string") continue;
    const match = allowed.get(cite.trim().toLowerCase());
    if (!match || seen.has(match.id)) continue;
    seen.add(match.id);
    cites.push({ id: match.id, title: match.title, year: match.year });
  }

  return cites;
}

export function extractiveAnswer(person, memories, question, { note } = {}) {
  const ranked = retrieve(memories, question, { limit: 2 });

  if (!ranked.length) {
    return {
      answer: UNKNOWN_ANSWER,
      cites: [],
      confidence: "unknown",
      mode: "extract",
      model: null,
      label: "Candlelight mode",
      note:
        note ||
        "No memory matched this question, so the archive stayed quiet rather than guess.",
      retrieved: [],
    };
  }

  const primary = ranked[0];
  const quotes = bestSentences(primary.body, question, 2);
  const quote = quotes.join(" ");
  const second = ranked[1];

  let answer = `The archive holds this, in “${primary.title}”: “${quote}”`;
  if (second && second.score >= primary.score * 0.55) {
    const secondQuote = bestSentences(second.body, question, 1)[0];
    if (secondQuote) answer += ` It also keeps “${second.title}”: “${secondQuote}”`;
  }
  answer += " That is all it says; it will not fill the rest in for you.";

  return {
    answer,
    cites: ranked.map((memory) => ({
      id: memory.id,
      title: memory.title,
      year: memory.year,
    })),
    confidence: "partial",
    mode: "extract",
    model: null,
    label: "Candlelight mode",
    note:
      note ||
      "No model answered. These are the archive's own sentences, quoted directly.",
    retrieved: ranked.map(publicMemory),
  };
}

export async function askSpirit({ person, memories, question }) {
  const cleanQuestion = String(question || "").trim().slice(0, 500);
  if (!cleanQuestion) throw new Error("Ask a question first.");
  if (!memories.length) {
    return {
      answer:
        "This altar has no memories yet. Add one, then ask again — the archive only knows what the family wrote down.",
      cites: [],
      confidence: "unknown",
      mode: "empty",
      model: null,
      label: "Empty archive",
      note: "There are no memories to search.",
      retrieved: [],
    };
  }

  const status = await modelStatus();
  const retrieved = retrieve(memories, cleanQuestion, { limit: 4 });

  if (status.mode !== "model") {
    return extractiveAnswer(person, memories, cleanQuestion, { note: status.detail });
  }

  const started = Date.now();
  const prompt = loadPrompt("spirit", {
    name: person.name,
    born: person.born || "unknown",
    died: person.died || "unknown",
    relationship: person.relationship || "someone in the family",
    epithet: person.epithet || "none recorded",
    memories: memoryBlock(retrieved.length ? retrieved : memories, 1800),
    question: cleanQuestion,
  });

  const messages = [
    {
      role: "system",
      content:
        "You answer only from a family archive. You never impersonate the person who died. You return strict JSON.",
    },
    { role: "user", content: prompt },
  ];

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { content, metrics } = await chat(messages, {
        schema: SCHEMAS.spirit,
        temperature: attempt === 0 ? undefined : 0.2,
      });

      const parsed = parseJsonObject(content);
      const cites = sanitizeCites(parsed.cites, memories);
      let confidence = ["grounded", "partial", "unknown"].includes(parsed.confidence)
        ? parsed.confidence
        : "partial";
      if (!cites.length) confidence = "unknown";

      // A model that will not point at a memory does not get to be believed.
      if (!cites.length && String(parsed.confidence) !== "unknown") {
        lastError = new Error("the model answered without citing a memory");
        continue;
      }

      return {
        answer: truncate(String(parsed.answer || UNKNOWN_ANSWER), 900),
        cites,
        confidence,
        mode: "model",
        model: config().model,
        label: modelLabel(config().model),
        note:
          status.detail ||
          "Answered from the memories above, with the model running on this machine.",
        retrieved: (retrieved.length ? retrieved : []).map(publicMemory),
        metrics: {
          elapsedMs: Date.now() - started,
          evalCount: metrics?.eval_count ?? null,
          promptEvalCount: metrics?.prompt_eval_count ?? null,
        },
      };
    } catch (error) {
      lastError = error;
    }
  }

  return extractiveAnswer(person, memories, cleanQuestion, {
    note: `The model could not answer (${lastError?.message}). The archive quoted itself instead.`,
  });
}

export function fallbackRemembrance(person, memories) {
  const yearsLabel = years(person);
  const opening = yearsLabel
    ? `${person.name} lived ${yearsLabel}.`
    : `${person.name} is kept here in ${memories.length} memories.`;
  const epithet = person.epithet ? ` ${person.epithet}` : "";

  const quotes = memories
    .slice(0, 3)
    .map((memory) => {
      const sentence = bestSentences(memory.body, memory.title, 1)[0] || truncate(memory.body, 140);
      return `In ${memory.year || "one year the family did not date"}, ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
    })
    .join(" ");

  const offerings = offeringLine(person);

  return {
    text: `${opening}${epithet} The altar holds ${offerings}. ${quotes}`.trim(),
    epithet: person.epithet || "",
    sources: memories.slice(0, 3).map((memory) => ({
      id: memory.id,
      title: memory.title,
      year: memory.year,
    })),
    mode: "template",
    model: null,
    generatedAt: new Date().toISOString(),
  };
}

export async function writeRemembrance({ person, memories, force = false }) {
  if (person.remembrance && !force) return person.remembrance;
  if (!memories.length) {
    return {
      text: "This altar is waiting for its first memory. Write down one small, specific thing — a meal, a phrase, a walk — and the remembrance will grow from it.",
      epithet: person.epithet || "",
      sources: [],
      mode: "empty",
      model: null,
      generatedAt: new Date().toISOString(),
    };
  }

  const status = await modelStatus();
  if (status.mode !== "model") {
    return fallbackRemembrance(person, memories);
  }

  const ordered = [...memories].sort((a, b) => String(a.year).localeCompare(String(b.year)));
  const prompt = loadPrompt("remembrance", {
    name: person.name,
    born: person.born || "unknown",
    died: person.died || "unknown",
    relationship: person.relationship || "someone in the family",
    offerings: offeringLine(person),
    memories: memoryBlock(ordered, 900),
  });

  const messages = [
    {
      role: "system",
      content:
        "You write short, concrete remembrances from a family archive. You never invent facts. You return strict JSON.",
    },
    { role: "user", content: prompt },
  ];

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { content } = await chat(messages, {
        schema: SCHEMAS.remembrance,
        temperature: attempt === 0 ? 0.65 : 0.4,
      });

      const parsed = parseJsonObject(content);
      const text = String(parsed.remembrance || "").trim();
      const sources = sanitizeCites(parsed.sources, memories);
      const words = wordCount(text);
      if (words < 150) throw new Error(`Remembrance came back too short (${words} words).`);
      if (words > 300) throw new Error(`Remembrance came back too long (${words} words).`);
      if (slipsIntoFirstPerson(text)) {
        throw new Error("Remembrance slipped into the keeper's first person.");
      }
      if (!sources.length) throw new Error("Remembrance did not cite a memory.");

      return {
        text,
        epithet: String(parsed.epithet || "").trim().slice(0, 140),
        sources,
        mode: "model",
        model: config().model,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      lastError = error;
    }
  }

  const fallback = fallbackRemembrance(person, memories);
  return { ...fallback, note: `Model failed: ${lastError?.message}` };
}

function publicMemory(memory) {
  return {
    id: memory.id,
    title: memory.title,
    year: memory.year,
    score: memory.score,
  };
}

export { years, offeringLine };
