import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROMPT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "prompts",
);

export function loadPrompt(name, vars = {}) {
  const template = fs.readFileSync(path.join(PROMPT_DIR, `${name}.md`), "utf8");
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) =>
    String(vars[key] ?? "").trim(),
  );
}

export function config() {
  return {
    ollamaUrl: (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, ""),
    model: process.env.OFRENDA_MODEL || "gemma3:4b",
    inference: process.env.OFRENDA_INFERENCE || "local",
    temperature: Number(process.env.OFRENDA_TEMPERATURE || 0.5),
    timeoutMs: Number(process.env.OFRENDA_TIMEOUT_MS || 120000),
  };
}

export function modelLabel(model) {
  return String(model || "")
    .replace(/^gemma3:/i, "Gemma 3 ")
    .replace(/^gemma2:/i, "Gemma 2 ")
    .replace(/^gemma:/i, "Gemma ");
}

export async function modelStatus() {
  const { ollamaUrl, model, inference } = config();

  if (inference === "extract") {
    return {
      reachable: false,
      available: false,
      model,
      mode: "extract",
      label: "Candlelight mode",
      detail: "No model is being called. The archive quotes its own words.",
    };
  }

  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);

    const body = await response.json();
    const models = (body.models || []).map((entry) => entry.name);
    const available = models.some(
      (name) => name === model || name.startsWith(`${model}:`) || model.startsWith(`${name}:`),
    );

    return {
      reachable: true,
      available,
      model,
      models,
      mode: available ? "model" : "extract",
      label: available ? modelLabel(model) : "Candlelight mode",
      detail: available
        ? "Open-weight model running on this machine."
        : `Ollama is up, but ${model} is not pulled. Run: ollama pull ${model}`,
    };
  } catch (error) {
    return {
      reachable: false,
      available: false,
      model,
      mode: "extract",
      label: "Candlelight mode",
      detail: `Ollama is not reachable at ${ollamaUrl}. ${error.message}`,
    };
  }
}

// Ollama accepts a JSON schema in `format`, which keeps small models from
// drifting into prose or dropping required keys. Kept as plain JSON so the
// request stays inspectable.
export const SCHEMAS = {
  spirit: {
    type: "object",
    properties: {
      answer: { type: "string" },
      cites: { type: "array", items: { type: "string" } },
      confidence: { type: "string", enum: ["grounded", "partial", "unknown"] },
    },
    required: ["answer", "cites", "confidence"],
  },
  remembrance: {
    type: "object",
    properties: {
      remembrance: { type: "string" },
      epithet: { type: "string" },
      sources: { type: "array", items: { type: "string" } },
    },
    required: ["remembrance", "epithet", "sources"],
  },
};

export async function chat(messages, { json = true, temperature, schema } = {}) {
  const { ollamaUrl, model, timeoutMs } = config();

  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      ...(schema ? { format: schema } : json ? { format: "json" } : {}),
      options: {
        temperature: temperature ?? config().temperature,
        num_predict: 560,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Ollama chat failed (${response.status}) ${detail.slice(0, 200)}`);
  }

  const body = await response.json();
  const content = body?.message?.content;
  if (!content) throw new Error("Ollama returned an empty message.");
  return { content, metrics: body };
}

export function parseJsonObject(content) {
  const text = String(content ?? "").trim();

  try {
    return JSON.parse(text);
  } catch {
    // Small models sometimes wrap JSON in a fence or add a sentence around it.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        /* fall through */
      }
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("Model did not return a JSON object.");
  }
}
